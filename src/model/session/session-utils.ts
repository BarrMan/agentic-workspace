import { slug } from "../../lib/slug.ts";

export { slug } from "../../lib/slug.ts";

export interface SessionCommandResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	timedOut?: boolean;
}

export function fail(prefix: string, result: Pick<SessionCommandResult, "stdout" | "stderr">): Error {
	const detail = (result.stderr || result.stdout).trim();
	return new Error(detail ? `${prefix}: ${detail}` : prefix);
}

/**
 * The grammar every tmux session this project owns must match: `agentic-workspace-<slug>-<8 hex>`.
 *
 * CLI sessions and native workspace sessions share it, so one ownership predicate covers both and a
 * startup sweep can recognise its own sessions on the shared default server. It is also the token
 * grammar of the workspace ownership context.
 */
const AGENTIC_WORKSPACE_SESSION_NAME_PATTERN = /^agentic-workspace-[a-z0-9-]+-[0-9a-f]{8}$/;

/** True when `name` is a tmux session name this project may own, kill, or reap. */
export function isAgenticWorkspaceSessionName(name: string): boolean {
	return AGENTIC_WORKSPACE_SESSION_NAME_PATTERN.test(name);
}

/**
 * The single name for one task session on the shared default server:
 * `agentic-workspace-<task-slug>-<first 8 hex of the session id>`.
 */
export function nativeSessionName(taskId: string, id: string): string {
	return `agentic-workspace-${slug(taskId)}-${id.slice(0, 8)}`;
}
