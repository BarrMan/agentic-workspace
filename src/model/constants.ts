/**
 * Default directory structure for AgenticWorkspace projects
 */
export const DEFAULT_DIRECTORIES = {
	/** Main AgenticWorkspace directory */
	AGENTIC_WORKSPACE: "agentic-workspace",
	/** Hidden AgenticWorkspace directory */
	HIDDEN_AGENTIC_WORKSPACE: ".agentic-workspace",
	/** Active tasks directory */
	TASKS: "tasks",
	/** Draft tasks directory */
	DRAFTS: "drafts",
	/** Completed tasks directory */
	COMPLETED: "completed",
	/** Archive root directory */
	ARCHIVE: "archive",
	/** Archived tasks directory */
	ARCHIVE_TASKS: "archive/tasks",
	/** Archived drafts directory */
	ARCHIVE_DRAFTS: "archive/drafts",
	/** Archived milestones directory */
	ARCHIVE_MILESTONES: "archive/milestones",
	/** Milestones directory */
	MILESTONES: "milestones",
} as const;

/**
 * Default configuration file names
 */
export const DEFAULT_FILES = {
	/** Main configuration file */
	CONFIG: "config.yml",
	/** Alternate config filename accepted for discovery */
	CONFIG_YAML: "config.yaml",
	/** Root-level AgenticWorkspace configuration file */
	ROOT_CONFIG: "agentic-workspace.config.yml",
} as const;

/**
 * Default task statuses
 */
const DEFAULT_TODO_STATUS = "To Do";
export const DEFAULT_IN_PROGRESS_STATUS = "In Progress";
export const DEFAULT_DONE_STATUS = "Done";
export const DEFAULT_STATUSES = [DEFAULT_TODO_STATUS, DEFAULT_IN_PROGRESS_STATUS, DEFAULT_DONE_STATUS] as const;

/**
 * Fallback status when no default is configured
 */
export const FALLBACK_STATUS = DEFAULT_TODO_STATUS;

/** Status reserved for tasks stored as drafts. */
export const DRAFT_STATUS = "Draft";

/**
 * Default task types, used when no `types` are configured
 */
export const DEFAULT_TASK_TYPES = ["bug", "feature", "enhancement", "task", "chore", "docs", "spike"] as const;

/**
 * Default values for advanced configuration options used during project initialization.
 * Shared between CLI and browser wizard to ensure consistent defaults.
 */
export const DEFAULT_INIT_CONFIG = {
	checkActiveBranches: true,
	remoteOperations: true,
	activeBranchDays: 30,
	bypassGitHooks: false,
	filesystemOnly: false,
	zeroPaddedIds: undefined as number | undefined,
	defaultEditor: undefined as string | undefined,
	defaultPort: 6420,
	autoOpenBrowser: true,
} as const;

/** Values written by a newly initialized project. */
export const DEFAULT_FRESH_INIT_POLICY = {
	dateFormat: "yyyy-mm-dd",
	maxColumnWidth: 20,
	taskResolutionStrategy: "most_recent",
} as const;

/** Runtime fallback retained for config files that omit a resolution strategy. */
export const DEFAULT_RUNTIME_TASK_RESOLUTION_STRATEGY = "most_progressed";
