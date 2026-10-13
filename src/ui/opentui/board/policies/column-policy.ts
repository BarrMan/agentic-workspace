import { buildKanbanStatusGroups } from "../../../../board.ts";
import type { Task } from "../../../../types/index.ts";
import { compareTaskIds } from "../../../../utils/task-sorting.ts";

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
		return compareTaskIds(b.id, a.id);
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
		...(childrenByParent.get(task.id) ?? []).sort((a, b) => compareTaskIds(a.id, b.id)),
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

export function filterVisibleColumns(data: ColumnData[], hideEmptyColumns: boolean, isMoving: boolean): ColumnData[] {
	if (!hideEmptyColumns || isMoving) return data;
	const nonEmpty = data.filter((column) => column.tasks.length > 0);
	return nonEmpty.length > 0 ? nonEmpty : data;
}

export function shouldRebuildColumns(current: ColumnData[], next: ColumnData[]): boolean {
	return (
		current.length !== next.length ||
		next.some(
			(column, index) =>
				current[index]?.status !== column.status ||
				current[index]?.tasks.some((task, taskIndex) => task.id !== column.tasks[taskIndex]?.id) ||
				current[index]?.tasks.length !== column.tasks.length,
		)
	);
}

export function upsertBoardTask(tasks: readonly Task[], task: Task): Task[] {
	const existingIndex = tasks.findIndex((candidate) => candidate.id === task.id);
	if (existingIndex === -1) return [...tasks, task];
	const next = [...tasks];
	next[existingIndex] = task;
	return next;
}
