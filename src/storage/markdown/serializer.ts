import type { Milestone, Task } from "../../model/types.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";
import {
	MILESTONE_FRONTMATTER_FIELDS,
	MILESTONE_FRONTMATTER_SCHEMA_VERSION,
	TASK_FRONTMATTER_FIELDS,
	TASK_FRONTMATTER_SCHEMA_VERSION,
} from "./schema.ts";

const TASK_FRONTMATTER_FIELD_MODE = {
	TRUTHY: "truthy",
	NONEMPTY: "nonempty",
	DEFINED: "defined",
} as const;

interface TaskFrontmatterField {
	key: string;
	property: keyof Task;
	mode?: (typeof TASK_FRONTMATTER_FIELD_MODE)[keyof typeof TASK_FRONTMATTER_FIELD_MODE];
}

const taskFrontmatterFields: readonly TaskFrontmatterField[] = [
	{ key: TASK_FRONTMATTER_FIELDS.ID, property: "id" },
	{ key: TASK_FRONTMATTER_FIELDS.TITLE, property: "title" },
	{ key: TASK_FRONTMATTER_FIELDS.STATUS, property: "status" },
	{ key: TASK_FRONTMATTER_FIELDS.ASSIGNEE, property: "assignee" },
	{ key: TASK_FRONTMATTER_FIELDS.REPORTER, property: "reporter", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.CREATED_DATE, property: "createdDate" },
	{ key: TASK_FRONTMATTER_FIELDS.UPDATED_DATE, property: "updatedDate", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.DUE_DATE, property: "dueDate", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.LABELS, property: "labels" },
	{ key: TASK_FRONTMATTER_FIELDS.MILESTONE, property: "milestone", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.DEPENDENCIES, property: "dependencies" },
	{ key: TASK_FRONTMATTER_FIELDS.REFERENCES, property: "references", mode: TASK_FRONTMATTER_FIELD_MODE.NONEMPTY },
	{ key: TASK_FRONTMATTER_FIELDS.DOCUMENTATION, property: "documentation", mode: TASK_FRONTMATTER_FIELD_MODE.NONEMPTY },
	{
		key: TASK_FRONTMATTER_FIELDS.MODIFIED_FILES,
		property: "modifiedFiles",
		mode: TASK_FRONTMATTER_FIELD_MODE.NONEMPTY,
	},
	{ key: TASK_FRONTMATTER_FIELDS.PARENT_TASK_ID, property: "parentTaskId", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.SUBTASKS, property: "subtasks", mode: TASK_FRONTMATTER_FIELD_MODE.NONEMPTY },
	{ key: TASK_FRONTMATTER_FIELDS.PRIORITY, property: "priority", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.TYPE, property: "type", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.PROJECT, property: "project", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{ key: TASK_FRONTMATTER_FIELDS.ORDINAL, property: "ordinal", mode: TASK_FRONTMATTER_FIELD_MODE.DEFINED },
	{
		key: TASK_FRONTMATTER_FIELDS.AGENT_CONFIGURATION,
		property: "agentConfiguration",
		mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY,
	},
	{ key: TASK_FRONTMATTER_FIELDS.MODE_APPROVALS, property: "modeApprovals", mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY },
	{
		key: TASK_FRONTMATTER_FIELDS.WORKTREE_POLICY,
		property: "worktreePolicy",
		mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY,
	},
];

function taskFrontmatter(task: Task, retained: Record<string, unknown> = {}): Record<string, unknown> {
	const frontmatter: Record<string, unknown> = {
		...retained,
		[TASK_FRONTMATTER_FIELDS.SCHEMA_VERSION]: TASK_FRONTMATTER_SCHEMA_VERSION,
	};
	for (const field of taskFrontmatterFields) {
		const value = task[field.property];
		delete frontmatter[field.key];
		if (field.mode === TASK_FRONTMATTER_FIELD_MODE.TRUTHY && !value) continue;
		if (field.mode === TASK_FRONTMATTER_FIELD_MODE.NONEMPTY && (!Array.isArray(value) || value.length === 0)) continue;
		if (field.mode === TASK_FRONTMATTER_FIELD_MODE.DEFINED && value === undefined) continue;
		frontmatter[field.key] = value;
	}
	delete frontmatter[TASK_FRONTMATTER_FIELDS.MODE_APPROVALS];
	if (task.modeApprovals && Object.keys(task.modeApprovals).length > 0)
		frontmatter[TASK_FRONTMATTER_FIELDS.MODE_APPROVALS] = task.modeApprovals;
	for (const key of [TASK_FRONTMATTER_FIELDS.DESCRIPTION, "agent_summary"]) {
		delete frontmatter[key];
	}
	if (task.description !== undefined) frontmatter[TASK_FRONTMATTER_FIELDS.DESCRIPTION] = task.description;
	return frontmatter;
}

function serializeRecord(content: string, frontmatter: Record<string, unknown>): string {
	const serialized = stringifyFrontmatter(content, frontmatter);
	return content.endsWith("\n") || !serialized.endsWith("\n") ? serialized : serialized.slice(0, -1);
}

export function serializeTask(task: Task, retainedFrontmatter?: Record<string, unknown>): string {
	const rawContent = task.rawContent ?? "";
	return serializeRecord(rawContent, taskFrontmatter(task, retainedFrontmatter));
}

export function serializeMilestone(milestone: Milestone, retained: Record<string, unknown> = {}): string {
	const frontmatter: Record<string, unknown> = {
		...retained,
		[MILESTONE_FRONTMATTER_FIELDS.SCHEMA_VERSION]: MILESTONE_FRONTMATTER_SCHEMA_VERSION,
		[MILESTONE_FRONTMATTER_FIELDS.ID]: milestone.id,
		[MILESTONE_FRONTMATTER_FIELDS.TITLE]: milestone.title,
		[MILESTONE_FRONTMATTER_FIELDS.DESCRIPTION]: milestone.description,
	};
	delete frontmatter[MILESTONE_FRONTMATTER_FIELDS.DUE_DATE];
	if (milestone.dueDate) frontmatter[MILESTONE_FRONTMATTER_FIELDS.DUE_DATE] = milestone.dueDate;
	return serializeRecord(milestone.rawContent, frontmatter);
}
