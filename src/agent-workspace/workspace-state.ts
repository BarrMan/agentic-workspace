import { DEFAULT_STATUSES } from "../constants/index.ts";
import type { Core } from "../core/agentic-workspace.ts";
import { SessionApplication } from "../core/session-application.ts";
import type { Task } from "../types/index.ts";
import { resolveInProgressStatus } from "../utils/status.ts";
import { getTerminalStatus, isTerminalStatus } from "../utils/terminal-status.ts";
import { AgentSessionService, type SessionRuntimeOrigin } from "./sessions.ts";
import type { AgentSession, ModeId, TaskSessions } from "./types.ts";
import type { SessionHandoff } from "./workspace-context.ts";

export class WorkspaceStateService {
	private readonly sessions: AgentSessionService;
	readonly sessionApplication: SessionApplication;

	constructor(
		private readonly core: Core,
		options: { sessions?: AgentSessionService; sessionApplication?: SessionApplication; stateRoot?: string } = {},
	) {
		if (options.sessions && options.stateRoot !== undefined)
			throw new Error("Supply either a pinned session service or stateRoot, not both.");
		this.sessions = options.sessions ?? new AgentSessionService(core, { stateRoot: options.stateRoot });
		this.sessionApplication =
			options.sessionApplication ?? new SessionApplication(core, { stateRoot: options.stateRoot });
	}

	get stateRoot(): Promise<string> {
		return this.sessions.stateRoot;
	}

	async listTasks(): Promise<Task[]> {
		return await this.core.loadStoredTasks();
	}

	async listSessions(taskId: string, modeId?: ModeId): Promise<TaskSessions> {
		return await this.sessions.list(taskId, modeId);
	}

	async listModeSessions(taskId: string, modeId: ModeId): Promise<TaskSessions> {
		return await this.sessions.listMode(taskId, modeId);
	}

	/**
	 * Every task's durable session state from a single scan of the project's session directory.
	 * Unlike `listSessions` this does not load the task corpus, so mounting a workspace that needs
	 * the durable dot for every visible task does not re-read every task file once per task.
	 */
	listAllSessions(): Promise<Map<string, TaskSessions>> {
		return this.sessions.listAllSessions();
	}

	liveSession(taskId: string, sessionId: string, options: { passive?: boolean } = {}) {
		return this.sessions.liveSession(taskId, sessionId, options);
	}

	prepareSession(taskId: string, sessionId?: string, modeId?: ModeId) {
		return this.sessions.prepareNativeSession(taskId, sessionId, modeId);
	}

	prepareNewSession(taskId: string, modeId: ModeId) {
		return this.sessions.prepareNewSession(taskId, modeId);
	}

	adoptPendingSession(taskId: string, sessionId: string) {
		return this.sessions.adoptPendingSession(taskId, sessionId);
	}

	stopSession(taskId: string, sessionId: string): Promise<void> {
		return this.sessions.stop(taskId, sessionId);
	}

	finalizeHandoff(taskId: string, successor: AgentSession, handoff: SessionHandoff): Promise<void> {
		return this.sessions.finalizeHandoff(taskId, successor, handoff);
	}

	rollbackHandoff(taskId: string, successor: AgentSession, handoff: SessionHandoff): Promise<void> {
		return this.sessions.rollbackHandoff(taskId, successor, handoff);
	}

	activateSession(
		taskId: string,
		sessionId: string,
		origin: SessionRuntimeOrigin,
	): Promise<{ activated: boolean; status?: string }> {
		return this.#activateSession(taskId, sessionId, origin);
	}

	async #activateSession(
		taskId: string,
		sessionId: string,
		origin: SessionRuntimeOrigin,
	): Promise<{ activated: boolean; status?: string }> {
		let activeStatus: string | undefined;
		const activated = await this.sessions.activateNativeSession(taskId, sessionId, origin, async (task) => {
			activeStatus = await this.ensureTaskInProgress(task);
		});
		return { activated, ...(activeStatus ? { status: activeStatus } : {}) };
	}

	/**
	 * A task with a live agent session belongs in the configured active-work status. The move is
	 * best-effort: terminal (Done) tasks and tasks already there are left alone, and a status-write
	 * failure never fails the launch. Returns the active-work status the task now belongs to, when
	 * one applies, so the caller can follow the tab without re-reading the task.
	 */
	private async ensureTaskInProgress(task: Task): Promise<string | undefined> {
		try {
			const config = await this.core.getStoredConfig();
			const statuses = config?.statuses && config.statuses.length > 0 ? config.statuses : [...DEFAULT_STATUSES];
			const target = resolveInProgressStatus(statuses);
			// A task must never be nudged into the terminal column, even when a two-status configuration
			// leaves no dedicated active-work slot (the resolver then falls back to `statuses[1]`).
			if (!target || target === getTerminalStatus(statuses)) return undefined;
			if (isTerminalStatus(task.status, statuses)) return undefined;
			if (task.status === target) return target;
			const updated = await this.core.applyTaskUpdateInput(
				task,
				{ status: target },
				async (status) => await this.core.requireCanonicalStatus(status),
			);
			if (updated.mutated) await this.core.updateTask(updated.task);
			return target;
		} catch {
			return undefined;
		}
	}

	finishSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin, error?: string): Promise<void> {
		return this.sessions.finishNativeSession(taskId, sessionId, origin, error);
	}

	/** Release a session's process without ending the session; it auto-resumes on the next start. */
	parkSession(taskId: string, sessionId: string, origin: SessionRuntimeOrigin): Promise<void> {
		return this.sessions.parkNativeSession(taskId, sessionId, origin);
	}

	deleteSession(taskId: string, sessionId: string, options: { force?: boolean } = {}): Promise<void> {
		return this.sessions.delete(taskId, sessionId, options);
	}

	removeTaskSessions(taskId: string): Promise<void> {
		return this.sessions.purge(taskId);
	}

	/** Forget associations for Core task deletion; caller holds its task/reference/admission boundary. */
	forgetTaskSessions(taskId: string): Promise<void> {
		return this.sessions.forgetTaskSessions(taskId);
	}
}
