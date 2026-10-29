import { z } from "zod";
import type { Milestone, ParsedMarkdown, Task } from "../../model/types.ts";
import {
	FrontmatterSchemaError,
	TaskDependenciesParseError,
	TaskFrontmatterSchemaError,
	UnsupportedRecordFrontmatterSchemaError,
	UnsupportedTaskFrontmatterSchemaError,
} from "../errors/frontmatter.ts";
import { parseFrontmatter } from "./frontmatter.ts";
import { MILESTONE_FRONTMATTER_KEY_MAP, MilestoneFrontmatterSchema } from "./record-schemas.ts";
import {
	MILESTONE_FRONTMATTER_FIELDS,
	MILESTONE_FRONTMATTER_SCHEMA_VERSION,
	TASK_FRONTMATTER_FIELDS,
	TASK_FRONTMATTER_SCHEMA_VERSION,
} from "./schema.ts";
import { STRUCTURED_DEPENDENCY_MESSAGE, TASK_FRONTMATTER_KEY_MAP, TaskRecordSchema } from "./task-record-schema.ts";

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

function throwRecordSchemaError(kind: "milestone", id: string, error: z.ZodError): never {
	const issue = error.issues[0];
	const detail = issue ? formatIssue(issue) : "invalid frontmatter";
	throw new FrontmatterSchemaError(`Invalid ${kind} frontmatter for ${id || "(missing id)"}: ${detail}.`);
}

export function parseTask(content: string): Task {
	const { frontmatter, content: rawContent } = parseMarkdown(content);
	const taskId = String(frontmatter[TASK_FRONTMATTER_FIELDS.ID] || "");
	try {
		const record = TaskRecordSchema.parse({
			...frontmatterFields(frontmatter, TASK_FRONTMATTER_KEY_MAP),
			dependencies: frontmatter[TASK_FRONTMATTER_FIELDS.DEPENDENCIES],
			rawContent,
		});
		const schemaVersion = frontmatter[TASK_FRONTMATTER_FIELDS.SCHEMA_VERSION];
		if (schemaVersion !== TASK_FRONTMATTER_SCHEMA_VERSION)
			throw new UnsupportedTaskFrontmatterSchemaError(record.id, schemaVersion);
		return record as Task;
	} catch (error) {
		if (error instanceof z.ZodError) throwTaskSchemaError(taskId, error);
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
