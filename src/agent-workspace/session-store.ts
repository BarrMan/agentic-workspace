import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
	access,
	link,
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	rename,
	rm,
	rmdir,
	stat,
	unlink,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import lockfile from "proper-lockfile";
import { findGitWorktreeRoot } from "../git/main-worktree.ts";
import { GitOperations } from "../git/operations.ts";
import { count, debug, isEnabled } from "../utils/debug-log.ts";
import { normalizeTaskId } from "../utils/task-id.ts";
import type { ProcessRunner } from "./session-process.ts";
import { slug } from "./session-utils.ts";
import {
	AGENT_SESSION_STATUS,
	type AgentPreset,
	type AgentSession,
	type AgentSessionPathContext,
	NATIVE_AGENT_NAMESPACES,
	type NativeAgentNamespace,
	type TaskSessions,
} from "./types.ts";

const NATIVE_SESSION_ID = /^ses_[A-Za-z0-9][A-Za-z0-9_-]*$/;

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

export interface SessionState extends TaskSessions {
	version: 2;
	modes: NonNullable<TaskSessions["modes"]>;
	hasSuccessfulSession?: boolean;
	/** Compatibility projection for flat callers. Mutations target the explicit legacy lane. */
	legacyModeId: string;
}

interface VersionedSessionState {
	version: 2;
	taskId: string;
	modes: Record<string, { sessions: AgentSession[]; activeSessionId?: string }>;
	worktreePath?: string;
	hasSuccessfulSession?: boolean;
}

export interface SessionPaths {
	taskDir: string;
	statePath: string;
}

export class SessionMutationError extends AggregateError {
	constructor(
		operationError: unknown,
		releaseError: unknown,
		readonly writeCommitted: boolean,
	) {
		super(
			[...(operationError === undefined ? [] : [operationError]), releaseError],
			"Session mutation lock release failed.",
		);
		this.name = "SessionMutationError";
	}
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
			if (files.some((name) => name === "state.json" || /\.(claim|mode|lock|log|md|native-session-id)$/.test(name)))
				return true;
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

	const legacyRoots = new Set<string>();
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
			if (identity !== projectIdentity) legacyRoots.add(candidate);
			for (const execution of executionIdentities) {
				const offset = relative(identity, execution.identity);
				if (
					(offset === "" && identity !== projectIdentity) ||
					(offset && offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset))
				)
					legacyRoots.add(execution.root);
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
	for (const root of legacyRoots) {
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
	"status",
	"ownerPid",
	"outputPath",
	"bootstrapPath",
	"endedAt",
	"error",
	"lastUsedAt",
	"useCount",
	"pathContext",
	"resumeProbeFailed",
]);

function isSession(value: unknown, taskId: string): value is AgentSession {
	if (!isRecord(value)) return false;
	if (!Object.keys(value).every((key) => SESSION_KEYS.has(key))) return false;
	if (value.taskId !== taskId || !Object.values(AGENT_SESSION_STATUS).includes(value.status as AgentSession["status"]))
		return false;
	for (const key of ["id", "preset", "tmuxName", "cwd", "createdAt", "outputPath", "bootstrapPath"]) {
		if (typeof value[key] !== "string") return false;
	}
	return (
		(value.pathContext === undefined || isAgentSessionPathContext(value.pathContext)) &&
		(value.resumeProbeFailed === undefined || isResumeProbeFailed(value.resumeProbeFailed)) &&
		(value.nativeWorkspace === undefined || typeof value.nativeWorkspace === "boolean") &&
		(value.nativeProvider === undefined ||
			(typeof value.nativeProvider === "string" &&
				NATIVE_AGENT_NAMESPACES.includes(value.nativeProvider as (typeof NATIVE_AGENT_NAMESPACES)[number]))) &&
		["nativeSessionId", "endedAt", "error", "lastUsedAt"].every(
			(key) => value[key] === undefined || typeof value[key] === "string",
		) &&
		(value.ownerPid === undefined || typeof value.ownerPid === "number") &&
		(value.useCount === undefined || (typeof value.useCount === "number" && value.useCount >= 0))
	);
}

function isResumeProbeFailed(value: unknown): boolean {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, ["nativeProvider", "nativeSessionId"]) &&
		typeof value.nativeProvider === "string" &&
		NATIVE_AGENT_NAMESPACES.includes(value.nativeProvider as (typeof NATIVE_AGENT_NAMESPACES)[number]) &&
		typeof value.nativeSessionId === "string" &&
		value.nativeSessionId.trim().length > 0
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

	constructor(
		rootDir: string,
		protected readonly runner: ProcessRunner,
		private readonly resolvePreset?: (session: AgentSession) => Promise<AgentPreset>,
		options: ProjectStateRootOptions = {},
	) {
		this.rootContext = stateRootContext(rootDir, options);
	}

	get stateRoot(): Promise<string> {
		this.stateRootResolution ??= resolveStateRoot(this.rootContext);
		return this.stateRootResolution;
	}

	async read(taskId: string): Promise<SessionState> {
		return await this.hydrateNativeSessionReceipts(await this.readPersisted(taskId));
	}

	/** Read a protected OpenCode ID receipt candidate for an exact persisted session membership. */
	async readNativeSessionIdCandidate(taskId: string, sessionId: string): Promise<string | undefined> {
		const state = await this.readPersisted(taskId);
		const session = Object.values(state.modes ?? {})
			.flatMap((history) => history.sessions)
			.find((candidate) => candidate.taskId === taskId && candidate.id === sessionId);
		if (!session) throw new Error(`Agent session not found: ${sessionId}`);
		const candidate = await this.readNativeSessionReceipt(session);
		if (candidate !== undefined && session.nativeSessionId !== undefined && candidate !== session.nativeSessionId)
			throw new Error(`Native session receipt conflicts with established ID for session ${sessionId}.`);
		return candidate;
	}

	private async readPersisted(taskId: string): Promise<SessionState> {
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

	async mutate<T>(taskId: string, fn: (state: SessionState) => Promise<T>): Promise<T> {
		// The single store-mutation chokepoint: lock, read, apply, validate, write, unlock.
		// `sessions.ts` calls this from 13 sites, several inside loops.
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
			state.modes ??= {};
			const compatibility = state.modes[state.legacyModeId] ?? { sessions: [] };
			compatibility.sessions = state.sessions;
			if (state.activeSessionId === undefined) delete compatibility.activeSessionId;
			else compatibility.activeSessionId = state.activeSessionId;
			state.modes[state.legacyModeId] = compatibility;
			const validated = this.validate(state, taskId);
			await this.write(paths.statePath, `${JSON.stringify(this.toVersioned(validated), null, "\t")}\n`);
			writeCommitted = true;
			if (isEnabled("store")) debug("store", "mutate.end", { taskId, ms: Date.now() - startedAt });
			return result;
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

	/** Mode-scoped mutation API for new callers; unlike the flat compatibility seam it never
	 * changes another mode's history or active pointer. */
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
		try {
			releaseState = await acquireStateLock(paths.statePath);
			const state = await this.readPersisted(taskId);
			state.modes ??= {};
			const history = state.modes[modeId] ?? { sessions: [] };
			const result = await fn(history);
			if (
				!history.sessions.every((session) => isSession(session, taskId)) ||
				(history.sessions.length > 0 && history.activeSessionId === undefined) ||
				(history.activeSessionId !== undefined &&
					!history.sessions.some((session) => session.id === history.activeSessionId))
			)
				throw new Error("invalid state");
			state.modes[modeId] = history;
			const legacy = state.modes[state.legacyModeId] ?? { sessions: [] };
			state.sessions = legacy.sessions;
			state.activeSessionId = legacy.activeSessionId;
			const output = this.toVersioned(state);
			this.validate(output, taskId);
			await this.write(paths.statePath, `${JSON.stringify(output, null, "\t")}\n`);
			return result;
		} finally {
			try {
				await releaseState?.();
			} finally {
				await releaseMode();
			}
		}
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
		try {
			const state = await this.readPersisted(taskId);
			const owner = Object.entries(state.modes ?? {}).find(([, candidate]) =>
				candidate.sessions.some((session) => session.id === sessionId),
			);
			if (!owner) throw new Error(`Agent session not found: ${sessionId}`);
			const [currentModeId, history] = owner;
			const session = history.sessions.find((candidate) => candidate.id === sessionId);
			if (!session) throw new Error(`Agent session not found: ${sessionId}`);
			const result = await fn(session, history, currentModeId);
			if (!history.sessions.every((candidate) => isSession(candidate, taskId))) throw new Error("invalid state");
			const output = this.toVersioned(state);
			this.validate(output, taskId);
			await this.write(paths.statePath, `${JSON.stringify(output, null, "\t")}\n`);
			return result;
		} finally {
			await release();
		}
	}

	async paths(taskId: string): Promise<SessionPaths> {
		const taskDir = join(await this.projectStateRoot(), slug(taskId));
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

	/** The caller holds the session claim through failure publication and runtime cleanup. */
	async markResumeProbeFailed(
		expected: AgentSession,
		modeId: string,
		marker: { nativeProvider: NativeAgentNamespace; nativeSessionId: string },
		error: string,
	): Promise<void> {
		await this.mutateSession(expected.taskId, expected.id, async (session, _history, currentModeId) => {
			this.assertExpectedSession(session, expected, modeId, currentModeId);
			if (session.nativeProvider !== marker.nativeProvider || session.nativeSessionId !== marker.nativeSessionId)
				throw new Error(`Session ${expected.id} native identity changed before resume failure publication.`);
			if (
				session.status === AGENT_SESSION_STATUS.FAILED &&
				session.error === error &&
				session.resumeProbeFailed?.nativeProvider === marker.nativeProvider &&
				session.resumeProbeFailed.nativeSessionId === marker.nativeSessionId &&
				session.endedAt !== undefined &&
				session.ownerPid === undefined
			)
				return;
			session.resumeProbeFailed = marker;
			session.status = AGENT_SESSION_STATUS.FAILED;
			session.error = error;
			session.endedAt = new Date().toISOString();
			delete session.ownerPid;
		});
	}

	private assertExpectedSession(
		current: AgentSession,
		expected: AgentSession,
		modeId: string,
		currentModeId: string,
	): void {
		if (
			currentModeId !== modeId ||
			current.taskId !== expected.taskId ||
			current.id !== expected.id ||
			current.tmuxName !== expected.tmuxName ||
			current.createdAt !== expected.createdAt ||
			current.nativeWorkspace !== expected.nativeWorkspace ||
			current.nativeProvider !== expected.nativeProvider ||
			current.nativeSessionId !== expected.nativeSessionId ||
			current.cwd !== expected.cwd ||
			JSON.stringify(current.pathContext) !== JSON.stringify(expected.pathContext)
		)
			throw new Error(`Session ${expected.id} was removed, replaced, or changed before store publication.`);
	}

	async reset(taskId: string): Promise<void> {
		const { statePath } = await this.paths(taskId);
		await rm(statePath, { force: true });
	}

	async removeTaskDir(taskId: string): Promise<void> {
		const { taskDir } = await this.paths(taskId);
		await rm(taskDir, { recursive: true, force: true });
	}

	/** Move the entire durable task-session container after a promote/demote ID change. */
	async remapTaskIdentity(oldTaskId: string, newTaskId: string): Promise<void> {
		if (oldTaskId === newTaskId) return;
		const [oldPaths, newPaths] = await Promise.all([this.paths(oldTaskId), this.paths(newTaskId)]);

		let oldStateExists = true;
		try {
			await stat(oldPaths.statePath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") oldStateExists = false;
			else throw error;
		}
		if (!oldStateExists) return;

		// Refuse legacy state before creating directories or taking destination locks.
		const raw = await Bun.file(oldPaths.statePath).text();
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed) || parsed.version !== 2 || parsed.taskId !== oldTaskId)
			throw new Error(`Cannot remap session state for ${oldTaskId}; a valid version 2 state is required.`);
		this.validate(parsed, oldTaskId);

		await mkdir(dirname(oldPaths.taskDir), { recursive: true });
		await mkdir(newPaths.taskDir, { recursive: true });
		// Acquire each state path once, in stable order. Never lock a shared parent directory.
		const lockPaths = [oldPaths.statePath, newPaths.statePath].sort();
		const releases: Array<() => Promise<void>> = [];
		const releaseErrors: unknown[] = [];
		let operationError: unknown;
		try {
			for (const path of lockPaths) releases.push(await this.acquireRemapLock(path));

			// Re-read under lock so concurrent source updates are not lost.
			const lockedRaw = await Bun.file(oldPaths.statePath).text();
			const lockedParsed: unknown = JSON.parse(lockedRaw);
			if (!isRecord(lockedParsed) || lockedParsed.version !== 2 || lockedParsed.taskId !== oldTaskId)
				throw new Error(`Cannot remap session state for ${oldTaskId}; a valid version 2 state is required.`);
			this.validate(lockedParsed, oldTaskId);

			const normalizedNewTaskId = normalizeTaskId(newTaskId);
			const sourceState = this.validate(lockedParsed, oldTaskId);
			const modes: VersionedSessionState["modes"] = {};
			for (const [modeId, history] of Object.entries(sourceState.modes ?? {})) {
				modes[modeId] = {
					...history,
					sessions: history.sessions.map((session) => ({ ...session, taskId: normalizedNewTaskId })),
				};
			}
			const strictState: VersionedSessionState = {
				...this.toVersioned({
					version: 2,
					taskId: normalizedNewTaskId,
					sessions: [],
					modes,
					...(sourceState.worktreePath !== undefined ? { worktreePath: sourceState.worktreePath } : {}),
					...(sourceState.hasSuccessfulSession !== undefined
						? { hasSuccessfulSession: sourceState.hasSuccessfulSession }
						: {}),
					legacyModeId: "",
				}),
			};
			const remapped = `${JSON.stringify(strictState, null, "\t")}\n`;
			let destinationExists = false;
			try {
				const existing = await Bun.file(newPaths.statePath).text();
				if (existing !== remapped)
					throw new Error(`Session state already exists for task ${newTaskId}; refusing to merge unrelated state.`);
				destinationExists = true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
			if (!destinationExists)
				await this.installAndVerifyRemappedState(newPaths.statePath, remapped, normalizedNewTaskId);
			else await this.verifyRemappedState(newPaths.statePath, remapped, normalizedNewTaskId);

			await this.unlinkRemappedSource(oldPaths.statePath);
			// Runtime directories may contain native session logs and bootstrap files at absolute
			// paths stored in snapshots. Remove only the now-empty old directory; never recurse.
			await rmdir(oldPaths.taskDir).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOTEMPTY" && error.code !== "EEXIST" && error.code !== "ENOENT") throw error;
			});
		} catch (error) {
			operationError = error;
		} finally {
			for (const release of releases.reverse()) {
				try {
					await release();
				} catch (error) {
					releaseErrors.push(error);
				}
			}
		}
		if (releaseErrors.length)
			throw new AggregateError(
				[...(operationError === undefined ? [] : [operationError]), ...releaseErrors],
				"Session identity remap failed while releasing locks.",
			);
		if (operationError !== undefined)
			throw operationError instanceof Error ? operationError : new Error(String(operationError));
	}

	private acquireRemapLock(path: string): Promise<() => Promise<void>> {
		return acquireStateLock(path);
	}

	private unlinkRemappedSource(path: string): Promise<void> {
		return unlink(path);
	}

	private async installAndVerifyRemappedState(path: string, content: string, taskId: string): Promise<void> {
		const temporary = `${path}.${randomUUID()}.tmp`;
		try {
			await Bun.write(temporary, content);
			// link() atomically claims the destination and fails rather than replacing it.
			await link(temporary, path);
		} finally {
			await unlink(temporary).catch(() => {});
		}
		await this.verifyRemappedState(path, content, taskId);
	}

	private async verifyRemappedState(path: string, content: string, taskId: string): Promise<void> {
		try {
			const written = await Bun.file(path).text();
			if (written !== content) throw new Error("Written state does not match the remapped session state.");
			await this.read(taskId);
		} catch (error) {
			throw new Error(`Could not verify remapped session state for ${taskId}; original state was preserved.`, {
				cause: error,
			});
		}
	}

	/**
	 * Remove one session record, returning it so the caller can clean up its files. An active
	 * pointer that referenced the record is dropped in the same locked mutation, so state never
	 * keeps a dangling pointer. Removing an unknown id is a no-op.
	 */
	async remove(taskId: string, sessionId: string): Promise<AgentSession | undefined> {
		let removed: AgentSession | undefined;
		await this.mutate(taskId, async (state) => {
			for (const history of Object.values(state.modes ?? {})) {
				const index = history.sessions.findIndex((session) => session.id === sessionId);
				if (index < 0) continue;
				removed = history.sessions[index];
				history.sessions.splice(index, 1);
				if (history.activeSessionId === sessionId) {
					history.activeSessionId = history.sessions[0]?.id;
					if (history === state.modes?.[state.legacyModeId]) state.activeSessionId = history.activeSessionId;
				}
			}
			state.sessions = state.modes?.[state.legacyModeId]?.sessions ?? [];
		});
		if (removed) await this.clearNativeSessionReceipt(removed);
		return removed;
	}

	/** Read one mode history without merging it with histories owned by other modes. */
	async readMode(taskId: string, modeId: string): Promise<{ sessions: AgentSession[]; activeSessionId?: string }> {
		const state = await this.read(taskId);
		return state.modes?.[modeId] ?? { sessions: [] };
	}

	async readAll(): Promise<SessionState[]> {
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
		const states: SessionState[] = [];
		// Reads EVERY task's state file in the project. Cost scales with the number of tasks, not
		// with the task being inspected.
		if (isEnabled("store")) debug("store", "readAll.begin", { entries: entries.length });
		for (const entry of entries) {
			try {
				const parsed = JSON.parse(await Bun.file(join(root, entry, "state.json")).text());
				if (isRecord(parsed) && typeof parsed.taskId === "string") {
					const state = await this.hydrateNativeSessionReceipts(this.validate(parsed, parsed.taskId));
					// Project-wide reconciliation/lifecycle consumers must see running sessions even
					// when a mode is not the compatibility BUILD lane.
					state.sessions = Object.values(state.modes ?? {}).flatMap((history) => history.sessions);
					states.push(state);
				}
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

	/** Receipts are untrusted runtime input, read only for the currently configured OpenCode preset. */
	private async receiptPath(session: AgentSession): Promise<string | undefined> {
		if (!this.resolvePreset) return;
		const paths = await this.paths(session.taskId);
		const taskDir = resolve(paths.taskDir);
		const bootstrapPath = resolve(session.bootstrapPath);
		if (dirname(bootstrapPath) !== taskDir || bootstrapPath !== join(taskDir, `${session.id}.md`)) return;
		try {
			if (!(await lstat(taskDir)).isDirectory()) return;
		} catch {
			return;
		}
		return join(taskDir, `${session.id}.native-session-id`);
	}

	private async readNativeSessionReceipt(session: AgentSession): Promise<string | undefined> {
		const path = await this.receiptPath(session);
		if (!path) return;
		try {
			const metadata = await lstat(path);
			if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) return;
			if ((await this.resolvePreset?.(session))?.bootstrap !== "opencode") return;
			const nativeSessionId = await readFile(path, "utf8");
			const exactId = nativeSessionId.endsWith("\n") ? nativeSessionId.slice(0, -1) : nativeSessionId;
			return NATIVE_SESSION_ID.test(exactId) ? exactId : undefined;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
			return;
		}
	}

	private async hydrateNativeSessionReceipts(state: SessionState): Promise<SessionState> {
		for (const history of Object.values(state.modes ?? {})) {
			for (const session of history.sessions) {
				const nativeSessionId = await this.readNativeSessionReceipt(session);
				if (nativeSessionId && session.nativeSessionId === undefined) session.nativeSessionId = nativeSessionId;
			}
		}
		return state;
	}

	/**
	 * The receipt is a runtime sidecar for the current launch; a fresh launch clears any stale one so
	 * a previous conversation's identity cannot be re-delivered.
	 */
	async clearNativeSessionReceipt(session: AgentSession): Promise<void> {
		const path = await this.receiptPath(session);
		if (!path) return;
		try {
			const metadata = await lstat(path);
			if (metadata.isFile() && (metadata.mode & 0o077) === 0) await unlink(path);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}

	private empty(taskId: string): SessionState {
		return { version: 2, taskId, sessions: [], modes: {}, legacyModeId: "build" };
	}

	private validate(value: unknown, taskId: string): SessionState {
		if (!isRecord(value) || value.taskId !== taskId) throw new Error("invalid state");
		let state: SessionState;
		if (value.version === 2 && isRecord(value.modes)) {
			state = this.projectBuildCompatibility(this.decodeVersionedEnvelope(value, taskId), value);
		} else throw new Error("invalid state");
		if (state.version === 2) {
			const seen = new Set<string>();
			for (const history of Object.values(state.modes ?? {})) {
				for (const session of history.sessions) {
					if (seen.has(session.id)) throw new Error("invalid state");
					seen.add(session.id);
				}
				if (
					(history.sessions.length > 0 && history.activeSessionId === undefined) ||
					(history.activeSessionId !== undefined &&
						!history.sessions.some((session) => session.id === history.activeSessionId))
				)
					throw new Error("invalid state");
			}
		}
		if (
			(state.activeSessionId !== undefined && typeof state.activeSessionId !== "string") ||
			(state.worktreePath !== undefined && typeof state.worktreePath !== "string") ||
			(state.hasSuccessfulSession !== undefined && typeof state.hasSuccessfulSession !== "boolean")
		)
			throw new Error("invalid state");
		return state;
	}

	private decodeVersionedEnvelope(value: Record<string, unknown>, taskId: string): SessionState {
		if (
			(value.worktreePath !== undefined && typeof value.worktreePath !== "string") ||
			(value.hasSuccessfulSession !== undefined && typeof value.hasSuccessfulSession !== "boolean")
		)
			throw new Error("invalid state");
		const modes: NonNullable<SessionState["modes"]> = {};
		for (const [modeId, history] of Object.entries(value.modes as Record<string, unknown>)) {
			if (
				!isRecord(history) ||
				!Array.isArray(history.sessions) ||
				!history.sessions.every((session) => isSession(session, taskId)) ||
				(history.sessions.length > 0 && history.activeSessionId === undefined) ||
				(history.activeSessionId !== undefined && typeof history.activeSessionId !== "string")
			)
				throw new Error("invalid state");
			modes[modeId] = {
				sessions: history.sessions as AgentSession[],
				...(typeof history.activeSessionId === "string" ? { activeSessionId: history.activeSessionId } : {}),
			};
		}
		return {
			version: 2,
			taskId,
			sessions: [],
			modes,
			legacyModeId: "build",
			...(typeof value.worktreePath === "string" ? { worktreePath: value.worktreePath } : {}),
			...(typeof value.hasSuccessfulSession === "boolean" ? { hasSuccessfulSession: value.hasSuccessfulSession } : {}),
		};
	}

	private projectBuildCompatibility(state: SessionState, original: Record<string, unknown>): SessionState {
		const build = state.modes?.build ?? { sessions: [] };
		// `mutate` passes the compatibility projection back through validation; its flat changes
		// remain authoritative only when explicitly present.
		const legacy = Array.isArray(original.sessions)
			? {
					sessions: original.sessions as AgentSession[],
					...(typeof original.activeSessionId === "string" ? { activeSessionId: original.activeSessionId } : {}),
				}
			: build;
		state.modes ??= {};
		state.modes.build = legacy;
		state.sessions = legacy.sessions;
		state.activeSessionId = legacy.activeSessionId;
		return state;
	}

	private toVersioned(state: SessionState): VersionedSessionState {
		return {
			version: 2,
			taskId: state.taskId,
			modes: state.modes ?? {},
			...(state.worktreePath ? { worktreePath: state.worktreePath } : {}),
			...(state.hasSuccessfulSession !== undefined ? { hasSuccessfulSession: state.hasSuccessfulSession } : {}),
		};
	}
}
