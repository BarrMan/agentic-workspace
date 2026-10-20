import { realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { resolveMainWorktreeRootSync } from "../filesystem/git/main-worktree.ts";
import { type LockAttemptSettings, LockOwner } from "../filesystem/lock-owner.ts";
import type { AgenticWorkspaceConfigSource } from "../filesystem/paths/agentic-workspace-directory.ts";
import {
	normalizeProjectAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectoryFromRootConfig,
} from "../filesystem/paths/agentic-workspace-directory.ts";
import { ProjectLayout } from "../filesystem/project-layout.ts";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES } from "../model/constants.ts";
import { AmbiguousTaskIdError } from "../model/errors/task-id.ts";
import { taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { TaskOrdering } from "../model/task/task-ordering.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import {
	type AgenticWorkspaceConfig,
	type Milestone,
	TASK_DIRECTORY_TYPES,
	type Task,
	type TaskListFilter,
} from "../model/types.ts";
import { isConfigValueError, parseConfig, serializeConfig } from "./config-codec.ts";
import { FrontmatterSchemaError, TaskDependenciesParseError } from "./errors/frontmatter.ts";
import { parseMarkdown, parseTask } from "./markdown/parser.ts";
import { serializeTask } from "./markdown/serializer.ts";
import { MilestoneStore } from "./milestones.ts";
import { TaskArtifactRepository } from "./task-artifact-repository.ts";
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

/** True when an error already explains an unreadable config value, so it needs no extra framing. */
export { isConfigValueError };

const DEFAULT_CREATE_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_CREATE_LOCK_RETRY_DELAY_MS = 100;
const DEFAULT_CREATE_LOCK_STALE_MS = 10_000;
const TASK_DIRECTORY = TASK_DIRECTORY_TYPES[0];

export type ContentMutation =
	| { type: typeof TASK_DIRECTORY; root: string; taskId: string; filePath: string }
	| { type: "artifact"; root: string; taskId: string; path?: string };

export type ContentMutationListener = (mutation: ContentMutation) => void | Promise<void>;

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
	private readonly layout = new ProjectLayout();
	private readonly contentMutationListeners = new Set<ContentMutationListener>();
	get taskParseCacheEpoch() {
		return this.taskRepository.epoch;
	}
	private readonly milestones: MilestoneStore;

	constructor(projectRoot: string, selection?: FileSystemSelection) {
		this.projectRoot = projectRoot;
		this.agenticWorkspaceResolutionRoot = resolveMainWorktreeRootSync(projectRoot) ?? projectRoot;
		const resolution = resolveAgenticWorkspaceDirectory(this.agenticWorkspaceResolutionRoot);
		const agenticWorkspaceDirectory =
			selection?.agenticWorkspaceDirectory ?? resolution.agenticWorkspaceDir ?? DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE;
		const normalizedSelection = normalizeProjectAgenticWorkspaceDirectory(agenticWorkspaceDirectory);
		if (!normalizedSelection) throw new Error("AgenticWorkspace directory must be a project-relative path.");
		this.resolvedAgenticWorkspaceDirName = normalizedSelection;
		this.resolvedAgenticWorkspaceDir = selection
			? join(this.agenticWorkspaceResolutionRoot, normalizedSelection)
			: (resolution.agenticWorkspacePath ??
				join(this.agenticWorkspaceResolutionRoot, DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE));
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
			onMutation: (event) => {
				for (const listener of this.contentMutationListeners) {
					void listener({
						type: "artifact",
						root: this.resolvedAgenticWorkspaceDir,
						taskId: event.taskId,
						path: event.path,
					});
				}
			},
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

	async ensureAgenticWorkspaceStructure(): Promise<void> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		const directories = [
			agenticWorkspaceDir,
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.TASKS),
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.COMPLETED),
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS),
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.MILESTONES),
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES),
		];

		await this.layout.ensureDirectories(directories);
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

	// Uses a maintained lockfile with stale-lock recovery.
	async withCreateLock<T>(fn: () => Promise<T>, options: CreateLockOptions = {}): Promise<T> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		const lockTarget = await this.getCreateLockTarget(agenticWorkspaceDir);
		const timeoutMs = options.timeoutMs ?? DEFAULT_CREATE_LOCK_TIMEOUT_MS;
		const retryDelayMs = options.retryDelayMs ?? DEFAULT_CREATE_LOCK_RETRY_DELAY_MS;
		return await this.withLockTarget(
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

	/**
	 * Per-task counterpart of the create lock, used to serialize a task's read-modify-write.
	 * It fails fast instead of waiting: on contention the caller (human or agent) decides
	 * whether to retry, and nothing is merged or overwritten behind their back.
	 *
	 * The lock target is the task file itself because proper-lockfile keys its in-process
	 * lock registry by target path: a shared target with per-task lockfile paths would
	 * clobber concurrent locks held by one process. Unlike the create lock, the lockfile
	 * lives under this project's AgenticWorkspace directory rather than the shared git common dir:
	 * an edit protects one file, so sibling worktrees editing their own copy of a task must
	 * not fail each other.
	 */
	async withTaskLock<T>(task: Pick<Task, "id" | "filePath">, fn: () => Promise<T>): Promise<T> {
		const filePath = task.filePath?.trim();
		if (!filePath) {
			throw new Error(`Cannot lock task ${task.id} for editing without its file path.`);
		}
		return await this.withEntityFileLock(TASK_DIRECTORY, task.id, filePath, fn);
	}

	/** Counter shape: { "PREFIX": { "next": integer } }; callers hold the create lock. */
	async allocateTaskId(
		prefix: string,
		zeroPadding: number | undefined,
		existingIds: () => Promise<string[]>,
	): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		const lockTarget = await this.getCreateLockTarget(agenticWorkspaceDir);
		const counterPath = join(dirname(lockTarget.locksDir), "task-counter.json");
		await mkdir(dirname(counterPath), { recursive: true });
		let counters: Record<string, { next: number }>;
		try {
			counters = JSON.parse(await readFile(counterPath, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			counters = {};
		}

		const canonicalPrefix = prefix.toUpperCase();
		let next = counters[canonicalPrefix]?.next;
		if (next === undefined || !Number.isSafeInteger(next) || next < 1) {
			let max = 0;
			for (const id of await existingIds()) {
				const canonicalId = taskIdKey(id);
				const prefix = `${canonicalPrefix}-`;
				const suffix = canonicalId.startsWith(prefix) ? canonicalId.slice(prefix.length) : "";
				if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
			}
			next = max + 1;
		}

		for (let attempt = 0; attempt < 10; attempt += 1) {
			const allocated = next++;
			if (!Number.isSafeInteger(next))
				throw new Error(`Task ID counter for ${canonicalPrefix} exceeded the safe integer range.`);
			counters[canonicalPrefix] = { next };
			const temporaryPath = `${counterPath}.${process.pid}.${Date.now()}.tmp`;
			try {
				await writeFile(temporaryPath, JSON.stringify(counters, null, 2), { flag: "wx" });
				await rename(temporaryPath, counterPath);
			} catch (error) {
				await unlink(temporaryPath).catch((cleanupError) => {
					if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
				});
				throw error;
			}
			const number = String(allocated).padStart(zeroPadding && zeroPadding > 0 ? zeroPadding : 0, "0");
			const id = `${canonicalPrefix}-${number}`;
			const occupied = await Promise.all(
				(["tasks", "completed", "archive/tasks"] as const).map(async (location) => {
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

	private async withEntityFileLock<T>(
		scope: typeof TASK_DIRECTORY,
		entityId: string,
		filePath: string,
		fn: () => Promise<T>,
	): Promise<T> {
		const lockKey = sanitizeLockKey(taskIdKey(entityId));
		return await this.withLockTarget(
			filePath,
			join(await this.getAgenticWorkspaceDir(), ".locks", `${scope}-${lockKey}`),
			{ staleMs: DEFAULT_CREATE_LOCK_STALE_MS, retries: 0, retryDelayMs: 0 },
			(error) => this.toTaskLockError(error, entityId),
			fn,
		);
	}

	/**
	 * Hold a stable set of task locks for one operation. The callback runs only after every
	 * lock is acquired, so a contended task cannot leave an earlier write from a bulk operation
	 * on disk. Sorting also keeps multi-task operations from acquiring the same locks in opposite
	 * orders and deadlocking each other.
	 */
	async withTaskLocks<T>(tasks: Array<Pick<Task, "id" | "filePath">>, fn: () => Promise<T>): Promise<T> {
		const uniqueTasks = Array.from(new Map(tasks.map((task) => [taskIdKey(task.id), task])).values()).sort(
			(left, right) => taskIdKey(left.id).localeCompare(taskIdKey(right.id)),
		);

		const acquire = async (index: number): Promise<T> => {
			const task = uniqueTasks[index];
			if (!task) return await fn();
			return await this.withTaskLock(task, async () => await acquire(index + 1));
		};

		return await acquire(0);
	}

	private async withLockTarget<T>(
		targetPath: string,
		lockDir: string,
		settings: LockAttemptSettings,
		toError: (error: unknown) => Error,
		fn: () => Promise<T>,
	): Promise<T> {
		return await this.locks.withTarget(targetPath, lockDir, settings, toError, fn);
	}

	// Task operations
	private async resolveTaskWriteTarget(task: Task): Promise<{ id: string; filename: string; filePath: string }> {
		const id = taskIdKey(task.id);
		const directory = await this.getTasksDir();
		const filename = "task.md";
		const filePath = join(directory, id.toLowerCase(), filename);
		return { id, filename, filePath };
	}

	private async existingTaskAtWritePath(filepath: string): Promise<Task | null> {
		try {
			return parseTask(await Bun.file(filepath).text());
		} catch (error) {
			if (error instanceof TaskDependenciesParseError || error instanceof FrontmatterSchemaError) throw error;
			return null;
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
		if (basename(container) !== taskIdKey(task.id).toLowerCase())
			throw new Error(`Task ${task.id} record/container identity mismatch; refusing operation.`);
		const record = await this.existingTaskAtWritePath(path);
		if (!record || !taskIdsEqual(record.id, task.id))
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
			} catch {}
		}
		return {};
	}

	async saveTask(task: Task, options: { approvalMutation?: boolean; create?: boolean } = {}): Promise<string> {
		const { id: requestedId } = await this.resolveTaskWriteTarget(task);
		const normalizedId = requestedId.toLowerCase();
		const roots = await Promise.all([this.getTasksDir(), this.getCompletedDir(), this.getArchiveTasksDir()]);
		let existingTask: Task | null = null;
		let filepath: string;

		if (typeof task.filePath === "string" && task.filePath.trim()) {
			if (options.create)
				throw new Error(`Task ID ${requestedId} already exists; refusing to merge or reuse its identity.`);
			const resolved = await this.resolveCanonicalExistingRecord(task);
			filepath = resolved.path;
			existingTask = resolved.record;
		} else {
			const existing = await this.loadTask(requestedId, { includeArchived: true });
			if (existing && options.create)
				throw new Error(`Task ID ${requestedId} already exists; refusing to merge or reuse its identity.`);
			if (existing?.filePath) {
				const resolved = await this.resolveCanonicalExistingRecord(existing);
				filepath = resolved.path;
				existingTask = resolved.record;
			} else {
				const container = await this.taskArtifacts.containerPath(normalizedId, "tasks");
				if (resolve(dirname(container)) !== resolve(roots[0]))
					throw new Error(`Task ${requestedId} resolves outside active task storage.`);
				try {
					await stat(container);
					throw new Error(`Task container ${container} already exists; refusing to merge or reuse its task ID.`);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
				filepath = join(container, "task.md");
			}
		}

		if (existingTask && !taskIdsEqual(existingTask.id, task.id))
			throw new Error(`Task identity mismatch: requested ${task.id}, stored record is ${existingTask.id}.`);
		if (!existingTask) {
			const [activeTasks, completedTasks] = await Promise.all([this.listTasks(), this.listCompletedTasks()]);
			const duplicateMatches = [...activeTasks, ...completedTasks].filter((record) =>
				taskIdsEqual(record.id, requestedId),
			);
			if (duplicateMatches.length > 1)
				throw new AmbiguousTaskIdError(
					requestedId,
					duplicateMatches.map((record) => record.filePath ?? record.id),
				);
		}
		const exactParentTaskId = task.parentTaskId;
		const normalizedTask = {
			...task,
			...(!options.approvalMutation && existingTask ? { modeApprovals: existingTask.modeApprovals } : {}),
			id: existingTask?.id ?? requestedId,
			filePath: filepath,
			parentTaskId:
				existingTask?.parentTaskId && task.parentTaskId && taskIdsEqual(existingTask.parentTaskId, task.parentTaskId)
					? existingTask.parentTaskId
					: exactParentTaskId
						? taskIdKey(exactParentTaskId)
						: undefined,
		};
		const content = serializeTask(normalizedTask, await this.retainedTaskFrontmatter(filepath));
		const container = dirname(filepath);
		if (!existingTask) {
			await this.ensureDirectoryExists(dirname(container));
			await mkdir(container);
		}
		const temporaryPath = `${filepath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(temporaryPath, content, { flag: "wx" });
			await rename(temporaryPath, filepath);
		} catch (error) {
			try {
				await unlink(temporaryPath);
			} catch (cleanupError) {
				if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT")
					throw new Error(`Task write failed and temporary-file cleanup failed for ${temporaryPath}.`, {
						cause: new AggregateError([error, cleanupError]),
					});
			}
			throw error;
		}
		await this.publishContentMutation({
			type: TASK_DIRECTORY,
			root: resolve(this.agenticWorkspaceDir),
			taskId: normalizedTask.id,
			filePath: filepath,
		});
		return filepath;
	}

	async loadTask(taskId: string, options: { includeArchived?: boolean } = {}): Promise<Task | null> {
		const canonicalId = taskIdKey(taskId);
		const idDirectory = canonicalId.toLowerCase();
		const directories = await Promise.all([
			this.getTasksDir(),
			this.getCompletedDir(),
			...(options.includeArchived ? [this.getArchiveTasksDir()] : []),
		]);
		const matches: Task[] = [];
		for (const directory of directories) {
			await this.taskRepository.listFiles(directory);
			const filepath = join(directory, idDirectory, "task.md");
			try {
				const parsed = parseTask(await Bun.file(filepath).text());
				if (taskIdsEqual(parsed.id, canonicalId)) matches.push({ ...parsed, filePath: filepath });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
		}
		if (matches.length > 1)
			throw new AmbiguousTaskIdError(
				canonicalId,
				matches.map((task) => task.filePath ?? task.id),
			);
		return matches[0] ?? null;
	}

	async readTaskFiles(directory: string, files: string[], cacheEpoch = this.taskParseCacheEpoch): Promise<Task[]> {
		return await this.taskRepository.readFiles(directory, files, cacheEpoch);
	}

	private async listConfiguredTaskFiles(directory: string): Promise<string[]> {
		return await this.taskRepository.listFiles(directory);
	}

	async listTasks(filter?: TaskListFilter): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		const tasksDir = await this.getTasksDir();
		const taskFiles = await this.listConfiguredTaskFiles(tasksDir);

		let tasks = await this.readTaskFiles(tasksDir, taskFiles, cacheEpoch);

		if (filter) tasks = TaskSearchIndex.apply(tasks, filter);

		return TaskOrdering.byId(tasks);
	}

	async listCompletedTasks(): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		const completedDir = await this.getCompletedDir();
		const taskFiles = await this.listConfiguredTaskFiles(completedDir);

		const tasks = await this.readTaskFiles(completedDir, taskFiles, cacheEpoch);

		return TaskOrdering.byId(tasks);
	}

	async listArchivedTasks(): Promise<Task[]> {
		const archiveTasksDir = await this.getArchiveTasksDir();
		const taskFiles = await this.listConfiguredTaskFiles(archiveTasksDir);

		const tasks = await this.readTaskFiles(archiveTasksDir, taskFiles);

		return TaskOrdering.byId(tasks);
	}

	async archiveTask(taskId: string): Promise<boolean> {
		const task = await this.loadTask(taskId);
		if (!task?.filePath) return false;
		await this.moveTaskContainer(task, await this.getArchiveTasksDir());
		return true;
	}

	async completeTask(taskId: string, alreadyLocked = false): Promise<boolean> {
		const task = await this.loadTask(taskId, { includeArchived: true });
		if (!task?.filePath) return false;
		await this.moveTaskContainer(task, await this.getCompletedDir(), alreadyLocked);
		return true;
	}

	/** Move a canonical task folder with its artifacts and approval sidecar intact. */
	private async resolveTaskContainer(task: Task): Promise<{ path: string; root: string }> {
		const resolved = await this.resolveCanonicalExistingRecord(task);
		return { path: dirname(resolved.path), root: resolved.root };
	}

	async moveTaskContainer(task: Task, destinationDirectory: string, alreadyLocked = false): Promise<string> {
		if (!task.filePath) throw new Error(`Cannot move task ${task.id} without its record path.`);
		const move = async () => {
			const { path: sourceContainer } = await this.resolveTaskContainer(task);
			const destinationRoot = resolve(destinationDirectory);
			const roots = await Promise.all([this.getTasksDir(), this.getCompletedDir(), this.getArchiveTasksDir()]);
			if (!roots.some((root) => resolve(root) === destinationRoot))
				throw new Error(`Task ${task.id} destination is not a canonical task storage root.`);
			const sourcePath = join(sourceContainer, "task.md");
			const targetContainer = join(destinationRoot, basename(sourceContainer));
			if (resolve(sourceContainer) === resolve(targetContainer)) return sourcePath;
			try {
				await stat(targetContainer);
				throw new Error(`Cannot move task ${task.id}: destination container already exists at ${targetContainer}.`);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			await this.ensureDirectoryExists(destinationRoot);
			await rename(sourceContainer, targetContainer);
			this.taskRepository.invalidate();
			const targetPath = join(targetContainer, "task.md");
			await this.publishContentMutation({
				type: TASK_DIRECTORY,
				root: resolve(this.agenticWorkspaceDir),
				taskId: task.id,
				filePath: targetPath,
			});
			return targetPath;
		};
		return alreadyLocked ? await move() : await this.withTaskLock(task, move);
	}

	async deleteTaskContainer(task: Task, alreadyLocked = false): Promise<void> {
		if (!task.filePath) throw new Error(`Cannot delete task ${task.id} without its record path.`);
		const remove = async () => {
			const { path: sourceContainer } = await this.resolveTaskContainer(task);
			const sourcePath = join(sourceContainer, "task.md");
			await rm(sourceContainer, { recursive: true });
			this.taskRepository.invalidate();
			await this.publishContentMutation({
				type: TASK_DIRECTORY,
				root: resolve(this.agenticWorkspaceDir),
				taskId: task.id,
				filePath: sourcePath,
			});
		};
		if (alreadyLocked) await remove();
		else await this.withTaskLock(task, remove);
	}

	subscribeToContentMutations(listener: ContentMutationListener): () => void {
		this.contentMutationListeners.add(listener);
		return () => this.contentMutationListeners.delete(listener);
	}

	private async publishContentMutation(mutation: ContentMutation): Promise<void> {
		for (const listener of this.contentMutationListeners) {
			await listener(mutation);
		}
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

		const configPath = this.resolvedConfigPath;
		let content: string;
		try {
			// Check if file exists first to avoid hanging on Windows
			const file = Bun.file(configPath);
			if (!(await file.exists())) {
				return null;
			}
			content = await file.text();
		} catch (_error) {
			return null;
		}

		// A value AgenticWorkspace cannot read is reported, not swallowed: callers must not silently
		// fall back to defaults while the config file says something else.
		const config = parseConfig(content, this.resolvedConfigPath);
		this.cachedConfig = config;
		this.cachedConfigSnapshot = { path: configPath, content };
		return config;
	}

	async saveConfig(config: AgenticWorkspaceConfig): Promise<void> {
		const normalizedConfig: AgenticWorkspaceConfig = {
			...config,
			...(this.configSource === "root" ? { agenticWorkspaceDirectory: this.resolvedAgenticWorkspaceDirName } : {}),
		};
		if (this.configSource === "folder") {
			delete normalizedConfig.agenticWorkspaceDirectory;
		}
		const configPath = this.resolvedConfigPath;
		const content = serializeConfig(normalizedConfig);
		const temporaryPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
		try {
			let mode = 0o600;
			try {
				mode = (await stat(configPath)).mode & 0o7777;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			await writeFile(temporaryPath, content, { flag: "wx" });
			await chmod(temporaryPath, mode);
			await rename(temporaryPath, configPath);
		} catch (error) {
			try {
				await unlink(temporaryPath);
			} catch (cleanupError) {
				if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT")
					throw new Error(`Config write failed and temporary-file cleanup failed for ${temporaryPath}.`, {
						cause: new AggregateError([error, cleanupError]),
					});
			}
			throw error;
		}
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
