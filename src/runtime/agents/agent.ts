import { join } from "node:path";
import type {
	AgentActivity,
	AgentPreset,
	AgentSession,
	ModeId,
	ModeProfile,
	NativeAgentNamespace,
} from "../../model/session/types.ts";
import type { PreparedLaunchResources } from "../completion-supervisor-resources.ts";
import type { InstalledStatusHook } from "../status-hooks.ts";

export interface AgentChromeRule {
	readonly pattern: RegExp;
	readonly activity: AgentActivity;
}

export interface LaunchCommandRequest {
	preset: AgentPreset;
	bootstrapPath: string;
	nativeSessionId?: string;
}

export interface ResumeCommandRequest {
	preset: AgentPreset;
	nativeSessionId?: string;
}

export interface AskCommandRequest {
	preset: AgentPreset;
	nativeSessionId: string;
	question: string;
}

/** Whether this launch starts a fresh provider conversation or resumes one by its exact native ID. */
export type SessionIntent = { kind: "new" } | { kind: "resume"; nativeSessionId: string };

/**
 * A native conversation identity the adapter has established for a launch.
 * `client-established` is an authoritative client-chosen session name, not proof of successful
 * execution or provider creation; `provider-confirmed` was observed from the provider.
 */
export type NativeIdentity = { id: string; basis: "provider-confirmed" | "client-established" };

export type ReadinessExpectation = string | Readonly<Record<string, string>>;
export type AgentEventCapabilities = {
	readonly turnCompleted: "supported" | "unsupported";
	readonly permissionWait: "supported" | "unsupported";
	readonly executionExit: "supported" | "unsupported";
	readonly activity: "supported" | "unsupported";
};

/**
 * Everything a deferred identity delivery needs to reconcile one launch.
 * It identifies the exact expected record, its owning mode, the exact owned pane, and the
 * launch-resource provenance that distinguishes this launch from a replacement.
 */
export interface LaunchOrigin {
	/** Exact durable record this launch owns; membership and generation are checked against it. */
	record: AgentSession;
	/** Owning mode of the record. */
	modeId: ModeId;
	/** Exact owned pane for this launch. */
	paneId: string;
	/** Launch provenance: the resource inventory recorded on the pane for this launch. */
	resources: PreparedLaunchResources;
}

export interface PreparationResources {
	/** Command already includes the provider-agnostic yolo flag when yolo mode is on. */
	preset: AgentPreset;
	cwd: string;
	bootstrapPath: string;
	/** The per-launch mkdtemp root owned and removed by prepareAgentLaunch. */
	directory: string;
	skillRoot: string; // <directory>/skills
	skillPath: string; // <directory>/skills/agentic-workspace-task-management/SKILL.md
	statusDir?: string;
	sessionId?: string;
	env: Record<string, string>; // mutable launch environment (already has FORBIDDEN_ENV stripped)
	title?: string;
	profile: ModeProfile;
	repositoryRoot?: string;
	taskRoot?: string;
	preflightResult?: unknown;
}

export interface AgentPreflightRequest {
	preset: AgentPreset;
	cwd: string;
	bootstrapPath: string;
	nativeSessionId?: string;
	resume: boolean;
	env: Record<string, string>;
	sessionId?: string;
	profile: ModeProfile;
}

export interface AgentModel {
	id: string;
	name?: string;
}

export interface ModelDiscoveryRequest {
	command: string;
	env: Record<string, string>;
	timeoutMs: number;
}

export interface AgentPreparation {
	/** The complete provider command for this intent (base preset.command + provider flags + launch/resume args). */
	command: string;
	env: Record<string, string>;
	/** Present when the adapter established an identity during prepare; absent means it is deferred. */
	identity?: NativeIdentity;
	/** Optional transient exact-session confirmation; never persisted beyond this prepared launch. */
	confirmSession?: (expectedNativeSessionId: string) => Promise<boolean>;
}

export interface StatusHookInstallOptions {
	pluginDir: string;
	statusDir: string;
	sessionId?: string;
}

export interface Agent {
	readonly name: string;
	readonly events?: AgentEventCapabilities;
	readonly supported: boolean;
	readonly hookBacked: boolean;
	readonly prepareBeforeAsk: boolean;
	readonly chromeRules: readonly AgentChromeRule[];
	readonly nativeNamespace: NativeAgentNamespace;
	sanitizeLaunchPreset(preset: AgentPreset): AgentPreset;
	yoloFlag(): string | undefined;
	launchCommand(request: LaunchCommandRequest): string;
	resumeCommand(request: ResumeCommandRequest): string;
	askCommand(request: AskCommandRequest): string;
	preflightLaunch?(request: AgentPreflightRequest): Promise<unknown>;
	prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation>;
	/** Provider-owned receipt evidence required before launch/resume can return. */
	readiness?(
		intent: SessionIntent,
		launchDirectory: string,
		identity?: NativeIdentity,
	): {
		initialized: { path: string; expected?: ReadinessExpectation };
		promptAccepted?: { path: string; expected?: ReadinessExpectation };
		confirmationRequired?: boolean;
	};
	/**
	 * Acquire a deferred native identity from the provider and publish it exactly once.
	 * Immediate-identity adapters implement this as a no-op; a receipt-based adapter reads its
	 * provider-written receipt and publishes a `provider-confirmed` identity when it exists.
	 */
	reconcileIdentity(origin: LaunchOrigin, publish: (identity: NativeIdentity) => Promise<void>): Promise<void>;
	discoverModels?(request: ModelDiscoveryRequest): Promise<AgentModel[]>;
	prepareProfile?(profile: ModeProfile, preset: AgentPreset): AgentPreset;
	installStatusHooks(options: StatusHookInstallOptions): Promise<InstalledStatusHook>;
}

export function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/** Shared readiness receipt paths for adapters whose expected value is the native session ID. */
export function readinessReceipts(
	intent: SessionIntent,
	launchDirectory: string,
	identity?: NativeIdentity,
): {
	initialized: { path: string; expected?: ReadinessExpectation };
	promptAccepted?: { path: string; expected?: ReadinessExpectation };
} {
	const id = identity?.id ?? (intent.kind === "resume" ? intent.nativeSessionId : undefined);
	return {
		initialized: { path: join(launchDirectory, "initialized"), ...(id ? { expected: id } : {}) },
		...(intent.kind === "new"
			? { promptAccepted: { path: join(launchDirectory, "prompt-accepted"), ...(id ? { expected: id } : {}) } }
			: {}),
	};
}

/** Validate and quote the exact session ID and question shared by the simple ask commands. */
export function quotedAskArguments(nativeSessionId: string, question: string): string {
	if (!nativeSessionId.trim()) {
		throw new Error("Cannot ask this agent without its exact native session ID; start a new session instead.");
	}
	return `${shellQuote(nativeSessionId)} ${shellQuote(question)}`;
}
