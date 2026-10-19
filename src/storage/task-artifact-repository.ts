import { createHash } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { resolveMainWorktreeRoot } from "../filesystem/git/main-worktree.ts";
import type { ArtifactApprovalSidecar, ArtifactStatus } from "../model/session/types.ts";
import { taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { parseTask } from "./markdown/parser.ts";

const SIDECAR = ".artifacts.json";
const SIDECAR_LOCK = ".artifacts.json.lock";
const TASK_RECORD = "task.md";
const HASH = /^[a-f0-9]{64}$/;
const MAX_ARTIFACT_INSPECTION_BYTES = 128 * 1024;
type ArtifactLockOwner = { token?: string; pid?: number };
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

function fingerprint(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function fingerprintFile(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest("hex");
}

function emptyApprovals(): ArtifactApprovalSidecar["approvals"] {
	return Object.create(null) as ArtifactApprovalSidecar["approvals"];
}

function validateSidecar(value: unknown): ArtifactApprovalSidecar {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Invalid artifact approval metadata.");
	const sidecar = value as ArtifactApprovalSidecar;
	if (
		sidecar.version !== 1 ||
		!sidecar.approvals ||
		typeof sidecar.approvals !== "object" ||
		Array.isArray(sidecar.approvals)
	)
		throw new Error("Unsupported or invalid artifact approval metadata.");
	const approvals = emptyApprovals();
	for (const [path, approval] of Object.entries(sidecar.approvals)) {
		validateTaskArtifactPath(path);
		if (
			!approval ||
			!HASH.test(approval.sha256) ||
			typeof approval.approvedAt !== "string" ||
			!Number.isFinite(Date.parse(approval.approvedAt))
		)
			throw new Error(`Invalid approval metadata for ${path}.`);
		Object.defineProperty(approvals, path, { value: approval, writable: true, enumerable: true, configurable: true });
	}
	return { version: 1, approvals };
}

export interface TaskArtifactRepositoryOptions {
	/** Canonical configured AgenticWorkspace directory (the directory containing tasks/). */
	agenticWorkspaceDirectory: string;
	/** Optional canonical task-container roots, keyed by their standard storage location. */
	filesystemRoots?: Partial<Record<TaskContainerLocation, string>>;
	/** Project/worktree root used to resolve registered linked worktrees to their main root. */
	projectRoot?: string;
	/** Called for artifact mutations, separately from task-record mutations. */
	onMutation?: (event: {
		taskId: string;
		path?: string;
		root: string;
		type: "artifact" | "approval";
	}) => void | Promise<void>;
}

export interface TaskArtifactEntry extends ArtifactStatus {
	bytes?: Uint8Array;
	size: number;
	type: "text" | "binary";
}

/** Durable, lazy task-container artifacts and content-bound approval metadata. */
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

	private async readSidecar(container: string): Promise<ArtifactApprovalSidecar> {
		try {
			await this.assertContained(container, resolve(container, SIDECAR), true);
			if ((await lstat(resolve(container, SIDECAR))).isSymbolicLink())
				throw new Error("Artifact approval metadata may not be a symbolic link.");
			return validateSidecar(JSON.parse(await readFile(resolve(container, SIDECAR), "utf8")));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, approvals: emptyApprovals() };
			throw new Error(
				`Cannot read artifact approval metadata: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async pruneStaleApprovals(directory: string, sidecar: ArtifactApprovalSidecar): Promise<boolean> {
		let changed = false;
		for (const [path, approval] of Object.entries(sidecar.approvals)) {
			const target = resolve(directory, ...validateTaskArtifactPath(path).split("/"));
			await this.assertContained(directory, target, true);
			try {
				if (fingerprint(await readFile(target)) !== approval.sha256) {
					delete sidecar.approvals[path];
					changed = true;
				}
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				delete sidecar.approvals[path];
				changed = true;
			}
		}
		return changed;
	}

	private async statusAt(
		taskId: string,
		path: string,
		sidecar?: ArtifactApprovalSidecar,
		location?: TaskContainerLocation,
	): Promise<ArtifactStatus> {
		const container = await this.containerPath(taskId, location);
		const directory = await this.artifactsDirectory(container).catch((error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return resolve(container, "artifacts");
			throw error;
		});
		const approvals = sidecar ?? (await this.readSidecar(directory));
		const target = await this.artifactPath(taskId, path, false, location);
		let bytes: Uint8Array;
		try {
			bytes = await readFile(target);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, state: "missing" };
			throw error;
		}
		const sha256 = fingerprint(bytes);
		const approval = Object.hasOwn(approvals.approvals, path) ? approvals.approvals[path] : undefined;
		return approval?.sha256 === sha256
			? { path, state: "approved", sha256, approvedAt: approval.approvedAt }
			: { path, state: "draft", sha256 };
	}

	async status(taskId: string, relativePath: string, location?: TaskContainerLocation): Promise<ArtifactStatus> {
		const path = validateTaskArtifactPath(relativePath);
		return await this.statusAt(taskId, path, undefined, location);
	}

	async list(taskId: string, location?: TaskContainerLocation): Promise<TaskArtifactEntry[]> {
		const container = await this.containerPath(taskId, location);
		const directory = await this.artifactsDirectory(container).catch((error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		});
		if (!directory) return [];
		const sidecar = await this.readSidecar(directory);
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
				const approval = Object.hasOwn(sidecar.approvals, path) ? sidecar.approvals[path] : undefined;
				const sha256 =
					info.size <= MAX_ARTIFACT_INSPECTION_BYTES
						? fingerprint(await readFile(target))
						: approval
							? await fingerprintFile(target)
							: undefined;
				results.push({
					path,
					state: sha256 && approval?.sha256 === sha256 ? "approved" : "draft",
					...(sha256 ? { sha256 } : {}),
					...(sha256 && approval?.sha256 === sha256 ? { approvedAt: approval.approvedAt } : {}),
					size: info.size,
					type: text ? "text" : "binary",
				});
			}
		};
		await visit(directory, "");
		return results.sort((a, b) => a.path.localeCompare(b.path));
	}

	async read(
		taskId: string,
		relativePath: string,
		location?: TaskContainerLocation,
	): Promise<{ bytes: Uint8Array; status: ArtifactStatus }> {
		const path = validateTaskArtifactPath(relativePath);
		const container = await this.containerPath(taskId, location);
		const directory = await this.artifactsDirectory(container).catch((error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return resolve(container, "artifacts");
			throw error;
		});
		const sidecar = await this.readSidecar(directory);
		const bytes = await readFile(await this.artifactPath(taskId, path, false, location));
		const sha256 = fingerprint(bytes);
		const approval = Object.hasOwn(sidecar.approvals, path) ? sidecar.approvals[path] : undefined;
		const status: ArtifactStatus =
			approval?.sha256 === sha256
				? { path, state: "approved", sha256, approvedAt: approval.approvedAt }
				: { path, state: "draft", sha256 };
		return { bytes, status };
	}

	private async withMetadataLock<T>(directory: string, run: () => Promise<T>): Promise<T> {
		const lockPath = resolve(directory, SIDECAR_LOCK);
		const token = crypto.randomUUID();
		let handle: FileHandle | undefined;
		for (let attempt = 0; attempt < 200; attempt++) {
			try {
				handle = await open(lockPath, "wx");
				await handle.writeFile(JSON.stringify({ token, pid: process.pid }));
				break;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
				const contents = await readFile(lockPath, "utf8").catch(() => "");
				let owner: ArtifactLockOwner | null = null;
				try {
					owner = JSON.parse(contents || "null") as ArtifactLockOwner | null;
				} catch {
					// Leave an unrecognized lock untouched.
				}
				if (owner?.token && Number.isSafeInteger(owner.pid) && (await lstat(lockPath).catch(() => null))) {
					let alive = true;
					try {
						process.kill(owner.pid as number, 0);
					} catch (probeError) {
						alive = (probeError as NodeJS.ErrnoException).code !== "ESRCH";
					}
					if (!alive && (await readFile(lockPath, "utf8").catch(() => "")) === contents) {
						await rm(lockPath, { force: true });
						continue;
					}
				}
				await Bun.sleep(10);
			}
		}
		if (!handle) throw new Error("Timed out waiting for task artifact metadata lock.");
		const refresh = setInterval(() => {
			const now = new Date();
			void utimes(lockPath, now, now).catch(() => {});
		}, 10_000);
		try {
			return await run();
		} finally {
			clearInterval(refresh);
			const contents = await readFile(lockPath, "utf8").catch(() => "");
			await handle.close();
			let stillOwner = false;
			try {
				stillOwner = (JSON.parse(contents || "null") as { token?: string } | null)?.token === token;
			} catch {
				// Ownership cannot be established, so leave the lock in place.
			}
			if (stillOwner) await rm(lockPath, { force: true });
		}
	}

	private async writeSidecar(directory: string, sidecar: ArtifactApprovalSidecar): Promise<void> {
		const target = resolve(directory, SIDECAR);
		const temp = resolve(directory, `.agentic-workspace-artifacts-${crypto.randomUUID()}.tmp`);
		await writeFile(temp, `${JSON.stringify(sidecar, null, 2)}\n`, { flag: "wx" });
		await rename(temp, target);
	}

	async write(
		taskId: string,
		relativePath: string,
		bytes: Uint8Array,
		location?: TaskContainerLocation,
	): Promise<ArtifactStatus> {
		const path = validateTaskArtifactPath(relativePath);
		const container = await this.containerPath(taskId, location);
		const target = await this.artifactPath(taskId, path, true, location);
		const directory = await this.artifactsDirectory(container);
		const nextHash = fingerprint(bytes);
		await this.withMetadataLock(directory, async () => {
			const previous = await readFile(target).catch((error) =>
				(error as NodeJS.ErrnoException).code === "ENOENT" ? null : Promise.reject(error),
			);
			const sidecar = await this.readSidecar(directory);
			const pruned = await this.pruneStaleApprovals(directory, sidecar);
			if (!previous || fingerprint(previous) !== nextHash) {
				delete sidecar.approvals[path];
				if (await Bun.file(resolve(directory, SIDECAR)).exists()) await this.writeSidecar(directory, sidecar);
			} else if (pruned) {
				await this.writeSidecar(directory, sidecar);
			}
			const temp = resolve(dirname(target), `.agentic-workspace-artifact-${crypto.randomUUID()}.tmp`);
			await writeFile(temp, bytes, { flag: "wx" });
			await rename(temp, target);
		});
		await this.onMutation?.({ taskId: this.canonicalId(taskId), path, root: await this.root(), type: "artifact" });
		return await this.statusAt(taskId, path, undefined, location);
	}

	async approveCurrentVersion(
		taskId: string,
		relativePath: string,
		reviewedHash: string,
		location?: TaskContainerLocation,
	): Promise<ArtifactStatus> {
		const path = validateTaskArtifactPath(relativePath);
		if (!HASH.test(reviewedHash)) throw new Error("Invalid reviewed artifact hash.");
		const container = await this.containerPath(taskId, location);
		const directory = await this.artifactsDirectory(container, true);
		const target = await this.artifactPath(taskId, path, false, location);
		return await this.withMetadataLock<ArtifactStatus>(directory, async () => {
			const bytes = await readFile(target);
			const currentHash = fingerprint(bytes);
			if (currentHash !== reviewedHash)
				throw new Error("Artifact changed since it was reviewed; refresh before approving.");
			const sidecar = await this.readSidecar(directory);
			await this.pruneStaleApprovals(directory, sidecar);
			const approvedAt = new Date().toISOString();
			sidecar.approvals[path] = { sha256: reviewedHash, approvedAt };
			await this.writeSidecar(directory, sidecar);
			return { path, state: "approved", sha256: reviewedHash, approvedAt };
		}).then(async (result) => {
			await this.onMutation?.({ taskId: this.canonicalId(taskId), path, root: await this.root(), type: "approval" });
			return result;
		});
	}

	async revokeApproval(
		taskId: string,
		relativePath: string,
		location?: TaskContainerLocation,
	): Promise<ArtifactStatus> {
		const path = validateTaskArtifactPath(relativePath);
		const container = await this.containerPath(taskId, location);
		try {
			await lstat(container);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, state: "missing" };
			throw error;
		}
		const directory = await this.artifactsDirectory(container).catch((error) => {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
			throw error;
		});
		if (!directory) return { path, state: "missing" };
		const result = await this.withMetadataLock(directory, async () => {
			const sidecar = await this.readSidecar(directory);
			await this.pruneStaleApprovals(directory, sidecar);
			delete sidecar.approvals[path];
			if (await Bun.file(resolve(directory, SIDECAR)).exists()) await this.writeSidecar(directory, sidecar);
			return await this.statusAt(taskId, path, sidecar, location);
		});
		await this.onMutation?.({ taskId: this.canonicalId(taskId), path, root: await this.root(), type: "approval" });
		return result;
	}
}
