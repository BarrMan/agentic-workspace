import type { LabelMatchMode, Milestone, Task } from "../../../types/index.ts";
import { collectAvailableLabels } from "../../../utils/label-filter.ts";
import { getPriorityOptions } from "../../../utils/priority-config.ts";
import { getProjectValues, resolveProjectValues } from "../../../utils/project-config.ts";
import { getTaskTypeValues, resolveTaskTypeValues } from "../../../utils/task-type-config.ts";

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

type NormalizedBoardSharedFilters = Omit<BoardSharedFilters, "excludeStatus" | "typeFilter" | "projectFilter"> & {
	excludeStatus: string[];
	typeFilter: string[];
	projectFilter: string[];
};

export type BoardSessionConfigurationOptions = {
	filters?: Partial<BoardSharedFilters>;
	availableLabels?: string[];
	availableMilestones?: string[];
	priorities?: string[];
	types?: string[];
	projects?: string[];
	milestoneEntities?: Milestone[];
	hideEmptyColumns?: boolean;
};

export function normalizeBoardSessionConfiguration(
	tasks: Task[],
	statuses: string[],
	options: BoardSessionConfigurationOptions | undefined,
) {
	const configuredTaskTypes = getTaskTypeValues(options?.types);
	const configuredProjects = getProjectValues(options?.projects);

	return {
		configuredWorkflowStatuses: [...statuses],
		hideEmptyColumns: options?.hideEmptyColumns ?? false,
		configuredTaskTypes,
		configuredProjects,
		sharedFilters: normalizeBoardSharedFilters(options?.filters, configuredTaskTypes, configuredProjects),
		configuredLabels: collectAvailableLabels(tasks, options?.availableLabels ?? []),
		priorityOptions: getPriorityOptions(options?.priorities),
		availableMilestones: collectBoardMilestoneLabels(options?.availableMilestones ?? [], tasks),
	};
}

function normalizeBoardSharedFilters(
	filters: BoardSessionConfigurationOptions["filters"],
	configuredTaskTypes: string[],
	configuredProjects: string[],
): NormalizedBoardSharedFilters {
	const {
		searchQuery = "",
		excludeStatus = [],
		typeFilter = [],
		projectFilter = [],
		priorityFilter = "",
		labelFilter = [],
		labelMatch = "any",
		milestoneFilter = "",
		limit,
	} = filters ?? {};
	return {
		searchQuery,
		excludeStatus: [...excludeStatus],
		typeFilter: resolveTaskTypeValues(typeFilter, configuredTaskTypes).values,
		projectFilter: resolveProjectValues(projectFilter, configuredProjects).values,
		priorityFilter,
		labelFilter: [...labelFilter],
		labelMatch,
		milestoneFilter,
		limit,
	};
}

export function collectBoardMilestoneLabels(availableMilestones: string[], tasks: Task[]): string[] {
	return Array.from(
		new Set([
			...availableMilestones,
			...tasks
				.map((task) => task.milestone?.trim())
				.filter((milestone): milestone is string => Boolean(milestone && milestone.length > 0)),
		]),
	).sort((a, b) => a.localeCompare(b));
}
