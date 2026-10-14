import type { Task as TaskRecord } from "../types/index.ts";
import type {
	AgentActivity,
	AgentPreset,
	AgentSession,
	AgentSessionStatus,
	ModeId,
	ModeProfile,
	ModeSessionHistory,
	ResolvedAgentConfiguration,
} from "./types.ts";

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

export interface LifecycleCheckpoint {
	readonly phase: SessionCheckpointPhase;
	readonly origin: SessionCheckpointOrigin;
	readonly expectedMembership: ExpectedSessionMembership;
	readonly record: Immutable<AgentSession>;
	readonly history: Immutable<ModeSessionHistory>;
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
}

export interface Session {
	readonly id: string;
	readonly record: Readonly<AgentSession>;
	readonly execution?: RunningExecution;
	/**
	 * New conversation. Awaits the approved R-A readiness contract (identity, provider
	 * initialization, and initial-prompt acknowledgment) plus every required checkpoint.
	 * A rejected checkpoint prevents dependent effects.
	 */
	start(): Promise<void>;
	/**
	 * Exact resume. Preserves the conversation identity and rejects when the exact conversation
	 * cannot be resumed — never falling back to a fresh session. Resume readiness is identity
	 * plus provider initialization only; no bootstrap is replayed.
	 */
	resume(nativeId: string): Promise<void>;
	stop(): Promise<void>;
	inject(text: string): Promise<void>;
	subscribe(listener: (event: SessionEvent) => void): Unsubscribe;
	serialize(): AgentSession;
}

/**
 * Controller-bound, operation-scoped factory. It holds the lifecycle checkpoint sink, the
 * resolved Harness, and the controller-resolved launch inputs (working directory/path context,
 * resolved configuration, mode profile, preset, and composed bootstrap prompt). Task calls
 * `provision` and never sees storage, locking, or runtime configuration.
 */
export interface SessionCreationFactory {
	/**
	 * Synchronously provisions the provisional `starting` record and returns the unstarted
	 * Session. No I/O and no runtime dispatch occur here; Task inserts the record and awaits
	 * `session.start()`. Reconstructing a Session for resume from an existing record is
	 * controller-owned and does not use this factory.
	 */
	provision(input: { readonly taskId: string; readonly modeId: ModeId }): Session;
}

export interface TaskHydrationInput {
	readonly task: TaskRecord;
	readonly modes: Readonly<Record<ModeId, ModeProfile>>;
	readonly configuration: ResolvedAgentConfiguration;
	readonly sessionRecords: Readonly<Record<ModeId, readonly AgentSession[]>>;
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
	/** Calls capture synchronously after provisional insertion and before awaiting startup. */
	newSession(modeId: ModeId, capture: (creation: TaskSessionCreation) => void): Promise<Session>;
	rollbackSession(creation: SessionCreationIdentity): void;
}

export interface SessionController {
	readonly tasks: readonly Task[];
	deleteMode(taskId: string, modeId: ModeId): Promise<void>;
	list(taskId: string): Promise<AgentSession[]>;
	listMode(taskId: string, modeId: ModeId): Promise<AgentSession[]>;
	publishNativeIdentity(taskId: string, modeId: ModeId, sessionId: string, nativeId: string): Promise<void>;
	reset(taskId: string): Promise<void>;
	purge(taskId: string, sessionId: string): Promise<void>;
	forgetTaskSessions(taskId: string): Promise<void>;
	delete(taskId: string, sessionId: string): Promise<void>;
	liveSession(taskId: string, sessionId: string): Promise<Session | undefined>;
	prepareNativeSession(taskId: string, modeId: ModeId, nativeId: string): Promise<Session>;
	prepareNewSession(taskId: string, modeId: ModeId): Promise<Session>;
	adoptPendingSession(taskId: string, sessionId: string): Promise<Session>;
	activateNativeSession(taskId: string, sessionId: string): Promise<void>;
	finishNativeSession(taskId: string, sessionId: string): Promise<void>;
	parkNativeSession(taskId: string, sessionId: string): Promise<void>;
	start(taskId: string, modeId: ModeId): Promise<Session>;
	registerPendingSession(taskId: string, sessionId: string): Promise<void>;
	rollbackHandoff(taskId: string, sessionId: string): Promise<void>;
	finalizeHandoff(taskId: string, sessionId: string): Promise<void>;
	stop(taskId: string, sessionId: string): Promise<void>;
	stopAllTaskSessions(taskId: string): Promise<void>;
	output(taskId: string, sessionId: string, lines?: number): Promise<string>;
	attach(taskId: string, sessionId: string): Promise<void>;
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
