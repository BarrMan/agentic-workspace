import type { Task as TaskRecord } from "../types/index.ts";
import type { LaunchOrigin, NativeIdentity } from "./agents/agent.ts";
import type {
	AgentActivity,
	AgentPreset,
	AgentSession,
	AgentSessionStatus,
	ModeId,
	ModeProfile,
	ModeSessionHistory,
	ResolvedAgentConfiguration,
	TaskSessions,
} from "./types.ts";
import type { SessionHandoff, WorkspaceContext } from "./workspace-context.ts";

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

export type SessionCheckpointPhase = "reservation" | "identity" | "ready" | "rollback";
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
 */
export interface LifecycleCheckpoint {
	readonly phase: SessionCheckpointPhase;
	readonly origin: SessionCheckpointOrigin;
	readonly expectedMembership: ExpectedSessionMembership;
	readonly record: Immutable<AgentSession>;
}

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
	/** Stop the current execution and publish the stopped record. Retains the conversation. */
	stop(publication: SessionPublication): Promise<void>;
	inject(text: string): Promise<void>;
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
 * Shared application controller. Maps the existing `AgentSessionService` public operations
 * one-for-one (see `AGENT_SESSION_SERVICE_MIGRATION`) and adds Task hydration. Construction is
 * UI-independent. The inputs the old service required are preserved deliberately: deletion
 * `force`, hand-off successor/predecessor identity, verified runtime origin, and mode destination.
 */
export interface SessionController {
	readonly tasks: readonly Task[];

	// Reads — never launch a runtime.
	list(taskId: string, requestedModeId?: ModeId): Promise<TaskSessions>;
	listMode(taskId: string, modeId: ModeId): Promise<TaskSessions>;
	liveSession(taskId: string, sessionId: string, options?: { passive?: boolean }): Promise<Session | undefined>;
	output(taskId: string, sessionId?: string, modeId?: ModeId): Promise<string>;
	touchUsage(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void>;

	// Creation, resume and adoption.
	prepareNewSession(taskId: string, modeId: ModeId): Promise<Session>;
	prepareNativeSession(taskId: string, sessionId?: string, requestedModeId?: ModeId): Promise<Session>;
	adoptPendingSession(taskId: string, sessionId: string): Promise<Session>;
	registerPendingSession(
		taskId: string,
		options: { preset?: string; replace?: boolean; modeId?: ModeId },
		context: WorkspaceContext,
	): Promise<void>;
	publishNativeIdentity(origin: LaunchOrigin, identity: NativeIdentity): Promise<void>;

	// Verified runtime transitions — origin is mandatory, never inferred from selection.
	activateNativeSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin): Promise<void>;
	finishNativeSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin): Promise<void>;
	parkNativeSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin): Promise<void>;

	// Stop and hand-off. Hand-off carries the captured successor and predecessor identity.
	stop(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void>;
	stopAllTaskSessions(taskId: string): Promise<void>;
	finalizeHandoff(taskId: string, successor: Immutable<AgentSession>, handoff: SessionHandoff): Promise<void>;
	rollbackHandoff(taskId: string, successor: Immutable<AgentSession>, handoff: SessionHandoff): Promise<void>;

	// Mutation and deletion.
	delete(taskId: string, sessionId: string, options?: { force?: boolean }): Promise<void>;
	forgetTaskSessions(taskId: string): Promise<void>;
	purge(taskId: string): Promise<void>;
	reset(taskId: string): Promise<void>;
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
