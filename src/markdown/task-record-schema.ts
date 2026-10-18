import { z } from "zod";
import { AgentConfigurationSchema } from "../agent-workspace/agent-config-schema.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import { normalizePriorityValue } from "../utils/priority-config.ts";
import { TASK_FRONTMATTER_FIELDS as FIELD, FRONTMATTER_DATE_PATTERN } from "./schema.ts";

/** Frontmatter key for each task property the schema owns. Dependencies are decoded separately. */
export const TASK_FRONTMATTER_KEY_MAP = {
	id: FIELD.ID,
	title: FIELD.TITLE,
	status: FIELD.STATUS,
	assignee: FIELD.ASSIGNEE,
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
	onStatusChange: FIELD.ON_STATUS_CHANGE,
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

function optionalText(value: unknown): string | undefined {
	return value ? String(value) : undefined;
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
		z.string({ error: message }).regex(FRONTMATTER_DATE_PATTERN, { error: message }).optional(),
	);
}

const requiredText = z.preprocess(textOrEmpty, z.string());
const optionalString = z.preprocess(optionalText, z.string().optional());

const assignees = z.preprocess(
	(value) => (value === undefined || value === null ? [] : value),
	z.array(z.unknown(), { error: "assignee must be a list" }).transform((values) => values.map(String)),
);

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
	id: requiredText,
	title: requiredText,
	status: requiredText,
	assignee: assignees,
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
	priority: z.preprocess(
		optionalText,
		z
			.string()
			.optional()
			.transform((value) => normalizePriorityValue(value)),
	),
	type: optionalString,
	project: optionalString,
	ordinal: z.preprocess(
		(value) => (value === undefined || value === null || value === "" ? undefined : Number(value)),
		z.number().finite().nonnegative().optional(),
	),
	onStatusChange: optionalString,
	agentConfiguration: AgentConfigurationSchema.optional(),
	modeApprovals,
	worktreePolicy: z.preprocess(
		optionalText,
		z.enum(["enabled", "disabled"], { error: "worktree_policy must be enabled or disabled" }).optional(),
	),
	description: z.string({ error: "description must be a string" }).optional(),
});

export const TaskRecordSchema = TaskFrontmatterSchema.extend({
	dependencies,
	rawContent: z.string(),
});

export type TaskFrontmatterRecord = z.infer<typeof TaskFrontmatterSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
