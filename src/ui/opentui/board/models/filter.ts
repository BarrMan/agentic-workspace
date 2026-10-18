import type { LabelMatchMode, Task } from "../../../../types/index.ts";
import { resolveProjectValues } from "../../../../utils/project-config.ts";
import { applyTaskFilters, createTaskSearchIndex } from "../../../../utils/task-search.ts";
import { resolveTaskTypeValues } from "../../../../utils/task-type-config.ts";
import type { BoardSharedFilters } from "../configuration.ts";
import { hasMoveBlockingBoardFilters } from "../policies/filter-policy.ts";

export type NormalizedBoardFilters = Omit<BoardSharedFilters, "excludeStatus" | "typeFilter" | "projectFilter"> & {
	excludeStatus: string[];
	typeFilter: string[];
	projectFilter: string[];
};

export class Filter {
	private state: NormalizedBoardFilters;
	private readonly options: { taskTypes?: string[]; projects?: string[] };

	constructor(filters: Partial<BoardSharedFilters> = {}, options: { taskTypes?: string[]; projects?: string[] } = {}) {
		this.options = { taskTypes: options.taskTypes, projects: options.projects };
		this.state = normalizeBoardFilters(filters, options);
	}

	get value(): Readonly<NormalizedBoardFilters> {
		return {
			...this.state,
			excludeStatus: [...this.state.excludeStatus],
			typeFilter: [...this.state.typeFilter],
			projectFilter: [...this.state.projectFilter],
			labelFilter: [...this.state.labelFilter],
		};
	}

	update(filters: Partial<BoardSharedFilters>): void {
		this.state = normalizeBoardFilters({ ...this.state, ...filters }, this.options);
	}

	get active(): boolean {
		const filters = this.state;
		return Boolean(
			filters.searchQuery.trim() ||
				filters.excludeStatus.length ||
				filters.typeFilter.length ||
				filters.projectFilter.length ||
				filters.priorityFilter ||
				filters.labelFilter.length ||
				filters.milestoneFilter ||
				filters.limit !== undefined,
		);
	}

	blocksMoves(): boolean {
		return hasMoveBlockingBoardFilters(this.value);
	}

	apply(tasks: readonly Task[]): Task[] {
		const corpus = [...tasks];
		const filters = this.state;
		const matching = this.active
			? applyTaskFilters(
					corpus,
					{
						query: filters.searchQuery,
						excludeStatus: filters.excludeStatus,
						type: filters.typeFilter,
						project: filters.projectFilter,
						priority: filters.priorityFilter || undefined,
						labels: filters.labelFilter,
						labelMatch: filters.labelMatch,
						milestone: filters.milestoneFilter || undefined,
					},
					filters.searchQuery.trim() ? createTaskSearchIndex(corpus) : undefined,
				)
			: corpus;
		return filters.limit === undefined ? matching : matching.slice(0, filters.limit);
	}
}

function normalizeBoardFilters(
	filters: Partial<BoardSharedFilters>,
	options: { taskTypes?: string[]; projects?: string[] },
): NormalizedBoardFilters {
	const labelMatch: LabelMatchMode = filters.labelMatch ?? "any";
	return {
		searchQuery: filters.searchQuery ?? "",
		excludeStatus: [...(filters.excludeStatus ?? [])],
		typeFilter: resolveTaskTypeValues(filters.typeFilter ?? [], options.taskTypes).values,
		projectFilter: resolveProjectValues(filters.projectFilter ?? [], options.projects).values,
		priorityFilter: filters.priorityFilter ?? "",
		labelFilter: [...(filters.labelFilter ?? [])],
		labelMatch,
		milestoneFilter: filters.milestoneFilter ?? "",
		limit: filters.limit,
	};
}
