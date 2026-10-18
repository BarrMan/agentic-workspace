import { access, readdir, readFile, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { readRootConfiguration, rootConfigFilePath } from "../agent-workspace/config.ts";
import type { AgentConfiguration } from "../agent-workspace/types.ts";
import { DEFAULT_DIRECTORIES } from "../constants/index.ts";
import { type DraftFileReference, FileSystem, type FileSystemSelection } from "../file-system/operations.ts";
import { parseTask } from "../markdown/parser.ts";
import {
	type AgenticWorkspaceConfig,
	type Milestone,
	TASK_DIRECTORY,
	TASK_SOURCE,
	type Task,
	type TaskListFilter,
} from "../types/index.ts";
import { buildIdRegex } from "../utils/prefix-config.ts";
import type { DependencyStore } from "../utils/task-builders.ts";
import { isValidTaskId, taskIdKey } from "../utils/task-id.ts";
import type { CreatedTaskRollbackResult, CreatedTaskWrite } from "./task-creation-transaction.ts";
import {
	completedTaskIdentityRecord,
	type TaskIdentityRecord,
	workingCopyTaskIdentityRecord,
} from "./task-identity-index.ts";
import type { BranchTaskStateEntry } from "./task-loader.ts";
import { addSearchableArtifactText } from "./task-loader.ts";

export interface ScannedTaskRecord {
	location: "active" | "completed";
	path: string;
	task: Task | null;
	error?: unknown;
}

/** The persistence boundary for workspace records, configuration, locks, and transactions. */
export class Storage {
	constructor(private readonly filesystem: FileSystem) {}

	get projectRoot(): string {
		return this.filesystem.rootDir;
	}

	get workspaceDirectoryName(): string {
		return this.filesystem.agenticWorkspaceDirName;
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

	async findTaskRecordPath(taskId: string): Promise<string | null> {
		const canonicalId = taskIdKey(taskId);
		if (!isValidTaskId(canonicalId)) return null;
		const filepath = join(this.filesystem.tasksDir, canonicalId.toLowerCase(), "task.md");
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

	async saveConfig(config: AgenticWorkspaceConfig): Promise<void> {
		await this.filesystem.saveConfig(config);
	}

	async initializeWorkspace(config: AgenticWorkspaceConfig, selection: FileSystemSelection): Promise<void> {
		const filesystem = new FileSystem(this.filesystem.rootDir, selection);
		await filesystem.ensureAgenticWorkspaceStructure();
		await filesystem.saveConfig(config);
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

	async archiveMilestone(identifier: string) {
		return await this.filesystem.archiveMilestone(identifier);
	}

	async renameMilestone(identifier: string, title: string, dueDate?: string | null) {
		return await this.filesystem.renameMilestone(identifier, title, dueDate);
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

	get dependencyStore(): DependencyStore {
		return {
			listTasks: () => this.loadTasks(),
			listDrafts: () => this.loadDrafts(),
			listCompletedTasks: () => this.loadCompletedTasks(),
			listArchivedTasks: () => this.loadArchivedTasks(),
			loadTask: (taskId: string) => this.loadTask(taskId),
		};
	}

	async loadTask(taskId: string, options: { includeArchived?: boolean } = {}): Promise<Task | null> {
		return await this.filesystem.loadTask(taskId, options);
	}

	async saveTask(task: Task, options: { approvalMutation?: boolean; create?: boolean } = {}): Promise<string> {
		return await this.filesystem.saveTask(task, options);
	}

	async loadTaskContent(taskId: string): Promise<string | null> {
		const task = await this.filesystem.loadTask(taskId);
		if (!task?.filePath) return null;
		return await Bun.file(task.filePath).text();
	}

	async completeTask(taskId: string, alreadyLocked = false): Promise<boolean> {
		return await this.filesystem.completeTask(taskId, alreadyLocked);
	}

	async moveTaskToArchive(task: Task): Promise<string> {
		return await this.filesystem.moveTaskContainer(task, await this.filesystem.getArchiveTasksDir(), true);
	}

	async deleteTaskContainer(task: Task, alreadyLocked = false): Promise<void> {
		return await this.filesystem.deleteTaskContainer(task, alreadyLocked);
	}

	async loadDrafts(): Promise<Task[]> {
		return await this.filesystem.listDrafts();
	}

	async loadHealthyDrafts(): Promise<Task[]> {
		return await this.filesystem.listHealthyDrafts();
	}

	async loadDraft(draftId: string): Promise<Task | null> {
		return await this.filesystem.loadDraft(draftId);
	}

	async saveDraft(task: Task): Promise<string> {
		return await this.filesystem.saveDraft(task);
	}

	async archiveDraft(draftId: string) {
		return await this.filesystem.archiveDraft(draftId);
	}

	async promoteDraft(
		draftId: string,
		validateAllocatedTask?: (task: Task) => Promise<void>,
		allocateTaskId?: () => Promise<string>,
	): Promise<boolean> {
		return await this.filesystem.promoteDraft(draftId, validateAllocatedTask, allocateTaskId);
	}

	async demoteTask(
		taskId: string,
		onMoved?: (fromPath: string, toPath: string) => void,
		validateAllocatedDraft?: (draft: Task) => Promise<void>,
	): Promise<boolean> {
		return await this.filesystem.demoteTask(taskId, onMoved, validateAllocatedDraft);
	}

	async draftReferenceFromPath(filePath: string): Promise<DraftFileReference & { task: Task }> {
		return await this.filesystem.draftReferenceFromPath(filePath);
	}

	async resolveDraftReference(draftId: string): Promise<(DraftFileReference & { task: Task }) | null> {
		return await this.filesystem.resolveDraftReference(draftId);
	}

	async listOccupiedDraftFileIds(): Promise<string[]> {
		return await this.filesystem.listOccupiedDraftFileIds();
	}

	diagnoseDraftIdentity() {
		return this.filesystem.diagnoseDraftIdentity();
	}

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withCreateLock(fn);
	}

	async withTaskLock<T>(task: Pick<Task, "id" | "filePath">, fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withTaskLock(task, fn);
	}

	async withTaskLocks<T>(tasks: Array<Pick<Task, "id" | "filePath">>, fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withTaskLocks(tasks, fn);
	}

	async withDraftLock<T>(reference: DraftFileReference, fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withDraftLock(reference, fn);
	}

	async allocateTaskId(
		prefix: string,
		zeroPadding: number | undefined,
		existingIds: () => Promise<string[]>,
	): Promise<string> {
		return await this.filesystem.allocateTaskId(prefix, zeroPadding, existingIds);
	}

	isCompletedTaskRecordPath(filePath: string): boolean {
		const completedPath = relative(this.filesystem.completedDir, filePath);
		return completedPath !== "" && completedPath !== ".." && !completedPath.startsWith(`..${sep}`);
	}

	projectRelativePath(filePath: string): string {
		return relative(this.filesystem.rootDir, filePath).split(sep).join("/");
	}

	async loadTaskStateEntries(
		repositoryRoot: string,
		worktreeRoots: string[],
		taskPrefix: string,
	): Promise<BranchTaskStateEntry[]> {
		if (worktreeRoots.length === 0) return [];
		const projectRelativePath = relative(repositoryRoot, this.filesystem.rootDir);
		if (projectRelativePath.startsWith("..") || isAbsolute(projectRelativePath)) return [];
		const agenticWorkspaceDir = this.workspaceDirectoryName;
		const entries: BranchTaskStateEntry[] = [];
		for (const worktreeRoot of worktreeRoots) {
			const projectRoot = projectRelativePath ? join(worktreeRoot, projectRelativePath) : worktreeRoot;
			entries.push(
				...(await this.loadTaskStateEntriesFromWorktree(projectRoot, agenticWorkspaceDir, taskPrefix, worktreeRoot)),
			);
		}
		return entries;
	}

	private async loadTaskStateEntriesFromWorktree(
		projectRoot: string,
		agenticWorkspaceDir: string,
		taskPrefix: string,
		worktreeRoot: string,
	): Promise<BranchTaskStateEntry[]> {
		const idRegex = buildIdRegex(taskPrefix);
		const directories: Array<{ path: string; type: typeof TASK_DIRECTORY.TASK | typeof TASK_DIRECTORY.COMPLETED }> = [
			{ path: join(projectRoot, agenticWorkspaceDir, DEFAULT_DIRECTORIES.TASKS), type: TASK_DIRECTORY.TASK },
			{ path: join(projectRoot, agenticWorkspaceDir, DEFAULT_DIRECTORIES.COMPLETED), type: TASK_DIRECTORY.COMPLETED },
		];
		const entries: BranchTaskStateEntry[] = [];
		for (const { path, type } of directories) {
			let files: string[];
			try {
				files = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: path, followSymlinks: true }));
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
					id: `${taskPrefix.toUpperCase()}-${match[1].toUpperCase()}`,
					type,
					branch: `worktree:${worktreeRoot}`,
					path: filePath,
					lastModified: stats?.mtime ?? new Date(0),
				});
			}
		}
		return entries;
	}

	async scanTaskRecords(): Promise<ScannedTaskRecord[]> {
		const records: ScannedTaskRecord[] = [];
		const roots = [
			[this.filesystem.tasksDir, "active"],
			[this.filesystem.completedDir, "completed"],
		] as const;
		for (const [root, location] of roots) {
			for await (const path of new Bun.Glob("*/task.md").scan({ cwd: root, absolute: true })) {
				try {
					records.push({ location, path, task: parseTask(await Bun.file(path).text()) });
				} catch (error) {
					records.push({ location, path, task: null, error });
				}
			}
		}
		return records;
	}

	taskIdentityContext(repositoryRoot: string | null) {
		return {
			repositoryRoot,
			projectRoot: this.filesystem.rootDir,
			agenticWorkspaceDirectory: this.filesystem.agenticWorkspaceDirName,
		};
	}

	localTaskIdentityRecord(task: Task): TaskIdentityRecord {
		return workingCopyTaskIdentityRecord(task, "task", task.filePath ?? task.id);
	}

	localCompletedTaskIdentityRecord(task: Task): TaskIdentityRecord {
		return completedTaskIdentityRecord(task, task.filePath ?? task.id);
	}

	activeTaskIdentityRecord(task: Task): TaskIdentityRecord {
		return {
			id: task.id,
			type: "task",
			branch: "local",
			path: task.filePath ?? join(this.filesystem.tasksDir, task.id),
			lastModified: task.lastModified ?? new Date(0),
			task: { ...task, source: TASK_SOURCE.LOCAL },
			workingCopy: true,
		};
	}

	projectTaskIdentityRecord(task: Task): TaskIdentityRecord {
		return workingCopyTaskIdentityRecord(task, "task", task.filePath ?? join(this.filesystem.tasksDir, task.id));
	}

	projectCompletedTaskIdentityRecord(task: Task): TaskIdentityRecord {
		return completedTaskIdentityRecord(task, task.filePath ?? join(this.filesystem.completedDir, task.id));
	}

	addSearchableArtifactText<T extends Task>(tasks: T[]) {
		return addSearchableArtifactText(tasks, this.filesystem.taskArtifacts);
	}

	async prepareCreatedTaskWrite(filePath: string): Promise<CreatedTaskWrite> {
		const createdContent = await this.readFileIfPresent(filePath);
		if (!createdContent) throw new Error(`Created task record not found: ${filePath}`);
		return { filePath, createdContent, previousPath: null, previousContent: null };
	}

	async rollbackCreatedTask(write: CreatedTaskWrite): Promise<CreatedTaskRollbackResult> {
		const workingPathRestored = await this.restoreCreatedPath(write);
		return { workingPathRestored };
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
		// A newly-created task container belongs to the transaction only when it is still empty.
		// Sidecars and other user artifacts make it non-empty, so preserve it in that case.
		const containerPath = dirname(write.filePath);
		try {
			if ((await readdir(containerPath)).length === 0) await rmdir(containerPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTEMPTY")
				throw error;
		}
		return true;
	}
}
