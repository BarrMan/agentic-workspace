import type { Decision, Document, Milestone, Task } from "../types/index.ts";
import { stringifyFrontmatter } from "./frontmatter.ts";
import {
	DECISION_FRONTMATTER_FIELDS,
	DECISION_FRONTMATTER_SCHEMA_VERSION,
	DOCUMENT_FRONTMATTER_FIELDS,
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
		key: TASK_FRONTMATTER_FIELDS.ON_STATUS_CHANGE,
		property: "onStatusChange",
		mode: TASK_FRONTMATTER_FIELD_MODE.TRUTHY,
	},
	{
		key: TASK_FRONTMATTER_FIELDS.AGENT_CONFIGURATION,
		property: "agentConfiguration",
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
	for (const key of [TASK_FRONTMATTER_FIELDS.DESCRIPTION, "agent_summary"]) {
		delete frontmatter[key];
	}
	if (task.description !== undefined) frontmatter[TASK_FRONTMATTER_FIELDS.DESCRIPTION] = task.description;
	return frontmatter;
}

function serializeMarkdownRecord(content: string, frontmatter: Record<string, unknown>): string {
	return stringifyFrontmatter(content, frontmatter);
}

function serializeOpaqueRecord(content: string, frontmatter: Record<string, unknown>): string {
	let serialized = serializeMarkdownRecord(content, frontmatter);
	if (!content.startsWith("\n") && serialized.startsWith("\n")) serialized = serialized.slice(1);
	if (!content.endsWith("\n") && serialized.endsWith("\n")) serialized = serialized.slice(0, -1);
	return serialized;
}

export function serializeTask(task: Task, retainedFrontmatter?: Record<string, unknown>): string {
	const rawContent = task.rawContent ?? "";
	const serialized = serializeMarkdownRecord(rawContent, taskFrontmatter(task, retainedFrontmatter));
	return rawContent.endsWith("\n") || !serialized.endsWith("\n") ? serialized : serialized.slice(0, -1);
}

export function serializeDecision(decision: Decision, retained: Record<string, unknown> = {}): string {
	const frontmatter: Record<string, unknown> = {
		...retained,
		[DECISION_FRONTMATTER_FIELDS.SCHEMA_VERSION]: DECISION_FRONTMATTER_SCHEMA_VERSION,
		[DECISION_FRONTMATTER_FIELDS.ID]: decision.id,
		[DECISION_FRONTMATTER_FIELDS.TITLE]: decision.title,
		[DECISION_FRONTMATTER_FIELDS.DATE]: decision.date,
		[DECISION_FRONTMATTER_FIELDS.STATUS]: decision.status,
		[DECISION_FRONTMATTER_FIELDS.CONTEXT]: decision.context,
		[DECISION_FRONTMATTER_FIELDS.DECISION]: decision.decision,
		[DECISION_FRONTMATTER_FIELDS.CONSEQUENCES]: decision.consequences,
	};
	delete frontmatter[DECISION_FRONTMATTER_FIELDS.ALTERNATIVES];
	if (decision.alternatives !== undefined)
		frontmatter[DECISION_FRONTMATTER_FIELDS.ALTERNATIVES] = decision.alternatives;
	return serializeOpaqueRecord(decision.rawContent, frontmatter);
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
	return serializeOpaqueRecord(milestone.rawContent, frontmatter);
}

export function serializeDocument(document: Document): string {
	const frontmatter = {
		[DOCUMENT_FRONTMATTER_FIELDS.ID]: document.id,
		[DOCUMENT_FRONTMATTER_FIELDS.TITLE]: document.title,
		[DOCUMENT_FRONTMATTER_FIELDS.TYPE]: document.type,
		[DOCUMENT_FRONTMATTER_FIELDS.CREATED_DATE]: document.createdDate,
		...(document.updatedDate && { [DOCUMENT_FRONTMATTER_FIELDS.UPDATED_DATE]: document.updatedDate }),
		...(document.tags && document.tags.length > 0 && { [DOCUMENT_FRONTMATTER_FIELDS.TAGS]: document.tags }),
	};

	return serializeMarkdownRecord(document.rawContent, frontmatter);
}
