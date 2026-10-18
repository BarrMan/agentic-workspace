/**
 * Task search: the single owner of the searchable-text builder, the Fuse configuration, and the
 * task filter predicates. Every surface that searches or filters tasks (the CLI, the TUI views,
 * the MCP adapter, the web API, and the cross-branch SearchService) goes through this module so
 * the same query and the same filters mean the same thing everywhere.
 *
 * Callers still decide which corpus to search: the local working copy or the cross-branch store.
 */

import type { LabelMatchMode, Task } from "../types/index.ts";
import { assigneeComparisonKey } from "./assignee-filter.ts";
import { labelComparisonKey } from "./label-filter.ts";
import {
	createMilestoneFilterMatcher,
	createMilestoneFilterValueResolver,
	type MilestoneFilterValueResolver,
	NO_MILESTONE_FILTER_VALUE,
} from "./milestone-filter.ts";
import { matchesModifiedFileFilters, normalizeModifiedFileFilters } from "./modified-files.ts";
import { normalizePriorityValue } from "./priority-config.ts";
import { matchesProjectFilter } from "./project-config.ts";
import { normalizeStatusSet, statusMatchesSet } from "./status-filter.ts";
import { taskIdsEqual } from "./task-id.ts";
import { createTaskIdSearchVariants } from "./task-id-search.ts";
import { matchesTaskTypeFilter } from "./task-type-config.ts";

/** The task fields the shared Fuse configuration indexes. */
export interface TaskSearchFields {
	title: string;
	bodyText: string;
	id: string;
	idVariants: string[];
	dependencyIds: string[];
	modifiedFiles: string[];
}

/** Optional artifact projection supplied by callers that load task-container text. */
export type TaskWithSearchableArtifacts = Task & { searchableArtifactText?: string };

export interface TaskFilterOptions {
	query?: string;
	status?: string | string[];
	excludeStatus?: string | string[];
	type?: string | string[];
	project?: string | string[];
	priority?: string | string[];
	assignee?: string | string[];
	unassigned?: boolean;
	labels?: string | string[];
	labelMatch?: LabelMatchMode;
	modifiedFiles?: string | string[];
	parentTaskId?: string;
	milestone?: string;
	resolveMilestoneLabel?: (milestone: string) => string;
}

export interface TaskSearchIndex {
	search(options: TaskFilterOptions): Task[];
}

/**
 * Build the searchable text for one task. Labels and assignees are part of the searchable text on
 * every surface, so `--search backend` finds a task labelled `backend` from the CLI, the MCP
 * adapter, and the web API alike.
 */
export function buildTaskSearchBodyText(task: TaskWithSearchableArtifacts): string {
	const parts: string[] = [];
	if (task.description) parts.push(task.description);
	if (task.searchableArtifactText) parts.push(task.searchableArtifactText);
	if (task.labels?.length) parts.push(task.labels.join("\n"));
	if (task.assignee?.length) parts.push(task.assignee.join("\n"));
	if (task.modifiedFiles?.length) parts.push(task.modifiedFiles.join("\n"));

	return parts.join("\n\n");
}

/** Build every field the shared Fuse configuration indexes, so keys and content cannot drift. */
export function buildTaskSearchFields(task: Task): TaskSearchFields {
	return {
		title: task.title,
		bodyText: buildTaskSearchBodyText(task),
		id: task.id,
		idVariants: createTaskIdSearchVariants(task.id),
		dependencyIds: (task.dependencies ?? []).flatMap((dependency) => createTaskIdSearchVariants(dependency)),
		modifiedFiles: task.modifiedFiles ?? [],
	};
}

/** Search is a case-insensitive literal substring match; keep every task search path in parity. */
export function matchesTaskSearchFields(fields: TaskSearchFields, query: string): boolean {
	const needle = query.toLowerCase();
	return [
		fields.title,
		fields.bodyText,
		fields.id,
		...fields.idVariants,
		...fields.dependencyIds,
		...fields.modifiedFiles,
	].some((value) => value.toLowerCase().includes(needle));
}

function toList(value: string | string[] | undefined): string[] {
	if (!value) return [];
	const values = Array.isArray(value) ? value : [value];
	return values.map((item) => item.trim()).filter((item) => item.length > 0);
}

function addSetCheck(
	checks: Array<(task: Task) => boolean>,
	values: Set<string>,
	matches: (task: Task) => boolean,
): void {
	if (values.size > 0) checks.push(matches);
}

function addMilestoneCheck(checks: Array<(task: Task) => boolean>, options: TaskFilterOptions, corpus: Task[]): void {
	const milestone = options.milestone?.trim().toLowerCase();
	if (!milestone) return;
	if (milestone === NO_MILESTONE_FILTER_VALUE) {
		checks.push((task) => !task.milestone?.trim());
		return;
	}
	const resolveLabel = options.resolveMilestoneLabel;
	if (!resolveLabel || "resolveExactId" in resolveLabel) {
		const matchesMilestone = createMilestoneFilterMatcher(
			options.milestone as string,
			corpus.map((task) => task.milestone ?? ""),
			(resolveLabel as MilestoneFilterValueResolver | undefined) ?? createMilestoneFilterValueResolver([]),
		);
		checks.push((task) => matchesMilestone(task.milestone ?? ""));
		return;
	}
	checks.push(
		(task) =>
			Boolean(task.milestone) &&
			resolveLabel(task.milestone as string)
				.trim()
				.toLowerCase() === milestone,
	);
}

/**
 * Build the shared task predicate. `corpus` is the full task list the milestone matcher compares
 * against, so a milestone filter resolves the same way no matter which tasks survive other filters.
 */
export function createTaskFilterMatcher(options: TaskFilterOptions, corpus: Task[] = []): (task: Task) => boolean {
	const checks: Array<(task: Task) => boolean> = [];

	const wantedStatuses = normalizeStatusSet(options.status);
	addSetCheck(checks, wantedStatuses, (task) => statusMatchesSet(wantedStatuses, task.status));

	const excludedStatuses = normalizeStatusSet(options.excludeStatus);
	addSetCheck(checks, excludedStatuses, (task) => !statusMatchesSet(excludedStatuses, task.status));

	if (options.type) {
		const types = options.type;
		checks.push((task) => matchesTaskTypeFilter(task.type, types));
	}

	if (options.project) {
		const projects = options.project;
		checks.push((task) => matchesProjectFilter(task.project, projects));
	}

	const priorities = new Set(
		toList(options.priority)
			.map((priority) => normalizePriorityValue(priority))
			.filter((priority): priority is string => Boolean(priority)),
	);
	addSetCheck(checks, priorities, (task) => {
		const priority = normalizePriorityValue(task.priority);
		return Boolean(priority) && priorities.has(priority as string);
	});

	const assignees = new Set(toList(options.assignee).map(assigneeComparisonKey).filter(Boolean));
	addSetCheck(checks, assignees, (task) =>
		(task.assignee ?? []).some((value) => assignees.has(assigneeComparisonKey(value))),
	);

	if (options.unassigned) {
		checks.push((task) => !(task.assignee ?? []).some((value) => assigneeComparisonKey(value).length > 0));
	}

	const requiredLabels = toList(options.labels)
		.map(labelComparisonKey)
		.filter((label) => label.length > 0);
	if (requiredLabels.length > 0) {
		const matchAll = options.labelMatch === "all";
		checks.push((task) => {
			const taskLabels = new Set((task.labels ?? []).map(labelComparisonKey).filter((label) => label.length > 0));
			if (taskLabels.size === 0) return false;
			return matchAll
				? requiredLabels.every((label) => taskLabels.has(label))
				: requiredLabels.some((label) => taskLabels.has(label));
		});
	}

	const modifiedFiles = normalizeModifiedFileFilters(options.modifiedFiles);
	if (modifiedFiles) {
		checks.push((task) => matchesModifiedFileFilters(task.modifiedFiles, modifiedFiles));
	}

	if (options.parentTaskId) {
		const parentFilter = options.parentTaskId;
		checks.push((task) => Boolean(task.parentTaskId) && taskIdsEqual(parentFilter, task.parentTaskId as string));
	}

	addMilestoneCheck(checks, options, corpus);

	return (task) => checks.every((check) => check(task));
}

/**
 * Create an in-memory search index for tasks. Useful when the corpus is already loaded and the
 * caller wants to run several queries over it without rebuilding the index each time.
 */
export function createTaskSearchIndex(tasks: Task[]): TaskSearchIndex {
	const entries = tasks.map((task) => ({ task, fields: buildTaskSearchFields(task) }));

	return {
		search(options: TaskFilterOptions): Task[] {
			const query = options.query?.trim() ?? "";
			const matched = query
				? entries.filter((entry) => matchesTaskSearchFields(entry.fields, query)).map((entry) => entry.task)
				: entries.map((entry) => entry.task);

			const matches = createTaskFilterMatcher(options, tasks);
			return matched.filter(matches);
		},
	};
}

export function applyTaskFilters(tasks: Task[], options: TaskFilterOptions, index?: TaskSearchIndex): Task[] {
	if (options.query?.trim()) {
		return (index ?? createTaskSearchIndex(tasks)).search(options);
	}
	const matches = createTaskFilterMatcher(options, tasks);
	return tasks.filter(matches);
}
