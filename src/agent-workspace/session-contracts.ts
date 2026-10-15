import type { OwnedNativeSessionStops } from "../git/task-worktree-cleanup.ts";
import type { Task as TaskRecord } from "../types/index.ts";
import type { LaunchOrigin, NativeIdentity } from "./agents/agent.ts";
import type { TmuxExec } from "./live/tmux/types.ts";
import type { TmuxServer } from "./session-process.ts";
import type { SessionPaths, SessionState } from "./session-store.ts";
import type {
	AgentActivity,
	AgentConfiguration,
	AgentPreset,
	AgentSession,
	AgentSessionStatus,
	ArtifactStatus,
	ModeId,
	ModeProfile,
	ModeSessionHistory,
	ResolvedAgentConfiguration,
	TaskSessions,
} from "./types.ts";
import type { SessionHandoff, WorkspaceContext, WorkspaceRequest } from "./workspace-context.ts";

export type Unsubscribe = () => void;

export type Immutable<T> = T extends (...args: never[]) => unknown
	? T
	: T extends readonly (infer Item)[]
		? readonly Immutable<Item>[]
		: T extends object
			? { readonly [Key in keyof T]: Immutable<T[Key]> }
			: T;

export interface SessionCreationIdentity {
	readonly taskId: TaskRecord["id"];
	readonly modeId: ModeId;
	readonly provisionalSessionId: AgentSession["id"];
	readonly previousActiveSessionId?: AgentSession["id"];
}

export type SessionStartupCheckpointPhase = "reservation" | "identity" | "ready" | "rollback";
export type SessionCheckpointPhase = SessionStartupCheckpointPhase | "update";
export type SessionCheckpointOrigin =
	| { readonly kind: "creation"; readonly creation: SessionCreationIdentity }
	| { readonly kind: "session"; readonly taskId: string; readonly modeId: ModeId; readonly sessionId: string };
export type ExpectedSessionMembership =
	| { readonly kind: "absent"; readonly taskId: string; readonly modeId: ModeId; readonly sessionId: string }
	| { readonly kind: "present"; readonly taskId: string; readonly modeId: ModeId; readonly sessionId: string };

/**
 * Checkpoint emission ownership and membership contract:
 * - `reservation` expects `absent` and is the FIRST durable publication of the provisional record;
 *   `identity` and `ready` expect `present` and update it. Session emits these during startup.
 * - `rollback` expects `present` and REMOVES the provisional record. It is emitted by the
 *   CONTROLLER after execution cleanup succeeds, with `origin.kind === "creation"`, because only
 *   the controller holds the captured `previousActiveSessionId` needed to restore the prior
 *   selection. Session cannot emit it.
 * - `update` settles an EXISTING membership after startup: stop, park, finish, activation, and
 *   observation. It never inserts, selects, removes, or restores a pointer. "ready" means launch
 *   readiness only — never "some record was saved".
 */
export interface SessionStartupCheckpoint {
	readonly phase: SessionStartupCheckpointPhase;
	readonly origin: SessionCheckpointOrigin;
	readonly expectedMembership: ExpectedSessionMembership;
	readonly record: Immutable<AgentSession>;
}

export interface SessionUpdateCheckpoint {
	readonly phase: "update";
	readonly reason: "activate" | "stop" | "park" | "finish" | "observation";
	readonly origin: Extract<SessionCheckpointOrigin, { kind: "session" }>;
	readonly expectedMembership: Extract<ExpectedSessionMembership, { kind: "present" }>;
	/** Accepted record before this transition; used for lifecycle-field compare-and-set. */
	readonly previous: Immutable<AgentSession>;
	readonly record: Immutable<AgentSession>;
}

export type LifecycleCheckpoint = SessionStartupCheckpoint | SessionUpdateCheckpoint;

export type LifecycleCheckpointSink = (checkpoint: LifecycleCheckpoint) => Promise<void>;

export interface SessionLaunchContext {
	readonly taskId: string;
	readonly modeId: ModeId;
	readonly sessionId: string;
	/**
	 * The provisional record being launched. It carries cwd, pathContext, outputPath,
	 * bootstrapPath, preset name, and tmuxName, so Harness needs no separate path inputs.
	 */
	readonly record: Readonly<AgentSession>;
	/** Current resolved configuration, for effective-version/preset resolution at operation time. */
	readonly configuration: ResolvedAgentConfiguration;
	readonly profile: Readonly<ModeProfile>;
	readonly preset: Readonly<AgentPreset>;
	/** Fully composed initial prompt. Harness delivers it exactly once and never re-derives it. */
	readonly prompt: string;
}

export interface ExecutionIdentity {
	readonly taskId: string;
	readonly modeId: ModeId;
	readonly sessionId: string;
	readonly executionId: string;
	readonly nativeSessionId?: string;
}

export interface RunningExecutionEvents {
	readonly turnCompleted: "supported" | "unsupported";
	readonly permissionWait: "supported" | "unsupported";
	readonly executionExit: "supported" | "unsupported";
	readonly activity: "supported" | "unsupported";
}

export interface RunningExecutionEvent {
	readonly kind: "turn-completed" | "permission-wait" | "execution-exit" | "activity";
	readonly activity?: AgentActivity;
	readonly exitCode?: number;
}

export interface RunningExecution {
	readonly identity: ExecutionIdentity;
	readonly providerConversationId?: string;
	readonly events: Readonly<RunningExecutionEvents>;
	input(text: string): Promise<void>;
	/** Terminal key semantics; distinct from literal prompt input. */
	sendKey(key: string): Promise<void>;
	stop(): Promise<void>;
	observe(listener: (event: RunningExecutionEvent) => void): Unsubscribe;
	teardownListeners(): void;
}

export interface RecoverableExecutionFailure extends Error {
	readonly execution?: RunningExecution;
	readonly identity?: ExecutionIdentity;
}

export interface CreationRollbackError extends AggregateError {
	readonly cause: Error;
	readonly secondaryErrors: readonly Error[];
}

export interface Harness {
	/** Creates a new conversation. Resolves only when R-A readiness is established. */
	launch(context: SessionLaunchContext): Promise<RunningExecution>;
	/** Resumes an exact conversation. Rejects rather than launching a fresh conversation. */
	resume(nativeId: string, context: SessionLaunchContext): Promise<RunningExecution>;
}

export interface SessionEvent {
	readonly kind: "turn-completed" | "permission-wait" | "execution-exit" | "activity";
	readonly activity?: AgentActivity;
	readonly status: AgentSessionStatus;
	/**
	 * Captured before execution teardown. Identifies the execution INCARNATION, not the
	 * conversation: the controller rejects events from a superseded execution after an exact resume.
	 */
	readonly executionIdentity: ExecutionIdentity;
	/**
	 * Snapshot of the session record after the observed change. An asynchronous observation has no
	 * operation-scoped publication authority, so the controller must publish this snapshot under a
	 * FRESH coordinated operation (claim + sink) rather than Session retaining authority.
	 */
	readonly record: Immutable<AgentSession>;
}

/** Operation-scoped publication authority. Valid only for the command that received it. */
export interface SessionPublication {
	readonly checkpoint: LifecycleCheckpointSink;
}

/** Operation-scoped authority for a launch or exact resume. Never retained by Session. */
export interface SessionLaunchOperation extends SessionPublication {
	readonly harness: Harness;
	/** Launch inputs resolved for the CURRENT operation — never a creation-time snapshot. */
	readonly context: SessionLaunchContext;
}

export interface Session {
	readonly id: string;
	readonly record: Readonly<AgentSession>;
	readonly execution?: RunningExecution;
	/**
	 * New conversation. Awaits the approved R-A readiness contract (identity, provider
	 * initialization, and initial-prompt acknowledgment) plus every required checkpoint.
	 * A rejected checkpoint prevents dependent effects. Authority is operation-scoped and is
	 * never retained: a later command receives a fresh `SessionLaunchOperation`.
	 */
	start(operation: SessionLaunchOperation): Promise<void>;
	/**
	 * Exact resume. Preserves the conversation identity and rejects when the exact conversation
	 * cannot be resumed — never falling back to a fresh session. Resume readiness is identity
	 * plus provider initialization only; no bootstrap is replayed. Clears a prior `endedAt`/`error`.
	 */
	resume(nativeId: string, operation: SessionLaunchOperation): Promise<void>;
	/**
	 * Install an already-verified existing execution and its subscriptions. Used for adoption of a
	 * live/dead owned execution and for pending-request registration. Performs no startup, no
	 * publication, no usage update, and never mutates the active pointer.
	 */
	bindExecution(modeId: ModeId, execution: RunningExecution): void;
	/** Publish an activation of an existing membership. */
	activate(publication: SessionPublication): Promise<void>;
	/**
	 * Stop the INSTALLED execution and publish the stopped record. Retains the conversation.
	 *
	 * This settles only what Session can observe: an execution installed in this process. Proving
	 * that a durably running execution is absent — and that an `uncertain` runtime is NOT absence —
	 * is verified runtime evidence, and therefore the CONTROLLER's responsibility: the controller
	 * inspects through `SessionRuntime.inspect`/`cleanupOwned` and settles a session it holds no
	 * handle for through `park`/`finish`. `stop` must never treat a missing local handle as proof
	 * of absence, and a no-op with no installed execution is honest, not a silent downgrade.
	 */
	stop(publication: SessionPublication): Promise<void>;
	/** Settle an execution already released or observed absent; does not signal it. */
	park(publication: SessionPublication): Promise<void>;
	finish(publication: SessionPublication, error?: string): Promise<void>;
	inject(text: string): Promise<void>;
	/** Terminal key semantics; distinct from literal prompt input. */
	sendKey(key: string): Promise<void>;
	subscribe(listener: (event: SessionEvent) => void): Unsubscribe;
	serialize(): AgentSession;
}

/**
 * Controller-bound factory that provisions the provisional session RECORD (working
 * directory/path context, preset, profile). It holds NO runtime authority and NO checkpoint
 * sink — fresh per-command authority is supplied through {@link SessionLaunchOperation}.
 */
export interface SessionCreationFactory {
	/**
	 * Synchronously provisions the provisional `starting` record and returns the unstarted
	 * Session. No I/O and no runtime dispatch occur here. Reconstructing a Session for resume
	 * from an existing record is controller-owned and does not use this factory.
	 */
	provision(input: { readonly taskId: string; readonly modeId: ModeId }): Session;
}

export interface TaskHydrationInput {
	readonly task: TaskRecord;
	readonly modes: Readonly<Record<ModeId, ModeProfile>>;
	readonly configuration: ResolvedAgentConfiguration;
	/** Existing per-mode history, INCLUDING the durable active-session pointer. */
	readonly sessionRecords: Readonly<Record<ModeId, ModeSessionHistory>>;
	readonly selectedModeId: ModeId;
	readonly createSession: SessionCreationFactory;
}

export interface TaskSessionCreation {
	readonly session: Session;
	readonly creation: SessionCreationIdentity;
}

export interface Task {
	readonly id: TaskRecord["id"];
	readonly selectedModeId: ModeId;
	readonly modes: Readonly<Record<ModeId, ModeSessionHistory>>;
	/** Record of the selected mode's active session, derived from the active pointer. */
	readonly activeSession?: Immutable<AgentSession>;
	readonly editable: boolean;
	cycleMode(direction?: number): ModeId;
	/**
	 * Provision, insert and select the provisional session synchronously. No I/O and no runtime;
	 * the controller obtains fresh operation authority and calls `session.start(...)` itself.
	 */
	reserveSession(modeId: ModeId): TaskSessionCreation;
	rollbackSession(creation: SessionCreationIdentity): void;
	/** Replace an existing member's accepted record. Never inserts, moves, reorders or selects. */
	updateSessionRecord(modeId: ModeId, record: Immutable<AgentSession>): void;
	/** Point the mode's active pointer at an existing member. */
	selectSession(modeId: ModeId, sessionId: string): void;
	/** Add an already-durable record as a member without launching it (pending/adoption). */
	registerSession(modeId: ModeId, record: Immutable<AgentSession>): void;
	/** Remove a membership and repair the active pointer. Never signals or stops a runtime. */
	removeSession(modeId: ModeId, sessionId: string): void;
	/** Remove a mode's history. Sessions are never merged into another mode. */
	removeMode(modeId: ModeId): void;
	edit(changes: Partial<TaskRecord>): void;
	/** Forget-only: owns no runtime cleanup and never signals or stops a process. */
	delete(): void;
	serialize(): TaskRecord;
}

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
export interface SessionRuntime extends Harness {
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

/**
 * Resolved readiness evidence per harness (approved R-A policy).
 *
 * No provider documents a standalone "accepting input" event, so new-session readiness is
 * defined as provable acceptance of the bootstrap prompt: identity established plus a prompt
 * receipt. Resume sends no prompt, so its readiness is identity plus session-init only and is
 * explicitly weaker — callers must not claim input readiness for a resumed execution.
 * Execution exit is transport/pane-detected for every harness, not a provider lifecycle event.
 */
export interface HarnessReadinessEvidence {
	/** Native conversation identity source. */
	readonly identity: string;
	/** Evidence that the provider finished initialization. */
	readonly initialization: string;
	/** Provider-supported acknowledgment that the initial prompt was submitted (new sessions). */
	readonly promptAcknowledgment: string;
	/** Exact-resume evidence: identity plus provider initialization; no bootstrap replay. */
	readonly resume: string;
	/** Conclusive startup failure and the bounded deadline that decides it. */
	readonly failure: string;
	readonly events: RunningExecutionEvents;
}

export const HARNESS_READINESS_MATRIX = {
	"opencode-v1": {
		identity: "Plugin `session.created` event, written as the `<sessionId>.native-session-id` receipt.",
		initialization: "Owned pane live and the plugin has flushed the identity receipt.",
		promptAcknowledgment: "Project-authored plugin emits prompt-accepted after bootstrap submission.",
		resume: "Identity receipt plus a live initialized pane; no bootstrap replay.",
		failure:
			"Owned pane disappears or exits within `LAUNCH_PROBE_DURATION_MS`; the v1 CLI preflight has its own bounded timeout.",
		events: {
			turnCompleted: "supported",
			permissionWait: "supported",
			executionExit: "supported",
			activity: "supported",
		},
	},
	"opencode-v2": {
		identity: "Client-allocated `ses_<uuid>` confirmed by the server session response.",
		initialization: "Server session lookup succeeds for the launched session.",
		promptAcknowledgment: "Server accepts the bootstrap message (API ack / SSE event).",
		resume: "Server session lookup for the exact native id; no bootstrap replay.",
		failure:
			"Version probe (5s) and resume-session probe (8s) preflight; pane disappearance or exit within the shared launch-probe deadline is conclusive.",
		events: {
			turnCompleted: "supported",
			permissionWait: "unsupported",
			executionExit: "supported",
			activity: "supported",
		},
	},
	claude: {
		identity: "Client `--session-id`, correlated with the `SessionStart` hook `session_id`.",
		initialization: "`SessionStart` hook observed for the launched session.",
		promptAcknowledgment: "`UserPromptSubmit` hook fires for the bootstrap prompt.",
		resume: "`SessionStart` hook with `source: resume`; no bootstrap replay.",
		failure: "Pane disappearance or exit within the shared launch-probe deadline.",
		events: {
			turnCompleted: "supported",
			permissionWait: "supported",
			executionExit: "supported",
			activity: "supported",
		},
	},
	pi: {
		identity: "Client `--session-id`, correlated with `session_start` session metadata.",
		initialization: "`session_start` extension event observed.",
		promptAcknowledgment: "`before_agent_start` carries the accepted bootstrap prompt.",
		resume: "`session_start` event; no bootstrap replay.",
		failure: "Pane disappearance or exit within the shared launch-probe deadline.",
		events: {
			turnCompleted: "supported",
			permissionWait: "unsupported",
			executionExit: "supported",
			activity: "supported",
		},
	},
} as const satisfies Record<"opencode-v1" | "opencode-v2" | "claude" | "pi", HarnessReadinessEvidence>;
