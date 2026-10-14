import type { FileSystem } from "../file-system/operations.ts";
import { removeTaskWorktree } from "../git/task-worktree.ts";
import { EntityType, TASK_SOURCE, type Task, type TaskUpdateInput } from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { generateNextId, generateNextSubtaskId, getPrefixForType } from "../utils/prefix-config.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../utils/priority-config.ts";
import {
	formatValidProjectValues,
	getProjectValues,
	noProjectsConfiguredMessage,
	resolveProjectValue,
} from "../utils/project-config.ts";
import { getCanonicalStatus, getValidStatuses } from "../utils/status.ts";
import { executeStatusCallback } from "../utils/status-callback.ts";
import { validateDependencies } from "../utils/task-builders.ts";
import { AmbiguousTaskIdError, LOCAL_TASK_LOOKUP_HINT, normalizeTaskId, taskIdsEqual } from "../utils/task-path.ts";
import { formatValidTaskTypeValues, resolveTaskTypeValue } from "../utils/task-type-config.ts";
import { isDoneStatus } from "./milestones.ts";
import { completedTaskIdentityRecord, TaskIdentityIndex, type TaskIdentityResolution } from "./task-identity-index.ts";
import type { TaskReadOptions } from "./task-query-workflow.ts";
import { applyTaskUpdate } from "./task-update/index.ts";

function buildUpdatedDateComparableTask(task: Task): Record<string, unknown> {
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		assignee: task.assignee ?? [],
		reporter: task.reporter,
		createdDate: task.createdDate,
		dueDate: task.dueDate,
		labels: task.labels ?? [],
		milestone: task.milestone,
		dependencies: task.dependencies ?? [],
		references: task.references ?? [],
		documentation: task.documentation ?? [],
		modifiedFiles: task.modifiedFiles ?? [],
		rawContent: task.rawContent ?? "",
		description: task.description,
		parentTaskId: task.parentTaskId,
		subtasks: task.subtasks ?? [],
		priority: task.priority,
		type: task.type,
		project: task.project,
		onStatusChange: task.onStatusChange,
	};
}

function hasUpdatedDateRelevantChanges(originalTask: Task | null, nextTask: Task): boolean {
	return (
		!originalTask ||
		JSON.stringify(buildUpdatedDateComparableTask(originalTask)) !==
			JSON.stringify(buildUpdatedDateComparableTask(nextTask))
	);
}

/** Owns the locked read-apply-write transaction for active task edits. */
export class ProjectTaskMutations {
	constructor(
		private readonly filesystem: FileSystem,
		private readonly loadTask: (id: string, forMutation: boolean) => Promise<Task | null>,
		private readonly occupiedTaskIds: () => Promise<string[]>,
	) {}

	async requireCanonicalStatus(status: string): Promise<string> {
		const canonical = await getCanonicalStatus(status, { filesystem: this.filesystem });
		if (canonical) return canonical;
		const validStatuses = await getValidStatuses({ filesystem: this.filesystem });
		throw new Error(`Invalid status: ${status}. Valid statuses are: ${validStatuses.join(", ")}`);
	}

	async applyTaskUpdateInput(
		task: Task,
		input: TaskUpdateInput,
		statusResolver: (status: string) => Promise<string>,
	): Promise<{ task: Task; mutated: boolean }> {
		const mutated = await applyTaskUpdate(task, input, {
			resolveStatus: statusResolver,
			normalizePriority: (priority) => this.normalizePriority(priority),
			normalizeType: (type) => this.normalizeTaskType(type),
			normalizeProject: (project) => this.normalizeProject(project),
			validateDependencies: (dependencies, candidate) => validateDependencies(dependencies, this.filesystem, candidate),
			taskIdsEqual,
			formatMissingDependenciesError: (invalid) =>
				new Error(
					`The following dependencies do not exist: ${invalid.join(", ")}. Please create these tasks first or verify the IDs. ${LOCAL_TASK_LOOKUP_HINT}`,
				),
		});
		return { task, mutated };
	}

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withCreateLock(fn);
	}

	async generateNextId(type: EntityType = EntityType.Task, parent?: string): Promise<string> {
		const config = await this.filesystem.loadConfig();
		const prefix = getPrefixForType(type, config ?? undefined);
		const allIds = await this.getExistingIdsForType(type);
		if (parent) {
			const normalizedParent = allIds.find((id) => taskIdsEqual(parent, id)) ?? normalizeTaskId(parent);
			return generateNextSubtaskId(allIds, normalizedParent, prefix, config?.zeroPaddedIds);
		}
		return generateNextId(allIds, prefix, config?.zeroPaddedIds);
	}

	async loadTaskForMutation(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		if (options.includeCrossBranch === false) return await this.loadWorkingCopyTask(taskId, true);
		return (await this.loadTask(taskId, true)) ?? (await this.filesystem.loadTask(taskId, { includeArchived: true }));
	}

	async loadWorkingCopyTask(taskId: string, forMutation: boolean, activeTasks?: Task[]): Promise<Task | null> {
		const index = await this.buildWorkingCopyTaskIndex(activeTasks);
		return await this.loadResolvedTaskOrFilesystem(
			taskId,
			forMutation ? index.resolveForMutation(taskId) : index.resolveForRead(taskId),
		);
	}

	async updateFromInput(taskId: string, input: TaskUpdateInput, options: TaskReadOptions = {}): Promise<Task> {
		const task = await this.loadTaskForMutation(taskId, options);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		return await this.filesystem.withTaskLock(task, async () => {
			const current = await this.loadTaskForMutation(taskId, options);
			if (!current) throw new Error(`Task not found: ${taskId}`);
			const { mutated } = await this.applyTaskUpdateInput(current, input, (status) =>
				this.requireCanonicalStatus(status),
			);
			if (!mutated) return current;
			await this.saveTask(current);
			return current;
		});
	}

	async normalizePriority(value: string | undefined): Promise<string | undefined> {
		if (value === undefined || value.trim() === "") return undefined;
		const config = await this.filesystem.loadConfig();
		const normalized = resolvePriorityValue(value, config);
		if (!normalized)
			throw new Error(`Invalid priority: ${value}. Valid values are: ${formatValidPriorityValues(config)}`);
		return normalized;
	}

	async normalizeTaskType(value: string | undefined): Promise<string | undefined> {
		if (value === undefined || value === "") return undefined;
		const config = await this.filesystem.loadConfig();
		const canonical = resolveTaskTypeValue(value, config);
		if (!canonical) throw new Error(`Invalid type: ${value}. Valid types are: ${formatValidTaskTypeValues(config)}`);
		return canonical;
	}

	async normalizeProject(value: string | undefined): Promise<string | undefined> {
		if (value === undefined || value === "") return undefined;
		const config = await this.filesystem.loadConfig();
		const projects = getProjectValues(config);
		if (projects.length === 0) throw new Error(noProjectsConfiguredMessage(this.filesystem.configFilePath));
		const canonical = resolveProjectValue(value, config);
		if (!canonical)
			throw new Error(`Invalid project: ${value}. Valid projects are: ${formatValidProjectValues(config)}`);
		return canonical;
	}

	private async getExistingIdsForType(type: EntityType): Promise<string[]> {
		switch (type) {
			case EntityType.Task:
				return await this.occupiedTaskIds();
			case EntityType.Draft: {
				const [drafts, occupied] = await Promise.all([
					this.filesystem.listDrafts(),
					this.filesystem.listOccupiedDraftFileIds(),
				]);
				return [...drafts.map((draft) => draft.id), ...occupied];
			}
			case EntityType.Document:
				return (await this.filesystem.listDocuments()).map((document) => document.id);
			case EntityType.Decision:
				return (await this.filesystem.listDecisions()).map((decision) => decision.id);
		}
	}

	private async buildWorkingCopyTaskIndex(activeTasks?: Task[]): Promise<TaskIdentityIndex> {
		const [active, completed, config] = await Promise.all([
			activeTasks ? Promise.resolve(activeTasks) : this.filesystem.listTasks(),
			this.filesystem.listCompletedTasks(),
			this.filesystem.loadConfig(),
		]);
		return new TaskIdentityIndex(
			[
				...active.map((task) => ({
					id: task.id,
					type: "task" as const,
					branch: "local",
					path: task.filePath ?? `${this.filesystem.tasksDir}/${task.id}`,
					lastModified: task.lastModified ?? new Date(0),
					task: { ...task, source: TASK_SOURCE.LOCAL },
					workingCopy: true,
				})),
				...completed.map((task) =>
					completedTaskIdentityRecord(task, task.filePath ?? `${this.filesystem.completedDir}/${task.id}`),
				),
			],
			{
				repositoryRoot: null,
				projectRoot: this.filesystem.rootDir,
				agenticWorkspaceDirectory: this.filesystem.agenticWorkspaceDirName,
			},
			config?.statuses ?? ["To Do", "In Progress", "Done"],
			config?.taskResolutionStrategy ?? "most_progressed",
		);
	}

	private async loadResolvedTaskOrFilesystem(taskId: string, resolution: TaskIdentityResolution): Promise<Task | null> {
		if (resolution.status === "ambiguous") throw new AmbiguousTaskIdError(taskId, resolution.candidates);
		if (resolution.status === "found") return { ...resolution.task };
		return await this.filesystem.loadTask(taskId);
	}

	async saveTask(task: Task): Promise<string> {
		const original = await this.filesystem.loadTask(task.id, { includeArchived: true });
		const previousStatus = original?.status ?? "";
		const statusChanged = previousStatus !== (task.status ?? "");
		if (hasUpdatedDateRelevantChanges(original, task)) task.updatedDate = formatStoredDate();
		else if (original?.updatedDate) task.updatedDate = original.updatedDate;
		else delete task.updatedDate;
		const filepath = await this.filesystem.saveTask(task);
		if (statusChanged) await this.executeStatusChangeCallback(task, previousStatus, task.status ?? "");
		if (statusChanged && isDoneStatus(task.status)) {
			try {
				await removeTaskWorktree(this.filesystem.rootDir, task);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(`Could not remove worktree for ${task.id}: ${message}`);
			}
		}
		return filepath;
	}

	private async executeStatusChangeCallback(task: Task, oldStatus: string, newStatus: string): Promise<void> {
		const config = await this.filesystem.loadConfig();
		const command = task.onStatusChange ?? config?.onStatusChange;
		if (!command) return;
		try {
			const result = await executeStatusCallback({
				command,
				taskId: task.id,
				oldStatus,
				newStatus,
				taskTitle: task.title,
				cwd: this.filesystem.rootDir,
			});
			if (!result.success) {
				console.error(`Status change callback failed for ${task.id}: ${result.error ?? "Unknown error"}`);
				if (result.output) console.error(`Callback output: ${result.output}`);
			} else if (process.env.DEBUG && result.output) {
				console.log(`Status change callback output for ${task.id}: ${result.output}`);
			}
		} catch (error) {
			console.error(`Failed to execute status change callback for ${task.id}:`, error);
		}
	}
}
