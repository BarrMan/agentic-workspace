import { realpathSync } from "node:fs";
import type { Core } from "../core/agentic-workspace.ts";
import { TASK_SOURCE, type Task } from "../types/index.ts";
import type { SessionProcess, TmuxServer } from "./session-process.ts";
import type { SessionStore } from "./session-store.ts";
import { allModeSessions } from "./session-utils.ts";
import { AGENT_SESSION_STATUS, type AgentSession } from "./types.ts";
import { deleteWorkspaceRequest } from "./workspace-context.ts";

export const NATIVE_SESSION_PANE_OPTION = "@agentic_workspace_native_session_id";

export function sameRoot(left: string, right: string): boolean {
	try {
		return realpathSync(left) === realpathSync(right);
	} catch {
		return false;
	}
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
