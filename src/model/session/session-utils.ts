import { slug } from "../../lib/slug.ts";
import type { AgentSession, ModeId, ModeSessionHistory, TaskSessions } from "./types.ts";

export { slug } from "../../lib/slug.ts";

export function findSessionById(sessions: AgentSession[], sessionId: string | undefined): AgentSession | undefined {
	if (sessionId === undefined) return undefined;
	return sessions.find((session) => session.id === sessionId);
}

export function findActiveSession(state: Pick<TaskSessions, "sessions" | "activeSessionId">): AgentSession | undefined {
	return findSessionById(state.sessions, state.activeSessionId);
}

/** Select a mode history without treating any other mode's active pointer as authoritative. */
export function findModeActiveSession(history: ModeSessionHistory | undefined): AgentSession | undefined {
	return history ? findSessionById(history.sessions, history.activeSessionId) : undefined;
}

/** Resolve a session's fixed mode from nested ownership. */
export function findSessionMode(modes?: Record<ModeId, ModeSessionHistory>, sessionId = ""): ModeId | undefined {
	if (!modes) return undefined;
	for (const [modeId, history] of Object.entries(modes)) {
		if (history.sessions.some((session) => session.id === sessionId)) return modeId;
	}
	return undefined;
}

/** Return each session across mode histories. */
export function allModeSessions(state?: { modes?: Record<ModeId, ModeSessionHistory> }): AgentSession[] {
	const modes = state?.modes;
	if (!modes || Object.keys(modes).length === 0) return [];

	const sessions: AgentSession[] = [];
	const seen = new Set<string>();
	for (const [, history] of Object.entries(modes)) {
		for (const session of history.sessions) {
			if (seen.has(session.id)) continue;
			seen.add(session.id);
			sessions.push(session);
		}
	}
	return sessions;
}

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
export const AGENTIC_WORKSPACE_SESSION_NAME_PATTERN = /^agentic-workspace-[a-z0-9-]+-[0-9a-f]{8}$/;

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
