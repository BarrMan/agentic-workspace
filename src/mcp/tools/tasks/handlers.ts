import { DEFAULT_STATUSES, DRAFT_STATUS } from "../../../constants/index.ts";
import { type Core, TaskArchiveStatusError, type VacatedTaskResult } from "../../../core/backlog.ts";
import { findLocalDuplicateTaskIds } from "../../../core/duplicate-task-detection.ts";
import { loadTaskDetail, loadTaskListItems } from "../../../core/task-detail.ts";
import { isCreateLockError, isTaskLockError } from "../../../file-system/operations.ts";
import {
	isLocalEditableTask,
	type SearchPriorityFilter,
	TASK_SOURCE,
	type Task,
	type TaskListFilter,
} from "../../../types/index.ts";
import type { TaskEditArgs, TaskEditRequest } from "../../../types/task-edit-args.ts";
import { formatDependencyCleanupMessage } from "../../../utils/dependency-graph.ts";
import { formatDuplicateTaskIdWarning } from "../../../utils/duplicate-detection.ts";
import {
	createMilestoneFilterValueResolver,
	type MilestoneFilterValueResolver,
} from "../../../utils/milestone-filter.ts";
import { resolveMilestoneInputFromFilesystem } from "../../../utils/milestone-storage.ts";
import { buildTaskUpdateInput } from "../../../utils/task-edit-builder.ts";
import { canonicalTaskId } from "../../../utils/task-id.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../../../utils/task-search.ts";
import { sortByOrdinalAndPriority } from "../../../utils/task-sorting.ts";
import { getTerminalStatus, isTerminalStatus } from "../../../utils/terminal-status.ts";
import { formatUtcDateForDisplay } from "../../../utils/utc-date-display.ts";
import { BacklogToolError } from "../../errors/mcp-errors.ts";
import type { CallToolResult } from "../../types.ts";
import { formatTaskCallResult } from "../../utils/task-response.ts";

export type TaskCreateArgs = {
	title: string;
	description?: string;
	labels?: string[];
	assignee?: string[];
	priority?: string;
	type?: string;
	project?: string;
	ordinal?: number;
	status?: string;
	dueDate?: string;
	milestone?: string;
	parentTaskId?: string;
	dependencies?: string[];
	references?: string[];
	documentation?: string[];
	modifiedFiles?: string[];
};

export type TaskListArgs = {
	status?: string;
	type?: string[];
	project?: string[];
	assignee?: string;
	unassigned?: boolean;
	milestone?: string;
	labels?: string[];
	search?: string;
	ready?: boolean;
	limit?: number;
};

export type TaskSearchArgs = {
	query?: string;
	status?: string;
	type?: string[];
	project?: string[];
	priority?: SearchPriorityFilter;
	modifiedFiles?: string[];
	limit?: number;
};

function textResult(text: string): CallToolResult {
	return { content: [{ type: "text", text }] };
}

function noTasksResult(query?: string): CallToolResult {
	return textResult(query === undefined ? "No tasks found." : `No tasks found for "${query}".`);
}

function taskOperationError(error: unknown, isLockError: (error: unknown) => error is Error): BacklogToolError {
	if (isLockError(error)) {
		return new BacklogToolError(error.message, "OPERATION_FAILED");
	}
	return new BacklogToolError(error instanceof Error ? error.message : String(error), "VALIDATION_ERROR");
}

function buildTaskListFilters(args: TaskListArgs): TaskListFilter | undefined {
	const filters: TaskListFilter = Object.fromEntries(
		Object.entries({
			status: args.status,
			type: args.type?.length ? args.type : undefined,
			project: args.project?.length ? args.project : undefined,
			assignee: args.assignee,
			unassigned: args.unassigned || undefined,
			milestone: args.milestone,
		}).filter(([, value]) => value !== undefined && value !== ""),
	);
	if (args.labels?.length) {
		filters.labels = args.labels;
		filters.labelMatch = "all";
	}
	return Object.keys(filters).length > 0 ? filters : undefined;
}

export class TaskHandlers {
	constructor(private readonly core: Core) {}

	private async resolveMilestoneInput(milestone: string): Promise<string> {
		return resolveMilestoneInputFromFilesystem(milestone, this.core.filesystem);
	}

	private async createMilestoneFilterValueResolver(): Promise<MilestoneFilterValueResolver> {
		const [activeMilestones, archivedMilestones] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
		]);
		return createMilestoneFilterValueResolver([...activeMilestones, ...archivedMilestones]);
	}

	private async getConfiguredStatuses(): Promise<string[]> {
		const config = await this.core.filesystem.loadConfig();
		return config?.statuses ?? [...DEFAULT_STATUSES];
	}

	private isDraftStatus(status?: string | null): boolean {
		return (status ?? "").trim().toLowerCase() === "draft";
	}

	private formatTaskSummaryLine(task: Task, options: { includeStatus?: boolean } = {}): string {
		const priorityIndicator = task.priority ? `[${task.priority.toUpperCase()}] ` : "";
		const typeIndicator = task.type ? `[${task.type}] ` : "";
		const projectIndicator = task.project ? `[${task.project}] ` : "";
		const status = task.status || (task.source === TASK_SOURCE.COMPLETED ? "Done" : "");
		const statusText = options.includeStatus && status ? ` (${status})` : "";
		const dueDate = task.dueDate ? ` (due ${formatUtcDateForDisplay(task.dueDate)})` : "";
		return `  ${priorityIndicator}${typeIndicator}${projectIndicator}${task.id} - ${task.title}${statusText}${dueDate}`;
	}

	private async loadTaskOrThrow(id: string): Promise<Task> {
		const task = await this.core.getTask(id);
		if (!task) {
			throw new BacklogToolError(`Task not found: ${id}`, "TASK_NOT_FOUND");
		}
		return task;
	}

	async createTask(args: TaskCreateArgs): Promise<CallToolResult> {
		try {
			const rawOrdinal = (args as { ordinal?: unknown }).ordinal;
			if (rawOrdinal === null) {
				throw new BacklogToolError("Ordinal must be a non-negative number.", "VALIDATION_ERROR");
			}

			const milestone =
				typeof args.milestone === "string" ? await this.resolveMilestoneInput(args.milestone) : undefined;

			const { task: createdTask } = await this.core.createTaskFromInput({
				title: args.title,
				description: args.description,
				dueDate: args.dueDate,
				status: args.status,
				priority: args.priority,
				type: args.type,
				project: args.project,
				...(typeof rawOrdinal === "number" ? { ordinal: rawOrdinal } : {}),
				milestone,
				labels: args.labels,
				assignee: args.assignee,
				dependencies: args.dependencies,
				references: args.references,
				documentation: args.documentation,
				modifiedFiles: args.modifiedFiles,
				parentTaskId: args.parentTaskId,
			});

			return await formatTaskCallResult(await loadTaskDetail(this.core, createdTask));
		} catch (error) {
			throw taskOperationError(error, isCreateLockError);
		}
	}

	async listTasks(args: TaskListArgs = {}): Promise<CallToolResult> {
		if (args.assignee && args.unassigned) {
			throw new BacklogToolError("unassigned cannot be combined with assignee.", "VALIDATION_ERROR");
		}
		const config = await this.core.filesystem.loadConfig();
		if (this.isDraftStatus(args.status)) {
			return await this.listDraftTasks(args, config?.priorities);
		}
		return await this.listActiveTasks(args, config?.priorities, config?.statuses ?? []);
	}

	private async listDraftTasks(args: TaskListArgs, priorities?: string[]): Promise<CallToolResult> {
		let drafts = applyTaskFilters(await this.core.filesystem.listDrafts(), {
			query: args.search,
			status: args.search || args.type?.length || args.project?.length ? DRAFT_STATUS : undefined,
			type: args.type,
			project: args.project,
			assignee: args.assignee,
			unassigned: args.unassigned,
			milestone: args.milestone,
			resolveMilestoneLabel: args.milestone ? await this.createMilestoneFilterValueResolver() : undefined,
			labels: args.labels,
			labelMatch: "all",
		});
		if (args.ready) drafts = (await loadTaskListItems(this.core, drafts)).filter((draft) => draft.isReady);
		const sortedDrafts = this.applyLimit(sortByOrdinalAndPriority(drafts, priorities), args.limit);
		return sortedDrafts.length === 0
			? noTasksResult()
			: textResult(["Draft:", ...sortedDrafts.map((task) => this.formatTaskSummaryLine(task))].join("\n"));
	}

	private async listActiveTasks(
		args: TaskListArgs,
		priorities: string[] | undefined,
		statuses: string[],
	): Promise<CallToolResult> {
		let tasks = await this.core.queryTasks({
			query: args.search,
			filters: buildTaskListFilters(args),
			includeCrossBranch: false,
		});
		if (args.ready) tasks = (await loadTaskListItems(this.core, tasks)).filter((task) => task.isReady);
		const contentItems = this.groupTaskList(tasks.filter(isLocalEditableTask), statuses, priorities, args.limit);
		if (contentItems.length === 0) contentItems.push({ type: "text", text: "No tasks found." });

		try {
			const duplicateGroups = await findLocalDuplicateTaskIds(this.core);
			if (duplicateGroups.length > 0) {
				contentItems.unshift({
					type: "text",
					text: formatDuplicateTaskIdWarning(duplicateGroups),
				});
			}
		} catch {
			// Duplicate detection is best-effort; skip if filesystem is unavailable
		}

		return {
			content: contentItems,
		};
	}

	private applyLimit(tasks: Task[], limit?: number): Task[] {
		return typeof limit === "number" && limit >= 0 ? tasks.slice(0, limit) : tasks;
	}

	private groupTaskList(
		tasks: Task[],
		statuses: string[],
		priorities: string[] | undefined,
		limit?: number,
	): Array<{ type: "text"; text: string }> {
		const canonical = new Map(statuses.map((status) => [status.toLowerCase(), status]));
		const grouped = new Map<string, Task[]>();
		for (const task of tasks) {
			const status = (task.status ?? "").trim();
			const key = canonical.get(status.toLowerCase()) ?? status;
			grouped.set(key, [...(grouped.get(key) ?? []), task]);
		}
		let remaining = typeof limit === "number" && limit >= 0 ? limit : undefined;
		return [
			...statuses.filter((status) => grouped.has(status)),
			...[...grouped.keys()].filter((status) => !statuses.includes(status)),
		].flatMap((status) => {
			const bucket =
				remaining === undefined
					? sortByOrdinalAndPriority(grouped.get(status) ?? [], priorities)
					: sortByOrdinalAndPriority(grouped.get(status) ?? [], priorities).slice(0, remaining);
			if (remaining !== undefined) remaining -= bucket.length;
			return bucket.length
				? [
						{
							type: "text" as const,
							text: [`${status || "No Status"}:`, ...bucket.map((task) => this.formatTaskSummaryLine(task))].join("\n"),
						},
					]
				: [];
		});
	}

	async searchTasks(args: TaskSearchArgs): Promise<CallToolResult> {
		const query = args.query?.trim() ?? "";
		const modifiedFiles = args.modifiedFiles?.map((file) => file.trim()).filter((file) => file.length > 0);
		if (!this.hasSearchCriteria(query, modifiedFiles, args)) {
			throw new BacklogToolError(
				"Search query, modifiedFiles, type filter, or project filter is required",
				"VALIDATION_ERROR",
			);
		}

		if (this.isDraftStatus(args.status)) {
			return this.searchTaskCollection(await this.core.filesystem.listDrafts(), args, query, modifiedFiles, false);
		}
		return this.searchTaskCollection(await this.core.loadWorkingCopyTasks(true), args, query, modifiedFiles, true);
	}

	private hasSearchCriteria(query: string, modifiedFiles: string[] | undefined, args: TaskSearchArgs): boolean {
		return Boolean(query || modifiedFiles?.length || args.type?.length || args.project?.length);
	}

	private searchTaskCollection(
		tasks: Task[],
		args: TaskSearchArgs,
		query: string,
		modifiedFiles: string[] | undefined,
		localOnly: boolean,
	): CallToolResult {
		const matches = this.applyLimit(
			createTaskSearchIndex(tasks).search({
				query,
				status: this.isDraftStatus(args.status) ? DRAFT_STATUS : args.status,
				type: args.type,
				project: args.project,
				priority: args.priority,
				modifiedFiles,
			}),
			args.limit,
		).filter((task) => !localOnly || isLocalEditableTask(task));
		const searchText = query || modifiedFiles?.join(", ") || "";
		return matches.length === 0
			? noTasksResult(searchText)
			: textResult(
					["Tasks:", ...matches.map((task) => this.formatTaskSummaryLine(task, { includeStatus: true }))].join("\n"),
				);
	}

	async viewTask(args: { id: string }): Promise<CallToolResult> {
		const draft = await this.core.filesystem.loadDraft(args.id);
		if (draft) {
			return await formatTaskCallResult(await loadTaskDetail(this.core, draft));
		}
		const duplicates = await findLocalDuplicateTaskIds(this.core);
		if (duplicates.some(({ id }) => canonicalTaskId(id) === canonicalTaskId(args.id))) {
			throw new BacklogToolError(
				`Task ID ${args.id} is ambiguous; review the duplicate records manually.`,
				"VALIDATION_ERROR",
			);
		}

		const task = await this.core.getTaskWithSubtasks(args.id);
		if (!task) {
			throw new BacklogToolError(`Task not found: ${args.id}`, "TASK_NOT_FOUND");
		}
		// Task detail is the only MCP result read through the detail path, so it is the only one that
		// carries the graph. The edit and lifecycle confirmations stay as short as they were.
		return await formatTaskCallResult(await loadTaskDetail(this.core, task));
	}

	async archiveTask(args: { id: string }): Promise<CallToolResult> {
		const draft = await this.core.filesystem.loadDraft(args.id);
		if (draft) {
			const success = await this.core.archiveDraft(draft.id);
			if (!success) {
				throw new BacklogToolError(`Failed to archive task: ${args.id}`, "OPERATION_FAILED");
			}

			return await formatTaskCallResult(await loadTaskDetail(this.core, draft), [`Archived draft ${draft.id}.`]);
		}

		const task = await this.loadTaskOrThrow(args.id);

		if (!isLocalEditableTask(task)) {
			throw new BacklogToolError(`Cannot archive task from another branch: ${task.id}`, "VALIDATION_ERROR");
		}

		let archived: VacatedTaskResult;
		try {
			archived = await this.core.archiveTask(task.id);
		} catch (error) {
			if (error instanceof TaskArchiveStatusError) {
				throw new BacklogToolError(`${error.message} In MCP, use task_complete.`, "VALIDATION_ERROR");
			}
			throw error;
		}
		const { success, cleanedTaskIds } = archived;
		if (!success) {
			throw new BacklogToolError(`Failed to archive task: ${args.id}`, "OPERATION_FAILED");
		}

		const refreshed = (await this.core.getTask(task.id)) ?? task;
		const cleanupMessage = formatDependencyCleanupMessage(task.id, cleanedTaskIds);
		return await formatTaskCallResult(
			await loadTaskDetail(this.core, refreshed),
			cleanupMessage ? [`${cleanupMessage}.`] : undefined,
		);
	}

	async completeTask(args: { id: string }): Promise<CallToolResult> {
		const task = await this.loadTaskOrThrow(args.id);

		if (!isLocalEditableTask(task)) {
			throw new BacklogToolError(`Cannot complete task from another branch: ${task.id}`, "VALIDATION_ERROR");
		}

		const statuses = await this.getConfiguredStatuses();
		const terminalStatus = getTerminalStatus(statuses) ?? "Done";
		if (!isTerminalStatus(task.status, statuses)) {
			throw new BacklogToolError(
				`Task ${task.id} is not ${terminalStatus}. Set status to "${terminalStatus}" with task_edit before completing it.`,
				"VALIDATION_ERROR",
			);
		}

		const success = await this.core.completeTask(task.id);
		if (!success) {
			throw new BacklogToolError(`Failed to complete task: ${args.id}`, "OPERATION_FAILED");
		}

		const completedTask = await this.core.getTask(task.id);
		if (!completedTask) {
			throw new BacklogToolError(`Completed task could not be read: ${task.id}`, "OPERATION_FAILED");
		}
		const result = await formatTaskCallResult(await loadTaskDetail(this.core, completedTask), [], {
			filePathOverride: completedTask.filePath,
		});
		const acknowledgment = `Completed task ${task.id}.`;
		const [detail] = result.content ?? [];
		if (detail?.type === "text") {
			detail.text = `${acknowledgment}\n\n${detail.text}`;
		}
		return result;
	}

	async editTask(args: TaskEditRequest): Promise<CallToolResult> {
		try {
			const rawOrdinal = (args as { ordinal?: unknown }).ordinal;
			if (rawOrdinal === null) {
				throw new BacklogToolError("Ordinal must be a non-negative number.", "VALIDATION_ERROR");
			}

			const updateInput = buildTaskUpdateInput(args);
			if (typeof updateInput.milestone === "string") {
				updateInput.milestone = await this.resolveMilestoneInput(updateInput.milestone);
			}
			const { task: updatedTask, cleanedTaskIds } = await this.core.editTaskOrDraft(args.id, updateInput);
			const cleanupMessage = formatDependencyCleanupMessage(args.id, cleanedTaskIds);
			return await formatTaskCallResult(
				await loadTaskDetail(this.core, updatedTask),
				cleanupMessage ? [`${cleanupMessage}.`] : undefined,
			);
		} catch (error) {
			throw taskOperationError(error, isTaskLockError);
		}
	}
}

export type { TaskEditArgs, TaskEditRequest };
