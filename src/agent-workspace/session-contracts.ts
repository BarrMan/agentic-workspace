import type { OwnedNativeSessionStops } from "../git/task-worktree-cleanup.ts";
import type { Task as TaskRecord } from "../types/index.ts";
import type { LaunchOrigin, NativeIdentity } from "./agents/agent.ts";
import type { HarnessProvider, RunningExecution, SessionLaunchContext } from "./harness.ts";
import type { TmuxExec } from "./live/tmux/types.ts";
import type { Immutable, Session } from "./session.ts";
import type { TmuxServer } from "./session-process.ts";
import type { SessionPaths, SessionState } from "./session-store.ts";
import type { Task, TaskHydrationInput } from "./task.ts";
import type {
	AgentConfiguration,
	AgentSession,
	ArtifactStatus,
	ModeId,
	ResolvedAgentConfiguration,
	TaskSessions,
} from "./types.ts";
import type { SessionHandoff, WorkspaceContext, WorkspaceRequest } from "./workspace-context.ts";

/** Verified live runtime identity for one session. Required by every runtime transition. */
export interface SessionRuntimeOrigin {
	readonly record: Immutable<AgentSession>;
	readonly paneId: string;
}

/**
 * Construction contract for the shared application controller.
 *
 * The controller owns admission ORDERING, current-state loading, policy decisions, model
 * invocation, publication, and rollback. These ports perform storage, configuration, locking, and
 * verified runtime mechanics — never whole session operations. Do NOT add a port that implements
 * `prepareSession`, `launchAndPersist`, `stopAndSave`, or `hydrateCurrentTask`: those are exactly
 * the behavior the controller must own. Injecting `Core`, `AgentSessionService`, or a `Pick` of its
 * orchestration methods is likewise forbidden — it re-creates the orchestration being retired.
 */
export interface SessionTaskRepository {
	/** Working-copy reads; never admit remote or cross-branch mutation implicitly. */
	load(
		taskId: string,
		options: { readonly forMutation: boolean; readonly includeArchived: boolean },
	): Promise<TaskRecord | null>;
	/** Active, draft, completed, and archived task IDs; used by mode deletion. */
	listTaskIds(): Promise<string[]>;
	/** Configured statuses, including the existing default fallback. */
	statuses(): Promise<readonly string[]>;
	/**
	 * Separate task mutation transaction, invoked AFTER session admission and claims are released.
	 * Reloads and compares filePath/status with `expected`; returns undefined if it changed.
	 * Preserves canonical validation and status hooks. Never re-enters the session controller.
	 */
	setStatus(expected: Readonly<TaskRecord>, status: string): Promise<TaskRecord | undefined>;
}

export interface SessionAdmission {
	/** Refuse operations when the required task-lock mechanism is disabled. */
	assertEnabled(): void;
	/**
	 * Only the filesystem task lock. The controller owns load → validate → lock → reload →
	 * validate and decides the lifetime of this boundary.
	 */
	withTaskLock<T>(task: Pick<TaskRecord, "id" | "filePath">, operation: () => Promise<T>): Promise<T>;
	/** Existing cross-process per-conversation claim; release errors propagate. */
	claimSession(taskId: string, sessionId: string): Promise<() => Promise<void>>;
}

export interface SessionConfiguration {
	/** Current effective card/project/root configuration; no hydration-time cache. */
	resolve(taskId: string): Promise<ResolvedAgentConfiguration>;
	/** Exact project scope: the mode catalog is NOT inherited from card/root. */
	readProject(): Promise<AgentConfiguration | null>;
	/** Existing editable-project semantics, for journaled mode deletion. */
	readEditableProject(): Promise<AgentConfiguration>;
	updateProject(update: (current: AgentConfiguration) => AgentConfiguration): Promise<AgentConfiguration>;
}

export interface SessionTaskPaths {
	/** Return an existing task worktree, or undefined. NEVER create or remove one. */
	existingWorktree(task: Pick<TaskRecord, "id" | "title">): Promise<string | undefined>;
	artifactDirectory(taskId: string): Promise<string>;
	listArtifacts(taskId: string): Promise<readonly ArtifactStatus[]>;
	/** Canonical project-root and existing working-directory validation. */
	validateSessionPaths(record: Immutable<AgentSession>): Promise<void>;
}

export interface SessionControllerStore {
	readonly stateRoot: Promise<string>;
	read(taskId: string): Promise<SessionState>;
	readAll(): Promise<SessionState[]>;
	paths(taskId: string): Promise<SessionPaths>;
	exists(taskId: string): Promise<boolean>;
	/**
	 * Short lock → authoritative reload → synchronous edit → validate → atomic write → unlock.
	 * The adapter maintains the legacy flat-mode projection. No provider, filesystem cleanup, hook,
	 * or application callback may run inside `edit`. Returning undefined rather than void rejects
	 * async callbacks at the type level.
	 *
	 * Rejections propagate the store's `SessionMutationError` unchanged (including
	 * `writeCommitted`); never swallow it.
	 */
	mutate(taskId: string, edit: (current: SessionState) => undefined): Promise<void>;
	/** The controller has already checked reset/purge eligibility. */
	reset(taskId: string): Promise<void>;
	removeTaskDir(taskId: string): Promise<void>;
}

export interface SessionFiles {
	readOutput(record: Immutable<AgentSession>): Promise<string>;
	/**
	 * Validate canonical state/request directories and owned sidecar paths before destructive task
	 * cleanup. No deletion and no runtime probes.
	 */
	validateTaskCleanup(taskId: string, records: readonly Immutable<AgentSession>[]): Promise<void>;
	/** Existing per-session delete policy: best-effort log/bootstrap removal. */
	removeSessionSidecars(record: Immutable<AgentSession>): Promise<void>;
	/**
	 * Forget-only policy: strict owned log/bootstrap/identity/activity/request removal. No
	 * session-state write, process signal, or provider call.
	 */
	forgetSessionFiles(record: Immutable<AgentSession>): Promise<void>;
}

export interface SessionWorkspaceRequests {
	/** Parse and verify canonical root and exact pane tags; not a raw environment read. */
	readContext(): Promise<WorkspaceContext | undefined>;
	read(): Promise<WorkspaceRequest[]>;
	write(request: WorkspaceRequest): Promise<void>;
	/** Existing best-effort request-marker removal policy. */
	remove(sessionId: string): Promise<void>;
}

export interface SessionModeSelection {
	read(): Promise<Readonly<Record<string, ModeId>>>;
	/**
	 * Locked update of selectedModeByTask ONLY; preserve every other view field. The controller
	 * owns selection validation, fallback, and affected-entry pruning.
	 */
	update(edit: (current: Readonly<Record<string, ModeId>>) => Record<string, ModeId>): Promise<void>;
}

export interface SessionModeDeletionJournal {
	readonly version: 2;
	readonly operationId: string;
	readonly source: ModeId;
	readonly destination?: ModeId;
	readonly phase: "prepared" | "histories" | "view" | "configuration";
	readonly tasks: readonly string[];
}

export interface SessionModeLifecycleStorage {
	/** The existing mode-lifecycle gate, using the same canonical key. */
	withGate<T>(operation: () => Promise<T>): Promise<T>;
	/** Preserve existing validation, including refusal of a version-1 journal. */
	readJournal(): Promise<SessionModeDeletionJournal | undefined>;
	writeJournal(journal: SessionModeDeletionJournal): Promise<void>;
	removeJournal(): Promise<void>;
}

export type SessionRuntimeInspection =
	| { readonly status: "live"; readonly paneId: string }
	| { readonly status: "dead"; readonly paneId: string }
	| { readonly status: "missing" }
	| { readonly status: "uncertain"; readonly reason: string };

export interface SessionPreviewTarget {
	readonly origin: SessionRuntimeOrigin;
	readonly server: TmuxServer;
	readonly exec: TmuxExec;
}

/**
 * Verified runtime mechanics: provider startup, receipts, exact-instance verification, handles,
 * hooks, ask transport, and preview transport. Knows nothing about session state, Task history, or
 * selection. It never decides durable publication.
 */
export interface SessionRuntime extends HarnessProvider {
	/** Exact owned-instance inspection; never launches or alters durable state. */
	inspect(record: Immutable<AgentSession>): Promise<SessionRuntimeInspection>;
	/**
	 * Reconstruct a handle for an existing live/dead owned execution. Verifies the supplied origin;
	 * never spawns, resumes, selects, or publishes.
	 */
	openExecution(context: SessionLaunchContext, origin: SessionRuntimeOrigin): Promise<RunningExecution>;
	/**
	 * Cleanup recoverable allocations without a returned execution handle. Validates exact resource
	 * provenance; never kills a replacement execution.
	 */
	cleanupOwned(record: Immutable<AgentSession>): Promise<void>;
	/** Recover receipt/resource provenance for an already-existing launch. */
	launchOrigin(record: Immutable<AgentSession>, modeId: ModeId): Promise<LaunchOrigin | undefined>;
	inspectLaunch(origin: LaunchOrigin): Promise<"owned" | "absent" | "replacement">;
	/** Provider receipt discovery only; the controller decides durable publication. */
	discoverIdentity(context: SessionLaunchContext, origin: LaunchOrigin): Promise<NativeIdentity | undefined>;
	/** Verify exact pane/root/provider/resource identity before changing tags. */
	tagIdentity(origin: LaunchOrigin, identity: NativeIdentity): Promise<void>;
	clearIdentity(origin: SessionRuntimeOrigin): Promise<void>;
	/**
	 * Provider ask preparation, invocation, timeout/partial-output handling, and temporary-resource
	 * cleanup. No target selection, admission, or durable writes.
	 */
	ask(
		context: SessionLaunchContext,
		nativeId: string,
		question: string,
		options: { readonly timeoutMs: number; readonly workspaceContext?: WorkspaceContext },
	): Promise<{ answer: string; timedOut: boolean }>;
	/** Transport-only operations; never establish a new conversation. */
	preview(origin: SessionRuntimeOrigin): Promise<SessionPreviewTarget>;
	attach(origin: SessionRuntimeOrigin): Promise<void>;
}

export interface SessionStartOptions {
	readonly preset?: string;
	readonly modeId?: ModeId;
	readonly replace?: boolean;
	readonly maxRunningSessions?: number;
}

export interface SessionActivationResult {
	readonly activated: boolean;
	readonly status?: string;
}

export interface SessionControllerDependencies {
	readonly rootDir: string;
	readonly ownerPid: number;

	readonly taskRepository: SessionTaskRepository;
	readonly admission: SessionAdmission;
	readonly configuration: SessionConfiguration;
	readonly paths: SessionTaskPaths;
	readonly store: SessionControllerStore;
	readonly files: SessionFiles;
	readonly requests: SessionWorkspaceRequests;
	readonly selection: SessionModeSelection;
	readonly modeLifecycle: SessionModeLifecycleStorage;
	readonly runtime: SessionRuntime;

	readonly now: () => string;
	readonly newSessionId: () => string;
	/** Existing environment override and default, resolved at operation time. */
	readonly askTimeoutMs: () => number;
}

/** Implemented by the exported class in `session-controller.ts`. */
export interface SessionControllerConstructor {
	new (dependencies: SessionControllerDependencies): SessionController;
}

/**
 * Shared application controller. Maps the existing `AgentSessionService` public operations
 * one-for-one (see `AGENT_SESSION_SERVICE_MIGRATION`) and adds Task hydration. Construction is
 * UI-independent — see {@link SessionControllerDependencies} for the boundary.
 */
export interface SessionController {
	readonly tasks: readonly Task[];

	// Reads — never launch a runtime.
	list(taskId: string, requestedModeId?: ModeId): Promise<TaskSessions>;
	listMode(taskId: string, modeId: ModeId): Promise<TaskSessions>;
	liveSession(taskId: string, sessionId: string, options?: { passive?: boolean }): Promise<Session | undefined>;
	output(taskId: string, sessionId?: string, modeId?: ModeId): Promise<string>;
	touchUsage(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void>;
	/** Verified transport projection for UI attachment; never launches. */
	preview(taskId: string, sessionId: string): Promise<SessionPreviewTarget | undefined>;

	// Creation, resume and adoption.
	/**
	 * Owns inherited-context routing, replacement, and the direct-start running-limit policy.
	 * Creation is reserve-then-start: `Task.reserveSession` inserts the provisional membership and
	 * this operation obtains fresh authority, calls `session.start(...)`, waits for readiness, and
	 * rolls back on failure.
	 */
	start(taskId: string, options?: SessionStartOptions): Promise<Session>;
	prepareNewSession(taskId: string, modeId: ModeId): Promise<Session>;
	prepareNativeSession(taskId: string, sessionId?: string, requestedModeId?: ModeId): Promise<Session>;
	adoptPendingSession(taskId: string, sessionId: string): Promise<Session>;
	/**
	 * Registers a pending request and provisions the session WITHOUT provider startup. The
	 * operation-scoped sink validates the captured pending reservation and treats that reservation
	 * checkpoint as verification, never as a reinsertion.
	 */
	registerPendingSession(
		taskId: string,
		options: { preset?: string; replace?: boolean; modeId?: ModeId },
		context: WorkspaceContext,
	): Promise<Session>;
	publishNativeIdentity(origin: LaunchOrigin, identity: NativeIdentity): Promise<void>;

	// Verified runtime transitions — origin is mandatory, never inferred from selection.
	activateNativeSession(
		taskId: string,
		sessionId: string,
		origin: SessionRuntimeOrigin,
	): Promise<SessionActivationResult>;
	finishNativeSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin, error?: string): Promise<void>;
	parkNativeSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin): Promise<void>;

	// Stop and hand-off. Hand-off carries the captured successor and predecessor identity.
	stop(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void>;
	/**
	 * Core completion entry: the caller ALREADY holds task admission. Acquire session claims here,
	 * but never re-acquire the task lock. Successor-retirement failure after a successful creation
	 * does not roll the creation back.
	 */
	stopAllTaskSessions(taskId: string, ownedStops?: OwnedNativeSessionStops): Promise<void>;
	finalizeHandoff(taskId: string, successor: Immutable<AgentSession>, handoff: SessionHandoff): Promise<void>;
	rollbackHandoff(taskId: string, successor: Immutable<AgentSession>, handoff: SessionHandoff): Promise<void>;

	// Mutation and deletion.
	delete(taskId: string, sessionId: string, options?: { force?: boolean }): Promise<void>;
	/**
	 * Core deletion entry: the caller already holds task/reference admission. Forgets associations
	 * and owned files; never inspects or signals a runtime.
	 */
	forgetTaskSessions(taskId: string): Promise<void>;
	purge(taskId: string): Promise<void>;
	reset(taskId: string): Promise<void>;
	/** Task behavior followed by a locked selectedModeByTask entry update. */
	cycleMode(taskId: string, direction?: number): Promise<ModeId>;
	deleteMode(modeId: ModeId, destinationModeId?: ModeId): Promise<void>;

	// Interaction and reconciliation.
	ask(
		taskId: string,
		question: string,
		options?: { sessionId?: string; modeId?: ModeId },
	): Promise<{ answer: string; timedOut: boolean }>;
	sendKey(taskId: string, sessionId: string, key: string): Promise<void>;
	attach(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void>;
	reconcileTaskSessions(taskId: string): Promise<void>;

	hydrateTask(input: TaskHydrationInput): Task;
	/** Release local subscriptions only; never stop shared executions. */
	dispose(): void;
}

/**
 * Migration map for every AgentSessionService public operation.
 * Admission: load task → withTaskSessionAdmission → filesystem.withTaskLock → reload/validate.
 * Lifecycle work uses withLifecycleAdmission and per-session claimSession. Mutation callbacks
 * execute under the store state lock; checkpoint sinks reuse held admission/claim ownership and
 * never reacquire it. No store-file lock may span provider startup, input, or arbitrary callbacks.
 */
export const AGENT_SESSION_SERVICE_MIGRATION = {
	constructor: "Controller",
	deleteMode: "Controller",
	stateRoot: "SessionStore-persistence",
	list: "Controller",
	listMode: "Controller",
	publishNativeIdentity: "Controller",
	listAllSessions: "SessionStore-persistence",
	reset: "Controller",
	purge: "Controller",
	forgetTaskSessions: "Controller",
	delete: "Controller",
	liveSession: "Controller",
	prepareNativeSession: "Controller",
	prepareNewSession: "Controller",
	adoptPendingSession: "Controller",
	activateNativeSession: "Controller",
	finishNativeSession: "Controller",
	parkNativeSession: "Controller",
	start: "Controller",
	registerPendingSession: "Controller",
	rollbackHandoff: "Controller",
	finalizeHandoff: "Controller",
	stop: "Controller",
	stopAllTaskSessions: "Controller",
	cleanupTaskWorktreeSessions: "REMOVE",
	output: "Controller",
	sendKey: "Session",
	ask: "Harness-runtime",
	attach: "Controller",
	touchUsage: "SessionStore-persistence",
	reconcileTaskSessions: "Controller",
} as const satisfies Record<
	string,
	"Task" | "Session" | "Harness-runtime" | "Controller" | "SessionStore-persistence" | "REMOVE"
>;
