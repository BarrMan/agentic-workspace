import { DateTime } from "luxon";
import { z } from "zod";
import { AgentConfigurationSchema } from "../../model/session/agent-config-schema.ts";
import { normalizeDueDate } from "../../model/task/due-date.ts";
import { isValidTaskId } from "../../model/task/task-id.ts";
import { TASK_FRONTMATTER_FIELDS as FIELD } from "./schema.ts";

/** Frontmatter key for each task property the schema owns. Dependencies are decoded separately. */
export const TASK_FRONTMATTER_KEY_MAP = {
	id: FIELD.ID,
	title: FIELD.TITLE,
	status: FIELD.STATUS,
	reporter: FIELD.REPORTER,
	createdDate: FIELD.CREATED_DATE,
	updatedDate: FIELD.UPDATED_DATE,
	dueDate: FIELD.DUE_DATE,
	labels: FIELD.LABELS,
	milestone: FIELD.MILESTONE,
	references: FIELD.REFERENCES,
	documentation: FIELD.DOCUMENTATION,
	modifiedFiles: FIELD.MODIFIED_FILES,
	parentTaskId: FIELD.PARENT_TASK_ID,
	subtasks: FIELD.SUBTASKS,
	priority: FIELD.PRIORITY,
	type: FIELD.TYPE,
	project: FIELD.PROJECT,
	ordinal: FIELD.ORDINAL,
	agentConfiguration: FIELD.AGENT_CONFIGURATION,
	modeApprovals: FIELD.MODE_APPROVALS,
	worktreePolicy: FIELD.WORKTREE_POLICY,
	description: FIELD.DESCRIPTION,
} as const;

/** Carried in a Zod issue path so the parser can raise the public dependency error. */
export const STRUCTURED_DEPENDENCY_MESSAGE = "contains a mapping or nested list";

function isStructuredDependency(value: unknown): boolean {
	return Array.isArray(value) || Object.prototype.toString.call(value) === "[object Object]";
}

function textOrEmpty(value: unknown): string {
	return String(value || "");
}

function optionalText(value: unknown): unknown {
	return value === undefined || value === null || value === "" ? undefined : value;
}

function textList(value: unknown): string[] {
	return Array.isArray(value) ? value.map(String) : [];
}

function optionalTextList(value: unknown): string[] | undefined {
	return Array.isArray(value) ? value.map(String) : undefined;
}

function dateField(key: string) {
	const message = `${key} must be a date string in YYYY-MM-DD or YYYY-MM-DD HH:mm format`;
	return z.preprocess(
		(value) => (value === undefined || value === null || value === "" ? undefined : value),
		z
			.string({ error: message })
			.refine(
				(value) => {
					try {
						Temporal.PlainDate.from(value);
						return (
							DateTime.fromFormat(value, "yyyy-MM-dd", { zone: "utc" }).isValid ||
							DateTime.fromFormat(value, "yyyy-MM-dd HH:mm", { zone: "utc" }).isValid
						);
					} catch {
						return false;
					}
				},
				{ error: message },
			)
			.optional(),
	);
}

const requiredText = z.preprocess(textOrEmpty, z.string());
const taskId = requiredText.refine(isValidTaskId, {
	error: "must match PREFIX-NUMBER with optional dotted numeric segments",
});
const optionalString = z.preprocess(optionalText, z.string().optional());

const dependencies = z
	.unknown()
	.superRefine((value, ctx) => {
		if (Array.isArray(value)) {
			value.forEach((entry, index) => {
				if (isStructuredDependency(entry))
					ctx.addIssue({ code: "custom", message: STRUCTURED_DEPENDENCY_MESSAGE, path: [index] });
			});
			return;
		}
		if (isStructuredDependency(value))
			ctx.addIssue({ code: "custom", message: STRUCTURED_DEPENDENCY_MESSAGE, path: [] });
	})
	.transform((value) => (Array.isArray(value) ? value.map(String) : []));

const modeApprovals = z
	.record(
		z.string().min(1, { error: "mode_approvals entries must map nonempty mode IDs to true" }),
		z.literal(true, {
			error: "mode_approvals entries must map nonempty mode IDs to true",
		}),
		{ error: "mode_approvals must be a mode-keyed mapping" },
	)
	.optional();

export const TaskFrontmatterSchema = z.object({
	id: taskId,
	title: requiredText,
	status: requiredText,
	reporter: optionalString,
	createdDate: dateField(FIELD.CREATED_DATE).transform((value) => value ?? ""),
	updatedDate: dateField(FIELD.UPDATED_DATE),
	dueDate: z.unknown().transform((value) => normalizeDueDate(value, FIELD.DUE_DATE)),
	labels: z.preprocess(textList, z.array(z.string())),
	milestone: optionalString,
	references: z.preprocess(textList, z.array(z.string())),
	documentation: z.preprocess(textList, z.array(z.string())),
	modifiedFiles: z.preprocess(textList, z.array(z.string())),
	parentTaskId: optionalString,
	subtasks: z.preprocess(optionalTextList, z.array(z.string()).optional()),
	priority: z.preprocess(optionalText, z.string().optional()),
	type: optionalString,
	project: optionalString,
	ordinal: z.preprocess(
		(value) => (value === undefined || value === null || value === "" ? undefined : Number(value)),
		z.number().finite().nonnegative().optional(),
	),
	agentConfiguration: AgentConfigurationSchema.optional(),
	modeApprovals,
	worktreePolicy: z.preprocess(
		optionalText,
		z.enum(["enabled", "disabled"], { error: "worktree_policy must be enabled or disabled" }).optional(),
	),
	description: z.preprocess(optionalText, z.string({ error: "description must be a string" }).optional()),
});

export const TaskRecordSchema = TaskFrontmatterSchema.extend({
	dependencies,
	rawContent: z.string(),
});
