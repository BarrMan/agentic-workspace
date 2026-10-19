import { TaskSearchIndex } from "../model/task/task-search.ts";
import type { Task, TaskListFilter } from "../model/types.ts";
import type { Storage } from "../storage/storage.ts";

export type TaskQueryOptions = {
	filters?: TaskListFilter;
	query?: string;
	limit?: number;
	/** An external parent reference resolved against the same corpus as the collection read. */
	parent?: string;
};

export type TaskReadOptions = {
	includeArchived?: boolean;
};

export async function filterTaskQueryResults(
	collection: Task[],
	options: TaskQueryOptions,
	_storage: Storage,
): Promise<Task[]> {
	const tasks = options.filters ? TaskSearchIndex.apply(collection, options.filters) : [...collection];
	return typeof options.limit === "number" && options.limit >= 0 ? tasks.slice(0, options.limit) : tasks;
}
