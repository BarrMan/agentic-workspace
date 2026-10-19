import { z } from "zod";
import { normalizeDueDate } from "../../model/task/due-date.ts";
import { MILESTONE_FRONTMATTER_FIELDS as MILESTONE_FIELD } from "./schema.ts";

export const MILESTONE_FRONTMATTER_KEY_MAP = {
	id: MILESTONE_FIELD.ID,
	title: MILESTONE_FIELD.TITLE,
	dueDate: MILESTONE_FIELD.DUE_DATE,
	description: MILESTONE_FIELD.DESCRIPTION,
} as const;

function textOrEmpty(value: unknown): string {
	return String(value || "");
}

function textField(key: string) {
	return z.string({ error: `${key} must be a string` }).optional();
}

function textFieldOrEmpty(key: string) {
	return textField(key).transform((value) => value ?? "");
}

export const MilestoneFrontmatterSchema = z.object({
	id: z.preprocess(textOrEmpty, z.string()),
	title: z.preprocess(textOrEmpty, z.string()),
	dueDate: z.unknown().transform((value) => normalizeDueDate(value, MILESTONE_FIELD.DUE_DATE)),
	description: textFieldOrEmpty(MILESTONE_FIELD.DESCRIPTION),
});
