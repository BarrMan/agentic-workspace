import { GitOperations } from "../filesystem/git/operations.ts";
import { ensureTaskWorktree, taskWorktreePath } from "../filesystem/git/task-worktree.ts";
import { findAgenticWorkspaceRoot } from "../filesystem/paths/find-root.ts";
import { resolveRuntimeCwd } from "../lib/runtime-cwd.ts";
import { DEFAULT_STATUSES } from "../model/constants.ts";
import { TaskCollectionFilterError } from "../model/errors/task-collection.ts";
import { Config, removeAgentPreset as removeExactAgentPreset } from "../model/session/config.ts";
import type { Session } from "../model/session/session.ts";
import type {
	AgentConfiguration,
	AgentSession,
	ModeId,
	ModeProfile,
	SessionAskContext,
	SessionFactory,
	SessionLaunchContext,
	SessionSnapshot,
} from "../model/session/types.ts";
import { requireMilestoneId } from "../model/task/milestones.ts";
import { formatValidPriorityValues, resolvePriorityLabel } from "../model/task/priority-config.ts";
import {
	DEFAULT_ORDINAL_STEP,
	planAppendedTaskPlacement,
	planOrderedTaskPlacement,
	planTaskReorder,
} from "../model/task/reorder.ts";
import { formatValidStatuses, getCanonicalStatuses } from "../model/task/status.ts";
import type { SessionCreationIdentity, SessionCreationInputs, Task as TaskModel } from "../model/task/task.ts";
import { TaskCollection as TaskCollectionModel } from "../model/task/task-collection.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../model/task/task-path.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import type { SearchResult, Task, TaskListFilter } from "../model/types.ts";
import { getBuiltInAgentConfiguration, updateStoredAgentConfiguration } from "../storage/config.ts";
import { isConfigValueError } from "../storage/config-codec.ts";
import type { SessionStore } from "../storage/session-store.ts";
import { Storage } from "../storage/storage.ts";
import {
	loadAgentConfiguration,
	loadProjectModeCatalog,
	patchAgentConfiguration,
	resolveAgentConfiguration,
	updateAgentConfiguration,
} from "./agent-configuration.ts";
import { CallingSessionOperations } from "./calling-session.ts";
import { ModeDeletionWorkflow } from "./mode-deletion.ts";
import { type PersistentSearchOptions, searchSnapshot } from "./search-service.ts";
import { Signals } from "./signals.ts";
import type { TaskReadOptions } from "./task-query-workflow.ts";
import { TasksService } from "./tasks-service.ts";
import { VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";
import { WorkspaceStateService } from "./workspace-state.ts";

export interface ObservedSession {
	readonly record: AgentSession;
	readonly snapshot: SessionSnapshot;
}

export interface PreparedCoreSessionStop {
	readonly record: AgentSession;
	stop(): Promise<void>;
	release(): Promise<void>;
}

export interface SessionAttachmentContext {
	readonly record: AgentSession;
	readonly snapshot: SessionSnapshot;
	readonly ownedByThisApplication: boolean;
}

export interface ProjectSessionInventory {
	readonly taskId: string;
	readonly sessions: readonly ObservedSession[];
}

interface MoveTasksPlan {
	readonly expectedTasks: Task[];
	readonly movedTasks: Task[];
	readonly changedTasks: Task[];
	readonly failures: Array<{ taskId: string; reason: string }>;
}

export type { TaskReadOptions } from "./task-query-workflow.ts";

export type TaskCollectionFilterInput = {
	status?: string;
	excludeStatus?: string[];
	priority?: string;
	labels?: string[];
};

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
	readonly store: SessionStore;
	readonly callingSession: CallingSessionOperations;
	readonly workspaceState: WorkspaceStateService;
	private readonly vacatedTaskReferences: VacatedTaskReferenceService;
	readonly modeDeletion: ModeDeletionWorkflow;
	private readonly sessionFactory?: SessionFactory;
	private readonly maxSessions: number;
	private readonly sessions = new Map<string, Session>();
	readonly tasks: TasksService;
	private readonly launches = new Set<Promise<ObservedSession>>();
	private closing = false;
	private shutdownOperation?: Promise<void>;
	readonly storage: Storage;
	private configSnapshot?: Promise<Config>;

	constructor(
		projectRoot: string,
		options: { storage?: Storage; sessionFactory?: SessionFactory; maxSessions?: number; stateRoot?: string } = {},
	) {
		this.storage =
			options.storage ??
			Storage.open(projectRoot, options.stateRoot !== undefined ? { stateRoot: options.stateRoot } : {});
		this.store = this.storage.sessionStore();
		this.sessionFactory = options.sessionFactory;
		this.maxSessions = options.maxSessions ?? 10;
		this.configSnapshot = Config.load(this.storage, getBuiltInAgentConfiguration());
		void this.configSnapshot.catch(() => undefined);
		this.git = new GitOperations(projectRoot, null, () => this.storage.loadConfig());
		this.vacatedTaskReferences = new VacatedTaskReferenceService(this.storage);
		this.tasks = new TasksService(
			this.storage,
			this.sessionFactory,
			(taskId, sessionId) => this.sessions.get(this.sessionKey(taskId, sessionId)),
			() => this.getActiveAndCompletedTaskIds(),
			(task) => this.signals.publish("TasksChanged", task),
			this.vacatedTaskReferences,
			{
				cleanupSessions: async (taskId) => await this.cleanupTaskSessions(taskId),
				forgetSessions: async (taskId) => await this.forgetTaskSessions(taskId),
			},
			(parentTaskId) => this.resolveParentTaskIdForCreate(parentTaskId),
			(ordinal) => this.resolveCreateOrdinal(ordinal),
			async () => ((await this.getConfig()).sessionSettings.worktreePerTask ? "enabled" : "disabled"),
		);
		this.modeDeletion = new ModeDeletionWorkflow(this.storage, this);
		this.callingSession = new CallingSessionOperations(
			(taskId) => this.store.read(taskId),
			(taskId, modeId, question) => this.askPrevious(taskId, modeId, question),
			(modeId, modelId) => this.setModeModel(modeId, modelId),
		);
		this.workspaceState = new WorkspaceStateService(this);
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
			(configuration) => removeExactAgentPreset(configuration, name),
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

	private async cleanupTaskSessions(taskId: string): Promise<void> {
		const prepared = await this.prepareTaskStop(taskId);
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

	async resolveCreateOrdinal(inputOrdinal: number | undefined): Promise<number | undefined> {
		if (typeof inputOrdinal === "number") {
			return inputOrdinal;
		}
		const tasks = this.tasks.getActiveTasks();
		const ordinals = tasks
			.map((task) => task.ordinal)
			.filter((ordinal): ordinal is number => typeof ordinal === "number" && Number.isFinite(ordinal));

		if (ordinals.length === 0) {
			return tasks.length === 0 ? DEFAULT_ORDINAL_STEP : undefined;
		}

		return Math.max(...ordinals) + DEFAULT_ORDINAL_STEP;
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
			!options.types || options.types.includes("task") ? await this.tasks.searchTasks(options.includeArchived) : [];
		const searchableTasks = tasks.length ? await this.storage.addSearchableArtifactText(tasks) : tasks;
		return searchSnapshot(searchableTasks, options);
	}

	async getTaskWithSubtasks(taskId: string, localTasks?: Task[], options: TaskReadOptions = {}): Promise<Task | null> {
		const task = await this.tasks.getTask(taskId, options);
		return task ? new TaskCollectionModel(localTasks ?? this.tasks.getActiveTasks()).withSubtaskSummaries(task) : null;
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
	/**
	 * Gets all task IDs that are in use (active or completed) across all branches.
	 * Respects cross-branch config settings. Archived IDs are excluded (can be reused).
	 *
	 * This is used for ID generation to determine the next available ID.
	 */
	private async getActiveAndCompletedTaskIds(): Promise<string[]> {
		return this.tasks.getTasks().map((task) => task.id);
	}

	/**
	 * Resolve `--parent` against the working copy, the same corpus the parent filter and task reads
	 * use, so one ID cannot be an acceptable parent for a child that no task command can then show.
	 */
	async resolveParentTaskIdForCreate(parentTaskId: string): Promise<string> {
		const parentTask = await this.tasks.getTask(parentTaskId);
		if (!parentTask) {
			throw new Error(
				`Parent task ${parentTaskId} not found. ${LOCAL_TASK_LOOKUP_HINT} Use an existing task ID with --parent; use --milestone to assign a task to a milestone.`,
			);
		}
		return parentTask.id;
	}

	async setTaskModeApproval(taskId: string, modeId: string): Promise<Task> {
		const { config, scope } = await resolveAgentConfiguration(this, taskId);
		return await this.tasks.setModeApproval(taskId, modeId, { config, scope });
	}

	async reorderTask(params: {
		taskId: string;
		targetStatus: string;
		orderedTaskIds: string[];
		targetMilestone?: string | null;
		defaultStep?: number;
	}): Promise<{ updatedTask: Task; changedTasks: Task[] }> {
		const taskId = params.taskId;
		const targetStatus = String(params.targetStatus || "");
		const orderedTaskIds = params.orderedTaskIds;
		const defaultStep = params.defaultStep ?? DEFAULT_ORDINAL_STEP;

		if (!taskId) throw new Error("taskId is required");
		if (!targetStatus.trim()) throw new Error("targetStatus is required");
		if (orderedTaskIds.length === 0) throw new Error("orderedTaskIds must include at least one task");
		if (!orderedTaskIds.includes(taskId)) {
			throw new Error("orderedTaskIds must include the task being moved");
		}

		// A repeated id means the caller sent a corrupt ordering, so reject it rather than let the
		// shared resolver quietly drop it and reorder the column into an order nobody asked for.
		const seen = new Set<string>();
		for (const id of orderedTaskIds) {
			if (seen.has(id)) {
				throw new Error(`Duplicate task id ${id} in orderedTaskIds`);
			}
			seen.add(id);
		}

		// Tasks that couldn't be loaded (may have been moved/deleted) drop out of the ordering
		const activeTasks = this.tasks.getActiveTasks();
		const validTasks = orderedTaskIds.flatMap((id) => activeTasks.filter((task) => task.id === id));

		const movedTask = validTasks.find((task) => task.id === taskId);
		if (!movedTask) throw new Error(`Task ${taskId} not found while reordering`);
		const targetMilestone = await this.resolveTargetMilestone(params.targetMilestone);

		// Reject reordering tasks from other branches - they can only be modified in their source branch
		const crossBranchReason = crossBranchMoveReason(movedTask, "reordered");
		if (crossBranchReason) {
			throw new Error(crossBranchReason);
		}

		const { updatedTask, changedTasks } = planTaskReorder({
			taskId,
			targetStatus,
			orderedTaskIds,
			validTasks,
			targetMilestone,
			hasTargetMilestone: params.targetMilestone !== undefined,
			defaultStep,
		});

		if (changedTasks.length > 0) {
			await this.tasks.writeBoardMoveTasksBulk(
				changedTasks,
				validTasks,
				[taskId],
				params.targetMilestone !== undefined,
			);
		}

		return { updatedTask: changedTasks.find((task) => task.id === taskId) ?? updatedTask, changedTasks };
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
			await this.tasks.writeBoardMoveTasksBulk(
				plan.changedTasks,
				plan.expectedTasks,
				params.taskIds,
				params.targetMilestone !== undefined,
			);
		}

		const committedById = new Map(plan.changedTasks.map((task) => [task.id, task]));
		return {
			movedTasks: plan.movedTasks.map((task) => committedById.get(task.id) ?? task),
			changedTasks: plan.changedTasks,
			failures: plan.failures,
		};
	}

	private async planTasksToStatus(
		params: Parameters<Core["moveTasksToStatus"]>[0],
		targetStatus: string,
		targetMilestone: string | undefined,
	): Promise<MoveTasksPlan> {
		const tasks = this.tasks.getActiveTasks();
		const taskIds = [...new Set(params.taskIds)];
		if (taskIds.length === 0) throw new Error("taskIds must include at least one task");

		const failures: Array<{ taskId: string; reason: string }> = [];
		const tasksToMove: Task[] = [];
		for (const taskId of taskIds) {
			const task = tasks.find((task) => task.id === taskId);
			if (!task) failures.push({ taskId, reason: `Task ${taskId} not found.` });
			else {
				const crossBranchReason = crossBranchMoveReason(task, "moved");
				if (crossBranchReason) failures.push({ taskId, reason: crossBranchReason });
				else {
					try {
						tasksToMove.push(task);
					} catch (error) {
						failures.push({ taskId, reason: error instanceof Error ? error.message : "Invalid target status." });
					}
				}
			}
		}
		if (tasksToMove.length === 0) return { movedTasks: [], changedTasks: [], failures, expectedTasks: [] };

		const options = {
			targetStatus,
			targetMilestone,
			hasTargetMilestone: params.targetMilestone !== undefined,
			defaultStep: params.defaultStep ?? DEFAULT_ORDINAL_STEP,
		};
		const placement = params.orderedTaskIds
			? (() => {
					const movedById = new Map(tasksToMove.map((task) => [task.id, task]));
					const failedIds = new Set(failures.map((failure) => failure.taskId));
					const seen = new Set<string>();
					const rows = params.orderedTaskIds.flatMap((id) => {
						const key = id;
						if (seen.has(key)) throw new Error(`Duplicate task ID in orderedTaskIds: ${id}`);
						seen.add(key);
						if (failedIds.has(key)) return [];
						const moved = movedById.get(key);
						if (moved) return [{ task: moved, moved: true }];
						const task = tasks.find((task) => task.id === id);
						return task ? [{ task, moved: false }] : [];
					});
					return planOrderedTaskPlacement(rows, tasksToMove, options);
				})()
			: planAppendedTaskPlacement(TaskSearchIndex.apply(tasks, { status: targetStatus }), tasksToMove, options);
		return {
			...placement,
			failures,
			expectedTasks: tasks,
			changedTasks: placement.changedTasks.filter((task) => !task.branch),
		};
	}

	private async resolveTargetMilestone(targetMilestone: string | null | undefined): Promise<string | undefined> {
		if (targetMilestone === undefined || targetMilestone === null || targetMilestone.trim() === "") return undefined;
		return requireMilestoneId(targetMilestone, await this.storage.loadMilestones());
	}

	/**
	 * Load and process all tasks with the same logic as CLI overview
	 * This method extracts the common task loading logic for reuse
	 */
	async loadAllTasksForStatistics(): Promise<{ tasks: Task[]; statuses: string[]; priorities: string[] }> {
		const config = await this.storage.loadConfig();
		const statuses = (config?.statuses || DEFAULT_STATUSES) as string[];
		const priorities = config?.priorities ?? [];
		const tasks = [...this.tasks.getActiveTasks(), ...this.tasks.getCompletedTasks()];

		return { tasks, statuses: statuses as string[], priorities };
	}

	async loadTasks(
		_progressCallback?: (msg: string) => void,
		_abortSignal?: AbortSignal,
		options?: { includeCompleted?: boolean },
	): Promise<Task[]> {
		return options?.includeCompleted
			? [...this.tasks.getActiveTasks(), ...this.tasks.getCompletedTasks()]
			: this.tasks.getActiveTasks();
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

	newSession(task: Task, modeId?: ModeId, presetName?: string): Promise<ObservedSession> {
		return this.trackLaunch(async () => {
			const session = await this.storage.withTaskLock(
				task.id,
				async (current) => await this.createSession(current, modeId, presetName),
			);
			await this.enforceSessionLimit(session.record);
			return session;
		});
	}

	private async createSession(
		currentTask: Task,
		modeId?: ModeId,
		presetName?: string,
		activate = true,
	): Promise<ObservedSession> {
		this.requireSessionFactory();
		const taskId = currentTask.id;
		const taskRecord = await this.tasks.coordinateTaskStatus(currentTask);
		const resolved = await resolveAgentConfiguration(this, taskId);
		const catalog = await loadProjectModeCatalog(this);
		const selectedMode = modeId ?? catalog.defaultModeId;
		const mode = catalog.profiles[selectedMode];
		if (!mode) throw new Error(`Unknown mode '${selectedMode}'.`);
		const presetNameResolved = presetName ?? resolved.config.selectedPreset;
		const preset = resolved.config.presets[presetNameResolved];
		if (!preset) throw new Error(`Agent preset not found: ${presetNameResolved}`);
		const inputs = await this.prepareSession(taskRecord, presetNameResolved, resolved.config.sessions.worktreePerTask);
		let session!: Session;
		let ownerTask!: TaskModel;
		let creation: SessionCreationIdentity | undefined;
		let release: (() => Promise<void>) | undefined;
		let startEntered = false;
		let primary: unknown;
		try {
			ownerTask = this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
			const reserved = ownerTask.createSession(selectedMode, inputs, this.requireSessionFactory(), activate);
			session = reserved.session;
			creation = reserved.creation;
			await this.store.reserveSession(taskId, selectedMode, { ...session.record }, activate ? session.id : undefined);
			release = await this.store.claimSession(taskId, session.id);
			this.sessions.set(this.sessionKey(taskId, session.id), session);
			startEntered = true;
			await session.start(this.createLaunchContext(taskRecord, session.record, selectedMode, resolved, preset, mode));
			await this.publishSession(session);
			return this.sessionView(session);
		} catch (error) {
			primary = error;
			if (creation) {
				try {
					await this.settleFailedCreation(ownerTask, session, creation, error, startEntered);
				} catch (settlementError) {
					primary = settlementError;
					throw settlementError;
				}
			}
			throw error;
		} finally {
			if (release) await this.releaseSessionClaim(release, primary);
		}
	}

	resumeSession(taskId: string, sessionId: string): Promise<ObservedSession> {
		return this.trackLaunch(async () => {
			const session = await this.resumeRetainedSession(taskId, sessionId);
			await this.enforceSessionLimit(session.record);
			return session;
		});
	}

	private async resumeRetainedSession(taskId: string, sessionId: string): Promise<ObservedSession> {
		this.requireSessionFactory();
		return await this.storage.withTaskLock(taskId, async (taskRecord) => {
			const release = await this.store.claimSession(taskId, sessionId);
			let primary: unknown;
			let session: Session | undefined;
			try {
				const { record, modeId } = await this.requireSessionRecord(taskId, sessionId);
				if ((await this.readObserved(taskId, sessionId)).snapshot.state !== "stopped")
					throw new Error(`Session ${sessionId} is not positively stopped; refusing resume.`);
				if (!record.nativeSessionId)
					throw new Error(`Session ${sessionId} has no exact native conversation identity to resume.`);
				const resolved = await resolveAgentConfiguration(this, taskId);
				const catalog = await loadProjectModeCatalog(this);
				const preset = resolved.config.presets[record.preset];
				if (!preset) throw new Error(`Agent preset not found for existing session: ${record.preset}`);
				const profile = catalog.profiles[modeId];
				if (!profile) throw new Error(`Unknown mode '${modeId}'.`);
				const model = this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
				session = model.findSession(sessionId);
				if (!session) throw new Error(`Agent session not found: ${sessionId}`);
				await session.resume(this.createLaunchContext(taskRecord, record, modeId, resolved, preset, profile));
				this.sessions.set(this.sessionKey(taskId, sessionId), session);
				await this.publishSession(session);
				return this.sessionView(session);
			} catch (error) {
				primary = error;
				try {
					if (session) await this.settleFailedResume(session, error);
				} catch (settlementError) {
					primary = settlementError;
					throw settlementError;
				}
				throw error;
			} finally {
				await this.releaseSessionClaim(release, primary);
			}
		});
	}

	async handoff(task: Task, predecessorSessionId: string, modeId?: ModeId): Promise<ObservedSession> {
		return this.trackLaunch(async () => {
			const successor = await this.storage.withTaskLock(task.id, async (current) => {
				const successor = await this.createSession(current, modeId, undefined, false);
				const model = this.tasks.get(task.id);
				const successorSession = model?.findSession(successor.record.id);
				if (!model || !successorSession) throw new Error(`Successor task model not found: ${task.id}`);
				const selectedMode = successorSession.modeId;
				await this.store.selectSession(task.id, selectedMode, successor.record.id);
				model.selectSession(selectedMode, successor.record.id);
				try {
					if (this.sessions.has(this.sessionKey(task.id, predecessorSessionId)))
						await this.stopSessionBody(current, predecessorSessionId);
				} catch (error) {
					throw new AggregateError(
						[error],
						"Successor was published and selected, but predecessor retirement failed.",
						{
							cause: error,
						},
					);
				}
				return successor;
			});
			await this.enforceSessionLimit(successor.record);
			return successor;
		});
	}

	async prepareStop(taskId: string, sessionId: string): Promise<PreparedCoreSessionStop> {
		this.requireSessionFactory();
		const releaseClaim = await this.store.claimSession(taskId, sessionId);
		let released = false;
		const release = async () => {
			if (released) return;
			released = true;
			await releaseClaim();
		};
		try {
			const { record, modeId } = await this.requireSessionRecord(taskId, sessionId);
			await this.readObserved(taskId, sessionId);
			const session = this.tasks.findSession(taskId, sessionId);
			if (!session || session.modeId !== modeId)
				throw new Error(`Session ${sessionId} changed mode before stop preparation.`);
			const prepared = await session.prepareStop();
			return { record, stop: async () => await prepared.stop(), release };
		} catch (error) {
			await this.releaseSessionClaim(release, error);
			throw error;
		}
	}

	async prepareTaskStop(taskId: string, modeId?: ModeId): Promise<PreparedCoreSessionStop[]> {
		const state = await this.store.read(taskId);
		const records = modeId
			? (state.modes[modeId]?.sessions ?? [])
			: Object.values(state.modes).flatMap(({ sessions }) => sessions);
		const prepared: PreparedCoreSessionStop[] = [];
		try {
			for (const record of records) prepared.push(await this.prepareStop(taskId, record.id));
			return prepared;
		} catch (error) {
			const failures: unknown[] = [error];
			for (const entry of prepared) {
				try {
					await entry.release();
				} catch (releaseError) {
					failures.push(releaseError);
				}
			}
			if (failures.length > 1)
				throw new AggregateError(failures, "Task stop preflight and claim release failed.", { cause: error });
			throw error;
		}
	}

	async discardModeSessions(taskId: string, modeId: ModeId, taskRecord: Task): Promise<void> {
		const state = await this.store.read(taskId);
		const records = state.modes[modeId]?.sessions ?? [];
		if (records.length) this.requireSessionFactory();
		for (const record of records) {
			await this.readObserved(taskId, record.id);
			const session = this.tasks.findSession(taskId, record.id);
			if (!session) throw new Error(`Agent session not found: ${record.id}`);
			await session.observeRetained();
			if (session.executionOwnership !== "none")
				throw new Error(`Session ${record.id} is not positively absent; mode ${modeId} cannot be discarded.`);
		}
		const [, catalog] = await Promise.all([resolveAgentConfiguration(this, taskId), loadProjectModeCatalog(this)]);
		const model = this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
		for (const record of records) model.removeSession(modeId, record.id);
		model.removeMode(modeId);
		try {
			await this.store.removeModeHistory(taskId, modeId);
		} catch (error) {
			this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
			throw error;
		}
		await this.forgetModeSessions(taskId, modeId);
	}

	forgetTaskSessions(taskId: string): Promise<void> {
		for (const [key, session] of this.sessions) if (session.record.taskId === taskId) this.sessions.delete(key);
		this.tasks.forget(taskId);
		return Promise.resolve();
	}

	async forgetModeSessions(taskId: string, modeId: ModeId): Promise<void> {
		for (const [key, session] of this.sessions)
			if (session.record.taskId === taskId && session.modeId === modeId) this.sessions.delete(key);
		const model = this.tasks.get(taskId);
		if (model?.modes[modeId]?.sessions.length === 0) model.removeMode(modeId);
	}

	async moveModeSessions(
		taskId: string,
		sourceModeId: ModeId,
		destinationModeId: ModeId,
		taskRecord: Task,
	): Promise<void> {
		let moved: Session[] = [];
		try {
			const [, catalog] = await Promise.all([resolveAgentConfiguration(this, taskId), loadProjectModeCatalog(this)]);
			const model = this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
			moved = [...(model.modes[sourceModeId]?.sessions ?? [])];
			model.moveModeSessions(sourceModeId, destinationModeId);
			model.removeMode(sourceModeId);
			try {
				await this.store.moveModeHistory(
					taskId,
					sourceModeId,
					destinationModeId,
					model.modes[destinationModeId]?.activeSessionId,
				);
			} catch (error) {
				this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
				throw error;
			}
			for (const session of moved) session.moveToMode(destinationModeId);
		} catch (cause) {
			throw new Error(
				`Session move failed for ${taskId} (${sourceModeId} -> ${destinationModeId}); any committed membership changes are retained: ${cause instanceof Error ? cause.message : String(cause)}`,
				{ cause },
			);
		}
	}

	async stopSession(taskId: string, sessionId: string): Promise<void> {
		await this.storage.withTaskLock(taskId, async (task) => await this.stopSessionBody(task, sessionId));
	}

	private async stopSessionBody(taskRecord: Task, sessionId: string): Promise<void> {
		const taskId = taskRecord.id;
		const prepared = await this.prepareStop(taskId, sessionId);
		let primary: unknown;
		let stopped = false;
		try {
			await prepared.stop();
			stopped = true;
			this.sessions.delete(this.sessionKey(taskId, sessionId));
			{
				const [, catalog] = await Promise.all([resolveAgentConfiguration(this, taskId), loadProjectModeCatalog(this)]);
				const state = await this.store.read(taskId);
				const owner = Object.entries(state.modes).find(([, history]) =>
					history.sessions.some(({ id }) => id === sessionId),
				);
				if (!owner) throw new Error(`Stopped session membership no longer exists: ${sessionId}`);
				const model = this.tasks.hydrate(taskRecord, catalog.profiles, state);
				model.selectSurvivorAfterStop(owner[0], sessionId);
				await this.store.selectSurvivorAfterStop(taskId, owner[0], sessionId, model.modes[owner[0]]?.activeSessionId);
				this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
			}
		} catch (error) {
			primary = stopped
				? new Error(`Session ${taskId}/${sessionId} stopped, but survivor selection could not be persisted.`, {
						cause: error,
					})
				: error;
			throw primary;
		} finally {
			await this.releaseSessionClaim(prepared.release, primary);
		}
	}

	async deleteSession(taskId: string, sessionId: string, options: { force?: boolean } = {}): Promise<void> {
		await this.storage.withTaskLock(taskId, async (taskRecord) => {
			const prepared = await this.prepareStop(taskId, sessionId);
			let primary: unknown;
			try {
				const observed = await this.readObserved(taskId, sessionId);
				if (observed.snapshot.state !== "stopped" && !options.force)
					throw new Error(`Session ${sessionId} is not positively absent; use force to delete it.`);
				await prepared.stop();
				{
					const [, catalog] = await Promise.all([
						resolveAgentConfiguration(this, taskId),
						loadProjectModeCatalog(this),
					]);
					const state = await this.store.read(taskId);
					const owner = Object.entries(state.modes).find(([, history]) =>
						history.sessions.some(({ id }) => id === sessionId),
					);
					if (!owner) throw new Error(`Agent session not found: ${sessionId}`);
					const [modeId] = owner;
					const model = this.tasks.hydrate(taskRecord, catalog.profiles, state);
					model.removeSession(modeId, sessionId);
					try {
						await this.store.removeSessionRelationship(taskId, modeId, sessionId, model.modes[modeId]?.activeSessionId);
					} catch (error) {
						this.tasks.hydrate(taskRecord, catalog.profiles, await this.store.read(taskId));
						throw error;
					}
				}
				this.sessions.delete(this.sessionKey(taskId, sessionId));
			} catch (error) {
				primary = error;
				throw error;
			} finally {
				await this.releaseSessionClaim(prepared.release, primary);
			}
		});
	}

	async readObserved(taskId: string, sessionId: string): Promise<ObservedSession> {
		this.requireSessionFactory();
		const [taskRecord, state] = await Promise.all([this.tasks.getTask(taskId), this.store.read(taskId)]);
		if (!taskRecord) throw new Error(`Task not found: ${taskId}`);
		const profiles = (await loadProjectModeCatalog(this)).profiles;
		const model = this.tasks.hydrate(taskRecord, profiles, state);
		const session = model.findSession(sessionId);
		if (!session) throw new Error(`Agent session not found: ${sessionId}`);
		if (this.sessions.get(this.sessionKey(taskId, sessionId)) === session) return this.sessionView(session);
		return { record: { ...session.record }, snapshot: await session.observeRetained() };
	}

	async projectInventory(): Promise<ProjectSessionInventory[]> {
		const taskIds = await this.storage.loadProjectTaskIds();
		return await Promise.all(
			taskIds.map(async (taskId) => {
				const state = await this.store.read(taskId);
				const sessions = await Promise.all(
					Object.values(state.modes)
						.flatMap(({ sessions: records }) => records)
						.map(async ({ id }) => await this.readObserved(taskId, id)),
				);
				return { taskId, sessions };
			}),
		);
	}

	async attachmentContext(taskId: string, sessionId: string): Promise<SessionAttachmentContext> {
		const observed = await this.readObserved(taskId, sessionId);
		return {
			record: observed.record,
			snapshot: observed.snapshot,
			ownedByThisApplication: this.sessions.has(this.sessionKey(taskId, sessionId)),
		};
	}

	shutdown(): Promise<void> {
		if (this.shutdownOperation) return this.shutdownOperation;
		this.closing = true;
		const operation = this.stopForShutdown();
		this.shutdownOperation = operation;
		void operation.then(
			() => {
				this.shutdownOperation = undefined;
			},
			() => {
				this.shutdownOperation = undefined;
				this.closing = false;
			},
		);
		return operation;
	}

	private async stopForShutdown(): Promise<void> {
		const failures: unknown[] = [];
		const stopped: string[] = [];
		for (const result of await Promise.allSettled([...this.launches]))
			if (result.status === "rejected")
				failures.push(
					new Error(`Pending launch failed during shutdown: ${String(result.reason)}`, { cause: result.reason }),
				);
		const targets = new Map(
			[...this.sessions].map(([key, session]) => [key, { taskId: session.record.taskId, sessionId: session.id }]),
		);
		try {
			if (this.sessionFactory)
				for (const { taskId, sessions } of await this.projectInventory())
					for (const { record, snapshot } of sessions)
						if (snapshot.state !== "stopped")
							targets.set(this.sessionKey(taskId, record.id), { taskId, sessionId: record.id });
		} catch (error) {
			failures.push(new Error("Retained-session inventory failed during shutdown.", { cause: error }));
		}
		for (const { taskId, sessionId } of targets.values()) {
			try {
				await this.stopSession(taskId, sessionId);
				stopped.push(`${taskId}/${sessionId}`);
			} catch (error) {
				failures.push(
					new Error(`Shutdown settlement failed for ${taskId}/${sessionId}: ${String(error)}`, { cause: error }),
				);
			}
		}
		if (failures.length)
			throw new AggregateError(
				failures,
				`Some session shutdown operations failed. Completed stops: ${stopped.join(", ") || "none"}. ${failures.map(String).join("; ")}`,
			);
	}

	async ask(taskId: string, sessionId: string, question: string): Promise<{ answer: string }> {
		this.requireSessionFactory();
		await this.readObserved(taskId, sessionId);
		const { record, modeId } = await this.requireSessionRecord(taskId, sessionId);
		const resolved = await resolveAgentConfiguration(this, taskId);
		const preset = resolved.config.presets[record.preset];
		if (!preset) throw new Error(`Agent preset not found for existing session: ${record.preset}`);
		const profile = (await loadProjectModeCatalog(this)).profiles[modeId];
		if (!profile) throw new Error(`Unknown mode '${modeId}'.`);
		const roots = record.pathContext;
		if (!roots) throw new Error(`Session ${sessionId} has no retained execution roots.`);
		const task = await this.tasks.getTask(taskId);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		const release = await this.store.claimSession(taskId, sessionId);
		let primary: unknown;
		try {
			const model = this.tasks.get(taskId);
			const session = model?.findSession(sessionId);
			if (!session || session.modeId !== modeId) throw new Error(`Agent session not found: ${sessionId}`);
			return await session.ask({
				preset,
				question,
				profile,
				roots: {
					repositoryRoot: roots.projectDir,
					taskRoot: roots.taskDir,
					cwd: this.taskExecutionCwd(task, resolved.config.sessions.worktreePerTask),
					taskId,
					modeId,
					sessionId,
				},
			} satisfies SessionAskContext);
		} catch (error) {
			primary = error;
			throw error;
		} finally {
			await this.releaseSessionClaim(release, primary);
		}
	}

	async executionCwd(taskId: string): Promise<string> {
		const [task, resolved] = await Promise.all([this.tasks.getTask(taskId), resolveAgentConfiguration(this, taskId)]);
		if (!task) throw new Error(`Task not found: ${taskId}`);
		return this.taskExecutionCwd(task, resolved.config.sessions.worktreePerTask);
	}

	async askPrevious(taskId: string, modeId: ModeId, question: string): Promise<{ answer: string }> {
		const [state, taskRecord, catalog] = await Promise.all([
			this.store.read(taskId),
			this.tasks.getTask(taskId),
			loadProjectModeCatalog(this),
		]);
		if (!catalog.profiles[modeId]) throw new Error(`Unknown mode '${modeId}'.`);
		if (!taskRecord) throw new Error(`Task not found: ${taskId}`);
		const task = this.tasks.hydrate(taskRecord, catalog.profiles, state, modeId);
		const session = task.activeSession;
		if (!session) throw new Error(`Mode ${modeId} for task ${taskId} has no saved conversation.`);
		return await this.ask(taskId, session.id, question);
	}

	private async prepareSession(task: Task, preset: string, defaultWorktree: boolean): Promise<SessionCreationInputs> {
		if (task.worktreePolicy === "enabled" || (task.worktreePolicy === undefined && defaultWorktree)) {
			const expected = taskWorktreePath(this.storage.projectRoot, task);
			try {
				const worktree = await ensureTaskWorktree(this.storage.projectRoot, task);
				if (!worktree) throw new Error("Project is not a Git worktree.");
			} catch (cause) {
				throw new Error(`Could not prepare task worktree at ${expected}: ${String(cause)}`, { cause });
			}
		}
		const { taskDir } = await this.store.paths(task.id);
		return {
			preset,
			taskDir,
			pathContext: {
				projectDir: this.storage.projectRoot,
				taskDir: await this.storage.taskArtifacts.containerPath(task.id),
			},
		};
	}

	private createLaunchContext(
		task: Task,
		record: AgentSession,
		modeId: ModeId,
		configuration: Awaited<ReturnType<typeof resolveAgentConfiguration>>,
		preset: Awaited<ReturnType<typeof resolveAgentConfiguration>>["config"]["presets"][string],
		profile: ModeProfile,
	): SessionLaunchContext {
		return {
			taskId: record.taskId,
			modeId,
			sessionId: record.id,
			record,
			cwd: this.taskExecutionCwd(task, configuration.config.sessions.worktreePerTask),
			configuration,
			profile,
			preset,
			prompt: profile.prompt,
		};
	}

	private taskExecutionCwd(task: Task, defaultWorktree: boolean): string {
		return task.worktreePolicy === "enabled" || (task.worktreePolicy === undefined && defaultWorktree)
			? taskWorktreePath(this.storage.projectRoot, task)
			: this.storage.projectRoot;
	}

	private requireSessionFactory(): SessionFactory {
		if (!this.sessionFactory)
			throw new Error("Session lifecycle requires a SessionFactory from the application composition.");
		return this.sessionFactory;
	}

	private sessionView(session: Session): ObservedSession {
		return { record: { ...session.record }, snapshot: session.view };
	}

	private async publishSession(session: Session): Promise<void> {
		const serialized = { ...session.record };
		await this.store.publishSession(session.record.taskId, session.modeId, serialized);
	}

	private async settleFailedCreation(
		task: TaskModel,
		session: Session,
		creation: SessionCreationIdentity,
		original: unknown,
		startEntered: boolean,
	): Promise<void> {
		const failures: unknown[] = [original];
		if (startEntered && session.execution) {
			try {
				await session.stop();
			} catch (error) {
				failures.push(error);
				try {
					await this.publishSession(session);
				} catch (publicationError) {
					failures.push(publicationError);
				}
				throw new AggregateError(failures, "Creation failed and execution cleanup failed; reservation retained.", {
					cause: original,
				});
			}
		}
		try {
			const activeSessionId = task.rollbackSession(creation);
			await this.store.rollbackProvisionalSession(
				creation.taskId,
				creation.modeId,
				creation.provisionalSessionId,
				activeSessionId,
			);
			this.sessions.delete(this.sessionKey(creation.taskId, creation.provisionalSessionId));
		} catch (error) {
			const taskRecord = await this.tasks.getTask(creation.taskId);
			if (taskRecord) {
				const [catalog, state] = await Promise.all([loadProjectModeCatalog(this), this.store.read(creation.taskId)]);
				this.tasks.hydrate(taskRecord, catalog.profiles, state);
			}
			failures.push(error);
			throw new AggregateError(failures, "Creation failed and rollback failed; reservation retained.", {
				cause: original,
			});
		}
	}

	private async settleFailedResume(session: Session, original: unknown): Promise<void> {
		if (!session.execution) return;
		try {
			await session.stop();
		} catch (cleanupError) {
			this.sessions.set(this.sessionKey(session.record.taskId, session.id), session);
			const failures: unknown[] = [original, cleanupError];
			try {
				await this.publishSession(session);
			} catch (publicationError) {
				failures.push(publicationError);
			}
			throw new AggregateError(failures, "Resume failed and execution cleanup failed; tracking retained.", {
				cause: original,
			});
		}
	}

	private async enforceSessionLimit(started: AgentSession): Promise<void> {
		try {
			const observed = (await this.projectInventory()).flatMap(({ taskId, sessions }) =>
				sessions.map((session) => ({ taskId, ...session })),
			);
			const live = observed.filter(({ snapshot }) => snapshot.state !== "stopped");
			let remaining = live.length - this.maxSessions;
			if (remaining <= 0) return;
			const candidates = live
				.filter(
					({ taskId, record, snapshot }) =>
						!(taskId === started.taskId && record.id === started.id) &&
						(snapshot.state === "running" || snapshot.state === "parked") &&
						snapshot.activity === "idle" &&
						snapshot.idleSince !== null,
				)
				.sort((left, right) => left.snapshot.idleSince! - right.snapshot.idleSince!);
			for (const candidate of candidates) {
				if (remaining === 0) return;
				try {
					await this.stopSession(candidate.taskId, candidate.record.id);
					remaining--;
				} catch (error) {
					console.warn(`Failed to evict idle session ${candidate.record.id}:`, error);
				}
			}
		} catch (error) {
			console.warn("Failed to enforce session limit:", error);
		}
	}

	private async requireSessionRecord(
		taskId: string,
		sessionId: string,
	): Promise<{ record: AgentSession; modeId: ModeId }> {
		const state = await this.store.read(taskId);
		const owner = Object.entries(state.modes).find(([, history]) =>
			history.sessions.some(({ id }) => id === sessionId),
		);
		if (!owner) throw new Error(`Agent session not found: ${sessionId}`);
		const [modeId, history] = owner;
		const record = history.sessions.find(({ id }) => id === sessionId);
		if (!record || record.taskId !== taskId) throw new Error(`Agent session not found: ${sessionId}`);
		return { record, modeId };
	}

	private async releaseSessionClaim(release: () => Promise<void>, primary: unknown): Promise<void> {
		try {
			await release();
		} catch (releaseError) {
			if (primary !== undefined)
				throw new AggregateError([primary, releaseError], "Session operation and claim release failed.", {
					cause: primary,
				});
			throw releaseError;
		}
	}

	private sessionKey(taskId: string, sessionId: string): string {
		return `${taskId}:${sessionId}`;
	}

	private trackLaunch(operation: () => Promise<ObservedSession>): Promise<ObservedSession> {
		if (this.closing) return Promise.reject(new Error("Core is shutting down."));
		const launch = operation();
		this.launches.add(launch);
		void launch.then(
			() => this.launches.delete(launch),
			() => this.launches.delete(launch),
		);
		return launch;
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
	const core = new Core((await findAgenticWorkspaceRoot(cwd)) ?? cwd);
	await core.tasks.init();
	return core;
}
