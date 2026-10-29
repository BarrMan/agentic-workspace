import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { resolveMainWorktreeRootSync } from "../filesystem/git/main-worktree.ts";
import { LockOwner } from "../filesystem/lock-owner.ts";
import type { AgenticWorkspaceConfigSource } from "../filesystem/paths/agentic-workspace-directory.ts";
import {
	normalizeProjectAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectoryFromRootConfig,
} from "../filesystem/paths/agentic-workspace-directory.ts";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES } from "../model/constants.ts";
import { isValidTaskId } from "../model/task/task-id.ts";
import { TaskOrdering } from "../model/task/task-ordering.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import type { AgenticWorkspaceConfig, Milestone, Task, TaskListFilter } from "../model/types.ts";
import { writeAtomically } from "./atomic-write.ts";
import { withConfigPathLock } from "./config.ts";
import { parseConfig, serializeConfig } from "./config-codec.ts";
import { parseMarkdown, parseTask } from "./markdown/parser.ts";
import { serializeTask } from "./markdown/serializer.ts";
import { MilestoneStore } from "./milestones.ts";
import { TaskArtifactRepository } from "./task-artifact-repository.ts";
import { TASK_ARTIFACTS_DIRECTORY, TASK_CONTAINER_LOCATIONS, TASK_RECORD_FILENAME } from "./task-layout.ts";
import { TaskRepository } from "./task-repository.ts";

// Interface for task path resolution context
interface CreateLockOptions {
	timeoutMs?: number;
	retryDelayMs?: number;
	staleMs?: number;
}

interface CreateLockTarget {
	targetPath: string;
	locksDir: string;
}

const DEFAULT_CREATE_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_CREATE_LOCK_RETRY_DELAY_MS = 100;
const DEFAULT_CREATE_LOCK_STALE_MS = 10_000;
const taskCounterSchema = z.record(
	z.string().regex(/^[A-Z]+$/),
	z.strictObject({ lastAllocated: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }),
);

export type FileSystemSelection = {
	agenticWorkspaceDirectory: string;
	configLocation: AgenticWorkspaceConfigSource;
};

const CREATE_LOCK_ERROR_CODE = "ECREATELOCK";
export const CREATE_LOCK_ERROR_MESSAGE = "Another task creation operation is already in progress. Please try again.";

const CREATE_LOCK_ERROR_NAME = "CreateLockError";
const TASK_LOCK_ERROR_NAME = "TaskLockError";
const TASK_LOCK_ERROR_CODE = "ETASKLOCK";

function lockError(name: string, code: string, message: string, cause?: unknown): Error {
	const error = new Error(message, cause === undefined ? undefined : { cause }) as Error & { code?: string };
	error.name = name;
	error.code = code;
	return error;
}

function isLockError(error: unknown, name: string, code: string): error is Error {
	return error instanceof Error && error.name === name && (error as Error & { code?: string }).code === code;
}

function createLockError(message: string, cause?: unknown): Error {
	return lockError(CREATE_LOCK_ERROR_NAME, CREATE_LOCK_ERROR_CODE, message, cause);
}

function taskLockError(message: string, cause?: unknown): Error {
	return lockError(TASK_LOCK_ERROR_NAME, TASK_LOCK_ERROR_CODE, message, cause);
}

function sanitizeLockKey(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^\.+/, "") || "unknown"
	);
}

function isCreateLockError(error: unknown): error is Error {
	return isLockError(error, CREATE_LOCK_ERROR_NAME, CREATE_LOCK_ERROR_CODE);
}

export function isTaskLockError(error: unknown): error is Error {
	return isLockError(error, TASK_LOCK_ERROR_NAME, TASK_LOCK_ERROR_CODE);
}

export function taskLockErrorMessage(taskId: string): string {
	return `Edit failed: ${taskId} is being modified by another process; retry if appropriate.`;
}

export class FileSystem {
	private resolvedAgenticWorkspaceDir: string;
	private resolvedAgenticWorkspaceDirName: string;
	private resolvedConfigPath: string;
	private configSource: AgenticWorkspaceConfigSource;
	private resolutionFrozen = false;
	private readonly projectRoot: string;
	private readonly agenticWorkspaceResolutionRoot: string;
	private cachedConfig: AgenticWorkspaceConfig | null = null;
	private cachedConfigSnapshot: { path: string; content: string } | null = null;
	private readonly taskRepository: TaskRepository;
	private readonly locks = new LockOwner();
	get taskParseCacheEpoch() {
		return this.taskRepository.epoch;
	}
	private readonly milestones: MilestoneStore;

	constructor(projectRoot: string, selection?: FileSystemSelection) {
		this.projectRoot = projectRoot;
		this.agenticWorkspaceResolutionRoot = resolveMainWorktreeRootSync(projectRoot) ?? projectRoot;
		const resolution = selection
			? resolveAgenticWorkspaceDirectoryFromRootConfig(
					this.agenticWorkspaceResolutionRoot,
					selection.agenticWorkspaceDirectory,
				)
			: resolveAgenticWorkspaceDirectory(this.agenticWorkspaceResolutionRoot);
		const agenticWorkspaceDirectory =
			selection?.agenticWorkspaceDirectory ?? resolution.agenticWorkspaceDir ?? DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE;
		const normalizedSelection = normalizeProjectAgenticWorkspaceDirectory(agenticWorkspaceDirectory);
		if (!normalizedSelection) throw new Error("Invalid AgenticWorkspace directory.");
		this.resolvedAgenticWorkspaceDirName = normalizedSelection;
		this.resolvedAgenticWorkspaceDir =
			resolution.agenticWorkspacePath ??
			resolve(this.agenticWorkspaceResolutionRoot, DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE);
		this.configSource = selection?.configLocation ?? resolution.configSource ?? "folder";
		this.resolvedConfigPath =
			this.configSource === "root"
				? join(this.agenticWorkspaceResolutionRoot, DEFAULT_FILES.ROOT_CONFIG)
				: selection
					? join(this.resolvedAgenticWorkspaceDir, DEFAULT_FILES.CONFIG)
					: (resolution.configPath ?? join(this.resolvedAgenticWorkspaceDir, DEFAULT_FILES.CONFIG));
		this.taskRepository = new TaskRepository();
		this.milestones = new MilestoneStore({
			activeDirectory: () => this.getMilestonesDir(),
			archiveDirectory: () => this.getArchiveMilestonesDir(),
			ensureDirectory: (directory) => this.ensureDirectoryExists(directory),
			withCreateLock: (operation) => this.withCreateLock(operation),
		});
	}

	private async getAgenticWorkspaceDir(): Promise<string> {
		return this.resolvedAgenticWorkspaceDir;
	}

	// Public accessors for directory paths
	get agenticWorkspaceDir(): string {
		return this.resolvedAgenticWorkspaceDir;
	}
	get agenticWorkspaceDirName(): string {
		return this.resolvedAgenticWorkspaceDirName;
	}
	get tasksDir(): string {
		return join(this.resolvedAgenticWorkspaceDir, DEFAULT_DIRECTORIES.TASKS);
	}
	get completedDir(): string {
		return join(this.resolvedAgenticWorkspaceDir, DEFAULT_DIRECTORIES.COMPLETED);
	}

	get archiveTasksDir(): string {
		return join(this.resolvedAgenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS);
	}
	get configFilePath(): string {
		return this.resolvedConfigPath;
	}

	/** Filesystem service for task-relative files; task records remain managed by this FileSystem. */
	get taskArtifacts(): TaskArtifactRepository {
		return new TaskArtifactRepository({
			agenticWorkspaceDirectory: this.resolvedAgenticWorkspaceDir,
			projectRoot: this.agenticWorkspaceResolutionRoot,
		});
	}

	/** Get the project root directory */
	get rootDir(): string {
		return this.projectRoot;
	}

	invalidateConfigCache(): void {
		this.cachedConfig = null;
		this.cachedConfigSnapshot = null;
		if (!this.resolutionFrozen) this.refreshConfigResolution();
	}

	/** Pin this instance to its current canonical storage targets for its lifetime. */
	freezeResolution(): void {
		const canonical = (path: string): string => {
			try {
				return realpathSync(path);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				return join(canonical(dirname(path)), basename(path));
			}
		};
		this.resolvedAgenticWorkspaceDir = canonical(this.resolvedAgenticWorkspaceDir);
		this.resolvedConfigPath = canonical(this.resolvedConfigPath);
		this.resolutionFrozen = true;
	}

	getCachedConfigContent(sourceConfigPath: string): string | null {
		return this.cachedConfigSnapshot && resolve(this.cachedConfigSnapshot.path) === resolve(sourceConfigPath)
			? this.cachedConfigSnapshot.content
			: null;
	}

	publishConfig(config: AgenticWorkspaceConfig, sourceConfigPath: string, content: string): boolean {
		const rootConfigPath = join(this.agenticWorkspaceResolutionRoot, DEFAULT_FILES.ROOT_CONFIG);
		if (resolve(sourceConfigPath) === resolve(rootConfigPath)) {
			if (
				config.agenticWorkspaceDirectory !== undefined &&
				normalizeProjectAgenticWorkspaceDirectory(config.agenticWorkspaceDirectory) === null
			) {
				return false;
			}
			const resolution = resolveAgenticWorkspaceDirectoryFromRootConfig(
				this.agenticWorkspaceResolutionRoot,
				config.agenticWorkspaceDirectory,
			);
			if (!resolution.agenticWorkspaceDir || !resolution.agenticWorkspacePath || resolution.configSource !== "root") {
				return false;
			}
			if (!this.resolutionFrozen) this.applyConfigResolution(resolution);
		}
		this.cachedConfig = config;
		this.cachedConfigSnapshot = { path: sourceConfigPath, content };
		return true;
	}

	private refreshConfigResolution(): void {
		this.applyConfigResolution(resolveAgenticWorkspaceDirectory(this.agenticWorkspaceResolutionRoot));
	}

	private applyConfigResolution(resolution: ReturnType<typeof resolveAgenticWorkspaceDirectory>): void {
		const agenticWorkspaceDirName = resolution.agenticWorkspaceDir ?? DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE;
		const agenticWorkspaceDir =
			resolution.agenticWorkspacePath ?? join(this.projectRoot, DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE);
		if (resolve(agenticWorkspaceDir) !== resolve(this.resolvedAgenticWorkspaceDir)) {
			this.invalidateTaskParseCache();
		}
		this.resolvedAgenticWorkspaceDirName = agenticWorkspaceDirName;
		this.resolvedAgenticWorkspaceDir = agenticWorkspaceDir;
		this.resolvedConfigPath = resolution.configPath ?? join(this.resolvedAgenticWorkspaceDir, DEFAULT_FILES.CONFIG);
		this.configSource = resolution.configSource ?? "folder";
	}

	private invalidateTaskParseCache(): void {
		this.taskRepository.invalidate();
	}

	private async getTasksDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.TASKS);
	}

	async getArchiveTasksDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS);
	}

	private async getArchiveMilestonesDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES);
	}

	private async getMilestonesDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.MILESTONES);
	}

	private async getCompletedDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.COMPLETED);
	}

	private toCreateLockError(error: unknown): Error {
		if (isCreateLockError(error)) {
			return error;
		}

		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ELOCKED") {
			return createLockError(CREATE_LOCK_ERROR_MESSAGE, error);
		}
		if (code === "ECOMPROMISED") {
			return createLockError("Task creation lock was interrupted. Please try again.", error);
		}
		return error instanceof Error ? error : new Error(String(error));
	}

	private toTaskLockError(error: unknown, taskId: string): Error {
		if (isTaskLockError(error)) {
			return error;
		}

		const code = (error as NodeJS.ErrnoException | undefined)?.code;
		if (code === "ELOCKED") {
			return taskLockError(taskLockErrorMessage(taskId), error);
		}
		if (code === "ENOENT") {
			// The file was moved or removed between loading the snapshot and locking it.
			return taskLockError(`Edit failed: ${taskId} was moved or removed by another process.`, error);
		}
		if (code === "ECOMPROMISED") {
			return taskLockError(`Edit failed: the lock on ${taskId} was interrupted; retry if appropriate.`, error);
		}
		return error instanceof Error ? error : new Error(String(error));
	}

	private async getGitCommonDir(): Promise<string | null> {
		try {
			const config = await this.loadConfig();
			if (config?.filesystemOnly) {
				return null;
			}
		} catch {
			// If config cannot be read, still try git and fall back to the AgenticWorkspace directory on failure.
		}

		try {
			const subprocess = Bun.spawn(["git", "rev-parse", "--git-common-dir"], {
				cwd: this.projectRoot,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "ignore",
				env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } as Record<string, string>,
			});
			const stdoutPromise = subprocess.stdout ? new Response(subprocess.stdout).text() : Promise.resolve("");
			const [exitCode, stdout] = await Promise.all([subprocess.exited, stdoutPromise]);
			if (exitCode !== 0) return null;
			const commonDir = stdout.trim();
			if (!commonDir) return null;
			return isAbsolute(commonDir) ? commonDir : resolve(this.projectRoot, commonDir);
		} catch {
			return null;
		}
	}

	private async getCreateLockTarget(agenticWorkspaceDir: string): Promise<CreateLockTarget> {
		const commonGitDir = await this.getGitCommonDir();
		if (commonGitDir) {
			return {
				targetPath: commonGitDir,
				locksDir: join(commonGitDir, "agentic-workspace", "locks"),
			};
		}

		return {
			targetPath: agenticWorkspaceDir,
			locksDir: join(agenticWorkspaceDir, ".locks"),
		};
	}

	async taskCreationLockDirectory(): Promise<string> {
		return (await this.getCreateLockTarget(await this.getAgenticWorkspaceDir())).locksDir;
	}

	// Uses a maintained lockfile with stale-lock recovery.
	async withCreateLock<T>(fn: () => Promise<T>, options: CreateLockOptions = {}): Promise<T> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		const lockTarget = await this.getCreateLockTarget(agenticWorkspaceDir);
		const timeoutMs = options.timeoutMs ?? DEFAULT_CREATE_LOCK_TIMEOUT_MS;
		const retryDelayMs = options.retryDelayMs ?? DEFAULT_CREATE_LOCK_RETRY_DELAY_MS;
		return await this.locks.withTarget(
			lockTarget.targetPath,
			join(lockTarget.locksDir, "create"),
			{
				staleMs: options.staleMs ?? DEFAULT_CREATE_LOCK_STALE_MS,
				retryDelayMs,
				retries: Math.max(Math.ceil(timeoutMs / retryDelayMs) - 1, 0),
			},
			(error) => this.toCreateLockError(error),
			fn,
		);
	}

	/** Wait for the project/task identity lock, independent of the task's current record path. */
	async acquireTaskLock(taskId: string): Promise<() => Promise<void>> {
		const lockTarget = await this.getCreateLockTarget(await this.getAgenticWorkspaceDir());
		const key = sanitizeLockKey(taskId);
		return await this.locks.acquireTarget(
			join(lockTarget.locksDir, "targets", `task-${key}`),
			join(lockTarget.locksDir, `task-${key}`),
			{
				staleMs: DEFAULT_CREATE_LOCK_STALE_MS,
				retries: Number.POSITIVE_INFINITY,
				retryDelayMs: DEFAULT_CREATE_LOCK_RETRY_DELAY_MS,
			},
			(error) => this.toTaskLockError(error, taskId),
		);
	}

	private async taskCounterPath(): Promise<string> {
		const lockTarget = await this.getCreateLockTarget(await this.getAgenticWorkspaceDir());
		return join(dirname(lockTarget.locksDir), "task-counter.json");
	}

	/** Counter shape: { "PREFIX": { "lastAllocated": integer } }; callers hold the create lock. */
	async allocateTaskId(
		prefix: string,
		zeroPadding: number | undefined,
		existingIds: () => Promise<string[]>,
	): Promise<string> {
		const counterPath = await this.taskCounterPath();
		let counters: Record<string, { lastAllocated: number }>;
		try {
			counters = taskCounterSchema.parse(JSON.parse(await readFile(counterPath, "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT")
				throw new Error(
					`Invalid task counter at ${counterPath}; expected lastAllocated records. Existing bytes were preserved.`,
					{
						cause: error,
					},
				);
			counters = {};
		}

		const canonicalPrefix = prefix.toUpperCase();
		let lastAllocated = Object.hasOwn(counters, canonicalPrefix) ? counters[canonicalPrefix]?.lastAllocated : undefined;
		if (lastAllocated === undefined) {
			let max = 0;
			for (const id of await existingIds()) {
				const canonicalId = id;
				const prefix = `${canonicalPrefix}-`;
				const suffix = canonicalId.startsWith(prefix) ? canonicalId.slice(prefix.length) : "";
				if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
			}
			lastAllocated = max;
		}

		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allocated = ++lastAllocated;
			if (!Number.isSafeInteger(allocated))
				throw new Error(`Task ID counter for ${canonicalPrefix} exceeded the safe integer range.`);
			counters[canonicalPrefix] = { lastAllocated: allocated };
			await writeAtomically(counterPath, JSON.stringify(counters, null, 2), "Task counter");
			const number = String(allocated).padStart(zeroPadding && zeroPadding > 0 ? zeroPadding : 0, "0");
			const id = `${canonicalPrefix}-${number}`;
			const occupied = await Promise.all(
				TASK_CONTAINER_LOCATIONS.map(async (location) => {
					try {
						await stat(await this.taskArtifacts.containerPath(id.toLowerCase(), location));
						return true;
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
						throw error;
					}
				}),
			);
			if (!occupied.some(Boolean)) return id;
		}
		throw new Error(`Could not allocate an unused task ID for ${canonicalPrefix} after 10 attempts.`);
	}

	/**
	 * Hold a stable set of task locks for one operation. The callback runs only after every
	 * lock is acquired, so a contended task cannot leave an earlier write from a bulk operation
	 * on disk. Sorting also keeps multi-task operations from acquiring the same locks in opposite
	 * orders and deadlocking each other.
	 */
	async acquireTaskLocks(taskIds: string[]): Promise<() => Promise<void>> {
		const identities = [...new Set(taskIds)].sort((left, right) => left.localeCompare(right));
		const releases: Array<() => Promise<void>> = [];
		try {
			for (const taskId of identities) releases.push(await this.acquireTaskLock(taskId));
		} catch (error) {
			const releaseErrors: unknown[] = [];
			for (const release of releases.reverse()) {
				try {
					await release();
				} catch (releaseError) {
					releaseErrors.push(releaseError);
				}
			}
			if (releaseErrors.length)
				throw new AggregateError([error, ...releaseErrors], "Task lock acquisition and cleanup failed.");
			throw error;
		}
		return async () => {
			const releaseErrors: unknown[] = [];
			for (const release of releases.reverse()) {
				try {
					await release();
				} catch (error) {
					releaseErrors.push(error);
				}
			}
			if (releaseErrors.length) throw new AggregateError(releaseErrors, "Task lock release failed.");
		};
	}

	// Task operations
	private async resolveTaskWriteTarget(task: Task): Promise<{ id: string; filename: string; filePath: string }> {
		if (!isValidTaskId(task.id))
			throw new Error(
				`Invalid task ID ${JSON.stringify(task.id)}; expected PREFIX-NUMBER with optional dotted numeric segments.`,
			);
		const id = task.id;
		const directory = await this.getTasksDir();
		const filename = TASK_RECORD_FILENAME;
		const filePath = join(directory, id.toLowerCase(), filename);
		return { id, filename, filePath };
	}

	private async existingTaskAtWritePath(filepath: string): Promise<Task | null> {
		try {
			const task = parseTask(await Bun.file(filepath).text());
			return task;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	private async resolveCanonicalExistingRecord(
		task: Task,
		recordPath = task.filePath,
	): Promise<{ path: string; root: string; record: Task }> {
		if (!recordPath) throw new Error(`Task ${task.id} has no record path.`);
		const path = resolve(recordPath);
		const container = dirname(path);
		const roots = await Promise.all([this.getTasksDir(), this.getCompletedDir(), this.getArchiveTasksDir()]);
		const root = roots.find((candidate) => resolve(dirname(container)) === resolve(candidate));
		if (!root) throw new Error(`Task ${task.id} has a non-canonical storage path; refusing operation.`);
		if (basename(container) !== task.id.toLowerCase())
			throw new Error(`Task ${task.id} record/container identity mismatch; refusing operation.`);
		const record = await this.existingTaskAtWritePath(path);
		if (!record || record.id !== task.id)
			throw new Error(`Task ${task.id} record identity changed; refusing operation.`);
		return { path, root: resolve(root), record };
	}

	private async retainedTaskFrontmatter(...filepaths: Array<string | undefined>): Promise<Record<string, unknown>> {
		for (const filepath of filepaths) {
			if (!filepath) continue;
			try {
				const retained = { ...parseMarkdown(await Bun.file(filepath).text()).frontmatter };
				delete retained.agent_summary;
				return retained;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		return {};
	}

	async saveTask(task: Task, options: { create?: boolean } = {}): Promise<string> {
		const { id: requestedId } = await this.resolveTaskWriteTarget(task);
		const normalizedId = requestedId.toLowerCase();
		const roots = await Promise.all([this.getTasksDir(), this.getCompletedDir(), this.getArchiveTasksDir()]);
		let existingTask: Task | null = null;
		let filepath: string;

		if (options.create) {
			if (task.filePath)
				throw new Error(`Task ID ${requestedId} already exists; refusing to merge or reuse its identity.`);
			if (await this.loadTask(requestedId, { includeArchived: true }))
				throw new Error(`Task ID ${requestedId} already exists; refusing to merge or reuse its identity.`);
			const container = await this.taskArtifacts.containerPath(normalizedId, "tasks");
			if (resolve(dirname(container)) !== resolve(roots[0]))
				throw new Error(`Task ${requestedId} resolves outside active task storage.`);
			try {
				await stat(container);
				throw new Error(`Task container ${container} already exists; refusing to merge or reuse its task ID.`);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			filepath = join(container, TASK_RECORD_FILENAME);
		} else if (typeof task.filePath === "string" && task.filePath.trim()) {
			const resolved = await this.resolveCanonicalExistingRecord(task);
			filepath = resolved.path;
			existingTask = resolved.record;
		} else {
			throw new Error(`Task ${requestedId} has no record path; existing-task saves require filePath.`);
		}

		if (existingTask && existingTask.id !== task.id)
			throw new Error(`Task identity mismatch: requested ${task.id}, stored record is ${existingTask.id}.`);
		const normalizedTask = {
			...task,
			filePath: filepath,
		};
		const content = serializeTask(normalizedTask, await this.retainedTaskFrontmatter(filepath));
		const container = dirname(filepath);
		if (!existingTask) {
			try {
				await mkdir(dirname(container));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !(await stat(dirname(container))).isDirectory())
					throw error;
			}
			await mkdir(container);
			await mkdir(join(container, TASK_ARTIFACTS_DIRECTORY));
		}
		await writeAtomically(filepath, content, "Task");
		return filepath;
	}

	async loadTask(taskId: string, options: { includeArchived?: boolean } = {}): Promise<Task | null> {
		if (!isValidTaskId(taskId))
			throw new Error(
				`Invalid task ID ${JSON.stringify(taskId)}; expected PREFIX-NUMBER with optional dotted numeric segments.`,
			);
		const idDirectory = taskId.toLowerCase();
		const directories = await Promise.all([
			this.getTasksDir(),
			this.getCompletedDir(),
			...(options.includeArchived ? [this.getArchiveTasksDir()] : []),
		]);
		await Promise.all(directories.map(async (directory) => await stat(directory)));
		for (const directory of directories) {
			const filepath = join(directory, idDirectory, TASK_RECORD_FILENAME);
			try {
				const parsed = parseTask(await Bun.file(filepath).text());
				if (parsed.id === taskId) return { ...parsed, filePath: filepath };
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
		}
		return null;
	}

	async readTaskRecord(filePath: string): Promise<Task | null> {
		try {
			const task = await this.taskRepository.readParsedFile(filePath);
			return { ...task, filePath };
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw error;
		}
	}

	async listTasks(filter?: TaskListFilter): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		const tasksDir = await this.getTasksDir();
		const taskFiles = await this.taskRepository.listFiles(tasksDir);

		let tasks = await this.taskRepository.readFiles(tasksDir, taskFiles, cacheEpoch);

		if (filter) tasks = TaskSearchIndex.apply(tasks, filter);

		return TaskOrdering.byId(tasks);
	}

	async listCompletedTasks(): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		const completedDir = await this.getCompletedDir();
		const taskFiles = await this.taskRepository.listFiles(completedDir);

		const tasks = await this.taskRepository.readFiles(completedDir, taskFiles, cacheEpoch);

		return TaskOrdering.byId(tasks);
	}

	async listArchivedTasks(): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		const archiveTasksDir = await this.getArchiveTasksDir();
		const taskFiles = await this.taskRepository.listFiles(archiveTasksDir);

		const tasks = await this.taskRepository.readFiles(archiveTasksDir, taskFiles, cacheEpoch);

		return TaskOrdering.byId(tasks);
	}

	/** Move a canonical task folder with its artifacts and approval sidecar intact. */
	private async resolveTaskContainer(task: Task): Promise<{ path: string; root: string }> {
		const resolved = await this.resolveCanonicalExistingRecord(task);
		return { path: dirname(resolved.path), root: resolved.root };
	}

	async moveTaskContainer(task: Task, destinationDirectory: string): Promise<string> {
		if (!task.filePath) throw new Error(`Cannot move task ${task.id} without its record path.`);
		const move = async () => {
			const { path: sourceContainer } = await this.resolveTaskContainer(task);
			const destinationRoot = resolve(destinationDirectory);
			const roots = await Promise.all([this.getTasksDir(), this.getCompletedDir(), this.getArchiveTasksDir()]);
			if (!roots.some((root) => resolve(root) === destinationRoot))
				throw new Error(`Task ${task.id} destination is not a canonical task storage root.`);
			const sourcePath = join(sourceContainer, TASK_RECORD_FILENAME);
			const targetContainer = join(destinationRoot, basename(sourceContainer));
			if (resolve(sourceContainer) === resolve(targetContainer)) return sourcePath;
			try {
				await stat(targetContainer);
				throw new Error(`Cannot move task ${task.id}: destination container already exists at ${targetContainer}.`);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			await rename(sourceContainer, targetContainer);
			this.taskRepository.invalidate();
			const targetPath = join(targetContainer, TASK_RECORD_FILENAME);
			return targetPath;
		};
		return await move();
	}

	async deleteTaskContainer(task: Task): Promise<void> {
		if (!task.filePath) throw new Error(`Cannot delete task ${task.id} without its record path.`);
		const remove = async () => {
			const { path: sourceContainer } = await this.resolveTaskContainer(task);
			await rm(sourceContainer, { recursive: true });
			this.taskRepository.invalidate();
		};
		await remove();
	}

	async listMilestones(): Promise<Milestone[]> {
		return this.milestones.listActive();
	}

	async listArchivedMilestones(): Promise<Milestone[]> {
		return this.milestones.listArchived();
	}

	async getMilestoneFilePath(identifier: string): Promise<string | null> {
		return this.milestones.filePath(identifier);
	}

	async createMilestone(title: string, description?: string, dueDate?: string): Promise<Milestone> {
		return this.milestones.create(title, description, dueDate);
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
		return this.milestones.rename(identifier, title, dueDate);
	}

	async archiveMilestone(identifier: string): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
	}> {
		return this.milestones.archive(identifier);
	}

	// Config operations
	async loadConfig(): Promise<AgenticWorkspaceConfig | null> {
		// Return cached config if available
		if (this.cachedConfig !== null) {
			return this.cachedConfig;
		}

		return await this.loadConfigFromDisk();
	}

	/** Read the persisted configuration, bypassing the instance cache for locked updates. */
	async loadConfigFromDisk(): Promise<AgenticWorkspaceConfig | null> {
		const configPath = this.resolvedConfigPath;
		let content: string;
		try {
			content = await readFile(configPath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
			throw new Error(`Could not read configuration at ${configPath}.`, { cause: error });
		}

		// A value AgenticWorkspace cannot read is reported, not swallowed: callers must not silently
		// fall back to defaults while the config file says something else.
		const config = parseConfig(content, this.resolvedConfigPath);
		this.cachedConfig = config;
		this.cachedConfigSnapshot = { path: configPath, content };
		return config;
	}

	async saveConfig(config: AgenticWorkspaceConfig): Promise<void> {
		await withConfigPathLock(
			this.resolvedConfigPath,
			"project",
			async () => await this.saveConfigUnderConfigLock(config),
		);
	}

	async saveConfigUnderConfigLock(config: AgenticWorkspaceConfig): Promise<void> {
		const normalizedConfig: AgenticWorkspaceConfig = {
			...config,
			...(this.configSource === "root" ? { agenticWorkspaceDirectory: this.resolvedAgenticWorkspaceDirName } : {}),
		};
		if (this.configSource === "folder") {
			delete normalizedConfig.agenticWorkspaceDirectory;
		}
		const configPath = this.resolvedConfigPath;
		const content = serializeConfig(normalizedConfig);
		let mode = 0o600;
		try {
			mode = (await stat(configPath)).mode & 0o7777;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		await writeAtomically(configPath, content, "Config", mode);
		this.cachedConfig = normalizedConfig;
		this.cachedConfigSnapshot = { path: configPath, content };
	}

	// Utility methods
	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		await mkdir(dirPath, { recursive: true });
	}

	parseConfig(content: string): AgenticWorkspaceConfig {
		return parseConfig(content, this.resolvedConfigPath);
	}
}
