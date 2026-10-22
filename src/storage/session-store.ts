import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import lockfile from "proper-lockfile";
import { findGitWorktreeRoot } from "../filesystem/git/main-worktree.ts";
import { GitOperations } from "../filesystem/git/operations.ts";
import { count, debug, isEnabled } from "../lib/debug-log.ts";
import { slug } from "../model/session/session-utils.ts";
import {
	type AgentSession,
	type AgentSessionPathContext,
	NATIVE_AGENT_NAMESPACES,
	type TaskSessions,
} from "../model/session/types.ts";
import { taskIdKey, taskIdsEqual } from "../model/task/task-id.ts";
import { SessionMutationError } from "./errors/session.ts";

const stateLockQueues = new Map<string, Promise<void>>();

async function acquireStateLock(path: string): Promise<() => Promise<void>> {
	const previous = stateLockQueues.get(path) ?? Promise.resolve();
	let releaseQueue!: () => void;
	const queued = new Promise<void>((resolve) => {
		releaseQueue = resolve;
	});
	stateLockQueues.set(path, queued);
	await previous;
	let releaseFile: (() => Promise<void>) | undefined;
	try {
		releaseFile = await lockfile.lock(path, {
			realpath: false,
			stale: 30_000,
			update: 5_000,
			retries: { retries: 120, minTimeout: 25, maxTimeout: 250 },
		});
	} catch (error) {
		releaseQueue();
		if (stateLockQueues.get(path) === queued) stateLockQueues.delete(path);
		throw error;
	}
	return async () => {
		try {
			await releaseFile?.();
		} finally {
			releaseQueue();
			if (stateLockQueues.get(path) === queued) stateLockQueues.delete(path);
		}
	};
}

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
		projectRoot: resolve(rootDir),
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
			if (files.some((name) => name === "state.json" || /\.(claim|mode|lock|log|md)$/.test(name))) return true;
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
	await mkdir(dirname(path), { recursive: true });
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

const SESSION_KEYS = new Set([
	"id",
	"taskId",
	"preset",
	"tmuxName",
	"nativeSessionId",
	"nativeProvider",
	"nativeWorkspace",
	"cwd",
	"createdAt",
	"ownerPid",
	"outputPath",
	"bootstrapPath",
	"lastUsedAt",
	"useCount",
	"pathContext",
]);

function isSession(value: unknown, taskId: string): value is AgentSession {
	if (!isRecord(value)) return false;
	if (!Object.keys(value).every((key) => SESSION_KEYS.has(key))) return false;
	if (typeof value.taskId !== "string" || !taskIdsEqual(value.taskId, taskId)) return false;
	for (const key of ["id", "preset", "tmuxName", "cwd", "createdAt", "outputPath", "bootstrapPath"]) {
		if (typeof value[key] !== "string") return false;
	}
	return (
		(value.pathContext === undefined || isAgentSessionPathContext(value.pathContext)) &&
		(value.nativeWorkspace === undefined || typeof value.nativeWorkspace === "boolean") &&
		(value.nativeProvider === undefined ||
			(typeof value.nativeProvider === "string" &&
				NATIVE_AGENT_NAMESPACES.includes(value.nativeProvider as (typeof NATIVE_AGENT_NAMESPACES)[number]))) &&
		["nativeSessionId", "lastUsedAt"].every((key) => value[key] === undefined || typeof value[key] === "string") &&
		(value.ownerPid === undefined || typeof value.ownerPid === "number") &&
		(value.useCount === undefined || (typeof value.useCount === "number" && value.useCount >= 0))
	);
}

function isAgentSessionPathContext(value: unknown): value is AgentSessionPathContext {
	if (!isRecord(value) || !hasOnlyKeys(value, ["projectDir", "worktreeDir", "taskDir"])) return false;
	return ["projectDir", "worktreeDir", "taskDir"].every(
		(key) => typeof value[key] === "string" && isAbsolute(value[key]),
	);
}

/** Owns the durable state and files for one project's task sessions. */
export class SessionStore {
	private readonly rootContext: ReturnType<typeof stateRootContext>;
	private stateRootResolution?: Promise<string>;

	constructor(rootDir: string, options: ProjectStateRootOptions = {}) {
		this.rootContext = stateRootContext(rootDir, options);
	}

	get stateRoot(): Promise<string> {
		this.stateRootResolution ??= resolveStateRoot(this.rootContext);
		return this.stateRootResolution;
	}

	async read(taskId: string): Promise<PersistedSessionState> {
		return await this.readPersisted(taskId);
	}

	private async readPersisted(taskId: string): Promise<PersistedSessionState> {
		const { statePath } = await this.paths(taskId);
		let raw: string;
		try {
			raw = await Bun.file(statePath).text();
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.empty(taskId);
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

	async mutate<T>(taskId: string, fn: (state: PersistedSessionState) => Promise<T>): Promise<T> {
		// The single store-mutation chokepoint: lock, read, apply, validate, write, unlock.
		// Session operations share this chokepoint, including batched cleanup.
		count("store");
		const startedAt = Date.now();
		if (isEnabled("store")) debug("store", "mutate.begin", { taskId });
		const paths = await this.paths(taskId);
		await mkdir(paths.taskDir, { recursive: true });
		const release = await acquireStateLock(paths.statePath);
		let operationError: unknown;
		let writeCommitted = false;
		let releaseError: unknown;
		let result: T | undefined;
		try {
			const state = await this.readPersisted(taskId);
			result = await fn(state);
			const validated = this.validate(state, taskId);
			await this.write(paths.statePath, `${JSON.stringify(this.toVersioned(validated), null, "\t")}\n`);
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

	/** Mode-scoped mutation API; it never changes another mode's history or active pointer. */
	async mutateMode<T>(
		taskId: string,
		modeId: string,
		fn: (history: { sessions: AgentSession[]; activeSessionId?: string }) => Promise<T>,
	): Promise<T> {
		const paths = await this.paths(taskId);
		await mkdir(paths.taskDir, { recursive: true });
		const modeLockPath = `${paths.statePath}.${createHash("sha256").update(modeId).digest("hex")}.mode`;
		await Bun.write(modeLockPath, "");
		const releaseMode = await acquireStateLock(modeLockPath);
		let releaseState: (() => Promise<void>) | undefined;
		let operationError: unknown;
		let releaseError: unknown;
		let writeCommitted = false;
		let result: T | undefined;
		try {
			releaseState = await acquireStateLock(paths.statePath);
			const state = await this.readPersisted(taskId);
			const history = state.modes[modeId] ?? { sessions: [] };
			result = await fn(history);
			if (
				!history.sessions.every((session) => isSession(session, taskId)) ||
				(history.sessions.length > 0 && history.activeSessionId === undefined) ||
				(history.activeSessionId !== undefined &&
					!history.sessions.some((session) => session.id === history.activeSessionId))
			)
				throw new Error("invalid state");
			state.modes[modeId] = history;
			const output = this.toVersioned(state);
			this.validate(output, taskId);
			await this.write(paths.statePath, `${JSON.stringify(output, null, "\t")}\n`);
			writeCommitted = true;
		} catch (error) {
			operationError = error;
		} finally {
			const releaseFailures: unknown[] = [];
			try {
				await releaseState?.();
			} catch (error) {
				releaseFailures.push(error);
			}
			try {
				await releaseMode();
			} catch (error) {
				releaseFailures.push(error);
			}
			if (releaseFailures.length)
				releaseError = releaseFailures.length === 1 ? releaseFailures[0] : new AggregateError(releaseFailures);
		}
		if (releaseError !== undefined) throw new SessionMutationError(operationError, releaseError, writeCommitted);
		if (operationError !== undefined) throw operationError;
		return result as T;
	}

	/** Resolve a session's current owning mode and mutate it under the same task lock. */
	async mutateSession<T>(
		taskId: string,
		sessionId: string,
		fn: (
			session: AgentSession,
			history: { sessions: AgentSession[]; activeSessionId?: string },
			currentModeId: string,
		) => Promise<T>,
	): Promise<T> {
		const paths = await this.paths(taskId);
		await mkdir(paths.taskDir, { recursive: true });
		const release = await acquireStateLock(paths.statePath);
		let operationError: unknown;
		let releaseError: unknown;
		let writeCommitted = false;
		let result: T | undefined;
		try {
			const state = await this.readPersisted(taskId);
			const owner = Object.entries(state.modes).find(([, candidate]) =>
				candidate.sessions.some((session) => session.id === sessionId),
			);
			if (!owner) throw new Error(`Agent session not found: ${sessionId}`);
			const [currentModeId, history] = owner;
			const session = history.sessions.find((candidate) => candidate.id === sessionId);
			if (!session) throw new Error(`Agent session not found: ${sessionId}`);
			result = await fn(session, history, currentModeId);
			if (!history.sessions.every((candidate) => isSession(candidate, taskId))) throw new Error("invalid state");
			const output = this.toVersioned(state);
			this.validate(output, taskId);
			await this.write(paths.statePath, `${JSON.stringify(output, null, "\t")}\n`);
			writeCommitted = true;
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

	async paths(taskId: string): Promise<SessionPaths> {
		const taskDir = join(await this.projectStateRoot(), slug(taskIdKey(taskId)));
		return { taskDir, statePath: join(taskDir, "state.json") };
	}

	/** Cross-process claim shared by ask and native resume for one conversation. */
	async claimSession(taskId: string, sessionId: string): Promise<() => Promise<void>> {
		const { taskDir } = await this.paths(taskId);
		await mkdir(taskDir, { recursive: true });
		const claimPath = join(taskDir, `${createHash("sha256").update(sessionId).digest("hex")}.claim`);
		await Bun.write(claimPath, "");
		let release: (() => Promise<void>) | undefined;
		try {
			release = await lockfile.lock(claimPath, {
				realpath: false,
				stale: 30_000,
				update: 5_000,
				retries: { retries: 0, minTimeout: 0, maxTimeout: 0 },
			});
		} catch {
			throw new Error(`Session ${sessionId} is already being resumed or asked.`);
		}
		return async () => {
			await release?.();
			await rm(claimPath, { force: true });
		};
	}

	/** Cross-process admission for all operations targeting one task. */
	async claimTaskAdmission(taskId: string): Promise<() => Promise<void>> {
		const canonicalTaskId = taskIdKey(taskId);
		return await this.claimAdmission("task", canonicalTaskId, `Task ${taskId} is already being changed.`);
	}

	/** Cross-process admission for all operations targeting one configured mode. */
	async claimModeAdmission(modeId: string): Promise<() => Promise<void>> {
		if (!/^[a-z][a-z0-9-]*$/.test(modeId)) throw new Error(`Invalid mode admission id: ${modeId}`);
		return await this.claimAdmission("mode", modeId, `Mode ${modeId} is already being changed.`);
	}

	async reset(taskId: string): Promise<void> {
		const { statePath } = await this.paths(taskId);
		await rm(statePath, { force: true });
	}

	async removeTaskDir(taskId: string): Promise<void> {
		const { taskDir } = await this.paths(taskId);
		await rm(taskDir, { recursive: true, force: true });
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

	async readAll(): Promise<PersistedSessionState[]> {
		const root = await this.projectStateRoot();
		let entries: string[];
		try {
			entries = (await readdir(root, { withFileTypes: true }))
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		const states: PersistedSessionState[] = [];
		// Reads EVERY task's state file in the project. Cost scales with the number of tasks, not
		// with the task being inspected.
		if (isEnabled("store")) debug("store", "readAll.begin", { entries: entries.length });
		for (const entry of entries) {
			try {
				const parsed = JSON.parse(await Bun.file(join(root, entry, "state.json")).text());
				if (isRecord(parsed) && typeof parsed.taskId === "string") states.push(await this.read(parsed.taskId));
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		return states;
	}

	async write(path: string, content: string): Promise<void> {
		await writeFileAtomic(path, content);
	}

	private projectStateRoot(): Promise<string> {
		return this.stateRoot;
	}

	private async claimAdmission(
		scope: "mode" | "task",
		id: string,
		contendedMessage: string,
	): Promise<() => Promise<void>> {
		const directory = join(await this.projectStateRoot(), "admission");
		await mkdir(directory, { recursive: true });
		const path = join(directory, `${scope}-${createHash("sha256").update(id).digest("hex")}.claim`);
		await Bun.write(path, "");
		let release: (() => Promise<void>) | undefined;
		try {
			release = await lockfile.lock(path, {
				realpath: false,
				stale: 30_000,
				update: 5_000,
				retries: { retries: 0, minTimeout: 0, maxTimeout: 0 },
			});
		} catch {
			throw new Error(contendedMessage);
		}
		return async () => {
			await release?.();
			await rm(path, { force: true });
		};
	}

	private empty(taskId: string): PersistedSessionState {
		return { version: 2, taskId, modes: {} };
	}

	private validate(value: unknown, taskId: string): PersistedSessionState {
		if (
			!isRecord(value) ||
			value.version !== 2 ||
			typeof value.taskId !== "string" ||
			!taskIdsEqual(value.taskId, taskId) ||
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
