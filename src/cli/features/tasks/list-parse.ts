import type { OptionValues } from "commander";
import type { Core } from "../../../index.ts";
import { normalizeStringList, toStringArray } from "../../../lib/string-list.ts";
import type { TaskListFilter } from "../../../model/types.ts";
import { parsePositiveIntegerOption } from "../../list-window.ts";

export type TaskListRequest = {
	filters: TaskListFilter;
	labels: string[];
	searchQuery: string;
	limit?: number;
	parentId?: string;
	parentDisplayId?: string;
	sortField: string;
	ready: boolean;
};

type TaskListNormalizers = {
	statusList: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
	priority: (core: Core, value: string) => Promise<string | null>;
	types: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
	projects: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
};

async function parseTaskListFilters(
	core: Core,
	options: OptionValues,
	normalize: TaskListNormalizers,
): Promise<Pick<TaskListRequest, "filters" | "labels"> | null> {
	const filters: TaskListFilter = {};
	if (options.status)
		filters.status = normalizeStringList(toStringArray(options.status)) ?? toStringArray(options.status);
	if (
		!(await addNormalizedListFilter(
			filters,
			core,
			options.excludeStatus,
			"exclude-status",
			"excludeStatus",
			normalize.statusList,
		))
	)
		return null;
	if (options.milestone) filters.milestone = options.milestone;
	if (options.priority) {
		const priority = await normalize.priority(core, String(options.priority));
		if (!priority) return null;
		filters.priority = priority;
	}
	if (!(await addNormalizedListFilter(filters, core, options.type, "type", "type", normalize.types))) return null;
	if (!(await addNormalizedListFilter(filters, core, options.project, "project", "project", normalize.projects)))
		return null;
	const labels = normalizeStringList(toStringArray(options.labels)) ?? [];
	if (labels.length > 0) {
		filters.labels = labels;
		filters.labelMatch = "all";
	}
	return { filters, labels };
}

async function addNormalizedListFilter(
	filters: TaskListFilter,
	core: Core,
	value: unknown,
	optionName: string,
	field: "excludeStatus" | "type" | "project",
	normalize: (core: Core, values: string[], optionName: string) => Promise<string[] | null>,
): Promise<boolean> {
	const values = normalizeStringList(toStringArray(value)) ?? [];
	if (values.length === 0) return true;
	const normalized = await normalize(core, values, optionName);
	if (!normalized) return false;
	filters[field] = normalized;
	return true;
}

export async function parseTaskListRequest(
	core: Core,
	options: OptionValues,
	sortFields: readonly string[],
	normalize: TaskListNormalizers,
): Promise<TaskListRequest | null> {
	const parsedFilters = await parseTaskListFilters(core, options, normalize);
	if (!parsedFilters) return null;
	const { filters, labels } = parsedFilters;
	let limit: number | undefined;
	if (options.limit !== undefined) {
		const parsedLimit = parsePositiveIntegerOption(options.limit, "--limit", "agentic-workspace task list --help");
		if (parsedLimit === null) return null;
		limit = parsedLimit;
	}
	let parentId: string | undefined;
	let parentDisplayId: string | undefined;
	if (options.parent !== undefined) {
		parentId = String(options.parent).trim().toUpperCase();
		if (!parentId) {
			console.error("Cannot use an empty value with --parent. Omit the flag to list every task.");
			process.exitCode = 1;
			return null;
		}
		filters.parentTaskId = parentId;
		parentDisplayId = parentId;
	}
	const sortField = options.sort ? String(options.sort).toLowerCase() : "newest";
	if (!sortFields.includes(sortField)) {
		console.error(`Invalid sort field: ${options.sort}. Valid values are: ${sortFields.join(", ")}`);
		process.exitCode = 1;
		return null;
	}
	return {
		filters,
		labels,
		searchQuery: typeof options.search === "string" ? options.search.trim() : "",
		limit,
		parentId,
		parentDisplayId,
		sortField,
		ready: Boolean(options.ready),
	};
}
