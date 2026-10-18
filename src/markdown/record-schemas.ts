import { z } from "zod";
import { DOCUMENT_TYPE_VALUES } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import {
	DECISION_FRONTMATTER_FIELDS as DECISION_FIELD,
	DOCUMENT_FRONTMATTER_FIELDS as DOCUMENT_FIELD,
	FRONTMATTER_DATE_PATTERN,
	MILESTONE_FRONTMATTER_FIELDS as MILESTONE_FIELD,
} from "./schema.ts";

export const DECISION_FRONTMATTER_KEY_MAP = {
	id: DECISION_FIELD.ID,
	title: DECISION_FIELD.TITLE,
	date: DECISION_FIELD.DATE,
	status: DECISION_FIELD.STATUS,
	context: DECISION_FIELD.CONTEXT,
	decision: DECISION_FIELD.DECISION,
	consequences: DECISION_FIELD.CONSEQUENCES,
	alternatives: DECISION_FIELD.ALTERNATIVES,
} as const;

export const MILESTONE_FRONTMATTER_KEY_MAP = {
	id: MILESTONE_FIELD.ID,
	title: MILESTONE_FIELD.TITLE,
	dueDate: MILESTONE_FIELD.DUE_DATE,
	description: MILESTONE_FIELD.DESCRIPTION,
} as const;

export const DOCUMENT_FRONTMATTER_KEY_MAP = {
	id: DOCUMENT_FIELD.ID,
	title: DOCUMENT_FIELD.TITLE,
	type: DOCUMENT_FIELD.TYPE,
	createdDate: DOCUMENT_FIELD.CREATED_DATE,
	updatedDate: DOCUMENT_FIELD.UPDATED_DATE,
	tags: DOCUMENT_FIELD.TAGS,
} as const;

function textOrEmpty(value: unknown): string {
	return String(value || "");
}

function dateField(key: string) {
	const message = `${key} must be a date string in YYYY-MM-DD or YYYY-MM-DD HH:mm format`;
	return z.preprocess(
		(value) => (value === undefined || value === null || value === "" ? undefined : value),
		z.string({ error: message }).regex(FRONTMATTER_DATE_PATTERN, { error: message }).optional(),
	);
}

function dateFieldOrEmpty(key: string) {
	return dateField(key).transform((value) => value ?? "");
}

function textField(key: string) {
	return z.string({ error: `${key} must be a string` }).optional();
}

function textFieldOrEmpty(key: string) {
	return textField(key).transform((value) => value ?? "");
}

export const DecisionFrontmatterSchema = z.object({
	id: z.preprocess(textOrEmpty, z.string()),
	title: z.preprocess(textOrEmpty, z.string()),
	date: dateFieldOrEmpty(DECISION_FIELD.DATE),
	status: z.preprocess((value) => (value ? String(value) : "proposed"), z.string()),
	context: textFieldOrEmpty(DECISION_FIELD.CONTEXT),
	decision: textFieldOrEmpty(DECISION_FIELD.DECISION),
	consequences: textFieldOrEmpty(DECISION_FIELD.CONSEQUENCES),
	alternatives: textField(DECISION_FIELD.ALTERNATIVES),
});

export const MilestoneFrontmatterSchema = z.object({
	id: z.preprocess(textOrEmpty, z.string()),
	title: z.preprocess(textOrEmpty, z.string()),
	dueDate: z.unknown().transform((value) => normalizeDueDate(value, MILESTONE_FIELD.DUE_DATE)),
	description: textFieldOrEmpty(MILESTONE_FIELD.DESCRIPTION),
});

export const DocumentFrontmatterSchema = z.object({
	id: z.preprocess(textOrEmpty, z.string()),
	title: z.preprocess(textOrEmpty, z.string()),
	type: z.preprocess(
		(value) => (value ? String(value) : "other"),
		z.enum(DOCUMENT_TYPE_VALUES, { error: `type must be one of ${DOCUMENT_TYPE_VALUES.join(", ")}` }),
	),
	createdDate: dateFieldOrEmpty(DOCUMENT_FIELD.CREATED_DATE),
	updatedDate: dateField(DOCUMENT_FIELD.UPDATED_DATE),
	tags: z.preprocess((value) => (Array.isArray(value) ? value.map(String) : undefined), z.array(z.string()).optional()),
});

export type DecisionFrontmatterRecord = z.infer<typeof DecisionFrontmatterSchema>;
export type MilestoneFrontmatterRecord = z.infer<typeof MilestoneFrontmatterSchema>;
export type DocumentFrontmatterRecord = z.infer<typeof DocumentFrontmatterSchema>;
