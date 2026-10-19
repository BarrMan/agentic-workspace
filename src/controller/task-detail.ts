import {
	buildDependencyGraph,
	createDependencyGraphContext,
	type DependencyGraph,
} from "../model/task/dependency-graph.ts";
import { createReadinessGraph, getTaskReadiness, type TaskReadiness } from "../model/task/readiness.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import { createTaskRecordIndex } from "../model/task/task-record-index.ts";
import { TASK_SOURCE, type Task } from "../model/types.ts";
import type { Core } from "./agentic-workspace.ts";

/**
 * The records a read is allowed to resolve relationships against, loaded once and shared by every
 * question asked about them. Readiness and the dependency graph both take this, so they can never
 * end up looking at different corpora.
 */
export interface TaskCorpus {
	tasks: Task[];
	completedTasks: Task[];
	statuses: readonly string[] | undefined;
	/**
	 * Identities the store knows more than one file claims. Reads fail closed on these whatever the
	 * merge below kept, so a collision is never answered with whichever record happened to survive.
	 */
	ambiguousIds?: ReadonlySet<string>;
}

/**
 * Load the corpus a read may see.
 *
 * Without cross-branch records this is the working copy plus the completed corpus, which is what
 * every local task lookup already resolves against. With them, the working copy is still read as
 * written and the cross-branch store only contributes identities the working copy does not have:
 * the store resolves each identity to a single record, so merging the other way round would hide a
 * local ID that two files claim and quietly turn an ambiguous dependency into a resolved one.
 */
export async function loadTaskCorpus(
	core: Core,
	options: { includeCrossBranch: boolean } = { includeCrossBranch: false },
): Promise<TaskCorpus> {
	const snapshot = await core.loadTaskSnapshot(options.includeCrossBranch);
	return {
		tasks: snapshot.activeTasks.concat(
			snapshot.tasks.filter((task) => !snapshot.activeTasks.some((local) => taskIdsEqual(local.id, task.id))),
		),
		completedTasks: snapshot.identityIndex.getTasks(true).filter((task) => task.source === TASK_SOURCE.COMPLETED),
		statuses: snapshot.config?.statuses,
		ambiguousIds: snapshot.identityIndex.getContestedIds(),
	};
}

/**
 * A task as a list, search, or board read returns it: the stored record plus the one readiness
 * verdict a list renders. The blockers behind the verdict belong to the detail read, so a list of
 * any size stays the size it already was.
 */
export type TaskListItem = Task & { isReady: boolean };

/**
 * A task as a detail read returns it: the stored record plus the relationships derived from the
 * corpus around it. The derived fields exist only in the read; they are never written back to the
 * Markdown record, and edit confirmations and other non-detail output return plain `Task`s so they
 * cannot pick them up by accident.
 *
 * Surfaces receive this already built and only render it. A function that returns a `TaskDetail`
 * cannot forget to populate the fields, which is why they are required here rather than optional
 * on `Task`.
 */
export type TaskDetail = Task & { dependencyGraph: DependencyGraph; readiness: TaskReadiness };

/**
 * Attach the derived relationships using a corpus the caller already holds.
 *
 * Readiness and the dependency graph are answered from the same corpus in the same call, so the
 * two can never describe different records of the same project.
 */
export function toTaskDetail(task: Task, corpus: TaskCorpus): TaskDetail {
	const { dependencyContext, readinessGraph } = taskDetailGraphs(corpus);
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
 * dependencies per row. The corpus is the whole project, never the list: `--status` and
 * `--assignee` narrow what is displayed, and readiness must still see the dependencies they hid.
 */
export function withReadiness(tasks: readonly Task[], corpus: TaskCorpus): TaskListItem[] {
	const { readinessGraph } = taskDetailGraphs(corpus);
	return tasks.map((task) => ({ ...task, isReady: getTaskReadiness(task, readinessGraph).isReady }));
}

function taskDetailGraphs(corpus: TaskCorpus) {
	const index = createTaskRecordIndex(corpus);
	return {
		dependencyContext: createDependencyGraphContext({ ...corpus, index }),
		readinessGraph: createReadinessGraph({ ...corpus, index }),
	};
}

/** Load the corpus and attach the derived relationships, for a surface that reads per detail view. */
export async function loadTaskDetail(
	core: Core,
	task: Task,
	options: { includeCrossBranch: boolean } = { includeCrossBranch: false },
): Promise<TaskDetail> {
	return toTaskDetail(task, await loadTaskCorpus(core, options));
}

/**
 * Load the corpus and attach readiness to a list, for a surface that renders or filters it.
 *
 * Readiness needs the completed corpus to tell a finished dependency from an unfinished one, which
 * a plain list read does not load. Call this only where the verdict is rendered or filtered on, so
 * output that never mentions readiness keeps reading exactly what it reads today.
 */
export async function loadTaskListItems(
	core: Core,
	tasks: readonly Task[],
	options: { includeCrossBranch: boolean } = { includeCrossBranch: false },
): Promise<TaskListItem[]> {
	return withReadiness(tasks, await loadTaskCorpus(core, options));
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
