import type { Task } from "../../../../model/types.ts";

export type DraftField = "title" | "description" | "type" | "priority";

export interface WorkspaceDraft {
	values: Record<DraftField, string>;
	cursor: Partial<Record<DraftField, { x: number; y: number }>>;
	baseline: Record<DraftField, string>;
}

function taskFieldValues(task: Task): Record<DraftField, string> {
	return {
		title: task.title,
		description: task.description ?? "",
		type: task.type ?? "",
		priority: task.priority ?? "",
	};
}

export function createWorkspaceDraft(task: Task): WorkspaceDraft {
	const values = taskFieldValues(task);
	return { values: { ...values }, baseline: values, cursor: {} };
}

export function changedTaskFields(draft: WorkspaceDraft, latest: Task): Partial<Record<DraftField, string>> {
	const latestValues = taskFieldValues(latest);
	const changed: Partial<Record<DraftField, string>> = {};
	for (const field of Object.keys(draft.values) as DraftField[]) {
		if (draft.values[field] !== draft.baseline[field]) {
			if (latestValues[field] !== draft.baseline[field]) throw new Error(`${field} changed outside this workspace.`);
			changed[field] = draft.values[field];
		}
	}
	return changed;
}
