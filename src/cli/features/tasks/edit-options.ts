import type { Core } from "../../../index.ts";
import { normalizeStringList, toStringArray } from "../../../lib/string-list.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../../../model/task/priority-config.ts";
import { formatValidStatuses } from "../../../model/task/status.ts";
import type { TaskUpdateInput } from "../../../model/types.ts";
import type { TaskEditArgs } from "../../task-edit-args.ts";
import { buildTaskUpdateInput } from "../../task-edit-builder.ts";
import { validateTaskListFlags } from "./edit-list-options.ts";

type ParseResult = { input: TaskUpdateInput } | { error: string; formatForTask?: boolean };

export type TaskEditOptionContext = {
	core: Core;
	statuses: () => Promise<string[]>;
};

async function parseScalarOptions(
	options: Record<string, unknown>,
	context: TaskEditOptionContext,
): Promise<ParseResult | TaskEditArgs> {
	const args: TaskEditArgs = {};
	const statusError = await addStatusOption(args, options, context);
	if (statusError) return statusError;
	const priorityError = await addPriorityOption(args, options, context);
	if (priorityError) return priorityError;
	if (options.ordinal !== undefined) {
		const ordinal = Number(options.ordinal);
		if (Number.isNaN(ordinal) || ordinal < 0)
			return { error: `Invalid ordinal: ${options.ordinal}. Must be a non-negative number.` };
		args.ordinal = ordinal;
	}
	if (options.milestone !== undefined && options.clearMilestone)
		return { error: "Cannot use --milestone and --clear-milestone together." };
	if (options.dueDate !== undefined && options.clearDueDate)
		return { error: "Cannot use --due-date and --clear-due-date together." };
	addMilestoneOption(args, options);
	addDueDateOption(args, options);
	if (options.type !== undefined) args.type = String(options.type);
	if (options.project !== undefined) args.project = String(options.project);
	return args;
}

async function addStatusOption(
	args: TaskEditArgs,
	options: Record<string, unknown>,
	context: TaskEditOptionContext,
): Promise<ParseResult | undefined> {
	if (!options.status) return undefined;
	const validStatuses = await context.statuses();
	const status = String(options.status);
	if (!validStatuses.includes(status))
		return { error: `Invalid status: ${options.status}. Valid statuses are: ${formatValidStatuses(validStatuses)}` };
	args.status = status;
}

async function addPriorityOption(
	args: TaskEditArgs,
	options: Record<string, unknown>,
	context: TaskEditOptionContext,
): Promise<ParseResult | undefined> {
	if (!options.priority) return undefined;
	const config = await context.core.getStoredConfig();
	const priority = resolvePriorityValue(String(options.priority), config);
	if (!priority)
		return { error: `Invalid priority: ${options.priority}. Valid values are: ${formatValidPriorityValues(config)}` };
	args.priority = priority;
}

function addMilestoneOption(args: TaskEditArgs, options: Record<string, unknown>): void {
	if (typeof options.milestone === "string") args.milestone = options.milestone;
	else if (options.clearMilestone) args.milestone = null;
}

function addDueDateOption(args: TaskEditArgs, options: Record<string, unknown>): void {
	if (typeof options.dueDate === "string") args.dueDate = options.dueDate;
	else if (options.clearDueDate) args.dueDate = null;
}

function validateLabelOptions(options: Record<string, unknown>): ParseResult | undefined {
	const labels = toStringArray(options.label);
	const addedLabels = toStringArray(options.addLabel);
	const removedLabels = toStringArray(options.removeLabel);
	if (options.clearLabels && (labels.length > 0 || addedLabels.length > 0 || removedLabels.length > 0))
		return {
			error:
				"Cannot combine --clear-labels with --label, --add-label, or --remove-label. Use --clear-labels by itself, or repeat --label for the final full label set.",
		};
	if (labels.length > 0 && (addedLabels.length > 0 || removedLabels.length > 0))
		return {
			error:
				"Cannot combine --label with --add-label or --remove-label. Repeat --label for the final full label set, or use add/remove flags without --label.",
		};
	return undefined;
}

function parseListOptions(options: Record<string, unknown>): ParseResult | TaskEditArgs {
	const listError = validateTaskListFlags(options, { supportsClearFlags: true });
	if (listError) return { error: listError };
	if (
		toStringArray(options.ref).length > 0 &&
		(toStringArray(options.addRef).length > 0 || toStringArray(options.removeRef).length > 0)
	)
		return {
			error:
				"Cannot combine --ref with --add-ref or --remove-ref. Repeat --ref for the final full reference set, or use add/remove flags without --ref.",
		};
	const args: TaskEditArgs = {};
	addListValue(args, "labels", options.label, options.clearLabels);
	addDelimitedValue(args, "addLabels", options.addLabel);
	addDelimitedValue(args, "removeLabels", options.removeLabel);
	addClearableValue(args, "assignee", options.assignee);
	addClearableValue(
		args,
		"dependencies",
		[...toStringArray(options.dependsOn), ...toStringArray(options.dep)],
		options.clearDeps,
	);
	addClearableValue(args, "references", options.ref, options.clearRefs);
	addDelimitedValue(args, "addReferences", options.addRef);
	addDelimitedValue(args, "removeReferences", options.removeRef);
	addClearableValue(args, "documentation", options.doc, options.clearDocs);
	const modifiedFiles = normalizeStringList(toStringArray(options.modifiedFile));
	if (modifiedFiles?.length) args.modifiedFiles = modifiedFiles;
	return args;
}

function addDelimitedValue(args: TaskEditArgs, field: keyof TaskEditArgs, value: unknown): void {
	const values = normalizeStringList(toStringArray(value)) ?? [];
	if (values.length > 0) Object.assign(args, { [field]: values });
}

function addListValue(args: TaskEditArgs, field: keyof TaskEditArgs, value: unknown, clear: unknown): void {
	const values = normalizeStringList(toStringArray(value)) ?? [];
	if (values.length > 0) Object.assign(args, { [field]: values });
	else if (clear) Object.assign(args, { [field]: [] });
}

function addClearableValue(args: TaskEditArgs, field: keyof TaskEditArgs, value: unknown, clear?: unknown): void {
	const values = normalizeStringList(toStringArray(value));
	if (values) Object.assign(args, { [field]: values });
	else if (clear) Object.assign(args, { [field]: [] });
}

function parseContentOptions(options: Record<string, unknown>): TaskEditArgs {
	const args: TaskEditArgs = {};
	if (options.title) args.title = String(options.title);
	const description = options.description ?? options.desc;
	if (description !== undefined) args.description = String(description);
	return args;
}

export async function parseTaskEditOptions(
	options: Record<string, unknown>,
	context: TaskEditOptionContext,
): Promise<ParseResult> {
	const scalar = await parseScalarOptions(options, context);
	if ("error" in scalar) return scalar;
	const labelError = validateLabelOptions(options);
	if (labelError) return labelError;
	const lists = parseListOptions(options);
	if ("error" in lists) return lists;
	return { input: buildTaskUpdateInput({ ...scalar, ...lists, ...parseContentOptions(options) }) };
}
