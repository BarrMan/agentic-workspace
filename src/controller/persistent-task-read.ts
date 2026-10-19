import type { GitOperations } from "../filesystem/git/operations.ts";
import { TaskCollectionParentNotFoundError } from "../model/errors/task-collection.ts";
import { AmbiguousTaskIdError } from "../model/errors/task-id.ts";
import { TaskIdentityIndex } from "../model/task/task-identity-index.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import { TASK_SOURCE, type Task } from "../model/types.ts";
import type { Storage } from "../storage/storage.ts";
import type { TaskCorpusSnapshot } from "./task-loader.ts";
import { filterTaskQueryResults, type TaskQueryOptions } from "./task-query-workflow.ts";

/** A single persistent read. No subscriptions, session generations, retained indexes, or retries. */
export class PersistentTaskRead {
	constructor(
		private readonly storage: Storage,
		private readonly git: GitOperations,
	) {}

	async load(): Promise<TaskCorpusSnapshot & { identityIndex: TaskIdentityIndex }> {
		const config = await this.storage.loadConfig();
		this.git.setConfig(config);
		const [activeTasks, completedTasks] = await Promise.all([
			this.storage.loadTasks(),
			this.storage.loadCompletedTasks(),
		]);
		const localTasks = activeTasks.map((task) => ({ ...task, source: TASK_SOURCE.LOCAL }));
		const identityIndex = new TaskIdentityIndex(
			[
				...localTasks.map((task) => this.storage.localTaskIdentityRecord(task)),
				...completedTasks.map((task) => this.storage.localCompletedTaskIdentityRecord(task)),
			],
			this.storage.taskIdentityContext(await this.git.getRepositoryRoot()),
		);
		return {
			tasks: identityIndex.getTasks(false),
			activeTasks: localTasks,
			completedTasks,
			identityIndex,
			config,
		};
	}

	async get(taskId: string, options: { forMutation?: boolean; includeArchived?: boolean } = {}): Promise<Task | null> {
		const corpus = await this.load();
		const result = options.forMutation
			? corpus.identityIndex.resolveForMutation(taskId)
			: corpus.identityIndex.resolveForRead(taskId);
		if (result.status === "ambiguous") throw new AmbiguousTaskIdError(taskId, result.candidates);
		if (result.status === "found") return result.task;
		if (options.forMutation) return null;
		return await this.storage.loadTask(taskId, { includeArchived: options.includeArchived });
	}

	async query(
		options: TaskQueryOptions,
		snapshot?: TaskCorpusSnapshot & { identityIndex: TaskIdentityIndex },
	): Promise<Task[]> {
		const corpus = snapshot ?? (await this.load());
		let filters = options.filters;
		if (options.parent) {
			const parent = corpus.identityIndex.resolveForRead(options.parent);
			if (parent.status === "ambiguous") throw new AmbiguousTaskIdError(options.parent, parent.candidates);
			if (parent.status !== "found") throw new TaskCollectionParentNotFoundError(options.parent);
			filters = { ...filters, parentTaskId: parent.task.id };
		}
		const sourceTasks = corpus.tasks;
		const query = options.query?.trim();
		const tasks = query ? await this.storage.addSearchableArtifactText(sourceTasks) : sourceTasks;
		const matches = query ? new TaskSearchIndex(tasks).search({ query }) : tasks;
		return filterTaskQueryResults(matches, { ...options, filters }, this.storage);
	}
}
