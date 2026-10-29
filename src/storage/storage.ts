import { access, readFile, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, matchesGlob, relative } from "node:path";
import { withLockRelease } from "../filesystem/lock-owner.ts";
import { ProjectLayout } from "../filesystem/project-layout.ts";
import { DEFAULT_DIRECTORIES } from "../model/constants.ts";
import type { SessionConfigurationReader } from "../model/session/config.ts";
import type { AgentConfiguration } from "../model/session/types.ts";
import type { AgenticWorkspaceConfig, Milestone, Task, TaskListFilter } from "../model/types.ts";
import { addSearchableArtifactText } from "./artifact-text.ts";
import { readRootConfiguration, rootConfigFilePath } from "./config.ts";
import { FileSystem, type FileSystemSelection } from "./file-system.ts";
import { type ProjectStateRootOptions, resolveProjectStateRoot, SessionStore } from "./session-store.ts";
import { TASK_ARTIFACTS_DIRECTORY, TASK_RECORD_FILENAME, TASK_STORAGE_GLOBS } from "./task-layout.ts";
import type { CreatedTaskRollbackResult, CreatedTaskWrite } from "./types.ts";
import { type ConfigWatcherCallbacks, watchConfigFile } from "./watchers/config-watcher.ts";
import { type TaskStorageWatcherCallbacks, watchTaskDirectories } from "./watchers/task-watcher.ts";
import { ModeDeletionJournalStore, WorkspaceRequestStore } from "./workspace-control-store.ts";

/** The persistence boundary for workspace records, configuration, locks, and transactions. */
export class Storage implements SessionConfigurationReader {
	private sessionState?: SessionStore;
	readonly modeDeletionJournal: ModeDeletionJournalStore;
	readonly workspaceRequests: WorkspaceRequestStore;

	static open(projectRoot: string, options: ProjectStateRootOptions = {}): Storage {
		const filesystem = new FileSystem(projectRoot);
		filesystem.freezeResolution();
		return new Storage(filesystem, options);
	}

	constructor(
		private readonly filesystem: FileSystem,
		private readonly stateRootOptions: ProjectStateRootOptions = {},
	) {
		this.modeDeletionJournal = new ModeDeletionJournalStore(filesystem.rootDir);
		this.workspaceRequests = new WorkspaceRequestStore(filesystem.rootDir);
	}

	get projectRoot(): string {
		return this.filesystem.rootDir;
	}

	get workspaceDirectoryPath(): string {
		return (
			this.filesystem.agenticWorkspaceDir ?? join(this.filesystem.rootDir, this.filesystem.agenticWorkspaceDirName)
		);
	}

	get taskRecordsDirectory(): string {
		return this.filesystem.tasksDir;
	}

	get configFilePath(): string {
		return this.filesystem.configFilePath;
	}

	get taskArtifacts() {
		return this.filesystem.taskArtifacts;
	}

	/** Durable session histories are Storage records, not runtime-owned filesystem state. */
	sessionStore(options: ProjectStateRootOptions = {}): SessionStore {
		const stateRootOptions = Object.keys(options).length > 0 ? options : this.stateRootOptions;
		if (Object.keys(stateRootOptions).length > 0) return new SessionStore(this.filesystem.rootDir, stateRootOptions);
		if (!this.sessionState) this.sessionState = new SessionStore(this.filesystem.rootDir, stateRootOptions);
		return this.sessionState;
	}

	watchConfig(callbacks: ConfigWatcherCallbacks): ReturnType<typeof watchConfigFile> {
		return watchConfigFile(this.filesystem, callbacks);
	}

	watchTasks(callbacks: TaskStorageWatcherCallbacks): { stop(): void } {
		return watchTaskDirectories(
			[
				{ path: this.filesystem.tasksDir, lifecycle: "active" },
				{ path: this.filesystem.completedDir, lifecycle: "completed" },
				{ path: this.filesystem.archiveTasksDir, lifecycle: "archived" },
			],
			{
				onRecordChanged: async ({ filePath, lifecycle }) => {
					await callbacks.onRecordChanged({
						filePath,
						lifecycle,
						read: () => this.filesystem.readTaskRecord(filePath),
					});
				},
				onArtifactChanged: callbacks.onArtifactChanged,
			},
		);
	}

	relativeArtifactPath(task: Task, filePath: string): string | null {
		if (!task.filePath) return null;
		const container = dirname(task.filePath);
		if (!matchesGlob(relative(container, filePath), TASK_STORAGE_GLOBS.ARTIFACTS_IN_CONTAINER)) return null;
		return relative(join(container, TASK_ARTIFACTS_DIRECTORY), filePath);
	}

	async findTaskRecordPath(taskId: string): Promise<string | null> {
		const canonicalId = taskId;
		await stat(this.filesystem.tasksDir);
		const filepath = join(this.filesystem.tasksDir, canonicalId.toLowerCase(), TASK_RECORD_FILENAME);
		try {
			await access(filepath);
			return filepath;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	invalidateConfigCache(): void {
		this.filesystem.invalidateConfigCache();
	}

	async loadConfig(): Promise<AgenticWorkspaceConfig | null> {
		return await this.filesystem.loadConfig();
	}

	async loadConfigFromDisk(): Promise<AgenticWorkspaceConfig | null> {
		return await this.filesystem.loadConfigFromDisk();
	}

	async saveConfig(config: AgenticWorkspaceConfig): Promise<void> {
		await this.filesystem.saveConfig(config);
	}

	async saveConfigUnderConfigLock(config: AgenticWorkspaceConfig): Promise<void> {
		await this.filesystem.saveConfigUnderConfigLock(config);
	}

	async initializeWorkspace(config: AgenticWorkspaceConfig, selection: FileSystemSelection): Promise<void> {
		const filesystem = new FileSystem(this.filesystem.rootDir, selection);
		const workspace = filesystem.agenticWorkspaceDir;
		await new ProjectLayout().ensureDirectories([
			workspace,
			join(workspace, DEFAULT_DIRECTORIES.TASKS),
			join(workspace, DEFAULT_DIRECTORIES.COMPLETED),
			join(workspace, DEFAULT_DIRECTORIES.ARCHIVE_TASKS),
			join(workspace, DEFAULT_DIRECTORIES.MILESTONES),
			join(workspace, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES),
			join(workspace, ".locks"),
			join(dirname(filesystem.configFilePath), ".locks"),
			join(this.filesystem.rootDir, DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE, ".locks"),
			join(this.filesystem.rootDir, DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE, "agent-workspace", ".locks"),
			join(dirname(rootConfigFilePath()), ".locks"),
			await resolveProjectStateRoot(this.filesystem.rootDir, this.stateRootOptions),
		]);
		await filesystem.saveConfig(config);
		await new ProjectLayout().ensureDirectories([await filesystem.taskCreationLockDirectory()]);
	}

	async loadUserAgentConfiguration(): Promise<AgentConfiguration | null> {
		return await readRootConfiguration(rootConfigFilePath());
	}

	async loadProjectAgentConfiguration(): Promise<AgentConfiguration | null> {
		const config = await this.filesystem.loadConfig();
		return config?.agentConfiguration ?? null;
	}

	async loadMilestones(): Promise<Milestone[]> {
		return await this.filesystem.listMilestones();
	}

	async loadArchivedMilestones(): Promise<Milestone[]> {
		return await this.filesystem.listArchivedMilestones();
	}

	async loadTasks(filter?: TaskListFilter): Promise<Task[]> {
		return await this.filesystem.listTasks(filter);
	}

	async loadCompletedTasks(): Promise<Task[]> {
		return await this.filesystem.listCompletedTasks();
	}

	async loadArchivedTasks(): Promise<Task[]> {
		return await this.filesystem.listArchivedTasks();
	}

	async loadProjectTaskIds(): Promise<string[]> {
		const [active, completed, archived] = await Promise.all([
			this.loadTasks(),
			this.loadCompletedTasks(),
			this.loadArchivedTasks(),
		]);
		return [...new Set([...active, ...completed, ...archived].map((task) => task.id))];
	}

	async loadTask(taskId: string, options: { includeArchived?: boolean } = {}): Promise<Task | null> {
		return await this.filesystem.loadTask(taskId, options);
	}

	async saveTask(task: Task, options: { create?: boolean } = {}): Promise<string> {
		if (options.create) return (await this.createTask(task)).filePath;
		const filePath = await this.filesystem.saveTask(task, options);
		return filePath;
	}

	async createTask(task: Task): Promise<CreatedTaskWrite> {
		const sessionStore = this.sessionStore();
		await sessionStore.stateRoot;
		const filePath = await this.filesystem.saveTask(task, { create: true });
		const write = await this.prepareCreatedTaskWrite(filePath);
		try {
			write.sessionState = await sessionStore.insertTask(task.id);
			return write;
		} catch (error) {
			try {
				if (!(await this.restoreCreatedPath(write)))
					throw new Error(
						`Task data changed during session initialization; remaining data was preserved at ${dirname(filePath)}.`,
					);
			} catch (cleanupError) {
				throw new AggregateError([error, cleanupError], `Task ${task.id} session initialization and cleanup failed.`);
			}
			throw error;
		}
	}

	async loadTaskContent(taskId: string): Promise<string | null> {
		const task = await this.filesystem.loadTask(taskId);
		if (!task?.filePath) return null;
		return await Bun.file(task.filePath).text();
	}

	async moveTaskToArchive(task: Task): Promise<string> {
		return await this.filesystem.moveTaskContainer(task, await this.filesystem.getArchiveTasksDir());
	}

	async deleteTaskContainer(task: Task): Promise<void> {
		return await this.filesystem.deleteTaskContainer(task);
	}

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withCreateLock(fn);
	}

	async withTaskLock<T>(
		taskId: string,
		fn: (task: Task) => Promise<T>,
		options: { includeArchived?: boolean } = {},
	): Promise<T> {
		const acquired = await this.acquireTaskLock(taskId, options);
		return await withLockRelease(acquired.release, async () => await fn(acquired.task));
	}

	async acquireTaskLock(
		taskId: string,
		options: { includeArchived?: boolean } = {},
	): Promise<{ task: Task; release: () => Promise<void> }> {
		const release = await this.filesystem.acquireTaskLock(taskId);
		try {
			const task = await this.loadTask(taskId, options);
			if (!task) throw new Error(`Task not found: ${taskId}`);
			return { task, release };
		} catch (error) {
			return await withLockRelease(release, async () => {
				throw error;
			});
		}
	}

	async acquireTaskLocks(
		taskIds: string[],
		options: { includeArchived?: boolean } = {},
	): Promise<{ tasks: Task[]; release: () => Promise<void> }> {
		const release = await this.filesystem.acquireTaskLocks(taskIds);
		try {
			const tasks = await Promise.all(
				taskIds.map(async (taskId) => {
					const task = await this.loadTask(taskId, options);
					if (!task) throw new Error(`Task not found: ${taskId}`);
					return task;
				}),
			);
			return { tasks, release };
		} catch (error) {
			return await withLockRelease(release, async () => {
				throw error;
			});
		}
	}

	async withTaskLocks<T>(
		tasks: Array<Pick<Task, "id">>,
		fn: (tasks: Task[]) => Promise<T>,
		options: { includeArchived?: boolean } = {},
	): Promise<T> {
		const acquired = await this.acquireTaskLocks(
			tasks.map(({ id }) => id),
			options,
		);
		return await withLockRelease(acquired.release, async () => await fn(acquired.tasks));
	}

	async allocateTaskId(
		prefix: string,
		zeroPadding: number | undefined,
		existingIds: () => Promise<string[]>,
	): Promise<string> {
		return await this.filesystem.allocateTaskId(prefix, zeroPadding, existingIds);
	}

	addSearchableArtifactText<T extends Task>(tasks: T[]) {
		return addSearchableArtifactText(tasks, this.filesystem.taskArtifacts);
	}

	async prepareCreatedTaskWrite(filePath: string): Promise<CreatedTaskWrite> {
		const createdContent = await this.readFileIfPresent(filePath);
		if (!createdContent) throw new Error(`Created task record not found: ${filePath}`);
		return {
			filePath,
			createdContent,
			createdDirectories: [dirname(filePath), join(dirname(filePath), TASK_ARTIFACTS_DIRECTORY)],
			previousPath: null,
			previousContent: null,
		};
	}

	async rollbackCreatedTask(write: CreatedTaskWrite): Promise<CreatedTaskRollbackResult> {
		const sessionStateRestored = write.sessionState
			? await this.sessionStore().rollbackInsertedTask(write.sessionState)
			: true;
		const workingPathRestored = await this.restoreCreatedPath(write);
		return { workingPathRestored, sessionStateRestored };
	}

	private async readFileIfPresent(filePath: string | null): Promise<Buffer | null> {
		if (!filePath) return null;
		try {
			return await readFile(filePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	private async restoreCreatedPath(write: CreatedTaskWrite): Promise<boolean> {
		const currentContent = await this.readFileIfPresent(write.filePath);
		if (currentContent === null) {
			if (write.previousPath !== write.filePath || !write.previousContent) return true;
			try {
				await writeFile(write.filePath, write.previousContent, { flag: "wx" });
				return true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
				throw error;
			}
		}
		if (!currentContent.equals(write.createdContent)) return false;
		await unlink(write.filePath);
		let restored = true;
		// Remove only owned empty directories; preserve artifacts and sidecars added after creation.
		for (const directory of [...write.createdDirectories].reverse()) {
			try {
				await rmdir(directory);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				if ((error as NodeJS.ErrnoException).code === "ENOTEMPTY") restored = false;
				else throw error;
			}
		}
		return restored;
	}
}
