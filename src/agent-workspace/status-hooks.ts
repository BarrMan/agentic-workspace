/**
 * Process-scoped agent status emitters.
 *
 * Installed provider code lives inside the per-launch `mkdtemp` directory. Status writes go only
 * to the pre-created, launch-owned activity sidecar while its ownership marker exists; emitters
 * never recreate it. Nothing writes to provider home directories or global locations.
 *
 * Only the concrete providers have a verified process-scoped loader today (claude, OpenCode, pi).
 */

import { join } from "node:path";
import {
	buildHookCommand,
	HOOK_STATUS_VALUES,
	type HookStatus,
	STATUS_HOOK_OWNERSHIP_TRAILER,
} from "./agents/hook-script.ts";
import type { AgentPreset, RuntimeAgentBootstrap } from "./types.ts";

export type { HookStatus };
export { buildHookCommand, HOOK_STATUS_VALUES, STATUS_HOOK_OWNERSHIP_TRAILER };

/** The environment variable a launched agent reads to find its owned status sidecar directory. */
export const STATUS_DIR_ENV = "AGENTIC_WORKSPACE_AGENT_STATUS_DIR";

/**
 * The deterministic, ephemeral activity sidecar directory for one session.
 *
 * Derived from the session identity and its task directory — the same directory that already holds
 * `<sessionId>.log` and `<sessionId>.md` — so a session started by the CLI is readable by the
 * workspace (and vice versa) without persisting anything. It lives inside the project's own state
 * directory, never a user home or a global location, and the launch removes it on stop.
 */
export function sessionActivityDir(taskDir: string, sessionId: string): string {
	return join(taskDir, `${sessionId}.activity`);
}

/** The sidecar file whose contents are the last hook status and whose mtime is its freshness. */
export function activityStatusPath(statusDir: string): string {
	return join(statusDir, "status");
}

export interface InstalledStatusHook {
	readonly provider: RuntimeAgentBootstrap;
	/** Every file this install created, so a caller can prove nothing landed outside the temp dir. */
	readonly paths: readonly string[];
	/** Environment overrides the provider needs to discover the hook. */
	readonly env: Record<string, string>;
	/** Extra CLI arguments to append to the provider command. */
	readonly args: readonly string[];
}

/**
 * Install the process-scoped status hook for a hook-backed provider inside `directory`.
 *
 * Returns the exact files written plus any env/argument changes the provider needs. Providers
 * without a session-local loader throw rather than falling back to a global install.
 */
export async function installStatusHooks(
	preset: Pick<AgentPreset, "bootstrap" | "command">,
	options: { readonly pluginDir: string; readonly statusDir: string; readonly sessionId?: string },
): Promise<InstalledStatusHook> {
	const { agentFor } = await import("./agents/agents.ts");
	const agent = agentFor(preset.bootstrap);
	if (!agent) {
		throw new Error(
			`Provider ${preset.bootstrap} has no process-scoped status-hook loader; AgenticWorkspace must not install it globally.`,
		);
	}
	return agent.installStatusHooks(options);
}
