import { z } from "zod";
import type { Decision, Document, Milestone, ParsedMarkdown, Task } from "../types/index.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import {
	DECISION_FRONTMATTER_KEY_MAP,
	DecisionFrontmatterSchema,
	DOCUMENT_FRONTMATTER_KEY_MAP,
	DocumentFrontmatterSchema,
	MILESTONE_FRONTMATTER_KEY_MAP,
	MilestoneFrontmatterSchema,
} from "./record-schemas.ts";
import {
	DECISION_FRONTMATTER_FIELDS,
	DECISION_FRONTMATTER_SCHEMA_VERSION,
	MILESTONE_FRONTMATTER_FIELDS,
	MILESTONE_FRONTMATTER_SCHEMA_VERSION,
	TASK_FRONTMATTER_FIELDS,
	TASK_FRONTMATTER_SCHEMA_VERSION,
} from "./schema.ts";
import {
	STRUCTURED_DEPENDENCY_MESSAGE,
	TASK_FRONTMATTER_KEY_MAP,
	TaskFrontmatterSchema,
	TaskRecordSchema,
} from "./task-record-schema.ts";

export {
	DECISION_FRONTMATTER_SCHEMA_VERSION,
	MILESTONE_FRONTMATTER_SCHEMA_VERSION,
	TASK_FRONTMATTER_SCHEMA_VERSION,
} from "./schema.ts";

export class FrontmatterSchemaError extends Error {}

export class TaskFrontmatterSchemaError extends FrontmatterSchemaError {
	constructor(taskId: string, detail: string) {
		super(`Invalid task frontmatter for ${taskId || "(missing id)"}: ${detail}.`);
		this.name = "TaskFrontmatterSchemaError";
	}
}

export class UnsupportedTaskFrontmatterSchemaError extends FrontmatterSchemaError {
	/** The version the payload declared; `undefined` means the payload predates versioning. */
	readonly version: unknown;

	constructor(taskId: string, version: unknown) {
		super(
			version === undefined
				? `Task ${taskId || "(missing id)"} has no task frontmatter schema version.`
				: `Task ${taskId || "(missing id)"} uses unsupported task frontmatter schema version ${JSON.stringify(version)}.`,
		);
		this.name = "UnsupportedTaskFrontmatterSchemaError";
		this.version = version;
	}
}

export class UnsupportedRecordFrontmatterSchemaError extends FrontmatterSchemaError {
	constructor(kind: "decision" | "milestone", id: string, version: unknown) {
		super(
			`${kind[0]?.toUpperCase()}${kind.slice(1)} ${id || "(missing id)"} uses unsupported ${kind} frontmatter schema version ${JSON.stringify(version)}.`,
		);
		this.name = "UnsupportedRecordFrontmatterSchemaError";
	}
}

export class TaskDependenciesParseError extends Error {
	constructor(taskId: string, entryIndex?: number) {
		const location = entryIndex === undefined ? "the field" : `entry ${entryIndex + 1}`;
		super(
			`Invalid dependencies in task ${taskId || "(missing id)"}: ${location} contains a mapping or nested list. Use a list of task IDs in the task Markdown.`,
		);
		this.name = "TaskDependenciesParseError";
	}
}

export function parseMarkdown(content: string): ParsedMarkdown {
	const parsed = parseFrontmatter(content);
	return {
		frontmatter: parsed.data,
		content: parsed.content,
	};
}

function frontmatterFields<KeyMap extends Record<string, string>>(
	frontmatter: Record<string, unknown>,
	keyMap: KeyMap,
): Record<keyof KeyMap, unknown> {
	const fields: Record<string, unknown> = {};
	for (const [property, key] of Object.entries(keyMap)) fields[property] = frontmatter[key];
	return fields as Record<keyof KeyMap, unknown>;
}

function formatIssue(issue: z.ZodIssue): string {
	if (issue.path.length === 0) return issue.message;
	const path = issue.path.join(".");
	return issue.message.startsWith(path) ? issue.message : `${path}: ${issue.message}`;
}

function throwTaskSchemaError(taskId: string, error: z.ZodError): never {
	for (const issue of error.issues) {
		if (issue.message !== STRUCTURED_DEPENDENCY_MESSAGE) continue;
		const index = issue.path.find((part): part is number => typeof part === "number");
		throw new TaskDependenciesParseError(taskId, index);
	}
	const issue = error.issues[0];
	throw new TaskFrontmatterSchemaError(taskId, issue ? formatIssue(issue) : "invalid frontmatter");
}

function throwRecordSchemaError(kind: "decision" | "document" | "milestone", id: string, error: z.ZodError): never {
	const issue = error.issues[0];
	const detail = issue ? formatIssue(issue) : "invalid frontmatter";
	throw new FrontmatterSchemaError(`Invalid ${kind} frontmatter for ${id || "(missing id)"}: ${detail}.`);
}

function parseTaskFrontmatter(frontmatter: Record<string, unknown>) {
	const taskId = String(frontmatter[TASK_FRONTMATTER_FIELDS.ID] || "");
	try {
		return TaskFrontmatterSchema.parse(frontmatterFields(frontmatter, TASK_FRONTMATTER_KEY_MAP));
	} catch (error) {
		if (error instanceof z.ZodError) throwTaskSchemaError(taskId, error);
		throw error;
	}
}

export function parseTask(content: string): Task {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const fields = parseTaskFrontmatter(frontmatter);
	const schemaVersion = frontmatter[TASK_FRONTMATTER_FIELDS.SCHEMA_VERSION];
	if (schemaVersion !== TASK_FRONTMATTER_SCHEMA_VERSION)
		throw new UnsupportedTaskFrontmatterSchemaError(fields.id, schemaVersion);

	try {
		const record = TaskRecordSchema.parse({
			...fields,
			dependencies: frontmatter[TASK_FRONTMATTER_FIELDS.DEPENDENCIES],
			rawContent,
		});
		return record as Task;
	} catch (error) {
		if (error instanceof z.ZodError) throwTaskSchemaError(fields.id, error);
		throw error;
	}
}

export function parseDecision(content: string): Decision {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const id = String(frontmatter[DECISION_FRONTMATTER_FIELDS.ID] || "");
	if (frontmatter[DECISION_FRONTMATTER_FIELDS.SCHEMA_VERSION] !== DECISION_FRONTMATTER_SCHEMA_VERSION)
		throw new UnsupportedRecordFrontmatterSchemaError(
			"decision",
			id,
			frontmatter[DECISION_FRONTMATTER_FIELDS.SCHEMA_VERSION],
		);

	try {
		const record = DecisionFrontmatterSchema.parse(frontmatterFields(frontmatter, DECISION_FRONTMATTER_KEY_MAP));
		return { ...record, rawContent };
	} catch (error) {
		if (error instanceof z.ZodError) throwRecordSchemaError("decision", id, error);
		throw error;
	}
}

export function parseDocument(content: string): Document {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const id = String(frontmatter[DOCUMENT_FRONTMATTER_KEY_MAP.id] || "");

	try {
		const record = DocumentFrontmatterSchema.parse(frontmatterFields(frontmatter, DOCUMENT_FRONTMATTER_KEY_MAP));
		return { ...record, rawContent: rawContent.trim() };
	} catch (error) {
		if (error instanceof z.ZodError) throwRecordSchemaError("document", id, error);
		throw error;
	}
}

export function parseMilestone(content: string): Milestone {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const id = String(frontmatter[MILESTONE_FRONTMATTER_FIELDS.ID] || "");
	if (frontmatter[MILESTONE_FRONTMATTER_FIELDS.SCHEMA_VERSION] !== MILESTONE_FRONTMATTER_SCHEMA_VERSION)
		throw new UnsupportedRecordFrontmatterSchemaError(
			"milestone",
			id,
			frontmatter[MILESTONE_FRONTMATTER_FIELDS.SCHEMA_VERSION],
		);

	try {
		const record = MilestoneFrontmatterSchema.parse(frontmatterFields(frontmatter, MILESTONE_FRONTMATTER_KEY_MAP));
		return { ...record, rawContent };
	} catch (error) {
		if (error instanceof z.ZodError) throwRecordSchemaError("milestone", id, error);
		throw error;
	}
}
