import { realpathSync } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES, DRAFT_STATUS, FALLBACK_STATUS } from "../constants/index.ts";
import { resolveMainWorktreeRootSync } from "../git/main-worktree.ts";
import { FrontmatterSchemaError, parseMarkdown, parseTask, TaskDependenciesParseError } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import {
	type BacklogConfig,
	type Decision,
	type Document,
	type Milestone,
	TASK_DIRECTORY_TYPES,
	type Task,
	type TaskListFilter,
} from "../types/index.ts";
import type { BacklogConfigSource } from "../utils/backlog-directory.ts";
import {
	normalizeProjectBacklogDirectory,
	resolveBacklogDirectory,
	resolveBacklogDirectoryFromRootConfig,
} from "../utils/backlog-directory.ts";
import type { DraftIdentityFindings } from "../utils/duplicate-detection.ts";
import { AmbiguousIdError, isAmbiguousIdError } from "../utils/entity-id.ts";
import {
	DEFAULT_TASK_PREFIX,
	DRAFT_PREFIX,
	extractAnyPrefix,
	generateNextId,
	idForFilename,
	normalizeId,
} from "../utils/prefix-config.ts";
import { canonicalTaskId } from "../utils/task-id.ts";
import { withoutVacatedTaskLinks } from "../utils/task-links.ts";
import {
	AmbiguousTaskIdError,
	draftIdsMatchLoosely,
	extractDraftIdFromFilename,
	extractTaskIdFromFilename,
	findDuplicateDraftFilenameGroups,
	getTaskPath,
	isAmbiguousTaskIdError,
	normalizeTaskIdentity,
	taskIdsEqual,
} from "../utils/task-path.ts";
import { applyTaskFilters } from "../utils/task-search.ts";
import { sortByTaskId } from "../utils/task-sorting.ts";
import { isConfigValueError, parseConfig, serializeConfig } from "./config.ts";
import { ContentRepository } from "./content-repository.ts";
import { type LockAttemptSettings, LockOwner } from "./lock-owner.ts";
import { MilestoneStore } from "./milestones.ts";
import { ProjectLayout } from "./project-layout.ts";
import { TaskArtifactRepository } from "./task-artifact-repository.ts";
import { TaskRepository } from "./task-repository.ts";

// Interface for task path resolution context
interface TaskPathContext {
	filesystem: {
		tasksDir: string;
		completedDir?: string;
	};
}

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
interface ParsedTaskFile {
	content: string;
	task: Task;
}

const TASK_DIRECTORY = TASK_DIRECTORY_TYPES[0];
const DRAFT_DIRECTORY = TASK_DIRECTORY_TYPES[1];
const DRAFT_STATUS_KEY = DRAFT_STATUS.toLowerCase();

export type ContentMutation =
	| { type: typeof TASK_DIRECTORY; root: string; taskId: string; filePath: string }
	| { type: "artifact"; root: string; taskId: string; path?: string }
	| { type: "document"; root: string; documentId: string }
	| { type: "decision"; root: string; decisionId: string };

export type ContentMutationListener = (mutation: ContentMutation) => void | Promise<void>;

export type FileSystemSelection = {
	backlogDirectory: string;
	configLocation: BacklogConfigSource;
};

const CREATE_LOCK_ERROR_CODE = "ECREATELOCK";
export const CREATE_LOCK_ERROR_MESSAGE =
	"Another task create/promote/demote operation is already in progress. Please try again.";

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

export function isCreateLockError(error: unknown): error is Error {
	return isLockError(error, CREATE_LOCK_ERROR_NAME, CREATE_LOCK_ERROR_CODE);
}

export function isTaskLockError(error: unknown): error is Error {
	return isLockError(error, TASK_LOCK_ERROR_NAME, TASK_LOCK_ERROR_CODE);
}

/** Raises the shared fail-fast lock failure for contention detected outside an acquisition. */
export function newTaskLockError(taskId: string): Error {
	return taskLockError(taskLockErrorMessage(taskId));
}

export function taskLockErrorMessage(taskId: string): string {
	return `Edit failed: ${taskId} is being modified by another process; retry if appropriate.`;
}

/**
 * The only handle through which a draft may be read or mutated: the exact file plus the id
 * derived from that file's name. Nothing may re-resolve a draft id to a different path.
 */
export interface DraftFileReference {
	filePath: string;
	canonicalId: string;
}

export class DraftParseError extends Error {
	constructor(filename: string) {
		super(`Draft file ${filename} could not be parsed. Repair or remove the file, then rerun the edit.`);
		this.name = "DraftParseError";
	}
}

export class DraftIdentityError extends Error {
	constructor(filename: string, frontmatterId: string, filenameId: string | null) {
		super(
			`Draft file ${filename} declares frontmatter id ${frontmatterId}, which does not match its filename id ${filenameId ?? "(unreadable)"}. Fix the frontmatter id or rename the file so they agree, then rerun the edit.`,
		);
		this.name = "DraftIdentityError";
	}
}

class UnsupportedFlatDraftRecordError extends Error {}

export class FileSystem {
	private resolvedBacklogDir: string;
	private resolvedBacklogDirName: string;
	private resolvedConfigPath: string;
	private configSource: BacklogConfigSource;
	private resolutionFrozen = false;
	private readonly projectRoot: string;
	private readonly backlogResolutionRoot: string;
	private cachedConfig: BacklogConfig | null = null;
	private cachedConfigSnapshot: { path: string; content: string } | null = null;
	private readonly taskRepository: TaskRepository;
	private readonly contentRepository: ContentRepository;
	private readonly locks = new LockOwner();
	private readonly layout = new ProjectLayout();
	private readonly contentMutationListeners = new Set<ContentMutationListener>();
	// Retained as private compatibility seams for focused cache tests; repository owns the state.
	readonly parsedTaskFiles: Map<string, ParsedTaskFile>;
	readonly taskFileReadGenerations: Map<string, number>;
	get taskParseCacheEpoch() {
		return this.taskRepository.epoch;
	}
	private readonly milestones: MilestoneStore;

	constructor(projectRoot: string, selection?: FileSystemSelection) {
		this.projectRoot = projectRoot;
		this.backlogResolutionRoot = resolveMainWorktreeRootSync(projectRoot) ?? projectRoot;
		const resolution = resolveBacklogDirectory(this.backlogResolutionRoot);
		const backlogDirectory = selection?.backlogDirectory ?? resolution.backlogDir ?? DEFAULT_DIRECTORIES.BACKLOG;
		const normalizedSelection = normalizeProjectBacklogDirectory(backlogDirectory);
		if (!normalizedSelection) throw new Error("Backlog directory must be a project-relative path.");
		this.resolvedBacklogDirName = normalizedSelection;
		this.resolvedBacklogDir = selection
			? join(this.backlogResolutionRoot, normalizedSelection)
			: (resolution.backlogPath ?? join(this.backlogResolutionRoot, DEFAULT_DIRECTORIES.BACKLOG));
		this.configSource = selection?.configLocation ?? resolution.configSource ?? "folder";
		this.resolvedConfigPath =
			this.configSource === "root"
				? join(this.backlogResolutionRoot, DEFAULT_FILES.ROOT_CONFIG)
				: selection
					? join(this.resolvedBacklogDir, DEFAULT_FILES.CONFIG)
					: (resolution.configPath ?? join(this.resolvedBacklogDir, DEFAULT_FILES.CONFIG));
		this.taskRepository = new TaskRepository();
		this.parsedTaskFiles = this.taskRepository.parsedFiles;
		this.taskFileReadGenerations = this.taskRepository.fileReadGenerations;
		this.contentRepository = new ContentRepository({
			decisionsDirectory: async () => await this.getDecisionsDir(),
			documentsDirectory: async () => await this.getDocsDir(),
			ensureDirectory: async (directory) => await this.ensureDirectoryExists(directory),
			withCreateLock: (operation) => this.withCreateLock(operation),
		});
		this.milestones = new MilestoneStore({
			activeDirectory: () => this.getMilestonesDir(),
			archiveDirectory: () => this.getArchiveMilestonesDir(),
			ensureDirectory: (directory) => this.ensureDirectoryExists(directory),
			withCreateLock: (operation) => this.withCreateLock(operation),
		});
	}

	private async getBacklogDir(): Promise<string> {
		return this.resolvedBacklogDir;
	}

	// Public accessors for directory paths
	get backlogDir(): string {
		return this.resolvedBacklogDir;
	}
	get backlogDirName(): string {
		return this.resolvedBacklogDirName;
	}
	get tasksDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.TASKS);
	}
	get completedDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.COMPLETED);
	}

	get archiveTasksDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS);
	}
	get archiveMilestonesDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES);
	}
	get decisionsDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.DECISIONS);
	}

	get docsDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.DOCS);
	}

	get milestonesDir(): string {
		return join(this.resolvedBacklogDir, DEFAULT_DIRECTORIES.MILESTONES);
	}

	get configFilePath(): string {
		return this.resolvedConfigPath;
	}

	/** Filesystem service for task-relative files; task records remain managed by this FileSystem. */
	get taskArtifacts(): TaskArtifactRepository {
		return new TaskArtifactRepository({
			backlogDirectory: this.resolvedBacklogDir,
			projectRoot: this.backlogResolutionRoot,
			onMutation: (event) => {
				for (const listener of this.contentMutationListeners) {
					void listener({ type: "artifact", root: this.resolvedBacklogDir, taskId: event.taskId, path: event.path });
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
		this.resolvedBacklogDir = canonical(this.resolvedBacklogDir);
		this.resolvedConfigPath = canonical(this.resolvedConfigPath);
		this.resolutionFrozen = true;
	}

	getCachedConfigContent(sourceConfigPath: string): string | null {
		return this.cachedConfigSnapshot && resolve(this.cachedConfigSnapshot.path) === resolve(sourceConfigPath)
			? this.cachedConfigSnapshot.content
			: null;
	}

	publishConfig(config: BacklogConfig, sourceConfigPath: string, content: string): boolean {
		const rootConfigPath = join(this.backlogResolutionRoot, DEFAULT_FILES.ROOT_CONFIG);
		if (resolve(sourceConfigPath) === resolve(rootConfigPath)) {
			if (config.backlogDirectory !== undefined && normalizeProjectBacklogDirectory(config.backlogDirectory) === null) {
				return false;
			}
			const resolution = resolveBacklogDirectoryFromRootConfig(this.backlogResolutionRoot, config.backlogDirectory);
			if (!resolution.backlogDir || !resolution.backlogPath || resolution.configSource !== "root") {
				return false;
			}
			if (!this.resolutionFrozen) this.applyConfigResolution(resolution);
		}
		this.cachedConfig = config;
		this.cachedConfigSnapshot = { path: sourceConfigPath, content };
		return true;
	}

	private refreshConfigResolution(): void {
		this.applyConfigResolution(resolveBacklogDirectory(this.backlogResolutionRoot));
	}

	private applyConfigResolution(resolution: ReturnType<typeof resolveBacklogDirectory>): void {
		const backlogDirName = resolution.backlogDir ?? DEFAULT_DIRECTORIES.BACKLOG;
		const backlogDir = resolution.backlogPath ?? join(this.projectRoot, DEFAULT_DIRECTORIES.BACKLOG);
		if (resolve(backlogDir) !== resolve(this.resolvedBacklogDir)) {
			this.invalidateTaskParseCache();
		}
		this.resolvedBacklogDirName = backlogDirName;
		this.resolvedBacklogDir = backlogDir;
		this.resolvedConfigPath = resolution.configPath ?? join(this.resolvedBacklogDir, DEFAULT_FILES.CONFIG);
		this.configSource = resolution.configSource ?? "folder";
	}

	private invalidateTaskParseCache(): void {
		this.taskRepository.invalidate();
	}

	resolveBacklogDirectoryInfo() {
		if (this.resolutionFrozen)
			return {
				projectRoot: this.projectRoot,
				backlogDir: this.resolvedBacklogDirName,
				backlogPath: this.resolvedBacklogDir,
				source: null,
				configPath: this.resolvedConfigPath,
				configSource: this.configSource,
				rootConfigPath: join(this.backlogResolutionRoot, DEFAULT_FILES.ROOT_CONFIG),
				rootConfigExists: this.configSource === "root",
			};
		return resolveBacklogDirectory(this.backlogResolutionRoot);
	}

	private async getTasksDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.TASKS);
	}

	async getDraftsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.DRAFTS);
	}

	async getArchiveTasksDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS);
	}

	private async getArchiveMilestonesDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES);
	}

	private async getArchiveDraftsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_DRAFTS);
	}

	private async getDecisionsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.DECISIONS);
	}

	private async getDocsDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.DOCS);
	}

	private async getMilestonesDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.MILESTONES);
	}

	private async getCompletedDir(): Promise<string> {
		const backlogDir = await this.getBacklogDir();
		return join(backlogDir, DEFAULT_DIRECTORIES.COMPLETED);
	}

	async ensureBacklogStructure(): Promise<void> {
		const backlogDir = await this.getBacklogDir();
		const directories = [
			backlogDir,
			join(backlogDir, DEFAULT_DIRECTORIES.TASKS),
			join(backlogDir, DEFAULT_DIRECTORIES.DRAFTS),
			join(backlogDir, DEFAULT_DIRECTORIES.COMPLETED),
			join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS),
			join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_DRAFTS),
			join(backlogDir, DEFAULT_DIRECTORIES.MILESTONES),
			join(backlogDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES),
			join(backlogDir, DEFAULT_DIRECTORIES.DOCS),
			join(backlogDir, DEFAULT_DIRECTORIES.DECISIONS),
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
			// If config cannot be read, still try git and fall back to the backlog directory on failure.
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

	private async getCreateLockTarget(backlogDir: string): Promise<CreateLockTarget> {
		const commonGitDir = await this.getGitCommonDir();
		if (commonGitDir) {
			return {
				targetPath: commonGitDir,
				locksDir: join(commonGitDir, "backlog.md", "locks"),
			};
		}

		return {
			targetPath: backlogDir,
			locksDir: join(backlogDir, ".locks"),
		};
	}

	// Uses a maintained lockfile with stale-lock recovery; USE_GLOBAL_TASK_ID_LOCK=false restores legacy behavior.
	async withCreateLock<T>(fn: () => Promise<T>, options: CreateLockOptions = {}): Promise<T> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false") {
			return await fn();
		}

		const backlogDir = await this.getBacklogDir();
		const lockTarget = await this.getCreateLockTarget(backlogDir);
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
	 * lives under this project's backlog directory rather than the shared git common dir:
	 * an edit protects one file, so sibling worktrees editing their own copy of a task must
	 * not fail each other. USE_GLOBAL_TASK_ID_LOCK=false bypasses it like the create lock.
	 */
	async withTaskLock<T>(task: Pick<Task, "id" | "filePath">, fn: () => Promise<T>): Promise<T> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false") {
			return await fn();
		}

		const filePath = task.filePath?.trim();
		if (!filePath) {
			throw new Error(`Cannot lock task ${task.id} for editing without its file path.`);
		}
		return await this.withEntityFileLock(TASK_DIRECTORY, task.id, filePath, fn);
	}

	/**
	 * Draft counterpart of the per-task lock. The lock key is namespaced by store so a project
	 * whose task prefix is "draft" does not make an unrelated task contend with its draft twin,
	 * while two editors of the same draft file still fail fast against each other.
	 */
	async withDraftLock<T>(reference: DraftFileReference, fn: () => Promise<T>): Promise<T> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false") {
			return await fn();
		}
		const normalizedId = reference.canonicalId.trim().toLowerCase();
		const identityKey = normalizedId
			.split(".")
			.map((segment) => {
				const idMatch = segment.match(/^(.*?)(\d+)$/);
				if (!idMatch) {
					return segment;
				}
				const numericPart = idMatch[2]!;
				return `${idMatch[1]!}${Number.parseInt(numericPart, 10)}`;
			})
			.join(".");
		const lockKey = identityKey.replace(/[^a-z0-9._-]+/g, "-").replace(/^\.+/, "") || "unknown";
		const locksDir = join(await this.getBacklogDir(), ".locks");
		const targetPath = join(locksDir, `${DRAFT_DIRECTORY}-${lockKey}`);
		await mkdir(targetPath, { recursive: true });
		return await this.withLockTarget(
			targetPath,
			join(locksDir, `${DRAFT_DIRECTORY}-${lockKey}.lock`),
			{ staleMs: DEFAULT_CREATE_LOCK_STALE_MS, retries: 0, retryDelayMs: 0 },
			(error) => this.toTaskLockError(error, reference.canonicalId),
			fn,
		);
	}

	private async withEntityFileLock<T>(
		scope: typeof TASK_DIRECTORY | typeof DRAFT_DIRECTORY,
		entityId: string,
		filePath: string,
		fn: () => Promise<T>,
	): Promise<T> {
		const lockKey = entityId
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^\.+/, "");
		return await this.withLockTarget(
			filePath,
			join(await this.getBacklogDir(), ".locks", `${scope}-${lockKey || "unknown"}`),
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
		const uniqueTasks = Array.from(new Map(tasks.map((task) => [task.id.trim().toLowerCase(), task])).values()).sort(
			(left, right) => left.id.localeCompare(right.id),
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
	private async resolveTaskWriteTarget(
		task: Task,
		isDraft = false,
	): Promise<{ id: string; filename: string; filePath: string }> {
		let prefix = isDraft ? DRAFT_PREFIX : extractAnyPrefix(task.id);
		if (!prefix) prefix = (await this.loadConfig())?.prefixes?.task ?? DEFAULT_TASK_PREFIX;
		const id = normalizeId(task.id, prefix);
		const filename = `${idForFilename(id)} - ${this.sanitizeFilename(task.title)}.md`;
		const directory = isDraft ? await this.getDraftsDir() : await this.getTasksDir();
		const preservesPath = !isDraft && typeof task.filePath === "string" && task.filePath.trim().length > 0;
		return { id, filename, filePath: preservesPath ? (task.filePath as string) : join(directory, filename) };
	}

	async getTaskWritePath(task: Task, isDraft = false): Promise<string> {
		return (await this.resolveTaskWriteTarget(task, isDraft)).filePath;
	}

	private async existingTaskAtWritePath(filepath: string, preservesPath: boolean): Promise<Task | null> {
		if (!preservesPath) return null;
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
		if (basename(path) !== "task.md")
			throw new Error(
				`Task ${task.id} uses an unsupported flat layout. Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3.`,
			);
		const roots = await Promise.all([this.getTasksDir(), this.getCompletedDir(), this.getArchiveTasksDir()]);
		const root = roots.find((candidate) => resolve(dirname(container)) === resolve(candidate));
		if (!root) throw new Error(`Task ${task.id} has a non-canonical storage path; refusing operation.`);
		const prefix = extractAnyPrefix(task.id) ?? DEFAULT_TASK_PREFIX;
		if (basename(container).toLowerCase() !== normalizeId(task.id, prefix).toLowerCase())
			throw new Error(`Task ${task.id} record/container identity mismatch; refusing operation.`);
		const record = await this.existingTaskAtWritePath(path, true);
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

	async saveTask(task: Task): Promise<string> {
		const { id: requestedId } = await this.resolveTaskWriteTarget(task);
		const prefix = extractAnyPrefix(requestedId) ?? DEFAULT_TASK_PREFIX;
		const normalizedId = normalizeId(requestedId, prefix).toLowerCase();
		const roots = await Promise.all([this.getTasksDir(), this.getCompletedDir(), this.getArchiveTasksDir()]);
		let existingTask: Task | null = null;
		let filepath: string;

		if (typeof task.filePath === "string" && task.filePath.trim()) {
			const resolved = await this.resolveCanonicalExistingRecord(task);
			filepath = resolved.path;
			existingTask = resolved.record;
		} else {
			const [active, completed, archived] = await Promise.all([
				this.listTasks(),
				this.listCompletedTasks(),
				this.listArchivedTasks(),
			]);
			const matches = [...active, ...completed, ...archived].filter((candidate) =>
				taskIdsEqual(candidate.id, requestedId),
			);
			if (matches.length > 1)
				throw new AmbiguousTaskIdError(
					requestedId,
					matches.map((candidate) => candidate.filePath ?? candidate.id),
				);
			existingTask = matches[0] ?? null;
			if (existingTask?.filePath) {
				const resolved = await this.resolveCanonicalExistingRecord(existingTask);
				filepath = resolved.path;
				existingTask = resolved.record;
			} else {
				const activeRoot = resolve(roots[0]);
				const container = await this.taskArtifacts.containerPath(normalizedId, "tasks");
				if (resolve(dirname(container)) !== activeRoot)
					throw new Error(`Task ${requestedId} resolves outside active task storage.`);
				let exists = false;
				try {
					exists = (await stat(container)).isDirectory();
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
				if (exists)
					throw new Error(`Task container ${container} already exists; refusing to merge or reuse its task ID.`);
				filepath = join(container, "task.md");
			}
		}

		if (existingTask && !taskIdsEqual(existingTask.id, task.id))
			throw new Error(`Task identity mismatch: requested ${task.id}, stored record is ${existingTask.id}.`);
		const normalizedParentTaskId = task.parentTaskId
			? normalizeId(task.parentTaskId, extractAnyPrefix(task.parentTaskId) ?? prefix)
			: undefined;
		const normalizedTask = {
			...task,
			id: existingTask?.id ?? requestedId,
			filePath: filepath,
			parentTaskId:
				existingTask?.parentTaskId && task.parentTaskId && taskIdsEqual(existingTask.parentTaskId, task.parentTaskId)
					? existingTask.parentTaskId
					: normalizedParentTaskId,
		};
		const content = serializeTask(normalizedTask, await this.retainedTaskFrontmatter(filepath));
		const container = dirname(filepath);
		if (!existingTask) {
			await this.ensureDirectoryExists(dirname(container));
			await mkdir(container);
		}
		await Bun.write(filepath, content);
		await this.publishContentMutation({
			type: TASK_DIRECTORY,
			root: resolve(this.backlogDir),
			taskId: normalizedTask.id,
			filePath: filepath,
		});
		return filepath;
	}

	async loadTask(taskId: string, options: { includeArchived?: boolean } = {}): Promise<Task | null> {
		const tasksDir = await this.getTasksDir();
		const [activeTasks, completedTasks, archivedTasks] = await Promise.all([
			this.listTasks(),
			this.listCompletedTasks(),
			options.includeArchived ? this.listArchivedTasks() : Promise.resolve([]),
		]);
		const identityMatches = [...activeTasks, ...completedTasks, ...archivedTasks].filter((task) =>
			taskIdsEqual(taskId, task.id),
		);
		if (identityMatches.length > 1) {
			throw new AmbiguousTaskIdError(
				taskId,
				identityMatches.map((task) => task.filePath ?? task.id),
			);
		}
		const activeMatch = activeTasks.find((task) => taskIdsEqual(taskId, task.id));
		if (activeMatch?.filePath) return activeMatch;
		const archivedMatch = archivedTasks.find((task) => taskIdsEqual(taskId, task.id));
		if (archivedMatch?.filePath) return archivedMatch;
		if (identityMatches.length === 1) return null;

		const core = { filesystem: { tasksDir, completedDir: this.completedDir } };
		const filepath = await getTaskPath(taskId, core as TaskPathContext);

		if (!filepath) return null;

		const content = await Bun.file(filepath).text();
		const task = normalizeTaskIdentity(parseTask(content));
		return { ...task, filePath: filepath };
	}

	async readParsedTaskFile(filepath: string, cacheEpoch = this.taskParseCacheEpoch): Promise<Task> {
		return await this.taskRepository.readParsedFile(filepath, cacheEpoch);
	}

	async readTaskFiles(
		directory: string,
		files: string[],
		options: { normalizeIdentity: boolean; debugLabel: string },
		cacheEpoch = this.taskParseCacheEpoch,
	): Promise<Task[]> {
		return await this.taskRepository.readFiles(directory, files, options, cacheEpoch);
	}

	private async listConfiguredTaskFiles(directory: string): Promise<string[]> {
		return await this.taskRepository.listFiles(directory);
	}

	async listTasks(filter?: TaskListFilter): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		const tasksDir = await this.getTasksDir();
		const taskFiles = await this.listConfiguredTaskFiles(tasksDir);

		let tasks = await this.readTaskFiles(
			tasksDir,
			taskFiles,
			{
				normalizeIdentity: true,
				debugLabel: "task file",
			},
			cacheEpoch,
		);

		if (filter) tasks = applyTaskFilters(tasks, filter);

		return sortByTaskId(tasks);
	}

	async listCompletedTasks(): Promise<Task[]> {
		const cacheEpoch = this.taskParseCacheEpoch;
		const completedDir = await this.getCompletedDir();
		const taskFiles = await this.listConfiguredTaskFiles(completedDir);

		const tasks = await this.readTaskFiles(
			completedDir,
			taskFiles,
			{
				normalizeIdentity: false,
				debugLabel: "completed task file",
			},
			cacheEpoch,
		);

		return sortByTaskId(tasks);
	}

	async listArchivedTasks(): Promise<Task[]> {
		const archiveTasksDir = await this.getArchiveTasksDir();
		const taskFiles = await this.listConfiguredTaskFiles(archiveTasksDir);

		const tasks = await this.readTaskFiles(archiveTasksDir, taskFiles, {
			normalizeIdentity: false,
			debugLabel: "archived task file",
		});

		return sortByTaskId(tasks);
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
				root: resolve(this.backlogDir),
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
				root: resolve(this.backlogDir),
				taskId: task.id,
				filePath: sourcePath,
			});
		};
		if (alreadyLocked) await remove();
		else await this.withTaskLock(task, remove);
	}

	async archiveDraft(draftId: string): Promise<{ sourcePath: string; targetPath: string } | null> {
		const sourcePath = await this.resolveDraftFilePath(draftId);
		if (!sourcePath) return null;
		const isContainerRecord = basename(sourcePath) === "task.md";
		const canonicalId = extractDraftIdFromFilename(
			isContainerRecord ? basename(dirname(sourcePath)) : basename(sourcePath),
		);
		if (!canonicalId) return null;
		const sourceContainer = isContainerRecord ? dirname(sourcePath) : undefined;
		if (!sourceContainer || basename(sourceContainer).toLowerCase() !== canonicalId.toLowerCase())
			throw new Error(
				`Draft ${canonicalId} uses an unsupported flat layout. Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3 before archiving it.`,
			);
		const archiveDraftsDir = await this.getArchiveDraftsDir();
		const targetContainer = await this.taskArtifacts.containerPath(canonicalId.toLowerCase(), "archive/drafts");

		return await this.withDraftLock({ filePath: sourcePath, canonicalId }, async () => {
			try {
				await stat(targetContainer);
				throw new Error(`Archived draft container ${targetContainer} already exists; refusing to merge artifacts.`);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			await this.ensureDirectoryExists(archiveDraftsDir);
			await rename(sourceContainer, targetContainer);
			return { sourcePath, targetPath: join(targetContainer, "task.md") };
		});
	}

	/**
	 * Parses one exact draft file path without identity validation; whole-file operations
	 * (archive/promote) are bound by filename and must tolerate frontmatter drift.
	 */
	async loadDraftFromFile(filePath: string): Promise<Task | null> {
		try {
			const task = normalizeTaskIdentity(parseTask(await Bun.file(filePath).text()));
			return { ...task, filePath };
		} catch {
			return null;
		}
	}

	async promoteDraft(draftId: string, validateAllocatedTask?: (task: Task) => Promise<void>): Promise<boolean> {
		const sourcePath = await this.resolveDraftFilePath(draftId);
		if (!sourcePath) return false;

		let validationError: unknown;
		try {
			return await this.withCreateLock(async () => {
				const draft = await this.loadDraftFromFile(sourcePath);
				if (!draft) return false;
				const sourceContainer = basename(sourcePath) === "task.md" ? dirname(sourcePath) : undefined;
				if (!sourceContainer || basename(sourceContainer).toLowerCase() !== draft.id.toLowerCase())
					throw new Error(
						`Draft ${draft.id} uses an unsupported flat layout. Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3 before promoting it.`,
					);

				const config = await this.loadConfig();
				const taskPrefix = config?.prefixes?.task ?? DEFAULT_TASK_PREFIX;
				const [existingTasks, completedTasks, archivedTasks, drafts, occupiedDraftFileIds] = await Promise.all([
					this.listTasks(),
					this.listCompletedTasks(),
					this.listArchivedTasks(),
					this.listDrafts(),
					this.listOccupiedDraftFileIds(),
				]);
				const occupiedIds = [...existingTasks, ...completedTasks, ...archivedTasks, ...drafts]
					.map((task) => task.id)
					.concat(occupiedDraftFileIds);
				const canonicalOccupiedIds = [
					...new Map(occupiedIds.map((id) => [canonicalTaskId(id, taskPrefix), id])).values(),
				];
				const newTaskId = generateNextId(canonicalOccupiedIds, taskPrefix, config?.zeroPaddedIds);
				const targetContainer = await this.taskArtifacts.containerPath(newTaskId.toLowerCase(), "tasks");
				try {
					await stat(targetContainer);
					throw new Error(`Task container ${targetContainer} already exists; refusing to merge draft artifacts.`);
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
				const promotedTask: Task = {
					...draft,
					id: newTaskId,
					status:
						!draft.status || draft.status.trim().toLowerCase() === DRAFT_STATUS_KEY
							? config?.defaultStatus || FALLBACK_STATUS
							: draft.status,
					filePath: join(targetContainer, "task.md"),
				};
				if (validateAllocatedTask) {
					try {
						await validateAllocatedTask(promotedTask);
					} catch (error) {
						validationError = error;
						throw error;
					}
				}
				const content = serializeTask(promotedTask, await this.retainedTaskFrontmatter(sourcePath, sourcePath));
				await this.ensureDirectoryExists(dirname(targetContainer));
				await rename(sourceContainer, targetContainer);
				try {
					await Bun.write(promotedTask.filePath as string, content);
				} catch (error) {
					await rename(targetContainer, sourceContainer);
					throw error;
				}
				this.taskRepository.invalidate();
				await this.publishContentMutation({
					type: TASK_DIRECTORY,
					root: resolve(this.backlogDir),
					taskId: promotedTask.id,
					filePath: promotedTask.filePath as string,
				});
				return true;
			});
		} catch (error) {
			if (error === validationError) throw error;
			if (isCreateLockError(error) || isAmbiguousTaskIdError(error)) throw error;
			return false;
		}
	}

	async demoteTask(
		taskId: string,
		onMoved?: (fromPath: string, toPath: string) => void,
		validateAllocatedDraft?: (draft: Task) => Promise<void>,
	): Promise<boolean> {
		return await this.withCreateLock(async () => {
			const task = await this.loadTask(taskId);
			if (!task?.filePath) return false;
			const sourcePath = resolve(task.filePath);
			const sourceContainer = basename(sourcePath) === "task.md" ? dirname(sourcePath) : undefined;
			if (!sourceContainer || basename(sourceContainer).toLowerCase() !== task.id.toLowerCase())
				throw new Error(
					`Task ${task.id} uses an unsupported flat layout. Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3 before demoting it.`,
				);
			const existingDrafts = await this.listDrafts();
			const occupiedFileIds = await this.listOccupiedDraftFileIds();
			const config = await this.loadConfig();
			const newDraftId = generateNextId(
				[...existingDrafts.map((draft) => draft.id), ...occupiedFileIds],
				DRAFT_PREFIX,
				config?.zeroPaddedIds,
			);
			const targetContainer = await this.taskArtifacts.containerPath(newDraftId.toLowerCase(), "drafts");
			try {
				await stat(targetContainer);
				throw new Error(`Draft container ${targetContainer} already exists; refusing to merge task artifacts.`);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			const sourceTask = await this.existingTaskAtWritePath(sourcePath, true);
			if (!sourceTask || !taskIdsEqual(sourceTask.id, task.id))
				throw new Error(`Task ${task.id} changed identity before it could be demoted.`);
			const demotedDraft: Task = {
				...(withoutVacatedTaskLinks(task, task.id) ?? task),
				id: newDraftId,
				filePath: join(targetContainer, "task.md"),
			};
			await validateAllocatedDraft?.(demotedDraft);
			const content = serializeTask(demotedDraft, await this.retainedTaskFrontmatter(sourcePath, sourcePath));
			await this.ensureDirectoryExists(dirname(targetContainer));
			await rename(sourceContainer, targetContainer);
			try {
				await Bun.write(demotedDraft.filePath as string, content);
			} catch (error) {
				await rename(targetContainer, sourceContainer);
				throw error;
			}
			this.taskRepository.invalidate();
			const toPath = demotedDraft.filePath as string;
			onMoved?.(sourcePath, toPath);
			await this.publishContentMutation({
				type: TASK_DIRECTORY,
				root: resolve(this.backlogDir),
				taskId: demotedDraft.id,
				filePath: toPath,
			});
			return true;
		});
	}

	// Draft operations
	private async listDraftFiles(draftsDir: string): Promise<string[]> {
		const entries = await readdir(draftsDir, { withFileTypes: true });
		return entries
			.map((entry) => {
				if (entry.isFile() && entry.name.endsWith(".md"))
					throw new UnsupportedFlatDraftRecordError(
						`Unsupported flat draft record ${join(draftsDir, entry.name)}. Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3.`,
					);
				return entry.isDirectory() ? join(entry.name, "task.md") : null;
			})
			.filter((file): file is string => file !== null)
			.sort();
	}

	private async readDraftFile(filepath: string): Promise<Task> {
		return { ...normalizeTaskIdentity(parseTask(await Bun.file(filepath).text())), filePath: filepath };
	}

	async saveDraft(task: Task): Promise<string> {
		const { id: draftId } = await this.resolveTaskWriteTarget(task, true);
		const canonicalId = normalizeId(draftId, DRAFT_PREFIX).toLowerCase();
		const container = await this.taskArtifacts.containerPath(canonicalId, "drafts");
		const filepath = join(container, "task.md");
		const sourcePath = typeof task.filePath === "string" ? resolve(task.filePath) : undefined;
		const sourceContainer = sourcePath && basename(sourcePath) === "task.md" ? dirname(sourcePath) : undefined;
		const isExistingContainer = sourceContainer === container;

		if (sourcePath && !isExistingContainer && sourcePath !== filepath) {
			throw new Error(
				`Draft ${task.id} uses an unsupported flat layout. Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3 before saving it.`,
			);
		}
		if (sourcePath && isExistingContainer) {
			const existing = await this.loadDraftFromFile(filepath);
			if (!existing || !draftIdsMatchLoosely(existing.id, canonicalId))
				throw new Error(`Draft container identity mismatch for ${task.id}; refusing to overwrite it.`);
		} else {
			try {
				await stat(container);
				throw new Error(`Draft container ${container} already exists; refusing to merge or reuse its identity.`);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			const existingDrafts = await this.listDrafts();
			if (existingDrafts.some((draft) => draftIdsMatchLoosely(draft.id, canonicalId)))
				throw new Error(
					`Draft ID ${canonicalId} is already in use; refusing to reuse its identity or merge artifacts.`,
				);
		}

		const normalizedTask = { ...task, id: canonicalId, filePath: filepath };
		const content = serializeTask(
			normalizedTask,
			await this.retainedTaskFrontmatter(sourcePath, isExistingContainer ? filepath : undefined),
		);
		if (!isExistingContainer) {
			await this.ensureDirectoryExists(dirname(container));
			await mkdir(container, { recursive: false });
		}
		await Bun.write(filepath, content);
		return filepath;
	}

	async loadDraft(draftId: string): Promise<Task | null> {
		try {
			const filePath = await this.resolveDraftFilePath(draftId);
			if (!filePath) return null;
			return await this.loadDraftFromFile(filePath);
		} catch (error) {
			if (isAmbiguousIdError(error) || error instanceof UnsupportedFlatDraftRecordError) throw error;
			return null;
		}
	}

	async listDrafts(): Promise<Task[]> {
		try {
			const draftsDir = await this.getDraftsDir();
			const taskFiles = await this.listDraftFiles(draftsDir);

			const tasks: Task[] = [];
			for (const file of taskFiles) {
				tasks.push(await this.readDraftFile(join(draftsDir, file)));
			}

			return sortByTaskId(tasks);
		} catch (error) {
			if (error instanceof UnsupportedFlatDraftRecordError) throw error;
			return [];
		}
	}

	/**
	 * Lists drafts while skipping individual files that fail to parse, so one damaged
	 * file cannot hide the healthy drafts from interactive selection.
	 */
	async listHealthyDrafts(): Promise<Task[]> {
		try {
			const draftsDir = await this.getDraftsDir();
			const taskFiles = (await this.listDraftFiles(draftsDir)).sort();

			const tasks: Task[] = [];
			for (const file of taskFiles) {
				try {
					tasks.push(await this.readDraftFile(join(draftsDir, file)));
				} catch {}
			}

			return sortByTaskId(tasks);
		} catch (error) {
			if (error instanceof UnsupportedFlatDraftRecordError) throw error;
			return [];
		}
	}

	/**
	 * The single validation authority for one draft file: parse it and require its frontmatter
	 * id to agree with its filename under the loose matching rules. Throws with actionable
	 * context when the file is damaged or its identity drifted.
	 */
	async draftReferenceFromPath(filePath: string): Promise<DraftFileReference & { task: Task }> {
		const draftsDir = resolve(await this.getDraftsDir());
		const absolutePath = resolve(filePath);
		const relativePath = relative(draftsDir, absolutePath);
		const parts = relativePath.split(sep);
		const containerId = parts[0];
		const isCanonicalContainer =
			parts.length === 2 && parts[1] === "task.md" && !!containerId && containerId === containerId.toLowerCase();
		if (parts.length === 1 && parts[0] !== "")
			throw new UnsupportedFlatDraftRecordError(
				`Unsupported flat draft record ${absolutePath}. Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3.`,
			);
		if (!isCanonicalContainer) throw new Error(`Invalid draft path: ${filePath}. Drafts must be inside ${draftsDir}.`);

		let realDraftsDir: string;
		let realFilePath: string;
		try {
			realDraftsDir = (await Bun.file(draftsDir).exists()) ? realpathSync(draftsDir) : draftsDir;
			realFilePath = realpathSync(absolutePath);
		} catch {
			throw new DraftParseError(basename(filePath));
		}
		const realRelativePath = relative(realDraftsDir, realFilePath);
		if (realRelativePath.startsWith(`..${sep}`) || realRelativePath === ".." || isAbsolute(realRelativePath))
			throw new Error(`Invalid draft path: ${filePath}. Draft path resolves outside ${draftsDir}.`);

		const filename = basename(absolutePath);
		let task: Task;
		try {
			task = normalizeTaskIdentity(parseTask(await Bun.file(realFilePath).text()));
		} catch {
			throw new DraftParseError(filename);
		}
		const identityFilename = containerId!;
		const canonicalId = extractDraftIdFromFilename(identityFilename);
		if (
			!canonicalId ||
			!draftIdsMatchLoosely(task.id, identityFilename) ||
			(isCanonicalContainer && normalizeId(task.id, DRAFT_PREFIX).toLowerCase() !== containerId)
		) {
			throw new DraftIdentityError(identityFilename, task.id, canonicalId);
		}
		return { filePath: absolutePath, canonicalId, task: { ...task, filePath: absolutePath } };
	}

	/**
	 * Resolve a user-supplied draft id to a validated reference. Candidate filenames are matched
	 * by exact prefix and loose numeric rules together, so duplicate numeric identities fail
	 * closed; only the matched file is parsed.
	 */
	async resolveDraftReference(draftId: string): Promise<(DraftFileReference & { task: Task }) | null> {
		const normalizedId = normalizeId(draftId, DRAFT_PREFIX);
		const draftsDir = await this.getDraftsDir();
		let files: string[];
		try {
			files = await this.listDraftFiles(draftsDir);
		} catch (error) {
			if (error instanceof UnsupportedFlatDraftRecordError) throw error;
			return null;
		}
		const candidates = files.filter((file) => {
			const parts = file.split(sep);
			const identityName = parts.length === 2 && parts[1] === "task.md" ? parts[0] : "";
			return !!identityName && draftIdsMatchLoosely(normalizedId, identityName);
		});
		if (candidates.length > 1) {
			throw new AmbiguousIdError(
				"Draft",
				normalizedId,
				candidates,
				"Rename one file to a distinct numeric id, then make its frontmatter agree.",
			);
		}
		const candidate = candidates[0];
		return candidate ? await this.draftReferenceFromPath(join(draftsDir, candidate)) : null;
	}

	/**
	 * Filename-bound resolution for whole-file operations (archive, promote). These move or
	 * delete the matched file itself, so frontmatter equivalence does not apply; duplicate
	 * numeric identities still fail closed.
	 */
	async resolveDraftFilePath(draftId: string): Promise<string | null> {
		const draftsDir = await this.getDraftsDir();
		let files: string[];
		try {
			files = await this.listDraftFiles(draftsDir);
		} catch (error) {
			if (error instanceof UnsupportedFlatDraftRecordError) throw error;
			return null;
		}
		const normalizedId = normalizeId(draftId, DRAFT_PREFIX);
		const candidates = files.filter((file) => {
			const parts = file.split(sep);
			const identityName = parts.length === 2 && parts[1] === "task.md" ? parts[0] : "";
			return !!identityName && draftIdsMatchLoosely(normalizedId, identityName);
		});
		if (candidates.length > 1) {
			throw new AmbiguousIdError(
				"Draft",
				normalizedId,
				candidates,
				"Rename one file to a distinct numeric id, then make its frontmatter agree.",
			);
		}
		const filename = candidates[0];
		return filename ? join(draftsDir, filename) : null;
	}

	/**
	 * Numeric draft identities occupied on disk, derived from filenames: files that fail to
	 * parse still reserve their id against future allocation.
	 */
	async listOccupiedDraftFileIds(): Promise<string[]> {
		const filenames = await this.listDraftFilenames();
		return filenames
			.map((filename) => {
				const containerRecord = filename.endsWith("/task.md");
				const identity = containerRecord ? filename.slice(0, -"/task.md".length) : filename;
				return extractTaskIdFromFilename(`${identity} -`) ?? extractDraftIdFromFilename(filename);
			})
			.filter((id): id is string => id !== null);
	}

	async listDraftFilenames(unreadable?: string[]): Promise<string[]> {
		const draftsDir = await this.getDraftsDir();
		try {
			const entries = await readdir(draftsDir, { withFileTypes: true });
			return entries
				.filter((entry) => entry.isFile() || entry.isDirectory())
				.map((entry) => (entry.isDirectory() ? join(entry.name, "task.md") : entry.name))
				.sort();
		} catch {
			// A directory that cannot be scanned is a finding, not an empty store: surface it so
			// doctor never reports draft identities as healthy without having checked them.
			unreadable?.push(draftsDir);
			return [];
		}
	}

	/**
	 * Draft identity findings for doctor: duplicate numeric identities (filename-derived, so
	 * unparsable files count), drifted frontmatter-vs-filename records, and unreadable files.
	 */
	async diagnoseDraftIdentity(): Promise<DraftIdentityFindings> {
		const unreadableDirectories: string[] = [];
		const filenames = await this.listDraftFilenames(unreadableDirectories);
		const duplicates = findDuplicateDraftFilenameGroups(filenames).map((paths) => ({
			id: extractDraftIdFromFilename(paths[0] ?? "") ?? "",
			paths,
		}));
		const draftsDir = await this.getDraftsDir();
		const unreadable: string[] = [...unreadableDirectories];
		const drifted: Array<{ path: string; frontmatterId: string; filenameId: string }> = [];
		for (const filename of filenames) {
			let parsed: Task | null;
			try {
				parsed = normalizeTaskIdentity(parseTask(await Bun.file(join(draftsDir, filename)).text()));
			} catch {
				unreadable.push(filename);
				continue;
			}
			const declaredId = extractDraftIdFromFilename(filename);
			if (!declaredId || !draftIdsMatchLoosely(parsed.id, filename)) {
				drifted.push({ path: filename, frontmatterId: parsed.id, filenameId: declaredId ?? "(unreadable)" });
			}
		}
		return { duplicates, unreadable, drifted };
	}

	// Decision log operations
	async saveDecision(
		decision: Decision,
		retainedFrontmatter?: Record<string, unknown>,
	): Promise<{ filepath: string; removedFilepaths: string[] }> {
		const root = resolve(this.backlogDir);
		const saved = await this.contentRepository.saveDecision(decision, retainedFrontmatter);
		await this.publishContentMutation({ type: "decision", root, decisionId: decision.id });
		return saved;
	}

	async loadDecision(decisionId: string): Promise<Decision | null> {
		return await this.contentRepository.loadDecision(decisionId);
	}

	// Document operations
	async saveDocument(document: Document, subPath = ""): Promise<{ relativePath: string; removedFilepaths: string[] }> {
		const root = resolve(this.backlogDir);
		const saved = await this.contentRepository.saveDocument(document, subPath);
		await this.publishContentMutation({ type: "document", root, documentId: document.id });
		return saved;
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

	/** Lists decisions, skipping files that cannot be read or parsed and collecting their paths in `unreadable`. */
	async listDecisions(unreadable?: string[]): Promise<Decision[]> {
		return await this.contentRepository.listDecisions(unreadable);
	}

	/** Lists documents, skipping files that cannot be read or parsed and collecting their paths in `unreadable`. */
	async listDocuments(unreadable?: string[]): Promise<Document[]> {
		return await this.contentRepository.listDocuments(unreadable);
	}

	async loadDocument(id: string): Promise<Document> {
		return await this.contentRepository.loadDocument(id);
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

	async loadMilestone(id: string): Promise<Milestone | null> {
		return this.milestones.load(id);
	}

	async createMilestone(title: string, description?: string, dueDate?: string): Promise<Milestone> {
		return this.milestones.create(title, description, dueDate);
		/*
		return await this.withCreateLock(async () => {
			const milestonesDir = await this.getMilestonesDir();

			// Ensure milestones directory exists
			await mkdir(milestonesDir, { recursive: true });

			// Find next available milestone ID
			const archiveMilestonesDir = await this.getArchiveMilestonesDir();
			await mkdir(archiveMilestonesDir, { recursive: true });
			const [existingFiles, archivedFiles] = await Promise.all([
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: milestonesDir, followSymlinks: true })),
				Array.fromAsync(new Bun.Glob("m-*.md").scan({ cwd: archiveMilestonesDir, followSymlinks: true })),
			]);
			const parseMilestoneId = async (dir: string, file: string): Promise<number | null> => {
				if (file.toLowerCase() === "readme.md") {
					return null;
				}
				const filepath = join(dir, file);
				try {
					const content = await Bun.file(filepath).text();
					const parsed = parseMilestone(content);
					const parsedIdMatch = parsed.id.match(/^m-(\d+)$/i);
					if (parsedIdMatch?.[1]) {
						return Number.parseInt(parsedIdMatch[1], 10);
					}
				} catch {
					// Fall through to filename-based fallback.
				}
				const filenameIdMatch = file.match(/^m-(\d+)/i);
				if (filenameIdMatch?.[1]) {
					return Number.parseInt(filenameIdMatch[1], 10);
				}
				return null;
			};
			const existingIds = (
				await Promise.all([
					...existingFiles.map((file) => parseMilestoneId(milestonesDir, file)),
					...archivedFiles.map((file) => parseMilestoneId(archiveMilestonesDir, file)),
				])
			).filter((id): id is number => typeof id === "number" && id >= 0);

			const nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 0;
			const id = `m-${nextId}`;

			const filename = this.buildMilestoneFilename(id, title);
			const content = this.serializeMilestoneContent(
				id,
				title,
				`## Description

${description || `Milestone: ${title}`}`,
				normalizedDueDate,
			);

			const filepath = join(milestonesDir, filename);
			await Bun.write(filepath, content);

			return parseMilestone(content);
		}); */
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
		/*
		const normalizedTitle = title.trim();
		if (!normalizedTitle) {
			return { success: false };
		}

		const normalizedDueDate = dueDate === null ? undefined : normalizeDueDate(dueDate, "Due date");
		let sourcePath: string | undefined;
		let targetPath: string | undefined;
		let movedFile = false;
		let originalContent: string | undefined;

		try {
			const milestoneMatch = await this.findMilestoneFile(identifier, "active");
			if (!milestoneMatch) {
				return { success: false };
			}

			const { milestone } = milestoneMatch;
			const milestonesDir = await this.getMilestonesDir();
			const targetFilename = this.buildMilestoneFilename(milestone.id, normalizedTitle);
			targetPath = join(milestonesDir, targetFilename);
			sourcePath = milestoneMatch.filepath;
			originalContent = milestoneMatch.content;
			const nextRawContent = this.rewriteDefaultMilestoneDescription(
				milestone.rawContent,
				milestone.title,
				normalizedTitle,
			);
			const nextDueDate = dueDate === undefined ? milestone.dueDate : normalizedDueDate;
			const updatedContent = this.serializeMilestoneContent(milestone.id, normalizedTitle, nextRawContent, nextDueDate);

			if (sourcePath !== targetPath) {
				if (await Bun.file(targetPath).exists()) {
					return { success: false };
				}
				await rename(sourcePath, targetPath);
				movedFile = true;
			}
			await Bun.write(targetPath, updatedContent);

			return {
				success: true,
				sourcePath,
				targetPath,
				milestone: parseMilestone(updatedContent),
				previousTitle: milestone.title,
				previousDueDate: milestone.dueDate,
			};
		} catch {
			try {
				if (movedFile && sourcePath && targetPath && sourcePath !== targetPath) {
					await rename(targetPath, sourcePath);
					if (originalContent) {
						await Bun.write(sourcePath, originalContent);
					}
				} else if (originalContent) {
					const restorePath = sourcePath ?? targetPath;
					if (restorePath) {
						await Bun.write(restorePath, originalContent);
					}
				}
			} catch {
				// Ignore rollback failures and surface operation failure to caller.
			}
			return { success: false };
		}
		*/
	}

	async archiveMilestone(identifier: string): Promise<{
		success: boolean;
		sourcePath?: string;
		targetPath?: string;
		milestone?: Milestone;
	}> {
		return this.milestones.archive(identifier);
		/*
		const normalized = identifier.trim();
		if (!normalized) {
			return { success: false };
		}

		try {
			const milestoneMatch = await this.findMilestoneFile(normalized, "active");
			if (!milestoneMatch) {
				return { success: false };
			}

			const archiveDir = await this.getArchiveMilestonesDir();
			const targetPath = join(archiveDir, milestoneMatch.file);
			await this.ensureDirectoryExists(dirname(targetPath));
			await rename(milestoneMatch.filepath, targetPath);

			return {
				success: true,
				sourcePath: milestoneMatch.filepath,
				targetPath,
				milestone: milestoneMatch.milestone,
			};
		} catch (_error) {
			return { success: false };
		}
		*/
	}

	// Config operations
	async loadConfig(): Promise<BacklogConfig | null> {
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

		// A value Backlog cannot read is reported, not swallowed: callers must not silently
		// fall back to defaults while the config file says something else.
		const config = parseConfig(content, this.resolvedConfigPath);
		this.cachedConfig = config;
		this.cachedConfigSnapshot = { path: configPath, content };
		return config;
	}

	async saveConfig(config: BacklogConfig): Promise<void> {
		const normalizedConfig: BacklogConfig = {
			...config,
			...(this.configSource === "root" ? { backlogDirectory: this.resolvedBacklogDirName } : {}),
		};
		if (this.configSource === "folder") {
			delete normalizedConfig.backlogDirectory;
		}
		const configPath = this.resolvedConfigPath;
		const content = serializeConfig(normalizedConfig);
		await Bun.write(configPath, content);
		this.cachedConfig = normalizedConfig;
		this.cachedConfigSnapshot = { path: configPath, content };
	}

	// Utility methods
	private sanitizeFilename(filename: string): string {
		// Remove path-unsafe characters, then strip noisy punctuation before normalizing whitespace
		const sanitized = filename
			.replace(/[<>:"/\\|?*]/g, "-")
			// biome-ignore lint/complexity/noUselessEscapeInRegex: we need explicit escapes inside the character class
			.replace(/['(),!@#$%^&+=\[\]{};]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "");
		// A punctuation-only title sanitizes to nothing; fall back so filenames keep the "<id> - <title>.md" shape
		return sanitized || "untitled";
	}

	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		try {
			await mkdir(dirPath, { recursive: true });
		} catch (_error) {
			// Directory creation failed, ignore
		}
	}

	parseConfig(content: string): BacklogConfig {
		return parseConfig(content, this.resolvedConfigPath);
	}
}
