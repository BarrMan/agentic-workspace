import type { AgentConfiguration } from "./session/types.ts";

export type TaskStatus = string;
export const TASK_DIRECTORY = {
	TASK: "task",
	ARCHIVED: "archived",
	COMPLETED: "completed",
} as const;
export const TASK_DIRECTORY_TYPES = [TASK_DIRECTORY.TASK, TASK_DIRECTORY.ARCHIVED, TASK_DIRECTORY.COMPLETED] as const;
export type TaskDirectoryType = (typeof TASK_DIRECTORY_TYPES)[number];

export const TASK_SOURCE = {
	LOCAL: "local",
	REMOTE: "remote",
	COMPLETED: "completed",
} as const;
export type TaskSource = (typeof TASK_SOURCE)[keyof typeof TASK_SOURCE];

/**
 * How a multi-label filter is combined. Interactive multi-select pickers use "any" so adding a
 * label widens the result set; callers that pass an explicitly typed label list (the CLI
 * `--labels` flag) use "all" so every listed label is required.
 */
export type LabelMatchMode = "any" | "all";

/**
 * Entity types in AgenticWorkspace.
 * Used for ID generation and prefix resolution.
 */
export enum EntityType {
	Task = "task",
}

export interface Task {
	id: string;
	title: string;
	status: TaskStatus;
	assignee: string[];
	reporter?: string;
	createdDate: string;
	updatedDate?: string;
	dueDate?: string;
	labels: string[];
	milestone?: string;
	dependencies: string[];
	references?: string[];
	documentation?: string[];
	modifiedFiles?: string[];
	readonly rawContent?: string; // Raw markdown content without frontmatter (read-only: do not modify directly)
	description?: string;
	parentTaskId?: string;
	parentTaskTitle?: string;
	subtasks?: string[];
	subtaskSummaries?: Array<{ id: string; title: string }>;
	priority?: string;
	/** Semantic task type (e.g. bug, feature). Allowed values come from config `types` (defaults to DEFAULT_TASK_TYPES); absent means untyped. */
	type?: string;
	/** Monorepo project/component this task belongs to. Allowed values come from config `projects`; absent config means the field is unusable. */
	project?: string;
	branch?: string;
	worktreePolicy?: "enabled" | "disabled";
	ordinal?: number;
	filePath?: string;
	contentRef?: string;
	/** Internal body digest retained by summary-mode stores for change detection. */
	contentRevision?: string;
	// Metadata fields
	lastModified?: Date;
	source?: TaskSource;
	agentConfiguration?: AgentConfiguration;
	modeApprovals?: Record<string, Approval>;
}

export type Approval = true;

/**
 * Check if a task is locally editable (not from a remote source)
 */
export function isLocalEditableTask(task: Task): boolean {
	return task.source === undefined || task.source === TASK_SOURCE.LOCAL || task.source === TASK_SOURCE.COMPLETED;
}

export interface TaskCreateInput {
	title: string;
	dueDate?: string;
	description?: string;
	status?: TaskStatus;
	priority?: string;
	type?: string;
	project?: string;
	ordinal?: number;
	milestone?: string;
	labels?: string[];
	assignee?: string[];
	dependencies?: string[];
	references?: string[];
	documentation?: string[];
	modifiedFiles?: string[];
	parentTaskId?: string;
	rawContent?: string;
	agentConfiguration?: AgentConfiguration;
}

export interface TaskUpdateInput {
	title?: string;
	dueDate?: string | null;
	description?: string;
	status?: TaskStatus;
	priority?: string;
	type?: string;
	project?: string | null;
	milestone?: string | null;
	labels?: string[];
	addLabels?: string[];
	removeLabels?: string[];
	assignee?: string[];
	ordinal?: number;
	dependencies?: string[];
	addDependencies?: string[];
	removeDependencies?: string[];
	references?: string[];
	addReferences?: string[];
	removeReferences?: string[];
	documentation?: string[];
	addDocumentation?: string[];
	removeDocumentation?: string[];
	modifiedFiles?: string[];
	rawContent?: string;
	agentConfiguration?: AgentConfiguration | null;
}

export interface TaskListFilter {
	/** Matches any of these when several are given, mirroring `excludeStatus`. */
	status?: string | string[];
	excludeStatus?: string | string[];
	type?: string | string[];
	assignee?: string | string[];
	unassigned?: boolean;
	priority?: string;
	project?: string | string[];
	milestone?: string;
	parentTaskId?: string;
	labels?: string[];
	/** Defaults to "any"; callers passing an explicitly typed label list use "all". */
	labelMatch?: LabelMatchMode;
}

export interface Milestone {
	id: string;
	title: string;
	dueDate?: string;
	description: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export type SearchResultType = "task";

export type SearchPriorityFilter = string;

export interface SearchMatch {
	key?: string;
	indices: Array<[number, number]>;
	value?: unknown;
}

export interface SearchFilters {
	status?: string | string[];
	excludeStatus?: string | string[];
	type?: string | string[];
	priority?: SearchPriorityFilter | SearchPriorityFilter[];
	project?: string | string[];
	assignee?: string | string[];
	unassigned?: boolean;
	labels?: string | string[];
	/** Defaults to "any"; callers passing an explicitly typed label list use "all". */
	labelMatch?: LabelMatchMode;
	modifiedFiles?: string | string[];
}

export interface SearchOptions {
	query?: string;
	limit?: number;
	types?: SearchResultType[];
	filters?: SearchFilters;
}

export interface TaskSearchResult {
	type: "task";
	score: number | null;
	task: Task;
	matches?: SearchMatch[];
}

export type SearchResult = TaskSearchResult;

/**
 * Configuration for ID prefixes used in task files.
 * Allows customization of task prefix (e.g., "JIRA-", "issue-", "bug-").
 */
export interface PrefixConfig {
	/** Prefix for task IDs (default: "task") - produces IDs like TASK-1, TASK-2 */
	task: string;
}

export interface AgenticWorkspaceConfig {
	agentConfiguration?: AgentConfiguration;
	projectName: string;
	/** Assignees applied to new tasks when none are provided. Empty or unset means no default. */
	defaultAssignee?: string[];
	defaultReporter?: string;
	statuses: string[];
	labels: string[];
	/** Allowed task types. Defaults to DEFAULT_TASK_TYPES when not configured. */
	types?: string[];
	/** Ordered task priority labels. Defaults to High, Medium, Low when not configured. */
	priorities?: string[];
	/** Allowed monorepo project/component values. No default; the `project` field is unusable until this is configured. */
	projects?: string[];
	/** @deprecated Milestones are sourced from milestone files, not config. */
	milestones?: string[];
	defaultStatus?: string;
	dateFormat: string;
	maxColumnWidth?: number;
	defaultEditor?: string;
	autoOpenBrowser?: boolean;
	defaultPort?: number;
	/** When true, hide board columns whose status has no tasks. Columns reappear while a task is being dragged so they remain valid drop targets. Defaults to false. */
	hideEmptyColumns?: boolean;
	remoteOperations?: boolean;
	/** Disable all Git integration for filesystem-only projects. */
	filesystemOnly?: boolean;
	zeroPaddedIds?: number;
	includeDateTimeInDates?: boolean; // Whether to include time in new dates
	bypassGitHooks?: boolean;
	/** Project-relative AgenticWorkspace folder when config is stored at project root in agentic-workspace.config.yml. */
	agenticWorkspaceDirectory?: string;
	/** Global callback command to run on any task status change. Supports $TASK_ID, $OLD_STATUS, $NEW_STATUS, $TASK_TITLE variables. */
	onStatusChange?: string;
	/** ID prefix configuration for tasks. Defaults to { task: "task" } */
	prefixes?: PrefixConfig;
}

export interface ParsedMarkdown {
	frontmatter: Record<string, unknown>;
	content: string;
}
