export const TASK_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "task_schema_version",
	ID: "id",
	TITLE: "title",
	STATUS: "status",
	ASSIGNEE: "assignee",
	REPORTER: "reporter",
	CREATED_DATE: "created_date",
	UPDATED_DATE: "updated_date",
	DUE_DATE: "due_date",
	LABELS: "labels",
	MILESTONE: "milestone",
	DEPENDENCIES: "dependencies",
	REFERENCES: "references",
	DOCUMENTATION: "documentation",
	MODIFIED_FILES: "modified_files",
	PARENT_TASK_ID: "parent_task_id",
	SUBTASKS: "subtasks",
	PRIORITY: "priority",
	TYPE: "type",
	PROJECT: "project",
	ORDINAL: "ordinal",
	ON_STATUS_CHANGE: "onStatusChange",
	AGENT_CONFIGURATION: "agentConfiguration",
	MODE_APPROVALS: "mode_approvals",
	WORKTREE_POLICY: "worktree_policy",
	DESCRIPTION: "description",
} as const;

export const DECISION_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "decision_schema_version",
	ID: "id",
	TITLE: "title",
	DATE: "date",
	STATUS: "status",
	CONTEXT: "context",
	DECISION: "decision",
	CONSEQUENCES: "consequences",
	ALTERNATIVES: "alternatives",
} as const;

export const MILESTONE_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "milestone_schema_version",
	ID: "id",
	TITLE: "title",
	DUE_DATE: "due_date",
	DESCRIPTION: "description",
} as const;

export const DOCUMENT_FRONTMATTER_FIELDS = {
	ID: "id",
	TITLE: "title",
	TYPE: "type",
	CREATED_DATE: "created_date",
	UPDATED_DATE: "updated_date",
	TAGS: "tags",
} as const;

export const FRONTMATTER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/;

export const TASK_FRONTMATTER_SCHEMA_VERSION = 3;
export const DECISION_FRONTMATTER_SCHEMA_VERSION = 1;
export const MILESTONE_FRONTMATTER_SCHEMA_VERSION = 1;
