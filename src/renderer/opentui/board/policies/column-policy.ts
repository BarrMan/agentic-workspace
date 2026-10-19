import { TaskOrdering } from "../../../../model/task/task-ordering.ts";
import type { Task } from "../../../../model/types.ts";
import { buildKanbanStatusGroups } from "../../../board.ts";

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
