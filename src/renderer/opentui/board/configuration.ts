import type { LabelMatchMode } from "../../../model/types.ts";

export type BoardSharedFilters = {
	searchQuery: string;
	excludeStatus?: string[];
	typeFilter?: string[];
	projectFilter?: string[];
	priorityFilter: string;
	labelFilter: string[];
	labelMatch: LabelMatchMode;
	milestoneFilter: string;
	limit?: number;
};
