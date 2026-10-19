import { formatStoredDate } from "../lib/date.ts";
import { AmbiguousTaskIdError } from "../model/errors/task-id.ts";
import type { ResolvedAgentConfiguration } from "../model/session/types.ts";
import { DependencyValidator } from "../model/task/dependency-validator.ts";
import { generateNextId, generateNextSubtaskId, getPrefixForType } from "../model/task/prefix-config.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../model/task/priority-config.ts";
import {
	formatValidProjectValues,
	getProjectValues,
	noProjectsConfiguredMessage,
	resolveProjectValue,
} from "../model/task/project-config.ts";
import { getCanonicalStatus, getValidStatuses } from "../model/task/status.ts";
import { Task as TaskModel } from "../model/task/task.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import { TaskIdentityIndex, type TaskIdentityResolution } from "../model/task/task-identity-index.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../model/task/task-path.ts";
import { formatValidTaskTypeValues, resolveTaskTypeValue } from "../model/task/task-type-config.ts";
import { applyTaskUpdate } from "../model/task/task-update/index.ts";
import { EntityType, type Task, type TaskUpdateInput } from "../model/types.ts";
import type { Storage } from "../storage/storage.ts";
import { executeStatusCallback } from "./status-callback.ts";
import type { TaskReadOptions } from "./task-query-workflow.ts";

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
	private readonly approvalTails = new Map<string, Promise<void>>();

	constructor(
		private readonly storage: Storage,
		private readonly loadTask: (id: string, forMutation: boolean) => Promise<Task | null>,
		private readonly occupiedTaskIds: () => Promise<string[]>,
	) {}

	async requireCanonicalStatus(status: string): Promise<string> {
		const canonical = await getCanonicalStatus(status, { getStoredConfig: () => this.storage.loadConfig() });
		if (canonical) return canonical;
		const validStatuses = await getValidStatuses({ getStoredConfig: () => this.storage.loadConfig() });
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
			validateDependencies: (dependencies, candidate) =>
				new DependencyValidator(this.storage.dependencyStore).validate(dependencies, candidate),
			taskIdsEqual,
			formatMissingDependenciesError: (invalid) =>
				new Error(
					`The following dependencies do not exist: ${invalid.join(", ")}. Please create these tasks first or verify the IDs. ${LOCAL_TASK_LOOKUP_HINT}`,
				),
		});
		return { task, mutated };
	}

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.storage.withCreateLock(fn);
	}

	async generateNextId(type: EntityType = EntityType.Task, parent?: string): Promise<string> {
		this.storage.invalidateConfigCache();
		const config = await this.storage.loadConfig();
		const prefix = getPrefixForType(type, config ?? undefined);
		if (type === EntityType.Task && !parent) {
			return await this.storage.allocateTaskId(prefix, config?.zeroPaddedIds, this.occupiedTaskIds);
		}
		const allIds = await this.getExistingIdsForType(type);
		if (parent) {
			const normalizedParent = allIds.find((id) => taskIdsEqual(parent, id)) ?? parent;
			return generateNextSubtaskId(allIds, normalizedParent, prefix, config?.zeroPaddedIds);
		}
		return generateNextId(allIds, prefix, config?.zeroPaddedIds);
	}

	async loadTaskForMutation(taskId: string, _options: TaskReadOptions = {}): Promise<Task | null> {
		const task = await this.loadTask(taskId, true);
		if (task?.source === "completed") return null;
		const resolved = task ?? (await this.storage.loadTask(taskId, { includeArchived: true }));
		if (resolved?.filePath) {
			if (this.storage.isCompletedTaskRecordPath(resolved.filePath)) return null;
		}
		return resolved;
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
		return await this.storage.withTaskLock(task, async () => {
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

	async setModeApproval(taskId: string, modeId: string, configuration: ResolvedAgentConfiguration): Promise<Task> {
		const previous = this.approvalTails.get(taskId) ?? Promise.resolve();
		let release!: () => void;
		const currentTail = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.approvalTails.set(taskId, currentTail);
		await previous;
		try {
			const task = await this.loadTaskForMutation(taskId);
			if (!task) throw new Error(`Task not found: ${taskId}`);
			return await this.storage.withTaskLock(task, async () => {
				const current = await this.storage.loadTask(taskId, { includeArchived: true });
				if (!current) throw new Error(`Task not found: ${taskId}`);
				const profiles = configuration.config.modes?.profiles ?? {};
				if (!profiles[modeId]) throw new Error(`Unknown mode: ${modeId}`);
				const model = new TaskModel({
					task: current,
					modes: profiles,
					configuration,
					sessionRecords: {},
					selectedModeId: modeId,
					createSession: () => {
						throw new Error("Session creation is unavailable during approval mutation.");
					},
				});
				model.setModeApproval(modeId);
				const updated = model.serialize();
				await this.storage.saveTask({ ...updated, filePath: current.filePath }, { approvalMutation: true });
				return updated;
			});
		} finally {
			release();
			if (this.approvalTails.get(taskId) === currentTail) this.approvalTails.delete(taskId);
		}
	}

	async normalizePriority(value: string | undefined): Promise<string | undefined> {
		if (value === undefined || value.trim() === "") return undefined;
		const config = await this.storage.loadConfig();
		const normalized = resolvePriorityValue(value, config);
		if (!normalized)
			throw new Error(`Invalid priority: ${value}. Valid values are: ${formatValidPriorityValues(config)}`);
		return normalized;
	}

	async normalizeTaskType(value: string | undefined): Promise<string | undefined> {
		if (value === undefined || value === "") return undefined;
		const config = await this.storage.loadConfig();
		const canonical = resolveTaskTypeValue(value, config);
		if (!canonical) throw new Error(`Invalid type: ${value}. Valid types are: ${formatValidTaskTypeValues(config)}`);
		return canonical;
	}

	async normalizeProject(value: string | undefined): Promise<string | undefined> {
		if (value === undefined || value === "") return undefined;
		const config = await this.storage.loadConfig();
		const projects = getProjectValues(config);
		if (projects.length === 0) throw new Error(noProjectsConfiguredMessage(this.storage.configFilePath));
		const canonical = resolveProjectValue(value, config);
		if (!canonical)
			throw new Error(`Invalid project: ${value}. Valid projects are: ${formatValidProjectValues(config)}`);
		return canonical;
	}

	private async getExistingIdsForType(type: EntityType): Promise<string[]> {
		return type === EntityType.Task ? await this.occupiedTaskIds() : [];
	}

	private async buildWorkingCopyTaskIndex(activeTasks?: Task[]): Promise<TaskIdentityIndex> {
		const [active, completed] = await Promise.all([
			activeTasks ? Promise.resolve(activeTasks) : this.storage.loadTasks(),
			this.storage.loadCompletedTasks(),
		]);
		return new TaskIdentityIndex(
			[
				...active.map((task) => this.storage.activeTaskIdentityRecord(task)),
				...completed.map((task) => this.storage.projectCompletedTaskIdentityRecord(task)),
			],
			this.storage.taskIdentityContext(null),
		);
	}

	private async loadResolvedTaskOrFilesystem(taskId: string, resolution: TaskIdentityResolution): Promise<Task | null> {
		if (resolution.status === "ambiguous") throw new AmbiguousTaskIdError(taskId, resolution.candidates);
		if (resolution.status === "found") return { ...resolution.task };
		return await this.storage.loadTask(taskId);
	}

	async saveTask(task: Task): Promise<string> {
		const original = await this.storage.loadTask(task.id, { includeArchived: true });
		const previousStatus = original?.status ?? "";
		const statusChanged = previousStatus !== (task.status ?? "");
		if (hasUpdatedDateRelevantChanges(original, task)) task.updatedDate = formatStoredDate();
		else if (original?.updatedDate) task.updatedDate = original.updatedDate;
		else delete task.updatedDate;
		const filepath = await this.storage.saveTask(task);
		if (statusChanged) await this.executeStatusChangeCallback(task, previousStatus, task.status ?? "");
		return filepath;
	}

	private async executeStatusChangeCallback(task: Task, oldStatus: string, newStatus: string): Promise<void> {
		const config = await this.storage.loadConfig();
		const command = process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK === "1" ? config?.onStatusChange : undefined;
		if (!command) return;
		try {
			const result = await executeStatusCallback({
				command,
				taskId: task.id,
				oldStatus,
				newStatus,
				taskTitle: task.title,
				cwd: this.storage.projectRoot,
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
