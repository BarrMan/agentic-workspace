import { access, chmod, mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import lockfile from "proper-lockfile";
import { agentCommandArgvSchema } from "../model/session/agent-config-schema.ts";
import type { AgentConfiguration } from "../model/session/types.ts";
import type { DependencyStore } from "../model/task/dependency-validator.ts";
import { normalizePriorityValue, resolvePriorityValue } from "../model/task/priority-config.ts";
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
import { FileSystem, type FileSystemSelection, isTaskLockError } from "./file-system.ts";
import { parseFrontmatter, stringifyFrontmatter } from "./markdown/frontmatter.ts";
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
	private agentPresetMigration?: Promise<{ migratedFiles: string[] }>;

	constructor(private readonly filesystem: FileSystem) {}

	startAgentPresetCommandMigration(): Promise<{ migratedFiles: string[] }> {
		if (!this.agentPresetMigration)
			this.agentPresetMigration = this.migrateAgentPresetCommands().then(async (result) => {
				const priorityResult = await this.migrateTaskAssigneesAndPriority();
				return { migratedFiles: [...new Set([...result.migratedFiles, ...priorityResult.migratedFiles])] };
			});
		return this.agentPresetMigration;
	}

	private async waitForAgentPresetMigration(): Promise<void> {
		await this.agentPresetMigration;
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
		await this.waitForAgentPresetMigration();
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
		await this.waitForAgentPresetMigration();
		return await readRootConfiguration(rootConfigFilePath());
	}

	async loadProjectAgentConfiguration(): Promise<AgentConfiguration | null> {
		await this.waitForAgentPresetMigration();
		const config = await this.filesystem.loadConfig();
		return config?.agentConfiguration ?? null;
	}

	async migrateAgentPresetCommands(): Promise<{ migratedFiles: string[] }> {
		const files = [rootConfigFilePath(), this.configFilePath];
		for (const root of [
			this.filesystem.tasksDir,
			this.filesystem.completedDir,
			await this.filesystem.getArchiveTasksDir(),
		]) {
			try {
				await access(root);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
			for await (const path of new Bun.Glob("*/task.md").scan({ cwd: root, absolute: true })) files.push(path);
		}
		const completed: string[] = [];
		try {
			for (const path of [...new Set(files)]) {
				const taskRecord = path.endsWith("task.md");
				let taskIdentity: string | null = null;
				if (!(await this.hasAgentCommandMigrationCandidate(path, taskRecord))) continue;
				const run = async () => {
					let original: string;
					try {
						original = await readFile(path, "utf8");
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
						throw error;
					}
					let document: Record<string, unknown>;
					let body = "";
					try {
						if (taskRecord) ({ data: document, content: body } = parseFrontmatter(original));
						else {
							const parsed = Bun.YAML.parse(original);
							document =
								parsed && typeof parsed === "object" && !Array.isArray(parsed)
									? (parsed as Record<string, unknown>)
									: {};
						}
					} catch (error) {
						if (taskRecord) return;
						throw new Error(`Cannot migrate agent commands in ${path}: invalid document.`, { cause: error });
					}
					if (
						taskRecord &&
						typeof document.id === "string" &&
						taskIdentity !== null &&
						taskIdKey(document.id) !== taskIdKey(taskIdentity)
					)
						return;
					const key = taskRecord ? "agentConfiguration" : "agent_configuration";
					const config = document[key];
					if (!config || typeof config !== "object" || Array.isArray(config)) return;
					const presets = (config as Record<string, unknown>).presets;
					if (!presets || typeof presets !== "object" || Array.isArray(presets)) return;
					let changed = false;
					for (const [name, raw] of Object.entries(presets)) {
						if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
						const preset = raw as Record<string, unknown>;
						if (typeof preset.command !== "string") continue;
						try {
							preset.command = this.parseAgentCommand(preset.command);
							changed = true;
						} catch (error) {
							throw new Error(`Cannot migrate ${path} preset "${name}": ${(error as Error).message}`, { cause: error });
						}
					}
					if (changed) {
						await this.replaceMigrationFile(
							path,
							taskRecord ? stringifyFrontmatter(body, document) : this.serializeRawYaml(document),
						);
						completed.push(path);
					}
				};
				if (!taskRecord) await this.withMigrationConfigLock(path, taskRecord, run);
				else {
					taskIdentity = await this.readTaskMigrationIdentity(path);
					if (taskIdentity) await this.withMigrationTaskLock({ id: taskIdentity, filePath: path }, run);
				}
			}
		} catch (error) {
			throw new Error(
				`Agent command migration partially completed (${completed.length} files): ${completed.join(", ")}. ${(error as Error).message}`,
				{ cause: error },
			);
		}
		return { migratedFiles: completed };
	}

	async migrateTaskAssigneesAndPriority(): Promise<{ migratedFiles: string[] }> {
		const config = await this.filesystem.loadConfig();
		const roots = [this.filesystem.tasksDir, this.filesystem.completedDir, await this.filesystem.getArchiveTasksDir()];
		const paths: string[] = [];
		for (const root of roots) {
			try {
				await access(root);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
			for await (const path of new Bun.Glob("*/task.md").scan({ cwd: root, absolute: true })) paths.push(path);
		}
		const completed: string[] = [];
		try {
			for (const path of paths) {
				const candidate = await this.readTaskFieldMigrationCandidate(path, config);
				if (!candidate) continue;
				await this.withMigrationTaskLock({ id: candidate.identity, filePath: path }, async () => {
					let original: string;
					try {
						original = await readFile(path, "utf8");
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
						throw error;
					}
					let document: Record<string, unknown>;
					let body: string;
					try {
						({ data: document, content: body } = parseFrontmatter(original));
					} catch {
						return;
					}
					if (typeof document.id === "string" && taskIdKey(document.id) !== taskIdKey(candidate.identity)) return;
					let changed = false;
					const assignee = document.assignee;
					if (assignee === null) {
						document.assignee = [];
						changed = true;
					} else if (typeof assignee === "string") {
						document.assignee = assignee.trim().length === 0 ? [] : [assignee];
						changed = true;
					} else if (Array.isArray(assignee) && assignee.some((entry) => typeof entry !== "string")) {
						document.assignee = assignee.map(String);
						changed = true;
					}
					const priority = document.priority;
					if (typeof priority === "string") {
						const canonical = resolvePriorityValue(priority, config) ?? normalizePriorityValue(priority);
						if (canonical !== undefined && canonical !== priority) {
							document.priority = canonical;
							changed = true;
						}
					}
					if (changed) {
						await this.replaceMigrationFile(path, stringifyFrontmatter(body, document));
						completed.push(path);
					}
				});
			}
		} catch (error) {
			throw new Error(
				`Task field migration partially completed (${completed.length} files): ${completed.join(", ")}.`,
				{ cause: error },
			);
		}
		return { migratedFiles: completed };
	}

	private parseAgentCommand(command: string): string[] {
		const argv: string[] = [];
		let token = "";
		let quote = "";
		let started = false;
		for (let i = 0; i < command.length; i++) {
			const c = command[i]!;
			if (quote === "'") {
				if (c === "'") quote = "";
				else if (c === "\n" || c === "\r") throw new Error("newline is not supported");
				else token += c;
				started = true;
				continue;
			}
			if (c === "\\" && quote !== "'") {
				if (++i >= command.length) throw new Error("malformed trailing escape");
				const escaped = command[i]!;
				if (escaped === "\n" || escaped === "\r") throw new Error("newline escape is not supported");
				if (quote === '"' && !["$", "`", '"', "\\"].includes(escaped)) token += `\\${escaped}`;
				else token += escaped;
				started = true;
				continue;
			}
			if (quote === '"') {
				if (c === '"') quote = "";
				else if (c === "$" || c === "`" || c === "\n" || c === "\r")
					throw new Error("expansion or newline is not supported");
				else token += c;
				started = true;
				continue;
			}
			if (c === "'" || c === '"') {
				quote = c;
				started = true;
				continue;
			}
			if (c === "\n" || c === "\r") throw new Error("newline is not supported");
			if (/\s/.test(c)) {
				if (started) {
					argv.push(token);
					token = "";
					started = false;
				}
				continue;
			}
			if (/[|&;<>`$()]/.test(c)) throw new Error("ambiguous shell expression");
			token += c;
			started = true;
		}
		if (quote) throw new Error("malformed quoting");
		if (started) argv.push(token);
		const checked = agentCommandArgvSchema.safeParse(argv);
		if (!checked.success) throw new Error(checked.error.issues[0]?.message ?? "invalid argv");
		return checked.data;
	}

	private serializeRawYaml(document: Record<string, unknown>): string {
		return Bun.YAML.stringify(document);
	}

	private async replaceMigrationFile(path: string, content: string): Promise<void> {
		const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
		try {
			let mode = 0o600;
			try {
				mode = (await stat(path)).mode & 0o7777;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			await writeFile(temporary, content, { flag: "wx", mode: 0o600 });
			await chmod(temporary, mode);
			await rename(temporary, path);
		} catch (error) {
			await unlink(temporary).catch((cleanup) => {
				if ((cleanup as NodeJS.ErrnoException).code !== "ENOENT") throw cleanup;
			});
			throw error;
		}
	}

	private async withConfigLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
		await mkdir(dirname(path), { recursive: true });
		const release = await lockfile.lock(path, {
			realpath: false,
			retries: { retries: 4, minTimeout: 25, maxTimeout: 200 },
		});
		try {
			return await operation();
		} finally {
			await release();
		}
	}

	private async withMigrationConfigLock<T>(
		path: string,
		taskRecord: boolean,
		operation: () => Promise<T>,
	): Promise<T | undefined> {
		for (let attempt = 0; ; attempt++) {
			try {
				return await this.withConfigLock(path, operation);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ELOCKED") throw error;
				if (!(await this.hasAgentCommandMigrationCandidate(path, taskRecord))) return;
				if (attempt === 19) throw error;
				await Bun.sleep(Math.min(25 * (attempt + 1), 250));
			}
		}
	}

	private async hasAgentCommandMigrationCandidate(path: string, taskRecord: boolean): Promise<boolean> {
		let original: string;
		try {
			original = await readFile(path, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
		try {
			const document = taskRecord ? parseFrontmatter(original).data : Bun.YAML.parse(original);
			if (!document || typeof document !== "object" || Array.isArray(document)) return false;
			const config = (document as Record<string, unknown>)[taskRecord ? "agentConfiguration" : "agent_configuration"];
			if (!config || typeof config !== "object" || Array.isArray(config)) return false;
			const presets = (config as Record<string, unknown>).presets;
			return (
				!!presets &&
				typeof presets === "object" &&
				!Array.isArray(presets) &&
				Object.values(presets).some(
					(preset) =>
						!!preset &&
						typeof preset === "object" &&
						!Array.isArray(preset) &&
						typeof (preset as Record<string, unknown>).command === "string",
				)
			);
		} catch (error) {
			if (taskRecord) return false;
			throw new Error(`Cannot migrate agent commands in ${path}: invalid document.`, { cause: error });
		}
	}

	private async withMigrationTaskLock<T>(
		task: Pick<Task, "id" | "filePath">,
		operation: () => Promise<T>,
	): Promise<T | undefined> {
		for (let attempt = 0; ; attempt++) {
			try {
				return await this.withTaskLock(task, operation);
			} catch (error) {
				const contention =
					(error as NodeJS.ErrnoException).code === "ELOCKED" ||
					(isTaskLockError(error) && (error.cause as NodeJS.ErrnoException | undefined)?.code === "ELOCKED");
				if (!contention) throw error;
				if (attempt === 19) return undefined;
				await Bun.sleep(25);
			}
		}
	}

	private async readTaskFieldMigrationCandidate(
		path: string,
		config: AgenticWorkspaceConfig | null,
	): Promise<{ identity: string } | null> {
		try {
			const { data } = parseFrontmatter(await readFile(path, "utf8"));
			const assignee = data.assignee;
			const needsAssigneeMigration =
				assignee === null ||
				typeof assignee === "string" ||
				(Array.isArray(assignee) && assignee.some((entry) => typeof entry !== "string"));
			const priority = data.priority;
			const canonicalPriority =
				typeof priority === "string"
					? (resolvePriorityValue(priority, config) ?? normalizePriorityValue(priority))
					: undefined;
			if (!needsAssigneeMigration && !(canonicalPriority !== undefined && canonicalPriority !== priority)) return null;
			return { identity: typeof data.id === "string" && data.id.length > 0 ? data.id : basename(dirname(path)) };
		} catch {
			return null;
		}
	}

	private async readTaskMigrationIdentity(path: string): Promise<string | null> {
		try {
			const { data } = parseFrontmatter(await readFile(path, "utf8"));
			return typeof data.id === "string" && data.id.length > 0 ? data.id : basename(dirname(path));
		} catch {
			return null;
		}
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
		await this.waitForAgentPresetMigration();
		return await this.filesystem.listTasks(filter);
	}

	async loadCompletedTasks(): Promise<Task[]> {
		await this.waitForAgentPresetMigration();
		return await this.filesystem.listCompletedTasks();
	}

	async loadArchivedTasks(): Promise<Task[]> {
		await this.waitForAgentPresetMigration();
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
		await this.waitForAgentPresetMigration();
		return await this.filesystem.loadTask(taskId, options);
	}

	async saveTask(task: Task, options: { approvalMutation?: boolean; create?: boolean } = {}): Promise<string> {
		return await this.filesystem.saveTask(task, options);
	}

	async loadTaskContent(taskId: string): Promise<string | null> {
		await this.waitForAgentPresetMigration();
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
		await this.waitForAgentPresetMigration();
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
