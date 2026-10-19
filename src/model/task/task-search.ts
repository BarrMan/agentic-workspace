/**
 * Task search: the single owner of the searchable-text builder, the search configuration, and the
 * task filter predicates. Every surface that searches or filters tasks (the CLI, the TUI views,
 * the web API and the cross-branch SearchService) goes through this module so
 * the same query and the same filters mean the same thing everywhere.
 *
 * Callers still decide which corpus to search: the local working copy or the cross-branch store.
 */

import type { LabelMatchMode, Task } from "../types.ts";
import { assigneeComparisonKey } from "./assignee-filter.ts";
import { labelComparisonKey } from "./label-filter.ts";
import { createMilestoneFilterMatcher, NO_MILESTONE_FILTER_VALUE } from "./milestone-filter.ts";
import { matchesModifiedFileFilters, normalizeModifiedFileFilters } from "./modified-files.ts";
import { normalizePriorityValue } from "./priority-config.ts";
import { matchesProjectFilter } from "./project-config.ts";
import { normalizeStatusSet, statusMatchesSet } from "./status-filter.ts";
import { taskIdsEqual } from "./task-id.ts";
import { createTaskIdSearchVariants } from "./task-id-search.ts";
import { matchesTaskTypeFilter } from "./task-type-config.ts";

/** The task fields the shared search configuration indexes. */
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
}

/** An in-memory search index for tasks already loaded by the caller. */
export class TaskSearchIndex {
	private readonly entries: Array<{ task: Task; fields: TaskSearchFields }>;

	constructor(tasks: Task[]) {
		this.entries = tasks.map((task) => ({ task, fields: TaskSearchIndex.fields(task) }));
	}

	search(options: TaskFilterOptions): Task[] {
		const query = options.query?.trim() ?? "";
		const matched = query
			? this.entries.filter((entry) => TaskSearchIndex.matchesFields(entry.fields, query)).map((entry) => entry.task)
			: this.entries.map((entry) => entry.task);
		return matched.filter(TaskSearchIndex.matcher(options));
	}

	/** Apply filters without building an index unless a query needs searchable fields. */
	static apply(tasks: Task[], options: TaskFilterOptions, index?: TaskSearchIndex): Task[] {
		if (options.query?.trim()) return (index ?? new TaskSearchIndex(tasks)).search(options);
		return tasks.filter(TaskSearchIndex.matcher(options));
	}

	/**
	 * Build the searchable text for one task. Labels and assignees are part of the searchable text
	 * on every surface, so `--search backend` finds a task labelled `backend` everywhere.
	 */
	static bodyText(task: TaskWithSearchableArtifacts): string {
		const parts: string[] = [];
		if (task.description) parts.push(task.description);
		if (task.searchableArtifactText) parts.push(task.searchableArtifactText);
		if (task.labels?.length) parts.push(task.labels.join("\n"));
		if (task.assignee?.length) parts.push(task.assignee.join("\n"));
		if (task.modifiedFiles?.length) parts.push(task.modifiedFiles.join("\n"));
		return parts.join("\n\n");
	}

	/** Build every field the shared search configuration indexes, so keys and content cannot drift. */
	static fields(task: Task): TaskSearchFields {
		return {
			title: task.title,
			bodyText: TaskSearchIndex.bodyText(task),
			id: task.id,
			idVariants: createTaskIdSearchVariants(task.id),
			dependencyIds: (task.dependencies ?? []).flatMap((dependency) => createTaskIdSearchVariants(dependency)),
			modifiedFiles: task.modifiedFiles ?? [],
		};
	}

	/** Search is a case-insensitive literal substring match; keep every task search path in parity. */
	static matchesFields(fields: TaskSearchFields, query: string): boolean {
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

	/** Build the shared task predicate used by search and filtering. */
	static matcher(options: TaskFilterOptions): (task: Task) => boolean {
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
		if (modifiedFiles) checks.push((task) => matchesModifiedFileFilters(task.modifiedFiles, modifiedFiles));

		if (options.parentTaskId) {
			const parentFilter = options.parentTaskId;
			checks.push((task) => Boolean(task.parentTaskId) && taskIdsEqual(parentFilter, task.parentTaskId as string));
		}

		addMilestoneCheck(checks, options);
		return (task) => checks.every((check) => check(task));
	}
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

function addMilestoneCheck(checks: Array<(task: Task) => boolean>, options: TaskFilterOptions): void {
	const milestone = options.milestone?.trim().toLowerCase();
	if (!milestone) return;
	if (milestone === NO_MILESTONE_FILTER_VALUE) {
		checks.push((task) => !task.milestone?.trim());
		return;
	}
	const matchesMilestone = createMilestoneFilterMatcher(options.milestone as string);
	checks.push((task) => matchesMilestone(task.milestone ?? ""));
}
