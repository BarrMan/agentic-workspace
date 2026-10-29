import type { Task } from "../types.ts";
import { TaskOrdering } from "./task-ordering.ts";

export interface SubtaskProgress {
	total: number;
	completed: number;
}

/** Relationship and subtask operations over a loaded task corpus. */
export class TaskCollection {
	constructor(private readonly tasks: readonly Task[]) {}

	findParent(task: Pick<Task, "parentTaskId">): Task | null {
		const parentId = task.parentTaskId;
		return parentId ? (this.tasks.find((candidate) => parentId === candidate.id) ?? null) : null;
	}

	directSubtasks(task: Pick<Task, "id">): Task[] {
		const children = this.tasks.filter((candidate) => candidate.parentTaskId === task.id);
		return TaskOrdering.byId(children);
	}

	subtaskProgress(task: Pick<Task, "id">): SubtaskProgress | null {
		const children = this.tasks.filter((candidate) => candidate.parentTaskId === task.id);
		if (children.length === 0) return null;
		return {
			total: children.length,
			completed: children.filter((candidate) => candidate.done).length,
		};
	}

	/** Copy the record with parent and direct-subtask summaries resolved from the corpus. */
	withSubtaskSummaries(task: Task): Task {
		const parentTitle = this.findParent(task)?.title;
		const summaries = this.directSubtasks(task).map(({ id, title }) => ({ id, title }));
		if (summaries.length === 0) {
			return parentTitle && parentTitle !== task.parentTaskTitle ? { ...task, parentTaskTitle: parentTitle } : task;
		}
		return {
			...task,
			...(parentTitle && parentTitle !== task.parentTaskTitle ? { parentTaskTitle: parentTitle } : {}),
			subtasks: summaries.map((summary) => summary.id),
			subtaskSummaries: summaries,
		};
	}
}
