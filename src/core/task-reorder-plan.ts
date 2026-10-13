import type { Task } from "../types/index.ts";
import { calculateNewOrdinal, resolveOrdinalConflicts } from "./reorder.ts";

export function planTaskReorder(
	taskId: string,
	targetStatus: string,
	orderedTaskIds: string[],
	validTasks: Task[],
	targetMilestone: string | null | undefined,
	defaultStep: number,
	normalizeTargetMilestone: (value: string | null | undefined) => string | undefined,
): { updatedTask: Task; changedTasks: Task[] } {
	const movedTask = validTasks.find((task) => task.id === taskId);
	if (!movedTask) throw new Error(`Task ${taskId} not found while reordering`);
	const targetIndex = orderedTaskIds.filter((id) => validTasks.some((task) => task.id === id)).indexOf(taskId);
	if (targetIndex === -1) throw new Error("Implementation error: Task found in validTasks but index missing");
	const { ordinal, requiresRebalance } = calculateNewOrdinal({
		previous: targetIndex > 0 ? validTasks[targetIndex - 1] : null,
		next: targetIndex < validTasks.length - 1 ? validTasks[targetIndex + 1] : null,
		defaultStep,
	});
	const updatedMoved: Task = {
		...movedTask,
		status: targetStatus,
		...(targetMilestone !== undefined ? { milestone: normalizeTargetMilestone(targetMilestone) } : {}),
		ordinal,
	};
	const tasksInOrder = validTasks.map((task, index) => (index === targetIndex ? updatedMoved : task));
	const updates = new Map(
		resolveOrdinalConflicts(tasksInOrder, {
			defaultStep,
			startOrdinal: defaultStep,
			forceSequential: requiresRebalance,
		}).map((task) => [task.id, task]),
	);
	updates.set(updatedMoved.id, updates.get(updatedMoved.id) ?? updatedMoved);
	const originals = new Map(validTasks.map((task) => [task.id, task]));
	const changedTasks = [...updates.values()].filter((task) => {
		const original = originals.get(task.id);
		return (
			!original ||
			original.ordinal !== task.ordinal ||
			original.status !== task.status ||
			original.milestone !== task.milestone
		);
	});
	return { updatedTask: updates.get(taskId) ?? updatedMoved, changedTasks };
}
