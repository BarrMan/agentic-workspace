import { dirname } from "node:path";
import { loadProjectModeCatalog } from "../../controller/agent-configuration.ts";
import type { Core, ObservedSession } from "../../controller/agentic-workspace.ts";
import type { WorkspaceStateService } from "../../controller/workspace-state.ts";
import { effectiveModeTextColor } from "../../model/session/mode-colors.ts";
import type { SessionRuntime } from "../../model/session/session.ts";
import type {
	AgentIndication,
	AgentSession,
	ModeCatalog,
	SessionSnapshot,
	TaskSessions,
} from "../../model/session/types.ts";
import type { SessionHandoffMarker as SessionHandoff } from "../../model/session/workspace-request.ts";
import type { Task } from "../../model/types.ts";
import type { ActivityProbe } from "../../runtime/agent-status-probe.ts";
import { ExactResumeUnavailableError } from "../../runtime/errors/sessions.ts";
import type { createExistingAgentHost } from "../../runtime/live/existing-agent-host.ts";
import { sessionActivityDir } from "../../runtime/status-hooks.ts";
import type { ViewStateStore } from "../../storage/view-state-store.ts";
import type { OpenTuiHost } from "./host.ts";
import type { mountOpenTuiSessionPicker } from "./session-picker.ts";
import { pruneSelectedModeForTask, type SharedWorkspaceState, selectedModeForTask } from "./workspace/state.ts";
import type { OpenTuiWorkspaceLiveAgent } from "./workspace.ts";
import type { createWorkspaceAgent } from "./workspace-agent.ts";
import { createWorkspaceAgentHostOwner } from "./workspace-agent-host-owner.ts";
import {
	type PendingAgentLaunch,
	type RetainedWorkspaceAgent,
	WorkspaceAttachmentOwner,
} from "./workspace-attachment-owner.ts";
import { WorkspaceSessionMonitor } from "./workspace-session-monitor.ts";

type Selection = { view: "workspace" | "board"; taskId?: string; modeId?: string };
type LaunchOptions = {
	attachOnly?: boolean;
	modeId?: string;
	newSession?: boolean;
	handoff?: SessionHandoff;
};
type StartOptions = { sessionId?: string; modeId?: string; focus?: boolean; rejectFailure?: boolean };
export type WorkspaceSessionPresentation = {
	activeAgentSession: AgentSession | undefined;
	activeAgentCwd: string | undefined;
	activeAgentSnapshot: SessionSnapshot | undefined;
	selectedModeId: string | undefined;
	modeProjectionByTask: ReadonlyMap<string, { modeLabel: string; approved: boolean; modeColor?: string }>;
	sessionTaskIds: readonly string[];
	indicationByTask: ReadonlyMap<string, AgentIndication>;
	liveAgent: OpenTuiWorkspaceLiveAgent | undefined;
};

/** Owns session workflows and local presentation lifetime; navigation supplies selection identities. */
export class WorkspaceSessions {
	#closed = false;
	#selection: Selection = { view: "workspace" };
	readonly #attachments = new WorkspaceAttachmentOwner();
	readonly #monitor: WorkspaceSessionMonitor;
	readonly #sessionTaskIds = new Set<string>();
	readonly #localSelections = new Map<string, string>();
	readonly #localSessionModes = new Map<string, string>();
	readonly #startingTasks = new Set<string>();
	readonly #deletingTasks = new Set<string>();
	readonly #startingTaskModes = new Map<string, object>();
	readonly #agentAlive = new Map<string, () => Promise<boolean>>();
	#allSessions: ReadonlyMap<string, TaskSessions> | undefined;
	#selectedTask: Task | undefined;
	#modeActiveSessions = new Map<string, AgentSession>();
	#picker: { mount: { dispose(): void }; phase: "selecting" | "resuming" } | undefined;
	#pickerLoading = false;
	#pickerRequest = 0;

	constructor(
		private readonly core: Core,
		private readonly workspace: WorkspaceStateService,
		private readonly sessionRuntime: SessionRuntime | undefined,
		private readonly host: OpenTuiHost,
		private readonly viewState: ViewStateStore<SharedWorkspaceState>,
		private catalog: ModeCatalog,
		private readonly runtime: {
			createExistingAgentHost: typeof createExistingAgentHost;
			createWorkspaceAgent: typeof createWorkspaceAgent;
			mountSessionPicker: typeof mountOpenTuiSessionPicker;
			createActivityProbe(): ActivityProbe;
		},
		private readonly operations: {
			blocked(): boolean;
			refresh(): Promise<void>;
			notice(message: string | undefined): void;
			confirm(title: string, message: string): Promise<boolean>;
			focus(): void;
			followStartedTask(taskId: string): Promise<void>;
			indications(value: ReadonlyMap<string, AgentIndication>): void;
			persist(patch: (state: SharedWorkspaceState) => SharedWorkspaceState): Promise<void>;
		},
		activityPollIntervalMs?: number,
	) {
		this.#monitor = new WorkspaceSessionMonitor(
			core,
			sessionRuntime,
			runtime.createActivityProbe,
			{
				paused: () => operations.blocked() || this.#attachments.hasPending,
				changed: () => operations.indications(this.#monitor.indications(this.#modeActiveSessions)),
				refresh: () => operations.refresh(),
			},
			activityPollIntervalMs,
		);
	}

	get busy(): boolean {
		return this.#picker?.phase === "selecting" || this.#pickerLoading;
	}

	/** Only identity changes invalidate requests; repainting the same selection does not. */
	select(view: Selection["view"], taskId: string | undefined, modeId: string | undefined): void {
		const current = this.#selection;
		if (current.view === view && current.taskId === taskId && current.modeId === modeId) return;
		this.#selection = { view, taskId, modeId };
		this.#pickerRequest++;
		this.#pickerLoading = false;
		this.#picker?.mount.dispose();
		this.#picker = undefined;
	}

	#selected(selection: Selection, state: SharedWorkspaceState): boolean {
		return (
			!this.#closed &&
			this.#selection === selection &&
			selection.view === "workspace" &&
			this.viewState.current === state &&
			!!selection.taskId &&
			selectedModeForTask(state, selection.taskId, this.catalog) === selection.modeId
		);
	}

	async startMonitoring(): Promise<void> {
		await this.#monitor.start();
	}

	async project(
		state: SharedWorkspaceState,
		visibleTasks: readonly Task[],
		selectedTask: Task | undefined,
	): Promise<WorkspaceSessionPresentation> {
		const selection = this.#selection;
		this.#selectedTask = selectedTask;
		let presentation = await this.#readPresentation(state, visibleTasks, selectedTask);
		if (!this.#closed && this.#selection === selection && this.viewState.current === state) {
			this.select(selection.view, selectedTask?.id, presentation.selectedModeId);
			if (await this.#syncSelected(state, presentation))
				presentation = await this.#readPresentation(state, visibleTasks, selectedTask);
		}
		return presentation;
	}

	async #readPresentation(
		state: SharedWorkspaceState,
		visibleTasks: readonly Task[],
		selectedTask: Task | undefined,
	): Promise<WorkspaceSessionPresentation> {
		let taskSessions: ReadonlyMap<string, TaskSessions>;
		if (this.#selection.view === "workspace") {
			taskSessions = await this.workspace.listAllSessions();
			this.#allSessions = taskSessions;
			await this.#monitor.refresh(taskSessions);
		} else {
			taskSessions = new Map(
				selectedTask ? [[selectedTask.id, await this.workspace.listSessions(selectedTask.id)]] : [],
			);
			await this.#monitor.refresh();
		}
		const sessions = selectedTask ? taskSessions.get(selectedTask.id) : undefined;
		let activeAgentSession = sessions?.sessions.find((session) => session.id === sessions.activeSessionId);
		let selectedModeId: string | undefined;
		const modeProjectionByTask = new Map<string, { modeLabel: string; approved: boolean; modeColor?: string }>();
		if (this.#selection.view === "workspace") {
			const catalog = await loadProjectModeCatalog(this.core);
			this.catalog = catalog;
			const modeActiveSessions = new Map<string, AgentSession>();
			const histories = new Map<string, TaskSessions>();
			if (selectedTask) {
				selectedModeId = selectedModeForTask(state, selectedTask.id, catalog);
				const modeSessions = await this.workspace.listSessions(selectedTask.id, selectedModeId);
				histories.set(selectedTask.id, modeSessions);
				const localId = this.#localSelections.get(`${selectedTask.id}\u0000${selectedModeId}`);
				activeAgentSession =
					modeSessions.sessions.find((session) => session.id === modeSessions.activeSessionId) ??
					(localId ? modeSessions.sessions.find((session) => session.id === localId) : undefined) ??
					[...modeSessions.sessions].sort((a, b) =>
						(b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt),
					)[0];
			}
			let cursor = 0;
			await Promise.all(
				Array.from({ length: Math.min(4, visibleTasks.length) }, async () => {
					while (cursor < visibleTasks.length) {
						const task = visibleTasks[cursor++];
						if (!task) continue;
						const modeId = selectedModeForTask(state, task.id, catalog);
						const modeSessions = histories.get(task.id) ?? (await this.workspace.listSessions(task.id, modeId));
						const active = modeSessions.sessions.find((session) => session.id === modeSessions.activeSessionId);
						if (active) modeActiveSessions.set(task.id, active);
						const profile = catalog.profiles[modeId];
						if (profile)
							modeProjectionByTask.set(task.id, {
								modeLabel: profile.name,
								approved: false,
								modeColor: effectiveModeTextColor(profile, modeId),
							});
					}
				}),
			);
			this.#modeActiveSessions = modeActiveSessions;
		}
		if (selectedTask) {
			if (sessions?.sessions.length) this.#sessionTaskIds.add(selectedTask.id);
			else this.#sessionTaskIds.delete(selectedTask.id);
		}
		const activeAgentSnapshot = activeAgentSession ? this.#monitor.observed(activeAgentSession.id) : undefined;
		const activeAgentCwd = activeAgentSession ? await this.core.executionCwd(activeAgentSession.taskId) : undefined;
		const selectedAgent = activeAgentSession ? this.#attachments.agent(activeAgentSession.id) : undefined;
		return {
			activeAgentSession,
			activeAgentCwd,
			activeAgentSnapshot,
			selectedModeId,
			modeProjectionByTask,
			sessionTaskIds: [...this.#sessionTaskIds],
			indicationByTask: this.#monitor.indications(this.#modeActiveSessions),
			liveAgent:
				selectedTask && this.#startingTasks.has(selectedTask.id) && (!selectedAgent || selectedAgent.status === "error")
					? { taskId: selectedTask.id, label: "agent", status: "starting" }
					: selectedAgent,
		};
	}

	async #syncSelected(state: SharedWorkspaceState, presentation: WorkspaceSessionPresentation): Promise<boolean> {
		const selection = this.#selection;
		const session = presentation.activeAgentSession;
		const observed = presentation.activeAgentSnapshot;
		if (
			!this.#selected(selection, state) ||
			!session ||
			!observed ||
			observed.state !== "running" ||
			this.#attachments.hasAgent(session.id) ||
			this.#startingTasks.has(session.taskId) ||
			this.#attachments.isPendingSession(session.id)
		)
			return false;
		try {
			const probe = await this.core.readObserved(session.taskId, session.id);
			if (!this.#selected(selection, state)) return false;
			if (probe.snapshot.state !== "running" && probe.snapshot.state !== "parked") return true;
			this.#attachRunningSession(session.taskId, session);
		} catch (error) {
			if (this.#selected(selection, state))
				this.operations.notice(
					`Could not inspect agent session ${session.id}: ${error instanceof Error ? error.message : String(error)}`,
				);
		}
		return false;
	}

	#attachRunningSession(taskId: string, session: AgentSession, focus = false): void {
		if (this.#closed) return;
		this.#launchSession(
			taskId,
			session.id,
			{ attachOnly: true },
			{
				notice: (message) => `Could not attach to ${session.id}: ${message}`,
				ignore: (message) =>
					message === `Task ${taskId} is no longer selected.` || message === "Workspace closed before agent launch.",
				onReady: focus ? this.operations.focus : undefined,
				onError: (message) => {
					this.#attachments.retain(session.id, { taskId, label: session.preset, status: "error", error: message });
					this.#agentAlive.delete(session.id);
					this.#monitor.forget(session.id);
				},
			},
		);
	}

	start(taskId: string, columns: number, rows: number, options: StartOptions = { focus: true }): Promise<void> {
		const state = this.viewState.current;
		const selection = this.#selection;
		const modeId = options.modeId ?? selectedModeForTask(state, taskId, this.catalog);
		const key = `${taskId}\u0000${modeId}`;
		if (
			this.#deletingTasks.has(taskId) ||
			!this.#selected(selection, state) ||
			selection.taskId !== taskId ||
			this.operations.blocked() ||
			this.#startingTaskModes.has(key)
		)
			return Promise.resolve();
		this.#startingTasks.add(taskId);
		const startOwner = {};
		this.#startingTaskModes.set(key, startOwner);
		void this.operations.refresh();
		const settleAutomaticResume = (message: string): void => {
			if (!options.sessionId || options.rejectFailure || this.#attachments.hasAgent(options.sessionId)) return;
			const record = this.#allSessions?.get(taskId)?.sessions.find((candidate) => candidate.id === options.sessionId);
			this.#attachments.retain(options.sessionId, {
				taskId,
				label: record?.preset ?? modeId,
				status: "error",
				error: message,
			});
		};
		const start = (async () => {
			const catalog = await loadProjectModeCatalog(this.core);
			if (selectedModeForTask(state, taskId, catalog) !== modeId)
				throw new Error(`Selected mode changed before launching ${taskId}.`);
			if (!this.#selected(selection, state)) return;
			const localId = this.#localSelections.get(key);
			const local = localId ? this.#attachments.agent(localId) : undefined;
			if (!options.sessionId && local?.terminal && !local.terminal.isDestroyed) {
				this.operations.focus();
				void this.operations.refresh();
				return;
			}
			const completed = await this.#launchAgent(taskId, columns, rows, options.sessionId, { modeId });
			if (!completed) return;
			const activeId = this.#localSelections.get(key);
			if (
				options.focus &&
				this.#selected(selection, this.viewState.current) &&
				!this.operations.blocked() &&
				activeId &&
				this.#attachments.agent(activeId)?.terminal
			)
				this.operations.focus();
		})()
			.catch(async (error: unknown) => {
				if (error instanceof ExactResumeUnavailableError && options.sessionId) {
					this.operations.notice(error.message);
					const confirmed = await this.operations.confirm(
						"Exact resume unavailable",
						`${error.message}\n\nStart a fresh conversation instead?`,
					);
					if (confirmed && !this.#closed && this.#selection === selection) {
						try {
							const completed = await this.#launchAgent(taskId, columns, rows, undefined, { modeId, newSession: true });
							if (completed) this.operations.notice(undefined);
						} catch (freshError) {
							this.operations.notice(`Could not start a fresh conversation: ${String(freshError)}`);
							if (options.rejectFailure) throw freshError;
						}
						return;
					}
					settleAutomaticResume(error.message);
					if (options.rejectFailure) throw error;
					return;
				}
				this.operations.notice(`Could not start agent: ${String(error)}`);
				settleAutomaticResume(error instanceof Error ? error.message : String(error));
				if (options.rejectFailure) throw error;
			})
			.finally(() => {
				this.#finishStart(taskId, key, startOwner);
			});
		return this.#attachments.track(start);
	}

	async activate(taskId: string, columns: number, rows: number): Promise<void> {
		const selection = this.#selection;
		const state = this.viewState.current;
		const modeId = selection.modeId;
		if (!modeId || selection.taskId !== taskId || !this.#selected(selection, state) || this.operations.blocked())
			return;
		try {
			const history = await this.workspace.listSessions(taskId, modeId);
			if (!this.#selected(selection, state)) return;
			const selectedId = this.#localSelections.get(`${taskId}\u0000${modeId}`) ?? history.activeSessionId;
			if (!selectedId) {
				await this.start(taskId, columns, rows, { modeId });
				return;
			}
			const session = history.sessions.find((candidate) => candidate.id === selectedId);
			if (!session) return;
			const snapshot =
				this.#monitor.observed(selectedId) ?? (await this.core.readObserved(taskId, selectedId)).snapshot;
			if (!this.#selected(selection, state)) return;
			if (snapshot.state === "stopped") {
				await this.start(taskId, columns, rows, { sessionId: selectedId, modeId, focus: true });
			} else if (snapshot.state === "running" || snapshot.state === "parked") {
				this.#localSelections.set(`${taskId}\u0000${modeId}`, selectedId);
				if (this.#attachments.agent(selectedId)?.terminal) this.operations.focus();
				else this.#attachRunningSession(taskId, session, true);
			} else {
				this.operations.notice(
					snapshot.state === "starting" ? "Session is still starting." : "Session state is unknown; no action taken.",
				);
				void this.operations.refresh();
			}
		} catch (error) {
			this.operations.notice(`Could not use session: ${String(error)}`);
			void this.operations.refresh();
		}
	}

	#finishStart(taskId: string, key: string, startOwner: object): void {
		if (this.#startingTaskModes.get(key) === startOwner) this.#startingTaskModes.delete(key);
		if (![...this.#startingTaskModes.keys()].some((candidate) => candidate.startsWith(`${taskId}\u0000`)))
			this.#startingTasks.delete(taskId);
		if (!this.#closed) void this.operations.refresh();
	}

	handoff(taskId: string): void {
		const modeId = this.#selection.modeId;
		if (modeId && this.#selection.taskId === taskId && !this.#closed)
			void this.#attachments.track(this.#handoff(taskId, modeId));
	}

	async #handoff(taskId: string, modeId: string): Promise<void> {
		const key = `${taskId}\u0000${modeId}`;
		const id = this.#localSelections.get(key);
		if (this.#startingTaskModes.has(key)) return;
		const local = id ? this.#attachments.agent(id) : undefined;
		const startOwner = {};
		this.#startingTasks.add(taskId);
		this.#startingTaskModes.set(key, startOwner);
		let successorStarted = false;
		try {
			const history = await this.workspace.listSessions(taskId, modeId);
			const predecessor = local?.origin?.record;
			const handoff: SessionHandoff = {
				modeId,
				priorActiveSessionId: history.activeSessionId,
				...(predecessor
					? { predecessor: { id: predecessor.id, createdAt: predecessor.createdAt, tmuxName: predecessor.tmuxName } }
					: {}),
			};
			const started = await this.#launchAgent(
				taskId,
				Math.max(20, this.host.renderer.width),
				Math.max(5, this.host.renderer.height - 6),
				undefined,
				{ modeId, newSession: true, handoff },
			);
			if (!started || this.#startingTaskModes.get(key) !== startOwner) return;
			successorStarted = true;
			if (id && local) {
				await this.#attachments.releaseAgent(id, this.#monitor.history(id));
				this.#forgetLocal(id);
			}
		} catch (error) {
			this.operations.notice(
				successorStarted
					? `Successor is running, but predecessor cleanup failed: ${String(error)}`
					: `Could not start handoff session: ${String(error)}`,
			);
		} finally {
			this.#finishStart(taskId, key, startOwner);
		}
	}

	#launchSession(
		taskId: string,
		sessionId: string,
		options: LaunchOptions,
		config: {
			notice(message: string): string;
			ignore(message: string): boolean;
			onError?(message: string): void;
			onReady?(): void;
		},
	): void {
		this.#attachments.track(
			this.#launchAgent(
				taskId,
				Math.max(20, this.host.renderer.width),
				Math.max(5, this.host.renderer.height - 6),
				sessionId,
				options,
			)
				.then(() => undefined)
				.catch((error: unknown) => {
					if (this.#closed) return;
					const message = error instanceof Error ? error.message : String(error);
					if (config.ignore(message)) return;
					this.operations.notice(config.notice(message));
					config.onError?.(message);
				})
				.finally(() => {
					if (!this.#closed) config.onReady?.();
					if (!this.#closed) void this.operations.refresh();
				}),
		);
	}

	#launchAgent(
		taskId: string,
		columns: number,
		rows: number,
		sessionId?: string,
		options: LaunchOptions = {},
	): Promise<AgentSession | false> {
		return this.#attachments.launch(
			taskId,
			(launch) => this.#performLaunch(taskId, columns, rows, sessionId, options, launch),
			options.attachOnly ? sessionId : undefined,
		);
	}

	async #performLaunch(
		taskId: string,
		columns: number,
		rows: number,
		sessionId: string | undefined,
		options: LaunchOptions,
		launch: PendingAgentLaunch,
	): Promise<AgentSession | false> {
		const attachOnly = options.attachOnly === true;
		let resolvedSessionId = sessionId;
		if (!resolvedSessionId && !options.newSession && options.modeId) {
			const selected = this.#localSelections.get(`${taskId}\u0000${options.modeId}`);
			const retained = selected ? this.#attachments.agent(selected) : undefined;
			if (retained?.terminal && !retained.terminal.isDestroyed) resolvedSessionId = selected;
			else resolvedSessionId = (await this.workspace.listSessions(taskId, options.modeId)).activeSessionId;
		}
		if (launch.invalidated || this.#deletingTasks.has(taskId)) return false;
		if (this.#closed || this.#selection.view !== "workspace") throw new Error(`Task ${taskId} is no longer selected.`);
		const retained = resolvedSessionId ? this.#attachments.agent(resolvedSessionId) : undefined;
		const alive = resolvedSessionId ? this.#agentAlive.get(resolvedSessionId) : undefined;
		if (retained?.origin && alive) {
			const retainedAlive = await alive();
			if (launch.invalidated || this.#deletingTasks.has(taskId)) return false;
			if (retainedAlive && resolvedSessionId) {
				if (options.modeId) {
					this.#localSelections.set(`${taskId}\u0000${options.modeId}`, resolvedSessionId);
					this.#localSessionModes.set(resolvedSessionId, options.modeId);
				}
				return retained.origin.record;
			}
		}
		if (retained) {
			retained.status = "error";
			retained.error = "Agent stopped; select this session to resume its exact conversation.";
		}
		if (launch.invalidated || this.#deletingTasks.has(taskId)) return false;
		if (this.#closed || this.#selection.view !== "workspace") throw new Error(`Task ${taskId} is no longer selected.`);
		const application = this.core;
		let observed: ObservedSession | undefined;
		if (resolvedSessionId) {
			observed = await application.readObserved(taskId, resolvedSessionId);
			const live =
				observed.snapshot.state === "running" ||
				observed.snapshot.state === "starting" ||
				observed.snapshot.state === "parked";
			if (!live) {
				if (attachOnly) {
					this.operations.notice(`Agent session ${resolvedSessionId} is no longer running.`);
					return false;
				}
				observed = await application.resumeSession(taskId, resolvedSessionId);
			}
		} else if (attachOnly) {
			this.operations.notice(`Agent session ${resolvedSessionId ?? "active"} is no longer running.`);
			return false;
		}
		if (this.#closed || this.#selection.view !== "workspace") throw new Error(`Task ${taskId} is no longer selected.`);
		const localModeId = options.modeId;
		if (!observed) {
			if (!options.modeId) throw new Error("A mode is required when creating a session.");
			const task = this.#selectedTask;
			if (!task || task.id !== taskId) throw new Error(`Task ${taskId} is no longer selected.`);
			const predecessorId = options.handoff?.predecessor?.id ?? options.handoff?.priorActiveSessionId;
			observed =
				options.newSession && predecessorId
					? await application.handoff(task, predecessorId, options.modeId)
					: await application.newSession(task, options.modeId);
			await this.operations.followStartedTask(taskId);
		}
		if (launch.invalidated || this.#deletingTasks.has(taskId)) return false;
		const { record } = observed;
		if (retained && resolvedSessionId)
			await this.#attachments.releaseAgent(resolvedSessionId, this.#monitor.history(resolvedSessionId));
		const sessionRuntime = this.sessionRuntime;
		if (!sessionRuntime) throw new Error("Workspace session runtime is unavailable.");
		const attachment = await sessionRuntime.attach(record);
		const session: RetainedWorkspaceAgent = {
			taskId,
			label: record.preset,
			status: "starting",
			origin: { record: structuredClone(record), paneId: attachment.paneId },
		};
		let startupError: Error | undefined;
		let owner: ReturnType<typeof createWorkspaceAgentHostOwner> | undefined;
		const onError = (error: Error): void => {
			startupError = error;
			if (this.#closed || launch.invalidated) return;
			this.operations.notice(`Agent ${session.label}: ${error.message}`);
			void this.operations.refresh().catch(() => undefined);
		};
		const onOutput = (bytes: Uint8Array): void => {
			if (this.#closed || launch.invalidated || bytes.length === 0) return;
			session.terminal?.write(bytes);
			if (session.status === "starting") {
				session.status = "running";
				void this.operations.refresh().catch(() => undefined);
			}
		};
		const published = await this.#attachments.attach(
			launch,
			record.id,
			session,
			async () => {
				owner = createWorkspaceAgentHostOwner(
					attachment,
					{ onOutput, onError },
					this.runtime.createExistingAgentHost,
					() => sessionRuntime.detach(attachment),
					() => application.stopSession(taskId, record.id),
					() => this.#monitor.forget(record.id),
				);
				session.hostOwner = owner;
				session.host = owner.host;
				if (!this.#closed)
					session.terminal = this.runtime.createWorkspaceAgent(
						this.host.renderer,
						session.host,
						columns,
						rows,
						onError,
					);
				await session.host.start();
				if (startupError) throw startupError;
				if (launch.invalidated) return;
				await session.host.resize?.(columns, rows);
				if (startupError) throw startupError;
				if (launch.invalidated) return;
				if (this.#closed && owner.host.detach) {
					session.terminal?.destroy();
					return;
				}
				if (this.#closed || this.#selection.view !== "workspace")
					throw new Error(`Task ${taskId} is no longer selected.`);
				if (!attachOnly) await this.operations.followStartedTask(taskId);
			},
			async (history) => {
				if (owner) await owner.detachAndDestroy(session.terminal, history);
				else await sessionRuntime.detach(attachment);
			},
		);
		if (!published) return false;
		if (!this.#closed && owner) {
			const host = owner.host;
			this.#agentAlive.set(record.id, () => host.alive());
			if (localModeId) {
				this.#localSelections.set(`${taskId}\u0000${localModeId}`, record.id);
				this.#localSessionModes.set(record.id, localModeId);
			}
			this.#monitor.track(record.id, {
				taskId,
				bootstrap: attachment.bootstrap,
				statusDir: sessionActivityDir(dirname(record.outputPath), record.id),
				attached: true,
				supervised: false,
				createdAt: record.createdAt,
				exec: (argv) => attachment.exec.run(argv),
				target: attachment.paneId,
			});
		}
		return record;
	}

	async openPicker(taskId: string): Promise<void> {
		const selection = this.#selection;
		if (
			this.#closed ||
			this.#picker ||
			this.operations.blocked() ||
			selection.view !== "workspace" ||
			selection.taskId !== taskId
		)
			return;
		const request = ++this.#pickerRequest;
		this.#pickerLoading = true;
		const state = this.viewState.current;
		const current = (): boolean => request === this.#pickerRequest && this.#selected(selection, state);
		try {
			const catalog = await loadProjectModeCatalog(this.core);
			const modeId = selectedModeForTask(state, taskId, catalog);
			const sessions = await this.workspace.listSessions(taskId, modeId);
			if (!current() || modeId !== selection.modeId) return;
			const mount = this.runtime.mountSessionPicker(this.host.renderer, this.host.root, {
				taskId,
				sessions: sessions.sessions,
				snapshots: new Map(
					sessions.sessions.flatMap((record) => {
						const observed = this.#monitor.observed(record.id);
						return observed ? [[record.id, observed] as const] : [];
					}),
				),
				activeSessionId: sessions.activeSessionId,
				localSessionIds: new Set(
					this.#attachments
						.agents()
						.filter(
							([id, agent]) =>
								agent.taskId === taskId &&
								this.#localSessionModes.get(id) === modeId &&
								!!agent.terminal &&
								!agent.terminal.isDestroyed,
						)
						.map(([id]) => id),
				),
				onFocusLocal: (id) => {
					if (!current()) return;
					const agent = this.#attachments.agent(id);
					if (!agent?.terminal || agent.terminal.isDestroyed) {
						const session = sessions.sessions.find((candidate) => candidate.id === id);
						if (session)
							void this.core.readObserved(taskId, id).then((observed) => {
								if (current() && ["running", "parked"].includes(observed.snapshot.state))
									this.#attachRunningSession(taskId, session, true);
							});
						return;
					}
					this.#localSelections.set(`${taskId}\u0000${modeId}`, id);
					this.operations.focus();
					void this.operations.refresh();
				},
				onResume: async (id) => {
					if (!current() || !this.#picker) throw new Error(`Task ${taskId} is no longer selected.`);
					const picker = this.#picker;
					picker.phase = "resuming";
					try {
						await this.start(
							taskId,
							Math.max(20, this.host.renderer.width),
							Math.max(5, this.host.renderer.height - 6),
							{ sessionId: id, modeId, focus: true, rejectFailure: true },
						);
					} catch (error) {
						if (this.#picker === picker) {
							if (current()) picker.phase = "selecting";
							else {
								picker.mount.dispose();
								this.#picker = undefined;
								if (!this.#closed) void this.operations.refresh();
							}
						}
						throw error;
					}
				},
				onDelete: async (id) => {
					if (!current()) throw new Error(`Task ${taskId} is no longer selected.`);
					await this.core.deleteSession(taskId, id, { force: true });
					await this.#attachments.releaseAgent(id, this.#monitor.history(id));
					this.#forgetLocal(id);
					if (!this.#closed) void this.operations.refresh();
				},
				onClose: () => {
					if (request !== this.#pickerRequest) return;
					this.#picker = undefined;
					if (!this.#closed) void this.operations.refresh();
				},
			});
			this.#picker = { mount, phase: "selecting" };
		} catch (error) {
			if (current()) this.operations.notice(`Could not list sessions: ${String(error)}`);
		} finally {
			if (request === this.#pickerRequest) this.#pickerLoading = false;
			if (!this.#closed && !this.#picker) void this.operations.refresh();
		}
	}

	#forgetLocal(id: string): void {
		this.#agentAlive.delete(id);
		this.#localSessionModes.delete(id);
		for (const [key, selectedId] of this.#localSelections) if (selectedId === id) this.#localSelections.delete(key);
		this.#monitor.forget(id);
	}

	async removeTask(taskId: string): Promise<void> {
		const { released, failures } = await this.#attachments.removeTask(taskId, (id) => this.#monitor.history(id));
		await this.operations.persist((state) => pruneSelectedModeForTask(state, taskId));
		for (const id of released) this.#forgetLocal(id);
		this.#sessionTaskIds.delete(taskId);
		this.#startingTasks.delete(taskId);
		for (const key of this.#startingTaskModes.keys())
			if (key.startsWith(`${taskId}\u0000`)) this.#startingTaskModes.delete(key);
		if (failures.length) throw new AggregateError(failures, failures.map(String).join("; "));
	}

	async deleteTask(taskId: string): Promise<{ success: boolean; cleanupError?: unknown }> {
		this.#deletingTasks.add(taskId);
		try {
			const result = await this.core.tasks.delete(taskId, {});
			if (!result.success) return { success: false };
			try {
				await this.removeTask(taskId);
			} catch (cleanupError) {
				return { success: true, cleanupError };
			}
			return { success: true };
		} finally {
			this.#deletingTasks.delete(taskId);
		}
	}

	async close(): Promise<void> {
		if (
			!this.#monitor.hasWorkingSessions ||
			!(await this.operations.confirm(
				"Running sessions",
				"Working sessions are still running. Yes: force close and stop all sessions. No: close while keeping execution alive; reopening will attach to the existing pane.",
			))
		)
			return;
		await this.#attachments.shutdown(() => this.core.shutdown());
	}

	dispose(): Promise<void> {
		this.#closed = true;
		this.#attachments.close();
		this.#monitor.dispose();
		this.#pickerRequest++;
		this.#picker?.mount.dispose();
		this.#picker = undefined;
		for (const [, session] of this.#attachments.agents()) session.terminal?.destroy();
		return this.#attachments
			.release((id) => this.#monitor.history(id))
			.then((failures) => {
				for (const failure of failures) process.stderr.write(`Could not stop workspace agent: ${String(failure)}\n`);
			});
	}
}
