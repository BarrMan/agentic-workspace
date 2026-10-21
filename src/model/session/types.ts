import type { TmuxExec } from "../../runtime/live/tmux/types.ts";
import type { TmuxServer } from "../../runtime/session-process.ts";
import type { ModeTextColor } from "./mode-colors.ts";

/** Public harness choices shown by the TUI. */
export const AGENT_BOOTSTRAP_TYPES = ["opencode", "claude", "pi"] as const;
export type AgentBootstrap = (typeof AGENT_BOOTSTRAP_TYPES)[number];

/** Concrete OpenCode adapters are chosen at execution time, never configured directly. */
const INTERNAL_AGENT_BOOTSTRAP_TYPES = ["opencode-v1", "opencode-v2"] as const;
export type InternalAgentBootstrap = (typeof INTERNAL_AGENT_BOOTSTRAP_TYPES)[number];
export type RuntimeAgentBootstrap = AgentBootstrap | InternalAgentBootstrap;

export const NATIVE_AGENT_NAMESPACES = ["opencode", "claude", "pi"] as const;
export type NativeAgentNamespace = (typeof NATIVE_AGENT_NAMESPACES)[number];

const AGENT_CONFIG_SCOPES = ["root", "project", "card"] as const;
export type AgentConfigScope = (typeof AGENT_CONFIG_SCOPES)[number];

export type ModeId = string;
export type ModeModel = { kind: "default" } | { kind: "explicit"; id: string };
export type RepositoryPermission = "none" | "read" | "read-write";
export type TaskPermission = "read" | "read-write";
export type ArtifactPermission = "read" | "read-write";

export interface ModeArtifact {
	path: string;
	purpose: string;
}

export interface ModeProfile {
	name: string;
	textColor?: ModeTextColor;
	model: ModeModel;
	prompt: string;
	permissions: {
		repository: RepositoryPermission;
		task: TaskPermission;
		artifacts: ArtifactPermission;
		subagents: "allowed" | "disabled";
	};
	artifacts: ModeArtifact[];
	approvalArtifact?: string;
}

export interface ModeCatalog {
	version: 1;
	defaultModeId: ModeId;
	order: ModeId[];
	profiles: Record<ModeId, ModeProfile>;
}

export interface ModeSessionHistory {
	sessions: AgentSession[];
	activeSessionId?: string;
}

export interface AgentConversationContext {
	taskId: string;
	modeId: ModeId;
	sessionId: string;
}

export type SessionState = "starting" | "running" | "parked" | "stopped" | "unknown";
export type SessionActivity = "working" | "waiting" | "idle" | "unknown";

/** Provider-facing activity is normalized by Session before consumers observe it. */
export type AgentActivity = "starting" | "running" | "waiting" | "idle" | "unknown" | "error" | "stopped";

export interface SessionSnapshot {
	readonly state: SessionState;
	readonly activity: SessionActivity;
	/** Timestamp of the current uninterrupted positive idle observation. */
	readonly idleSince: number | null;
}

/**
 * The row indication shown for a task's active agent session, derived from activity events.
 */
const AGENT_INDICATION = {
	WORKING: "working",
	PARKED: "parked",
	WAITING: "waiting",
	ERROR: "error",
	ENDED: "ended",
} as const;
export type AgentIndication = (typeof AGENT_INDICATION)[keyof typeof AGENT_INDICATION];

/**
 * Map a normalized activity to the settled row indication. `working` is the only green; every
 * non-working active state is the blue parked indication; no activity evidence means no indication.
 */
export function activityToIndication(activity: SessionActivity | undefined): AgentIndication | undefined {
	switch (activity) {
		case "working":
			return "working";
		case "waiting":
			return "waiting";
		case "idle":
		case "unknown":
			return "parked";
		case undefined:
			return undefined;
	}
}

/**
 * Liveness/activity metadata one tmux probe reads for a pane.
 *
 * `windowActivity` is the pane window's activity second (`#{window_activity}`); it is what lets a
 * probe skip an unchanged capture (`skip_capture`) and makes an idle agent cost zero captures.
 */
export interface ActivityMetadata {
	readonly paneDead: boolean;
	readonly windowActivity: number;
}

/** A preset is complete when defined; preset fields are not inherited independently. */
export interface AgentPreset {
	command: string[];
	env: Record<string, string>;
	prepare: string;
	/** How startup instructions are delivered to the agent. */
	bootstrap: RuntimeAgentBootstrap;
	/**
	 * Overrides native resume syntax.
	 * When absent, AgenticWorkspace uses this bootstrap type's documented default.
	 */
	resumeFlag?: string;
}

/**
 * Session-wide behavior shared by every preset, editable from the Settings "Sessions" tab.
 * Persisted scopes may override individual fields; effective configuration resolves them field by field.
 */
export interface SessionSettings {
	/** Create a task-owned git worktree on task creation and remove it when the task reaches Done. */
	worktreePerTask: boolean;
	/** Launch agents with their provider's auto-approval flag so they do not prompt for permissions. */
	yoloMode: boolean;
	/** Resume eligible native agent sessions after a workspace restart. */
	autoResumeOnRestart?: boolean;
}

const DEFAULT_SESSION_SETTINGS: SessionSettings = {
	worktreePerTask: false,
	yoloMode: false,
	autoResumeOnRestart: true,
};

/** Missing settings use built-in defaults; stored booleans are never re-interpreted. */
export function resolveSessionSettings(
	config: { sessions?: Partial<SessionSettings> } | undefined | null,
): SessionSettings {
	return {
		...DEFAULT_SESSION_SETTINGS,
		...(config?.sessions ?? {}),
		autoResumeOnRestart: config?.sessions?.autoResumeOnRestart ?? true,
	};
}

export interface AgentConfiguration {
	/** Exact persisted scope values. Absent fields inherit in the effective configuration. */
	selectedPreset?: string;
	presets?: Record<string, AgentPreset>;
	sessions?: Partial<SessionSettings>;
	/** Project-owned only; root and card records are rejected by the configuration schema. */
	modes?: ModeCatalog;
}

/** Fresh field-wise resolution of built-in, root, project, and optional task overrides. */
export interface EffectiveAgentConfiguration {
	selectedPreset: string;
	presets: Record<string, AgentPreset>;
	sessions: SessionSettings;
	modes?: ModeCatalog;
}

export interface ResolvedAgentConfiguration {
	scope: AgentConfigScope;
	config: EffectiveAgentConfiguration;
}

export interface AgentSession {
	id: string;
	taskId: string;
	preset: string;
	/** Name of the temporary backing tmux session created during launch. */
	tmuxName: string;
	/** Native agent conversation/session id, when the CLI supports exact resume identity. */
	nativeSessionId?: string;
	/** Adapter namespace recorded when this native conversation was first launched. */
	nativeProvider?: NativeAgentNamespace;
	/** Provenance: this session's private tmux server belongs to the native workspace. */
	nativeWorkspace?: boolean;
	cwd: string;
	/** Immutable canonical project, session worktree, and task-artifact roots captured at creation. */
	pathContext?: AgentSessionPathContext;
	createdAt: string;
	ownerPid?: number;
	outputPath: string;
	bootstrapPath: string;
	lastUsedAt?: string;
	useCount?: number;
}

export type Unsubscribe = () => void;

/** Runtime-owned pane identity and renderer-owned terminal transport inputs. */
export interface TerminalAttachment {
	readonly record: Readonly<AgentSession>;
	readonly paneId: string;
	readonly server: TmuxServer;
	readonly exec: TmuxExec;
	readonly outputPath: string;
	readonly bootstrap: string;
}

export type SessionFactory = (taskId: string, modeId: ModeId, record?: AgentSession) => import("./session.ts").Session;

export type RetainedSessionObservation = "absent" | "live" | "unknown";

export interface PreparedSessionStop {
	stop(): Promise<void>;
}

export interface SessionAskContext {
	readonly preset: AgentPreset;
	readonly question: string;
	readonly profile: ModeProfile;
	readonly roots: {
		readonly repositoryRoot: string;
		readonly taskRoot: string;
		readonly cwd: string;
		readonly taskId?: string;
		readonly modeId?: string;
		readonly sessionId?: string;
	};
}

export interface SessionLaunchContext {
	readonly taskId: string;
	readonly modeId: ModeId;
	readonly sessionId: string;
	readonly record: Readonly<AgentSession>;
	readonly configuration: ResolvedAgentConfiguration;
	readonly profile: Readonly<ModeProfile>;
	readonly preset: Readonly<AgentPreset>;
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
	/** Supplied by the runtime when it observed the provider evidence. */
	readonly observedAt: number;
}

export interface RunningExecution {
	readonly identity: ExecutionIdentity;
	readonly providerConversationId?: string;
	readonly events: Readonly<RunningExecutionEvents>;
	input(text: string): Promise<void>;
	sendKey(key: string): Promise<void>;
	stop(): Promise<void>;
	observe(listener: (event: RunningExecutionEvent) => void): Unsubscribe;
	teardownListeners(): void;
}

/** Genuine provider variation point implemented by Harness. */
export interface HarnessProvider {
	launch(context: SessionLaunchContext): Promise<RunningExecution>;
	resume(nativeId: string, context: SessionLaunchContext): Promise<RunningExecution>;
}

export interface AgentSessionPathContext {
	projectDir: string;
	worktreeDir: string;
	taskDir: string;
}

export interface TaskSessions {
	taskId: string;
	activeSessionId?: string;
	worktreePath?: string;
	sessions: AgentSession[];
	/** Per-mode histories; `sessions` is the selected mode's projection for service callers. */
	modes?: Record<ModeId, ModeSessionHistory>;
}
