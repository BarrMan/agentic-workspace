import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Core } from "../controller/agentic-workspace.ts";
import { ensureTaskWorktree, taskWorktreePath } from "../filesystem/git/task-worktree.ts";
import { allModeSessions, findSessionMode, nativeSessionName } from "../model/session/session-utils.ts";
import {
	AGENT_SESSION_STATUS,
	type AgentPreset,
	type AgentSession,
	type AgentSessionPathContext,
	type ModeId,
	type ModeProfile,
	type SessionSettings,
} from "../model/session/types.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import { TASK_SOURCE, type Task } from "../model/types.ts";
import { getDefaultModeCatalog, loadAgentConfiguration, resolveSessionPreset } from "../storage/config.ts";
import type { SessionState, SessionStore } from "../storage/session-store.ts";
import type { Agent, LaunchOrigin, NativeIdentity, SessionIntent } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import { validateExplicitModel } from "./agents/profile.ts";
import { buildAgentResumeCommand, renderSessionBootstrap } from "./bootstrap.ts";
import { prepareHarnessEnvironment } from "./harness-environment.ts";
import {
	type PreflightedAgentLaunch,
	type PreparedAgentLaunch,
	preflightAgentLaunch,
	prepareAgentLaunchResources,
} from "./session-launch.ts";
import type { SessionProcess, TmuxServer } from "./session-process.ts";
import {
	deleteWorkspaceRequest,
	WORKSPACE_CONTEXT_ENV,
	type WorkspaceContext,
	workspaceContextInto,
} from "./workspace-context.ts";

const NATIVE_SESSION_PANE_OPTION = "@agentic_workspace_native_session_id";

export function sameRoot(left: string, right: string): boolean {
	try {
		return realpathSync(left) === realpathSync(right);
	} catch {
		return false;
	}
}

export async function pathContextForSession(
	core: Core,
	task: { id: string },
	session: AgentSession,
): Promise<AgentSessionPathContext> {
	const saved = session.pathContext;
	return {
		projectDir: saved?.projectDir ?? core.projectRoot,
		worktreeDir: saved?.worktreeDir ?? session.cwd,
		taskDir: saved?.taskDir ?? (await core.taskArtifactContainerPath(task.id)),
	};
}

export async function tagNativeSessionPane(
	core: Core,
	server: TmuxServer,
	session: AgentSession,
	paneId: string,
	publish = true,
): Promise<void> {
	const pathContext = await pathContextForSession(core, { id: session.taskId }, session);
	if (!sameRoot(pathContext.projectDir, core.projectRoot))
		throw new Error(`Session ${session.id} has a mismatched canonical project root.`);
	const panes = await server.cmd("list-panes", [
		"-t",
		paneId,
		"-F",
		`#{@agentic_workspace_root}\t#{@agentic_workspace_task}\t#{@agentic_workspace_session}\t#{pane_id}\t#{${NATIVE_SESSION_PANE_OPTION}}\t#{@agentic_workspace_native_provider}`,
	]);
	const [rootDir, taskId, sessionId, observedPaneId, nativeSessionId, nativeProvider] =
		panes.length === 1 ? (panes[0]?.split("\t") ?? []) : [];
	if (
		!sameRoot(rootDir ?? "", core.projectRoot) ||
		!taskIdsEqual(taskId ?? "", session.taskId) ||
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
	await server.cmd("set-option", ["-p", "-t", paneId, NATIVE_SESSION_PANE_OPTION, session.nativeSessionId]);
	if (session.nativeProvider)
		await server.cmd("set-option", ["-p", "-t", paneId, "@agentic_workspace_native_provider", session.nativeProvider]);
}

export function warnEnvironment(text: string): void {
	process.stderr.write(`warning: ${text}\n`);
}

export async function prepareSessionLaunch(
	core: Core,
	store: SessionStore,
	process: SessionProcess,
	server: TmuxServer,
	task: { id: string; title: string },
	record: AgentSession,
	modeId: ModeId,
	preset: AgentPreset,
	settings: SessionSettings,
	options: {
		profile: ModeProfile;
		intent: SessionIntent;
		prepare?: string;
		clearWorkspaceContext?: boolean;
		bootstrapBeforeCreate?: boolean;
		preflight?: PreflightedAgentLaunch;
		environment?: Record<string, string>;
	},
): Promise<{ paneId: string; prepared: PreparedAgentLaunch; agent: Agent }> {
	const pathContext = await pathContextForSession(core, task, record);
	const warnings: string[] = [];
	let environment = options.preflight
		? { ...options.preflight.environment }
		: options.environment
			? { ...options.environment }
			: await prepareHarnessEnvironment(preset.env, pathContext, {
					onWarning: (text) => {
						warnings.push(text);
						warnEnvironment(text);
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
	const nativeProvider = preflight.agent.nativeNamespace;
	if (record.nativeProvider && nativeProvider && record.nativeProvider !== nativeProvider)
		throw new Error(`Session ${record.id} belongs to provider ${record.nativeProvider}, not ${nativeProvider}.`);
	if (options.clearWorkspaceContext) delete environment[WORKSPACE_CONTEXT_ENV];
	if (options.bootstrapBeforeCreate)
		await store.write(record.bootstrapPath, renderSessionBootstrap({ taskId: task.id }));
	await process.assertNoPreparedResources(record);
	await process.create(record, environment);
	const paneId = await process.paneId(record);
	// A fresh intent discards any prior native identity; only a resume carries the record's exact ID
	// onto the pane before the adapter prepares the launch.
	const paneRecord = options.intent.kind === "resume" ? record : { ...record, nativeSessionId: undefined };
	environment = workspaceContextInto(environment, {
		paneId,
		rootDir: pathContext.projectDir,
		conversation: { taskId: task.id, modeId, sessionId: record.id },
		...(paneRecord.nativeSessionId ? { nativeSessionId: paneRecord.nativeSessionId } : {}),
	});
	await tagNativeSessionPane(core, server, paneRecord, paneId);
	if (options.prepare) await process.prepare(options.prepare, pathContext.worktreeDir, environment);
	if (!options.bootstrapBeforeCreate)
		await store.write(record.bootstrapPath, renderSessionBootstrap({ taskId: task.id }));
	await process.preparePane(record);
	const prepared = await prepareAgentLaunchResources(record.bootstrapPath, preflight, environment);
	if (warnings.length > 0) prepared.warnings = warnings;
	return { paneId, prepared, agent: preflight.agent };
}

export function assertSameSessionMembership(current: AgentSession, expected: AgentSession): void {
	if (
		!taskIdsEqual(current.taskId, expected.taskId) ||
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

export async function clearNativeSessionPaneTag(
	session: AgentSession,
	rootDir: string,
	server: TmuxServer,
): Promise<void> {
	if (!session.nativeSessionId) return;
	const lines = await server.cmd("list-panes", [
		"-t",
		`=${session.tmuxName}:`,
		"-F",
		`#{@agentic_workspace_root}\t#{@agentic_workspace_task}\t#{@agentic_workspace_session}\t#{pane_id}\t#{${NATIVE_SESSION_PANE_OPTION}}`,
	]);
	for (const line of lines) {
		const [observedRoot, taskId, sessionId, paneId, nativeSessionId] = line.split("\t");
		if (
			!sameRoot(observedRoot ?? "", rootDir) ||
			!taskIdsEqual(taskId ?? "", session.taskId) ||
			sessionId !== session.id ||
			paneId === undefined ||
			nativeSessionId !== session.nativeSessionId
		)
			continue;
		await server.cmd("set-option", ["-p", "-u", "-t", paneId, NATIVE_SESSION_PANE_OPTION]);
		await server.cmd("set-option", ["-p", "-u", "-t", paneId, "@agentic_workspace_native_provider"]);
	}
}

export async function withTaskSessionAdmission<T>(
	core: Core,
	taskId: string,
	operation: (task: Task) => Promise<T>,
): Promise<T> {
	const task = await core.loadTaskForMutation(taskId);
	if (!task || !task.filePath || task.source === TASK_SOURCE.REMOTE)
		throw new Error(`Locally editable task not found: ${taskId}`);
	return await core.withTaskLock(task, async () => {
		const current = await core.loadTaskForMutation(task.id);
		if (!current || !current.filePath || current.filePath !== task.filePath || current.source === TASK_SOURCE.REMOTE)
			throw new Error(`Locally editable task changed or no longer exists: ${task.id}`);
		return await operation(current);
	});
}

type NativeOrigin = Readonly<{ record: AgentSession; paneId: string }>;

export async function withVerifiedNativeOrigin(
	core: Core,
	store: SessionStore,
	process: SessionProcess,
	taskId: string,
	sessionId: string,
	origin: NativeOrigin,
	mutate: (session: AgentSession, history: { sessions: AgentSession[]; activeSessionId?: string }) => Promise<void>,
	afterMutation?: (currentTask: Task) => Promise<void>,
	requireLive = false,
): Promise<boolean> {
	return await withTaskSessionAdmission(core, taskId, async (task) => {
		if (!taskIdsEqual(origin.record.taskId, task.id) || origin.record.id !== sessionId) return false;
		const release = await store.claimSession(task.id, sessionId);
		try {
			const currentState = await store.read(task.id);
			const current = allModeSessions(currentState).find((session) => session.id === sessionId);
			if (!current) return false;
			try {
				assertSameSessionMembership(current, origin.record);
			} catch {
				return false;
			}
			const runtime = await process.nativeRuntimeClassification(current);
			if (runtime.status === "uncertain")
				throw new Error(`Could not inspect native session ${sessionId}: ${runtime.reason}`);
			if (
				runtime.status === "missing" ||
				runtime.paneId !== origin.paneId ||
				(requireLive && runtime.status !== "live")
			)
				return false;
			const published = await store.mutateSession(task.id, sessionId, async (record, history) => {
				try {
					assertSameSessionMembership(record, origin.record);
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

export function timestamp(): string {
	return new Date().toISOString();
}

export async function resolveModeId(
	core: Core,
	store: SessionStore,
	taskId: string,
	explicit?: ModeId,
	context?: WorkspaceContext,
): Promise<ModeId> {
	const catalog = (await loadAgentConfiguration(core, "project"))?.modes;
	if (explicit) {
		if (catalog && !catalog.profiles[explicit]) throw new Error(`Unknown mode '${explicit}'.`);
		if (!catalog && explicit !== "build") throw new Error(`Mode '${explicit}' is not configured for this project.`);
		return explicit;
	}
	const identity = context?.conversation;
	if (identity) {
		if (!taskIdsEqual(identity.taskId, taskId)) throw new Error("Calling session context belongs to a different task.");
		const owner = findSessionMode((await store.read(taskId)).modes, identity.sessionId);
		if (owner) return owner;
		throw new Error(`Calling session ${identity.sessionId} is not present in current task history.`);
	}
	return catalog?.defaultModeId ?? "build";
}

export async function profileFor(
	core: Core,
	modeId: ModeId,
	preset: AgentPreset,
): Promise<{ profile: ModeProfile; preset: AgentPreset }> {
	const catalog = (await loadAgentConfiguration(core, "project"))?.modes ?? getDefaultModeCatalog();
	const profile = catalog.profiles[modeId];
	if (!profile) throw new Error(`Unknown mode '${modeId}'.`);
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

export async function profileWithCurrentArtifacts(
	core: Core,
	profile: ModeProfile,
	taskId: string,
	taskRoot: string,
): Promise<ModeProfile> {
	const { entries } = await core.listTaskArtifacts(taskId);
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

export async function executionPresetWithEnvironment(
	core: Core,
	taskId: string,
	name: string,
	paths: AgentSessionPathContext,
): Promise<{ preset: AgentPreset; environment: Record<string, string> }> {
	const preset = await resolveSessionPreset(core, { taskId, preset: name });
	const environment = await prepareHarnessEnvironment(preset.env, paths, { onWarning: warnEnvironment });
	return {
		preset: await resolveLaunchPreset(preset, { cwd: paths.worktreeDir, env: environment }),
		environment,
	};
}

export async function pathContextFor(core: Core, taskId: string, cwd: string): Promise<AgentSessionPathContext> {
	return {
		projectDir: core.projectRoot,
		worktreeDir: cwd,
		taskDir: await core.taskArtifactContainerPath(taskId),
	};
}

export async function sessionCwdFor(
	core: Core,
	task: Pick<Task, "id" | "title" | "worktreePolicy">,
	settings: SessionSettings,
): Promise<string> {
	const enabled = settings.worktreePerTask || task.worktreePolicy === "enabled";
	if (!enabled) return core.projectRoot;
	const expectedPath = taskWorktreePath(core.projectRoot, task);
	try {
		const path = await ensureTaskWorktree(core.projectRoot, task);
		if (path) return path;
	} catch (error) {
		throw new Error(
			`Could not prepare worktree for ${task.id} at ${expectedPath}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
	throw new Error(`Could not prepare worktree for ${task.id} at ${expectedPath}: worktree creation returned no path`);
}

export async function createSessionRecord(
	store: SessionStore,
	taskId: string,
	preset: string,
	pathContext: AgentSessionPathContext,
): Promise<AgentSession> {
	const { taskDir } = await store.paths(taskId);
	const id = randomUUID();
	return {
		id,
		taskId,
		preset,
		tmuxName: nativeSessionName(taskId, id),
		cwd: pathContext.worktreeDir,
		pathContext,
		createdAt: timestamp(),
		status: AGENT_SESSION_STATUS.STARTING,
		ownerPid: process.pid,
		outputPath: join(taskDir, `${id}.log`),
		bootstrapPath: join(taskDir, `${id}.md`),
	};
}

function requireSessionRecord(state: SessionState, id: string): AgentSession {
	const session = Object.values(state.modes)
		.flatMap((history) => history.sessions)
		.find((candidate) => candidate.id === id);
	if (!session) throw new Error(`Agent session not found: ${id}`);
	return session;
}

export function assertSameSession(current: AgentSession, expected: AgentSession): void {
	assertSameSessionMembership(current, expected);
	if (current.nativeSessionId !== expected.nativeSessionId)
		throw new Error(`Session ${expected.id} native identity changed before runtime publication.`);
}

export async function assertSessionIdentity(store: SessionStore, expected: AgentSession): Promise<void> {
	assertSameSession(requireSessionRecord(await store.read(expected.taskId), expected.id), expected);
}

async function ownedLaunchPaneState(
	process: SessionProcess,
	origin: LaunchOrigin,
): Promise<"owned" | "absent" | "replacement"> {
	const runtime = await process.nativeRuntimeClassification(origin.record);
	if (runtime.status === "uncertain")
		throw new Error(`Could not inspect native session ${origin.record.id}: ${runtime.reason}`);
	if (runtime.status === "missing") return "absent";
	if (runtime.paneId !== origin.paneId) return "replacement";
	const resources = await process.launchResources(runtime.paneId).catch(() => undefined);
	if (resources && resources.skill.marker !== origin.resources.skill.marker) return "replacement";
	return "owned";
}

/** Provenance is validated here; the caller owns only the guarded record application callback. */
export async function publishNativeIdentity(
	core: Core,
	store: SessionStore,
	process: SessionProcess,
	server: TmuxServer,
	origin: LaunchOrigin,
	identity: NativeIdentity,
	applyIdentity: (record: AgentSession, identity: NativeIdentity) => Promise<void>,
): Promise<void> {
	const taskId = origin.record.taskId;
	const state = await store.read(taskId);
	const current = allModeSessions(state).find((session) => session.id === origin.record.id);
	if (!current || findSessionMode(state.modes, origin.record.id) !== origin.modeId) return;
	try {
		assertSameSessionMembership(current, origin.record);
	} catch {
		return;
	}
	const paneState = await ownedLaunchPaneState(process, origin);
	if (paneState === "replacement") return;
	let conflict: string | undefined;
	const published = await store.mutateSession(taskId, origin.record.id, async (record, _history, modeId) => {
		if (modeId !== origin.modeId) return false;
		try {
			assertSameSessionMembership(record, origin.record);
		} catch {
			return false;
		}
		if (record.nativeSessionId !== undefined && record.nativeSessionId !== identity.id) {
			conflict = record.nativeSessionId;
			return false;
		}
		await applyIdentity(record, identity);
		return true;
	});
	if (conflict !== undefined)
		throw new Error(
			`Session ${origin.record.id} already has native identity '${conflict}'; refusing to publish '${identity.id}'.`,
		);
	if (published && paneState === "owned")
		await tagNativeSessionPane(core, server, { ...origin.record, nativeSessionId: identity.id }, origin.paneId);
}

export async function reconcileDeferredIdentity(
	agent: Agent,
	origin: LaunchOrigin,
	publish: (origin: LaunchOrigin, identity: NativeIdentity) => Promise<void>,
): Promise<void> {
	await agent.reconcileIdentity(origin, async (identity) => await publish(origin, identity));
}

export async function resumeExistingTarget(
	core: Core,
	store: SessionStore,
	process: SessionProcess,
	task: Task,
	target: {
		record: AgentSession;
		preset: AgentPreset;
		profile: ModeProfile;
		receipt?: string;
		environment: Record<string, string>;
		settings: SessionSettings;
	},
	settleObserved: (taskId: string, record: AgentSession, preserveQueuedRequest: boolean) => Promise<void>,
): Promise<{ record: AgentSession; preflight: PreflightedAgentLaunch }> {
	const { record, receipt } = target;
	const candidate = await store.readNativeSessionIdCandidate(task.id, record.id);
	if (candidate !== receipt) throw new Error(`Native session receipt changed for session ${record.id}.`);
	const resumeNativeSessionId = record.nativeSessionId ?? candidate;
	buildAgentResumeCommand(target.preset, resumeNativeSessionId);
	const pathContext = await pathContextForSession(core, task, record);
	if (!(await isDirectory(pathContext.worktreeDir)))
		throw new Error(`Session ${record.id} working directory is missing: ${pathContext.worktreeDir}`);
	const profile = await profileWithCurrentArtifacts(core, target.profile, task.id, pathContext.taskDir);
	const preflight = await preflightAgentLaunch(target.preset, record.bootstrapPath, {
		cwd: pathContext.worktreeDir,
		intent: { kind: "resume", nativeSessionId: resumeNativeSessionId ?? "" },
		sessionId: record.id,
		yolo: target.settings.yoloMode,
		profile,
		repositoryRoot: pathContext.projectDir,
		taskRoot: pathContext.taskDir,
		environment: target.environment,
	});
	const current = requireSessionRecord(await store.read(task.id), record.id);
	assertSameSession(current, record);
	const currentReceipt = await store.readNativeSessionIdCandidate(task.id, record.id);
	if (currentReceipt !== receipt) throw new Error(`Native session receipt changed for session ${record.id}.`);
	const immediatelyCurrent = requireSessionRecord(await store.read(task.id), record.id);
	assertSameSession(immediatelyCurrent, record);
	await process.kill(immediatelyCurrent);
	if (resumeNativeSessionId) immediatelyCurrent.nativeSessionId = resumeNativeSessionId;
	await settleObserved(task.id, immediatelyCurrent, false);
	return { record: immediatelyCurrent, preflight };
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

export async function stopClaimedSession(
	core: Core,
	store: SessionStore,
	process: SessionProcess,
	server: TmuxServer,
	taskId: string,
	expected: AgentSession,
	runtimePreflighted = false,
): Promise<void> {
	const current = allModeSessions(await store.read(taskId)).find((candidate) => candidate.id === expected.id);
	if (!current) throw new Error(`Agent session not found: ${expected.id}`);
	assertSameSessionMembership(current, expected);
	if (current.status !== expected.status || current.ownerPid !== expected.ownerPid)
		throw new Error(`Cannot safely stop session ${current.id}: its status or owner changed during shutdown.`);
	if (current.nativeWorkspace && !runtimePreflighted) {
		const runtime = await process.nativeRuntimeClassification(current);
		if (runtime.status === "uncertain")
			throw new Error(`Cannot safely inspect native session ${current.id}: ${runtime.reason}`);
	}
	await process.kill(current);
	await store.mutateSession(taskId, current.id, async (record, history) => {
		assertSameSessionMembership(record, current);
		if (record.status !== current.status || record.ownerPid !== current.ownerPid)
			throw new Error(`Cannot safely stop session ${current.id}: its status or owner changed during shutdown.`);
		record.status = AGENT_SESSION_STATUS.STOPPED;
		record.endedAt = timestamp();
		record.ownerPid = undefined;
		if (history.activeSessionId === record.id)
			history.activeSessionId = history.sessions.find((candidate) => candidate.id !== record.id)?.id ?? record.id;
	});
	if (current.nativeWorkspace) {
		await deleteWorkspaceRequest(core.projectRoot, current.id);
		await clearNativeSessionPaneTag(current, core.projectRoot, server);
	}
}
