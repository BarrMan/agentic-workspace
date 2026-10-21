import { TaskOrdering } from "../../../../model/task/task-ordering.ts";
import type { Task } from "../../../../model/types.ts";

export type ColumnData = {
	status: string;
	tasks: Task[];
};

export function prepareBoardColumns(tasks: Task[], statuses: string[]): ColumnData[] {
	return TaskOrdering.boardColumns(tasks, statuses);
}
