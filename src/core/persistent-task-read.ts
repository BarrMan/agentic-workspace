import { DEFAULT_INIT_CONFIG, DEFAULT_STATUSES } from "../constants/index.ts";
import type { FileSystem } from "../file-system/operations.ts";
import type { GitOperations } from "../git/operations.ts";
import { TASK_SOURCE, type Task } from "../types/index.ts";
import { AmbiguousTaskIdError } from "../utils/task-path.ts";
import { createTaskSearchIndex } from "../utils/task-search.ts";
import { TaskCollectionParentNotFoundError } from "./domain-errors.ts";
import {
	completedTaskIdentityRecord,
	TaskIdentityIndex,
	workingCopyTaskIdentityRecord,
} from "./task-identity-index.ts";
import { addSearchableArtifactText, BranchTaskLoader, type TaskCorpusSnapshot } from "./task-loader.ts";
import { filterTaskQueryResults, type TaskQueryOptions } from "./task-query-workflow.ts";

/** A single persistent read. No subscriptions, session generations, retained indexes, or retries. */
export class PersistentTaskRead {
	constructor(
		private readonly filesystem: FileSystem,
		private readonly git: GitOperations,
	) {}

	async load(includeCrossBranch = true): Promise<TaskCorpusSnapshot & { identityIndex: TaskIdentityIndex }> {
		const config = await this.filesystem.loadConfig();
		this.git.setConfig(config);
		const branches = includeCrossBranch && config?.checkActiveBranches !== false && config?.filesystemOnly !== true;
		const tips = branches
			? await this.git.listRecentBranchTips(config?.activeBranchDays ?? DEFAULT_INIT_CONFIG.activeBranchDays)
			: [];
		const [activeTasks, completedTasks] = await Promise.all([
			this.filesystem.listTasks(),
			this.filesystem.listCompletedTasks(),
		]);
		const localTasks = activeTasks.map((task) => ({ ...task, source: TASK_SOURCE.LOCAL }));
		const branchStateEntries = branches
			? (
					await new BranchTaskLoader(this.git).load(
						tips,
						config,
						localTasks,
						true,
						this.filesystem.backlogDirName,
						undefined,
						tips.find((tip) => tip.current && !tip.name.startsWith("origin/"))?.name ??
							(await this.git.getCurrentBranch()),
					)
				).entries
			: [];
		const identityIndex = new TaskIdentityIndex(
			[
				...localTasks.map((task) => workingCopyTaskIdentityRecord(task, "task", task.filePath ?? task.id)),
				...completedTasks.map((task) => completedTaskIdentityRecord(task, task.filePath ?? task.id)),
				...branchStateEntries,
			],
			{
				repositoryRoot: branches ? await this.git.getRepositoryRoot() : null,
				projectRoot: this.filesystem.rootDir,
				backlogDirectory: this.filesystem.backlogDirName,
			},
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
		return await this.filesystem.loadTask(taskId, { includeArchived: options.includeArchived });
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
		const tasks = await addSearchableArtifactText(sourceTasks, this.filesystem.taskArtifacts);
		const matches = options.query?.trim()
			? createTaskSearchIndex(tasks).search({ query: options.query.trim() })
			: tasks;
		return filterTaskQueryResults(matches, { ...options, filters }, this.filesystem);
	}
}
