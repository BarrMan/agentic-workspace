import type { ModeCatalog, ModeId } from "../../../model/session/types.ts";
import { resolveSelectedMode } from "../../../storage/config.ts";
import type { ShortcutOverrides } from "../keybindings.ts";
import type { FilterState } from "../task-filters.ts";

export type SharedWorkspaceState = {
	filters: FilterState;
	detailsVisible: boolean;
	selectedTaskId?: string;
	selectedGroupId?: string;
	activeStatus?: string;
	keyboardOverrides?: ShortcutOverrides;
	/** UI selection only; session history and task frontmatter remain separate owners. */
	selectedModeByTask?: Record<string, ModeId>;
};

/** Keep malformed persisted values from leaking into mode selection. */
export function validateSelectedModeByTask(value: unknown): Record<string, ModeId> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
	const selected: Record<string, ModeId> = {};
	for (const [taskId, modeId] of Object.entries(value)) {
		if (taskId.trim() && typeof modeId === "string" && modeId.trim()) selected[taskId] = modeId;
	}
	return selected;
}

/** Resolve without writing state or creating any session/history records. */
export function selectedModeForTask(
	state: Pick<SharedWorkspaceState, "selectedModeByTask">,
	taskId: string,
	catalog: ModeCatalog,
): ModeId {
	const selected = validateSelectedModeByTask(state.selectedModeByTask)[taskId];
	return resolveSelectedMode(catalog, selected);
}

/** Call only after final task deletion; archive/completion must retain its selection. */
export function pruneSelectedModeForTask(state: SharedWorkspaceState, taskId: string): SharedWorkspaceState {
	if (!state.selectedModeByTask || !(taskId in state.selectedModeByTask)) return state;
	const selectedModeByTask = { ...state.selectedModeByTask };
	delete selectedModeByTask[taskId];
	return { ...state, selectedModeByTask };
}

export function createWorkspaceFilters(): FilterState {
	return { search: "", status: [], taskTypes: [], projects: [], priority: "", labels: [], milestone: "" };
}
