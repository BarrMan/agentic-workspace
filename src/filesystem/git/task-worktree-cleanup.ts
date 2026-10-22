export type OwnedNativeSessionStops = ReadonlyMap<string, () => Promise<void>>;
export type TaskWorktreeSessionCleanup = (taskId: string, ownedStops?: OwnedNativeSessionStops) => Promise<void>;

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
