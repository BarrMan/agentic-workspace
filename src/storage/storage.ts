import { access, readdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { AgentConfiguration } from "../model/session/types.ts";
import type { DependencyStore } from "../model/task/dependency-validator.ts";
import { taskIdKey } from "../model/task/task-id.ts";
import {
	completedTaskIdentityRecord,
	type TaskIdentityRecord,
	workingCopyTaskIdentityRecord,
} from "../model/task/task-identity-index.ts";
import {
	type AgenticWorkspaceConfig,
	type Milestone,
	TASK_SOURCE,
	type Task,
	type TaskListFilter,
} from "../model/types.ts";
import { addSearchableArtifactText } from "./artifact-text.ts";
import { readRootConfiguration, rootConfigFilePath } from "./config.ts";
import { FileSystem, type FileSystemSelection } from "./file-system.ts";
import { parseTask } from "./markdown/parser.ts";
import type { CreatedTaskRollbackResult, CreatedTaskWrite } from "./types.ts";

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

	async withCreateLock<T>(fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withCreateLock(fn);
	}

	async withTaskLock<T>(task: Pick<Task, "id" | "filePath">, fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withTaskLock(task, fn);
	}

	async withTaskLocks<T>(tasks: Array<Pick<Task, "id" | "filePath">>, fn: () => Promise<T>): Promise<T> {
		return await this.filesystem.withTaskLocks(tasks, fn);
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
