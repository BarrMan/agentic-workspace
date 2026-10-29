import { normalizeStringList } from "../lib/string-list.ts";
import { FALLBACK_STATUS } from "../model/constants.ts";
import { normalizeDueDate } from "../model/task/due-date.ts";
import { labelComparisonKey } from "../model/task/label-filter.ts";
import type { AgenticWorkspaceConfig, Task, TaskCreateInput } from "../model/types.ts";

export type PreparedTaskCreationInput = {
	title: string;
	requestedParentTaskId: string | undefined;
	labels: string[];
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
		labels: uniqueLabels(normalizeStringList(input.labels) ?? []),
		dependencies: normalizeStringList(input.dependencies) ?? [],
		references: normalizeStringList(input.references) ?? [],
		documentation: normalizeStringList(input.documentation) ?? [],
		modifiedFiles: normalizeStringList(input.modifiedFiles) ?? [],
		dueDate: normalizeDueDate(input.dueDate, "Due date"),
	};
}

function uniqueLabels(labels: string[]): string[] {
	const seen = new Set<string>();
	return labels.filter((label) => {
		const key = labelComparisonKey(label);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function createdTaskOptionalFields(
	input: TaskCreateInput,
	prepared: PreparedTaskCreationInput,
	resolved: Parameters<typeof buildCreatedTask>[3],
): Partial<Task> {
	return {
		...(prepared.dueDate !== undefined ? { dueDate: prepared.dueDate } : {}),
		...(resolved.parentTaskId !== undefined ? { parentTaskId: resolved.parentTaskId } : {}),
		...(resolved.priority !== undefined ? { priority: resolved.priority } : {}),
		...(resolved.type !== undefined ? { type: resolved.type } : {}),
		...(resolved.project !== undefined ? { project: resolved.project } : {}),
		...(resolved.ordinal !== undefined ? { ordinal: resolved.ordinal } : {}),
		...(input.milestone !== undefined ? { milestone: input.milestone } : {}),
		...(input.description !== undefined ? { description: input.description } : {}),
		...(input.agentConfiguration !== undefined ? { agentConfiguration: input.agentConfiguration } : {}),
	};
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
	return {
		id: resolved.id,
		title: prepared.title,
		status: resolved.status || config?.defaultStatus || FALLBACK_STATUS,
		done: false,
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
