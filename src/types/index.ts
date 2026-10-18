import type { AgentConfiguration } from "../agent-workspace/types.ts";

export type TaskStatus = string;
export const TASK_DIRECTORY = {
	TASK: "task",
	DRAFT: "draft",
	ARCHIVED: "archived",
	COMPLETED: "completed",
} as const;
export const TASK_DIRECTORY_TYPES = [
	TASK_DIRECTORY.TASK,
	TASK_DIRECTORY.DRAFT,
	TASK_DIRECTORY.ARCHIVED,
	TASK_DIRECTORY.COMPLETED,
] as const;
export type TaskDirectoryType = (typeof TASK_DIRECTORY_TYPES)[number];

export const TASK_SOURCE = {
	LOCAL: "local",
	REMOTE: "remote",
	COMPLETED: "completed",
	LOCAL_BRANCH: "local-branch",
} as const;
export type TaskSource = (typeof TASK_SOURCE)[keyof typeof TASK_SOURCE];

/**
 * How a multi-label filter is combined. Interactive multi-select pickers use "any" so adding a
 * label widens the result set; callers that pass an explicitly typed label list (the CLI
 * `--labels` flag and the MCP `labels` argument) use "all" so every listed label is required.
 */
export type LabelMatchMode = "any" | "all";

/**
 * Entity types in AgenticWorkspace.
 * Used for ID generation and prefix resolution.
 */
export enum EntityType {
	Task = "task",
	Draft = "draft",
	Document = "document",
	Decision = "decision",
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
	/** Optional per-task callback command to run on status change (overrides global config) */
	onStatusChange?: string;
	agentConfiguration?: AgentConfiguration;
	modeApprovals?: Record<string, Approval>;
}

export type Approval = true;

/** The task data retained by browser collection views; task bodies are detail-only. */
export interface TaskSummary {
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
	parentTaskId?: string;
	parentTaskTitle?: string;
	subtasks?: string[];
	subtaskSummaries?: Array<{ id: string; title: string }>;
	priority?: string;
	type?: string;
	project?: string;
	branch?: string;
	ordinal?: number;
	source?: Task["source"];
	isReady: boolean;
}

export interface MilestoneBucket {
	key: string;
	label: string;
	milestone?: string;
	isNoMilestone: boolean;
	isCompleted: boolean;
	tasks: Task[];
	statusCounts: Record<string, number>;
	total: number;
	doneCount: number;
	progress: number;
}

/**
 * Check if a task is locally editable (not from a remote or other local branch)
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
	assignee?: string;
	unassigned?: boolean;
	priority?: string;
	project?: string | string[];
	milestone?: string;
	parentTaskId?: string;
	labels?: string[];
	/** Defaults to "any"; callers passing an explicitly typed label list use "all". */
	labelMatch?: LabelMatchMode;
}

export interface Decision {
	id: string;
	title: string;
	date: string;
	status: string;
	context: string;
	decision: string;
	consequences: string;
	alternatives?: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
	path?: string; // Decisions-relative file path, set when listed from disk
}

export interface Milestone {
	id: string;
	title: string;
	dueDate?: string;
	description: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export const DOCUMENT_TYPE_VALUES = ["guide", "reference", "design", "other"] as const;
export type DocumentType = (typeof DOCUMENT_TYPE_VALUES)[number];

export interface Document {
	id: string;
	title: string;
	type: DocumentType;
	createdDate: string;
	updatedDate?: string;
	rawContent: string; // Raw markdown content without frontmatter
	tags?: string[];
	// Web UI specific fields
	name?: string;
	path?: string;
	lastModified?: string;
}

export interface DocumentCreateInput {
	title: string;
	content?: string;
	type?: Document["type"];
	path?: string;
	tags?: string[];
}

export interface DocumentUpdateInput {
	id: string;
	content: string;
	title?: string;
	type?: Document["type"];
	path?: string | null;
	tags?: string[];
}

export type SearchResultType = "task" | "document" | "decision";

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

export interface DocumentSearchResult {
	type: "document";
	score: number | null;
	document: Document;
	matches?: SearchMatch[];
}

export interface DecisionSearchResult {
	type: "decision";
	score: number | null;
	decision: Decision;
	matches?: SearchMatch[];
}

export type SearchResult = TaskSearchResult | DocumentSearchResult | DecisionSearchResult;

/**
 * Configuration for ID prefixes used in task files.
 * Allows customization of task prefix (e.g., "JIRA-", "issue-", "bug-").
 * Note: Draft prefix is always "draft" and not configurable.
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
	taskResolutionStrategy?: "most_recent" | "most_progressed";
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
	checkActiveBranches?: boolean; // Check task states across active branches (default: true)
	activeBranchDays?: number; // How many days a branch is considered active (default: 30)
	/** Project-relative AgenticWorkspace folder when config is stored at project root in agentic-workspace.config.yml. */
	agenticWorkspaceDirectory?: string;
	/** Global callback command to run on any task status change. Supports $TASK_ID, $OLD_STATUS, $NEW_STATUS, $TASK_TITLE variables. */
	onStatusChange?: string;
	/** ID prefix configuration for tasks and drafts. Defaults to { task: "task", draft: "draft" } */
	prefixes?: PrefixConfig;
	mcp?: {
		http?: {
			host?: string;
			port?: number;
			auth?: {
				type?: "bearer" | "basic" | "none";
				token?: string;
				username?: string;
				password?: string;
			};
			cors?: {
				origin?: string | string[];
				credentials?: boolean;
			};
			enableDnsRebindingProtection?: boolean;
			allowedHosts?: string[];
			allowedOrigins?: string[];
		};
	};
}

export interface ParsedMarkdown {
	frontmatter: Record<string, unknown>;
	content: string;
}
