import { realpathSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { resolveMainWorktreeRootSync } from "../filesystem/git/main-worktree.ts";
import { type LockAttemptSettings, LockOwner } from "../filesystem/lock-owner.ts";
import type { AgenticWorkspaceConfigSource } from "../filesystem/paths/agentic-workspace-directory.ts";
import {
	normalizeProjectAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectoryFromRootConfig,
} from "../filesystem/paths/agentic-workspace-directory.ts";
import { ProjectLayout } from "../filesystem/project-layout.ts";
import { DEFAULT_DIRECTORIES, DEFAULT_FILES, DRAFT_STATUS, FALLBACK_STATUS } from "../model/constants.ts";
import { AmbiguousIdError, isAmbiguousIdError } from "../model/errors/entity-id.ts";
import { AmbiguousTaskIdError, isAmbiguousTaskIdError } from "../model/errors/task-id.ts";
import type { DraftIdentityFindings } from "../model/task/duplicate-detection.ts";
import { DEFAULT_TASK_PREFIX, DRAFT_PREFIX, escapeRegex, generateNextId } from "../model/task/prefix-config.ts";
import { isValidDraftId, isValidTaskId, taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { withoutVacatedTaskLinks } from "../model/task/task-links.ts";
import { TaskOrdering } from "../model/task/task-ordering.ts";
import {
	draftIdsMatchLoosely,
	extractDraftIdFromFilename,
	findDuplicateDraftFilenameGroups,
	normalizeDraftId,
} from "../model/task/task-path.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import {
	type AgenticWorkspaceConfig,
	type Milestone,
	TASK_DIRECTORY_TYPES,
	type Task,
	type TaskListFilter,
} from "../model/types.ts";
import { isConfigValueError, parseConfig, serializeConfig } from "./config-codec.ts";
import { DraftIdentityError, DraftParseError } from "./errors/drafts.ts";
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
const DRAFT_DIRECTORY = TASK_DIRECTORY_TYPES[1];
const DRAFT_STATUS_KEY = DRAFT_STATUS.toLowerCase();

export type ContentMutation =
	| { type: typeof TASK_DIRECTORY; root: string; taskId: string; filePath: string }
	| { type: "artifact"; root: string; taskId: string; path?: string };

export type ContentMutationListener = (mutation: ContentMutation) => void | Promise<void>;

export type FileSystemSelection = {
	agenticWorkspaceDirectory: string;
	configLocation: AgenticWorkspaceConfigSource;
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
	get archiveMilestonesDir(): string {
		return join(this.resolvedAgenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES);
	}

	get milestonesDir(): string {
		return join(this.resolvedAgenticWorkspaceDir, DEFAULT_DIRECTORIES.MILESTONES);
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

	resolveAgenticWorkspaceDirectoryInfo() {
		if (this.resolutionFrozen)
			return {
				projectRoot: this.projectRoot,
				agenticWorkspaceDir: this.resolvedAgenticWorkspaceDirName,
				agenticWorkspacePath: this.resolvedAgenticWorkspaceDir,
				source: null,
				configPath: this.resolvedConfigPath,
				configSource: this.configSource,
				rootConfigPath: join(this.agenticWorkspaceResolutionRoot, DEFAULT_FILES.ROOT_CONFIG),
				rootConfigExists: this.configSource === "root",
			};
		return resolveAgenticWorkspaceDirectory(this.agenticWorkspaceResolutionRoot);
	}

	private async getTasksDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.TASKS);
	}

	async getDraftsDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.DRAFTS);
	}

	async getArchiveTasksDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS);
	}

	private async getArchiveMilestonesDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_MILESTONES);
	}

	private async getArchiveDraftsDir(): Promise<string> {
		const agenticWorkspaceDir = await this.getAgenticWorkspaceDir();
		return join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_DRAFTS);
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
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.DRAFTS),
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.COMPLETED),
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_TASKS),
			join(agenticWorkspaceDir, DEFAULT_DIRECTORIES.ARCHIVE_DRAFTS),
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

	/**
	 * Draft counterpart of the per-task lock. The lock key is namespaced by store so a project
	 * whose task prefix is "draft" does not make an unrelated task contend with its draft twin,
	 * while two editors of the same draft file still fail fast against each other.
	 */
	async withDraftLock<T>(reference: DraftFileReference, fn: () => Promise<T>): Promise<T> {
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
		const locksDir = join(await this.getAgenticWorkspaceDir(), ".locks");
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
			const prefixPattern = new RegExp(`^${escapeRegex(canonicalPrefix)}-(\\d+)$`);
			let max = 0;
			for (const id of await existingIds()) {
				const match = taskIdKey(id).match(prefixPattern);
				if (match?.[1]) max = Math.max(max, Number(match[1]));
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
		scope: typeof TASK_DIRECTORY | typeof DRAFT_DIRECTORY,
		entityId: string,
		filePath: string,
		fn: () => Promise<T>,
	): Promise<T> {
		const lockKey = taskIdKey(entityId)
			.toLowerCase()
			.replace(/[^a-z0-9._-]+/g, "-")
			.replace(/^\.+/, "");
		return await this.withLockTarget(
			filePath,
			join(await this.getAgenticWorkspaceDir(), ".locks", `${scope}-${lockKey || "unknown"}`),
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
	private async resolveTaskWriteTarget(
		task: Task,
		isDraft = false,
	): Promise<{ id: string; filename: string; filePath: string }> {
		const id = isDraft ? normalizeDraftId(task.id) : taskIdKey(task.id);
		if (!isDraft && !isValidTaskId(id)) throw new Error(`Invalid task ID: ${task.id}`);
		if (isDraft && !isValidDraftId(id)) throw new Error(`Invalid draft ID: ${task.id}`);
		const directory = isDraft ? await this.getDraftsDir() : await this.getTasksDir();
		const filename = isDraft ? `${id} - ${this.sanitizeFilename(task.title)}.md` : "task.md";
		const filePath = isDraft ? join(directory, filename) : join(directory, id.toLowerCase(), filename);
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
		if (task.parentTaskId && !isValidTaskId(taskIdKey(task.parentTaskId))) {
			throw new Error(`Invalid parent task ID: ${task.parentTaskId}`);
		}
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
		if (!isValidTaskId(canonicalId)) return null;
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

	async archiveDraft(draftId: string): Promise<{ sourcePath: string; targetPath: string } | null> {
		const sourcePath = await this.resolveDraftFilePath(draftId);
		if (!sourcePath) return null;
		const sourceContainer = dirname(sourcePath);
		const canonicalId = extractDraftIdFromFilename(basename(sourceContainer));
		if (!canonicalId) return null;
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
			const task = parseTask(await Bun.file(filePath).text());
			if (!isValidDraftId(task.id)) return null;
			return { ...task, id: task.id.toUpperCase(), filePath };
		} catch {
			return null;
		}
	}

	async promoteDraft(
		draftId: string,
		validateAllocatedTask?: (task: Task) => Promise<void>,
		allocateTaskId?: () => Promise<string>,
	): Promise<string | null> {
		const sourcePath = await this.resolveDraftFilePath(draftId);
		if (!sourcePath) return null;

		let validationError: unknown;
		try {
			return await this.withCreateLock(async () => {
				const draft = await this.loadDraftFromFile(sourcePath);
				if (!draft) return null;
				const sourceContainer = dirname(sourcePath);
				if (basename(sourceContainer).toLowerCase() !== draft.id.toLowerCase())
					throw new Error(`Draft ${draft.id} container identity mismatch; refusing to promote it.`);

				const config = await this.loadConfig();
				const taskPrefix = config?.prefixes?.task ?? DEFAULT_TASK_PREFIX;
				const [existingTasks, completedTasks, archivedTasks] = await Promise.all([
					this.listTasks(),
					this.listCompletedTasks(),
					this.listArchivedTasks(),
				]);
				const newTaskId = allocateTaskId
					? await allocateTaskId()
					: await this.allocateTaskId(taskPrefix, config?.zeroPaddedIds, async () =>
							[...existingTasks, ...completedTasks, ...archivedTasks].map((task) => task.id),
						);
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
				const content = serializeTask(promotedTask, await this.retainedTaskFrontmatter(sourcePath));
				await this.ensureDirectoryExists(dirname(targetContainer));
				await rename(sourceContainer, targetContainer);
				try {
					await this.writeFileAtomically(promotedTask.filePath as string, content);
				} catch (error) {
					await rename(targetContainer, sourceContainer);
					throw error;
				}
				this.taskRepository.invalidate();
				await this.publishContentMutation({
					type: TASK_DIRECTORY,
					root: resolve(this.agenticWorkspaceDir),
					taskId: promotedTask.id,
					filePath: promotedTask.filePath as string,
				});
				return promotedTask.id;
			});
		} catch (error) {
			if (error === validationError) throw error;
			if (isCreateLockError(error) || isAmbiguousTaskIdError(error)) throw error;
			return null;
		}
	}

	async demoteTask(
		taskId: string,
		onMoved?: (fromPath: string, toPath: string) => void,
		validateAllocatedDraft?: (draft: Task) => Promise<void>,
	): Promise<string | null> {
		return await this.withCreateLock(async () => {
			const task = await this.loadTask(taskId);
			if (!task?.filePath) return null;
			const sourcePath = resolve(task.filePath);
			const sourceContainer = dirname(sourcePath);
			if (basename(sourceContainer).toLowerCase() !== taskIdKey(task.id).toLowerCase())
				throw new Error(`Task ${task.id} container identity mismatch; refusing to demote it.`);
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
			const sourceTask = await this.existingTaskAtWritePath(sourcePath);
			if (!sourceTask || !taskIdsEqual(sourceTask.id, task.id))
				throw new Error(`Task ${task.id} changed identity before it could be demoted.`);
			const demotedDraft: Task = {
				...(withoutVacatedTaskLinks(task, task.id) ?? task),
				id: newDraftId,
				filePath: join(targetContainer, "task.md"),
			};
			await validateAllocatedDraft?.(demotedDraft);
			const content = serializeTask(demotedDraft, await this.retainedTaskFrontmatter(sourcePath));
			await this.ensureDirectoryExists(dirname(targetContainer));
			await rename(sourceContainer, targetContainer);
			try {
				await this.writeFileAtomically(demotedDraft.filePath as string, content);
			} catch (error) {
				await rename(targetContainer, sourceContainer);
				throw error;
			}
			this.taskRepository.invalidate();
			const toPath = demotedDraft.filePath as string;
			onMoved?.(sourcePath, toPath);
			await this.publishContentMutation({
				type: TASK_DIRECTORY,
				root: resolve(this.agenticWorkspaceDir),
				taskId: demotedDraft.id,
				filePath: toPath,
			});
			return demotedDraft.id;
		});
	}

	// Draft operations
	private async listDraftFiles(draftsDir: string): Promise<string[]> {
		const entries = await readdir(draftsDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => join(entry.name, "task.md"))
			.sort();
	}

	private async readDraftFile(filepath: string): Promise<Task> {
		const task = parseTask(await Bun.file(filepath).text());
		if (!isValidDraftId(task.id)) throw new Error(`Invalid draft ID: ${task.id}`);
		return { ...task, id: task.id.toUpperCase(), filePath: filepath };
	}

	async saveDraft(task: Task): Promise<string> {
		const { id: canonicalId } = await this.resolveTaskWriteTarget(task, true);
		if (!isValidDraftId(canonicalId)) throw new Error(`Invalid draft ID: ${task.id}`);
		const containerId = canonicalId.toLowerCase();
		const container = await this.taskArtifacts.containerPath(containerId, "drafts");
		const filepath = join(container, "task.md");
		const sourcePath = typeof task.filePath === "string" ? resolve(task.filePath) : undefined;
		const sourceContainer = sourcePath && basename(sourcePath) === "task.md" ? dirname(sourcePath) : undefined;
		const isExistingContainer = sourceContainer === container;

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
			await this.retainedTaskFrontmatter(isExistingContainer ? sourcePath : undefined),
		);
		if (!isExistingContainer) {
			await this.ensureDirectoryExists(dirname(container));
			await mkdir(container, { recursive: false });
		}
		await this.writeFileAtomically(filepath, content);
		return filepath;
	}

	private async writeFileAtomically(filepath: string, content: string): Promise<void> {
		const temporaryPath = `${filepath}.${process.pid}.${Date.now()}.tmp`;
		try {
			await writeFile(temporaryPath, content, { flag: "wx" });
			await rename(temporaryPath, filepath);
		} catch (error) {
			try {
				await unlink(temporaryPath);
			} catch (cleanupError) {
				if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT")
					throw new Error(`Atomic write failed and temporary-file cleanup failed for ${temporaryPath}.`, {
						cause: new AggregateError([error, cleanupError]),
					});
			}
			throw error;
		}
	}

	async loadDraft(draftId: string): Promise<Task | null> {
		try {
			const filePath = await this.resolveDraftFilePath(draftId);
			if (!filePath) return null;
			return await this.loadDraftFromFile(filePath);
		} catch (error) {
			if (isAmbiguousIdError(error)) throw error;
			return null;
		}
	}

	async listDrafts(): Promise<Task[]> {
		try {
			const draftsDir = await this.getDraftsDir();
			const taskFiles = await this.listDraftFiles(draftsDir);

			const tasks: Task[] = [];
			for (const file of taskFiles) {
				try {
					tasks.push(await this.readDraftFile(join(draftsDir, file)));
				} catch (error) {
					console.warn(
						`Warning: Skipping invalid task draft ${join(draftsDir, file)}: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

			return TaskOrdering.byId(tasks);
		} catch {
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

			return TaskOrdering.byId(tasks);
		} catch {
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
			task = parseTask(await Bun.file(realFilePath).text());
		} catch {
			throw new DraftParseError(filename);
		}
		const identityFilename = containerId!;
		const canonicalId = extractDraftIdFromFilename(identityFilename);
		if (
			!canonicalId ||
			!draftIdsMatchLoosely(task.id, identityFilename) ||
			(isCanonicalContainer && !taskIdsEqual(normalizeDraftId(task.id), containerId))
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
		const normalizedId = normalizeDraftId(draftId);
		const draftsDir = await this.getDraftsDir();
		let files: string[];
		try {
			files = await this.listDraftFiles(draftsDir);
		} catch {
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
		} catch {
			return null;
		}
		const normalizedId = normalizeDraftId(draftId);
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
				const containerRecord = basename(filename) === "task.md";
				const identity = containerRecord ? dirname(filename) : filename;
				const taskId = identity.match(/^([A-Za-z]+-\d+(?:\.\d+)*)/)?.[1];
				return taskId ?? extractDraftIdFromFilename(filename);
			})
			.filter((id): id is string => id !== null);
	}

	async listDraftFilenames(unreadable?: string[]): Promise<string[]> {
		const draftsDir = await this.getDraftsDir();
		try {
			const entries = await readdir(draftsDir, { withFileTypes: true });
			return entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => join(entry.name, "task.md"))
				.sort();
		} catch {
			// A directory that cannot be scanned is a finding, not an empty store: surface it so
			// Draft identities are never reported as healthy without having been checked.
			unreadable?.push(draftsDir);
			return [];
		}
	}

	/**
	 * Draft identity findings: duplicate numeric identities (filename-derived, so
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
				parsed = parseTask(await Bun.file(join(draftsDir, filename)).text());
			} catch {
				unreadable.push(filename);
				continue;
			}
			const declaredId = extractDraftIdFromFilename(filename);
			if (!parsed || !declaredId || !draftIdsMatchLoosely(parsed.id, filename)) {
				drifted.push({ path: filename, frontmatterId: parsed.id, filenameId: declaredId ?? "(unreadable)" });
			}
		}
		return { duplicates, unreadable, drifted };
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

	async loadMilestone(id: string): Promise<Milestone | null> {
		return this.milestones.load(id);
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
		await mkdir(dirPath, { recursive: true });
	}

	parseConfig(content: string): AgenticWorkspaceConfig {
		return parseConfig(content, this.resolvedConfigPath);
	}
}
