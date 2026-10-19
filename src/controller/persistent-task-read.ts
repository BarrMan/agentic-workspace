import type { GitOperations } from "../filesystem/git/operations.ts";
import { DEFAULT_INIT_CONFIG, DEFAULT_STATUSES } from "../model/constants.ts";
import { TaskCollectionParentNotFoundError } from "../model/errors/task-collection.ts";
import { AmbiguousTaskIdError } from "../model/errors/task-id.ts";
import { TaskIdentityIndex } from "../model/task/task-identity-index.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import { TASK_SOURCE, type Task } from "../model/types.ts";
import type { Storage } from "../storage/storage.ts";
import { BranchTaskLoader, type TaskCorpusSnapshot } from "./task-loader.ts";
import { filterTaskQueryResults, type TaskQueryOptions } from "./task-query-workflow.ts";

/** A single persistent read. No subscriptions, session generations, retained indexes, or retries. */
export class PersistentTaskRead {
	constructor(
		private readonly storage: Storage,
		private readonly git: GitOperations,
	) {}

	async load(includeCrossBranch = true): Promise<TaskCorpusSnapshot & { identityIndex: TaskIdentityIndex }> {
		const config = await this.storage.loadConfig();
		this.git.setConfig(config);
		const branches = includeCrossBranch && config?.checkActiveBranches !== false && config?.filesystemOnly !== true;
		const tips = branches
			? await this.git.listRecentBranchTips(config?.activeBranchDays ?? DEFAULT_INIT_CONFIG.activeBranchDays)
			: [];
		const [activeTasks, completedTasks] = await Promise.all([
			this.storage.loadTasks(),
			this.storage.loadCompletedTasks(),
		]);
		const localTasks = activeTasks.map((task) => ({ ...task, source: TASK_SOURCE.LOCAL }));
		const branchStateEntries = branches
			? (
					await new BranchTaskLoader(this.git).load(
						tips,
						config,
						localTasks,
						true,
						this.storage.workspaceDirectoryName,
						undefined,
						tips.find((tip) => tip.current && !tip.name.startsWith("origin/"))?.name ??
							(await this.git.getCurrentBranch()),
					)
				).entries
			: [];
		const identityIndex = new TaskIdentityIndex(
			[
				...localTasks.map((task) => this.storage.localTaskIdentityRecord(task)),
				...completedTasks.map((task) => this.storage.localCompletedTaskIdentityRecord(task)),
				...branchStateEntries,
			],
			this.storage.taskIdentityContext(branches ? await this.git.getRepositoryRoot() : null),
			config?.statuses ?? [...DEFAULT_STATUSES],
			config?.taskResolutionStrategy ?? "most_progressed",
		);
		return {
			tasks: identityIndex.getTasks(false),
			activeTasks: localTasks,
			completedTasks,
			branchStateEntries,
			identityIndex,
			config,
		};
	}

	async get(
		taskId: string,
		options: { forMutation?: boolean; includeCrossBranch?: boolean; includeArchived?: boolean } = {},
	): Promise<Task | null> {
		const corpus = await this.load(options.includeCrossBranch !== false);
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
		const corpus = snapshot ?? (await this.load(options.includeCrossBranch !== false || !!options.parent));
		let filters = options.filters;
		if (options.parent) {
			const parent = corpus.identityIndex.resolveForRead(options.parent);
			if (parent.status === "ambiguous") throw new AmbiguousTaskIdError(options.parent, parent.candidates);
			if (parent.status !== "found") throw new TaskCollectionParentNotFoundError(options.parent);
			filters = { ...filters, parentTaskId: parent.task.id };
		}
		const sourceTasks = options.includeCrossBranch === false ? corpus.activeTasks : corpus.tasks;
		const query = options.query?.trim();
		const tasks = query ? await this.storage.addSearchableArtifactText(sourceTasks) : sourceTasks;
		const matches = query ? new TaskSearchIndex(tasks).search({ query }) : tasks;
		return filterTaskQueryResults(matches, { ...options, filters }, this.storage);
	}
}
