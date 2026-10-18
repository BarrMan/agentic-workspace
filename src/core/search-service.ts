import type { Decision, Document, SearchOptions, SearchResult, SearchResultType, Task } from "../types/index.ts";
import {
	buildTaskSearchFields,
	createTaskFilterMatcher,
	matchesTaskSearchFields,
	type TaskSearchFields,
} from "../utils/task-search.ts";

const EMPTY_TASK_SEARCH_FIELDS: Omit<TaskSearchFields, "title" | "bodyText" | "id"> = {
	idVariants: [],
	dependencyIds: [],
	modifiedFiles: [],
};

interface BaseSearchEntity extends TaskSearchFields {
	readonly type: SearchResultType;
}

interface TaskSearchEntity extends BaseSearchEntity {
	readonly type: "task";
	readonly task: Task;
}

interface DocumentSearchEntity extends BaseSearchEntity {
	readonly type: "document";
	readonly document: Document;
}

interface DecisionSearchEntity extends BaseSearchEntity {
	readonly type: "decision";
	readonly decision: Decision;
}

type SearchEntity = TaskSearchEntity | DocumentSearchEntity | DecisionSearchEntity;

function mapResult(entity: SearchEntity): SearchResult {
	if (entity.type === "task") return { type: "task", score: null, task: entity.task };
	if (entity.type === "document") return { type: "document", score: null, document: entity.document };
	return { type: "decision", score: null, decision: entity.decision };
}

function matchesQuery(entity: SearchEntity, query: string): boolean {
	return matchesTaskSearchFields(entity, query);
}

/** Searches one supplied corpus without retaining or subscribing to it. */
export function searchSnapshot(
	tasks: Task[],
	documents: Document[],
	decisions: Decision[],
	options: SearchOptions,
): SearchResult[] {
	const taskEntities: TaskSearchEntity[] = tasks.map((task) => ({
		...buildTaskSearchFields(task),
		type: "task",
		task,
	}));
	const documentEntities: DocumentSearchEntity[] = documents.map((document) => ({
		...EMPTY_TASK_SEARCH_FIELDS,
		id: document.id,
		type: "document",
		title: document.title,
		bodyText: document.rawContent ?? "",
		document,
	}));
	const decisionEntities: DecisionSearchEntity[] = decisions.map((decision) => ({
		...EMPTY_TASK_SEARCH_FIELDS,
		id: decision.id,
		type: "decision",
		title: decision.title,
		bodyText: [decision.context, decision.decision, decision.consequences, decision.alternatives, decision.rawContent]
			.filter(Boolean)
			.join("\n"),
		decision,
	}));
	const { query = "", limit, types, filters } = options;
	const allowedTypes = new Set<SearchResultType>(types?.length ? types : ["task", "document", "decision"]);
	const matchesTaskFilters = createTaskFilterMatcher(filters ?? {});
	const allowed = (entity: SearchEntity) =>
		allowedTypes.has(entity.type) && (entity.type !== "task" || matchesTaskFilters(entity.task));
	const collection = [...taskEntities, ...documentEntities, ...decisionEntities];
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
