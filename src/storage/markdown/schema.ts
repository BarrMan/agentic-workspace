export const TASK_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "task_schema_version",
	ID: "id",
	TITLE: "title",
	STATUS: "status",
	DONE: "done",
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
	AGENT_CONFIGURATION: "agentConfiguration",
	MODE_APPROVALS: "mode_approvals",
	WORKTREE_POLICY: "worktree_policy",
	DESCRIPTION: "description",
} as const;

export const MILESTONE_FRONTMATTER_FIELDS = {
	SCHEMA_VERSION: "milestone_schema_version",
	ID: "id",
	TITLE: "title",
	DUE_DATE: "due_date",
	DESCRIPTION: "description",
} as const;

export const TASK_FRONTMATTER_SCHEMA_VERSION = 3;
export const MILESTONE_FRONTMATTER_SCHEMA_VERSION = 1;
