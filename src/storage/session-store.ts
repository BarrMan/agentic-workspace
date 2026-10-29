import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, readdir, realpath, rename, rm, rmdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { findGitWorktreeRoot, resolveMainWorktreeRootSync } from "../filesystem/git/main-worktree.ts";
import { GitOperations } from "../filesystem/git/operations.ts";
import { LockOwner } from "../filesystem/lock-owner.ts";
import { count, debug, isEnabled } from "../lib/debug-log.ts";
import { slug } from "../lib/slug.ts";
import {
	type AgentSession,
	type AgentSessionPathContext,
	NATIVE_AGENT_NAMESPACES,
	type TaskSessions,
} from "../model/session/types.ts";
import { SessionMutationError } from "./errors/session.ts";

export interface PersistedSessionState {
	version: 2;
	taskId: string;
	modes: NonNullable<TaskSessions["modes"]>;
	worktreePath?: string;
	hasSuccessfulSession?: boolean;
}

export interface SessionPaths {
	taskDir: string;
	statePath: string;
}

export interface InsertedTaskState {
	taskDir: string;
	statePath: string;
	stateContent: Buffer;
	createdDirectories: string[];
}

/**
 * True when `mkdir -p path` would succeed, without creating anything. Walks up to the nearest
 * existing ancestor, because the directory itself usually does not exist yet.
 * Never throws.
 */
async function isWritable(path: string): Promise<boolean> {
	try {
		let candidate = path;
		for (;;) {
			try {
				// An existing non-directory (or an existing directory we cannot write) is fatal for
				// this path; anything else means `mkdir -p` here cannot work.
				if (!(await stat(candidate)).isDirectory()) return false;
				await access(candidate, constants.W_OK);
				return true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
			}
			const parent = dirname(candidate);
			if (parent === candidate) return false;
			candidate = parent;
		}
	} catch {
		return false;
	}
}

export interface ProjectStateRootOptions {
	/** Supplied by a caller that has validated the runtime instance's project identity. */
	stateRoot?: string;
}

function stateRootContext(rootDir: string, options: ProjectStateRootOptions) {
	return {
		projectRoot: resolve(resolveMainWorktreeRootSync(rootDir) ?? rootDir),
		home: resolve(process.env.HOME ?? "/tmp"),
		executionRoots: [resolve(process.cwd()), resolve(process.env.AGENTIC_WORKSPACE_CWD ?? rootDir)],
		stateRoot: options.stateRoot,
	};
}

function externalStateRoot(projectRoot: string, home: string): string {
	const hash = createHash("sha256").update(projectRoot).digest("hex").slice(0, 16);
	return join(home, ".agentic-workspace", hash);
}

/** Inspect only the store directory and its immediate task containers, without reading records. */
async function hasStoreEvidence(root: string): Promise<boolean> {
	try {
		const metadata = await lstat(root);
		if (!metadata.isDirectory() && !metadata.isSymbolicLink()) return false;
		const entries = await readdir(root, { withFileTypes: true }).catch((error: unknown) => {
			throw new Error(`Cannot inspect agent state directory ${root}.`, { cause: error });
		});
		for (const entry of entries) {
			if (entry.name === "view-state.json") return true;
			if (
				(!entry.isDirectory() && !entry.isSymbolicLink()) ||
				entry.name === "agent-workspace" ||
				entry.name === "agent-requests"
			)
				continue;
			const files = await readdir(join(root, entry.name)).catch((error: unknown) => {
				throw new Error(`Cannot inspect agent state container ${join(root, entry.name)}.`, { cause: error });
			});
			if (files.some((name) => name === "state.json" || /\.(mode|lock|log|md)$/.test(name))) return true;
		}
		return false;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw new Error(`Cannot inspect agent state at ${root}; no state was changed.`, { cause: error });
	}
}

async function resolveStateRoot(context: ReturnType<typeof stateRootContext>): Promise<string> {
	const { projectRoot, home, executionRoots, stateRoot } = context;
	const primary = join(projectRoot, ".agentic-workspace");
	const external = externalStateRoot(projectRoot, home);
	// A validated instance may retain its external root after HOME changes.
	const validExternal =
		stateRoot !== undefined &&
		basename(dirname(stateRoot)) === ".agentic-workspace" &&
		basename(stateRoot) === basename(external);
	if (
		stateRoot !== undefined &&
		(!isAbsolute(stateRoot) || resolve(stateRoot) !== stateRoot || (stateRoot !== primary && !validExternal))
	)
		throw new Error(`Invalid agent state root ${JSON.stringify(stateRoot)} for project ${projectRoot}.`);

	const otherExecutionRoots = new Set<string>();
	const gitRoot = await findGitWorktreeRoot(projectRoot, { strict: true });
	if (gitRoot) {
		const registered = await new GitOperations(gitRoot).listWorktreePaths();
		if (registered.length === 0)
			throw new Error(`Cannot inspect registered worktrees for ${projectRoot}; no state was changed.`);
		const projectIdentity = await realpath(projectRoot);
		const projectOffset = relative(gitRoot, projectRoot);
		const executionIdentities = await Promise.all(
			executionRoots.map(async (root) => ({
				root,
				identity: await realpath(root).catch((error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") return root;
					throw error;
				}),
			})),
		);
		for (const worktree of registered) {
			const candidate = join(worktree, projectOffset);
			const identity = await realpath(candidate).catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return candidate;
				throw error;
			});
			if (identity !== projectIdentity) otherExecutionRoots.add(candidate);
			for (const execution of executionIdentities) {
				const offset = relative(identity, execution.identity);
				if (
					(offset === "" && identity !== projectIdentity) ||
					(offset && offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset))
				)
					otherExecutionRoots.add(execution.root);
			}
		}
	}
	const existing = new Map<string, string>();
	for (const candidate of new Set([primary, external, ...(stateRoot ? [stateRoot] : [])])) {
		if (await hasStoreEvidence(candidate)) {
			const identity = await realpath(candidate);
			if (!existing.has(identity)) existing.set(identity, candidate);
		}
	}
	const storageHomes = new Set([home, ...(validExternal && stateRoot ? [dirname(dirname(stateRoot))] : [])]);
	const conflicts = new Map<string, string>();
	for (const root of otherExecutionRoots) {
		const candidates = [
			join(root, ".agentic-workspace"),
			...[...storageHomes].map((base) => externalStateRoot(root, base)),
		];
		for (const candidate of candidates) {
			if (await hasStoreEvidence(candidate)) {
				const identity = await realpath(candidate);
				if (!existing.has(identity)) conflicts.set(identity, candidate);
			}
		}
	}
	const selectedIdentity = stateRoot
		? await realpath(stateRoot).catch((error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return stateRoot;
				throw error;
			})
		: undefined;
	if (
		conflicts.size ||
		existing.size > 1 ||
		(selectedIdentity && [...existing.keys()].some((root) => root !== selectedIdentity))
	)
		throw new Error(
			`Ambiguous agent state for project ${projectRoot}: ${[...existing.values(), ...conflicts.values(), ...(stateRoot ? [stateRoot] : [])].join(", ")}. No state was changed; reconcile these stores explicitly before continuing.`,
		);
	const selected = stateRoot ?? existing.values().next().value;
	if (selected) return selected;
	if (await isWritable(primary)) return primary;
	if (await isWritable(external)) return external;
	throw new Error(`No writable agent state root for project ${projectRoot}; no state was changed.`);
}

/** Resolve canonical project storage without creating, moving, or merging state. */
export function resolveProjectStateRoot(rootDir: string, options: ProjectStateRootOptions = {}): Promise<string> {
	return resolveStateRoot(stateRootContext(rootDir, options));
}

/** Atomic write: a uniquely-named sibling temp file, then `rename`. Readers never see a torn file. */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
	const temporary = `${path}.${randomUUID()}.tmp`;
	await Bun.write(temporary, content);
	await rename(temporary, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	return Object.keys(value).every((key) => keys.includes(key));
}

function isSession(value: unknown, taskId: string): value is AgentSession {
	if (!isRecord(value)) return false;
	if (typeof value.taskId !== "string" || value.taskId !== taskId) return false;
	for (const key of ["id", "preset", "tmuxName", "createdAt", "outputPath", "bootstrapPath"]) {
		if (typeof value[key] !== "string") return false;
	}
	return (
		(value.pathContext === undefined || isAgentSessionPathContext(value.pathContext)) &&
		(value.nativeProvider === undefined ||
			(typeof value.nativeProvider === "string" &&
				NATIVE_AGENT_NAMESPACES.includes(value.nativeProvider as (typeof NATIVE_AGENT_NAMESPACES)[number]))) &&
		["nativeSessionId", "lastUsedAt"].every((key) => value[key] === undefined || typeof value[key] === "string") &&
		(value.ownerPid === undefined || typeof value.ownerPid === "number") &&
		(value.useCount === undefined || (typeof value.useCount === "number" && value.useCount >= 0))
	);
}

function isAgentSessionPathContext(value: unknown): value is AgentSessionPathContext {
	if (!isRecord(value) || !hasOnlyKeys(value, ["projectDir", "taskDir"])) return false;
	return ["projectDir", "taskDir"].every((key) => typeof value[key] === "string" && isAbsolute(value[key]));
}

/** Owns the durable state and files for one project's task sessions. */
export class SessionStore {
	private readonly rootContext: ReturnType<typeof stateRootContext>;
	private readonly locks = new LockOwner();
	private stateRootResolution?: Promise<string>;

	constructor(rootDir: string, options: ProjectStateRootOptions = {}) {
		this.rootContext = stateRootContext(rootDir, options);
	}

	get stateRoot(): Promise<string> {
		this.stateRootResolution ??= resolveStateRoot(this.rootContext);
		return this.stateRootResolution;
	}

	async read(taskId: string): Promise<PersistedSessionState> {
		const { statePath } = await this.paths(taskId);
		let raw: string;
		try {
			raw = await Bun.file(statePath).text();
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT")
				throw new Error(
					`Required agent session state for ${taskId} is missing at ${statePath}; task creation must provision it.`,
					{ cause: error },
				);
			throw new Error(
				`Could not read agent session state for ${taskId} at ${statePath}: ${error instanceof Error ? error.message : String(error)}. The state file was not changed; check its permissions and preserve a copy before attempting recovery.`,
			);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			throw new Error(
				`Agent session state for ${taskId} at ${statePath} is not valid JSON (${error instanceof Error ? error.message : String(error)}). The file was not changed. Preserve a copy, then restore or repair it before retrying; do not reset session state.`,
			);
		}
		try {
			return this.validate(parsed, taskId);
		} catch {
			const version = isRecord(parsed) ? parsed.version : undefined;
			if (typeof version === "number" && version > 2) {
				throw new Error(
					`Agent session state for ${taskId} at ${statePath} uses version ${version}, newer than this program supports (version 2). The file was not changed. Use a compatible newer AgenticWorkspace version to read it; do not downgrade, reset, or overwrite it.`,
				);
			}
			if (version !== 2) {
				throw new Error(
					`Agent session state for ${taskId} at ${statePath} has unsupported format version ${String(version)}; version 2 is required. The file was not changed. Preserve a copy and inspect or manually convert it; do not reset or overwrite it.`,
				);
			}
			throw new Error(
				`Agent session state for ${taskId} at ${statePath} is corrupt or contains invalid session data. The file was not changed. Preserve a copy, then restore or repair the state before retrying; do not reset session state.`,
			);
		}
	}

	/** Provision task-owned session state; provider/session artifacts remain session-owned. */
	async insertTask(taskId: string): Promise<InsertedTaskState> {
		const { taskDir, statePath } = await this.paths(taskId);
		const receipt: InsertedTaskState = {
			taskDir,
			statePath,
			stateContent: Buffer.from(`${JSON.stringify(this.empty(taskId), null, "\t")}\n`),
			createdDirectories: [],
		};
		try {
			await mkdir(dirname(taskDir), { recursive: true });
			for (const directory of [taskDir, join(taskDir, "resources"), join(taskDir, "locks")]) {
				await mkdir(directory);
				receipt.createdDirectories.push(directory);
			}
			await this.write(statePath, receipt.stateContent.toString());
			return receipt;
		} catch (error) {
			try {
				if (!(await this.rollbackInsertedTask(receipt)))
					throw new Error("Session state created during initialization changed before cleanup; it was preserved.");
			} catch (cleanupError) {
				throw new AggregateError([error, cleanupError], "Session state initialization and cleanup failed.");
			}
			throw error;
		}
	}

	async rollbackInsertedTask(receipt: InsertedTaskState): Promise<boolean> {
		let restored = true;
		try {
			const current = await Bun.file(receipt.statePath)
				.arrayBuffer()
				.then(Buffer.from)
				.catch((error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") return null;
					throw error;
				});
			if (current?.equals(receipt.stateContent)) await rm(receipt.statePath);
			else if (current !== null) restored = false;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		for (const directory of [...receipt.createdDirectories].reverse()) {
			try {
				await rmdir(directory);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				if ((error as NodeJS.ErrnoException).code === "ENOTEMPTY") restored = false;
				else throw error;
			}
		}
		return restored;
	}

	async mutate<T>(taskId: string, fn: (state: PersistedSessionState) => Promise<T>): Promise<T> {
		// The single store-mutation chokepoint: lock, read, apply, write, unlock.
		// Session operations share this chokepoint, including batched cleanup.
		count("store");
		const startedAt = Date.now();
		if (isEnabled("store")) debug("store", "mutate.begin", { taskId });
		const paths = await this.paths(taskId);
		const release = await this.locks.acquireTarget(
			paths.statePath,
			`${paths.statePath}.lock`,
			{ staleMs: 30_000, retries: 120, retryDelayMs: 25 },
			(error) => (error instanceof Error ? error : new Error(String(error))),
		);
		let operationError: unknown;
		let writeCommitted = false;
		let releaseError: unknown;
		let result: T | undefined;
		try {
			const state = await this.read(taskId);
			result = await fn(state);
			await this.write(paths.statePath, `${JSON.stringify(this.toVersioned(state), null, "\t")}\n`);
			writeCommitted = true;
			if (isEnabled("store")) debug("store", "mutate.end", { taskId, ms: Date.now() - startedAt });
		} catch (error) {
			operationError = error;
		} finally {
			try {
				await release();
			} catch (error) {
				releaseError = error;
			}
		}
		if (releaseError !== undefined) throw new SessionMutationError(operationError, releaseError, writeCommitted);
		if (operationError !== undefined) throw operationError;
		return result as T;
	}

	async reserveSession(taskId: string, modeId: string, record: AgentSession, activeSessionId?: string): Promise<void> {
		await this.mutate(taskId, async (state) => {
			const history = state.modes[modeId] ?? { sessions: [] };
			history.sessions.unshift(record);
			if (activeSessionId !== undefined) history.activeSessionId = activeSessionId;
			state.modes[modeId] = history;
		});
	}

	async publishSession(taskId: string, modeId: string, record: AgentSession): Promise<void> {
		await this.mutate(taskId, async (state) => {
			const matches = state.modes[modeId]?.sessions.filter(({ id }) => id === record.id) ?? [];
			if (matches.length !== 1) throw new Error(`Expected one session membership: ${record.id}`);
			const current = matches[0];
			if (!current || current.createdAt !== record.createdAt || current.taskId !== record.taskId)
				throw new Error(`Session incarnation changed: ${record.id}`);
			if (record.nativeSessionId !== undefined) current.nativeSessionId = record.nativeSessionId;
			if (record.nativeProvider !== undefined) current.nativeProvider = record.nativeProvider;
		});
	}

	async rollbackProvisionalSession(
		taskId: string,
		modeId: string,
		sessionId: string,
		activeSessionId?: string,
	): Promise<void> {
		await this.mutate(taskId, async (state) => {
			const history = state.modes[modeId];
			if (!history) return;
			history.sessions = history.sessions.filter(({ id }) => id !== sessionId);
			if (history.activeSessionId === sessionId) {
				if (activeSessionId === undefined) delete history.activeSessionId;
				else history.activeSessionId = activeSessionId;
			}
		});
	}

	async selectSession(taskId: string, modeId: string, sessionId: string): Promise<void> {
		await this.mutate(taskId, async (state) => {
			const history = state.modes[modeId];
			if (!history?.sessions.some(({ id }) => id === sessionId))
				throw new Error(`Unknown session ${sessionId} for mode ${modeId}`);
			history.activeSessionId = sessionId;
		});
	}

	async selectSurvivorAfterStop(
		taskId: string,
		modeId: string,
		stoppedSessionId: string,
		activeSessionId: string | undefined,
	): Promise<void> {
		await this.mutate(taskId, async (state) => {
			const history = state.modes[modeId];
			if (!history) throw new Error(`Unknown session mode: ${modeId}`);
			if (history.activeSessionId !== stoppedSessionId) return;
			if (activeSessionId === undefined) delete history.activeSessionId;
			else history.activeSessionId = activeSessionId;
		});
	}

	async removeSessionRelationship(
		taskId: string,
		modeId: string,
		sessionId: string,
		activeSessionId?: string,
	): Promise<void> {
		await this.mutate(taskId, async (state) => {
			const history = state.modes[modeId];
			if (!history) return;
			const removed = history.sessions.some(({ id }) => id === sessionId);
			history.sessions = history.sessions.filter(({ id }) => id !== sessionId);
			if (!removed || history.activeSessionId !== sessionId) return;
			if (activeSessionId === undefined) delete history.activeSessionId;
			else history.activeSessionId = activeSessionId;
		});
	}

	async removeModeHistory(taskId: string, modeId: string): Promise<void> {
		await this.mutate(taskId, async (state) => {
			delete state.modes[modeId];
		});
	}

	async moveModeHistory(
		taskId: string,
		sourceModeId: string,
		destinationModeId: string,
		activeSessionId?: string,
	): Promise<void> {
		await this.mutate(taskId, async (state) => {
			const source = state.modes[sourceModeId];
			if (!source) return;
			const destination = state.modes[destinationModeId] ?? { sessions: [] };
			destination.sessions.push(...source.sessions);
			if (destination.activeSessionId === undefined && activeSessionId !== undefined)
				destination.activeSessionId = activeSessionId;
			state.modes[destinationModeId] = destination;
			delete state.modes[sourceModeId];
		});
	}

	async paths(taskId: string): Promise<SessionPaths> {
		const taskDir = join(await this.projectStateRoot(), slug(taskId));
		return { taskDir, statePath: join(taskDir, "state.json") };
	}

	/** Cross-process claim shared by ask and native resume for one conversation. */
	async claimSession(taskId: string, sessionId: string): Promise<() => Promise<void>> {
		const { taskDir } = await this.paths(taskId);
		const resource = createHash("sha256").update(`${taskId}\0${sessionId}`).digest("hex");
		return await this.locks.acquireTarget(
			join(taskDir, "resources", `conversation-${resource}`),
			join(taskDir, "locks", `conversation-${resource}`),
			{ staleMs: 30_000, retries: 0, retryDelayMs: 0 },
			(error) =>
				(error as NodeJS.ErrnoException).code === "ELOCKED"
					? new Error(`Session ${sessionId} is already being resumed or asked.`, { cause: error })
					: error instanceof Error
						? error
						: new Error(String(error)),
		);
	}

	async reset(taskId: string): Promise<void> {
		const { statePath } = await this.paths(taskId);
		await rm(statePath, { force: true });
	}

	async remove(taskId: string, sessionId: string): Promise<AgentSession | undefined> {
		let removed: AgentSession | undefined;
		await this.mutate(taskId, async (state) => {
			for (const history of Object.values(state.modes)) {
				const index = history.sessions.findIndex((session) => session.id === sessionId);
				if (index < 0) continue;
				removed = history.sessions[index];
				history.sessions.splice(index, 1);
				if (history.activeSessionId === sessionId) history.activeSessionId = history.sessions[0]?.id;
			}
		});
		return removed;
	}

	/** Read one mode history without merging it with histories owned by other modes. */
	async readMode(taskId: string, modeId: string): Promise<{ sessions: AgentSession[]; activeSessionId?: string }> {
		const state = await this.read(taskId);
		return state.modes[modeId] ?? { sessions: [] };
	}

	async write(path: string, content: string): Promise<void> {
		await writeFileAtomic(path, content);
	}

	private projectStateRoot(): Promise<string> {
		return this.stateRoot;
	}

	private empty(taskId: string): PersistedSessionState {
		return { version: 2, taskId, modes: {} };
	}

	private validate(value: unknown, taskId: string): PersistedSessionState {
		if (
			!isRecord(value) ||
			value.version !== 2 ||
			typeof value.taskId !== "string" ||
			value.taskId !== taskId ||
			!isRecord(value.modes)
		)
			throw new Error("invalid state");
		if (
			(value.worktreePath !== undefined && typeof value.worktreePath !== "string") ||
			(value.hasSuccessfulSession !== undefined && typeof value.hasSuccessfulSession !== "boolean")
		)
			throw new Error("invalid state");
		const stateTaskId: string = value.taskId;
		const modes: PersistedSessionState["modes"] = {};
		const seen = new Set<string>();
		for (const [modeId, history] of Object.entries(value.modes as Record<string, unknown>)) {
			if (
				!isRecord(history) ||
				!Array.isArray(history.sessions) ||
				!history.sessions.every((session) => isSession(session, stateTaskId)) ||
				(history.sessions.length > 0 && typeof history.activeSessionId !== "string") ||
				(history.activeSessionId !== undefined && typeof history.activeSessionId !== "string") ||
				(history.activeSessionId !== undefined &&
					!history.sessions.some((session) => session.id === history.activeSessionId))
			)
				throw new Error("invalid state");
			for (const session of history.sessions) {
				if (seen.has(session.id)) throw new Error("invalid state");
				seen.add(session.id);
			}
			modes[modeId] = {
				sessions: history.sessions as AgentSession[],
				...(typeof history.activeSessionId === "string" ? { activeSessionId: history.activeSessionId } : {}),
			};
		}
		return {
			version: 2,
			taskId: value.taskId,
			modes,
			...(typeof value.worktreePath === "string" ? { worktreePath: value.worktreePath } : {}),
			...(typeof value.hasSuccessfulSession === "boolean" ? { hasSuccessfulSession: value.hasSuccessfulSession } : {}),
		};
	}

	private toVersioned(state: PersistedSessionState): PersistedSessionState {
		return {
			version: 2,
			taskId: state.taskId,
			modes: state.modes,
			...(state.worktreePath ? { worktreePath: state.worktreePath } : {}),
			...(state.hasSuccessfulSession !== undefined ? { hasSuccessfulSession: state.hasSuccessfulSession } : {}),
		};
	}
}
