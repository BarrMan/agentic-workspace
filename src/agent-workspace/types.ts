import type { ModeTextColor } from "./mode-colors.ts";

/** Public harness choices accepted in `agents.json` and shown by the TUI. */
export const AGENT_BOOTSTRAP_TYPES = ["opencode", "claude", "pi"] as const;
export type AgentBootstrap = (typeof AGENT_BOOTSTRAP_TYPES)[number];

/** Concrete OpenCode adapters are chosen at execution time, never configured directly. */
export const INTERNAL_AGENT_BOOTSTRAP_TYPES = ["opencode-v1", "opencode-v2"] as const;
export type InternalAgentBootstrap = (typeof INTERNAL_AGENT_BOOTSTRAP_TYPES)[number];
export type RuntimeAgentBootstrap = AgentBootstrap | InternalAgentBootstrap;

export const NATIVE_AGENT_NAMESPACES = ["opencode", "claude", "pi"] as const;
export type NativeAgentNamespace = (typeof NATIVE_AGENT_NAMESPACES)[number];

export const AGENT_CONFIG_SCOPES = ["root", "project", "card"] as const;
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

/** Target artifact contract; service implementation is introduced with task containers in Phase 2. */
export type ArtifactApprovalState = "missing" | "draft" | "approved";
export interface ArtifactApproval {
	sha256: string;
	approvedAt: string;
}
export interface ArtifactApprovalSidecar {
	version: 1;
	approvals: Record<string, ArtifactApproval>;
}
export interface ArtifactStatus {
	path: string;
	state: ArtifactApprovalState;
	sha256?: string;
	approvedAt?: string;
}

/** Phase 2 storage boundary; reviewedHash binds approval to the bytes actually shown to the user. */
export interface TaskArtifactServiceContract {
	containerPath(taskId: string): Promise<string>;
	list(taskId: string): Promise<ArtifactStatus[]>;
	read(taskId: string, relativePath: string): Promise<{ bytes: Uint8Array; status: ArtifactStatus }>;
	write(taskId: string, relativePath: string, bytes: Uint8Array): Promise<ArtifactStatus>;
	approveCurrentVersion(taskId: string, relativePath: string, reviewedHash: string): Promise<ArtifactStatus>;
	revokeApproval(taskId: string, relativePath: string): Promise<ArtifactStatus>;
}

/** Optional adapter hooks: discovery/preparation are capabilities, not required for legacy adapters. */
export interface AgentProfileCapabilities {
	discoverModels?: (options: {
		command: string;
		env: Record<string, string>;
		timeoutMs: number;
	}) => Promise<Array<{ id: string; name?: string }>>;
	prepareProfile?: (options: {
		profile: ModeProfile;
		preset: AgentPreset;
	}) => Promise<{ command: string; env: Record<string, string> }>;
}

export interface AgentConversationContext {
	taskId: string;
	modeId: ModeId;
	sessionId: string;
}

export const AGENT_SESSION_STATUS = {
	STARTING: "starting",
	RUNNING: "running",
	/**
	 * The session exists and is the task's active conversation, but its process is not running
	 * (for example because the workspace killed it on exit to free memory). A parked session is
	 * resumable and is never terminal; it renders as the blue "parked" indication.
	 */
	PARKED: "parked",
	STOPPED: "stopped",
	FAILED: "failed",
} as const;
export type AgentSessionStatus = (typeof AGENT_SESSION_STATUS)[keyof typeof AGENT_SESSION_STATUS];

/**
 * Derived, in-memory agent activity overlay. It is a second axis beside the durable
 * {@link AgentSessionStatus}: it never replaces the lifecycle status and is never persisted
 * (`[D2]`). The vocabulary mirrors AOE's hook status set plus the derived `starting`/`unknown`/
 * `stopped` values; there is deliberately no `Done`.
 */
export const AGENT_ACTIVITY_STATUS = {
	STARTING: "starting",
	RUNNING: "running",
	WAITING: "waiting",
	IDLE: "idle",
	UNKNOWN: "unknown",
	ERROR: "error",
	STOPPED: "stopped",
} as const;
export type AgentActivity = (typeof AGENT_ACTIVITY_STATUS)[keyof typeof AGENT_ACTIVITY_STATUS];

/**
 * The row indication shown for a task's active agent session, derived from activity events.
 */
export const AGENT_INDICATION = {
	WORKING: "working",
	PARKED: "parked",
	WAITING: "waiting",
	ERROR: "error",
	ENDED: "ended",
} as const;
export type AgentIndication = (typeof AGENT_INDICATION)[keyof typeof AGENT_INDICATION];

/**
 * Map a derived activity to the settled row indication. `running` is the only green; every
 * non-working active state is the blue parked indication; no activity evidence means no indication.
 */
export function activityToIndication(activity: AgentActivity | undefined): AgentIndication | undefined {
	switch (activity) {
		case "running":
			return "working";
		case "waiting":
			return "waiting";
		case "error":
			return "error";
		case "idle":
		case "unknown":
		case "starting":
			return "parked";
		case undefined:
			return undefined;
		case "stopped":
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

/** Complete configurations replace their parent; fields are never inherited. */
export interface AgentPreset {
	command: string;
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
 * Stored on {@link AgentConfiguration} so project and card scopes inherit it through the normal
 * complete-scope replacement rules.
 */
export interface SessionSettings {
	/** Create a task-owned git worktree on task creation and remove it when the task reaches Done. */
	worktreePerTask: boolean;
	/** Launch agents with their provider's auto-approval flag so they do not prompt for permissions. */
	yoloMode: boolean;
	/** Resume eligible native agent sessions after a workspace restart. */
	autoResumeOnRestart?: boolean;
}

export const DEFAULT_SESSION_SETTINGS: SessionSettings = {
	worktreePerTask: false,
	yoloMode: false,
	autoResumeOnRestart: true,
};

/** Missing settings use built-in defaults; stored booleans are never re-interpreted. */
export function resolveSessionSettings(
	config: Pick<AgentConfiguration, "sessions"> | undefined | null,
): SessionSettings {
	return {
		...DEFAULT_SESSION_SETTINGS,
		...(config?.sessions ?? {}),
		autoResumeOnRestart: config?.sessions?.autoResumeOnRestart ?? true,
	};
}

export interface AgentConfiguration {
	selectedPreset: string;
	presets: Record<string, AgentPreset>;
	/** Optional so pre-existing scoped files without it keep loading unchanged. */
	sessions?: SessionSettings;
	/** Project-scoped catalog. It is intentionally not resolved from root/card preset scopes. */
	modes?: ModeCatalog;
}

export interface ResolvedAgentConfiguration {
	scope: AgentConfigScope;
	config: AgentConfiguration;
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
	/** Older binaries reject records containing this marker. */
	resumeProbeFailed?: { nativeProvider: NativeAgentNamespace; nativeSessionId: string };
	/** Native workspace owns this session's private tmux server, not the shared CLI backend. */
	nativeWorkspace?: boolean;
	cwd: string;
	/** Immutable canonical project, session worktree, and task-artifact roots captured at creation. */
	pathContext?: AgentSessionPathContext;
	createdAt: string;
	endedAt?: string;
	status: AgentSessionStatus;
	ownerPid?: number;
	outputPath: string;
	bootstrapPath: string;
	error?: string;
	lastUsedAt?: string;
	useCount?: number;
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
	/** Future state version replaces the flat history above; legacy readers keep using sessions. */
	modes?: Record<ModeId, ModeSessionHistory>;
}
