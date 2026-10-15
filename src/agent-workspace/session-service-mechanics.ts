import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Core } from "../core/agentic-workspace.ts";
import { taskWorktreeExists, taskWorktreePath } from "../git/task-worktree.ts";
import { TASK_SOURCE, type Task } from "../types/index.ts";
import type { Agent, LaunchOrigin, NativeIdentity, SessionIntent } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import { resolveLaunchPreset } from "./agents/opencode-resolution.ts";
import { validateExplicitModel } from "./agents/profile.ts";
import { buildAgentResumeCommand, renderSessionBootstrap } from "./bootstrap.ts";
import { loadAgentConfiguration, resolveAgentConfiguration, resolveSessionPreset } from "./config.ts";
import { prepareHarnessEnvironment } from "./harness-environment.ts";
import {
	type PreflightedAgentLaunch,
	type PreparedAgentLaunch,
	preflightAgentLaunch,
	prepareAgentLaunchResources,
} from "./session-launch.ts";
import type { SessionProcess, TmuxServer } from "./session-process.ts";
import type { SessionState, SessionStore } from "./session-store.ts";
import { allModeSessions, findSessionMode, nativeSessionName } from "./session-utils.ts";
import {
	AGENT_SESSION_STATUS,
	type AgentPreset,
	type AgentSession,
	type AgentSessionPathContext,
	type ModeId,
	type ModeProfile,
	type SessionSettings,
} from "./types.ts";
import {
	deleteWorkspaceRequest,
	readWorkspaceRequests,
	WORKSPACE_CONTEXT_ENV,
	type WorkspaceContext,
	workspaceContextInto,
} from "./workspace-context.ts";

export const NATIVE_SESSION_PANE_OPTION = "@agentic_workspace_native_session_id";

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
		projectDir: saved?.projectDir ?? core.filesystem.rootDir,
		worktreeDir: saved?.worktreeDir ?? session.cwd,
		taskDir: saved?.taskDir ?? (await core.filesystem.taskArtifacts.containerPath(task.id)),
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
	if (!sameRoot(pathContext.projectDir, core.filesystem.rootDir))
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
		!sameRoot(rootDir ?? "", core.filesystem.rootDir) ||
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
		profile?: ModeProfile;
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
	const prepared = await prepareAgentLaunchResources(
		record.bootstrapPath,
		{ ...preflight, options: { ...preflight.options, profile: undefined } },
		environment,
	);
	if (warnings.length > 0) prepared.warnings = warnings;
	return { paneId, prepared, agent: preflight.agent };
}

export function assertSameSessionMembership(current: AgentSession, expected: AgentSession): void {
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
			taskId !== session.taskId ||
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
	if (process.env.USE_GLOBAL_TASK_ID_LOCK?.toLowerCase() === "false")
		throw new Error(`Task session locking is disabled; refusing session operation for ${taskId}.`);
	const task = await core.loadTaskForMutation(taskId, { includeCrossBranch: false });
	if (!task || !task.filePath || task.source === TASK_SOURCE.REMOTE || task.source === TASK_SOURCE.LOCAL_BRANCH)
		throw new Error(`Locally editable task not found: ${taskId}`);
	return await core.filesystem.withTaskLock(task, async () => {
		const current = await core.loadTaskForMutation(task.id, { includeCrossBranch: false });
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
		if (origin.record.taskId !== task.id || origin.record.id !== sessionId) return false;
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
		await deleteWorkspaceRequest(core.filesystem.rootDir, current.id);
		await clearNativeSessionPaneTag(current, core.filesystem.rootDir, server);
	}
}
