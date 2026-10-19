import { TaskSearchIndex } from "../model/task/task-search.ts";
import type { Task, TaskListFilter } from "../model/types.ts";
import { isLocalEditableTask } from "../model/types.ts";
import type { Storage } from "../storage/storage.ts";

export type TaskQueryOptions = {
	filters?: TaskListFilter;
	query?: string;
	limit?: number;
	includeCrossBranch?: boolean;
	refreshCrossBranch?: boolean;
	/** An external parent reference resolved against the same corpus as the collection read. */
	parent?: string;
};

export type TaskReadOptions = {
	includeCrossBranch?: boolean;
	includeArchived?: boolean;
	refreshCrossBranch?: boolean;
};

export async function filterTaskQueryResults(
	collection: Task[],
	options: TaskQueryOptions,
	_storage: Storage,
): Promise<Task[]> {
	const tasks = options.filters ? TaskSearchIndex.apply(collection, options.filters) : [...collection];
	const visibleTasks = options.includeCrossBranch === false ? tasks.filter(isLocalEditableTask) : tasks;
	return typeof options.limit === "number" && options.limit >= 0 ? visibleTasks.slice(0, options.limit) : visibleTasks;
}
