import type { AgentSession, TaskSessions } from "../agent-workspace/types.ts";

export interface TaskWorktreeCleanupAdapter {
	listAllSessions(): Promise<Map<string, TaskSessions>>;
	cleanup(session: AgentSession): Promise<void>;
}

export type OwnedNativeSessionStops = ReadonlyMap<string, () => Promise<void>>;
export type TaskWorktreeSessionCleanup = (taskId: string, ownedStops?: OwnedNativeSessionStops) => Promise<void>;

/** Clean sessions by UUID across every mode before removing their task's shared worktree. */
export async function cleanupTaskWorktreeSessions(taskId: string, adapter: TaskWorktreeCleanupAdapter): Promise<void> {
	const state = (await adapter.listAllSessions()).get(taskId);
	if (!state) return;
	const records = [...state.sessions, ...Object.values(state.modes ?? {}).flatMap((history) => history.sessions)];
	const seen = new Set<string>();
	for (const session of records) {
		if (seen.has(session.id)) continue;
		seen.add(session.id);
		if (session.status === "running" || session.status === "starting") await adapter.cleanup(session);
	}
}

/** Return a view-state patch for the final worktree-removal owner to persist. */
export function withoutSelectedModeForTask<T extends { selectedModeByTask?: Record<string, unknown> }>(
	state: T,
	taskId: string,
): T {
	if (!state.selectedModeByTask || !(taskId in state.selectedModeByTask)) return state;
	const selectedModeByTask = { ...state.selectedModeByTask };
	delete selectedModeByTask[taskId];
	return { ...state, selectedModeByTask };
}
