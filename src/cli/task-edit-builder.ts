import { normalizeStringList } from "../lib/string-list.ts";
import type { TaskUpdateInput } from "../model/types.ts";
import type { TaskEditArgs } from "./task-edit-args.ts";

/**
 * Resolve a clearable list field: blank-only values are a no-op, an explicit empty array clears the list.
 */
function sanitizeClearableStringArray(values: string[] | undefined): string[] | undefined {
	if (values === undefined) return undefined;
	return normalizeStringList(values) ?? (values.length === 0 ? [] : undefined);
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
	const sanitized = clearable ? sanitizeClearableStringArray(values) : normalizeStringList(values);
	if (sanitized) updateInput[field] = sanitized;
}

function assignTaskLists(updateInput: TaskUpdateInput, args: TaskEditArgs): void {
	if (typeof args.ordinal === "number") updateInput.ordinal = args.ordinal;
	assignSanitizedList(updateInput, "labels", args.labels, true);
	assignSanitizedList(updateInput, "addLabels", args.addLabels);
	assignSanitizedList(updateInput, "removeLabels", args.removeLabels);
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
