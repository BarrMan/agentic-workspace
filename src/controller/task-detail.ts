import {
	buildDependencyGraph,
	createDependencyGraphContext,
	type DependencyGraph,
} from "../model/task/dependency-graph.ts";
import { createReadinessGraph, getTaskReadiness, type TaskReadiness } from "../model/task/readiness.ts";
import type { TaskDetail, TaskListItem } from "../model/task/task-projection.ts";
import type { Task } from "../model/types.ts";
import type { Core } from "./agentic-workspace.ts";

/**
 * The records a read is allowed to resolve relationships against, loaded once and shared by every
 * question asked about them. Readiness and the dependency graph both take this, so they can never
 * end up looking at different corpora.
 */
export interface TaskCorpus {
	tasks: Task[];
	completedTasks: Task[];
}

/** Read relationships from the service's loaded, watcher-maintained collection. */
function taskCorpus(core: Core): TaskCorpus {
	return {
		tasks: core.tasks.getActiveTasks(),
		completedTasks: core.tasks.getCompletedTasks(),
	};
}

/**
 * Attach the derived relationships using a corpus the caller already holds.
 *
 * Readiness and the dependency graph are answered from the same corpus in the same call, so the
 * two can never describe different records of the same project.
 */
export function toTaskDetail(task: Task, corpus: TaskCorpus): TaskDetail {
	const index = new Map([...corpus.tasks, ...corpus.completedTasks].map((record) => [record.id, record]));
	const dependencyContext = createDependencyGraphContext({ ...corpus, index });
	const readinessGraph = createReadinessGraph({ ...corpus, index });
	return {
		...task,
		dependencyGraph: buildDependencyGraph(task, dependencyContext),
		readiness: getTaskReadiness(task, readinessGraph),
	};
}

/**
 * Attach readiness to a whole list in one pass over the corpus.
 *
 * The index is built once and every task answers from it, so a list interface never resolves
 * dependencies per row. The corpus is the whole project, never the list: list filters narrow what
 * is displayed, and readiness must still see the dependencies they hide.
 */
export function withReadiness(tasks: readonly Task[], corpus: TaskCorpus): TaskListItem[] {
	const readinessGraph = createReadinessGraph(corpus);
	return tasks.map((task) => ({ ...task, isReady: getTaskReadiness(task, readinessGraph).isReady }));
}

/** Attach derived relationships from the in-memory task collection. */
export async function loadTaskDetail(core: Core, task: Task): Promise<TaskDetail> {
	return toTaskDetail(task, taskCorpus(core));
}

/**
 * Attach readiness to a list using active and completed records from the in-memory collection.
 */
export async function loadTaskListItems(core: Core, tasks: readonly Task[]): Promise<TaskListItem[]> {
	return withReadiness(tasks, taskCorpus(core));
}

/**
 * The dependency graph of whatever a renderer was handed. A plain `Task` simply has none, which is
 * what keeps edit confirmations and other non-detail output the size they already are.
 */
export function taskDependencyGraph(task: Task | TaskDetail | null | undefined): DependencyGraph | undefined {
	return (task as Partial<TaskDetail> | null | undefined)?.dependencyGraph;
}

/** The readiness of whatever a renderer was handed, on the same terms as the dependency graph. */
export function taskReadiness(task: Task | TaskDetail | null | undefined): TaskReadiness | undefined {
	return (task as Partial<TaskDetail> | null | undefined)?.readiness;
}
