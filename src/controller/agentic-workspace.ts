import { GitOperations } from "../filesystem/git/operations.ts";
import { findAgenticWorkspaceRoot } from "../filesystem/paths/find-root.ts";
import { resolveRuntimeCwd } from "../lib/runtime-cwd.ts";
import { DEFAULT_STATUSES, FALLBACK_STATUS } from "../model/constants.ts";
import { TaskCollectionFilterError } from "../model/errors/task-collection.ts";
import { AmbiguousTaskIdError } from "../model/errors/task-id.ts";
import {
	Config,
	removeMode as removeConfiguredMode,
	removeAgentPreset as removeExactAgentPreset,
} from "../model/session/config.ts";
import type { AgentConfiguration, ModeId, SessionFactory } from "../model/session/types.ts";
import { requireMilestoneId } from "../model/task/milestones.ts";
import { formatValidPriorityValues, resolvePriorityLabel } from "../model/task/priority-config.ts";
import { DEFAULT_ORDINAL_STEP, reconcileBoardPlacement } from "../model/task/reorder.ts";
import { formatValidStatuses, getCanonicalStatuses } from "../model/task/status.ts";
import { Task as TaskModel } from "../model/task/task.ts";
import { TaskCollection as TaskCollectionModel } from "../model/task/task-collection.ts";
import { taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { TaskIdentityIndex, type TaskIdentityRecord } from "../model/task/task-identity-index.ts";
import { TaskOrdering } from "../model/task/task-ordering.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../model/task/task-path.ts";
import type { TaskCorpusSnapshot } from "../model/task/task-projection.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import {
	EntityType,
	type Milestone,
	type SearchResult,
	type Task,
	type TaskCreateInput,
	type TaskListFilter,
	type TaskUpdateInput,
} from "../model/types.ts";
import { getBuiltInAgentConfiguration, updateStoredAgentConfiguration } from "../storage/config.ts";
import { isConfigValueError } from "../storage/file-system.ts";
import { Storage } from "../storage/storage.ts";
import type { CreatedTaskRollbackResult, CreatedTaskWrite } from "../storage/types.ts";
import type { ConfigWatcherCallbacks } from "../storage/watchers/config-watcher.ts";
import { type TaskWatcherCallbacks, watchTaskRecords } from "../storage/watchers/task-watcher.ts";
import {
	loadAgentConfiguration,
	loadProjectModeCatalog,
	patchAgentConfiguration,
	resolveAgentConfiguration,
	updateAgentConfiguration,
} from "./agent-configuration.ts";
import { CallingSessionOperations } from "./calling-session.ts";
import { planOrderedTaskPlacement } from "./ordered-task-move-planner.ts";
import { PersistentTaskRead } from "./persistent-task-read.ts";
import { type PersistentSearchOptions, searchSnapshot } from "./search-service.ts";
import { SessionApplication } from "./session-application.ts";
import { Signals } from "./signals.ts";
import { TaskCreationService } from "./task-creation-workflow.ts";
import { TaskLifecycleService } from "./task-lifecycle-service.ts";
import { type CommittedTaskChange, ProjectTaskMutations } from "./task-mutation-service.ts";
import type { TaskQueryOptions, TaskReadOptions } from "./task-query-workflow.ts";
import { planTaskReorder } from "./task-reorder-plan.ts";
import { VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";
import { WorkspaceStateService } from "./workspace-state.ts";

interface MoveTasksPlan {
	readonly expectedTasks: Task[];
	readonly movedTasks: Task[];
	readonly changedTasks: Task[];
	readonly failures: Array<{ taskId: string; reason: string }>;
}

interface MoveTaskPlacement {
	readonly movedTasks: Task[];
	readonly changedTasks: Task[];
}

export type { TaskReadOptions } from "./task-query-workflow.ts";

export type TaskCollectionFilterInput = {
	status?: string;
	excludeStatus?: string[];
	priority?: string;
	labels?: string[];
};

type TaskCollection = {
	getTasks(filter?: TaskListFilter): Task[];
	resolveTaskForMutation(taskId: string): ReturnType<TaskIdentityIndex["resolveForMutation"]>;
};

/**
 * Outcome of an operation that vacates a task ID. `cleanedTaskIds` names the records that lost a
 * stored reference to it, so every surface can report the change instead of making it silently.
 */
export interface VacatedTaskResult {
	success: boolean;
	cleanedTaskIds: string[];
}

/**
 * A board move rewrites the task file, so a task that belongs to another branch can only be moved
 * from that branch. Returns the reason to report, or null when the task is local and writable.
 */
function crossBranchMoveReason(task: Task, verb: "reordered" | "moved"): string | null {
	if (!task.branch) return null;
	return `Task ${task.id} exists in branch "${task.branch}" and cannot be ${verb} from the current branch. Switch to that branch to modify it.`;
}

export class Core {
	readonly signals = new Signals();
	readonly git: GitOperations;
	readonly sessionApplication: SessionApplication;
	readonly callingSession: CallingSessionOperations;
	readonly workspaceState: WorkspaceStateService;
	private readonly vacatedTaskReferences: VacatedTaskReferenceService;
	private readonly taskMutations: ProjectTaskMutations;
	private readonly taskLifecycle: TaskLifecycleService;
	private readonly persistentReads: PersistentTaskRead;
	private readonly storage: Storage;
	private configSnapshot?: Promise<Config>;

	constructor(
		projectRoot: string,
		options: { storage?: Storage; sessionFactory?: SessionFactory; maxSessions?: number; stateRoot?: string } = {},
	) {
		this.storage =
			options.storage ??
			Storage.open(projectRoot, options.stateRoot !== undefined ? { stateRoot: options.stateRoot } : {});
		void this.storage.startAgentPresetCommandMigration();
		this.configSnapshot = Config.load(this.storage, getBuiltInAgentConfiguration());
		void this.configSnapshot.catch(() => undefined);
		this.git = new GitOperations(projectRoot, null, () => this.storage.loadConfig());
		this.persistentReads = new PersistentTaskRead(this.storage, this.git);
		this.vacatedTaskReferences = new VacatedTaskReferenceService(this.storage);
		this.sessionApplication = new SessionApplication(this, {
			storage: this.storage,
			sessionFactory: options.sessionFactory,
			maxSessions: options.maxSessions ?? 10,
		});
		this.callingSession = new CallingSessionOperations(
			(taskId) => this.sessionApplication.store.read(taskId),
			(taskId, modeId, question) => this.sessionApplication.askPrevious(taskId, modeId, question),
			(modeId, modelId) => this.setModeModel(modeId, modelId),
		);
		this.workspaceState = new WorkspaceStateService(this, { sessionApplication: this.sessionApplication });
		this.taskMutations = new ProjectTaskMutations(
			this.storage,
			(id) => this.persistentReads.get(id, { forMutation: true }),
			() => this.getActiveAndCompletedTaskIds(),
			(task) => this.signals.publish("TasksChanged", task),
		);
		this.taskLifecycle = this.createTaskLifecycleService();
	}

	async getConfig(): Promise<Config> {
		this.configSnapshot ??= Config.load(this.storage, getBuiltInAgentConfiguration());
		return await this.configSnapshot;
	}

	async reloadConfiguration(): Promise<void> {
		await (await this.getConfig()).reload();
	}

	async getExactAgentConfiguration(
		scope: "root" | "project" | "card",
		taskId?: string,
	): Promise<AgentConfiguration | null> {
		return await loadAgentConfiguration(this, scope, taskId);
	}

	async loadRootAgentConfiguration(): Promise<AgentConfiguration | null> {
		return await this.storage.loadUserAgentConfiguration();
	}

	async updateStoredAgentConfiguration(
		scope: "root" | "project",
		updater: (configuration: AgentConfiguration | null) => AgentConfiguration,
	): Promise<AgentConfiguration> {
		return await updateStoredAgentConfiguration(this.storage, scope, updater);
	}

	async getEffectiveAgentConfiguration(taskId?: string) {
		return await resolveAgentConfiguration(this, taskId);
	}

	async getProjectModeCatalog() {
		return await loadProjectModeCatalog(this);
	}

	async patchAgentConfiguration(
		scope: "root" | "project" | "card",
		patch: import("../model/session/config.ts").AgentConfigurationPatch,
		taskId?: string,
	) {
		return await patchAgentConfiguration(this, scope, patch, taskId);
	}

	async removeAgentPreset(
		scope: "root" | "project" | "card",
		name: string,
		taskId?: string,
	): Promise<AgentConfiguration> {
		return await updateAgentConfiguration(
			this,
			scope,
			(configuration) => removeExactAgentPreset(configuration, name, scope),
			taskId,
		);
	}

	async setModeModel(modeId: ModeId, modelId: string): Promise<void> {
		const catalog = await this.getProjectModeCatalog();
		const profile = catalog.profiles[modeId];
		if (!profile) throw new Error(`Unknown mode '${modeId}'.`);
		await this.patchAgentConfiguration("project", {
			modes: {
				...catalog,
				profiles: { ...catalog.profiles, [modeId]: { ...profile, model: { kind: "explicit", id: modelId } } },
			},
		});
	}

	async deleteMode(
		modeId: ModeId,
		options: { confirmed: true; moveToModeId?: ModeId },
	): Promise<{ deletedModeId: ModeId; taskIds: string[] }> {
		if (!options.confirmed) throw new Error("Mode deletion requires explicit confirmation.");
		return await this.withTaskChanges(async (changes) => {
			const releaseMode = await this.storage.claimModeAdmission(modeId);
			let releaseDestination: (() => Promise<void>) | undefined;
			const taskReleases: Array<() => Promise<void>> = [];
			const prepared: Array<{
				taskId: string;
				record: { id: string };
				stop: () => Promise<void>;
				release: () => Promise<void>;
			}> = [];
			const completed: string[] = [];
			const stopped: Array<{ taskId: string; sessionId: string }> = [];
			let primary: Error | undefined;
			const partialEffectsMessage = () =>
				`Mode deletion failed after stopping sessions: ${stopped.map(({ taskId, sessionId }) => `${taskId}/${sessionId}`).join(", ") || "none"}; ${options.moveToModeId ? "transferred" : "removed"} sessions from: ${completed.join(", ") || "none"}.`;
			try {
				await this.storage.modeDeletionJournal.withLock(async () => {
					if (await this.storage.modeDeletionJournal.read())
						throw new Error("A mode deletion is pending; preserve its journal and recover it before another deletion.");
					const catalog = await this.getProjectModeCatalog();
					if (!catalog.profiles[modeId]) throw new Error(`Unknown mode '${modeId}'.`);
					if (catalog.order.length <= 1) throw new Error("Cannot delete the last configured mode.");
					const destination = options.moveToModeId;
					if (destination !== undefined) {
						if (destination === modeId || !catalog.profiles[destination])
							throw new Error("Choose a different existing destination mode.");
						releaseDestination = await this.storage.claimModeAdmission(destination);
					}
					const taskIds = (await this.storage.loadProjectTaskIds()).sort((left, right) => left.localeCompare(right));
					for (const taskId of taskIds) taskReleases.push(await this.storage.claimTaskAdmission(taskId));
					for (const taskId of destination === undefined ? taskIds : []) {
						for (const entry of await this.sessionApplication.prepareTaskStop(taskId, modeId))
							prepared.push({ taskId, record: entry.record, stop: entry.stop, release: entry.release });
					}
					const journal = {
						version: 2,
						operationId: crypto.randomUUID(),
						source: modeId,
						...(destination === undefined ? {} : { destination }),
						phase: "prepared",
						tasks: taskIds,
					} as const;
					await this.storage.modeDeletionJournal.write(journal);
					for (const entry of prepared) {
						await entry.stop();
						stopped.push({ taskId: entry.taskId, sessionId: entry.record.id });
					}
					for (const taskId of taskIds) {
						if (destination !== undefined) {
							await this.sessionApplication.moveModeSessions(taskId, modeId, destination);
						} else {
							await this.sessionApplication.discardModeSessions(taskId, modeId);
							await this.sessionApplication.forgetModeSessions(taskId, modeId);
						}
						changes.push({ task: taskId });
						completed.push(taskId);
					}
					const exact = await this.getExactAgentConfiguration("project");
					if (!exact) throw new Error("Project agent configuration is unavailable.");
					await updateAgentConfiguration(this, "project", (current) => removeConfiguredMode(current, modeId));
					await this.storage.modeDeletionJournal.remove();
				});
			} catch (error) {
				primary = error instanceof Error ? error : new Error(String(error));
				primary = new AggregateError([primary], partialEffectsMessage(), { cause: primary });
			} finally {
				const releases = [
					...prepared.map((entry) => entry.release),
					...taskReleases.reverse(),
					...(releaseDestination ? [releaseDestination] : []),
					releaseMode,
				];
				const failures: Error[] = [];
				for (const release of releases) {
					try {
						await release();
					} catch (error) {
						failures.push(error instanceof Error ? error : new Error(String(error)));
					}
				}
				if (failures.length)
					primary = new AggregateError(
						[...(primary ? [primary] : []), ...failures],
						primary?.message ?? "Mode deletion claim release failed.",
						{ cause: primary },
					);
			}
			if (primary) throw primary;
			return { deletedModeId: modeId, taskIds: completed };
		});
	}

	private createTaskLifecycleService(): TaskLifecycleService {
		return new TaskLifecycleService(
			this.storage,
			this.taskMutations,
			this.vacatedTaskReferences,
			async (taskId) => await this.cleanupTaskSessions(taskId),
			async (taskId) => await this.sessionApplication.forgetTaskSessions(taskId),
			async (taskId) => {
				const state = await this.sessionApplication.store.read(taskId);
				for (const history of Object.values(state.modes)) {
					for (const record of history.sessions) {
						const observed = await this.sessionApplication.readObserved(taskId, record.id);
						if (observed.snapshot.state !== "stopped")
							throw new Error(
								`Session ${record.id} is not positively stopped; stop it explicitly before archiving ${taskId}.`,
							);
					}
				}
			},
		);
	}

	private async cleanupTaskSessions(taskId: string): Promise<void> {
		const prepared = await this.sessionApplication.prepareTaskStop(taskId);
		let primary: Error | undefined;
		try {
			for (const session of prepared) await session.stop();
		} catch (error) {
			primary = error instanceof Error ? error : new Error(String(error));
		} finally {
			const releaseFailures: Error[] = [];
			for (const session of prepared) {
				try {
					await session.release();
				} catch (error) {
					releaseFailures.push(error instanceof Error ? error : new Error(String(error)));
				}
			}
			if (releaseFailures.length)
				primary = new AggregateError(
					[...(primary ? [primary] : []), ...releaseFailures],
					primary ? "Task session cleanup failed." : "Task session cleanup claim release failed.",
					{ cause: primary },
				);
		}
		if (primary) throw primary;
	}

	private async buildTaskIdentityIndex(
		localTasks: Array<Task & { lastModified?: Date }>,
		completedTasks: Task[],
		repositoryRoot?: string | null,
		git = this.git,
	): Promise<TaskIdentityIndex> {
		const records: TaskIdentityRecord[] = [];
		for (const task of localTasks) records.push(this.storage.projectTaskIdentityRecord(task));
		for (const task of completedTasks) records.push(this.storage.projectCompletedTaskIdentityRecord(task));

		return new TaskIdentityIndex(
			records,
			this.storage.taskIdentityContext(repositoryRoot === undefined ? await git.getRepositoryRoot() : repositoryRoot),
		);
	}

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.taskMutations.withCreateLock(fn);
	}

	async resolveCreateOrdinal(inputOrdinal: number | undefined): Promise<number | undefined> {
		if (typeof inputOrdinal === "number") {
			return inputOrdinal;
		}
		const tasks = await this.storage.loadTasks();
		const ordinals = tasks
			.map((task) => task.ordinal)
			.filter((ordinal): ordinal is number => typeof ordinal === "number" && Number.isFinite(ordinal));

		if (ordinals.length === 0) {
			return tasks.length === 0 ? DEFAULT_ORDINAL_STEP : undefined;
		}

		return Math.max(...ordinals) + DEFAULT_ORDINAL_STEP;
	}

	async queryTasks(options: TaskQueryOptions = {}): Promise<Task[]> {
		return await this.persistentReads.query(options);
	}

	/** Shared validation for collection surfaces before applying a prepared task graph. */
	async resolveCollectionFilters(input: TaskCollectionFilterInput): Promise<TaskListFilter> {
		const config = await this.storage.loadConfig();
		const priority = input.priority ? resolvePriorityLabel(input.priority, config) : undefined;
		if (input.priority && !priority)
			throw new TaskCollectionFilterError(
				`Invalid priority filter. Valid values are: ${formatValidPriorityValues(config)}`,
			);
		const statuses = await getCanonicalStatuses(input.excludeStatus ?? [], this);
		if (statuses.invalid.length)
			throw new TaskCollectionFilterError(
				`Invalid excludeStatus filter: ${statuses.invalid.join(", ")}. Valid statuses are: ${formatValidStatuses(statuses.validStatuses)}`,
			);
		return {
			status: input.status || undefined,
			excludeStatus: statuses.values.length ? statuses.values : undefined,
			priority,
			labels: input.labels?.length ? input.labels : undefined,
		};
	}

	async searchPersistently(options: PersistentSearchOptions): Promise<SearchResult[]> {
		const tasks =
			!options.types || options.types.includes("task")
				? await this.persistentReads.searchTasks(options.includeArchived)
				: [];
		const searchableTasks = tasks.length ? await this.storage.addSearchableArtifactText(tasks) : tasks;
		return searchSnapshot(searchableTasks, options);
	}

	/** Loads one request-local Markdown/Git snapshot without retaining it on Core. */
	async loadTaskSnapshot(): Promise<TaskCorpusSnapshot & { identityIndex: TaskIdentityIndex }> {
		return await this.persistentReads.load();
	}

	async getTask(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return await this.persistentReads.get(taskId.toUpperCase(), {
			includeArchived: options.includeArchived,
		});
	}

	async getTaskWithSubtasks(taskId: string, localTasks?: Task[], options: TaskReadOptions = {}): Promise<Task | null> {
		const task = await this.getTask(taskId, options);
		return task
			? new TaskCollectionModel(localTasks ?? (await this.storage.loadTasks())).withSubtaskSummaries(task)
			: null;
	}

	async loadTaskById(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return await this.getTask(taskId, options);
	}

	async buildWorkingCopyTaskIndex(activeTasks?: Task[]): Promise<TaskIdentityIndex> {
		if (!activeTasks) return (await this.loadTaskSnapshot()).identityIndex;
		const completedTasks = await this.storage.loadCompletedTasks();
		return await this.buildTaskIdentityIndex(activeTasks, completedTasks, null);
	}

	async loadWorkingCopyTasks(includeCompleted = false): Promise<Task[]> {
		return (await this.buildWorkingCopyTaskIndex()).getTasks(includeCompleted);
	}

	async loadWorkingCopyTask(taskId: string, forMutation: boolean, activeTasks?: Task[]): Promise<Task | null> {
		return await this.taskMutations.loadWorkingCopyTask(taskId, forMutation, activeTasks);
	}

	async loadTaskForMutation(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return await this.taskMutations.loadTaskForMutation(taskId, options);
	}

	async getTaskContent(taskId: string): Promise<string | null> {
		return await this.storage.loadTaskContent(taskId);
	}

	async ensureConfigLoaded(): Promise<void> {
		try {
			const config = await this.storage.loadConfig();
			this.git.setConfig(config);
		} catch (error) {
			// A config value AgenticWorkspace refuses to read is the user's to fix and must reach the command;
			// only the recoverable git-configuration failures this guard exists for are suppressed.
			if (isConfigValueError(error)) {
				throw error;
			}
			// Config loading failed, git operations will work with null config
			if (process.env.DEBUG) {
				console.warn("Failed to load config for git operations:", error);
			}
		}
	}

	async getGitOps() {
		await this.ensureConfigLoaded();
		return this.git;
	}

	// ID generation
	/**
	 * Generates the next ID for a given entity type.
	 *
	 * @param type - The entity type. Defaults to Task.
	 * @param parent - Optional parent ID for subtask generation.
	 * @returns The next available task ID.
	 */
	async generateNextId(type: EntityType = EntityType.Task, parent?: string): Promise<string> {
		return await this.taskMutations.generateNextId(type, parent);
	}

	/**
	 * Gets all task IDs that are in use (active or completed) across all branches.
	 * Respects cross-branch config settings. Archived IDs are excluded (can be reused).
	 *
	 * This is used for ID generation to determine the next available ID.
	 */
	private async getActiveAndCompletedTaskIds(): Promise<string[]> {
		const snapshot = await this.loadTaskSnapshot();
		const completedTasks = snapshot.completedTasks;
		if (!snapshot.identityIndex) throw new Error("Task corpus identity index was not initialized");

		// Same-repository worktrees share the task ID namespace even before their
		// task files are committed, so include their filesystem state for allocation.
		const archivedTasks = await this.storage.loadArchivedTasks();
		const occupiedIds = new Set(snapshot.identityIndex.getOccupiedIds());
		for (const task of completedTasks) occupiedIds.add(task.id);
		for (const task of archivedTasks) occupiedIds.add(task.id);
		return [...occupiedIds];
	}

	/**
	 * Gets all existing IDs for a given entity type.
	 * Used internally by generateNextId to determine the next available ID.
	 *
	 * Task allocation reserves identities across active, completed, archived, and worktree records.
	 */
	async getExistingIdsForType(type: EntityType): Promise<string[]> {
		switch (type) {
			case EntityType.Task: {
				// Reserve the complete task identity inventory across stores and branches.
				return this.getActiveAndCompletedTaskIds();
			}
			default:
				return [];
		}
	}

	async writePreparedTask(task: Task): Promise<string> {
		return await this.storage.saveTask(task, { create: true });
	}

	async finalizeCreatedTask(task: Task): Promise<Task | null> {
		return await this.storage.loadTask(task.id);
	}

	async rollbackCreatedTask(write: CreatedTaskWrite): Promise<CreatedTaskRollbackResult> {
		return await this.storage.rollbackCreatedTask(write);
	}

	async createTaskFromInput(input: TaskCreateInput): Promise<{ task: Task; filePath?: string }> {
		return await this.withTaskChanges(async (changes) => {
			const result = await new TaskCreationService(this).create(input, changes);
			changes.push({ task: result.task });
			return result;
		});
	}

	async withTaskChanges<T>(operation: (changes: CommittedTaskChange[]) => Promise<T>): Promise<T> {
		return await this.taskMutations.withPostCommit(operation);
	}

	/**
	 * Resolve `--parent` against the working copy, the same corpus the parent filter and task reads
	 * use, so one ID cannot be an acceptable parent for a child that no task command can then show.
	 */
	async resolveParentTaskIdForCreate(parentTaskId: string): Promise<string> {
		const parentTask = await this.loadTaskById(parentTaskId);
		if (!parentTask) {
			throw new Error(
				`Parent task ${parentTaskId} not found. ${LOCAL_TASK_LOOKUP_HINT} Use an existing task ID with --parent; use --milestone to assign a task to a milestone.`,
			);
		}
		return parentTask.id;
	}

	async createTask(task: Task): Promise<string> {
		if (!task.status) {
			const config = await this.storage.loadConfig();
			task.status = config?.defaultStatus || FALLBACK_STATUS;
		}
		const config = await this.getConfig();
		task.worktreePolicy = config.sessionSettings.worktreePerTask ? "enabled" : "disabled";

		return await this.withTaskChanges(async (changes) => {
			const filepath = await this.writePreparedTask(task);
			changes.push({ task });
			return filepath;
		});
	}

	async updateTask(task: Task, changes?: CommittedTaskChange[]): Promise<string> {
		return await this.taskMutations.saveTask(task, changes);
	}

	async setTaskModeApproval(taskId: string, modeId: string): Promise<Task> {
		const { config, scope } = await resolveAgentConfiguration(this, taskId);
		return await this.taskMutations.setModeApproval(taskId, modeId, { config, scope });
	}

	async applyTaskUpdateInput(task: Task, input: TaskUpdateInput): Promise<{ task: Task; mutated: boolean }> {
		return await this.taskMutations.applyTaskUpdateInput(task, input);
	}

	async updateTaskFromInput(taskId: string, input: TaskUpdateInput, options: TaskReadOptions = {}): Promise<Task> {
		return await this.taskMutations.updateFromInput(taskId, input, options);
	}

	async editTask(taskId: string, input: TaskUpdateInput, options: TaskReadOptions = {}): Promise<Task> {
		return await this.updateTaskFromInput(taskId, input, options);
	}

	async markTaskDone(taskId: string, options: TaskReadOptions = {}): Promise<{ task: Task; changed: boolean }> {
		return await this.taskMutations.markDone(taskId, options);
	}

	private async writeBoardMoveTasksBulk(
		tasks: Task[],
		expectedTasks: Task[],
		movedIds: string[],
		moveMilestone: boolean,
	): Promise<void> {
		await this.withTaskChanges(async (changes) =>
			this.storage.withTaskLocks(tasks, async () => {
				const currentTasks: Task[] = [];
				for (const planned of tasks) {
					const current = await this.storage.loadTask(planned.id, { includeArchived: true });
					if (!current) throw new Error(`Task not found while applying board move: ${planned.id}`);
					const expected = expectedTasks.find((task) => taskIdsEqual(task.id, planned.id));
					if (
						!expected ||
						current.status !== expected.status ||
						current.ordinal !== expected.ordinal ||
						current.milestone !== expected.milestone
					)
						throw new Error(`Task ${planned.id} placement changed before board move; retry the operation.`);
					currentTasks.push(current);
				}
				for (const [index, current] of currentTasks.entries()) {
					const planned = tasks[index];
					if (!planned) continue;
					const moved = movedIds.some((id) => taskIdsEqual(id, current.id));
					const model = TaskModel.forUpdate(current);
					model.applyBoardPlacement({
						status: moved ? planned.status : current.status,
						ordinal: planned.ordinal,
						milestone: moved && moveMilestone ? planned.milestone : current.milestone,
					});
					const updated = model.serialize();
					await this.taskMutations.saveTask(updated, changes);
					tasks[index] = updated;
				}
			}),
		);
	}

	async updateTasksBulk(tasks: Task[]): Promise<void> {
		await this.withTaskChanges(async (changes) =>
			this.storage.withTaskLocks(tasks, async () => {
				for (const task of tasks) await this.taskMutations.saveTask(task, changes);
			}),
		);
	}

	/**
	 * Resolve the task ids of a board move against a freshly refreshed content store.
	 *
	 * Ids are trimmed and de-duplicated by normalized identity while keeping the caller's spelling so
	 * messages echo what was asked for. An identity that matches more than one file fails closed with
	 * the ambiguity error instead of picking a winner. An id the store does not know comes back as
	 * `task: null` with no error, because a gap means different things to different callers.
	 *
	 * The failure semantics stay with the callers on purpose: {@link reorderTask} raises the first
	 * problem and writes all or nothing, while {@link moveTasksToStatus} reports problems per task and
	 * moves the tasks that did resolve.
	 */
	private async resolveTasksForBoardMove(taskIds: readonly string[]): Promise<{
		store: TaskCollection;
		resolutions: Array<{ taskId: string; task: Task | null; ambiguity: AmbiguousTaskIdError | null }>;
	}> {
		const requestedIds: string[] = [];
		const seen = new Set<string>();
		for (const rawId of taskIds) {
			const trimmed = String(rawId || "").trim();
			if (!trimmed) continue;
			const key = trimmed.toUpperCase();
			if (seen.has(key)) continue;
			seen.add(key);
			requestedIds.push(trimmed);
		}

		const corpus = await this.loadTaskSnapshot();
		const store: TaskCollection = {
			getTasks: (filter?: TaskListFilter) => TaskSearchIndex.apply(corpus.tasks, filter ?? {}),
			resolveTaskForMutation: (id) => corpus.identityIndex.resolveForMutation(id),
		};

		const resolutions = requestedIds.map((taskId) => {
			const resolution = store.resolveTaskForMutation(taskId);
			if (resolution.status === "ambiguous") {
				return { taskId, task: null, ambiguity: new AmbiguousTaskIdError(taskId, resolution.candidates) };
			}
			return { taskId, task: resolution.status === "found" ? resolution.task : null, ambiguity: null };
		});

		return { store, resolutions };
	}

	async reorderTask(params: {
		taskId: string;
		targetStatus: string;
		orderedTaskIds: string[];
		targetMilestone?: string | null;
		defaultStep?: number;
	}): Promise<{ updatedTask: Task; changedTasks: Task[] }> {
		const taskId = String(params.taskId || "").trim();
		const targetStatus = String(params.targetStatus || "");
		const orderedTaskIds = params.orderedTaskIds.map((id) => String(id || "").trim()).filter(Boolean);
		const defaultStep = params.defaultStep ?? DEFAULT_ORDINAL_STEP;

		if (!taskId) throw new Error("taskId is required");
		if (!targetStatus.trim()) throw new Error("targetStatus is required");
		if (orderedTaskIds.length === 0) throw new Error("orderedTaskIds must include at least one task");
		if (!orderedTaskIds.some((id) => taskIdsEqual(id, taskId))) {
			throw new Error("orderedTaskIds must include the task being moved");
		}

		// A repeated id means the caller sent a corrupt ordering, so reject it rather than let the
		// shared resolver quietly drop it and reorder the column into an order nobody asked for.
		const seen = new Set<string>();
		for (const id of orderedTaskIds) {
			if (seen.has(id.toUpperCase())) {
				throw new Error(`Duplicate task id ${id} in orderedTaskIds`);
			}
			seen.add(id.toUpperCase());
		}

		const { resolutions } = await this.resolveTasksForBoardMove(orderedTaskIds);
		for (const resolution of resolutions) {
			if (resolution.ambiguity) throw resolution.ambiguity;
		}

		// Tasks that couldn't be loaded (may have been moved/deleted) drop out of the ordering
		const validTasks = resolutions.map((resolution) => resolution.task).filter((t): t is Task => t !== null);

		const movedTask = validTasks.find((task) => taskIdsEqual(task.id, taskId));
		if (!movedTask) throw new Error(`Task ${taskId} not found while reordering`);
		const targetMilestone = await this.resolveTargetMilestone(params.targetMilestone);
		const configuration = await this.storage.loadConfig();
		TaskModel.forUpdate(movedTask).applyUpdate(
			{ status: targetStatus },
			{ configuration, projectConfigPath: this.storage.configFilePath },
		);

		// Reject reordering tasks from other branches - they can only be modified in their source branch
		const crossBranchReason = crossBranchMoveReason(movedTask, "reordered");
		if (crossBranchReason) {
			throw new Error(crossBranchReason);
		}

		const { updatedTask, changedTasks } = planTaskReorder(
			taskId,
			targetStatus,
			orderedTaskIds,
			validTasks,
			targetMilestone,
			params.targetMilestone !== undefined,
			defaultStep,
		);

		if (changedTasks.length > 0) {
			await this.writeBoardMoveTasksBulk(changedTasks, validTasks, [taskId], params.targetMilestone !== undefined);
		}

		return { updatedTask: changedTasks.find((task) => taskIdsEqual(task.id, taskId)) ?? updatedTask, changedTasks };
	}

	/**
	 * Move a set of tasks into a status column, reporting problems per task instead of aborting the
	 * batch. Without `orderedTaskIds` the moved tasks append to the end of the column. With it, the
	 * caller names the column's final order and the moved tasks land exactly there, seeded with
	 * block ordinals the way {@link reorderTask} places a single task.
	 */
	async moveTasksToStatus(params: {
		taskIds: string[];
		targetStatus: string;
		orderedTaskIds?: string[];
		targetMilestone?: string | null;
		defaultStep?: number;
	}): Promise<{ movedTasks: Task[]; changedTasks: Task[]; failures: Array<{ taskId: string; reason: string }> }> {
		const targetStatus = String(params.targetStatus || "");
		if (!targetStatus.trim()) throw new Error("targetStatus is required");
		const targetMilestone = await this.resolveTargetMilestone(params.targetMilestone);
		const plan = await this.planTasksToStatus(params, targetStatus, targetMilestone);

		if (plan.changedTasks.length > 0) {
			await this.writeBoardMoveTasksBulk(
				plan.changedTasks,
				plan.expectedTasks,
				params.taskIds,
				params.targetMilestone !== undefined,
			);
		}

		const committedById = new Map(plan.changedTasks.map((task) => [taskIdKey(task.id), task]));
		return {
			movedTasks: plan.movedTasks.map((task) => committedById.get(taskIdKey(task.id)) ?? task),
			changedTasks: plan.changedTasks,
			failures: plan.failures,
		};
	}

	private async planTasksToStatus(
		params: Parameters<Core["moveTasksToStatus"]>[0],
		targetStatus: string,
		targetMilestone: string | undefined,
	): Promise<MoveTasksPlan> {
		const configuration = await this.storage.loadConfig();
		const { store, resolutions } = await this.resolveTasksForBoardMove(params.taskIds);
		if (resolutions.length === 0) throw new Error("taskIds must include at least one task");

		const failures: Array<{ taskId: string; reason: string }> = [];
		const tasksToMove: Task[] = [];
		for (const { taskId, task, ambiguity } of resolutions) {
			if (ambiguity) failures.push({ taskId, reason: ambiguity.message });
			else if (!task) failures.push({ taskId, reason: `Task ${taskId} not found.` });
			else {
				const crossBranchReason = crossBranchMoveReason(task, "moved");
				if (crossBranchReason) failures.push({ taskId, reason: crossBranchReason });
				else {
					try {
						TaskModel.forUpdate(task).applyUpdate(
							{ status: targetStatus },
							{ configuration, projectConfigPath: this.storage.configFilePath },
						);
						tasksToMove.push(task);
					} catch (error) {
						failures.push({ taskId, reason: error instanceof Error ? error.message : "Invalid target status." });
					}
				}
			}
		}
		if (tasksToMove.length === 0) return { movedTasks: [], changedTasks: [], failures, expectedTasks: [] };

		const hasTargetMilestone = params.targetMilestone !== undefined;
		const applyMove = (task: Task): Task => {
			const model = TaskModel.forUpdate(task);
			model.applyBoardPlacement({
				status: targetStatus,
				ordinal: task.ordinal,
				milestone: hasTargetMilestone ? targetMilestone : task.milestone,
			});
			return model.serialize();
		};
		const placement = params.orderedTaskIds
			? this.planOrderedTaskMove(
					store,
					params.orderedTaskIds,
					tasksToMove,
					failures,
					applyMove,
					params.defaultStep ?? DEFAULT_ORDINAL_STEP,
				)
			: this.planAppendedTaskMove(
					store,
					targetStatus,
					tasksToMove,
					applyMove,
					hasTargetMilestone,
					targetMilestone,
					params.defaultStep ?? DEFAULT_ORDINAL_STEP,
				);
		return {
			...placement,
			failures,
			expectedTasks: store.getTasks(),
			changedTasks: placement.changedTasks.filter((task) => !task.branch),
		};
	}

	private planOrderedTaskMove(
		store: TaskCollection,
		orderedTaskIds: string[],
		tasksToMove: Task[],
		failures: Array<{ taskId: string; reason: string }>,
		applyMove: (task: Task) => Task,
		defaultStep: number,
	): MoveTaskPlacement {
		const { tasksInOrder, originalTasks, requiresRebalance } = planOrderedTaskPlacement({
			resolver: store,
			orderedTaskIds,
			tasksToMove,
			failures,
			applyMove,
			defaultStep,
		});
		const originals = new Map([...originalTasks, ...tasksToMove].map((task) => [taskIdKey(task.id), task]));
		const placement = reconcileBoardPlacement(tasksInOrder, [...originals.values()], defaultStep, requiresRebalance);
		return {
			movedTasks: tasksToMove.map(
				(task) => placement.tasks.find((placed) => taskIdsEqual(placed.id, task.id)) ?? applyMove(task),
			),
			changedTasks: placement.changedTasks,
		};
	}

	private planAppendedTaskMove(
		store: TaskCollection,
		targetStatus: string,
		tasksToMove: Task[],
		applyMove: (task: Task) => Task,
		hasTargetMilestone: boolean,
		targetMilestone: string | undefined,
		defaultStep: number,
	): MoveTaskPlacement {
		const stayingIds = new Set(
			tasksToMove.filter((task) => task.status === targetStatus).map((task) => task.id.toUpperCase()),
		);
		const arriving = tasksToMove.filter((task) => !stayingIds.has(task.id.toUpperCase()));
		if (arriving.length === 0) {
			const movedTasks = tasksToMove.map(applyMove);
			return {
				movedTasks,
				changedTasks: movedTasks.filter((task, index) => {
					const original = tasksToMove[index];
					return !original || original.status !== task.status || (original.milestone ?? "") !== (task.milestone ?? "");
				}),
			};
		}

		const movedIds = new Set(tasksToMove.map((task) => task.id.toUpperCase()));
		const sanitizeOrdinal = (task: Task): Task => {
			if (task.ordinal === undefined || Number.isFinite(task.ordinal)) return task;
			const model = TaskModel.forUpdate(task);
			model.applyBoardPlacement({ status: task.status, ordinal: undefined, milestone: task.milestone });
			return model.serialize();
		};
		const inTargetLane = (task: Task): boolean =>
			!hasTargetMilestone || (task.milestone ?? "") === (targetMilestone ?? "");
		const columnTasks = TaskOrdering.byOrdinal(
			store
				.getTasks({ status: targetStatus })
				.filter((task) =>
					stayingIds.has(task.id.toUpperCase()) ? true : !movedIds.has(task.id.toUpperCase()) && inTargetLane(task),
				)
				.map(sanitizeOrdinal),
		);
		const tasksInOrder = [
			...columnTasks.map((task) => (stayingIds.has(task.id.toUpperCase()) ? applyMove(task) : task)),
			...arriving.map((task) => {
				const moved = applyMove(task);
				const model = TaskModel.forUpdate(moved);
				model.applyBoardPlacement({ status: targetStatus, ordinal: undefined, milestone: moved.milestone });
				return model.serialize();
			}),
		];
		const originals = new Map(
			[...store.getTasks({ status: targetStatus }), ...tasksToMove].map((task) => [taskIdKey(task.id), task]),
		);
		const placement = reconcileBoardPlacement(tasksInOrder, [...originals.values()], defaultStep);
		return {
			movedTasks: tasksToMove.map(
				(task) => placement.tasks.find((placed) => taskIdsEqual(placed.id, task.id)) ?? applyMove(task),
			),
			changedTasks: placement.changedTasks,
		};
	}

	private async resolveTargetMilestone(targetMilestone: string | null | undefined): Promise<string | undefined> {
		if (targetMilestone === undefined || targetMilestone === null || targetMilestone.trim() === "") return undefined;
		return requireMilestoneId(targetMilestone, await this.storage.loadMilestones());
	}

	async archiveTask(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.taskLifecycle.archive(taskId, options);
	}

	async deleteTask(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.taskLifecycle.delete(taskId, options);
	}

	async archiveMilestone(
		identifier: string,
	): Promise<{ success: boolean; sourcePath?: string; targetPath?: string; milestone?: Milestone }> {
		await this.storage.loadConfig();
		return await this.storage.archiveMilestone(identifier);
	}

	async renameMilestone(
		identifier: string,
		title: string,
		dueDate?: string | null,
	): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
		previousTitle?: string;
		previousDueDate?: string;
	}> {
		await this.storage.loadConfig();
		return await this.storage.renameMilestone(identifier, title, dueDate);
	}

	async completeTask(taskId: string, options: TaskReadOptions = {}): Promise<boolean> {
		return await this.taskLifecycle.complete(taskId, options);
	}

	async getTerminalStatusTasksByAge(olderThanDays: number): Promise<Task[]> {
		return await this.taskLifecycle.getTerminalStatusTasksByAge(olderThanDays);
	}

	/**
	 * Load and process all tasks with the same logic as CLI overview
	 * This method extracts the common task loading logic for reuse
	 */
	async loadAllTasksForStatistics(): Promise<{ tasks: Task[]; statuses: string[]; priorities: string[] }> {
		const snapshot = await this.loadTaskSnapshot();
		const config = snapshot.config;
		const statuses = (config?.statuses || DEFAULT_STATUSES) as string[];
		const priorities = config?.priorities ?? [];
		if (!snapshot.identityIndex) throw new Error("Task corpus identity index was not initialized");
		const tasks = snapshot.identityIndex.getTasks(true);

		return { tasks, statuses: statuses as string[], priorities };
	}

	async loadTasks(
		_progressCallback?: (msg: string) => void,
		_abortSignal?: AbortSignal,
		options?: { includeCompleted?: boolean },
	): Promise<Task[]> {
		const snapshot = await this.loadTaskSnapshot();
		return options?.includeCompleted ? snapshot.identityIndex.getTasks(true) : snapshot.tasks;
	}

	/** Raw stored configuration for diagnostics; not the resolved agent configuration. */
	async getStoredConfig() {
		return await this.storage.loadConfig();
	}

	/** Project root used to locate runtime resources; workspace records stay behind Storage. */
	get projectRoot(): string {
		return this.storage.projectRoot;
	}

	/** Configured project config file location, for diagnostics and config bootstrap. */
	get projectConfigPath(): string {
		return this.storage.configFilePath;
	}

	/** Workspace directory used to locate runtime stores; not a record path. */
	get workspaceDirectory(): string {
		return this.storage.workspaceDirectoryPath;
	}

	async loadProjectTaskIds(): Promise<string[]> {
		return await this.storage.loadProjectTaskIds();
	}

	async findTaskRecordPath(taskId: string): Promise<string | null> {
		return await this.storage.findTaskRecordPath(taskId);
	}

	async loadCompletedTaskRecords(): Promise<Task[]> {
		return await this.storage.loadCompletedTasks();
	}

	async loadArchivedTaskRecords(): Promise<Task[]> {
		return await this.storage.loadArchivedTasks();
	}

	async withTaskLock<T>(task: Pick<Task, "id" | "filePath">, fn: () => Promise<T>): Promise<T> {
		return await this.storage.withTaskLock(task, fn);
	}

	async listTaskArtifacts(taskId: string) {
		return await this.storage.taskArtifacts.list(taskId);
	}

	async readTaskArtifact(taskId: string, path: string): Promise<Uint8Array> {
		return await this.storage.taskArtifacts.read(taskId, path);
	}

	async writeTaskArtifact(taskId: string, path: string, bytes: Uint8Array): Promise<void> {
		await this.storage.taskArtifacts.write(taskId, path, bytes);
	}

	watchTasks(callbacks: TaskWatcherCallbacks, initialTasks: readonly Task[] = []) {
		return watchTaskRecords(this.storage, callbacks, initialTasks);
	}

	watchConfig(callbacks: ConfigWatcherCallbacks) {
		return this.storage.watchConfig(callbacks);
	}

	/** Stored task records, including damaged records that listing skips. */
	async scanStoredTaskRecords() {
		return await this.storage.scanTaskRecords();
	}

	/** Project-relative path for a stored record, used in diagnostics. */
	projectRelativePath(filePath: string): string {
		return this.storage.projectRelativePath(filePath);
	}

	async saveWorkspaceConfig(config: Parameters<Storage["saveConfig"]>[0]): Promise<void> {
		await this.storage.saveConfig(config);
	}

	async initializeWorkspaceFiles(
		config: Parameters<Storage["saveConfig"]>[0],
		selection: Parameters<Storage["initializeWorkspace"]>[1],
	): Promise<void> {
		await this.storage.initializeWorkspace(config, selection);
	}

	async prepareCreatedTaskWrite(filePath: string): Promise<CreatedTaskWrite> {
		return await this.storage.prepareCreatedTaskWrite(filePath);
	}

	async loadStoredTasks(): Promise<Task[]> {
		return await this.storage.loadTasks();
	}

	async loadMilestones(): Promise<Milestone[]> {
		return await this.storage.loadMilestones();
	}

	async loadArchivedMilestones(): Promise<Milestone[]> {
		return await this.storage.loadArchivedMilestones();
	}
}

/**
 * Builds a Core bound to the project every interface resolves the same way: the runtime working
 * directory (`--cwd`/`AGENTIC_WORKSPACE_CWD`, else `process.cwd()`), then walked up to the project root just
 * like the CLI commands do. When no project is found the resolved directory is used as-is, so
 * callers keep degrading to their own fallbacks instead of failing.
 * Prefer passing an existing Core; use this only where no instance is available.
 */
export async function createRuntimeCore(): Promise<Core> {
	const { cwd } = await resolveRuntimeCwd();
	return new Core((await findAgenticWorkspaceRoot(cwd)) ?? cwd);
}
