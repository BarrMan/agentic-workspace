import type { Command, OptionValues } from "commander";
import { loadTaskListItems } from "../core/task-detail.ts";
import { printJson, type SearchResultInput, searchJson } from "../formatters/json-output.ts";
import { Core } from "../index.ts";
import {
	isLocalEditableTask,
	type SearchPriorityFilter,
	type SearchResult,
	type SearchResultType,
	type TaskSearchResult,
} from "../types/index.ts";
import { type ListWindow, type ListWindowOptions, printListWindow, selectListWindow } from "../utils/list-window.ts";
import type { ReadOutputMode, ReadOutputOptions } from "../utils/read-output-mode.ts";
import { parseDelimitedStringList } from "../utils/task-builders.ts";
import {
	addHelpSchema,
	choiceType,
	getCliTaskTypeValues,
	priorityType,
	projectType,
	statusType,
	taskType,
} from "./help-schema.ts";

type SearchCommandDependencies = {
	requireProjectRoot: () => Promise<string>;
	resolveListOutput: (
		options: ListWindowOptions & ReadOutputOptions,
		command: Command,
	) => { outputMode: ReadOutputMode; listWindow: ListWindow } | null;
	printDuplicateIntegrityWarning: (core: Core) => Promise<boolean>;
	normalizeStatusList: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
	normalizePriority: (core: Core, value: string) => Promise<string | null>;
	normalizeTaskTypes: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
	normalizeProjects: (core: Core, values: string[], optionName: string) => Promise<string[] | null>;
};

type SearchFilters = {
	status?: string | string[];
	excludeStatus?: string[];
	type?: string[];
	project?: string[];
	priority?: SearchPriorityFilter;
	modifiedFiles?: string[];
};

type ParsedSearchOptions = {
	modifiedFileFilters?: string[];
	types: SearchResultType[];
	filters: SearchFilters;
};

const SEARCH_RESULT_TYPES = ["task", "decision"] as const;
const SEARCH_RESULT_HEADINGS: Record<(typeof SEARCH_RESULT_TYPES)[number], string> = {
	task: "Tasks:",
	decision: "Decisions:",
};

export function registerSearchCommand(program: Command, dependencies: SearchCommandDependencies): void {
	const TASK_TYPE_EXAMPLE = JSON.stringify(getCliTaskTypeValues()[0] ?? "<configured-type>");
	const searchCommand = addHelpSchema(program.command("search [query]"), {
		reads: "Tasks and decisions from the configured agentic-workspace directory",
		required: [],
		optional: [
			{ name: "query", type: "String", description: "Literal search text" },
			{
				name: "type",
				type: choiceType(["task", "decision"], { multiple: true }),
				description: "Result types",
			},
			{
				name: "task-type",
				type: () => taskType({ multiple: true }),
				description: "Filter task results by one or more configured task types; repeat or comma-separate values",
			},
			{
				name: "status",
				type: () => statusType({ multiple: true }),
				description: "Filter task results by one or more statuses; repeat or comma-separate values; case-insensitive",
			},
			{
				name: "exclude-status",
				type: statusType,
				description: "Exclude task results with one or more statuses; repeat or comma-separate values",
			},
			{ name: "priority", type: priorityType, description: "Filter task results by priority" },
			{
				name: "project",
				type: () => projectType({ multiple: true }),
				description: "Filter task results by one or more configured projects; repeat or comma-separate values",
			},
			{
				name: "modified-file",
				type: "Project-root-relative path",
				description: "Filter by modified file path substring",
			},
			{ name: "plain", type: "Boolean", description: "Use plain text output" },
			{ name: "json", type: "Boolean", description: "Use versioned machine-readable JSON output" },
		],
		output: "All matching results in plain text by default, or versioned JSON with --json.",
		examples: [
			'agentic-workspace search "auth" --plain',
			'agentic-workspace search "auth" --json',
			'agentic-workspace search "api" --type task --status "<active status>"',
			`agentic-workspace search "crash" --task-type ${TASK_TYPE_EXAMPLE} --plain`,
		],
	})
		.description("search tasks and decisions using literal text matching")
		.option("--type <type>", "limit results to type (task, decision)", createMultiValueAccumulator())
		.option(
			"--task-type <type>",
			"filter task results by configured task type (repeatable or comma-separated)",
			createMultiValueAccumulator(),
		)
		.option(
			"--status <status>",
			"filter task results by status (repeatable or comma-separated)",
			createMultiValueAccumulator(),
		)
		.option(
			"--exclude-status <status>",
			"exclude task results by status (repeatable or comma-separated)",
			createMultiValueAccumulator(),
		)
		.option("--priority <priority>", "filter task results by priority (configured priorities)")
		.option(
			"--project <project>",
			"filter task results by configured project (repeatable or comma-separated)",
			createMultiValueAccumulator(),
		)
		.option(
			"--modified-file <path>",
			"filter task results by modified file path substring",
			createMultiValueAccumulator(),
		)
		.option("--plain", "print plain text output")
		.option("--json", "print versioned machine-readable JSON output")
		.action((query: string | undefined, options: OptionValues) =>
			runSearch(query, options, searchCommand, dependencies),
		);
}

async function runSearch(
	query: string | undefined,
	options: OptionValues,
	command: Command,
	dependencies: SearchCommandDependencies,
): Promise<void> {
	const listOutput = dependencies.resolveListOutput(options, command);
	if (!listOutput) return;
	const cwd = await dependencies.requireProjectRoot();
	const core = new Core(cwd);
	const hasDuplicateIds = await dependencies.printDuplicateIntegrityWarning(core);
	if (hasDuplicateIds && listOutput.outputMode === "json") return;
	const parsed = await parseSearchOptions(core, options, dependencies);
	if (!parsed) return;
	const searchResults = await core.searchPersistently({ query: query ?? "", ...parsed });
	const outputMode = listOutput.outputMode === "json" ? "json" : "plain";
	return renderSearchResults(searchResults, outputMode, listOutput.listWindow, core);
}

async function parseSearchOptions(
	core: Core,
	options: OptionValues,
	dependencies: SearchCommandDependencies,
): Promise<ParsedSearchOptions | null> {
	const modifiedFileFilters = parseDelimitedStringList(options.modifiedFile);
	const rawTaskTypes = parseDelimitedStringList(options.taskType) ?? [];
	const rawSearchProjects = parseDelimitedStringList(options.project) ?? [];
	const rawTypes = toSearchTypeValues(options.type);
	const types = resolveSearchResultTypes(rawTypes, modifiedFileFilters, rawTaskTypes, rawSearchProjects);
	if (rawTaskTypes.length > 0 && rawTypes && !types.includes("task")) return printTaskFilterTypeError("--task-type");
	if (rawSearchProjects.length > 0 && rawTypes && !types.includes("task")) return printTaskFilterTypeError("--project");
	const filters = await resolveSearchFilters(
		core,
		options,
		dependencies,
		rawTaskTypes,
		rawSearchProjects,
		modifiedFileFilters,
	);
	if (!filters) return null;
	return { modifiedFileFilters, types, filters };
}

function toSearchTypeValues(value: unknown): string[] | undefined {
	return value ? (Array.isArray(value) ? value : [value]).map(String) : undefined;
}

function resolveSearchResultTypes(
	rawTypes: string[] | undefined,
	modifiedFileFilters: string[] | undefined,
	rawTaskTypes: string[],
	rawSearchProjects: string[],
): SearchResultType[] {
	const allowedTypes: SearchResultType[] = ["task", "decision"];
	if (!rawTypes)
		return modifiedFileFilters?.length || rawTaskTypes.length > 0 || rawSearchProjects.length > 0
			? ["task"]
			: allowedTypes;
	return rawTypes
		.map((value) => value.toLowerCase())
		.filter((value): value is SearchResultType => {
			if (allowedTypes.includes(value as SearchResultType)) return true;
			console.warn(`Ignoring unsupported type '${value}'. Supported: task, decision`);
			return false;
		});
}

async function resolveSearchFilters(
	core: Core,
	options: OptionValues,
	dependencies: SearchCommandDependencies,
	rawTaskTypes: string[],
	rawSearchProjects: string[],
	modifiedFileFilters: string[] | undefined,
): Promise<SearchFilters | null> {
	const excludeStatuses = parseDelimitedStringList(options.excludeStatus) ?? [];
	const [statuses, taskTypes, projects, priority] = await Promise.all([
		excludeStatuses.length > 0 ? dependencies.normalizeStatusList(core, excludeStatuses, "exclude-status") : [],
		rawTaskTypes.length > 0 ? dependencies.normalizeTaskTypes(core, rawTaskTypes, "task-type") : [],
		rawSearchProjects.length > 0 ? dependencies.normalizeProjects(core, rawSearchProjects, "project") : [],
		options.priority ? dependencies.normalizePriority(core, String(options.priority)) : undefined,
	]);
	if (statuses === null || taskTypes === null || projects === null || priority === null) return null;
	return {
		...(options.status && { status: parseDelimitedStringList(options.status) ?? options.status }),
		...(statuses.length > 0 && { excludeStatus: statuses }),
		...(taskTypes.length > 0 && { type: taskTypes }),
		...(projects.length > 0 && { project: projects }),
		...(priority && { priority }),
		...(modifiedFileFilters?.length && { modifiedFiles: modifiedFileFilters }),
	};
}

function printTaskFilterTypeError(option: "--task-type" | "--project"): null {
	console.error(`${option} filters task results. Include --type task or omit --type.`);
	process.exitCode = 1;
	return null;
}

async function renderSearchResults(
	results: SearchResult[],
	outputMode: "plain" | "json",
	listWindow: ListWindow,
	core: Core,
): Promise<void> {
	const printed = searchResultsInPrintedOrder(results, outputMode);
	if (outputMode === "plain") {
		printListWindow(printed, listWindow, printSearchResults);
		return;
	}
	const page = selectListWindow(printed, listWindow);
	printJson(searchJson(await projectSearchTaskRows(core, page.items), page));
}

async function projectSearchTaskRows(core: Core, results: SearchResult[]): Promise<SearchResultInput[]> {
	const searchedTasks = results.flatMap((result) => (isTaskSearchResult(result) ? [result.task] : []));
	const projectedTaskRows = (searchedTasks.length > 0 ? await loadTaskListItems(core, searchedTasks) : [])[
		Symbol.iterator
	]();
	const projectedResults: SearchResultInput[] = [];
	for (const result of results) {
		if (!isTaskSearchResult(result)) {
			projectedResults.push(result);
			continue;
		}
		const projected = projectedTaskRows.next();
		if (projected.done) break;
		projectedResults.push({ ...result, task: projected.value });
	}
	return projectedResults;
}

function searchResultsInPrintedOrder(results: SearchResult[], outputMode: "plain" | "json"): SearchResult[] {
	const printable = results.filter((result) => !isTaskSearchResult(result) || isLocalEditableTask(result.task));
	return outputMode === "json"
		? printable
		: SEARCH_RESULT_TYPES.flatMap((type) => printable.filter((result) => result.type === type));
}

function printSearchResults(results: SearchResult[]): void {
	const sections = SEARCH_RESULT_TYPES.flatMap((type) => {
		const group = results.filter((result) => result.type === type);
		return group.length > 0 ? [[SEARCH_RESULT_HEADINGS[type], ...group.map(formatSearchResultRow)].join("\n")] : [];
	});
	console.log(sections.length > 0 ? sections.join("\n\n") : "No results found.");
}

function formatSearchResultRow(result: SearchResult): string {
	const scoreText = formatScore(result.score);
	if (result.type === "task") {
		const { task } = result;
		return `  ${task.id} - ${task.title}${task.status ? ` (${task.status})` : ""}${task.priority ? ` [${task.priority.toUpperCase()}]` : ""}${scoreText}`;
	}
	const { id, title } = (result as Extract<SearchResult, { type: "decision" }>).decision;
	return `  ${id} - ${title}${scoreText}`;
}

function formatScore(score: number | null): string {
	return score === null || score === undefined ? "" : ` [score ${(1 - score).toFixed(3)}]`;
}

function isTaskSearchResult(result: SearchResult): result is TaskSearchResult {
	return result.type === "task";
}

function createMultiValueAccumulator() {
	return (value: string, previous: string | string[]) => [
		...(Array.isArray(previous) ? previous : previous ? [previous] : []),
		value,
	];
}
