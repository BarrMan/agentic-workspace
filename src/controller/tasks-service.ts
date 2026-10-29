import { DateTime } from "luxon";
import { removeTaskWorktree } from "../filesystem/git/task-worktree.ts";
import type { TaskWorktreeSessionCleanup } from "../filesystem/git/task-worktree-cleanup.ts";
import { DEFAULT_STATUSES, FALLBACK_STATUS } from "../model/constants.ts";
import { TaskCollectionParentNotFoundError } from "../model/errors/task-collection.ts";
import type { Session } from "../model/session/session.ts";
import type {
	AgentSession,
	ModeId,
	ModeProfile,
	ResolvedAgentConfiguration,
	SessionFactory,
} from "../model/session/types.ts";
import { generateNextSubtaskId } from "../model/task/prefix-config.ts";
import { findCanonicalStatus, resolveInProgressStatus } from "../model/task/status.ts";
import { Task as TaskModel } from "../model/task/task.ts";
import type { TaskCorpusSnapshot } from "../model/task/task-projection.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import type { Task, TaskCreateInput } from "../model/types.ts";
import type { SessionStore } from "../storage/session-store.ts";
import type { Storage } from "../storage/storage.ts";
import type { CreatedTaskWrite } from "../storage/types.ts";
import type { TaskRecordChange, TaskWatcherCallbacks } from "../storage/watchers/task-watcher.ts";
import { TaskPostCommitError } from "./errors/tasks.ts";
import { executeStatusCallback } from "./status-callback.ts";
import { buildCreatedTask, generatedTaskTitle, prepareTaskCreationInput } from "./task-creation-input.ts";
import { filterTaskQueryResults, type TaskQueryOptions, type TaskReadOptions } from "./task-query-workflow.ts";
import { markVacatedTaskMoved, type VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";

type SessionState = Awaited<ReturnType<SessionStore["read"]>>;

type LifecycleCallbacks = {
	cleanupSessions: TaskWorktreeSessionCleanup;
	forgetSessions: (taskId: string) => Promise<void>;
};

/** Internal owner for task models, storage operations, and task lifecycle orchestration. */
export class TasksService {
	private readonly models = new Map<string, TaskModel>();
	private records = new Map<string, { task: Task; lifecycle: "active" | "completed" | "archived" }>();
	private watcher?: { stop(): void };
	private readonly observers = new Set<TaskWatcherCallbacks>();
	private inFlight?: { filePath: string; superseded: boolean };

	constructor(
		private readonly storage: Storage,
		private readonly sessionFactory: SessionFactory | undefined,
		private readonly liveSession: (taskId: string, sessionId: string) => Session | undefined,
		private readonly occupiedTaskIds: () => Promise<string[]>,
		private readonly publishTaskChanged: (task: Task | string) => void,
		private readonly vacatedTaskReferences: VacatedTaskReferenceService,
		private readonly lifecycle: LifecycleCallbacks,
		private readonly resolveParentTaskId: (taskId: string) => Promise<string>,
		private readonly resolveOrdinal: (ordinal: number | undefined) => Promise<number | undefined>,
		private readonly worktreePolicy: () => Promise<"enabled" | "disabled">,
	) {}

	async init(): Promise<void> {
		if (this.watcher) throw new Error("TasksService is already initialized.");
		const subscription = { stopped: false };
		const ready = Promise.withResolvers<void>();
		let pending = ready.promise;
		// Read notifications in order, after the initial collection is installed.
		const enqueue = (work: () => Promise<void>): Promise<void> => {
			const run = async () => {
				if (!subscription.stopped) await work();
			};
			pending = pending.then(run, run);
			return pending;
		};
		try {
			const watcher = this.storage.watchTasks({
				onRecordChanged: (event) => enqueue(() => this.applyRecordChange(event, subscription)),
				onArtifactChanged: (event) => enqueue(() => this.applyArtifactChange(event, subscription)),
			});
			this.watcher = {
				stop: () => {
					subscription.stopped = true;
					watcher.stop();
				},
			};
			const [active, completed, archived] = await Promise.all([
				this.storage.loadTasks(),
				this.storage.loadCompletedTasks(),
				this.storage.loadArchivedTasks(),
			]);
			if (subscription.stopped) return;
			this.records.clear();
			for (const [lifecycle, tasks] of [
				["active", active],
				["completed", completed],
				["archived", archived],
			] as const)
				for (const task of tasks) {
					this.records.set(task.id, { task, lifecycle });
					this.updateStoredFields(task);
				}
			ready.resolve();
			await pending;
		} catch (error) {
			if (!subscription.stopped) this.dispose();
			throw error;
		} finally {
			ready.resolve();
		}
	}

	dispose(): void {
		this.watcher?.stop();
		this.watcher = undefined;
		this.observers.clear();
	}

	subscribe(callbacks: TaskWatcherCallbacks): () => void {
		this.observers.add(callbacks);
		return () => {
			this.observers.delete(callbacks);
		};
	}

	private async applyRecordChange(event: TaskRecordChange, subscription: { stopped: boolean }): Promise<void> {
		const descriptor = { filePath: event.filePath, superseded: false };
		this.inFlight = descriptor;
		try {
			const readTask = await event.read();
			if (subscription.stopped || descriptor.superseded) return;
			if (!readTask) {
				const match = [...this.records].find(([, record]) => record.task.filePath === event.filePath);
				if (match) {
					const [id] = match;
					this.records.delete(id);
					this.models.delete(id);
					await this.notifyObservers((observer) => (subscription.stopped ? undefined : observer.onTaskRemoved?.(id)));
				}
				return;
			}
			const previous = this.records.get(readTask.id);
			const task = { ...readTask, filePath: event.filePath };
			this.records.set(task.id, { task, lifecycle: event.lifecycle });
			this.updateStoredFields(task);
			const notifications = [
				this.notifyObservers((observer) => {
					if (subscription.stopped) return;
					return previous ? observer.onTaskChanged?.(task) : observer.onTaskAdded?.(task);
				}),
			];
			if (previous?.lifecycle === "active" && event.lifecycle !== "active")
				notifications.push(
					this.notifyObservers((observer) => (subscription.stopped ? undefined : observer.onTaskRemoved?.(task.id))),
				);
			const results = await Promise.allSettled(notifications);
			const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
			if (failures.length) throw new AggregateError(failures, `Task ${task.id} changed, but observers failed.`);
		} finally {
			if (this.inFlight === descriptor) this.inFlight = undefined;
		}
	}

	private async applyArtifactChange(event: { filePath: string }, subscription: { stopped: boolean }): Promise<void> {
		for (const { task } of this.records.values()) {
			const path = this.storage.relativeArtifactPath(task, event.filePath);
			if (path === null) continue;
			await this.notifyObservers((observer) =>
				subscription.stopped ? undefined : observer.onArtifactChanged?.({ taskId: task.id, path }),
			);
			return;
		}
	}

	private async notifyObservers(notify: (observer: TaskWatcherCallbacks) => void | Promise<void>): Promise<void> {
		const outcomes = await Promise.allSettled(
			[...this.observers].map(async (observer) => {
				await notify(observer);
			}),
		);
		const failures = outcomes.flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason] : []));
		if (failures.length) throw new AggregateError(failures, "Task observer notifications failed.");
	}

	getTasks(): Task[] {
		return [...this.records.values()].map(({ task }) => structuredClone(task));
	}
	getActiveTasks(): Task[] {
		return this.lifecycleTasks("active");
	}
	getCompletedTasks(): Task[] {
		return this.lifecycleTasks("completed");
	}
	private lifecycleTasks(lifecycle: "active" | "completed" | "archived"): Task[] {
		return [...this.records.values()]
			.filter((record) => record.lifecycle === lifecycle)
			.map(({ task }) => structuredClone(task));
	}

	async getTask(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		const record = this.records.get(taskId);
		return record && (record.lifecycle !== "archived" || options.includeArchived) ? structuredClone(record.task) : null;
	}

	private committed(task: Task, lifecycle = this.records.get(task.id)?.lifecycle ?? "active"): void {
		if (
			this.inFlight &&
			(this.inFlight.filePath === task.filePath || this.inFlight.filePath === this.records.get(task.id)?.task.filePath)
		)
			this.inFlight.superseded = true;
		this.records.set(task.id, { task: structuredClone(task), lifecycle });
		this.updateStoredFields(task);
	}

	async searchTasks(includeArchived = false): Promise<Task[]> {
		return includeArchived ? this.getTasks() : [...this.getActiveTasks(), ...this.getCompletedTasks()];
	}

	async query(options: TaskQueryOptions, snapshot?: TaskCorpusSnapshot): Promise<Task[]> {
		const tasksInScope = snapshot?.tasks ?? this.getActiveTasks();
		let filters = options.filters;
		if (options.parent) {
			const parent = await this.getTask(options.parent);
			if (!parent) throw new TaskCollectionParentNotFoundError(options.parent);
			filters = { ...filters, parentTaskId: parent.id };
		}
		const sourceTasks = tasksInScope;
		const query = options.query?.trim();
		const tasks = query ? await this.storage.addSearchableArtifactText(sourceTasks) : sourceTasks;
		const matches = query ? new TaskSearchIndex(tasks).search({ query }) : tasks;
		return filterTaskQueryResults(matches, { ...options, filters });
	}

	async generateNextId(parent?: string): Promise<string> {
		this.storage.invalidateConfigCache();
		const config = await this.storage.loadConfig();
		const prefix = config?.prefixes?.task ?? "task";
		if (!parent) return await this.storage.allocateTaskId(prefix, config?.zeroPaddedIds, this.occupiedTaskIds);
		const allIds = await this.occupiedTaskIds();
		return generateNextSubtaskId(allIds, parent, prefix, config?.zeroPaddedIds);
	}

	/** Caller holds the task lock; update writes the complete supplied task unchanged. */
	async update(task: Task): Promise<Task> {
		await this.storage.saveTask(task);
		this.committed(task);
		return task;
	}

	async edit(task: Task): Promise<Task> {
		const previous = await this.getTask(task.id, { includeArchived: true });
		await this.update(task);
		task.updatedDate = DateTime.utc().toFormat("yyyy-MM-dd HH:mm");
		const failures: unknown[] = [];
		try {
			await this.update(task);
		} catch (error) {
			throw new Error(`Task ${task.id} was saved, but its updated timestamp could not be persisted.`, { cause: error });
		}
		if (previous && previous.status !== task.status) {
			try {
				await this.runStatusChangeCallback(task, previous.status ?? "", task.status ?? "");
			} catch (error) {
				failures.push(error);
			}
		}
		try {
			this.publishTaskChanged({ ...task });
		} catch (error) {
			failures.push(error);
		}
		if (failures.length)
			throw new TaskPostCommitError(failures, `Task ${task.id} was saved, but post-commit work failed.`);
		return task;
	}

	async markDone(taskId: string, options: TaskReadOptions = {}): Promise<{ task: Task; changed: boolean }> {
		return await this.storage.withTaskLock(
			taskId,
			async (current) => {
				if (current.done) return { task: current, changed: false };
				const updated = { ...current, done: true };
				await this.edit(updated);
				return { task: updated, changed: true };
			},
			{ includeArchived: options.includeArchived },
		);
	}

	async setModeApproval(taskId: string, modeId: string, configuration: ResolvedAgentConfiguration): Promise<Task> {
		return await this.storage.withTaskLock(
			taskId,
			async (current) => {
				if (!configuration.config.modes?.profiles?.[modeId]) throw new Error(`Unknown mode: ${modeId}`);
				const model = new TaskModel(current);
				model.setModeApproval(modeId);
				const updated = structuredClone(model.task);
				return await this.edit(updated);
			},
			{ includeArchived: true },
		);
	}

	async create(input: TaskCreateInput): Promise<{ task: Task; filePath?: string }> {
		const prepared = prepareTaskCreationInput(input);
		const createdDate = DateTime.utc().toFormat("yyyy-MM-dd HH:mm");
		const [config, worktreePolicy] = await Promise.all([this.storage.loadConfig(), this.worktreePolicy()]);
		const status = input.status || config?.defaultStatus || FALLBACK_STATUS;
		if (findCanonicalStatus(status, config?.statuses?.length ? config.statuses : DEFAULT_STATUSES) === null) {
			throw new Error(`Invalid status: ${status}`);
		}
		let committed: { task: Task; filePath: string; write?: CreatedTaskWrite } | undefined;
		let notificationFailure: unknown;
		let result: { task: Task; filePath?: string };
		try {
			const { task, write } = await this.storage.withCreateLock(async () => {
				const parentTaskId = prepared.requestedParentTaskId
					? await this.resolveParentTaskId(prepared.requestedParentTaskId)
					: undefined;
				const id = await this.generateNextId(parentTaskId);
				const titledInput = prepared.title ? prepared : { ...prepared, title: generatedTaskTitle(id) };
				const draft = buildCreatedTask(input, titledInput, config, {
					id,
					parentTaskId,
					dependencies: prepared.dependencies,
					status,
					priority: input.priority,
					type: input.type,
					project: input.project,
					ordinal: await this.resolveOrdinal(input.ordinal),
					createdDate,
				});
				const corpora = prepared.dependencies.length ? await this.loadDependencyCorpus() : [];
				const model = new TaskModel(draft);
				model.replaceDependencies(prepared.dependencies, corpora.flat());
				const created = structuredClone(model.task);
				created.worktreePolicy = worktreePolicy;
				const write = await this.storage.createTask(created);
				const filePath = write.filePath;
				created.filePath = filePath;
				this.committed(created, "active");
				committed = { task: created, filePath, write };
				try {
					this.publishTaskChanged(created);
				} catch (error) {
					notificationFailure = error;
				}
				return { task: created, write };
			});
			result = { task, filePath: write.filePath };
		} catch (error) {
			if (!committed) throw error;
			const id = committed.task.id;
			if (!committed.write) {
				throw new Error(
					`Task ${id} was created at ${committed.filePath}, but its recovery receipt could not be prepared. The task was retained; review it before retrying because its ID remains in use.`,
					{ cause: error },
				);
			}
			const rollback = await this.storage.rollbackCreatedTask(committed.write).catch((rollbackError) => {
				throw new Error(
					`Task creation failed and cleanup also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
					{ cause: error },
				);
			});
			if (!rollback.workingPathRestored || !rollback.sessionStateRestored) {
				throw new Error(
					`Task creation failed, and cleanup could not safely remove changed task or session data for ${id}. Your changes were preserved; review them before retrying because ${id} remains in use.`,
					{ cause: error },
				);
			}
			if (this.inFlight?.filePath === committed.filePath) this.inFlight.superseded = true;
			this.records.delete(id);
			this.models.delete(id);
			try {
				await this.notifyObservers((observer) => observer.onTaskRemoved?.(id));
			} catch (notificationError) {
				throw new AggregateError([error, notificationError], `Task ${id} was rolled back, but notification failed.`);
			}
			throw error;
		}
		if (notificationFailure !== undefined)
			throw new AggregateError(
				[notificationFailure],
				`Task ${committed?.task.id} was saved, but post-commit notification failed.`,
			);
		return result;
	}

	async archive(
		taskId: string,
		options: TaskReadOptions = {},
	): Promise<{ success: boolean; cleanedTaskIds: string[] }> {
		const task = await this.getTask(taskId, options);
		if (!task) return { success: false, cleanedTaskIds: [] };
		return await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (current, cleanup) => {
			const notificationFailures: unknown[] = [];
			await this.lifecycle.cleanupSessions(current.id);
			await removeTaskWorktree(this.storage.projectRoot, current);
			await this.lifecycle.forgetSessions(current.id);
			const filePath = await this.storage.moveTaskToArchive(current);
			this.committed({ ...current, filePath }, "archived");
			try {
				await this.notifyObservers((observer) => observer.onTaskRemoved?.(current.id));
			} catch (error) {
				notificationFailures.push(error);
			}
			try {
				this.publishTaskChanged(current.id);
			} catch (error) {
				notificationFailures.push(error);
			}
			let cleanedTaskIds: string[];
			try {
				cleanedTaskIds = await this.writeReferenceCleanup(cleanup, notificationFailures);
			} catch (error) {
				const failure = notificationFailures.length
					? new AggregateError([error, ...notificationFailures], "Task was archived, but reference cleanup failed.")
					: error;
				throw markVacatedTaskMoved(failure, "archiveState");
			}
			if (notificationFailures.length)
				throw new AggregateError(
					notificationFailures,
					`Task ${current.id} was archived and references cleaned, but post-commit notification failed.`,
				);
			return { success: true, cleanedTaskIds };
		});
	}

	async delete(taskId: string, options: TaskReadOptions = {}): Promise<{ success: boolean; cleanedTaskIds: string[] }> {
		const task = await this.getTask(taskId, options);
		if (!task) return { success: false, cleanedTaskIds: [] };
		return await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (current, cleanup) => {
			const notificationFailures: unknown[] = [];
			await this.lifecycle.cleanupSessions(current.id);
			await removeTaskWorktree(this.storage.projectRoot, current);
			await this.lifecycle.forgetSessions(current.id);
			await this.storage.deleteTaskContainer(current);
			if (this.inFlight && this.inFlight.filePath === current.filePath) this.inFlight.superseded = true;
			this.records.delete(current.id);
			this.models.delete(current.id);
			try {
				await this.notifyObservers((observer) => observer.onTaskRemoved?.(current.id));
			} catch (error) {
				notificationFailures.push(error);
			}
			try {
				this.publishTaskChanged(current.id);
			} catch (error) {
				notificationFailures.push(error);
			}
			let cleanedTaskIds: string[];
			try {
				cleanedTaskIds = await this.writeReferenceCleanup(cleanup, notificationFailures);
			} catch (error) {
				const failure = notificationFailures.length
					? new AggregateError([error, ...notificationFailures], "Task was deleted, but reference cleanup failed.")
					: error;
				throw markVacatedTaskMoved(failure, "archiveState");
			}
			if (notificationFailures.length)
				throw new AggregateError(
					notificationFailures,
					`Task ${current.id} was deleted and references cleaned, but post-commit notification failed.`,
				);
			return { success: true, cleanedTaskIds };
		});
	}

	private async writeReferenceCleanup(
		cleanup: { active: Task[]; completed: Task[] },
		notificationFailures: unknown[],
	): Promise<string[]> {
		const cleaned: string[] = [];
		for (const kind of ["active", "completed"] as const)
			for (const task of cleanup[kind]) {
				await this.update(task);
				try {
					this.publishTaskChanged({ ...task });
				} catch (error) {
					notificationFailures.push(error);
				}
				cleaned.push(task.id);
			}
		return cleaned;
	}

	async writeBoardMoveTasksBulk(
		tasks: Task[],
		expectedTasks: Task[],
		movedIds: string[],
		moveMilestone: boolean,
	): Promise<void> {
		await this.storage.withTaskLocks(tasks, async (currentTasks) => {
			for (const current of currentTasks) {
				const planned = tasks.find((task) => task.id === current.id);
				if (!planned) throw new Error(`Task not found while applying board move: ${current.id}`);
				const expected = expectedTasks.find((task) => task.id === planned.id);
				if (
					!expected ||
					current.status !== expected.status ||
					current.ordinal !== expected.ordinal ||
					current.milestone !== expected.milestone
				)
					throw new Error(`Task ${planned.id} placement changed before board move; retry the operation.`);
			}
			for (const current of currentTasks) {
				const planned = tasks.find((task) => task.id === current.id);
				if (!planned) throw new Error(`Task not found while applying board move: ${current.id}`);
				const moved = movedIds.some((id) => id === current.id);
				const model = new TaskModel(current);
				model.applyBoardPlacement({
					status: moved ? planned.status : current.status,
					ordinal: planned.ordinal,
					milestone: moved && moveMilestone ? planned.milestone : current.milestone,
				});
				const updated = structuredClone(model.task);
				if (updated.status !== current.status || updated.milestone !== current.milestone) await this.edit(updated);
				else {
					await this.update(updated);
					try {
						this.publishTaskChanged({ ...updated });
					} catch (error) {
						throw new TaskPostCommitError(
							[error],
							`Task ${updated.id} was saved, but post-commit notification failed.`,
						);
					}
				}
				const plannedIndex = tasks.findIndex((task) => task.id === updated.id);
				if (plannedIndex !== -1) tasks[plannedIndex] = updated;
			}
		});
	}

	/** Session creation already holds the task lock. */
	async coordinateTaskStatus(task: Task): Promise<Task> {
		const config = await this.storage.loadConfig();
		const statuses = config?.statuses?.length ? config.statuses : [...DEFAULT_STATUSES];
		if (task.done) return task;
		const target = resolveInProgressStatus(statuses);
		if (!target || task.status === target) return task;
		const updated = await this.update({ ...task, status: target });
		const failures: unknown[] = [];
		try {
			await this.runStatusChangeCallback(updated, task.status ?? "", target);
		} catch (error) {
			failures.push(error);
		}
		try {
			this.publishTaskChanged({ ...updated });
		} catch (error) {
			failures.push(error);
		}
		if (failures.length)
			throw new TaskPostCommitError(failures, `Task ${task.id} was saved, but post-commit work failed.`);
		return updated;
	}

	private async loadDependencyCorpus(): Promise<Task[]> {
		return this.getTasks();
	}

	private async runStatusChangeCallback(task: Task, oldStatus: string, newStatus: string): Promise<void> {
		const config = await this.storage.loadConfig();
		const command = process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK === "1" ? config?.onStatusChange : undefined;
		if (!command) return;
		const result = await executeStatusCallback({
			command,
			taskId: task.id,
			oldStatus,
			newStatus,
			taskTitle: task.title,
			cwd: this.storage.projectRoot,
		});
		if (!result.success)
			throw new Error(
				`Status change callback failed for ${task.id}: ${result.error ?? result.output ?? `exit ${result.exitCode}`}`,
			);
		if (process.env.DEBUG && result.output)
			console.log(`Status change callback output for ${task.id}: ${result.output}`);
	}

	get(taskId: string): TaskModel | undefined {
		return this.models.get(taskId);
	}

	findSession(taskId: string, sessionId: string): Session | undefined {
		return this.get(taskId)?.findSession(sessionId);
	}

	forget(taskId: string): void {
		this.models.delete(taskId);
	}

	updateStoredFields(task: Task): void {
		const model = this.get(task.id);
		if (model) model.task = structuredClone(task);
	}

	hydrate(task: Task, profiles: Record<ModeId, ModeProfile>, state: SessionState, selectedModeId?: ModeId): TaskModel {
		const key = task.id;
		const current = this.models.get(key);
		const model = current ?? new TaskModel(task);
		model.replaceLoadedState(
			{
				...task,
				profiles,
				sessionRecords: state.modes,
				selectedModeId: selectedModeId ?? Object.keys(profiles)[0] ?? "",
			},
			(taskId: string, modeId: ModeId, record?: AgentSession) => {
				if (!record) throw new Error("SessionFactory requires a durable session record.");
				const existing = this.findSession(taskId, record.id) ?? this.liveSession(taskId, record.id);
				return existing ?? this.newSession(record, modeId);
			},
		);
		this.models.set(key, model);
		return model;
	}

	private newSession(record: AgentSession, modeId: ModeId): Session {
		if (!this.sessionFactory)
			throw new Error("Session lifecycle requires a SessionFactory from the application composition.");
		return this.sessionFactory(record.taskId, modeId, record);
	}
}
