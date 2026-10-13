import type { Task } from "../../../../types/index.ts";
import { type ColumnData, prepareBoardColumns } from "./column-policy.ts";

/** Mutable preview state for one board move. The session owns the instance; this module owns its semantics. */
export type BoardMoveOperation = {
	taskId: string;
	originalStatus: string;
	originalIndex: number;
	targetStatus: string;
	targetIndex: number;
	selectedIds: string[];
	highlightTaskId: string | null;
};

export function getMoveSetIds(operation: BoardMoveOperation): string[] {
	return [operation.taskId, ...operation.selectedIds];
}

export function getPreviewMovingIds(operation: BoardMoveOperation): string[] {
	return operation.highlightTaskId ? [operation.taskId] : getMoveSetIds(operation);
}

export function mapMoveInsertionIndex(fromBase: string[], toBase: string[], index: number): number {
	for (let position = Math.max(0, index); position < fromBase.length; position += 1) {
		const anchor = fromBase[position];
		if (anchor === undefined) break;
		const nextPosition = toBase.indexOf(anchor);
		if (nextPosition !== -1) return nextPosition;
	}
	return toBase.length;
}

export function getMoveInsertionBase(
	tasks: Task[],
	statuses: string[],
	targetStatus: string,
	excludeIds: string[],
): string[] {
	const excluded = new Set(excludeIds);
	const column = prepareBoardColumns(tasks, statuses).find((candidate) => candidate.status === targetStatus);
	return (column?.tasks ?? []).filter((task) => !excluded.has(task.id)).map((task) => task.id);
}

/** Produces the exact visual placement used for confirmation, without mutating source tasks. */
export function projectBoardMove(
	tasks: Task[],
	statuses: string[],
	operation: BoardMoveOperation | null,
): ColumnData[] {
	if (!operation || !tasks.some((task) => task.id === operation.taskId)) return prepareBoardColumns(tasks, statuses);
	const movingIds = new Set(getPreviewMovingIds(operation));
	const movingTasks = prepareBoardColumns(tasks, statuses).flatMap((column) =>
		column.tasks.filter((task) => movingIds.has(task.id)),
	);
	const columns = prepareBoardColumns(
		tasks.filter((task) => !movingIds.has(task.id)),
		statuses,
	);
	const target = columns.find((column) => column.status === operation.targetStatus);
	if (!target) return columns;
	const ghosts = movingTasks.map((task) => ({ ...task, status: operation.targetStatus }));
	target.tasks.splice(Math.max(0, Math.min(operation.targetIndex, target.tasks.length)), 0, ...ghosts);
	return columns;
}
