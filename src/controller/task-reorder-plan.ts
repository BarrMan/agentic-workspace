import { calculateNewOrdinal, resolveOrdinalConflicts } from "../model/task/reorder.ts";
import { Task as TaskModel } from "../model/task/task.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import type { Task } from "../model/types.ts";

export function planTaskReorder(
	taskId: string,
	targetStatus: string,
	orderedTaskIds: string[],
	validTasks: Task[],
	targetMilestone: string | undefined,
	hasTargetMilestone: boolean,
	defaultStep: number,
): { updatedTask: Task; changedTasks: Task[] } {
	const movedTask = validTasks.find((task) => taskIdsEqual(task.id, taskId));
	if (!movedTask) throw new Error(`Task ${taskId} not found while reordering`);
	const orderedTaskIdsInCorpus = orderedTaskIds.filter((id) => validTasks.some((task) => taskIdsEqual(task.id, id)));
	const targetIndex = validTasks.findIndex((task) => taskIdsEqual(task.id, taskId));
	if (targetIndex === -1) throw new Error("Implementation error: Task found in validTasks but index missing");
	const orderedTask = orderedTaskIdsInCorpus.find((id) => taskIdsEqual(id, taskId));
	if (!orderedTask) throw new Error("Implementation error: Task found in validTasks but index missing");
	const { ordinal, requiresRebalance } = calculateNewOrdinal({
		previous:
			orderedTaskIdsInCorpus.indexOf(orderedTask) > 0
				? validTasks[orderedTaskIdsInCorpus.indexOf(orderedTask) - 1]
				: null,
		next:
			orderedTaskIdsInCorpus.indexOf(orderedTask) < validTasks.length - 1
				? validTasks[orderedTaskIdsInCorpus.indexOf(orderedTask) + 1]
				: null,
		defaultStep,
	});
	const movedModel = TaskModel.forUpdate(movedTask);
	movedModel.applyBoardPlacement({
		status: targetStatus,
		ordinal,
		milestone: hasTargetMilestone ? targetMilestone : movedTask.milestone,
	});
	const updatedMoved = movedModel.serialize();
	const tasksInOrder = orderedTaskIdsInCorpus
		.map((id) => validTasks.find((task) => taskIdsEqual(task.id, id)))
		.filter((task): task is Task => Boolean(task))
		.map((task) => (taskIdsEqual(task.id, taskId) ? updatedMoved : task));
	const updates = new Map(
		resolveOrdinalConflicts(tasksInOrder, {
			defaultStep,
			startOrdinal: defaultStep,
			forceSequential: requiresRebalance,
		}).map((task) => [task.id.toUpperCase(), task]),
	);
	updates.set(updatedMoved.id.toUpperCase(), updates.get(updatedMoved.id.toUpperCase()) ?? updatedMoved);
	const originals = new Map(validTasks.map((task) => [task.id.toUpperCase(), task]));
	const changedTasks = [...updates.values()].filter((task) => {
		const original = originals.get(task.id.toUpperCase());
		return (
			!original ||
			original.ordinal !== task.ordinal ||
			original.status !== task.status ||
			original.milestone !== task.milestone
		);
	});
	return { updatedTask: updates.get(taskId.toUpperCase()) ?? updatedMoved, changedTasks };
}
