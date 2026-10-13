import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { lstat, realpath, rm, rmdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { Core } from "../core/backlog.ts";
import { taskWorktreeExists, taskWorktreePath } from "../git/task-worktree.ts";
import type { OwnedNativeSessionStops } from "../git/task-worktree-cleanup.ts";
import { TASK_SOURCE, type Task } from "../types/index.ts";
import { debug, isEnabled } from "../utils/debug-log.ts";
import { isValidTaskId } from "../utils/task-id.ts";
import type { Agent, LaunchOrigin, NativeIdentity, SessionIntent } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import { validateExplicitModel } from "./agents/profile.ts";
import { buildAgentResumeCommand, renderSessionBootstrap } from "./bootstrap.ts";
import {
	getEditableAgentConfiguration,
	loadAgentConfiguration,
	resolveAgentConfiguration,
	resolveSessionPreset,
	updateAgentConfiguration,
} from "./config.ts";
import { prepareHarnessEnvironment } from "./harness-environment.ts";
import { createTmuxExec } from "./live/tmux/exec.ts";
import type { TmuxExec } from "./live/tmux/types.ts";
import { ModeLifecycleService, withModeLifecycleGate } from "./mode-lifecycle.ts";
import {
	type PreflightedAgentLaunch,
	type PreparedAgentLaunch,
	preflightAgentLaunch,
	prepareAgentAsk,
	prepareAgentLaunchResources,
} from "./session-launch.ts";
import {
	BunRunner,
	ConclusiveStartupFailureError,
	createSessionTransport,
	type ProcessRunner,
	SessionProcess,
	type SessionTransport,
	type TmuxServer,
} from "./session-process.ts";
import { type SessionState, SessionStore } from "./session-store.ts";
import {
	allModeSessions,
	fail,
	findActiveSession,
	findSessionById,
	findSessionMode,
	nativeSessionName,
} from "./session-utils.ts";
import {
	AGENT_SESSION_STATUS,
	type AgentPreset,
	type AgentSession,
	type AgentSessionPathContext,
	type ModeId,
	type ModeProfile,
	type RuntimeAgentBootstrap,
	resolveSessionSettings,
	type SessionSettings,
	type TaskSessions,
} from "./types.ts";
import { openViewStateStore } from "./view-state-store.ts";
import {
	deleteWorkspaceRequest,
	readWorkspaceContext,
	readWorkspaceRequests,
	WORKSPACE_CONTEXT_ENV,
	type WorkspaceContext,
	workspaceContextInto,
	workspaceRequestDir,
	writeWorkspaceRequest,
} from "./workspace-context.ts";

const DEFAULT_MAX_RUNNING_AGENT_SESSIONS = 10;
const ASK_TIMEOUT_MS = 120_000;
const NATIVE_SESSION_PANE_OPTION = "@backlog_native_session_id";

export type { ProcessRunner, SessionTransport, TmuxServer } from "./session-process.ts";

export class ResumeFailedError extends Error {
	readonly kind = "resume-failed";

	constructor(
		readonly nativeProvider: string,
		readonly nativeSessionId: string,
		cause: unknown,
	) {
		super(
			`ResumeFailed: ${nativeProvider} ${nativeSessionId}. Conversation preserved; the next launch will start fresh.`,
			{ cause },
		);
		this.name = "ResumeFailedError";
	}
}

export type SharedAgentAttachment = {
	record: AgentSession;
	server: TmuxServer;
	exec: TmuxExec;
	paneId: string;
	bootstrap?: RuntimeAgentBootstrap;
	warnings?: string[];
	outcome?:
		| { kind: "Resumed" }
		| { kind: "Fresh" }
		| { kind: "FreshAfterFailedResume"; nativeProvider: string; nativeSessionId: string };
};

export type SessionRuntimeOrigin = Readonly<Pick<SharedAgentAttachment, "record" | "paneId">>;

type ResolvedTarget = {
	record: AgentSession;
	modeId: ModeId;
	pathContext: AgentSessionPathContext;
	preset: AgentPreset;
	profile?: ModeProfile;
	receipt?: string;
	environment: Record<string, string>;
	warnings: string[];
	settings?: SessionSettings;
	queuedRequest: boolean;
	failedResume?: { nativeProvider: string; nativeSessionId: string };
	newlyCreated?: boolean;
};

type NativeAdmission =
	| { kind: "attach"; attachment: SharedAgentAttachment }
	| { kind: "launch"; target: ResolvedTarget; action: "resume" | "launch-queued" | "launch-new" };

function timestamp(): string {
	return new Date().toISOString();
}

function sameRoot(left: string, right: string): boolean {
	try {
		return realpathSync(left) === realpathSync(right);
	} catch {
		return false;
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

/** Best-effort unlink for a deleted session's sidecar files; a missing file is not an error. */
async function removeFile(path: string): Promise<void> {
	try {
		await rm(path, { force: true });
	} catch {
		// Sidecar cleanup never blocks deleting the durable record.
	}
}

async function removeOwnedPath(path: string, recursive = false): Promise<void> {
	try {
		await rm(path, { force: true, recursive });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
}

/** Resolve a future directory through its existing canonical ancestor without accepting symlink parents. */
async function canonicalDirectoryTarget(path: string): Promise<string> {
	let ancestor = resolve(path);
	const suffix: string[] = [];
	while (true) {
		try {
			const canonicalAncestor = await realpath(ancestor);
			if (!(await stat(canonicalAncestor)).isDirectory()) throw new Error(`Expected a directory parent for ${path}.`);
			return join(canonicalAncestor, ...suffix);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
			try {
				await lstat(ancestor);
				throw new Error(`Refusing redirected or dangling directory ${ancestor}.`);
			} catch (inspectionError) {
				const inspectionCode = (inspectionError as NodeJS.ErrnoException).code;
				if (inspectionCode !== "ENOENT" && inspectionCode !== "ENOTDIR") throw inspectionError;
			}
			const parent = dirname(ancestor);
			if (parent === ancestor) throw new Error(`Cannot resolve directory parent for ${path}.`, { cause: error });
			suffix.unshift(basename(ancestor));
			ancestor = parent;
		}
	}
}

/** Durable task-scoped tmux sessions. State operations are short; terminals never run while a state lock is held. */
export class AgentSessionService {
	private readonly runner: ProcessRunner;
	private readonly process: SessionProcess;
	private readonly store: SessionStore;
	private readonly lifecycle: ModeLifecycleService;
	private readonly server: TmuxServer;
	private readonly exec: TmuxExec | undefined;
	/** Ownership-context read; injectable because the real reader probes a tmux socket. */
	private readonly readContext: () => Promise<WorkspaceContext | undefined>;

	constructor(
		private readonly core: Core,
		options: {
			runner?: ProcessRunner;
			tmuxServer?: TmuxServer;
			tmuxTransport?: SessionTransport;
			stateRoot?: string;
			/** Test seam overriding the ownership-context read that `start` routes on. */
			workspaceContext?: () => Promise<WorkspaceContext | undefined>;
		} = {},
	) {
		if (options.tmuxServer && options.tmuxTransport)
			throw new Error("Specify either tmuxServer or tmuxTransport, not both.");
		this.runner = options.runner ?? new BunRunner();
		if (options.tmuxTransport) {
			this.server = options.tmuxTransport.server;
			this.exec = options.tmuxTransport.exec;
		} else if (options.tmuxServer) {
			this.server = options.tmuxServer;
			this.exec = createTmuxExec({
				socketName: process.env.BACKLOG_TMUX_SOCKET?.trim() || "default",
				environment: { ...process.env, TMUX: "" },
			});
		} else {
			const transport = createSessionTransport();
			this.server = transport.server;
			this.exec = transport.exec;
		}
		this.store = new SessionStore(
			this.core.filesystem.rootDir,
			this.runner,
			(session) => resolveSessionPreset(this.core, session),
			{ stateRoot: options.stateRoot },
		);
		this.process = new SessionProcess(
			this.runner,
			this.core.filesystem.rootDir,
			this.server,
			() => this.store.stateRoot,
		);
		const rootDir = this.core.filesystem.rootDir;
		this.lifecycle = new ModeLifecycleService({
			journalDirectory: join(rootDir, ".backlog", "agent-workspace"),
			configuration: {
				read: async () => await getEditableAgentConfiguration(this.core, "project"),
				update: async (update) => {
					let result = await getEditableAgentConfiguration(this.core, "project");
					await updateAgentConfiguration(this.core, "project", (current) => (result = update(current)));
					return result;
				},
			},
			sessions: {
				readMode: async (taskId, modeId) => await this.store.readMode(taskId, modeId),
				mutate: async (taskId, mutate) => await this.store.mutate(taskId, (state) => mutate(state as never)),
			},
			viewState: {
				update: async (patch) => {
					const view = await openViewStateStore(rootDir, () => ({}), { stateRoot: await this.stateRoot });
					try {
						await view.update((state) => patch(state as Record<string, unknown>));
					} finally {
						view.close();
					}
				},
			},
			listTaskIds: async () => {
				const [active, drafts, completed, archived] = await Promise.all([
					this.core.filesystem.listTasks(),
					this.core.filesystem.listDrafts(),
					this.core.filesystem.listCompletedTasks(),
					this.core.filesystem.listArchivedTasks(),
				]);
				return [...new Set([...active, ...drafts, ...completed, ...archived].map((task) => task.id))];
			},
		});
		this.readContext =
			options.workspaceContext ?? (() => readWorkspaceContext({ rootDir: this.core.filesystem.rootDir }));
	}

	/** Delete an empty project mode through the journaled lifecycle. */
	async deleteMode(modeId: ModeId, destinationModeId?: ModeId): Promise<void> {
		await this.lifecycle.deleteMode(modeId, destinationModeId);
	}

	get stateRoot(): Promise<string> {
		return this.store.stateRoot;
	}

	async list(taskId: string, requestedModeId?: ModeId): Promise<TaskSessions> {
		const task = await this.requireTask(taskId);
		const modeId = await this.resolveModeId(task.id, requestedModeId);
		return await this.listMode(task.id, modeId);
	}

	/** Read the selected mode's history and pointer without merging concurrent histories. */
	async listMode(taskId: string, modeId: string): Promise<TaskSessions> {
		const task = await this.requireTask(taskId);
		await this.resolveModeId(task.id, modeId);
		const history = await this.store.readMode(task.id, modeId);
		return { taskId: task.id, sessions: history.sessions, activeSessionId: history.activeSessionId };
	}

	private async resolveModeId(taskId: string, explicit?: ModeId, context?: WorkspaceContext): Promise<ModeId> {
		const catalog = (await loadAgentConfiguration(this.core, "project"))?.modes;
		if (explicit) {
			if (catalog && !catalog.profiles[explicit]) throw new Error(`Unknown mode '${explicit}'.`);
			if (!catalog && explicit !== "build") throw new Error(`Mode '${explicit}' is not configured for this project.`);
			return explicit;
		}
		const identity = context?.conversation;
		if (identity) {
			if (identity.taskId !== taskId) throw new Error("Calling session context belongs to a different task.");
			const state = await this.store.read(taskId);
			const owner = findSessionMode(state.modes, identity.sessionId);
			if (owner) return owner;
			throw new Error(`Calling session ${identity.sessionId} is not present in current task history.`);
		}
		return catalog?.defaultModeId ?? "build";
	}

	private async withTaskSessionAdmission<T>(taskId: string, operation: (task: Task) => Promise<T>): Promise<T> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false")
			throw new Error(`Task session locking is disabled; refusing session operation for ${taskId}.`);
		const task = await this.core.loadTaskForMutation(taskId, { includeCrossBranch: false });
		if (!task || !task.filePath || task.source === TASK_SOURCE.REMOTE || task.source === TASK_SOURCE.LOCAL_BRANCH)
			throw new Error(`Locally editable task not found: ${taskId}`);
		return await this.core.filesystem.withTaskLock(task, async () => {
			const current = await this.core.loadTaskForMutation(task.id, { includeCrossBranch: false });
			if (
				!current ||
				!current.filePath ||
				current.filePath !== task.filePath ||
				current.source === TASK_SOURCE.REMOTE ||
				current.source === TASK_SOURCE.LOCAL_BRANCH
			)
				throw new Error(`Locally editable task changed or no longer exists: ${task.id}`);
			return await operation(current);
		});
	}

	private async launchConfiguration(taskId: string) {
		return await resolveAgentConfiguration(this.core, taskId);
	}

	private async profileFor(
		modeId: ModeId,
		preset: AgentPreset,
	): Promise<{ profile?: ModeProfile; preset: AgentPreset }> {
		const catalog = (await loadAgentConfiguration(this.core, "project"))?.modes;
		const profile = catalog?.profiles[modeId];
		if (!profile) return { preset };
		let selectedPreset = preset;
		const agent = agentFor(preset.bootstrap);
		if (profile.model.kind === "explicit") {
			const available = agent?.discoverModels
				? await agent.discoverModels({ command: preset.command, env: { ...preset.env }, timeoutMs: 5_000 })
				: undefined;
			const validation = validateExplicitModel(profile.model.id, available);
			if (validation.compatible === false)
				throw new Error(validation.message ?? `Model '${profile.model.id}' is unavailable.`);
			if (agent?.prepareProfile) selectedPreset = agent.prepareProfile(profile, preset);
		}
		return { profile: structuredClone(profile), preset: selectedPreset };
	}

	private async pathContextFor(taskId: string, cwd: string): Promise<AgentSessionPathContext> {
		return {
			projectDir: this.core.filesystem.rootDir,
			worktreeDir: cwd,
			taskDir: await this.core.filesystem.taskArtifacts.containerPath(taskId),
		};
	}

	private async pathContextForSession(task: { id: string }, session: AgentSession): Promise<AgentSessionPathContext> {
		const saved = session.pathContext;
		return {
			projectDir: saved?.projectDir ?? this.core.filesystem.rootDir,
			worktreeDir: saved?.worktreeDir ?? session.cwd,
			taskDir: saved?.taskDir ?? (await this.core.filesystem.taskArtifacts.containerPath(task.id)),
		};
	}

	/**
	 * The single native-identity publisher. Runs inside the caller's existing admission boundary (it
	 * never claims, so it cannot recurse). It verifies the exact record membership, owning mode, and
	 * launch generation, accepts an unset or identical identity, rejects a conflicting one, persists
	 * through the session store, and then tags only the still-matching pane. A pane that is gone never
	 * erases the persisted identity, and a replacement launch is never entered.
	 */
	async publishNativeIdentity(origin: LaunchOrigin, identity: NativeIdentity): Promise<void> {
		const taskId = origin.record.taskId;
		const state = await this.store.read(taskId);
		const current = allModeSessions(state).find((session) => session.id === origin.record.id);
		if (!current) return; // deleted: never resurrect
		if (findSessionMode(state.modes, origin.record.id) !== origin.modeId) return; // moved mode: not this launch
		try {
			this.assertSameSessionMembership(current, origin.record);
		} catch {
			return; // replaced record: never publish into a replacement launch
		}
		const paneState = await this.ownedLaunchPaneState(origin);
		if (paneState === "replacement") return;
		let conflict: string | undefined;
		const published = await this.store.mutateSession(
			taskId,
			origin.record.id,
			async (record, _history, currentModeId) => {
				if (currentModeId !== origin.modeId) return false;
				try {
					this.assertSameSessionMembership(record, origin.record);
				} catch {
					return false;
				}
				if (record.nativeSessionId !== undefined && record.nativeSessionId !== identity.id) {
					conflict = record.nativeSessionId;
					return false;
				}
				record.nativeSessionId = identity.id;
				if (record.nativeProvider === undefined && origin.record.nativeProvider !== undefined)
					record.nativeProvider = origin.record.nativeProvider;
				return true;
			},
		);
		if (conflict !== undefined)
			throw new Error(
				`Session ${origin.record.id} already has native identity '${conflict}'; refusing to publish '${identity.id}'.`,
			);
		if (published && paneState === "owned")
			await this.tagNativeSessionPane({ ...origin.record, nativeSessionId: identity.id }, origin.paneId);
	}

	/**
	 * Classify the record's exact owned pane against this launch: `owned` is the launch's own pane
	 * (or a not-yet-dispatched pane with no recorded inventory), `absent` is a pane that has exited,
	 * and `replacement` is a different live/dead pane or a pane carrying another launch's inventory.
	 */
	private async ownedLaunchPaneState(origin: LaunchOrigin): Promise<"owned" | "absent" | "replacement"> {
		const runtime = await this.process.nativeRuntimeClassification(origin.record);
		if (runtime.status === "uncertain")
			throw new Error(`Could not inspect native session ${origin.record.id}: ${runtime.reason}`);
		if (runtime.status === "missing") return "absent";
		if (runtime.paneId !== origin.paneId) return "replacement";
		const resources = await this.process.launchResources(runtime.paneId).catch(() => undefined);
		if (resources && resources.skill.marker !== origin.resources.skill.marker) return "replacement";
		return "owned";
	}

	/** Offer one deferred identity delivery to its adapter, routed through the single publisher. */
	private async reconcileDeferredIdentity(agent: Agent, origin: LaunchOrigin): Promise<void> {
		await agent.reconcileIdentity(origin, async (identity) => {
			await this.publishNativeIdentity(origin, identity);
		});
	}

	private async tagNativeSessionPane(session: AgentSession, paneId: string, publish = true): Promise<void> {
		const pathContext = await this.pathContextForSession({ id: session.taskId }, session);
		if (!sameRoot(pathContext.projectDir, this.core.filesystem.rootDir))
			throw new Error(`Session ${session.id} has a mismatched canonical project root.`);
		const panes = await this.server.cmd("list-panes", [
			"-t",
			paneId,
			"-F",
			`#{@backlog_root}\t#{@backlog_task}\t#{@backlog_session}\t#{pane_id}\t#{${NATIVE_SESSION_PANE_OPTION}}\t#{@backlog_native_provider}`,
		]);
		const [rootDir, taskId, sessionId, observedPaneId, nativeSessionId, nativeProvider] =
			panes.length === 1 ? (panes[0]?.split("\t") ?? []) : [];
		if (
			!sameRoot(rootDir ?? "", this.core.filesystem.rootDir) ||
			taskId !== session.taskId ||
			sessionId !== session.id ||
			observedPaneId !== paneId
		)
			throw new Error(`Could not verify exact pane ownership for native session ${session.id}.`);
		if (
			(nativeSessionId && nativeSessionId !== session.nativeSessionId) ||
			(nativeProvider && session.nativeProvider && nativeProvider !== session.nativeProvider)
		)
			throw new Error(`Native pane identity conflicts with session ${session.id}; refusing to retag it.`);
		if (!publish || !session.nativeSessionId) return;
		await this.server.cmd("set-option", ["-p", "-t", paneId, NATIVE_SESSION_PANE_OPTION, session.nativeSessionId]);
		if (session.nativeProvider)
			await this.server.cmd("set-option", ["-p", "-t", paneId, "@backlog_native_provider", session.nativeProvider]);
	}

	private assertSameSessionMembership(current: AgentSession, expected: AgentSession): void {
		if (
			current.taskId !== expected.taskId ||
			current.id !== expected.id ||
			current.tmuxName !== expected.tmuxName ||
			current.createdAt !== expected.createdAt ||
			current.nativeWorkspace !== expected.nativeWorkspace ||
			current.nativeProvider !== expected.nativeProvider ||
			current.cwd !== expected.cwd ||
			JSON.stringify(current.pathContext) !== JSON.stringify(expected.pathContext) ||
			(current.nativeSessionId !== undefined &&
				expected.nativeSessionId !== undefined &&
				current.nativeSessionId !== expected.nativeSessionId)
		)
			throw new Error(`Session ${expected.id} was removed or replaced before runtime publication.`);
	}

	private assertSameSession(current: AgentSession, expected: AgentSession): void {
		this.assertSameSessionMembership(current, expected);
		if (current.nativeSessionId !== expected.nativeSessionId)
			throw new Error(`Session ${expected.id} native identity changed before runtime publication.`);
	}

	private async assertSessionIdentity(expected: AgentSession): Promise<void> {
		const state = await this.store.read(expected.taskId);
		this.assertSameSession(this.session(state, expected.id), expected);
	}

	private async clearNativeSessionPaneTag(session: AgentSession): Promise<void> {
		if (!session.nativeSessionId) return;
		const lines = await this.server.cmd("list-panes", [
			"-t",
			`=${session.tmuxName}:`,
			"-F",
			`#{@backlog_root}\t#{@backlog_task}\t#{@backlog_session}\t#{pane_id}\t#{${NATIVE_SESSION_PANE_OPTION}}`,
		]);
		for (const line of lines) {
			const [rootDir, taskId, sessionId, paneId, nativeSessionId] = line.split("\t");
			if (
				!sameRoot(rootDir ?? "", this.core.filesystem.rootDir) ||
				taskId !== session.taskId ||
				sessionId !== session.id ||
				paneId === undefined ||
				nativeSessionId !== session.nativeSessionId
			)
				continue;
			await this.server.cmd("set-option", ["-p", "-u", "-t", paneId, NATIVE_SESSION_PANE_OPTION]);
			await this.server.cmd("set-option", ["-p", "-u", "-t", paneId, "@backlog_native_provider"]);
		}
	}

	private async executionPresetWithEnvironment(
		taskId: string,
		name: string,
		paths: AgentSessionPathContext,
	): Promise<{ preset: AgentPreset; environment: Record<string, string> }> {
		const preset = await resolveSessionPreset(this.core, { taskId, preset: name });
		const environment = await prepareHarnessEnvironment(preset.env, paths, {
			onWarning: (text) => this.warnEnvironment(text),
		});
		return {
			preset: await resolveLaunchPreset(preset, {
				cwd: paths.worktreeDir,
				env: environment,
			}),
			environment,
		};
	}

	private async executionPreset(taskId: string, name: string, paths: AgentSessionPathContext): Promise<AgentPreset> {
		return (await this.executionPresetWithEnvironment(taskId, name, paths)).preset;
	}

	private async prepareSessionLaunch(
		task: { id: string; title: string },
		record: AgentSession,
		modeId: ModeId,
		preset: AgentPreset,
		settings: SessionSettings,
		options: {
			profile?: ModeProfile;
			intent: SessionIntent;
			prepare?: string;
			clearWorkspaceContext?: boolean;
			bootstrapBeforeCreate?: boolean;
			preflight?: PreflightedAgentLaunch;
			environment?: Record<string, string>;
		},
	): Promise<{ paneId: string; prepared: PreparedAgentLaunch; warnings: string[] }> {
		const pathContext = await this.pathContextForSession(task, record);
		const warnings: string[] = [];
		let environment = options.preflight
			? { ...options.preflight.environment }
			: options.environment
				? { ...options.environment }
				: await prepareHarnessEnvironment(preset.env, pathContext, {
						onWarning: (text) => {
							warnings.push(text);
							this.warnEnvironment(text);
						},
					});
		const preflight =
			options.preflight ??
			(await preflightAgentLaunch(preset, record.bootstrapPath, {
				cwd: pathContext.worktreeDir,
				intent: options.intent,
				sessionId: record.id,
				yolo: settings.yoloMode,
				profile: options.profile,
				repositoryRoot: pathContext.projectDir,
				taskRoot: pathContext.taskDir,
				environment,
			}));
		if (options.clearWorkspaceContext) delete environment[WORKSPACE_CONTEXT_ENV];
		if (options.bootstrapBeforeCreate)
			await this.store.write(record.bootstrapPath, renderSessionBootstrap({ taskId: task.id }));
		await this.process.assertNoPreparedResources(record);
		await this.process.create(record, environment);
		const paneId = await this.process.paneId(record);
		// A fresh intent discards any prior native identity; only a resume carries the record's exact ID
		// onto the pane before the adapter prepares the launch.
		const paneRecord = options.intent.kind === "resume" ? record : { ...record, nativeSessionId: undefined };
		environment = workspaceContextInto(environment, {
			paneId,
			rootDir: pathContext.projectDir,
			conversation: { taskId: task.id, modeId, sessionId: record.id },
			...(paneRecord.nativeSessionId ? { nativeSessionId: paneRecord.nativeSessionId } : {}),
		});
		await this.tagNativeSessionPane(paneRecord, paneId);
		if (options.prepare) await this.process.prepare(options.prepare, pathContext.worktreeDir, environment);
		if (!options.bootstrapBeforeCreate)
			await this.store.write(record.bootstrapPath, renderSessionBootstrap({ taskId: task.id }));
		await this.process.preparePane(record);
		const prepared = await prepareAgentLaunchResources(record.bootstrapPath, preflight, environment);
		if (warnings.length > 0) prepared.warnings = warnings;
		return { paneId, prepared, warnings };
	}

	private warnEnvironment(text: string): void {
		process.stderr.write(`warning: ${text}\n`);
	}

	private async profileWithCurrentArtifacts(
		profile: ModeProfile | undefined,
		taskId: string,
		taskRoot: string,
	): Promise<ModeProfile | undefined> {
		if (!profile) return undefined;
		const entries = await this.core.filesystem.taskArtifacts.list(taskId);
		const existing = entries
			.slice(0, 100)
			.map(({ path }) => resolve(taskRoot, path))
			.filter((path) => path.startsWith(`${resolve(taskRoot)}${sep}`));
		if (existing.length === 0) return structuredClone(profile);
		return {
			...structuredClone(profile),
			prompt: `${profile.prompt}\n\nCurrent existing task artifact paths (informational, not an allowlist):\n${existing.map((path) => `- ${path}`).join("\n")}`,
		};
	}

	/**
	 * Read every task's durable session state in one directory scan. Unlike `list(taskId)` this does
	 * not load the task corpus, so its cost does not scale with the number of tasks or files.
	 *
	 * A malformed or unreadable state file still fails loudly: the read is not a best-effort scan,
	 * and a caller that needs the friendly per-task message keeps using `list`.
	 */
	async listAllSessions(): Promise<Map<string, TaskSessions>> {
		const states = await this.store.readAll();
		return new Map(states.map((state) => [state.taskId, state]));
	}

	async reset(taskId: string): Promise<void> {
		await this.withTaskSessionAdmission(taskId, async (task) => {
			this.assertNoLiveSessions(task.id, await this.store.read(task.id));
			await this.store.reset(task.id);
		});
	}

	async purge(taskId: string): Promise<void> {
		const task = await this.core.loadTaskById(taskId, { includeCrossBranch: false });
		if (task)
			return await this.withTaskSessionAdmission(
				taskId,
				async (current) => await this.purgeTaskSessions(current.id, current),
			);
		await this.purgeTaskSessions(taskId);
	}

	private async purgeTaskSessions(taskId: string, task?: Task): Promise<void> {
		if (task && (task.source === TASK_SOURCE.REMOTE || task.source === TASK_SOURCE.LOCAL_BRANCH))
			throw new Error(`Locally editable task not found: ${taskId}`);
		if (!task && !isValidTaskId(taskId)) throw new Error(`Locally editable task not found: ${taskId}`);
		const paths = await this.store.paths(taskId);
		if (!task && !(await Bun.file(paths.statePath).exists())) return;
		const state = await this.store.read(task?.id ?? taskId);
		if (!task && state.taskId !== taskId) throw new Error(`Locally editable task not found: ${taskId}`);
		const sessions = allModeSessions(state);
		this.assertNoLiveSessions(task?.id ?? taskId, state);
		const taskDir = resolve(paths.taskDir);
		const sidecars = sessions.flatMap((session) => [session.outputPath, session.bootstrapPath]);
		for (const sidecar of sidecars) {
			if (!resolve(sidecar).startsWith(`${taskDir}${sep}`))
				throw new Error(`Cannot purge task ${taskId}: session sidecar is outside its task session directory.`);
		}
		for (const session of sessions) {
			await deleteWorkspaceRequest(this.core.filesystem.rootDir, session.id);
			await removeFile(session.outputPath);
			await removeFile(session.bootstrapPath);
		}
		await this.store.removeTaskDir(task?.id ?? taskId);
	}

	/**
	 * Forget task associations during task deletion without stopping any runtime. The caller must
	 * already hold Core's task/reference/admission boundary; acquiring task admission here would
	 * re-enter the lock held by deletion. Store mutations serialize each record update.
	 */
	async forgetTaskSessions(taskId: string): Promise<void> {
		const task = await this.requireTask(taskId);
		const stateRoot = await this.store.stateRoot;
		const paths = await this.store.paths(task.id);
		if (dirname(resolve(paths.taskDir)) !== resolve(stateRoot))
			throw new Error(
				`Cannot forget task ${task.id}: its session directory is not directly under the selected state root.`,
			);
		const requestDir = workspaceRequestDir(this.core.filesystem.rootDir);
		const [canonicalStateRoot, canonicalTaskDir, canonicalProjectRoot, canonicalRequestDir] = await Promise.all([
			canonicalDirectoryTarget(stateRoot),
			canonicalDirectoryTarget(paths.taskDir),
			realpath(this.core.filesystem.rootDir),
			canonicalDirectoryTarget(requestDir),
		]);
		if (
			resolve(stateRoot) === join(resolve(this.core.filesystem.rootDir), ".backlog") &&
			canonicalStateRoot !== join(canonicalProjectRoot, ".backlog")
		)
			throw new Error(`Cannot forget task ${task.id}: the project state root is redirected.`);
		if (canonicalTaskDir !== join(canonicalStateRoot, basename(paths.taskDir)))
			throw new Error(`Cannot forget task ${task.id}: its session directory resolves outside its canonical task path.`);
		if (canonicalRequestDir !== join(canonicalProjectRoot, ".backlog", "agent-requests"))
			throw new Error(`Cannot forget task ${task.id}: its workspace request directory is redirected.`);
		try {
			const stateFile = await lstat(paths.statePath);
			if (!stateFile.isFile() || stateFile.isSymbolicLink())
				throw new Error(`Cannot forget task ${task.id}: its session state file is not a regular owned file.`);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}

		const sessions = allModeSessions(await this.store.read(task.id));
		for (const session of sessions) {
			if (!/^[A-Za-z0-9._-]+$/.test(session.id))
				throw new Error(`Cannot forget task ${task.id}: session ${session.id} has an invalid identity.`);
			if (
				resolve(session.outputPath) !== resolve(join(paths.taskDir, `${session.id}.log`)) ||
				resolve(session.bootstrapPath) !== resolve(join(paths.taskDir, `${session.id}.md`))
			)
				throw new Error(`Cannot forget task ${taskId}: session ${session.id} has an untrusted sidecar path.`);
		}
		for (const session of sessions) {
			await this.store.mutate(task.id, async (currentState) => {
				const matches = allModeSessions(currentState).filter((current) => current.id === session.id);
				if (
					matches.length === 0 ||
					matches.some(
						(current) =>
							current.taskId !== session.taskId ||
							current.createdAt !== session.createdAt ||
							current.tmuxName !== session.tmuxName ||
							(current.nativeSessionId !== undefined &&
								session.nativeSessionId !== undefined &&
								current.nativeSessionId !== session.nativeSessionId),
					)
				)
					throw new Error(`Cannot forget session ${session.id}: it was removed or replaced during task deletion.`);
				await removeOwnedPath(join(canonicalRequestDir, `${session.id}.json`));
				try {
					await rmdir(canonicalRequestDir);
				} catch (error) {
					if (!["ENOENT", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
				}
				await removeOwnedPath(join(canonicalTaskDir, `${session.id}.log`));
				await removeOwnedPath(join(canonicalTaskDir, `${session.id}.md`));
				await removeOwnedPath(join(canonicalTaskDir, `${session.id}.native-session-id`));
				await removeOwnedPath(join(canonicalTaskDir, `${session.id}.activity`), true);
				for (const [modeId, history] of Object.entries(currentState.modes ?? {})) {
					history.sessions = history.sessions.filter((current) => current.id !== session.id);
					if (history.activeSessionId === session.id) {
						delete history.activeSessionId;
						if (modeId === currentState.legacyModeId) delete currentState.activeSessionId;
					}
				}
				currentState.sessions = currentState.modes?.[currentState.legacyModeId]?.sessions ?? [];
			});
		}
		await this.store.reset(task.id);
	}

	private assertNoLiveSessions(taskId: string, state: SessionState): void {
		const live = allModeSessions(state).filter(
			(session) => session.status === AGENT_SESSION_STATUS.STARTING || session.status === AGENT_SESSION_STATUS.RUNNING,
		);
		if (live.length)
			throw new Error(
				`Cannot reset or purge ${taskId} while sessions are starting or running: ${live.map((session) => session.id).join(", ")}. Stop them in their owning workspace first.`,
			);
	}

	/**
	 * Delete one session record and its persisted files.
	 *
	 * A stopped or failed session is removed directly. A live CLI-backend session
	 * (`RUNNING`/`STARTING`, `nativeWorkspace` falsy) is refused unless `force` is set, in which case
	 * its pane is killed before the record is dropped. A native session that is already running is
	 * owned by its workspace and can only be deleted once that workspace has stopped it; a native
	 * `STARTING` record is an unlaunched request and is removed with its marker.
	 */
	async delete(taskId: string, sessionId: string, options: { force?: boolean } = {}): Promise<void> {
		await this.withTaskSessionAdmission(taskId, async (task) => {
			const session = this.session(await this.store.read(task.id), sessionId);
			const pendingNative = session.nativeWorkspace === true && session.status === AGENT_SESSION_STATUS.STARTING;
			const live = session.status === AGENT_SESSION_STATUS.RUNNING || session.status === AGENT_SESSION_STATUS.STARTING;
			if (live && !pendingNative) {
				if (session.nativeWorkspace)
					throw new Error(`Session ${session.id} is running in its workspace. Stop it there before deleting.`);
				if (!options.force)
					throw new Error(`Agent session ${session.id} is ${session.status}. Stop it first, or delete with --force.`);
				await this.process.kill(session);
			}
			await deleteWorkspaceRequest(this.core.filesystem.rootDir, session.id);
			await this.store.remove(task.id, session.id);
			await Promise.all([removeFile(session.outputPath), removeFile(session.bootstrapPath)]);
		});
	}

	/**
	 * Probe a task's active session pane.
	 *
	 * Observe this exact owned runtime without teardown. Conclusively dead or missing sessions are
	 * settled STOPPED; uncertain inspection errors leave durable state untouched.
	 * Native hosts return a verified read-only pane without changing their owner, status or usage;
	 * a conclusively absent native host is parked for explicit exact-conversation resume.
	 */
	async liveSession(
		taskId: string,
		sessionId: string,
		_options: { passive?: boolean } = {},
	): Promise<SharedAgentAttachment | undefined> {
		return await this.withTaskSessionAdmission(taskId, async (task) => {
			const state = await this.store.read(task.id);
			const record = this.session(state, sessionId);
			if (record.status !== AGENT_SESSION_STATUS.RUNNING && record.status !== AGENT_SESSION_STATUS.STARTING)
				return undefined;
			const runtime = await this.process.nativeRuntimeClassification(record);
			if (runtime.status === "uncertain")
				throw new Error(`Could not inspect agent session ${record.id}: ${runtime.reason}`);
			if (runtime.status === "live") {
				const paneId = runtime.paneId;
				const preset = await this.executionPreset(
					task.id,
					record.preset,
					await this.pathContextForSession(task, record),
				);
				if (record.nativeWorkspace) {
					await this.tagNativeSessionPane(record, paneId, false);
					const agent = agentFor(preset.bootstrap);
					const resources = await this.process.launchResources(paneId);
					const modeId = findSessionMode(state.modes, record.id);
					if (agent && resources && modeId)
						await this.reconcileDeferredIdentity(agent, { record, modeId, paneId, resources });
				}
				return {
					record: this.session(await this.store.read(task.id), sessionId),
					server: this.server,
					exec: this.exec as TmuxExec,
					paneId,
					bootstrap: preset.bootstrap,
				};
			}
			if (runtime.status === "missing" && (await this.hasQueuedWorkspaceRequest(record))) return undefined;
			await this.settleObservedSession(task.id, record, runtime.status === "missing");
			return undefined;
		});
	}

	/** Select or reserve a conversation in one mode. Other mode histories/processes remain untouched. */
	async prepareNativeSession(taskId: string, sessionId?: string, requestedModeId?: ModeId) {
		const prepared = await this.withTaskSessionAdmission(
			taskId,
			async (task) => await this.prepareNativeSessionLocked(task, sessionId, requestedModeId),
		);
		return prepared.attachment;
	}

	private async prepareNativeSessionLocked(
		task: Task,
		sessionId?: string,
		requestedModeId?: ModeId,
		intent: "prepare" | "adopt" = "prepare",
	) {
		let releaseClaim: (() => Promise<void>) | undefined;
		try {
			const resolved = await this.resolveNativeTarget(task, sessionId, requestedModeId, intent);
			releaseClaim = resolved.releaseClaim;
			const admission = await this.admitResolvedTarget(task, resolved.target, resolved.target.queuedRequest);
			if (admission.kind === "attach") return { attachment: admission.attachment, modeId: resolved.target.modeId };
			const launch =
				admission.action === "resume" ? await this.resumeExistingTarget(task, admission.target) : undefined;
			const target = launch
				? { ...admission.target, record: launch.record, preset: launch.preset, settings: launch.settings }
				: admission.target;
			return {
				attachment: await this.launchPreparedTarget(task, target.record, target.preset, admission.action, {
					preflight: launch?.preflight,
					environment: target.environment,
					settings: target.settings,
					failedResume: target.failedResume,
					queuedRequest: target.queuedRequest,
					releaseAdmissionClaim: async () => {
						await releaseClaim?.();
						releaseClaim = undefined;
					},
				}),
				modeId: target.modeId,
			};
		} finally {
			await releaseClaim?.();
		}
	}

	private async resolveNativeTarget(
		task: Task,
		sessionId: string | undefined,
		requestedModeId: ModeId | undefined,
		intent: "prepare" | "adopt",
	): Promise<{ target: ResolvedTarget; releaseClaim?: () => Promise<void> }> {
		const state = await this.store.read(task.id);
		const context = await this.readContext();
		const historyModeId = sessionId ? findSessionMode(state.modes, sessionId) : undefined;
		const resolvedModeId = await this.resolveModeId(task.id, requestedModeId ?? historyModeId, context);
		if (!resolvedModeId) throw new Error(`Could not resolve owning mode for session ${sessionId ?? "new session"}.`);
		const history = state.modes?.[resolvedModeId] ?? { sessions: [] };
		const hasModeCatalog = (await loadAgentConfiguration(this.core, "project"))?.modes !== undefined;
		const selectedId = sessionId ?? (hasModeCatalog ? history.activeSessionId : undefined);
		return selectedId
			? await this.resolveSelectedTarget(task, resolvedModeId, selectedId, intent)
			: await this.createNewTarget(task, resolvedModeId);
	}

	private async resolveSelectedTarget(
		task: Task,
		modeId: ModeId,
		sessionId: string,
		intent: "prepare" | "adopt",
	): Promise<{ target: ResolvedTarget; releaseClaim: () => Promise<void> }> {
		const releaseClaim = await this.store.claimSession(task.id, sessionId);
		try {
			const state = await this.store.read(task.id);
			if (findSessionMode(state.modes, sessionId) !== modeId)
				throw new Error(`Agent session not found in its owning mode: ${sessionId}`);
			const existing = { ...this.modeSession(state.modes?.[modeId] ?? { sessions: [] }, sessionId) };
			const queuedRequest = await this.hasQueuedWorkspaceRequest(existing);
			if (intent === "adopt" && !queuedRequest)
				throw new Error(`Session ${existing.id} is not a verified queued workspace request; refusing adoption.`);
			const pathContext = await this.pathContextForSession(task, existing);
			const execution = await this.executionPresetWithEnvironment(task.id, existing.preset, pathContext);
			const resolved = await this.profileFor(modeId, execution.preset);
			const nativeProvider = agentFor(resolved.preset.bootstrap)?.nativeNamespace;
			if (existing.nativeProvider && nativeProvider && existing.nativeProvider !== nativeProvider)
				throw new Error(
					`Session ${existing.id} belongs to provider ${existing.nativeProvider}, not ${nativeProvider}.`,
				);
			const receipt = await this.store.readNativeSessionIdCandidate(task.id, existing.id);
			const configuration = await this.launchConfiguration(task.id);
			if (!sameRoot(pathContext.projectDir, this.core.filesystem.rootDir))
				throw new Error(`Session ${existing.id} has a mismatched canonical project root.`);
			if (!(await isDirectory(pathContext.worktreeDir)))
				throw new Error(`Session ${existing.id} working directory is missing: ${pathContext.worktreeDir}`);
			return {
				target: {
					record: existing,
					modeId,
					pathContext,
					preset: resolved.preset,
					profile: resolved.profile,
					receipt,
					environment: execution.environment,
					warnings: [],
					queuedRequest,
					settings: resolveSessionSettings(configuration.config),
				},
				releaseClaim,
			};
		} catch (error) {
			await releaseClaim();
			throw error;
		}
	}

	private async createNewTarget(
		task: Task,
		modeId: ModeId,
	): Promise<{ target: ResolvedTarget; releaseClaim: () => Promise<void> }> {
		const paths = await this.store.paths(task.id);
		const resolved = await this.launchConfiguration(task.id);
		const presetName = resolved.config.selectedPreset;
		const configured = resolved.config.presets[presetName];
		if (!configured) throw new Error(`Agent preset not found: ${presetName}`);
		const settings = resolveSessionSettings(resolved.config);
		const cwd = await this.sessionCwdFor(task, settings);
		const pathContext = await this.pathContextFor(task.id, cwd);
		const environment = await prepareHarnessEnvironment(configured.env, pathContext, {
			onWarning: (text) => this.warnEnvironment(text),
		});
		const preset = await resolveLaunchPreset(configured, { cwd, env: environment });
		const id = randomUUID();
		const record: AgentSession = {
			id,
			taskId: task.id,
			preset: presetName,
			tmuxName: nativeSessionName(task.id, id),
			nativeProvider: agentFor(preset.bootstrap)?.nativeNamespace,
			nativeWorkspace: true,
			cwd,
			pathContext,
			createdAt: timestamp(),
			status: AGENT_SESSION_STATUS.STARTING,
			ownerPid: process.pid,
			outputPath: join(paths.taskDir, `${id}.log`),
			bootstrapPath: join(paths.taskDir, `${id}.md`),
		};
		await this.store.mutateMode(task.id, modeId, async (current) => {
			const previous = current.activeSessionId
				? current.sessions.find((candidate) => candidate.id === current.activeSessionId)
				: undefined;
			if (current.sessions.some((candidate) => candidate.status === AGENT_SESSION_STATUS.STARTING))
				throw new Error(`Mode ${modeId} for task ${task.id} already has a pending launch.`);
			if (previous?.status === AGENT_SESSION_STATUS.RUNNING)
				throw new Error(`Session ${previous.id} is already running in mode ${modeId}.`);
			current.sessions.push(record);
		});
		const releaseClaim = await this.store.claimSession(task.id, id);
		return {
			target: {
				record,
				modeId,
				pathContext,
				preset,
				environment,
				warnings: [],
				settings,
				queuedRequest: false,
				newlyCreated: true,
			},
			releaseClaim,
		};
	}

	private async admitResolvedTarget(
		task: Task,
		target: ResolvedTarget,
		queuedRequest: boolean,
	): Promise<NativeAdmission> {
		if (!target.newlyCreated) {
			const current = this.session(await this.store.read(task.id), target.record.id);
			this.assertSameSession(current, target.record);
			const currentTarget = { ...target, record: current };
			const runtime = await this.process.nativeRuntimeClassification(current);
			if (runtime.status === "uncertain")
				throw new Error(`Could not inspect native session ${current.id}: ${runtime.reason}`);
			if (runtime.status === "live") {
				const paneId = runtime.paneId;
				await this.tagNativeSessionPane(current, paneId, false);
				const agent = agentFor(target.preset.bootstrap);
				const resources = await this.process.launchResources(paneId);
				if (agent && resources)
					await this.reconcileDeferredIdentity(agent, {
						record: current,
						modeId: target.modeId,
						paneId,
						resources,
					});
				const observed = this.session(await this.store.read(task.id), current.id);
				await this.tagNativeSessionPane(observed, paneId);
				if (queuedRequest) await deleteWorkspaceRequest(this.core.filesystem.rootDir, current.id);
				return {
					kind: "attach",
					attachment: {
						record: observed,
						server: this.server,
						exec: this.exec as TmuxExec,
						paneId,
						bootstrap: target.preset.bootstrap,
					},
				};
			}
			if (current.status === AGENT_SESSION_STATUS.STARTING && !queuedRequest)
				throw new Error(`Session ${current.id} has an unverified pending launch; refusing adoption.`);
			if (queuedRequest && runtime.status !== "missing")
				throw new Error(`Pending session ${current.id} has an existing non-live runtime; refusing launch.`);
			if (queuedRequest) return { kind: "launch", target: currentTarget, action: "launch-queued" };
			if (current.status === AGENT_SESSION_STATUS.STARTING)
				throw new Error(`Session ${current.id} has an unverified pending launch; refusing adoption.`);
			if (runtime.status === "dead" || runtime.status === "missing") {
				const settings = currentTarget.settings ?? resolveSessionSettings(undefined);
				const marker = current.resumeProbeFailed;
				const matchingFailure = Boolean(
					marker &&
						current.nativeProvider === marker.nativeProvider &&
						current.nativeSessionId === marker.nativeSessionId,
				);
				if (!settings.autoResumeOnRestart || matchingFailure) {
					currentTarget.failedResume = matchingFailure ? marker : undefined;
					return { kind: "launch", target: currentTarget, action: "launch-new" };
				}
			}
			return { kind: "launch", target: currentTarget, action: "resume" };
		}
		return { kind: "launch", target, action: "launch-new" };
	}

	private async resumeExistingTarget(
		task: Task,
		target: ResolvedTarget,
	): Promise<{
		record: AgentSession;
		preset: AgentPreset;
		preflight: PreflightedAgentLaunch;
		settings: SessionSettings;
	}> {
		const { record, receipt } = target;
		const candidate = await this.store.readNativeSessionIdCandidate(task.id, record.id);
		if (candidate !== receipt) throw new Error(`Native session receipt changed for session ${record.id}.`);
		const resumeNativeSessionId = record.nativeSessionId ?? candidate;
		buildAgentResumeCommand(target.preset, resumeNativeSessionId);
		const currentProfile = { preset: target.preset, profile: target.profile };
		const preset = target.preset;
		const settings = target.settings ?? resolveSessionSettings(undefined);
		const pathContext = await this.pathContextForSession(task, record);
		if (!(await isDirectory(pathContext.worktreeDir)))
			throw new Error(`Session ${record.id} working directory is missing: ${pathContext.worktreeDir}`);
		const profile = await this.profileWithCurrentArtifacts(currentProfile.profile, task.id, pathContext.taskDir);
		const preflight = await preflightAgentLaunch(preset, record.bootstrapPath, {
			cwd: pathContext.worktreeDir,
			intent: { kind: "resume", nativeSessionId: resumeNativeSessionId ?? "" },
			sessionId: record.id,
			yolo: settings.yoloMode,
			profile,
			repositoryRoot: pathContext.projectDir,
			taskRoot: pathContext.taskDir,
			environment: target.environment,
		});
		const current = this.session(await this.store.read(task.id), record.id);
		this.assertSameSession(current, record);
		const currentReceipt = await this.store.readNativeSessionIdCandidate(task.id, record.id);
		if (currentReceipt !== receipt) throw new Error(`Native session receipt changed for session ${record.id}.`);
		const immediatelyCurrent = this.session(await this.store.read(task.id), record.id);
		this.assertSameSession(immediatelyCurrent, record);
		await this.process.kill(immediatelyCurrent);
		if (resumeNativeSessionId) immediatelyCurrent.nativeSessionId = resumeNativeSessionId;
		await this.settleStaleNativeSession(task.id, immediatelyCurrent);
		return { record: immediatelyCurrent, preset, preflight, settings };
	}

	private async launchPreparedTarget(
		task: Task,
		record: AgentSession,
		preset: AgentPreset,
		action: "resume" | "launch-queued" | "launch-new",
		launchInputs: {
			preflight?: PreflightedAgentLaunch;
			environment: Record<string, string>;
			settings?: SessionSettings;
			failedResume?: { nativeProvider: string; nativeSessionId: string };
			queuedRequest?: boolean;
			releaseAdmissionClaim?: () => Promise<void>;
		},
	): Promise<SharedAgentAttachment> {
		return await this.launchNativeRecord(task, record, preset, { action, ...launchInputs });
	}

	/**
	 * Launch a pending request this workspace owns, exactly as if Enter had been pressed.
	 *
	 * The marker and durable STARTING record authorize admission; requester PID is informational.
	 */
	async adoptPendingSession(taskId: string, sessionId: string): Promise<SharedAgentAttachment & { modeId: ModeId }> {
		const prepared = await this.withTaskSessionAdmission(
			taskId,
			async (task) => await this.prepareNativeSessionLocked(task, sessionId, undefined, "adopt"),
		);
		return { ...prepared.attachment, modeId: prepared.modeId };
	}

	/**
	 * The shared post-record launch body: render the brief, prepare the launch (which installs the
	 * status hooks and returns the exact native identity), and record that identity. `resume`
	 * separates resuming an existing conversation from launching a never-launched record, and
	 * `demoteOnFailure` marks the record FAILED when the launch cannot complete.
	 */
	private async launchNativeRecord(
		task: { id: string; title: string },
		record: AgentSession,
		preset: AgentPreset,
		options: {
			action: "resume" | "launch-new" | "launch-queued";
			preflight?: PreflightedAgentLaunch;
			environment?: Record<string, string>;
			settings?: SessionSettings;
			failedResume?: { nativeProvider: string; nativeSessionId: string };
			queuedRequest?: boolean;
			releaseAdmissionClaim?: () => Promise<void>;
		},
	): Promise<SharedAgentAttachment> {
		const resume = options.action === "resume";
		const demoteOnFailure = options.action === "launch-new";
		const state = await this.store.read(task.id);
		const modeId = findSessionMode(state.modes, record.id);
		if (!modeId) throw new Error(`Session ${record.id} has no mode.`);
		const currentProfile = options.preflight
			? { preset: options.preflight.preset, profile: options.preflight.options.profile }
			: await this.profileFor(modeId, preset);
		const launchPreset = currentProfile.preset;
		const agent = agentFor(launchPreset.bootstrap);
		if (!agent) throw new Error(`No agent registered for bootstrap type ${launchPreset.bootstrap}.`);
		const nativeProvider = agent.nativeNamespace;
		if (record.nativeProvider && nativeProvider && record.nativeProvider !== nativeProvider)
			throw new Error(`Session ${record.id} belongs to provider ${record.nativeProvider}, not ${nativeProvider}.`);
		const settings: SessionSettings = options.settings
			? options.settings
			: resolveSessionSettings((await this.launchConfiguration(task.id)).config);
		const pathContext = options.preflight
			? {
					projectDir: options.preflight.projectDir,
					worktreeDir: options.preflight.options.cwd,
					taskDir: options.preflight.taskDir,
				}
			: await this.pathContextForSession(task, record);
		const cwd = pathContext.worktreeDir;
		if (!(await isDirectory(cwd))) throw new Error(`Session ${record.id} working directory is missing: ${cwd}`);
		let dispatchAttempted = false;
		let prepared: PreparedAgentLaunch | undefined;
		const launchIdentity = record;
		try {
			const profile = options.preflight
				? options.preflight.options.profile
				: await this.profileWithCurrentArtifacts(currentProfile.profile, task.id, pathContext.taskDir);
			const failedResume = options.action === "launch-new" ? options.failedResume : undefined;
			const launchRecord = record;
			const intent: SessionIntent = resume
				? { kind: "resume", nativeSessionId: record.nativeSessionId ?? "" }
				: { kind: "new" };
			const launch = await this.prepareSessionLaunch(task, launchRecord, modeId, launchPreset, settings, {
				profile,
				intent,
				prepare: resume ? undefined : launchPreset.prepare,
				bootstrapBeforeCreate: true,
				preflight: options.preflight,
				environment: options.environment,
			});
			prepared = launch.prepared;
			const paneId = launch.paneId;
			const identity = prepared.identity;
			const resources = prepared.resources;
			if (!resources) throw new Error(`Prepared launch ${launchRecord.id} has no resource inventory.`);
			const next: AgentSession = {
				...launchRecord,
				cwd,
				...(nativeProvider ? { nativeProvider } : {}),
				nativeWorkspace: true,
				tmuxName: record.tmuxName,
				ownerPid: process.pid,
				status: AGENT_SESSION_STATUS.STARTING,
				error: undefined,
				endedAt: undefined,
			};
			delete next.nativeSessionId; // identity is owned by publishNativeIdentity, not the record shape
			if (options.action === "launch-new") delete next.resumeProbeFailed;
			// A fresh launch discards any previous conversation's receipt before dispatch so a deferred
			// report can never re-deliver it.
			if (intent.kind === "new") await this.store.clearNativeSessionReceipt(next);
			await this.store.mutateSession(task.id, next.id, async (current) => {
				this.assertSameSessionMembership(current, launchRecord);
				Object.assign(current, next);
				// A fresh conversation discards the record's prior identity; publishNativeIdentity owns
				// the new one. Object.assign never removes keys, so drop it explicitly.
				if (intent.kind === "new") delete current.nativeSessionId;
				if (options.action === "launch-new") delete current.resumeProbeFailed;
			});
			const origin: LaunchOrigin = { record: next, modeId, paneId, resources };
			if (identity) {
				await this.publishNativeIdentity(origin, identity);
				next.nativeSessionId = identity.id;
			}
			prepared.env = workspaceContextInto(prepared.env, {
				paneId,
				rootDir: pathContext.projectDir,
				conversation: { taskId: task.id, modeId, sessionId: next.id },
				...(next.nativeSessionId ? { nativeSessionId: next.nativeSessionId } : {}),
			});
			await this.assertSessionIdentity(next);
			dispatchAttempted = true;
			await this.process.launchPrepared(next, prepared);
			await this.reconcileDeferredIdentity(agent, origin);
			await this.store.mutateSession(task.id, next.id, async (current) => {
				this.assertSameSession(current, next);
				current.status = AGENT_SESSION_STATUS.RUNNING;
				current.ownerPid = process.pid;
				current.error = undefined;
				this.touch(current, timestamp());
			});
			await deleteWorkspaceRequest(this.core.filesystem.rootDir, next.id);
			next.status = AGENT_SESSION_STATUS.RUNNING;
			return {
				record: {
					...next,
					status: next.status,
					ownerPid: process.pid,
				},
				server: this.server,
				exec: this.exec as TmuxExec,
				paneId,
				...(prepared.bootstrap ? { bootstrap: prepared.bootstrap } : {}),
				...(prepared.warnings ? { warnings: prepared.warnings } : {}),
				...(failedResume
					? {
							outcome: { kind: "FreshAfterFailedResume" as const, ...failedResume },
							warnings: [
								...(prepared.warnings ?? []),
								`Previous ${failedResume.nativeProvider} conversation ${failedResume.nativeSessionId} failed to resume; started fresh.`,
							],
						}
					: !resume
						? { outcome: { kind: "Fresh" as const } }
						: { outcome: { kind: "Resumed" as const } }),
			};
		} catch (error) {
			if (resume && error instanceof ConclusiveStartupFailureError) {
				const nativeProvider = record.nativeProvider;
				const nativeSessionId = record.nativeSessionId;
				if (!nativeProvider || !nativeSessionId) throw error;
				const failure = new ResumeFailedError(nativeProvider, nativeSessionId, error);
				await options.releaseAdmissionClaim?.();
				await this.store.markResumeProbeFailed(record, modeId, { nativeProvider, nativeSessionId }, failure.message);
				try {
					await this.process.kill(record);
				} catch (cleanupError) {
					throw new AggregateError([cleanupError, failure], "Owned failed-resume pane cleanup failed.", {
						cause: cleanupError,
					});
				}
				throw failure;
			}
			if (!dispatchAttempted) {
				await this.failBeforeDispatch(launchIdentity, prepared, error, async () => {
					if (demoteOnFailure) await this.finishNativeSessionRecord(launchIdentity, String(error));
				});
			}
			throw error;
		}
	}

	async activateNativeSession(
		taskId: string,
		sessionId: string,
		origin: SessionRuntimeOrigin,
		afterActivate?: (currentTask: Task) => Promise<void>,
	): Promise<boolean> {
		return await this.withVerifiedNativeOrigin(
			taskId,
			sessionId,
			origin,
			async (session, history) => {
				session.status = AGENT_SESSION_STATUS.RUNNING;
				session.error = undefined;
				session.endedAt = undefined;
				this.touch(session, timestamp());
				history.activeSessionId = session.id;
			},
			afterActivate,
			true,
		);
	}

	async finishNativeSession(
		taskId: string,
		sessionId: string,
		origin: SessionRuntimeOrigin,
		error?: string,
	): Promise<void> {
		const finished = await this.withVerifiedNativeOrigin(taskId, sessionId, origin, async (session) => {
			session.status = error ? AGENT_SESSION_STATUS.FAILED : AGENT_SESSION_STATUS.STOPPED;
			session.error = error;
			session.endedAt = timestamp();
			session.ownerPid = undefined;
		});
		if (finished) await this.clearNativeSessionPaneTag(origin.record);
	}

	private async finishNativeSessionRecord(expected: AgentSession, error?: string): Promise<void> {
		await this.store.mutateSession(expected.taskId, expected.id, async (session) => {
			this.assertSameSessionMembership(session, expected);
			if (session.status !== expected.status || session.ownerPid !== expected.ownerPid) return false;
			session.status = error ? AGENT_SESSION_STATUS.FAILED : AGENT_SESSION_STATUS.STOPPED;
			session.error = error;
			session.endedAt = timestamp();
			session.ownerPid = undefined;
			// Keep the selected conversation across workspace restarts.
		});
	}

	private async failBeforeDispatch(
		expected: AgentSession,
		prepared: PreparedAgentLaunch | undefined,
		failure: unknown,
		publishFailure: () => Promise<void>,
	): Promise<never> {
		let reported = failure;
		for (const action of [
			...(prepared ? [() => prepared.cleanup()] : []),
			() => this.process.kill(expected),
			publishFailure,
		]) {
			try {
				await action();
			} catch (error) {
				reported = error;
			}
		}
		throw reported;
	}

	/**
	 * Park a session whose process was terminated without ending the session. The harness owns the
	 * conversation; Backlog only releases the process (for example when its workspace exits to free
	 * memory) and keeps the pointer so the session auto-resumes on the next workspace start. Parked
	 * is non-terminal and never `stopped`/`failed`.
	 */
	async parkNativeSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin): Promise<void> {
		await this.withVerifiedNativeOrigin(taskId, sessionId, origin, async (session) => {
			if (session.status === AGENT_SESSION_STATUS.STOPPED || session.status === AGENT_SESSION_STATUS.FAILED) return;
			session.status = AGENT_SESSION_STATUS.PARKED;
			session.ownerPid = undefined;
			session.error = undefined;
			session.endedAt = undefined;
		});
	}

	private async withVerifiedNativeOrigin(
		taskId: string,
		sessionId: string,
		origin: SessionRuntimeOrigin,
		mutate: (session: AgentSession, history: { sessions: AgentSession[]; activeSessionId?: string }) => Promise<void>,
		afterMutation?: (currentTask: Task) => Promise<void>,
		requireLive = false,
	): Promise<boolean> {
		return await this.withTaskSessionAdmission(taskId, async (task) => {
			if (origin.record.taskId !== task.id || origin.record.id !== sessionId) return false;
			const release = await this.store.claimSession(task.id, sessionId);
			try {
				const currentState = await this.store.read(task.id);
				const current = allModeSessions(currentState).find((session) => session.id === sessionId);
				if (!current) return false;
				try {
					this.assertSameSessionMembership(current, origin.record);
				} catch {
					return false;
				}
				const runtime = await this.process.nativeRuntimeClassification(current);
				if (runtime.status === "uncertain")
					throw new Error(`Could not inspect native session ${sessionId}: ${runtime.reason}`);
				if (
					runtime.status === "missing" ||
					runtime.paneId !== origin.paneId ||
					(requireLive && runtime.status !== "live")
				)
					return false;
				const published = await this.store.mutateSession(task.id, sessionId, async (record, history) => {
					try {
						this.assertSameSessionMembership(record, origin.record);
					} catch {
						return false;
					}
					if (record.status !== current.status || record.ownerPid !== current.ownerPid) return false;
					await mutate(record, history);
					return true;
				});
				if (published) await afterMutation?.(task);
				return published;
			} finally {
				await release();
			}
		});
	}

	async start(
		taskId: string,
		options: {
			preset?: string;
			modeId?: ModeId;
			replace?: boolean;
			maxRunningSessions?: number;
		} = {},
	): Promise<AgentSession> {
		const context = await this.readContext();
		if (context) return await this.registerPendingSession(taskId, options, context);
		return await this.withLifecycleAdmission(
			async () =>
				await this.withTaskSessionAdmission(taskId, async (task) => {
					const modeId = await this.resolveModeId(task.id, options.modeId);
					const resolved = await this.launchConfiguration(task.id);
					const presetName = options.preset ?? resolved.config.selectedPreset;
					const preset = resolved.config.presets[presetName];
					if (!preset) throw new Error(`Agent preset not found: ${presetName}`);
					const reservation = await this.reserveSession(
						task,
						presetName,
						preset,
						resolveSessionSettings(resolved.config),
						modeId,
						{ replace: options.replace, maxRunningSessions: options.maxRunningSessions },
					);
					const session = await this.launchReserved(reservation);
					return session;
				}),
		);
	}

	/**
	 * Register a session request for a live workspace to adopt.
	 *
	 * The record is durable and owned: `ownerPid` is the workspace that will launch it, `tmuxName`
	 * is that workspace's private socket, and the status stays STARTING until the workspace adopts
	 * it. This process launches nothing and writes no bootstrap file — the adopting workspace does
	 * both, exactly as if the user had pressed Enter there.
	 */
	async registerPendingSession(
		taskId: string,
		options: { preset?: string; replace?: boolean; modeId?: ModeId },
		context: WorkspaceContext,
	): Promise<AgentSession> {
		return await this.withLifecycleAdmission(
			async () =>
				await this.withTaskSessionAdmission(
					taskId,
					async (task) => await this.registerPendingSessionGated(task, options, context),
				),
		);
	}

	private async registerPendingSessionGated(
		task: Task,
		options: { preset?: string; replace?: boolean; modeId?: ModeId },
		context: WorkspaceContext,
	): Promise<AgentSession> {
		const modeId = await this.resolveModeId(task.id, options.modeId, context);
		const resolved = await this.launchConfiguration(task.id);
		const presetName = options.preset ?? resolved.config.selectedPreset;
		const preset = resolved.config.presets[presetName];
		if (!preset) throw new Error(`Agent preset not found: ${presetName}`);
		const paths = await this.store.paths(task.id);
		const settings = resolveSessionSettings(resolved.config);
		const cwd = await this.sessionCwdFor(task, settings);
		const pathContext = await this.pathContextFor(task.id, cwd);
		let record: AgentSession | undefined;
		await this.store.mutateMode(task.id, modeId, async (history) => {
			if (history.sessions.some((candidate) => candidate.status === AGENT_SESSION_STATUS.STARTING))
				throw new Error(`Mode ${modeId} for task ${task.id} already has an active or reserved session.`);
			if (options.replace) {
				const previous = history.activeSessionId
					? history.sessions.find((candidate) => candidate.id === history.activeSessionId)
					: undefined;
				if (previous) {
					previous.status = AGENT_SESSION_STATUS.PARKED;
					previous.endedAt = undefined;
					previous.ownerPid = undefined;
				}
			} else if (
				history.sessions.some(
					(candidate) =>
						(candidate.status === AGENT_SESSION_STATUS.STARTING || candidate.status === AGENT_SESSION_STATUS.RUNNING) &&
						(candidate.id === history.activeSessionId || candidate.status === AGENT_SESSION_STATUS.STARTING),
				)
			)
				throw new Error(`Mode ${modeId} for task ${task.id} already has an active or reserved session.`);
			const id = randomUUID();
			record = {
				id,
				taskId: task.id,
				preset: presetName,
				tmuxName: nativeSessionName(task.id, id),
				nativeWorkspace: true,
				cwd,
				pathContext,
				createdAt: timestamp(),
				status: AGENT_SESSION_STATUS.STARTING,
				ownerPid: process.pid,
				outputPath: join(paths.taskDir, `${id}.log`),
				bootstrapPath: join(paths.taskDir, `${id}.md`),
			};
			history.sessions.push(record);
		});
		if (!record) throw new Error("Could not reserve an agent session.");
		const pending = record;
		try {
			await writeWorkspaceRequest(this.core.filesystem.rootDir, {
				taskId: task.id,
				sessionId: pending.id,
				pid: process.pid,
			});
		} catch (error) {
			// A record nobody was told about must not block the task. Drop both halves of the request.
			await this.store.mutateMode(task.id, modeId, async (history) => {
				history.sessions = history.sessions.filter((candidate) => candidate.id !== pending.id);
				if (history.activeSessionId === pending.id) delete history.activeSessionId;
			});
			await deleteWorkspaceRequest(this.core.filesystem.rootDir, pending.id);
			throw error;
		}
		return pending;
	}

	private async withLifecycleAdmission<T>(operation: () => Promise<T>): Promise<T> {
		await this.lifecycle.recover();
		return await withModeLifecycleGate(join(this.core.filesystem.rootDir, ".backlog", "agent-workspace"), operation);
	}

	private async reserveSession(
		task: { id: string; title: string; status: string },
		presetName: string,
		preset: AgentPreset,
		settings: SessionSettings,
		modeId: ModeId,
		options: { replace?: boolean; maxRunningSessions?: number } = {},
	): Promise<{
		task: { id: string; title: string; status: string };
		presetName: string;
		launchPreset: AgentPreset;
		settings: SessionSettings;
		modeId: ModeId;
		profile: Awaited<ReturnType<AgentSessionService["profileFor"]>>;
		reserved: AgentSession;
		preceding?: AgentSession;
		priorActiveSessionId?: string;
		priorPrecedingStatus?: AgentSession["status"];
		maxRunningSessions?: number;
	}> {
		const paths = await this.store.paths(task.id);
		const cwd = await this.sessionCwdFor(task, settings);
		const pathContext = await this.pathContextFor(task.id, cwd);
		const launchPreset = await resolveLaunchPreset(preset, {
			cwd,
			env: await prepareHarnessEnvironment(preset.env, pathContext, {
				onWarning: (text) => this.warnEnvironment(text),
			}),
		});
		const profile = await this.profileFor(modeId, launchPreset);
		let session: AgentSession | undefined;
		let preceding: AgentSession | undefined;
		let priorActiveSessionId: string | undefined;
		let priorPrecedingStatus: AgentSession["status"] | undefined;
		await this.store.mutateMode(task.id, modeId, async (history) => {
			priorActiveSessionId = history.activeSessionId;
			if (history.sessions.some((candidate) => candidate.status === AGENT_SESSION_STATUS.STARTING))
				throw new Error(`Mode ${modeId} for task ${task.id} already has an active or reserved session.`);
			if (options.replace) {
				preceding = history.activeSessionId
					? history.sessions.find((candidate) => candidate.id === history.activeSessionId)
					: undefined;
				if (preceding) {
					priorPrecedingStatus = preceding.status;
					preceding.status = AGENT_SESSION_STATUS.PARKED;
					preceding.endedAt = undefined;
					preceding.ownerPid = undefined;
				}
			} else if (
				history.sessions.some(
					(candidate) =>
						(candidate.status === AGENT_SESSION_STATUS.STARTING || candidate.status === AGENT_SESSION_STATUS.RUNNING) &&
						(candidate.id === history.activeSessionId || candidate.status === AGENT_SESSION_STATUS.STARTING),
				)
			)
				throw new Error(`Mode ${modeId} for task ${task.id} already has an active or reserved session.`);
			const id = randomUUID();
			const nativeProvider = agentFor(profile.preset.bootstrap)?.nativeNamespace;
			const next: AgentSession = {
				id,
				taskId: task.id,
				preset: presetName,
				tmuxName: nativeSessionName(task.id, id),
				...(nativeProvider ? { nativeProvider } : {}),
				cwd,
				pathContext,
				createdAt: timestamp(),
				status: AGENT_SESSION_STATUS.STARTING,
				ownerPid: process.pid,
				outputPath: join(paths.taskDir, `${id}.log`),
				bootstrapPath: join(paths.taskDir, `${id}.md`),
			};
			session = next;
			history.sessions.push(next);
		});
		if (!session) throw new Error("Could not reserve an agent session.");
		return {
			task,
			presetName,
			launchPreset: profile.preset,
			settings,
			modeId,
			profile,
			reserved: session,
			preceding,
			priorActiveSessionId,
			priorPrecedingStatus,
			maxRunningSessions: options.maxRunningSessions,
		};
	}

	private async launchReserved(
		reservation: Awaited<ReturnType<AgentSessionService["reserveSession"]>>,
	): Promise<AgentSession> {
		const { task, launchPreset, settings, modeId, profile, reserved, preceding, maxRunningSessions } = reservation;
		let releasePredecessor: (() => Promise<void>) | undefined;
		const releaseReserved = await this.store.claimSession(task.id, reserved.id);
		let launchOutcomeUncertain = false;
		let prepared: PreparedAgentLaunch | undefined;
		let dispatchAttempted = false;
		try {
			const pathContext = await this.pathContextForSession(task, reserved);
			const launch = await this.prepareSessionLaunch(task, reserved, modeId, launchPreset, settings, {
				profile: profile.profile,
				intent: { kind: "new" },
				prepare: launchPreset.prepare,
				clearWorkspaceContext: true,
			});
			const paneId = launch.paneId;
			const preparedLaunch = launch.prepared;
			prepared = preparedLaunch;
			const identity = preparedLaunch.identity;
			const resources = preparedLaunch.resources;
			if (!resources) throw new Error(`Prepared launch ${reserved.id} has no resource inventory.`);
			const agent = agentFor(launchPreset.bootstrap);
			if (!agent) throw new Error(`No agent registered for bootstrap type ${launchPreset.bootstrap}.`);
			await this.store.clearNativeSessionReceipt(reserved);
			const origin: LaunchOrigin = { record: reserved, modeId, paneId, resources };
			if (identity) await this.publishNativeIdentity(origin, identity);
			if (identity) reserved.nativeSessionId = identity.id;
			else delete reserved.nativeSessionId;
			preparedLaunch.env = workspaceContextInto(preparedLaunch.env, {
				paneId,
				rootDir: pathContext.projectDir,
				conversation: { taskId: task.id, modeId, sessionId: reserved.id },
				...(reserved.nativeSessionId ? { nativeSessionId: reserved.nativeSessionId } : {}),
			});
			await this.assertSessionIdentity(reserved);
			// Keep execution attribution through publication and follow-up failures; they do not prove stop.
			launchOutcomeUncertain = true;
			dispatchAttempted = true;
			await this.process.launchPrepared(reserved, prepared);
			await this.reconcileDeferredIdentity(agent, origin);
			await this.store.mutateSession(task.id, reserved.id, async (current, history, currentModeId) => {
				this.assertSameSession(current, reserved);
				current.status = AGENT_SESSION_STATUS.RUNNING;
				current.ownerPid = undefined;
				current.error = undefined;
				this.touch(current, timestamp());
				if (currentModeId === modeId) history.activeSessionId = current.id;
			});
			reserved.status = AGENT_SESSION_STATUS.RUNNING;
			this.touch(reserved, timestamp());
			if (preceding) {
				releasePredecessor = await this.store.claimSession(task.id, preceding.id);
				const current = allModeSessions(await this.store.read(task.id)).find((session) => session.id === preceding.id);
				if (!current) throw new Error(`Agent session not found: ${preceding.id}`);
				this.assertSameSessionMembership(current, preceding);
				if (current.status !== AGENT_SESSION_STATUS.PARKED || current.ownerPid !== undefined)
					throw new Error(`Cannot retire session ${preceding.id}: its status or owner changed during replacement.`);
				await this.process.demote(current);
				await this.process.killRetired(current);
				await releasePredecessor();
				releasePredecessor = undefined;
			}
			await this.enforceRunningLimit(reserved, maxRunningSessions ?? DEFAULT_MAX_RUNNING_AGENT_SESSIONS);
			return reserved;
		} catch (error) {
			if (!launchOutcomeUncertain) {
				await this.failBeforeDispatch(reserved, dispatchAttempted ? undefined : prepared, error, async () => {
					await this.store.mutateSession(task.id, reserved.id, async (current, history, currentModeId) => {
						if (current.id !== reserved.id || current.createdAt !== reserved.createdAt) return false;
						current.status = AGENT_SESSION_STATUS.FAILED;
						current.endedAt = timestamp();
						current.error = error instanceof Error ? error.message : String(error);
						if (currentModeId === modeId && history.activeSessionId === reserved.id) {
							history.activeSessionId = reservation.priorActiveSessionId;
							if (preceding) {
								const previous = history.sessions.find((candidate) => candidate.id === preceding.id);
								if (previous) {
									previous.status = AGENT_SESSION_STATUS.PARKED;
									previous.endedAt = undefined;
									previous.ownerPid = undefined;
								}
							}
						}
					});
				});
				reserved.status = AGENT_SESSION_STATUS.FAILED;
				reserved.endedAt = timestamp();
				reserved.error = error instanceof Error ? error.message : String(error);
			}
			throw error;
		} finally {
			await releasePredecessor?.();
			await releaseReserved();
		}
	}

	private async stopClaimedSession(taskId: string, expected: AgentSession, runtimePreflighted = false): Promise<void> {
		const current = allModeSessions(await this.store.read(taskId)).find((candidate) => candidate.id === expected.id);
		if (!current) throw new Error(`Agent session not found: ${expected.id}`);
		this.assertSameSessionMembership(current, expected);
		if (current.status !== expected.status || current.ownerPid !== expected.ownerPid)
			throw new Error(`Cannot safely stop session ${current.id}: its status or owner changed during shutdown.`);
		if (current.nativeWorkspace && !runtimePreflighted) {
			const runtime = await this.process.nativeRuntimeClassification(current);
			if (runtime.status === "uncertain")
				throw new Error(`Cannot safely inspect native session ${current.id}: ${runtime.reason}`);
		}
		await this.process.kill(current);
		await this.store.mutateSession(taskId, current.id, async (record, history) => {
			this.assertSameSessionMembership(record, current);
			if (record.status !== current.status || record.ownerPid !== current.ownerPid)
				throw new Error(`Cannot safely stop session ${current.id}: its status or owner changed during shutdown.`);
			record.status = AGENT_SESSION_STATUS.STOPPED;
			record.endedAt = timestamp();
			record.ownerPid = undefined;
			if (history.activeSessionId === record.id) delete history.activeSessionId;
		});
		if (current.nativeWorkspace) {
			await deleteWorkspaceRequest(this.core.filesystem.rootDir, current.id);
			await this.clearNativeSessionPaneTag(current);
		}
	}

	async stop(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void> {
		await this.withTaskSessionAdmission(taskId, async (task) => {
			const state = await this.store.read(task.id);
			const selected = sessionId
				? this.session(state, sessionId)
				: findActiveSession(state.modes?.[await this.resolveModeId(task.id, modeId)] ?? { sessions: [] });
			if (!selected) throw new Error("Agent session not found: active");
			const release = await this.store.claimSession(task.id, selected.id);
			try {
				await this.stopClaimedSession(task.id, selected);
			} finally {
				await release();
			}
		});
	}

	/** Stop every UUID recorded for a task, regardless of mode or active-session pointer. */
	async stopAllTaskSessions(taskId: string, ownedStops?: OwnedNativeSessionStops): Promise<void> {
		if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false")
			throw new Error(`Task session locking is disabled; refusing destructive session cleanup for ${taskId}.`);
		const snapshot = await this.store.read(taskId);
		const modeHistories = Object.entries(snapshot.modes ?? {});
		const entries = allModeSessions(snapshot)
			.map((session) => ({
				session,
				modeId:
					modeHistories.find(([, history]) => history.sessions.some((entry) => entry.id === session.id))?.[0] ??
					snapshot.legacyModeId,
			}))
			.sort((left, right) => left.session.id.localeCompare(right.session.id));
		const identity = ({ session, modeId }: (typeof entries)[number]) =>
			JSON.stringify([
				modeId,
				session.taskId,
				session.id,
				session.createdAt,
				session.status,
				session.nativeWorkspace,
				session.nativeProvider,
				session.tmuxName,
				session.nativeSessionId,
				session.ownerPid,
			]);
		const releases: Array<() => Promise<void>> = [];
		const failures: unknown[] = [];
		try {
			for (const { session } of entries) releases.push(await this.store.claimSession(taskId, session.id));
			const claimedState = await this.store.read(taskId);
			const claimedModes = Object.entries(claimedState.modes ?? {});
			const claimed = allModeSessions(claimedState)
				.map((session) => ({
					session,
					modeId:
						claimedModes.find(([, history]) => history.sessions.some((entry) => entry.id === session.id))?.[0] ??
						claimedState.legacyModeId,
				}))
				.sort((left, right) => left.session.id.localeCompare(right.session.id));
			if (
				entries.length !== claimed.length ||
				entries.some((entry, index) => identity(entry) !== identity(claimed[index]!))
			)
				throw new Error(
					`Cannot safely stop sessions for task ${taskId}: session history changed while acquiring cleanup claims. Retry task deletion.`,
				);
			const sessionIds = new Set(entries.map(({ session }) => session.id));
			for (const sessionId of ownedStops?.keys() ?? [])
				if (!sessionIds.has(sessionId))
					throw new Error(
						`Cannot stop owned native session ${sessionId}: it is not present in task ${taskId} history.`,
					);

			// Verify every native target before stopping or publishing any records.
			for (const { session } of entries) {
				if (session.status === AGENT_SESSION_STATUS.STOPPED || session.status === AGENT_SESSION_STATUS.FAILED) continue;
				if (!session.nativeWorkspace) continue;
				const runtime = await this.process.nativeRuntimeClassification(session);
				if (runtime.status === "uncertain")
					throw new Error(`Cannot safely inspect native session ${session.id}: ${runtime.reason}`);
			}
			for (const { session } of entries) {
				if (session.status === AGENT_SESSION_STATUS.STOPPED || session.status === AGENT_SESSION_STATUS.FAILED) continue;
				await this.stopClaimedSession(taskId, session, session.nativeWorkspace);
			}
		} catch (error) {
			failures.push(error);
		}
		const released = await Promise.allSettled(releases.reverse().map(async (release) => await release()));
		for (const result of released) if (result.status === "rejected") failures.push(result.reason);
		if (failures.length === 1) throw failures[0];
		if (failures.length > 1)
			throw new AggregateError(failures, `Task ${taskId} session cleanup or claim release failed.`, {
				cause: failures[0],
			});
	}

	async cleanupTaskWorktreeSessions(taskId: string, ownedStops?: OwnedNativeSessionStops): Promise<void> {
		await this.stopAllTaskSessions(taskId, ownedStops);
	}

	async output(taskId: string, sessionId?: string, modeId?: ModeId): Promise<string> {
		const { task, session } = await this.sessionSnapshot(taskId, sessionId, false, modeId);
		await this.touchSession(task.id, session.id);
		try {
			return await Bun.file(session.outputPath).text();
		} catch {
			throw new Error(`Could not read session ${session.id} output.`);
		}
	}
	async sendKey(taskId: string, sessionId: string, key: string): Promise<void> {
		const { session } = await this.sessionSnapshot(taskId, sessionId);
		if (session.nativeWorkspace) throw new Error("Send input through the native workspace terminal.");
		await this.process.sendKey(session, key);
	}

	/**
	 * Ask a handed-off session a question and return its answer.
	 *
	 * The target is a specific session when `sessionId` is given, otherwise the most recently used
	 * non-active session. Running and starting sessions are refused: their agent is mid-turn and a
	 * second invocation of the harness would race it rather than add to its conversation.
	 *
	 * When the harness does not finish within the ask timeout, the captured partial output is
	 * returned with `timedOut: true` instead of being discarded. The timeout defaults to
	 * {@link ASK_TIMEOUT_MS} and is configurable through `BACKLOG_ASK_TIMEOUT_MS`.
	 */
	async ask(
		taskId: string,
		question: string,
		options: { sessionId?: string; modeId?: ModeId } = {},
	): Promise<{ answer: string; timedOut: boolean }> {
		return await this.withTaskSessionAdmission(taskId, async (task) => {
			const state = await this.store.read(task.id);
			const context = await this.readContext();
			const modeId = options.sessionId
				? (findSessionMode(state.modes, options.sessionId) ??
					(await this.resolveModeId(task.id, options.modeId, context)))
				: await this.resolveModeId(task.id, options.modeId, context);
			let target = options.sessionId
				? this.session(state, options.sessionId)
				: this.previousSession(state, modeId, context?.conversation?.sessionId);
			const releaseClaim = await this.store.claimSession(task.id, target.id);
			try {
				const current = allModeSessions(await this.store.read(task.id)).find((session) => session.id === target.id);
				if (!current) throw new Error(`Agent session not found: ${target.id}`);
				this.assertSameSessionMembership(current, target);
				target = current;
				if (target.status !== AGENT_SESSION_STATUS.STOPPED)
					throw new Error(`Agent session ${target.id} is ${target.status}. Stop it before asking a question.`);
				const pathContext = await this.pathContextForSession(task, target);
				if (!(await isDirectory(pathContext.worktreeDir)))
					throw new Error(`Session ${target.id} working directory is missing: ${pathContext.worktreeDir}`);
				const currentProfile = await this.profileFor(
					modeId,
					await this.executionPreset(task.id, target.preset, pathContext),
				);
				const preset = currentProfile.preset;
				const agent = agentFor(preset.bootstrap);
				if (!agent?.supported)
					throw new Error(`Agent session ${target.id} uses an unsupported agent: ${preset.bootstrap}.`);
				if (!target.nativeSessionId)
					throw new Error(`Agent session ${target.id} has no native session id to ask a question of.`);
				if (target.nativeProvider && agent.nativeNamespace && target.nativeProvider !== agent.nativeNamespace)
					throw new Error(
						`Session ${target.id} belongs to provider ${target.nativeProvider}, not ${agent.nativeNamespace}; refusing to ask with a different provider.`,
					);
				const roots = {
					repositoryRoot: pathContext.projectDir,
					taskRoot: pathContext.taskDir,
					cwd: pathContext.worktreeDir,
				};
				const profile = await this.profileWithCurrentArtifacts(currentProfile.profile, task.id, roots.taskRoot);
				const prepared = await prepareAgentAsk(preset, target.nativeSessionId, question, profile, {
					repositoryRoot: roots.repositoryRoot,
					taskRoot: roots.taskRoot,
					cwd: roots.cwd,
				});
				if (
					context?.conversation?.taskId === target.taskId &&
					context.conversation.modeId === modeId &&
					context.conversation.sessionId === target.id &&
					context.nativeSessionId === target.nativeSessionId
				)
					prepared.env = workspaceContextInto(prepared.env, {
						paneId: context.paneId,
						rootDir: context.rootDir,
						conversation: context.conversation,
						...(context.nativeSessionId ? { nativeSessionId: context.nativeSessionId } : {}),
					});
				else delete prepared.env[WORKSPACE_CONTEXT_ENV];
				try {
					const timeoutMs = Number(process.env.BACKLOG_ASK_TIMEOUT_MS) || ASK_TIMEOUT_MS;
					const result = await this.runner.run(["/bin/sh", "-lc", prepared.command], {
						cwd: roots.cwd,
						env: prepared.env,
						timeoutMs,
					});
					if (result.timedOut) {
						const answer = result.stdout.trim();
						if (answer) return { answer, timedOut: true };
						throw fail(`Agent session ${target.id} did not answer within ${timeoutMs}ms`, result);
					}
					if (result.exitCode !== 0) throw fail(`Agent session ${target.id} could not answer`, result);
					return { answer: result.stdout.trim(), timedOut: false };
				} finally {
					await prepared.cleanup();
				}
			} finally {
				await releaseClaim();
			}
		});
	}

	async attach(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void> {
		const { task, session } = await this.sessionSnapshot(taskId, sessionId, !sessionId, modeId);
		if (session.nativeWorkspace) throw new Error("Open this session in the native workspace session picker.");
		await this.touchSession(task.id, session.id);
		await this.process.attach(session);
	}

	async touchUsage(taskId: string, sessionId?: string, modeId?: ModeId): Promise<void> {
		const task = await this.requireTask(taskId);
		const state = await this.store.read(task.id);
		const owner = sessionId ? findSessionMode(state.modes, sessionId) : await this.resolveModeId(task.id, modeId);
		const history = owner ? state.modes?.[owner] : undefined;
		const session = sessionId
			? findSessionById(history?.sessions ?? [], sessionId)
			: history
				? findActiveSession(history)
				: undefined;
		if (session) await this.touchSession(task.id, session.id);
	}

	/**
	 * Bring persisted task state back in line with reality: tmux has no event stream here, so the
	 * only way to learn a pane died is to probe it. This is the single place that probes. It is
	 * is observational: dead/missing owned instances settle STOPPED, without teardown.
	 */
	async reconcileTaskSessions(taskId: string): Promise<void> {
		const startedAt = Date.now();
		const task = await this.requireTask(taskId);
		if (isEnabled("session")) debug("session", "reconcile.begin", { taskId });
		await this.withTaskSessionAdmission(
			task.id,
			async (currentTask) => await this.settleDeadSessions(currentTask.id, await this.store.read(currentTask.id)),
		);
		if (isEnabled("session")) debug("session", "reconcile.end", { taskId, ms: Date.now() - startedAt });
	}

	/**
	 * Probe every STARTING/RUNNING exact instance and settle only conclusively absent runtimes.
	 */
	private async settleDeadSessions(taskId: string, state: SessionState): Promise<void> {
		const live = allModeSessions(state).filter(
			(candidate) =>
				candidate.status === AGENT_SESSION_STATUS.STARTING || candidate.status === AGENT_SESSION_STATUS.RUNNING,
		);
		for (const session of live) {
			const runtime = await this.process.nativeRuntimeClassification(session);
			if (runtime.status === "live") continue;
			if (runtime.status === "uncertain")
				throw new Error(`Could not inspect agent session ${session.id}: ${runtime.reason}`);
			if (
				runtime.status === "missing" &&
				session.status === AGENT_SESSION_STATUS.STARTING &&
				(await this.hasQueuedWorkspaceRequest(session))
			)
				continue;
			await this.settleObservedSession(taskId, session, runtime.status === "missing");
		}
	}

	private async hasQueuedWorkspaceRequest(session: AgentSession): Promise<boolean> {
		if (session.status !== AGENT_SESSION_STATUS.STARTING) return false;
		return (await readWorkspaceRequests(this.core.filesystem.rootDir)).some(
			(request) => request.taskId === session.taskId && request.sessionId === session.id,
		);
	}

	private async settleObservedSession(
		taskId: string,
		observed: AgentSession,
		preserveQueuedRequest: boolean,
	): Promise<void> {
		await this.store.mutateSession(taskId, observed.id, async (current) => {
			this.assertSameSessionMembership(current, observed);
			if (
				current.status !== observed.status ||
				current.ownerPid !== observed.ownerPid ||
				current.lastUsedAt !== observed.lastUsedAt
			)
				return;
			if (preserveQueuedRequest && (await this.hasQueuedWorkspaceRequest(current))) return;
			current.status = AGENT_SESSION_STATUS.STOPPED;
			current.ownerPid = undefined;
			current.endedAt = timestamp();
			current.error = undefined;
		});
	}

	private async settleStaleNativeSession(taskId: string, observed: AgentSession): Promise<void> {
		await this.store.mutateSession(taskId, observed.id, async (current) => {
			this.assertSameSessionMembership(current, observed);
			if (
				current.status !== observed.status ||
				current.ownerPid !== observed.ownerPid ||
				current.lastUsedAt !== observed.lastUsedAt
			)
				return;
			current.status = AGENT_SESSION_STATUS.STOPPED;
			current.ownerPid = undefined;
			current.endedAt = timestamp();
			current.error = undefined;
		});
	}

	private async enforceRunningLimit(current: AgentSession, max: number): Promise<void> {
		if (max < 1) return;
		const startedAt = Date.now();
		const states = await this.store.readAll();
		const live: AgentSession[] = [];
		// SUSPECT: nested for-of over ALL task states x ALL sessions with a serialized
		// `await this.process.alive(session)` per RUNNING session — O(total sessions) tmux execs
		// on every session start, with no bound on the iteration.
		if (isEnabled("session")) debug("session", "enforceRunningLimit.scan", { taskStates: states.length, max });
		for (const state of states) {
			for (const session of state.sessions) {
				if (session.nativeWorkspace || session.status !== AGENT_SESSION_STATUS.RUNNING) continue;
				const alive = await this.process.alive(session);
				if (alive.exitCode === 0 && alive.stdout.trim() === "0") live.push(session);
			}
		}
		if (isEnabled("session"))
			debug("session", "enforceRunningLimit.done", { live: live.length, ms: Date.now() - startedAt });
		if (live.length <= max) return;
		const candidates = live
			.filter((session) => session.id !== current.id && session.taskId !== current.taskId)
			.sort((left, right) => {
				const use = (left.useCount ?? 0) - (right.useCount ?? 0);
				if (use !== 0) return use;
				return (left.lastUsedAt ?? left.createdAt).localeCompare(right.lastUsedAt ?? right.createdAt);
			});
		const stopCount = live.length - max;
		for (const session of candidates.slice(0, stopCount)) {
			await this.process.kill(session);
			await this.store.mutateSession(session.taskId, session.id, async (current, history) => {
				current.status = AGENT_SESSION_STATUS.STOPPED;
				current.endedAt = timestamp();
				if (history.activeSessionId === current.id) delete history.activeSessionId;
			});
		}
	}

	private async touchSession(taskId: string, sessionId: string): Promise<void> {
		await this.store.mutateSession(taskId, sessionId, async (session) => {
			this.touch(session, timestamp());
		});
	}

	private touch(session: AgentSession, at: string): void {
		session.lastUsedAt = at;
		session.useCount = (session.useCount ?? 0) + 1;
	}

	/**
	 * The cwd a session should run in. A task-owned worktree is used only when the worktree-per-task
	 * setting is on and the worktree already exists; otherwise the session stays at the project root.
	 */
	private async sessionCwdFor(task: { id: string; title: string }, settings: SessionSettings): Promise<string> {
		if (settings.worktreePerTask && (await taskWorktreeExists(this.core.filesystem.rootDir, task))) {
			return taskWorktreePath(this.core.filesystem.rootDir, task);
		}
		return this.core.filesystem.rootDir;
	}

	private async requireTask(taskId: string) {
		const task = await this.core.loadTaskById(taskId, { includeCrossBranch: false, includeArchived: true });
		if (!task || task.source === TASK_SOURCE.REMOTE || task.source === TASK_SOURCE.LOCAL_BRANCH)
			throw new Error(`Locally editable task not found: ${taskId}`);
		return task;
	}

	private async sessionSnapshot(taskId: string, sessionId?: string, activeOnly = true, requestedModeId?: ModeId) {
		const task = await this.requireTask(taskId);
		const state = await this.store.read(task.id);
		if (sessionId && requestedModeId && findSessionMode(state.modes, sessionId) !== requestedModeId)
			throw new Error(`Session ${sessionId} does not belong to mode ${requestedModeId}.`);
		const modeId = sessionId
			? findSessionMode(state.modes, sessionId)
			: await this.resolveModeId(task.id, requestedModeId, await this.readContext());
		const history = modeId ? state.modes?.[modeId] : undefined;
		const session = sessionId ? this.session(state, sessionId) : history ? findActiveSession(history) : undefined;
		if (!session) throw new Error(`Agent session not found: ${sessionId ?? "active"}`);
		if (activeOnly && session.status !== AGENT_SESSION_STATUS.RUNNING)
			throw new Error(`Agent session ${session.id} is not active.`);
		return { task, session };
	}

	private session(state: SessionState, id: string): AgentSession {
		const session =
			Object.values(state.modes ?? {})
				.flatMap((history) => history.sessions)
				.find((candidate) => candidate.id === id) ?? state.sessions.find((candidate) => candidate.id === id);
		if (!session) throw new Error(`Agent session not found: ${id}`);
		return session;
	}

	private modeSession(history: { sessions: AgentSession[] }, id: string): AgentSession {
		const session = findSessionById(history.sessions, id);
		if (!session) throw new Error(`Agent session not found in its owning mode: ${id}`);
		return session;
	}

	/** Most recently used prior conversation within the requested mode. */
	private previousSession(state: SessionState, modeId: ModeId, callerSessionId?: string): AgentSession {
		const history = state.modes?.[modeId];
		const [previous] = (history?.sessions ?? [])
			.filter((candidate) => candidate.id !== history?.activeSessionId && candidate.id !== callerSessionId)
			.sort((left, right) => (right.lastUsedAt ?? right.createdAt).localeCompare(left.lastUsedAt ?? left.createdAt));
		if (!previous)
			throw new Error(
				`Task ${state.taskId} mode ${modeId} has no previous session to ask. Start one, hand off, then ask.`,
			);
		return previous;
	}
}
