import { type TaskSearchFields, TaskSearchIndex } from "../model/task/task-search.ts";
import type { SearchOptions, SearchResult, SearchResultType, Task } from "../model/types.ts";

export type PersistentSearchOptions = SearchOptions & { includeArchived?: boolean };

interface TaskSearchEntity extends TaskSearchFields {
	readonly type: "task";
	readonly task: Task;
}

function mapResult(entity: TaskSearchEntity): SearchResult {
	return { type: "task", score: null, task: entity.task };
}

function matchesQuery(entity: TaskSearchEntity, query: string): boolean {
	return TaskSearchIndex.matchesFields(entity, query);
}

/** Searches one supplied corpus without retaining or subscribing to it. */
export function searchSnapshot(tasks: Task[], options: SearchOptions): SearchResult[] {
	const taskEntities: TaskSearchEntity[] = tasks.map((task) => ({
		...TaskSearchIndex.fields(task),
		type: "task",
		task,
	}));
	const { query = "", limit, types, filters } = options;
	const allowedTypes = new Set<SearchResultType>(types?.length ? types : ["task"]);
	const matchesTaskFilters = TaskSearchIndex.matcher(filters ?? {});
	const allowed = (entity: TaskSearchEntity) => allowedTypes.has(entity.type) && matchesTaskFilters(entity.task);
	const collection = taskEntities;
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		const results: SearchResult[] = [];
		for (const entity of collection) {
			if (!allowed(entity)) continue;
			results.push(mapResult(entity));
			if (limit && results.length >= limit) break;
		}
		return results;
	}
	const results: SearchResult[] = [];
	for (const entity of collection) {
		if (!allowed(entity) || !matchesQuery(entity, trimmedQuery)) continue;
		results.push(mapResult(entity));
		if (limit && results.length >= limit) break;
	}
	return results;
}
