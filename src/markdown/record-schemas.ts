import { z } from "zod";
import { normalizeDueDate } from "../utils/due-date.ts";
import {
	DECISION_FRONTMATTER_FIELDS as DECISION_FIELD,
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

export type DecisionFrontmatterRecord = z.infer<typeof DecisionFrontmatterSchema>;
export type MilestoneFrontmatterRecord = z.infer<typeof MilestoneFrontmatterSchema>;
