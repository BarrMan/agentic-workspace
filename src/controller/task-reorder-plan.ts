import { calculateNewOrdinal, reconcileBoardPlacement } from "../model/task/reorder.ts";
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
	const orderedTask = orderedTaskIdsInCorpus.find((id) => taskIdsEqual(id, taskId));
	if (!orderedTask) throw new Error("Implementation error: Task found in validTasks but index missing");
	const targetIndex = orderedTaskIdsInCorpus.indexOf(orderedTask);
	const orderedTasks = orderedTaskIdsInCorpus.map((id) => validTasks.find((task) => taskIdsEqual(task.id, id)));
	const { ordinal, requiresRebalance } = calculateNewOrdinal({
		previous: targetIndex > 0 ? (orderedTasks[targetIndex - 1] ?? null) : null,
		next: targetIndex < orderedTasks.length - 1 ? (orderedTasks[targetIndex + 1] ?? null) : null,
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
	const { tasks, changedTasks } = reconcileBoardPlacement(tasksInOrder, validTasks, defaultStep, requiresRebalance);
	return {
		updatedTask: tasks.find((task) => taskIdsEqual(task.id, taskId)) ?? updatedMoved,
		changedTasks,
	};
}
