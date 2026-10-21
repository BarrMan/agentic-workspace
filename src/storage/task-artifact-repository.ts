import type { Dirent } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { resolveMainWorktreeRoot } from "../filesystem/git/main-worktree.ts";
import { taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { parseTask } from "./markdown/parser.ts";

const SIDECAR = ".artifacts.json";
const SIDECAR_LOCK = ".artifacts.json.lock";
const TASK_RECORD = "task.md";
const MAX_ARTIFACT_INSPECTION_BYTES = 128 * 1024;
const TASK_CONTAINER_LOCATIONS = ["tasks", "completed", "archive/tasks"] as const;
export type TaskContainerLocation = (typeof TASK_CONTAINER_LOCATIONS)[number];

export function validateTaskArtifactPath(path: string): string {
	if (
		typeof path !== "string" ||
		!path ||
		path.includes("\0") ||
		path.includes("\\") ||
		isAbsolute(path) ||
		/^[A-Za-z]:/.test(path) ||
		path.split("/").some((part) => !part || part === "." || part === "..") ||
		path === TASK_RECORD ||
		path === SIDECAR ||
		path === SIDECAR_LOCK ||
		path
			.split("/")
			.some(
				(part) => part.startsWith(".agentic-workspace-artifact-") || part.startsWith(".agentic-workspace-artifacts-"),
			)
	)
		throw new Error(`Invalid task artifact path: ${String(path)}`);
	return path;
}

export interface TaskArtifactRepositoryOptions {
	/** Canonical configured AgenticWorkspace directory (the directory containing tasks/). */
	agenticWorkspaceDirectory: string;
	/** Optional canonical task-container roots, keyed by their standard storage location. */
	filesystemRoots?: Partial<Record<TaskContainerLocation, string>>;
	/** Project/worktree root used to resolve registered linked worktrees to their main root. */
	projectRoot?: string;
	/** Called for artifact mutations, separately from task-record mutations. */
	onMutation?: (event: { taskId: string; path?: string; root: string; type: "artifact" }) => void | Promise<void>;
}

export interface TaskArtifactEntry {
	path: string;
	size: number;
	type: "text" | "binary";
}

/** Durable, lazy task-container artifact files. */
export class TaskArtifactRepository {
	private readonly agenticWorkspaceDirectory: string;
	private readonly projectRoot?: string;
	private readonly filesystemRoots: Partial<Record<TaskContainerLocation, string>>;
	private readonly onMutation?: TaskArtifactRepositoryOptions["onMutation"];
	private readonly validatedRecords = new Map<string, { content: string; id: string }>();

	constructor(options: TaskArtifactRepositoryOptions) {
		this.agenticWorkspaceDirectory = resolve(options.agenticWorkspaceDirectory);
		this.projectRoot = options.projectRoot ? resolve(options.projectRoot) : undefined;
		this.filesystemRoots = options.filesystemRoots ?? {};
		this.onMutation = options.onMutation;
	}

	private canonicalId(taskId: string): string {
		return taskIdKey(taskId);
	}

	private async root(): Promise<string> {
		if (!this.projectRoot) return this.agenticWorkspaceDirectory;
		const main = await resolveMainWorktreeRoot(this.projectRoot);
		if (main) {
			const configuredRelative = relative(this.projectRoot, this.agenticWorkspaceDirectory);
			if (configuredRelative.startsWith(`..${sep}`) || configuredRelative === ".." || isAbsolute(configuredRelative))
				throw new Error("Configured AgenticWorkspace directory is outside the project root.");
			return resolve(main, configuredRelative);
		}
		try {
			const gitEntry = await lstat(resolve(this.projectRoot, ".git"));
			if (gitEntry.isFile())
				throw new Error(
					"Cannot resolve the main Git worktree for this linked worktree; refusing to create a second task store.",
				);
		} catch (error) {
			if (error instanceof Error && error.message.includes("Cannot resolve")) throw error;
		}
		return this.agenticWorkspaceDirectory;
	}

	async containerPath(taskId: string, location?: TaskContainerLocation): Promise<string> {
		const root = await this.root();
		const canonicalTaskId = taskIdKey(taskId);
		const id = this.canonicalId(canonicalTaskId).toLowerCase();
		const locationPath = (base: TaskContainerLocation): string => {
			const configured = this.filesystemRoots[base];
			return configured ? resolve(root, configured, id) : resolve(root, base, id);
		};
		if (location) {
			const candidate = locationPath(location);
			await this.validateContainer(candidate, canonicalTaskId, false);
			return candidate;
		}
		const liveMatches: string[] = [];
		const archivedMatches: string[] = [];
		for (const base of TASK_CONTAINER_LOCATIONS) {
			const candidate = locationPath(base);
			try {
				const info = await lstat(candidate);
				if (!info.isDirectory() || info.isSymbolicLink())
					throw new Error(`Task container is not a real directory: ${candidate}`);
				await this.validateContainer(candidate, canonicalTaskId, true);
				(base.startsWith("archive/") ? archivedMatches : liveMatches).push(candidate);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					const exists = await lstat(candidate).then(
						() => true,
						() => false,
					);
					if (exists)
						throw new Error(`Task container ${candidate} has no ${TASK_RECORD}; repair or remove it explicitly.`);
					continue;
				}
				throw error;
			}
		}
		const matches = [...liveMatches, ...archivedMatches];
		if (matches.length > 1) throw new Error(`Task ${taskId} has multiple task containers: ${matches.join(", ")}`);
		if (matches.length === 1) return matches[0] as string;
		return archivedMatches[0] ?? resolve(root, "tasks", id);
	}

	private async validateContainer(
		container: string,
		taskId: string,
		requireRecord: boolean,
		content?: string,
	): Promise<void> {
		try {
			const info = await lstat(container);
			if (!info.isDirectory() || info.isSymbolicLink())
				throw new Error(`Task container is not a real directory: ${container}`);
			const canonicalRoot = await realpath(await this.root());
			const canonicalContainer = await realpath(container);
			const containerRelative = relative(canonicalRoot, canonicalContainer);
			if (containerRelative === ".." || containerRelative.startsWith(`..${sep}`) || isAbsolute(containerRelative))
				throw new Error(`Task container resolves outside canonical AgenticWorkspace storage: ${container}`);
			const recordPath = resolve(container, TASK_RECORD);
			const recordInfo = await lstat(recordPath);
			if (!recordInfo.isFile() || recordInfo.isSymbolicLink())
				throw new Error(`Task record must be a regular file: ${recordPath}`);
			const canonicalRecord = await realpath(recordPath);
			const recordRelative = relative(canonicalContainer, canonicalRecord);
			if (recordRelative === ".." || recordRelative.startsWith(`..${sep}`) || isAbsolute(recordRelative))
				throw new Error(`Task record resolves outside its container: ${recordPath}`);
			const raw = content ?? (await readFile(recordPath, "utf8"));
			const cached = this.validatedRecords.get(canonicalRecord);
			const taskIdFromRecord = cached?.content === raw ? cached.id : parseTask(raw).id;
			if (
				!taskIdsEqual(taskIdFromRecord, taskId) ||
				this.canonicalId(taskIdFromRecord) !== this.canonicalId(basename(container))
			)
				throw new Error(
					`Task container ${container} identity does not match its validated ${TASK_RECORD} record (${taskIdFromRecord}).`,
				);
			this.validatedRecords.set(canonicalRecord, { content: raw, id: taskIdFromRecord });
		} catch (error) {
			if (!requireRecord && (error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
	}

	private async artifactsDirectory(container: string, create = false): Promise<string> {
		const directory = resolve(container, "artifacts");
		try {
			await lstat(directory);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !create) throw error;
			await mkdir(directory, { recursive: true });
		}
		const info = await lstat(directory);
		if (!info.isDirectory() || info.isSymbolicLink())
			throw new Error(`Task artifacts path is not a real directory: ${directory}`);
		return directory;
	}

	private async artifactPath(
		taskId: string,
		path: string,
		createParents = false,
		location?: TaskContainerLocation,
	): Promise<string> {
		const container = await this.containerPath(taskId, location);
		const validated = validateTaskArtifactPath(path);
		let directoryExists = true;
		const directory = await this.artifactsDirectory(container, createParents).catch((error) => {
			if (!createParents && (error as NodeJS.ErrnoException).code === "ENOENT") {
				directoryExists = false;
				return resolve(container, "artifacts");
			}
			throw error;
		});
		const target = resolve(directory, ...validated.split("/"));
		if (!target.startsWith(`${directory}${sep}`))
			throw new Error("Artifact path escapes the task artifacts directory.");
		if (directoryExists) await this.assertContained(directory, target, true);
		if (createParents) {
			await mkdir(dirname(target), { recursive: true });
			await this.assertContained(directory, target, true);
		}
		return target;
	}

	async resolve(taskId: string, relativePath: string, location?: TaskContainerLocation): Promise<string> {
		return await this.artifactPath(taskId, validateTaskArtifactPath(relativePath), false, location);
	}

	private async assertContained(container: string, target: string, allowMissing: boolean): Promise<void> {
		const realContainer = await realpath(container);
		let cursor = target;
		const missing: string[] = [];
		while (true) {
			try {
				await lstat(cursor);
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !allowMissing) throw error;
				missing.unshift(cursor);
				const parent = dirname(cursor);
				if (parent === cursor) throw error;
				cursor = parent;
			}
		}
		const realExisting = await realpath(cursor);
		const existingRelative = relative(realContainer, realExisting);
		if (existingRelative === ".." || existingRelative.startsWith(`..${sep}`) || isAbsolute(existingRelative))
			throw new Error("Artifact path resolves outside the task artifacts directory.");
		const resolvedTarget = resolve(realExisting, ...missing.map((path) => path.slice(cursor.length + 1)));
		const rel = relative(realContainer, resolvedTarget);
		if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
			throw new Error("Artifact path resolves outside the task artifacts directory.");
	}

	async list(taskId: string, location?: TaskContainerLocation): Promise<TaskArtifactEntry[]> {
		const container = await this.containerPath(taskId, location);
		const directory = await this.artifactsDirectory(container).catch((error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		});
		if (!directory) return [];
		const results: TaskArtifactEntry[] = [];
		const visit = async (directory: string, prefix: string): Promise<void> => {
			let entries: Dirent[];
			try {
				entries = await readdir(directory, { withFileTypes: true });
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
				throw error;
			}
			for (const entry of entries) {
				if (entry.isSymbolicLink()) continue;
				const path = prefix ? `${prefix}/${entry.name}` : entry.name;
				if (
					path === SIDECAR ||
					path === SIDECAR_LOCK ||
					entry.name.startsWith(".agentic-workspace-artifact-") ||
					entry.name.startsWith(".agentic-workspace-artifacts-") ||
					entry.name.startsWith(".task-")
				)
					continue;
				if (entry.isDirectory()) {
					await visit(resolve(directory, entry.name), path);
					continue;
				}
				if (!entry.isFile()) continue;
				const target = resolve(directory, entry.name);
				const info = await stat(target);
				const handle = await open(target, "r");
				let bytes: Uint8Array;
				try {
					const buffer = new Uint8Array(Math.min(info.size, MAX_ARTIFACT_INSPECTION_BYTES));
					const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
					bytes = buffer.subarray(0, bytesRead);
				} finally {
					await handle.close();
				}
				let text = !bytes.includes(0);
				if (text && bytes.length) {
					try {
						new TextDecoder("utf-8", { fatal: true }).decode(bytes);
					} catch {
						text = false;
					}
				}
				results.push({
					path,
					size: info.size,
					type: text ? "text" : "binary",
				});
			}
		};
		await visit(directory, "");
		return results.sort((a, b) => a.path.localeCompare(b.path));
	}

	async read(taskId: string, relativePath: string, location?: TaskContainerLocation): Promise<Uint8Array> {
		const path = validateTaskArtifactPath(relativePath);
		return await readFile(await this.artifactPath(taskId, path, false, location));
	}

	async write(
		taskId: string,
		relativePath: string,
		bytes: Uint8Array,
		location?: TaskContainerLocation,
	): Promise<void> {
		const path = validateTaskArtifactPath(relativePath);
		const target = await this.artifactPath(taskId, path, true, location);
		const temp = resolve(dirname(target), `.agentic-workspace-artifact-${crypto.randomUUID()}.tmp`);
		await writeFile(temp, bytes, { flag: "wx" });
		await rename(temp, target);
		await this.onMutation?.({ taskId: this.canonicalId(taskId), path, root: await this.root(), type: "artifact" });
	}
}
