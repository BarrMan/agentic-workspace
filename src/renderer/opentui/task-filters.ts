import type { TaskFilterOptions } from "../../model/task/task-search.ts";
import type { LabelMatchMode } from "../../model/types.ts";

/** Shared filter state for the OpenTUI workspace and board. */
export interface FilterState {
	search: string;
	status: string[];
	taskTypes: string[];
	projects: string[];
	priority: string;
	labels: string[];
	milestone: string;
}

export function taskFilterOptions(filters: FilterState, labelMatch: LabelMatchMode = "any"): TaskFilterOptions {
	return {
		query: filters.search,
		status: filters.status.length > 0 ? [...filters.status] : undefined,
		type: filters.taskTypes,
		project: filters.projects,
		priority: filters.priority || undefined,
		labels: filters.labels,
		labelMatch,
		milestone: filters.milestone || undefined,
	};
}
