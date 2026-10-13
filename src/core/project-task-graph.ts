import { TASK_SOURCE, type Task } from "../types/index.ts";
import {
	buildDependencyGraph,
	createDependencyGraphContext,
	type DependencyGraphContext,
} from "../utils/dependency-graph.ts";
import { createReadinessGraph, getTaskReadiness, type ReadinessGraph } from "../utils/readiness.ts";
import { AmbiguousTaskIdError } from "../utils/task-path.ts";
import { createTaskRecordIndex } from "../utils/task-record-index.ts";
import { TaskCollectionParentNotFoundError } from "./domain-errors.ts";
import type { TaskDetail, TaskListItem } from "./task-detail.ts";
import type { TaskCorpusSnapshot } from "./task-loader.ts";

/**
 * The browser's selected-project task state. It prepares identity, relationship, and readiness
 * indexes once from a startup snapshot; collection reads only select from these prepared records.
 */
export class ProjectTaskGraph {
	private preparedByTask = new Map<Task, Map<ReadinessGraph, TaskListItem>>();
	private dependencyContext: DependencyGraphContext;
	private readinessGraph: ReadinessGraph;
	private activeReadinessGraph: ReadinessGraph;

	tasks: TaskListItem[];
	activeTasks: TaskListItem[];
	private readonly identityIndex: TaskCorpusSnapshot["identityIndex"];

	constructor(snapshot: TaskCorpusSnapshot) {
		this.identityIndex = snapshot.identityIndex;
		const completedTasks = snapshot.identityIndex
			? snapshot.identityIndex.getTasks(true).filter((task) => task.source === TASK_SOURCE.COMPLETED)
			: snapshot.completedTasks;
		const index = createTaskRecordIndex({
			tasks: snapshot.tasks,
			completedTasks,
			statuses: snapshot.config?.statuses,
			ambiguousIds: snapshot.identityIndex?.getContestedIds(),
		});
		this.dependencyContext = createDependencyGraphContext({
			tasks: snapshot.tasks,
			completedTasks,
			statuses: snapshot.config?.statuses,
			ambiguousIds: snapshot.identityIndex?.getContestedIds(),
			index,
		});
		this.readinessGraph = createReadinessGraph({
			tasks: snapshot.tasks,
			completedTasks,
			statuses: snapshot.config?.statuses,
			ambiguousIds: snapshot.identityIndex?.getContestedIds(),
			index,
		});
		this.activeReadinessGraph = createReadinessGraph({
			tasks: snapshot.activeTasks,
			completedTasks: snapshot.completedTasks,
			statuses: snapshot.config?.statuses,
			ambiguousIds: snapshot.identityIndex?.getContestedIds(),
		});
		this.tasks = snapshot.tasks.map((task) => this.prepare(task, this.readinessGraph));
		this.activeTasks = snapshot.activeTasks.map((task) => this.prepare(task, this.activeReadinessGraph));
	}

	getTaskDetail(task: Task): TaskDetail {
		return {
			...task,
			dependencyGraph: buildDependencyGraph(task, this.dependencyContext),
			readiness: getTaskReadiness(task, this.readinessGraph),
		};
	}

	getTaskListItem(task: Task): TaskListItem {
		return this.prepare(task, this.readinessGraph);
	}

	resolveParentTask(taskId: string): Task {
		const resolution = this.identityIndex?.resolveForRead(taskId);
		if (resolution?.status === "ambiguous") throw new AmbiguousTaskIdError(taskId, resolution.candidates);
		if (resolution?.status === "found") return resolution.task;
		throw new TaskCollectionParentNotFoundError(taskId);
	}

	private prepare(task: Task, readinessGraph: ReadinessGraph): TaskListItem {
		const preparedForGraph = this.preparedByTask.get(task);
		const existing = preparedForGraph?.get(readinessGraph);
		if (existing) return existing;
		const prepared = { ...task, isReady: getTaskReadiness(task, readinessGraph).isReady };
		if (preparedForGraph) preparedForGraph.set(readinessGraph, prepared);
		else this.preparedByTask.set(task, new Map([[readinessGraph, prepared]]));
		return prepared;
	}
}
