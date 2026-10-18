import type { TaskUpdateInput } from "../types/index.ts";
import type { TaskEditArgs } from "../types/task-edit-args.ts";
import { normalizeAssignees } from "./assignee-filter.ts";
import { normalizeStringList } from "./task-builders.ts";

function sanitizeStringArray(values: string[] | undefined): string[] | undefined {
	if (!values) return undefined;
	const trimmed = values.map((value) => String(value).trim()).filter((value) => value.length > 0);
	return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve a clearable list field: blank-only values are a no-op, an explicit empty array clears the list.
 */
function sanitizeClearableStringArray(values: string[] | undefined): string[] | undefined {
	if (values === undefined) return undefined;
	return sanitizeStringArray(values) ?? (values.length === 0 ? [] : undefined);
}

function assignStringFields(updateInput: TaskUpdateInput, args: TaskEditArgs): void {
	for (const field of ["title", "description", "status", "priority", "type", "project"] as const) {
		const value = args[field];
		if (typeof value === "string") updateInput[field] = value;
	}
}

function assignClearableValue(
	updateInput: TaskUpdateInput,
	field: "dueDate" | "milestone",
	value: string | null | undefined,
): void {
	if (value === null) updateInput[field] = null;
	else if (typeof value === "string") updateInput[field] = value.trim().length > 0 ? value : null;
}

function assignSanitizedList(
	updateInput: TaskUpdateInput,
	field:
		| "labels"
		| "addLabels"
		| "removeLabels"
		| "assignee"
		| "dependencies"
		| "references"
		| "addReferences"
		| "removeReferences"
		| "documentation"
		| "addDocumentation"
		| "removeDocumentation"
		| "modifiedFiles",
	values: string[] | undefined,
	clearable = false,
): void {
	const sanitized = clearable ? sanitizeClearableStringArray(values) : sanitizeStringArray(values);
	if (sanitized) updateInput[field] = sanitized;
}

function assignTaskLists(updateInput: TaskUpdateInput, args: TaskEditArgs): void {
	if (typeof args.ordinal === "number") updateInput.ordinal = args.ordinal;
	const labels = normalizeStringList(args.labels);
	if (labels) updateInput.labels = labels;
	else if (args.labels?.length === 0) updateInput.labels = [];
	assignSanitizedList(updateInput, "addLabels", args.addLabels);
	assignSanitizedList(updateInput, "removeLabels", args.removeLabels);
	if (args.assignee !== undefined) {
		const assignee = normalizeAssignees(args.assignee);
		updateInput.assignee = assignee.length > 0 || args.assignee.length === 0 ? assignee : undefined;
	}
	assignSanitizedList(updateInput, "dependencies", args.dependencies, true);
	assignSanitizedList(updateInput, "references", args.references, true);
	assignSanitizedList(updateInput, "addReferences", args.addReferences);
	assignSanitizedList(updateInput, "removeReferences", args.removeReferences);
	assignSanitizedList(updateInput, "documentation", args.documentation, true);
	assignSanitizedList(updateInput, "addDocumentation", args.addDocumentation);
	assignSanitizedList(updateInput, "removeDocumentation", args.removeDocumentation);
	assignSanitizedList(updateInput, "modifiedFiles", args.modifiedFiles);
}

export function buildTaskUpdateInput(args: TaskEditArgs): TaskUpdateInput {
	const updateInput: TaskUpdateInput = {};

	assignStringFields(updateInput, args);
	assignClearableValue(updateInput, "dueDate", args.dueDate);
	assignClearableValue(updateInput, "milestone", args.milestone);

	assignTaskLists(updateInput, args);
	return updateInput;
}
