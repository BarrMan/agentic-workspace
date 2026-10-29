import type { Dirent } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { resolveMainWorktreeRoot } from "../filesystem/git/main-worktree.ts";
import {
	TASK_ARTIFACT_TEMP_PREFIX,
	TASK_ARTIFACTS_DIRECTORY,
	TASK_CONTAINER_LOCATIONS,
	TASK_RECORD_FILENAME,
} from "./task-layout.ts";

const MAX_ARTIFACT_INSPECTION_BYTES = 128 * 1024;
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
		path.split("/").some((part) => part.startsWith(TASK_ARTIFACT_TEMP_PREFIX))
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

	constructor(options: TaskArtifactRepositoryOptions) {
		this.agenticWorkspaceDirectory = resolve(options.agenticWorkspaceDirectory);
		this.projectRoot = options.projectRoot ? resolve(options.projectRoot) : undefined;
		this.filesystemRoots = options.filesystemRoots ?? {};
	}

	private async root(): Promise<string> {
		if (!this.projectRoot) return this.agenticWorkspaceDirectory;
		const main = await resolveMainWorktreeRoot(this.projectRoot);
		if (main) {
			const configuredRelative = relative(this.projectRoot, this.agenticWorkspaceDirectory);
			if (configuredRelative.startsWith(`..${sep}`) || configuredRelative === ".." || isAbsolute(configuredRelative))
				return this.agenticWorkspaceDirectory;
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
		const canonicalTaskId = taskId;
		const id = canonicalTaskId.toLowerCase();
		const locationPath = (base: TaskContainerLocation): string => {
			const configured = this.filesystemRoots[base];
			return configured ? resolve(root, configured, id) : resolve(root, base, id);
		};
		if (location) {
			const candidate = locationPath(location);
			await this.validateContainer(candidate, false);
			return candidate;
		}
		for (const base of TASK_CONTAINER_LOCATIONS) {
			const candidate = locationPath(base);
			try {
				const info = await lstat(candidate);
				if (!info.isDirectory() || info.isSymbolicLink())
					throw new Error(`Task container is not a real directory: ${candidate}`);
				await this.validateContainer(candidate, true);
				return candidate;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") {
					const exists = await lstat(candidate).then(
						() => true,
						() => false,
					);
					if (exists)
						throw new Error(
							`Task container ${candidate} has no ${TASK_RECORD_FILENAME}; repair or remove it explicitly.`,
						);
					continue;
				}
				throw error;
			}
		}
		return resolve(root, "tasks", id);
	}

	private async validateContainer(container: string, requireRecord: boolean): Promise<void> {
		try {
			const info = await lstat(container);
			if (!info.isDirectory() || info.isSymbolicLink())
				throw new Error(`Task container is not a real directory: ${container}`);
			const canonicalRoot = await realpath(await this.root());
			const canonicalContainer = await realpath(container);
			const containerRelative = relative(canonicalRoot, canonicalContainer);
			if (containerRelative === ".." || containerRelative.startsWith(`..${sep}`) || isAbsolute(containerRelative))
				throw new Error(`Task container resolves outside canonical AgenticWorkspace storage: ${container}`);
			const recordPath = resolve(container, TASK_RECORD_FILENAME);
			const recordInfo = await lstat(recordPath);
			if (!recordInfo.isFile() || recordInfo.isSymbolicLink())
				throw new Error(`Task record must be a regular file: ${recordPath}`);
			const canonicalRecord = await realpath(recordPath);
			const recordRelative = relative(canonicalContainer, canonicalRecord);
			if (recordRelative === ".." || recordRelative.startsWith(`..${sep}`) || isAbsolute(recordRelative))
				throw new Error(`Task record resolves outside its container: ${recordPath}`);
		} catch (error) {
			if (!requireRecord && (error as NodeJS.ErrnoException).code === "ENOENT") return;
			throw error;
		}
	}

	private async artifactsDirectory(container: string): Promise<string> {
		const directory = resolve(container, TASK_ARTIFACTS_DIRECTORY);
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
		const directory = await this.artifactsDirectory(container);
		const target = resolve(directory, ...validated.split("/"));
		if (!target.startsWith(`${directory}${sep}`))
			throw new Error("Artifact path escapes the task artifacts directory.");
		await this.assertContained(directory, target, true);
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
		const directory = await this.artifactsDirectory(container);
		const results: TaskArtifactEntry[] = [];
		const visit = async (directory: string, prefix: string): Promise<void> => {
			let entries: Dirent[];
			entries = await readdir(directory, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isSymbolicLink()) continue;
				const path = prefix ? `${prefix}/${entry.name}` : entry.name;
				if (entry.name.startsWith(TASK_ARTIFACT_TEMP_PREFIX)) continue;
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
		const temp = resolve(dirname(target), `${TASK_ARTIFACT_TEMP_PREFIX}${crypto.randomUUID()}.tmp`);
		await writeFile(temp, bytes, { flag: "wx" });
		await rename(temp, target);
	}
}
