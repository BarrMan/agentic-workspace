import { statusComparisonKey } from "../../../../model/task/status.ts";
import { TaskOrdering } from "../../../../model/task/task-ordering.ts";
import type { Task } from "../../../../model/types.ts";

function normalizeConfiguredStatuses(statuses: string[]): { ordered: string[]; canonicalByKey: Map<string, string> } {
	const canonicalByKey = new Map<string, string>();
	const ordered: string[] = [];
	const seen = new Set<string>();

	for (const status of statuses ?? []) {
		if (typeof status !== "string") continue;
		const key = statusComparisonKey(status);
		if (!canonicalByKey.has(key)) canonicalByKey.set(key, status);
		if (seen.has(key)) continue;
		ordered.push(status);
		seen.add(key);
	}

	return { ordered, canonicalByKey };
}

function buildKanbanStatusGroups(
	tasks: Task[],
	statuses: string[],
): { orderedStatuses: string[]; groupedTasks: Map<string, Task[]> } {
	const { ordered: orderedConfiguredStatuses, canonicalByKey } = normalizeConfiguredStatuses(statuses);

	const groupedTasks = new Map<string, Task[]>();
	for (const status of orderedConfiguredStatuses) {
		groupedTasks.set(status, []);
	}

	for (const task of tasks) {
		const raw = task.status ?? "";
		if (!raw) continue;
		const key = statusComparisonKey(raw);
		const canonical = canonicalByKey.get(key) ?? raw;
		if (!groupedTasks.has(canonical)) {
			groupedTasks.set(canonical, []);
		}
		groupedTasks.get(canonical)?.push(task);
	}

	const orderedStatuses = [...orderedConfiguredStatuses];
	const seen = new Set(orderedStatuses.map(statusComparisonKey));

	for (const status of groupedTasks.keys()) {
		const key = statusComparisonKey(status);
		if (seen.has(key)) continue;
		orderedStatuses.push(status);
		seen.add(key);
	}

	return { orderedStatuses, groupedTasks };
}

export type ColumnData = {
	status: string;
	tasks: Task[];
};

function buildColumnTasks(items: Task[], byId: Map<string, Task>): Task[] {
	const topLevel: Task[] = [];
	const childrenByParent = new Map<string, Task[]>();
	const sorted = items.slice().sort((a, b) => {
		if (typeof a.ordinal === "number" && typeof b.ordinal === "number" && a.ordinal !== b.ordinal) {
			return b.ordinal - a.ordinal;
		}
		if (typeof a.ordinal === "number" && typeof b.ordinal !== "number") return -1;
		if (typeof b.ordinal === "number" && typeof a.ordinal !== "number") return 1;
		return TaskOrdering.compareIds(b.id, a.id);
	});

	for (const task of sorted) {
		const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
		if (parent && parent.status === task.status) {
			const children = childrenByParent.get(parent.id) ?? [];
			children.push(task);
			childrenByParent.set(parent.id, children);
		} else {
			topLevel.push(task);
		}
	}

	return topLevel.flatMap((task) => [
		task,
		...(childrenByParent.get(task.id) ?? []).sort((a, b) => TaskOrdering.compareIds(a.id, b.id)),
	]);
}

export function prepareBoardColumns(tasks: Task[], statuses: string[]): ColumnData[] {
	const { orderedStatuses, groupedTasks } = buildKanbanStatusGroups(tasks, statuses);
	const byId = new Map<string, Task>(tasks.map((task) => [task.id, task]));
	return orderedStatuses.map((status) => ({
		status,
		tasks: buildColumnTasks(groupedTasks.get(status) ?? [], byId),
	}));
}
