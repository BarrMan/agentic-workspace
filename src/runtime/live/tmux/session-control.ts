/**
 * Session-scoped ownership primitives for the shared default tmux server.
 *
 * Every native workspace agent is one named session on the developer's *default* tmux server. Shared
 * teardown therefore kills exactly one owned session — `kill-session -t <name>` — and never a server:
 * a `kill-server` on the default socket would destroy every unrelated session on the machine. Names
 * are validated against the project grammar before any command is built, so neither a bug nor a
 * stray literal can route this at a foreign session.
 */

import { isMissingTmuxTarget } from "../../../lib/process-tree.ts";
import { isAgenticWorkspaceSessionName } from "../../../model/session/session-utils.ts";
import type { TmuxResult } from "./types.ts";

/**
 * The single tmux invocation seam this module needs. Structurally satisfied by `TmuxExec["run"]`,
 * so a real exec can be passed straight through.
 */
export type TmuxRunner = (argv: readonly string[]) => Promise<TmuxResult>;

/** Reject any name that is not a project session name before a command is built from it. */
export function assertOwnedSessionName(sessionName: string): void {
	if (!isAgenticWorkspaceSessionName(sessionName)) {
		throw new Error(
			`refusing to address tmux session "${sessionName}": expected agentic-workspace-<task-slug>-<8 hex chars>`,
		);
	}
}

/** tmux's own wordings for "no such session", plus the server-absent wordings. */
const sessionAbsent = (output: string): boolean =>
	isMissingTmuxTarget(output) || /can't find session|no sessions/i.test(output);

/** True only when the named session exists on the addressed server. Never throws on absence. */
export async function hasOwnedSession(sessionName: string, run: TmuxRunner): Promise<boolean> {
	assertOwnedSessionName(sessionName);
	const result = await run(["has-session", "-t", sessionName]);
	return result.exitCode === 0;
}

/**
 * Kill exactly one owned session and prove it is gone.
 *
 * `kill-session -t <name>` is the only destructive command here: it can never reach another
 * session, and if the named session is the last one on the server tmux retires the (empty) server
 * itself. A follow-up `has-session` proves absence; a probe that merely timed out or failed to spawn
 * is inconclusive, but is never a reason to escalate to a server kill.
 */
export async function killOwnedSession(sessionName: string, run: TmuxRunner): Promise<void> {
	assertOwnedSessionName(sessionName);
	await run(["kill-session", "-t", sessionName]);
	const probe = await run(["has-session", "-t", sessionName]);
	if (probe.exitCode === 0) {
		throw new Error(`tmux session ${sessionName} is still running after kill-session`);
	}
	if (!sessionAbsent(`${probe.stderr}${probe.stdout}`)) {
		throw new Error(
			`could not prove tmux session ${sessionName} is gone after kill-session (probe exit ${probe.exitCode}: ${`${probe.stderr}${probe.stdout}`.trim()})`,
		);
	}
}
