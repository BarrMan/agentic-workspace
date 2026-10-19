import type { BoardSharedFilters } from "../configuration.ts";

/** Filters that change visible task order make a drag/reorder target ambiguous. */
export type MoveBlockingBoardFilterPolicy = Partial<
	Pick<
		BoardSharedFilters,
		| "excludeStatus"
		| "searchQuery"
		| "typeFilter"
		| "projectFilter"
		| "priorityFilter"
		| "labelFilter"
		| "milestoneFilter"
		| "limit"
	>
>;

export function hasMoveBlockingBoardFilters(filters: MoveBlockingBoardFilterPolicy): boolean {
	return Boolean(
		filters.searchQuery?.trim() ||
			(filters.typeFilter?.length ?? 0) > 0 ||
			(filters.projectFilter?.length ?? 0) > 0 ||
			filters.priorityFilter ||
			(filters.labelFilter?.length ?? 0) > 0 ||
			filters.milestoneFilter ||
			filters.limit !== undefined,
	);
}
