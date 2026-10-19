import { normalizeStringList, parseDelimitedStringList } from "../lib/string-list.ts";
import { FALLBACK_STATUS } from "../model/constants.ts";
import { normalizeAssignees } from "../model/task/assignee-filter.ts";
import { normalizeDueDate } from "../model/task/due-date.ts";
import type { AgenticWorkspaceConfig, Task, TaskCreateInput } from "../model/types.ts";

export type PreparedTaskCreationInput = {
	title: string;
	requestedParentTaskId: string | undefined;
	labels: string[];
	assignees: string[];
	dependencies: string[];
	references: string[];
	documentation: string[];
	modifiedFiles: string[];
	dueDate: string | undefined;
};

export function generatedTaskTitle(id: string): string {
	const numericBody = id.match(/-(\d+(?:\.\d+)*)$/)?.[1];
	if (!numericBody) throw new Error(`Cannot generate a title for non-numeric task ID ${id}.`);
	return `untitled-${numericBody}`;
}

export function prepareTaskCreationInput(input: TaskCreateInput): PreparedTaskCreationInput {
	if (
		input.ordinal !== undefined &&
		(typeof input.ordinal !== "number" || !Number.isFinite(input.ordinal) || input.ordinal < 0)
	) {
		throw new Error("Ordinal must be a non-negative number.");
	}
	return {
		title: input.title.trim(),
		requestedParentTaskId: input.parentTaskId?.trim(),
		labels: normalizeStringList(input.labels) ?? [],
		assignees: normalizeAssignees(normalizeStringList(input.assignee)),
		dependencies: parseDelimitedStringList(input.dependencies) ?? [],
		references: normalizeStringList(input.references) ?? [],
		documentation: normalizeStringList(input.documentation) ?? [],
		modifiedFiles: normalizeStringList(input.modifiedFiles) ?? [],
		dueDate: normalizeDueDate(input.dueDate, "Due date"),
	};
}

function field(name: string, value: unknown): [string, unknown][] {
	return value === undefined ? [] : [[name, value]];
}

function nonEmptyString(value: string | undefined): string | undefined {
	return value?.trim() || undefined;
}

function createdTaskOptionalFields(
	input: TaskCreateInput,
	prepared: PreparedTaskCreationInput,
	resolved: Parameters<typeof buildCreatedTask>[3],
): Partial<Task> {
	return Object.fromEntries([
		...field("dueDate", prepared.dueDate),
		...field("parentTaskId", nonEmptyString(resolved.parentTaskId)),
		...field("priority", nonEmptyString(resolved.priority)),
		...field("type", nonEmptyString(resolved.type)),
		...field("project", nonEmptyString(resolved.project)),
		...field("ordinal", resolved.ordinal),
		...field("milestone", nonEmptyString(input.milestone)),
		...field("description", input.description),
		...field("agentConfiguration", input.agentConfiguration),
	]) as Partial<Task>;
}

export function buildCreatedTask(
	input: TaskCreateInput,
	prepared: PreparedTaskCreationInput,
	config: AgenticWorkspaceConfig | null,
	resolved: {
		id: string;
		parentTaskId: string | undefined;
		dependencies: string[];
		status: string;
		priority: string | undefined;
		type: string | undefined;
		project: string | undefined;
		ordinal: number | undefined;
		createdDate: string;
	},
): Task {
	const assignee = input.assignee === undefined ? normalizeAssignees(config?.defaultAssignee) : prepared.assignees;
	return {
		id: resolved.id,
		title: prepared.title,
		status: resolved.status || config?.defaultStatus || FALLBACK_STATUS,
		assignee,
		labels: prepared.labels,
		dependencies: resolved.dependencies,
		references: prepared.references,
		documentation: prepared.documentation,
		modifiedFiles: prepared.modifiedFiles,
		rawContent: input.rawContent ?? "",
		createdDate: resolved.createdDate,
		...createdTaskOptionalFields(input, prepared, resolved),
	};
}
