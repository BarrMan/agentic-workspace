import { stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { resolveAgentConfiguration } from "../agent-workspace/config.ts";
import { BunRunner } from "../agent-workspace/session-process.ts";
import { SessionStore } from "../agent-workspace/session-store.ts";
import { AgentSessionService } from "../agent-workspace/sessions.ts";
import { resolveSessionSettings } from "../agent-workspace/types.ts";
import { openViewStateStore } from "../agent-workspace/view-state-store.ts";
import { DEFAULT_DIRECTORIES, DEFAULT_STATUSES, FALLBACK_STATUS } from "../constants/index.ts";
import { type DraftFileReference, FileSystem, isConfigValueError } from "../file-system/operations.ts";
import { GitOperations } from "../git/operations.ts";
import { ensureTaskWorktree } from "../git/task-worktree.ts";
import {
	type Decision,
	type Document,
	type DocumentCreateInput,
	type DocumentUpdateInput,
	EntityType,
	type Milestone,
	type SearchOptions,
	type SearchResult,
	TASK_DIRECTORY,
	type Task,
	type TaskCreateInput,
	type TaskListFilter,
	type TaskUpdateInput,
} from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { decisionIdKey } from "../utils/decision-id.ts";
import { documentIdKey } from "../utils/document-id.ts";
import { getDocumentSubPathFromRelativePath } from "../utils/document-path.ts";
import {
	type ContentIdentityReport,
	type DraftIdentityFindings,
	detectContentIdentityIssues,
} from "../utils/duplicate-detection.ts";
import { findBacklogRoot } from "../utils/find-backlog-root.ts";
import { buildIdRegex, normalizeId } from "../utils/prefix-config.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../utils/priority-config.ts";
import { resolveRuntimeCwd } from "../utils/runtime-cwd.ts";
import { formatValidStatuses, getCanonicalStatuses } from "../utils/status.ts";
import { AmbiguousTaskIdError, canonicalTaskId, LOCAL_TASK_LOOKUP_HINT, normalizeTaskId } from "../utils/task-path.ts";
import { applyTaskFilters } from "../utils/task-search.ts";
import { sortByOrdinal } from "../utils/task-sorting.ts";
import { attachSubtaskSummaries } from "../utils/task-subtasks.ts";
import { TaskCollectionFilterError } from "./domain-errors.ts";
import { planOrderedTaskPlacement } from "./ordered-task-move-planner.ts";
import { PersistentTaskRead } from "./persistent-task-read.ts";
import { ProjectContentService } from "./project-content-service.ts";
import { DEFAULT_ORDINAL_STEP, resolveOrdinalConflicts } from "./reorder.ts";
import { searchSnapshot } from "./search-service.ts";
import {
	type CreatedTaskRollbackResult,
	type CreatedTaskWrite,
	rollbackCreatedTask,
} from "./task-creation-transaction.ts";
import { TaskCreationService } from "./task-creation-workflow.ts";
import {
	completedTaskIdentityRecord,
	TaskIdentityIndex,
	type TaskIdentityRecord,
	workingCopyTaskIdentityRecord,
} from "./task-identity-index.ts";
import { TaskLifecycleService } from "./task-lifecycle-service.ts";
import { addSearchableArtifactText, type BranchTaskStateEntry, type TaskCorpusSnapshot } from "./task-loader.ts";
import { ProjectTaskMutations } from "./task-mutation-service.ts";
import type { TaskQueryOptions, TaskReadOptions } from "./task-query-workflow.ts";
import { planTaskReorder } from "./task-reorder-plan.ts";
import { VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";

interface MoveTasksPlan {
	readonly movedTasks: Task[];
	readonly changedTasks: Task[];
	readonly failures: Array<{ taskId: string; reason: string }>;
}

interface MoveTaskPlacement {
	readonly movedTasks: Task[];
	readonly changedTasks: Task[];
}

export { TaskCollectionParentNotFoundError } from "./domain-errors.ts";
export type { TaskReadOptions } from "./task-query-workflow.ts";

export type TaskCollectionFilterInput = {
	status?: string;
	excludeStatus?: string[];
	assignee?: string;
	priority?: string;
	labels?: string[];
};

type TaskCollection = {
	getTasks(filter?: TaskListFilter): Task[];
	resolveTaskForMutation(taskId: string): ReturnType<TaskIdentityIndex["resolveForMutation"]>;
};

/**
 * Outcome of an operation that vacates a task ID. `cleanedTaskIds` names the records that lost a
 * stored reference to it, so every surface can report the change instead of making it silently.
 */
export interface VacatedTaskResult {
	success: boolean;
	cleanedTaskIds: string[];
}

interface TaskEditResult {
	task: Task;
	cleanedTaskIds: string[];
}

/** Dependencies are validated against the working copy on both the create and the edit path. */
function formatMissingDependenciesError(invalid: string[]): Error {
	return new Error(
		`The following dependencies do not exist: ${invalid.join(", ")}. Please create these tasks first or verify the IDs. ${LOCAL_TASK_LOOKUP_HINT}`,
	);
}

/**
 * A board move rewrites the task file, so a task that belongs to another branch can only be moved
 * from that branch. Returns the reason to report, or null when the task is local and writable.
 */
function crossBranchMoveReason(task: Task, verb: "reordered" | "moved"): string | null {
	if (!task.branch) return null;
	return `Task ${task.id} exists in branch "${task.branch}" and cannot be ${verb} from the current branch. Switch to that branch to modify it.`;
}

/**
 * Normalize the milestone a board move targets. A named lane stores its trimmed name, while the
 * board's no-milestone lane arrives as null or a blank string and clears the field.
 */
function normalizeTargetMilestone(targetMilestone: string | null | undefined): string | undefined {
	if (typeof targetMilestone !== "string") return undefined;
	const trimmed = targetMilestone.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export { TaskArchiveStatusError } from "./task-lifecycle-service.ts";

export class Core {
	readonly filesystem: FileSystem;
	readonly git: GitOperations;
	private agentSessions?: AgentSessionService;
	get sessions(): AgentSessionService {
		if (!this.agentSessions) this.agentSessions = new AgentSessionService(this);
		return this.agentSessions;
	}
	private readonly projectContent = new ProjectContentService(this);
	private readonly vacatedTaskReferences: VacatedTaskReferenceService;
	private readonly taskMutations: ProjectTaskMutations;
	private readonly taskLifecycle: TaskLifecycleService;
	private readonly persistentReads: PersistentTaskRead;

	private get fs(): FileSystem {
		return this.filesystem;
	}

	constructor(projectRoot: string) {
		this.filesystem = new FileSystem(projectRoot);
		this.filesystem.freezeResolution();
		this.git = new GitOperations(projectRoot, null, () => this.filesystem.loadConfig());
		this.persistentReads = new PersistentTaskRead(this.filesystem, this.git);
		this.vacatedTaskReferences = new VacatedTaskReferenceService(this.filesystem);
		this.taskMutations = new ProjectTaskMutations(
			this.filesystem,
			(id) => this.persistentReads.get(id, { forMutation: true }),
			() => this.getActiveAndCompletedTaskIds(),
		);
		this.taskLifecycle = this.createTaskLifecycleService();
	}

	private createTaskLifecycleService(): TaskLifecycleService {
		return new TaskLifecycleService(
			this.fs,
			this.taskMutations,
			this.vacatedTaskReferences,
			async (taskId, ownedStops) => await this.sessions.cleanupTaskWorktreeSessions(taskId, ownedStops),
			async (oldTaskId, newTaskId) => {
				const sessions = new SessionStore(this.filesystem.rootDir, new BunRunner());
				await sessions.remapTaskIdentity(oldTaskId, newTaskId);

				const view = await openViewStateStore(this.filesystem.rootDir, () => ({}), {
					stateRoot: await sessions.stateRoot,
				});
				try {
					await view.update((state) => {
						const current = state as typeof state & { selectedModeByTask?: Record<string, unknown> };
						const selected = current.selectedModeByTask;
						if (!selected || !(oldTaskId in selected)) return state;
						if (newTaskId in selected) {
							throw new Error(
								`Cannot remap selected mode from ${oldTaskId} to ${newTaskId}; a selection already exists for ${newTaskId}.`,
							);
						}
						const selectedModeByTask = { ...selected, [newTaskId]: selected[oldTaskId] };
						delete selectedModeByTask[oldTaskId];
						return { ...state, selectedModeByTask };
					});
				} finally {
					view.close();
				}
			},
			async (taskId) => await this.sessions.forgetTaskSessions(taskId),
		);
	}

	private async buildTaskIdentityIndex(
		localTasks: Array<Task & { lastModified?: Date }>,
		completedTasks: Task[],
		branchRecords: BranchTaskStateEntry[],
		statuses: string[],
		resolutionStrategy: "most_recent" | "most_progressed",
		repositoryRoot?: string | null,
		filesystem = this.fs,
		git = this.git,
	): Promise<TaskIdentityIndex> {
		const records: TaskIdentityRecord[] = [];
		for (const task of localTasks) {
			records.push(workingCopyTaskIdentityRecord(task, "task", task.filePath ?? join(filesystem.tasksDir, task.id)));
		}
		for (const task of completedTasks) {
			records.push(completedTaskIdentityRecord(task, task.filePath ?? join(filesystem.completedDir, task.id)));
		}
		records.push(...branchRecords);

		return new TaskIdentityIndex(
			records,
			{
				repositoryRoot: repositoryRoot === undefined ? await git.getRepositoryRoot() : repositoryRoot,
				projectRoot: filesystem.rootDir,
				backlogDirectory: filesystem.backlogDirName,
			},
			statuses,
			resolutionStrategy,
		);
	}

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.taskMutations.withCreateLock(fn);
	}

	/** Reports draft files whose numeric identities collide, whose frontmatter drifted from their filename, or that are unreadable. */
	async diagnoseDraftIdentity(): Promise<DraftIdentityFindings> {
		return this.fs.diagnoseDraftIdentity();
	}

	/** Reports document and decision files whose IDs collide or are missing, so lookups can fail closed. */
	async diagnoseContentIdentity(): Promise<ContentIdentityReport> {
		const unreadableDocuments: string[] = [];
		const unreadableDecisions: string[] = [];
		const [documents, decisions] = await Promise.all([
			this.fs.listDocuments(unreadableDocuments),
			this.fs.listDecisions(unreadableDecisions),
		]);
		// An empty collected path denotes the content directory itself, which the filesystem reports
		// when it could not be scanned at all.
		const locate = (directory: string, path: string) =>
			path ? `${this.fs.backlogDirName}/${directory}/${path}` : `${this.fs.backlogDirName}/${directory}`;
		const describe = (directory: string, item: { path?: string; title: string }) =>
			item.path ? locate(directory, item.path) : item.title;
		return {
			documents: detectContentIdentityIssues(
				documents.map((document) => ({ id: document.id, path: describe(DEFAULT_DIRECTORIES.DOCS, document) })),
				documentIdKey,
				unreadableDocuments.map((path) => locate(DEFAULT_DIRECTORIES.DOCS, path)),
			),
			decisions: detectContentIdentityIssues(
				decisions.map((decision) => ({ id: decision.id, path: describe(DEFAULT_DIRECTORIES.DECISIONS, decision) })),
				decisionIdKey,
				unreadableDecisions.map((path) => locate(DEFAULT_DIRECTORIES.DECISIONS, path)),
			),
		};
	}

	async resolveCreateOrdinal(inputOrdinal: number | undefined, isDraft: boolean): Promise<number | undefined> {
		if (typeof inputOrdinal === "number") {
			return inputOrdinal;
		}
		if (isDraft) {
			return undefined;
		}

		const tasks = await this.fs.listTasks();
		const ordinals = tasks
			.map((task) => task.ordinal)
			.filter((ordinal): ordinal is number => typeof ordinal === "number" && Number.isFinite(ordinal));

		if (ordinals.length === 0) {
			return tasks.length === 0 ? DEFAULT_ORDINAL_STEP : undefined;
		}

		return Math.max(...ordinals) + DEFAULT_ORDINAL_STEP;
	}

	async requireCanonicalStatus(status: string): Promise<string> {
		return await this.taskMutations.requireCanonicalStatus(status);
	}

	async normalizePriority(value: string | undefined): Promise<string | undefined> {
		return await this.taskMutations.normalizePriority(value);
	}

	async normalizeTaskType(value: string | undefined): Promise<string | undefined> {
		return await this.taskMutations.normalizeTaskType(value);
	}

	async normalizeProject(value: string | undefined): Promise<string | undefined> {
		return await this.taskMutations.normalizeProject(value);
	}

	formatMissingDependenciesError(invalid: string[]): Error {
		return formatMissingDependenciesError(invalid);
	}

	async queryTasks(options: TaskQueryOptions = {}): Promise<Task[]> {
		const tasks = await this.persistentReads.query(options);
		return await addSearchableArtifactText(tasks, this.filesystem.taskArtifacts);
	}

	/** Shared validation for collection surfaces before applying a prepared task graph. */
	async resolveCollectionFilters(input: TaskCollectionFilterInput): Promise<TaskListFilter> {
		const config = await this.filesystem.loadConfig();
		const priority = input.priority ? resolvePriorityValue(input.priority, config) : undefined;
		if (input.priority && !priority)
			throw new TaskCollectionFilterError(
				`Invalid priority filter. Valid values are: ${formatValidPriorityValues(config)}`,
			);
		const statuses = await getCanonicalStatuses(input.excludeStatus ?? [], this);
		if (statuses.invalid.length)
			throw new TaskCollectionFilterError(
				`Invalid excludeStatus filter: ${statuses.invalid.join(", ")}. Valid statuses are: ${formatValidStatuses(statuses.validStatuses)}`,
			);
		return {
			status: input.status || undefined,
			excludeStatus: statuses.values.length ? statuses.values : undefined,
			assignee: input.assignee || undefined,
			priority,
			labels: input.labels?.length ? input.labels : undefined,
		};
	}

	async searchPersistently(options: SearchOptions): Promise<SearchResult[]> {
		const [snapshot, documents, decisions] = await Promise.all([
			!options.types || options.types.includes("task") ? this.loadTaskSnapshot() : null,
			!options.types || options.types.includes("document") ? this.filesystem.listDocuments() : [],
			!options.types || options.types.includes("decision") ? this.filesystem.listDecisions() : [],
		]);
		const tasks = snapshot?.tasks ?? [];
		const searchableTasks = tasks.length
			? await addSearchableArtifactText(tasks, this.filesystem.taskArtifacts)
			: tasks;
		return searchSnapshot(searchableTasks, documents, decisions, options);
	}

	/** Loads one request-local Markdown/Git snapshot without retaining it on Core. */
	async loadTaskSnapshot(
		includeCrossBranch = true,
	): Promise<TaskCorpusSnapshot & { identityIndex: TaskIdentityIndex }> {
		return await this.persistentReads.load(includeCrossBranch);
	}

	async getTask(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return await this.persistentReads.get(taskId, {
			includeCrossBranch: options.includeCrossBranch,
			includeArchived: options.includeArchived,
		});
	}

	async getTaskWithSubtasks(taskId: string, localTasks?: Task[], options: TaskReadOptions = {}): Promise<Task | null> {
		const task =
			options.includeCrossBranch === false
				? await this.loadWorkingCopyTask(taskId, false, localTasks)
				: await this.getTask(taskId, options);
		return task ? attachSubtaskSummaries(task, localTasks ?? (await this.fs.listTasks())) : null;
	}

	async loadTaskById(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return await this.getTask(taskId, options);
	}

	async buildWorkingCopyTaskIndex(activeTasks?: Task[]): Promise<TaskIdentityIndex> {
		if (!activeTasks) return (await this.loadTaskSnapshot(false)).identityIndex;
		const [completedTasks, config] = await Promise.all([this.fs.listCompletedTasks(), this.fs.loadConfig()]);
		return await this.buildTaskIdentityIndex(
			activeTasks,
			completedTasks,
			[],
			config?.statuses ?? [...DEFAULT_STATUSES],
			config?.taskResolutionStrategy ?? "most_progressed",
			null,
		);
	}

	async loadWorkingCopyTasks(includeCompleted = false): Promise<Task[]> {
		return (await this.buildWorkingCopyTaskIndex()).getTasks(includeCompleted);
	}

	async loadWorkingCopyTask(taskId: string, forMutation: boolean, activeTasks?: Task[]): Promise<Task | null> {
		return await this.taskMutations.loadWorkingCopyTask(taskId, forMutation, activeTasks);
	}

	async loadTaskForMutation(taskId: string, options: TaskReadOptions = {}): Promise<Task | null> {
		return await this.taskMutations.loadTaskForMutation(taskId, options);
	}

	async getTaskContent(taskId: string): Promise<string | null> {
		const task = await this.fs.loadTask(taskId);
		const filePath = task?.filePath ?? null;
		if (!filePath) return null;
		return await Bun.file(filePath).text();
	}

	async getDocument(documentId: string): Promise<Document | null> {
		return await this.projectContent.getDocument(documentId);
	}

	async getDocumentContent(documentId: string): Promise<string | null> {
		return await this.projectContent.getDocumentContent(documentId);
	}

	async ensureConfigLoaded(): Promise<void> {
		try {
			const config = await this.fs.loadConfig();
			this.git.setConfig(config);
		} catch (error) {
			// A config value Backlog refuses to read is the user's to fix and must reach the command;
			// only the recoverable git-configuration failures this guard exists for are suppressed.
			if (isConfigValueError(error)) {
				throw error;
			}
			// Config loading failed, git operations will work with null config
			if (process.env.DEBUG) {
				console.warn("Failed to load config for git operations:", error);
			}
		}
	}

	private async getBacklogDirectoryName(): Promise<string> {
		return this.fs.backlogDirName;
	}

	async getGitOps() {
		await this.ensureConfigLoaded();
		return this.git;
	}

	// ID generation
	/**
	 * Generates the next ID for a given entity type.
	 *
	 * @param type - The entity type (Task, Draft, Document, Decision). Defaults to Task.
	 * @param parent - Optional parent ID for subtask generation (only applicable for tasks).
	 * @returns The next available ID (e.g., "task-42", "draft-5", "doc-3")
	 *
	 * Folder scanning by type:
	 * - Task: /tasks, /completed, cross-branch (if enabled), remote (if enabled)
	 * - Draft: /drafts only
	 * - Document: /documents only
	 * - Decision: /decisions only
	 */
	async generateNextId(type: EntityType = EntityType.Task, parent?: string): Promise<string> {
		return await this.taskMutations.generateNextId(type, parent);
	}

	/**
	 * Gets all task IDs that are in use (active or completed) across all branches.
	 * Respects cross-branch config settings. Archived IDs are excluded (can be reused).
	 *
	 * This is used for ID generation to determine the next available ID.
	 */
	private async loadWorktreeTaskStateEntries(taskPrefix: string): Promise<BranchTaskStateEntry[]> {
		const [repoRoot, worktreeRoots] = await Promise.all([this.git.getRepositoryRoot(), this.git.listWorktreePaths()]);
		if (!repoRoot || worktreeRoots.length === 0) {
			return [];
		}

		const projectRelativePath = relative(repoRoot, this.fs.rootDir);
		if (projectRelativePath.startsWith("..") || isAbsolute(projectRelativePath)) {
			return [];
		}

		const backlogDir = await this.getBacklogDirectoryName();
		const entries: BranchTaskStateEntry[] = [];
		for (const worktreeRoot of worktreeRoots) {
			const projectRoot = projectRelativePath ? join(worktreeRoot, projectRelativePath) : worktreeRoot;
			entries.push(...(await this.loadTaskStateEntriesFromWorktree(projectRoot, backlogDir, taskPrefix, worktreeRoot)));
		}

		return entries;
	}

	private async loadTaskStateEntriesFromWorktree(
		projectRoot: string,
		backlogDir: string,
		taskPrefix: string,
		worktreeRoot: string,
	): Promise<BranchTaskStateEntry[]> {
		const idRegex = buildIdRegex(taskPrefix);
		const globPattern = "**/*";
		const directories: Array<{ path: string; type: typeof TASK_DIRECTORY.TASK | typeof TASK_DIRECTORY.COMPLETED }> = [
			{ path: join(projectRoot, backlogDir, DEFAULT_DIRECTORIES.TASKS), type: TASK_DIRECTORY.TASK },
			{ path: join(projectRoot, backlogDir, DEFAULT_DIRECTORIES.COMPLETED), type: TASK_DIRECTORY.COMPLETED },
		];
		const entries: BranchTaskStateEntry[] = [];

		for (const { path, type } of directories) {
			let files: string[];
			try {
				files = await Array.fromAsync(new Bun.Glob(globPattern).scan({ cwd: path, followSymlinks: true }));
			} catch {
				continue;
			}

			for (const file of files) {
				const parts = file.replaceAll("\\", "/").split("/");
				const recordName =
					parts.length === 1 ? parts[0] : parts.length === 2 && parts[1] === "task.md" ? `${parts[0]}.md` : null;
				if (!recordName) continue;
				const match = recordName.match(idRegex);
				if (!match?.[1]) continue;

				const filePath = join(path, file);
				const stats = await stat(filePath).catch(() => null);
				entries.push({
					id: normalizeId(match[1], taskPrefix),
					type,
					branch: `worktree:${worktreeRoot}`,
					path: filePath,
					lastModified: stats?.mtime ?? new Date(0),
				});
			}
		}

		return entries;
	}

	private async getActiveAndCompletedTaskIds(): Promise<string[]> {
		const snapshot = await this.loadTaskSnapshot();
		const completedTasks = snapshot.completedTasks;
		const config = snapshot.config;
		const taskPrefix = config?.prefixes?.task ?? "task";
		if (!snapshot.identityIndex) throw new Error("Task corpus identity index was not initialized");

		// Same-repository worktrees share the task ID namespace even before their
		// task files are committed, so include their filesystem state for allocation.
		const [worktreeEntries, archivedTasks, drafts, occupiedDraftFileIds] = await Promise.all([
			this.loadWorktreeTaskStateEntries(taskPrefix),
			this.fs.listArchivedTasks(),
			this.fs.listDrafts(),
			this.fs.listOccupiedDraftFileIds(),
		]);
		const occupiedIds = new Set(snapshot.identityIndex.getOccupiedIds());
		for (const task of completedTasks) occupiedIds.add(task.id);
		for (const task of archivedTasks) occupiedIds.add(task.id);
		for (const draft of drafts) occupiedIds.add(draft.id);
		for (const id of occupiedDraftFileIds) occupiedIds.add(id);
		for (const entry of worktreeEntries) {
			if (entry.type === TASK_DIRECTORY.TASK || entry.type === TASK_DIRECTORY.COMPLETED) occupiedIds.add(entry.id);
		}
		return [...new Map([...occupiedIds].map((id) => [canonicalTaskId(id, taskPrefix), id])).values()];
	}

	/**
	 * Gets all existing IDs for a given entity type.
	 * Used internally by generateNextId to determine the next available ID.
	 *
	 * Task allocation reserves identities across active, completed, archived, draft, and worktree records.
	 */
	async getExistingIdsForType(type: EntityType): Promise<string[]> {
		switch (type) {
			case EntityType.Task: {
				// Reserve the complete task identity inventory across stores and branches.
				return this.getActiveAndCompletedTaskIds();
			}
			case EntityType.Draft: {
				// Occupancy includes filename-derived ids: an unparsable file still reserves its
				// numeric id, so allocation can never reuse what it cannot parse.
				const [drafts, occupiedFileIds] = await Promise.all([this.fs.listDrafts(), this.fs.listOccupiedDraftFileIds()]);
				return [...drafts.map((d) => d.id), ...occupiedFileIds];
			}
			case EntityType.Document: {
				const documents = await this.fs.listDocuments();
				return documents.map((d) => d.id);
			}
			case EntityType.Decision: {
				const decisions = await this.fs.listDecisions();
				return decisions.map((d) => d.id);
			}
			default:
				return [];
		}
	}

	async writePreparedTask(task: Task, isDraft: boolean): Promise<string> {
		if (isDraft) {
			task.status = "Draft";
			return await this.fs.saveDraft(task);
		}

		return await this.fs.saveTask(task);
	}

	async finalizeCreatedTask(task: Task, isDraft: boolean): Promise<Task | null> {
		const savedTask = isDraft ? await this.fs.loadDraft(task.id) : await this.fs.loadTask(task.id);

		return savedTask;
	}

	async rollbackCreatedTask(write: CreatedTaskWrite): Promise<CreatedTaskRollbackResult> {
		return await rollbackCreatedTask(write);
	}

	async createTaskFromInput(input: TaskCreateInput): Promise<{ task: Task; filePath?: string }> {
		return await new TaskCreationService(this).create(input);
	}

	/**
	 * Resolve `--parent` against the working copy, the same corpus the parent filter and task reads
	 * use, so one ID cannot be an acceptable parent for a child that no task command can then show.
	 */
	async resolveParentTaskIdForCreate(parentTaskId: string): Promise<string> {
		const parentTask = await this.loadTaskById(parentTaskId, { includeCrossBranch: false });
		if (!parentTask) {
			const config = await this.fs.loadConfig();
			const canonicalParent = canonicalTaskId(parentTaskId, config?.prefixes?.task ?? "task");
			throw new Error(
				`Parent task ${canonicalParent} not found. ${LOCAL_TASK_LOOKUP_HINT} Use an existing task ID with --parent; use --milestone to assign a task to a milestone.`,
			);
		}
		return parentTask.id;
	}

	async createTask(task: Task): Promise<string> {
		if (!task.status) {
			const config = await this.fs.loadConfig();
			task.status = config?.defaultStatus || FALLBACK_STATUS;
		}

		const filepath = await this.writePreparedTask(task, false);
		const savedTask = await this.finalizeCreatedTask(task, false);
		await this.ensureTaskWorktreeFor(savedTask ?? task);

		return filepath;
	}

	/**
	 * Create the task's worktree when the effective session settings enable it. Called after a real
	 * task is persisted; drafts never reach here. A failure warns but never fails the creation.
	 */
	async ensureTaskWorktreeFor(task: Task): Promise<string | undefined> {
		try {
			const { config } = await resolveAgentConfiguration(this, task.id);
			if (!resolveSessionSettings(config).worktreePerTask) return undefined;
			return await ensureTaskWorktree(this.fs.rootDir, task);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`Could not create worktree for ${task.id}: ${message}`);
			return undefined;
		}
	}

	async updateTask(task: Task): Promise<string> {
		return await this.taskMutations.saveTask(task);
	}

	async applyTaskUpdateInput(
		task: Task,
		input: TaskUpdateInput,
		statusResolver: (status: string) => Promise<string>,
	): Promise<{ task: Task; mutated: boolean }> {
		return await this.taskMutations.applyTaskUpdateInput(task, input, statusResolver);
	}

	async updateTaskFromInput(taskId: string, input: TaskUpdateInput, options: TaskReadOptions = {}): Promise<Task> {
		const requestedStatus = input.status?.trim().toLowerCase();
		if (requestedStatus === "draft") {
			// demoteTaskWithUpdates takes the task lock itself, so it must not be nested here.
			const task = await this.loadTaskForMutation(taskId, options);
			if (!task) throw new Error(`Task not found: ${taskId}`);
			return (await this.demoteTaskWithUpdates(task, input, options)).task;
		}
		return await this.taskMutations.updateFromInput(taskId, input, options);
	}

	async updateDraft(task: Task): Promise<string> {
		await this.fs.loadConfig();
		// Drafts always keep status Draft
		task.status = "Draft";
		task.updatedDate = formatStoredDate();

		const filepath = await this.fs.saveDraft(task);

		return filepath;
	}

	async updateDraftFromInput(reference: DraftFileReference, input: TaskUpdateInput): Promise<Task> {
		// Same discipline as task edits: acquire the namespaced per-file lock before the
		// read-modify-write and re-read inside it, so a concurrent editor fails fast instead of
		// losing its update. The reference's own file is the only thing touched; no id is ever
		// re-resolved to a different path.
		return await this.fs.withDraftLock(reference, async () => {
			const current = await this.fs.draftReferenceFromPath(reference.filePath);
			// Bind the mutated record to the selected file's own identity: a padded filename whose
			// frontmatter carries an unpadded id must keep converging onto that one file instead of
			// minting a second spelling of the same numeric id.
			current.task.id = reference.canonicalId;

			const { mutated } = await this.applyTaskUpdateInput(current.task, input, async (status) => {
				if (status.trim().toLowerCase() !== "draft") {
					throw new Error("Drafts must use status Draft.");
				}
				return "Draft";
			});

			if (!mutated) {
				return current.task;
			}

			const savedPath = await this.updateDraft(current.task);
			const refreshed = await this.fs.draftReferenceFromPath(savedPath);
			return refreshed.task;
		});
	}

	async editTaskOrDraft(
		taskId: string,
		input: TaskUpdateInput,
		options: TaskReadOptions = {},
	): Promise<TaskEditResult> {
		const resolvedDraft = await this.fs.resolveDraftReference(taskId);
		if (resolvedDraft) {
			const requestedStatus = input.status?.trim();
			const wantsDraft = requestedStatus?.toLowerCase() === "draft";
			if (requestedStatus && !wantsDraft) {
				return {
					task: await this.promoteDraftWithUpdates(resolvedDraft, input),
					cleanedTaskIds: [],
				};
			}
			return { task: await this.updateDraftFromInput(resolvedDraft, input), cleanedTaskIds: [] };
		}

		if (input.status?.trim().toLowerCase() === "draft") {
			const task = await this.loadTaskForMutation(taskId, options);
			if (!task) throw new Error(`Task not found: ${taskId}`);
			return await this.demoteTaskWithUpdates(task, input, options);
		}

		return { task: await this.updateTaskFromInput(taskId, input, options), cleanedTaskIds: [] };
	}

	private async promoteDraftWithUpdates(reference: DraftFileReference, input: TaskUpdateInput): Promise<Task> {
		return await this.taskLifecycle.promoteDraftWithUpdates(reference, input);
	}

	// Demotion is a read-modify-write of the task file too, reached from both updateTaskFromInput
	// and editTaskOrDraft, so it takes the task lock here rather than at each caller. Waiting on
	// the create lock below happens while the task lock is held; the order is always task lock
	// then create lock, never the reverse, so the two cannot deadlock.
	private async demoteTaskWithUpdates(
		task: Task,
		input: TaskUpdateInput,
		options: TaskReadOptions = {},
	): Promise<TaskEditResult> {
		return await this.taskLifecycle.demoteTaskWithUpdates(task, input, options);
	}

	async editTask(taskId: string, input: TaskUpdateInput, options: TaskReadOptions = {}): Promise<Task> {
		return await this.updateTaskFromInput(taskId, input, options);
	}

	private async writeTasksBulk(tasks: Task[]): Promise<void> {
		for (const task of tasks) await this.updateTask(task);
	}

	async updateTasksBulk(tasks: Task[]): Promise<void> {
		await this.fs.withTaskLocks(tasks, async () => await this.writeTasksBulk(tasks));
	}

	/**
	 * Resolve the task ids of a board move against a freshly refreshed content store.
	 *
	 * Ids are trimmed and de-duplicated by normalized identity while keeping the caller's spelling so
	 * messages echo what was asked for. An identity that matches more than one file fails closed with
	 * the ambiguity error instead of picking a winner. An id the store does not know comes back as
	 * `task: null` with no error, because a gap means different things to different callers.
	 *
	 * The failure semantics stay with the callers on purpose: {@link reorderTask} raises the first
	 * problem and writes all or nothing, while {@link moveTasksToStatus} reports problems per task and
	 * moves the tasks that did resolve.
	 */
	private async resolveTasksForBoardMove(taskIds: readonly string[]): Promise<{
		store: TaskCollection;
		resolutions: Array<{ taskId: string; task: Task | null; ambiguity: AmbiguousTaskIdError | null }>;
	}> {
		const requestedIds: string[] = [];
		const seen = new Set<string>();
		for (const rawId of taskIds) {
			const trimmed = String(rawId || "").trim();
			if (!trimmed) continue;
			// Canonical identity collapses cosmetic spellings such as leading zeros, so TASK-1 and
			// TASK-01 cannot both survive and write the same task twice.
			const key = canonicalTaskId(trimmed);
			if (seen.has(key)) continue;
			seen.add(key);
			requestedIds.push(trimmed);
		}

		const corpus = await this.loadTaskSnapshot();
		const store: TaskCollection = {
			getTasks: (filter?: TaskListFilter) => applyTaskFilters(corpus.tasks, filter ?? {}),
			resolveTaskForMutation: (id) => corpus.identityIndex.resolveForMutation(id),
		};

		const resolutions = requestedIds.map((taskId) => {
			const resolution = store.resolveTaskForMutation(normalizeTaskId(taskId));
			if (resolution.status === "ambiguous") {
				return { taskId, task: null, ambiguity: new AmbiguousTaskIdError(taskId, resolution.candidates) };
			}
			return { taskId, task: resolution.status === "found" ? resolution.task : null, ambiguity: null };
		});

		return { store, resolutions };
	}

	async reorderTask(params: {
		taskId: string;
		targetStatus: string;
		orderedTaskIds: string[];
		targetMilestone?: string | null;
		defaultStep?: number;
	}): Promise<{ updatedTask: Task; changedTasks: Task[] }> {
		const taskId = normalizeTaskId(String(params.taskId || "").trim());
		const targetStatus = String(params.targetStatus || "").trim();
		const orderedTaskIds = params.orderedTaskIds.map((id) => normalizeTaskId(String(id || "").trim())).filter(Boolean);
		const defaultStep = params.defaultStep ?? DEFAULT_ORDINAL_STEP;

		if (!taskId) throw new Error("taskId is required");
		if (!targetStatus) throw new Error("targetStatus is required");
		if (orderedTaskIds.length === 0) throw new Error("orderedTaskIds must include at least one task");
		if (!orderedTaskIds.includes(taskId)) {
			throw new Error("orderedTaskIds must include the task being moved");
		}

		// A repeated id means the caller sent a corrupt ordering, so reject it rather than let the
		// shared resolver quietly drop it and reorder the column into an order nobody asked for.
		const seen = new Set<string>();
		for (const id of orderedTaskIds) {
			if (seen.has(id)) {
				throw new Error(`Duplicate task id ${id} in orderedTaskIds`);
			}
			seen.add(id);
		}

		const { resolutions } = await this.resolveTasksForBoardMove(orderedTaskIds);
		for (const resolution of resolutions) {
			if (resolution.ambiguity) throw resolution.ambiguity;
		}

		// Tasks that couldn't be loaded (may have been moved/deleted) drop out of the ordering
		const validTasks = resolutions.map((resolution) => resolution.task).filter((t): t is Task => t !== null);

		const movedTask = validTasks.find((task) => task.id === taskId);
		if (!movedTask) throw new Error(`Task ${taskId} not found while reordering`);

		// Reject reordering tasks from other branches - they can only be modified in their source branch
		const crossBranchReason = crossBranchMoveReason(movedTask, "reordered");
		if (crossBranchReason) {
			throw new Error(crossBranchReason);
		}

		const { updatedTask, changedTasks } = planTaskReorder(
			taskId,
			targetStatus,
			orderedTaskIds,
			validTasks,
			params.targetMilestone,
			defaultStep,
			normalizeTargetMilestone,
		);

		if (changedTasks.length > 0) {
			await this.updateTasksBulk(changedTasks);
		}

		return { updatedTask, changedTasks };
	}

	/**
	 * Move a set of tasks into a status column, reporting problems per task instead of aborting the
	 * batch. Without `orderedTaskIds` the moved tasks append to the end of the column. With it, the
	 * caller names the column's final order and the moved tasks land exactly there, seeded with
	 * block ordinals the way {@link reorderTask} places a single task.
	 */
	async moveTasksToStatus(params: {
		taskIds: string[];
		targetStatus: string;
		orderedTaskIds?: string[];
		targetMilestone?: string | null;
		defaultStep?: number;
	}): Promise<{ movedTasks: Task[]; changedTasks: Task[]; failures: Array<{ taskId: string; reason: string }> }> {
		const targetStatus = String(params.targetStatus || "").trim();
		if (!targetStatus) throw new Error("targetStatus is required");
		const plan = await this.planTasksToStatus(params, targetStatus);

		if (plan.changedTasks.length > 0) {
			await this.updateTasksBulk(plan.changedTasks);
		}

		return plan;
	}

	private async planTasksToStatus(
		params: Parameters<Core["moveTasksToStatus"]>[0],
		targetStatus: string,
	): Promise<MoveTasksPlan> {
		const { store, resolutions } = await this.resolveTasksForBoardMove(params.taskIds);
		if (resolutions.length === 0) throw new Error("taskIds must include at least one task");

		const failures: Array<{ taskId: string; reason: string }> = [];
		const tasksToMove: Task[] = [];
		for (const { taskId, task, ambiguity } of resolutions) {
			if (ambiguity) failures.push({ taskId, reason: ambiguity.message });
			else if (!task) failures.push({ taskId, reason: `Task ${taskId} not found.` });
			else {
				const crossBranchReason = crossBranchMoveReason(task, "moved");
				if (crossBranchReason) failures.push({ taskId, reason: crossBranchReason });
				else tasksToMove.push(task);
			}
		}
		if (tasksToMove.length === 0) return { movedTasks: [], changedTasks: [], failures };

		const hasTargetMilestone = params.targetMilestone !== undefined;
		const normalizedTargetMilestone = normalizeTargetMilestone(params.targetMilestone);
		const applyMove = (task: Task): Task => ({
			...task,
			status: targetStatus,
			...(hasTargetMilestone ? { milestone: normalizedTargetMilestone } : {}),
		});
		const placement = params.orderedTaskIds
			? this.planOrderedTaskMove(
					store,
					params.orderedTaskIds,
					tasksToMove,
					failures,
					applyMove,
					params.defaultStep ?? DEFAULT_ORDINAL_STEP,
				)
			: this.planAppendedTaskMove(
					store,
					targetStatus,
					tasksToMove,
					applyMove,
					hasTargetMilestone,
					normalizedTargetMilestone,
					params.defaultStep ?? DEFAULT_ORDINAL_STEP,
				);
		return { ...placement, failures, changedTasks: placement.changedTasks.filter((task) => !task.branch) };
	}

	private planOrderedTaskMove(
		store: TaskCollection,
		orderedTaskIds: string[],
		tasksToMove: Task[],
		failures: Array<{ taskId: string; reason: string }>,
		applyMove: (task: Task) => Task,
		defaultStep: number,
	): MoveTaskPlacement {
		const { tasksInOrder, originalTasks, requiresRebalance } = planOrderedTaskPlacement({
			resolver: store,
			orderedTaskIds,
			tasksToMove,
			failures,
			applyMove,
			defaultStep,
		});
		return this.reconcileMovedTasks(
			tasksInOrder,
			resolveOrdinalConflicts(tasksInOrder, {
				defaultStep,
				startOrdinal: defaultStep,
				forceSequential: requiresRebalance,
			}),
			originalTasks,
			tasksToMove,
			applyMove,
		);
	}

	private planAppendedTaskMove(
		store: TaskCollection,
		targetStatus: string,
		tasksToMove: Task[],
		applyMove: (task: Task) => Task,
		hasTargetMilestone: boolean,
		normalizedTargetMilestone: string | undefined,
		defaultStep: number,
	): MoveTaskPlacement {
		const stayingIds = new Set(tasksToMove.filter((task) => task.status === targetStatus).map((task) => task.id));
		const arriving = tasksToMove.filter((task) => !stayingIds.has(task.id));
		if (arriving.length === 0) {
			const movedTasks = tasksToMove.map(applyMove);
			return {
				movedTasks,
				changedTasks: movedTasks.filter((task, index) => {
					const original = tasksToMove[index];
					return !original || original.status !== task.status || (original.milestone ?? "") !== (task.milestone ?? "");
				}),
			};
		}

		const movedIds = new Set(tasksToMove.map((task) => task.id));
		const sanitizeOrdinal = (task: Task): Task =>
			task.ordinal === undefined || Number.isFinite(task.ordinal) ? task : { ...task, ordinal: undefined };
		const inTargetLane = (task: Task): boolean =>
			!hasTargetMilestone || (task.milestone?.trim() || "") === (normalizedTargetMilestone ?? "");
		const columnTasks = sortByOrdinal(
			store
				.getTasks({ status: targetStatus })
				.filter((task) => (stayingIds.has(task.id) ? true : !movedIds.has(task.id) && inTargetLane(task)))
				.map(sanitizeOrdinal),
		);
		const tasksInOrder = [
			...columnTasks.map((task) => (stayingIds.has(task.id) ? applyMove(task) : task)),
			...arriving.map((task) => ({ ...applyMove(task), ordinal: undefined })),
		];
		return this.reconcileMovedTasks(
			tasksInOrder,
			resolveOrdinalConflicts(tasksInOrder, { defaultStep, startOrdinal: defaultStep }),
			store.getTasks({ status: targetStatus }),
			tasksToMove,
			applyMove,
		);
	}

	private reconcileMovedTasks(
		tasksInOrder: Task[],
		resolutionUpdates: Task[],
		originalTasks: Task[],
		tasksToMove: Task[],
		applyMove: (task: Task) => Task,
	): { movedTasks: Task[]; changedTasks: Task[] } {
		const updatesMap = new Map(tasksInOrder.map((task) => [task.id, task]));
		for (const update of resolutionUpdates) {
			updatesMap.set(update.id, update);
		}
		const originalMap = new Map([
			...originalTasks.map((task) => [task.id, task] as const),
			...tasksToMove.map((task) => [task.id, task] as const),
		]);
		const movedTasks = tasksToMove.map((task) => updatesMap.get(task.id) ?? applyMove(task));
		const changedTasks = Array.from(updatesMap.values()).filter((task) => {
			const original = originalMap.get(task.id);
			return (
				!original ||
				(original.status ?? "") !== (task.status ?? "") ||
				(original.ordinal ?? null) !== (task.ordinal ?? null) ||
				(original.milestone ?? "") !== (task.milestone ?? "")
			);
		});
		return { movedTasks, changedTasks };
	}

	async archiveTask(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.taskLifecycle.archive(taskId, options);
	}

	async deleteTask(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.taskLifecycle.delete(taskId, options);
	}

	async archiveMilestone(
		identifier: string,
	): Promise<{ success: boolean; sourcePath?: string; targetPath?: string; milestone?: Milestone }> {
		return await this.projectContent.archiveMilestone(identifier);
	}

	async renameMilestone(
		identifier: string,
		title: string,
		dueDate?: string | null,
	): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
		previousTitle?: string;
		previousDueDate?: string;
	}> {
		return await this.projectContent.renameMilestone(identifier, title, dueDate);
	}

	async completeTask(taskId: string, options: TaskReadOptions = {}): Promise<boolean> {
		return await this.taskLifecycle.complete(taskId, options);
	}

	async getTerminalStatusTasksByAge(olderThanDays: number): Promise<Task[]> {
		return await this.taskLifecycle.getTerminalStatusTasksByAge(olderThanDays);
	}

	async archiveDraft(draftId: string): Promise<boolean> {
		return await this.taskLifecycle.archiveDraft(draftId);
	}

	async promoteDraft(draftId: string): Promise<boolean> {
		return await this.taskLifecycle.promoteDraft(draftId);
	}

	async demoteTask(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.taskLifecycle.demoteTask(taskId, options);
	}

	async createDecision(decision: Decision): Promise<void> {
		return await this.projectContent.createDecision(decision);
	}

	async updateDecisionFromContent(decisionId: string, content: string): Promise<void> {
		return await this.projectContent.updateDecisionFromContent(decisionId, content);
	}

	async createDecisionWithTitle(title: string): Promise<Decision> {
		return await this.projectContent.createDecisionWithTitle(title);
	}

	async createDocument(doc: Document, subPath = ""): Promise<void> {
		return await this.projectContent.createDocument(doc, subPath);
	}

	async updateDocument(existingDoc: Document, content: string): Promise<void> {
		await this.updateDocumentFromInput({
			id: existingDoc.id,
			title: existingDoc.title,
			type: existingDoc.type,
			tags: existingDoc.tags,
			content,
			...(existingDoc.path !== undefined && { path: getDocumentSubPathFromRelativePath(existingDoc.path) }),
		});
	}

	async createDocumentWithId(title: string, content: string): Promise<Document> {
		return await this.createDocumentFromInput({ title, content });
	}

	async createDocumentFromInput(input: DocumentCreateInput): Promise<Document> {
		return await this.projectContent.createDocumentFromInput(input);
	}

	async updateDocumentFromInput(input: DocumentUpdateInput): Promise<Document> {
		return await this.projectContent.updateDocumentFromInput(input);
	}

	/**
	 * Load and process all tasks with the same logic as CLI overview
	 * This method extracts the common task loading logic for reuse
	 */
	async loadAllTasksForStatistics(
		progressCallback?: (msg: string) => void,
	): Promise<{ tasks: Task[]; drafts: Task[]; statuses: string[]; priorities: string[] }> {
		const snapshot = await this.loadTaskSnapshot();
		const config = snapshot.config;
		const statuses = (config?.statuses || DEFAULT_STATUSES) as string[];
		const priorities = config?.priorities ?? [];
		if (!snapshot.identityIndex) throw new Error("Task corpus identity index was not initialized");
		const tasks = snapshot.identityIndex.getTasks(true);

		// Load drafts
		progressCallback?.("Loading drafts...");
		const drafts = await this.fs.listDrafts();

		return { tasks, drafts, statuses: statuses as string[], priorities };
	}

	async loadTasks(
		_progressCallback?: (msg: string) => void,
		_abortSignal?: AbortSignal,
		options?: { includeCompleted?: boolean },
	): Promise<Task[]> {
		const snapshot = await this.loadTaskSnapshot();
		return options?.includeCompleted ? snapshot.identityIndex.getTasks(true) : snapshot.tasks;
	}
}

/**
 * Builds a Core bound to the project every interface resolves the same way: the runtime working
 * directory (`--cwd`/`BACKLOG_CWD`, else `process.cwd()`), then walked up to the project root just
 * like the CLI commands do. When no project is found the resolved directory is used as-is, so
 * callers keep degrading to their own fallbacks instead of failing.
 * Prefer passing an existing Core; use this only where no instance is available.
 */
export async function createRuntimeCore(): Promise<Core> {
	const { cwd } = await resolveRuntimeCwd();
	return new Core((await findBacklogRoot(cwd)) ?? cwd);
}
