import { loadProjectModeCatalog } from "../../controller/agent-configuration.ts";
import type { Core } from "../../controller/agentic-workspace.ts";
import { loadTaskDetail } from "../../controller/task-detail.ts";
import type { WorkspaceStateService } from "../../controller/workspace-state.ts";
import type { SessionRuntime } from "../../model/session/session.ts";
import type { AgentSession, ModeCatalog, SessionSnapshot } from "../../model/session/types.ts";
import { getMilestoneLabel } from "../../model/task/milestones.ts";
import { getPriorityLabels } from "../../model/task/priority-config.ts";
import { TaskOrdering } from "../../model/task/task-ordering.ts";
import type { TaskDetail } from "../../model/task/task-projection.ts";
import { TaskSearchIndex } from "../../model/task/task-search.ts";
import { isTerminalStatus } from "../../model/task/terminal-status.ts";
import type { AgenticWorkspaceConfig, Milestone, Task } from "../../model/types.ts";
import { type ActivityProbe, createActivityProbe } from "../../runtime/agent-status-probe.ts";
import { createExistingAgentHost } from "../../runtime/live/existing-agent-host.ts";
import { createTmuxExec } from "../../runtime/live/tmux/exec.ts";
import { type GroupStore, openGroupStore } from "../../storage/group-store.ts";
import { openViewStateStore, type ViewStateStore } from "../../storage/view-state-store.ts";
import { mountOpenTuiPresetPicker } from "./agent-settings.ts";
import { Board } from "./board/models/board.ts";
import { mountOpenTuiBoard, type OpenTuiBoardMount, type OpenTuiBoardProps } from "./board.ts";
import { mountOpenTuiConfirm, type OpenTuiConfirmMount } from "./confirm.ts";
import {
	mountOpenTuiFilterEditor,
	mountOpenTuiHelpOverlay,
	type OpenTuiFilterEditorMount,
	type OpenTuiFilterState,
	type OpenTuiHelpOverlayMount,
} from "./filters.ts";
import { mountOpenTuiGroupDeleteModal } from "./group-delete-modal.ts";
import { findGroup } from "./groups.ts";
import { createOpenTuiHost, type OpenTuiHost } from "./host.ts";
import { shortcutHelpItems } from "./keybindings.ts";
import { WorkspaceNavigationHistory, type WorkspaceNavigationSnapshot } from "./navigation-history.ts";
import { mountOpenTuiSessionPicker } from "./session-picker.ts";
import { taskFilterOptions } from "./task-filters.ts";
import { createWorkspaceFilters, type SharedWorkspaceState, selectedModeForTask } from "./workspace/state.ts";
import {
	mountOpenTuiWorkspace,
	type OpenTuiWorkspaceAgentSession,
	type OpenTuiWorkspaceMount,
	type OpenTuiWorkspaceOptions,
	type OpenTuiWorkspaceTaskAction,
	type OpenTuiWorkspaceTaskEntry,
} from "./workspace.ts";
import { createWorkspaceAgent } from "./workspace-agent.ts";
import { type WorkspaceSessionPresentation, WorkspaceSessions } from "./workspace-sessions.ts";
import { WorkspaceSettings } from "./workspace-settings.ts";
import { WorkspaceTaskActions } from "./workspace-task-actions.ts";

type OpenTuiWorkspaceRuntime = {
	readonly createHost: () => Promise<OpenTuiHost>;
	readonly createExistingAgentHost: typeof createExistingAgentHost;
	readonly createWorkspaceAgent: typeof createWorkspaceAgent;
	readonly mountSessionPicker: typeof mountOpenTuiSessionPicker;
	readonly mountPresetPicker: typeof mountOpenTuiPresetPicker;
	readonly mountConfirm: typeof mountOpenTuiConfirm;
	readonly mountGroupDelete: typeof mountOpenTuiGroupDeleteModal;
	readonly isAgentAlive: (sessionName: string) => Promise<boolean>;
	readonly mountWorkspace: (
		renderer: OpenTuiHost["renderer"],
		root: OpenTuiHost["root"],
		options: OpenTuiWorkspaceOptions,
	) => OpenTuiWorkspaceMount;
	readonly mountBoard: (
		renderer: OpenTuiHost["renderer"],
		root: OpenTuiHost["root"],
		props: OpenTuiBoardProps,
	) => OpenTuiBoardMount;
	readonly createActivityProbe: () => ActivityProbe;
};

const defaultRuntime: OpenTuiWorkspaceRuntime = {
	createHost: createOpenTuiHost,
	createExistingAgentHost,
	createWorkspaceAgent,
	mountSessionPicker: mountOpenTuiSessionPicker,
	mountPresetPicker: mountOpenTuiPresetPicker,
	mountConfirm: mountOpenTuiConfirm,
	mountGroupDelete: mountOpenTuiGroupDeleteModal,
	isAgentAlive: async (sessionName) => {
		const result = await createTmuxExec({ socketName: "default" }).run(["has-session", "-t", sessionName]);
		return result.exitCode === 0;
	},
	mountWorkspace: mountOpenTuiWorkspace,
	mountBoard: mountOpenTuiBoard,
	createActivityProbe,
};

export type OpenTuiWorkspaceControllerOptions = {
	readonly initialView?: "workspace" | "board";
	readonly boardMilestoneMode?: boolean;
	readonly selectedTaskId?: string;
	readonly workspaceState?: WorkspaceStateService;
	readonly sessionRuntime?: SessionRuntime;
	readonly groupStore?: GroupStore;
	readonly viewStateStore?: ViewStateStore<SharedWorkspaceState>;
	readonly runtime?: Partial<OpenTuiWorkspaceRuntime>;
	readonly onQuit?: () => void | Promise<void>;
	readonly activityPollIntervalMs?: number;
};

type WorkspaceSnapshot = WorkspaceSessionPresentation & {
	readonly tasks: Task[];
	readonly boardTasks: Task[];
	readonly selectedTask: Task | undefined;
	readonly projectName: string | undefined;
	readonly filterSummary: string;
	readonly detailsVisible: boolean;
	readonly selectedTaskIndex: number;
	readonly config: AgenticWorkspaceConfig | null;
	readonly taskDetails: ReadonlyMap<string, TaskDetail>;
};
type SurfaceMount = OpenTuiWorkspaceMount | OpenTuiBoardMount;

function defaultSharedState(): SharedWorkspaceState {
	return { filters: createWorkspaceFilters(), detailsVisible: true };
}

function taskEntry(task: Task): OpenTuiWorkspaceTaskEntry {
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		description: task.description,
		labels: task.labels,
		priority: task.priority,
	};
}

function sessionEntry(
	session: AgentSession | undefined,
	snapshot: SessionSnapshot | undefined,
): OpenTuiWorkspaceAgentSession | undefined {
	if (!session || !snapshot) return undefined;
	return { id: session.id, status: snapshot.state, preset: session.preset, cwd: session.cwd, taskId: session.taskId };
}

function summarizeFilters(state: SharedWorkspaceState): string {
	const filters = state.filters;
	return [
		filters.search ? `Search: ${filters.search}` : undefined,
		`Status: ${filters.status.join(", ") || "All"}`,
		`Type: ${filters.taskTypes.join(", ") || "All"}`,
		`Project: ${filters.projects.join(", ") || "All"}`,
		`Priority: ${filters.priority || "All"}`,
		`Milestone: ${filters.milestone || "All"}`,
		`Labels: ${filters.labels.join(", ") || "All"}`,
	]
		.filter((value): value is string => Boolean(value))
		.join(" · ");
}

function openTuiFilters(filters: SharedWorkspaceState["filters"]): OpenTuiFilterState {
	return {
		search: filters.search,
		status: [...filters.status],
		type: [...filters.taskTypes],
		project: [...filters.projects],
		priority: filters.priority,
		labels: [...filters.labels],
		milestone: filters.milestone,
	};
}

function workspaceFilters(filters: OpenTuiFilterState): SharedWorkspaceState["filters"] {
	return {
		search: filters.search,
		status: [...filters.status],
		taskTypes: [...filters.type],
		projects: [...filters.project],
		priority: filters.priority,
		labels: [...filters.labels],
		milestone: filters.milestone,
	};
}

function uniqueValues(values: Iterable<string | undefined>): string[] {
	return [
		...new Set([...values].map((value) => value?.trim()).filter((value): value is string => Boolean(value))),
	].sort((a, b) => a.localeCompare(b));
}

/** Owns startup, navigation, refresh serialization, surface composition, and global modal arbitration. */
export class OpenTuiWorkspaceController {
	readonly #core: Core;
	readonly #workspaceState: WorkspaceStateService;
	readonly #options: OpenTuiWorkspaceControllerOptions;
	readonly #runtime: OpenTuiWorkspaceRuntime;
	#viewState: ViewStateStore<SharedWorkspaceState> | undefined;
	#modeCatalog: ModeCatalog | undefined;
	#ownsViewState = false;
	#groupStore: GroupStore | undefined;
	#ownsGroupStore = false;
	#selectedGroupId: string | undefined;
	#unsubscribeGroups: (() => void) | undefined;
	#host: OpenTuiHost | undefined;
	#sessions: WorkspaceSessions | undefined;
	#taskActions: WorkspaceTaskActions | undefined;
	#settings: WorkspaceSettings | undefined;
	#mount: SurfaceMount | undefined;
	#mountView: "workspace" | "board" | undefined;
	#filterEditor: OpenTuiFilterEditorMount | undefined;
	#helpOverlay: OpenTuiHelpOverlayMount | undefined;
	#confirm: OpenTuiConfirmMount | undefined;
	#unsubscribe: (() => void) | undefined;
	#tasks = new Map<string, Task>();
	readonly #artifactChangeListeners = new Map<string, Set<() => void>>();
	#taskWatcher: { stop(): void } | undefined;
	#configWatcher: { stop(): void } | undefined;
	#selectedTaskId: string | undefined;
	#refreshRevision = 0;
	#view: "workspace" | "board" = "workspace";
	#board: Board | undefined;
	readonly #navigationHistory = new WorkspaceNavigationHistory();
	#navigationCurrent: WorkspaceNavigationSnapshot | undefined;
	#taskPaneVisible = true;
	#taskFirstVisible = 0;
	#agentFocused = false;
	#fullscreen = false;
	#milestones: Milestone[] = [];
	#archivedMilestones: Milestone[] = [];
	#config: AgenticWorkspaceConfig | null = null;
	#notice: string | undefined;
	#closed = false;
	#quitting = false;
	#refreshLoop: Promise<void> | undefined;
	#refreshRequested = false;
	#completion: Promise<void> | undefined;
	#persisting: Promise<void> = Promise.resolve();
	#pendingSelectionWrites = 0;
	#resolveCompletion: (() => void) | undefined;

	constructor(core: Core, options: OpenTuiWorkspaceControllerOptions = {}) {
		this.#core = core;
		this.#workspaceState = options.workspaceState ?? core.workspaceState;
		this.#options = options;
		this.#runtime = { ...defaultRuntime, ...options.runtime };
		this.#view = options.initialView ?? "workspace";
		this.#selectedTaskId = options.selectedTaskId;
	}

	async run(): Promise<void> {
		if (this.#completion) return await this.#completion;
		if (this.#closed) throw new Error("OpenTUI workspace controller is closed.");
		this.#modeCatalog = await this.#core.getProjectModeCatalog();
		this.#completion = new Promise<void>((resolve) => {
			this.#resolveCompletion = resolve;
		});
		const completion = this.#completion;
		const viewState =
			this.#options.viewStateStore ??
			(await openViewStateStore(this.#core.projectRoot, defaultSharedState, {
				stateRoot: await this.#workspaceState.stateRoot,
			}));
		const ownsViewState = this.#options.viewStateStore === undefined;
		if (this.#closed) {
			if (ownsViewState) viewState.close();
			return await completion;
		}
		this.#viewState = viewState;
		this.#ownsViewState = ownsViewState;
		if (viewState.recoveryNotice) this.#notice = viewState.recoveryNotice;
		let groupStore = this.#options.groupStore;
		const groupDirectory = this.#core.workspaceDirectory;
		if (groupStore === undefined && groupDirectory !== undefined) {
			try {
				groupStore = await openGroupStore(this.#core.projectRoot, groupDirectory);
			} catch (error) {
				this.#notice = error instanceof Error ? error.message : String(error);
			}
		}
		if (this.#closed) {
			if (this.#options.groupStore === undefined) groupStore?.close();
			return await completion;
		}
		this.#groupStore = groupStore;
		this.#ownsGroupStore = this.#options.groupStore === undefined;
		this.#unsubscribeGroups = groupStore?.subscribe(() => {
			void this.#scheduleRefresh().catch(() => undefined);
		});
		try {
			const host = await this.#runtime.createHost();
			if (this.#closed) {
				host.destroy();
				return await completion;
			}
			this.#host = host;
			this.#sessions = new WorkspaceSessions(
				this.#core,
				this.#workspaceState,
				this.#options.sessionRuntime,
				host,
				viewState,
				this.#modeCatalog,
				this.#runtime,
				{
					blocked: () => this.#hasModal(),
					refresh: () => this.#scheduleRefresh(),
					notice: (message) => {
						this.#notice = message;
					},
					confirm: (title, message) => this.#openConfirm(title, message),
					focus: () => {
						this.#agentFocused = true;
					},
					followStartedTask: (taskId, adopt) => this.#followStartedTaskStatus(taskId, adopt),
					indications: (indications) => {
						if (!this.#closed && this.#mountView === "workspace")
							(this.#mount as OpenTuiWorkspaceMount | undefined)?.setIndication(indications);
					},
					persist: (patch) => this.#persistState(patch),
				},
				this.#options.activityPollIntervalMs,
			);
			this.#taskActions = new WorkspaceTaskActions(
				this.#core,
				host,
				groupStore,
				this.#sessions,
				this.#runtime.mountGroupDelete,
				{
					blocked: () => this.#hasModal(),
					refresh: () => this.#scheduleRefresh(),
					notice: (message) => {
						this.#notice = message;
					},
					confirm: (title, message) => this.#openConfirm(title, message),
					created: async (task) => {
						this.#selectedTaskId = task.id;
						this.#selectedGroupId = undefined;
						this.#updateSessionSelection();
						await this.#persistState(
							(state) => ({ ...state, selectedTaskId: task.id, selectedGroupId: undefined, activeStatus: task.status }),
							{ selection: true, rejectFailure: true },
						);
					},
					removed: (taskId) => {
						if (this.#selectedTaskId === taskId) {
							this.#selectedTaskId = undefined;
							this.#updateSessionSelection();
						}
					},
					groupRemoved: (groupId) => {
						if (this.#selectedGroupId === groupId) this.#selectedGroupId = undefined;
					},
				},
			);
			this.#settings = new WorkspaceSettings(this.#core, host, {
				blocked: () => this.#hasModal(),
				refresh: () => this.#scheduleRefresh(),
				notice: (message) => {
					this.#notice = message;
				},
				confirm: (title, message) => this.#openConfirm(title, message),
			});
			this.#updateSessionSelection();
			host.renderer.once("destroy", () => this.destroy());
			await this.#refresh();
			if (this.#closed || !this.#viewState) return await completion;
			this.#unsubscribe = this.#viewState.subscribe(() => {
				void this.#scheduleRefresh().catch(() => undefined);
			});
			this.#startWatchers();
			await this.#sessions.startMonitoring();
		} catch (error) {
			this.destroy();
			throw error;
		}
		return await completion;
	}

	#startWatchers(): void {
		const refresh = (): void => {
			void this.#scheduleRefresh().catch(() => undefined);
		};
		try {
			this.#taskWatcher = this.#core.watchTasks(
				{
					onTaskAdded: refresh,
					onTaskChanged: refresh,
					onArtifactChanged: ({ taskId }) => {
						for (const listener of [...(this.#artifactChangeListeners.get(taskId) ?? [])]) listener();
						refresh();
					},
					onTaskRemoved: async (taskId) => {
						try {
							await this.#sessions?.removeTask(taskId);
						} finally {
							refresh();
						}
					},
				},
				[...this.#tasks.values()],
			);
		} catch (error) {
			process.stderr.write(`Could not watch tasks for live updates: ${String(error)}\n`);
		}
		try {
			this.#configWatcher = this.#core.watchConfig({ onConfigChanged: refresh });
		} catch (error) {
			process.stderr.write(`Could not watch config for live updates: ${String(error)}\n`);
		}
	}

	async refresh(): Promise<void> {
		this.#refreshRequested = true;
		await this.#ensureRefreshLoop();
	}

	destroy(): void {
		if (this.#closed) return;
		this.#closed = true;
		const release = this.#sessions?.dispose() ?? Promise.resolve();
		this.#taskActions?.dispose();
		this.#settings?.dispose();
		this.#artifactChangeListeners.clear();
		this.#unsubscribe?.();
		this.#unsubscribe = undefined;
		this.#taskWatcher?.stop();
		this.#taskWatcher = undefined;
		this.#configWatcher?.stop();
		this.#configWatcher = undefined;
		this.#filterEditor?.dispose();
		this.#filterEditor = undefined;
		this.#helpOverlay?.dispose();
		this.#helpOverlay = undefined;
		this.#confirm?.dispose();
		this.#confirm = undefined;
		this.#unsubscribeGroups?.();
		this.#unsubscribeGroups = undefined;
		if (this.#ownsGroupStore) this.#groupStore?.close();
		this.#groupStore = undefined;
		this.#mount?.dispose();
		this.#mount = undefined;
		this.#mountView = undefined;
		this.#host?.destroy();
		this.#host = undefined;
		if (this.#ownsViewState) this.#viewState?.close();
		this.#viewState = undefined;
		void release.finally(() => this.#resolveCompletion?.());
	}

	#scheduleRefresh(): Promise<void> {
		this.#refreshRequested = true;
		const loop = this.#ensureRefreshLoop();
		void loop.catch((error: unknown) => {
			process.stderr.write(`Could not refresh workspace: ${String(error)}\n`);
		});
		return loop;
	}

	#ensureRefreshLoop(): Promise<void> {
		if (this.#refreshLoop) return this.#refreshLoop;
		const loop = (async () => {
			try {
				while (this.#refreshRequested && !this.#closed) {
					this.#refreshRequested = false;
					await this.#refresh();
				}
			} finally {
				this.#refreshLoop = undefined;
			}
		})();
		this.#refreshLoop = loop;
		return loop;
	}

	#hasModal(exceptSettings = false): boolean {
		return !!(
			this.#taskActions?.busy ||
			this.#filterEditor ||
			this.#helpOverlay ||
			this.#sessions?.busy ||
			this.#confirm ||
			this.#settings?.busy(exceptSettings)
		);
	}

	#updateSessionSelection(modeId?: string): void {
		const taskId = this.#selectedTaskId;
		const selectedModeId =
			modeId ??
			(taskId && this.#modeCatalog
				? selectedModeForTask(this.#viewState?.current ?? {}, taskId, this.#modeCatalog)
				: undefined);
		this.#sessions?.select(this.#view, taskId, selectedModeId);
	}

	async #refresh(): Promise<void> {
		if (this.#closed || !this.#host || !this.#viewState || !this.#sessions || !this.#taskActions || this.#hasModal())
			return;
		const revision = ++this.#refreshRevision;
		const state = this.#viewState.current;
		const organization = this.#taskActions.organization;
		if (state.selectedGroupId !== undefined && findGroup(organization.groups, state.selectedGroupId))
			this.#selectedGroupId = state.selectedGroupId;
		if (
			state.selectedGroupId === undefined &&
			this.#selectedGroupId !== undefined &&
			this.#pendingSelectionWrites === 0
		)
			this.#selectedGroupId = undefined;
		const snapshot = await this.#loadSnapshot(state);
		if (this.#closed || !this.#host || this.#hasModal() || revision !== this.#refreshRevision) return;
		if (state !== this.#viewState.current) {
			void this.#scheduleRefresh();
			return;
		}
		this.#selectedTaskId = this.#selectedGroupId === undefined ? snapshot.selectedTask?.id : undefined;
		this.#config = snapshot.config;
		const navigation: WorkspaceNavigationSnapshot = {
			view: this.#view,
			selectedTaskId: snapshot.selectedTask?.id,
			activeStatus:
				this.#viewState.current.activeStatus ?? snapshot.selectedTask?.status ?? snapshot.config?.statuses?.[0],
			filters: this.#viewState.current.filters,
		};
		if (!this.#navigationCurrent) this.#navigationHistory.record(navigation);
		this.#navigationCurrent = navigation;
		const taskAction = (taskId: string, action: OpenTuiWorkspaceTaskAction): void => {
			void this.#taskActions?.act(taskId, action, this.#tasks.get(taskId), this.#config).catch((error: unknown) => {
				this.#notice = `Could not ${action} ${taskId}: ${error instanceof Error ? error.message : "Unknown error"}`;
				void this.#scheduleRefresh().catch(() => undefined);
			});
		};
		if (this.#view === "board") {
			this.#mount?.dispose();
			this.#mount = undefined;
			this.#mountView = undefined;
			const statuses = snapshot.config?.statuses ?? [];
			const filters = this.#viewState.current.filters;
			this.#board ??= new Board({
				tasks: snapshot.boardTasks,
				statuses,
				taskTypes: snapshot.config?.types,
				projects: snapshot.config?.projects,
				resolveMilestoneLabel: (value) => getMilestoneLabel(value, this.#milestones),
			});
			const board = this.#board;
			board.update(snapshot.boardTasks, statuses);
			board.setHideEmptyColumns(snapshot.config?.hideEmptyColumns ?? false);
			board.setFilters({
				searchQuery: filters.search,
				excludeStatus: filters.status.length ? statuses.filter((status) => !filters.status.includes(status)) : [],
				typeFilter: filters.taskTypes,
				projectFilter: filters.projects,
				priorityFilter: filters.priority,
				labelFilter: filters.labels,
				labelMatch: "any",
				milestoneFilter: filters.milestone,
			});
			if (snapshot.selectedTask) board.select(snapshot.selectedTask.status, snapshot.selectedTask.id);
			this.#mount = this.#runtime.mountBoard(this.#host.renderer, this.#host.root, {
				board,
				tasks: snapshot.boardTasks,
				statuses,
				milestoneMode: this.#options.boardMilestoneMode,
				milestones: this.#milestones,
				filterSummary: snapshot.filterSummary,
				notice: this.#notice,
				keyboardOverrides: this.#viewState.current.keyboardOverrides,
				onHelp: () => this.#openHelp(),
				onSettingsRequest: () => void this.#settings?.open(),
				onHistoryBack: () => this.#restoreNavigation("back"),
				onHistoryForward: () => this.#restoreNavigation("forward"),
				onSelectionChange: (task) => {
					if (task) this.#selectTask(task.id);
				},
				onWorkspaceHandoff: (task) => this.#showWorkspace(task),
				onViewSwitch: (task) => this.#showWorkspace(task),
				onFilterRequest: () => this.#openFilterEditor(),
				onTaskCreate: () => this.#taskActions?.openComposer(this.#config, this.#selectedTaskId, this.#selectedGroupId),
				onTaskAction: (task, action) => taskAction(task.id, action),
				onHideEmptyToggle: (hideEmpty) => {
					void this.#setHideEmptyColumns(hideEmpty);
				},
				onMoveCommit: (commit) => {
					void this.#taskActions?.move(commit);
				},
				onTaskSelect: (task) => this.#showWorkspace(task),
				onQuit: () => this.#quit(),
			});
			this.#mountView = "board";
			return;
		}
		const workspaceOptions: OpenTuiWorkspaceOptions = {
			tasks: snapshot.tasks.map(taskEntry),
			groups: organization.groups,
			groupMembership: organization.membership,
			selectedGroupId: this.#selectedGroupId,
			statuses: snapshot.config?.statuses,
			activeAgentSession: sessionEntry(snapshot.activeAgentSession, snapshot.activeAgentSnapshot),
			selectedModeId: snapshot.selectedModeId,
			modeProjectionByTask: (taskId) => snapshot.modeProjectionByTask.get(taskId),
			taskArtifactApi: {
				list: (taskId) => this.#core.listTaskArtifacts(taskId),
				read: (taskId, path) => this.#core.readTaskArtifact(taskId, path),
				write: (taskId, path, bytes) => this.#core.writeTaskArtifact(taskId, path, bytes),
				subscribeArtifactChanges: (taskId, callback) => {
					let listeners = this.#artifactChangeListeners.get(taskId);
					if (!listeners) {
						listeners = new Set();
						this.#artifactChangeListeners.set(taskId, listeners);
					}
					listeners.add(callback);
					return () => {
						listeners?.delete(callback);
						if (listeners?.size === 0) this.#artifactChangeListeners.delete(taskId);
					};
				},
			},
			onCycleMode: () => void this.#cycleMode(),
			sessionTaskIds: snapshot.sessionTaskIds,
			indicationByTask: snapshot.indicationByTask,
			liveAgent: snapshot.liveAgent,
			projectName: snapshot.projectName,
			filterSummary: snapshot.filterSummary,
			detailsVisible: snapshot.detailsVisible,
			taskPaneVisible: this.#taskPaneVisible,
			agentFocused: this.#agentFocused,
			selectedTaskIndex: snapshot.selectedTaskIndex,
			firstVisibleTaskIndex: this.#taskFirstVisible,
			activeStatus: this.#viewState.current.activeStatus ?? snapshot.selectedTask?.status,
			fullscreen: this.#fullscreen,
			keyboardOverrides: this.#viewState.current.keyboardOverrides,
			onFullscreenChange: (fullscreen) => {
				this.#fullscreen = fullscreen;
			},
			onSessionRequest: (entry) => {
				void this.#sessions?.openPicker(entry.id);
			},
			onHandoffRequest: (entry) => this.#sessions?.handoff(entry.id),
			onSettingsRequest: () => void this.#settings?.open(),
			onHistoryBack: () => this.#restoreNavigation("back"),
			onHistoryForward: () => this.#restoreNavigation("forward"),
			taskDetails: snapshot.taskDetails,
			taskDetailOptions: {
				resolveMilestoneLabel: (milestone) => getMilestoneLabel(milestone, this.#milestones),
				dateFormat: snapshot.config?.dateFormat,
				configuredProjects: snapshot.config?.projects,
			},
			notice: this.#notice,
			onTaskSelect: (entry) => this.#selectTask(entry.id),
			onTaskScrollChange: (firstVisibleTaskIndex) => {
				this.#taskFirstVisible = firstVisibleTaskIndex;
			},
			onAgentStart: (entry, columns, rows) => this.#sessions?.start(entry.id, columns, rows),
			onToggleDetails: (detailsVisible) => {
				void this.#persistState((current) => ({ ...current, detailsVisible }));
			},
			onToggleTaskPane: (visible) => {
				this.#taskPaneVisible = visible;
			},
			onAgentFocusChange: (focused) => {
				this.#agentFocused = focused;
			},
			onTaskAction: (entry, action) => taskAction(entry.id, action),
			onTaskCreate: () => this.#taskActions?.openComposer(this.#config, this.#selectedTaskId, this.#selectedGroupId),
			onNewGroup: () => this.#taskActions?.openGroupComposer(this.#selectedTaskId, this.#selectedGroupId),
			onGroupSelect: (entry) => this.#selectGroup(entry.id),
			onGroupToggle: (id, direction) => void this.#taskActions?.toggleGroup(id, direction),
			onGroupDelete: (entry) => void this.#taskActions?.deleteGroup(entry.id),
			onFilterRequest: () => this.#openFilterEditor(),
			onBoardRequest: () => this.#showBoard(),
			onHelp: () => this.#openHelp(),
			onQuit: () => this.#quit(),
		};
		const mount = this.#mountView === "workspace" ? (this.#mount as OpenTuiWorkspaceMount) : undefined;
		if (mount) mount.update(workspaceOptions);
		else {
			this.#mount?.dispose();
			this.#mount = this.#runtime.mountWorkspace(this.#host.renderer, this.#host.root, workspaceOptions);
			this.#mountView = "workspace";
		}
	}

	async #loadSnapshot(state: SharedWorkspaceState): Promise<WorkspaceSnapshot> {
		const [tasks, config, milestones, archivedMilestones] = await Promise.all([
			this.#view === "board" ? this.#core.loadTasks() : this.#workspaceState.listTasks(),
			this.#core.getStoredConfig(),
			this.#core.loadMilestones(),
			this.#core.loadArchivedMilestones(),
		]);
		this.#tasks = new Map(tasks.map((task) => [task.id, task]));
		this.#milestones = milestones;
		this.#archivedMilestones = archivedMilestones;
		const visibleTasks = TaskSearchIndex.apply(tasks, taskFilterOptions(state.filters));
		const archivedIds = new Set(archivedMilestones.map((milestone) => milestone.id));
		const boardTasks = tasks.map((task) =>
			task.milestone && archivedIds.has(task.milestone) ? { ...task, milestone: undefined } : task,
		);
		// Pending local navigation outranks the store; afterwards external selection is authoritative.
		const preferredId = this.#pendingSelectionWrites > 0 ? this.#selectedTaskId : state.selectedTaskId;
		const activeStatus = this.#view === "board" ? state.activeStatus : undefined;
		const matchesStatus = (task: Task): boolean => !activeStatus || task.status === activeStatus;
		const persistedTask = visibleTasks.find((task) => task.id === preferredId && matchesStatus(task));
		const fallback =
			this.#view === "board"
				? TaskOrdering.boardColumns(visibleTasks, config?.statuses ?? []).find(
						(column) => !activeStatus || column.status === activeStatus,
					)?.tasks[0]
				: visibleTasks.find(matchesStatus);
		const groupSelected =
			this.#view === "workspace" &&
			this.#selectedGroupId !== undefined &&
			findGroup(this.#taskActions?.organization.groups ?? [], this.#selectedGroupId) !== undefined;
		const selectedTask = groupSelected ? undefined : (persistedTask ?? fallback);
		const sessions = this.#sessions;
		if (!sessions) throw new Error("Workspace session owner is unavailable.");
		const presentation = await sessions.project(state, visibleTasks, selectedTask);
		const taskDetails = new Map<string, TaskDetail>();
		if (this.#view !== "board" && selectedTask)
			taskDetails.set(selectedTask.id, await loadTaskDetail(this.#core, selectedTask));
		return {
			...presentation,
			tasks: visibleTasks,
			boardTasks,
			selectedTask,
			projectName: config?.projectName || undefined,
			filterSummary: summarizeFilters(state),
			detailsVisible: state.detailsVisible,
			selectedTaskIndex: selectedTask ? visibleTasks.indexOf(selectedTask) : -1,
			config: config ?? null,
			taskDetails,
		};
	}

	#rememberNavigation(change: Partial<WorkspaceNavigationSnapshot>): void {
		if (!this.#navigationCurrent) return;
		this.#navigationCurrent = { ...this.#navigationCurrent, ...change };
		this.#navigationHistory.record(this.#navigationCurrent);
	}

	#restoreNavigation(direction: "back" | "forward"): void {
		if (this.#closed || this.#hasModal()) return;
		const target = this.#navigationHistory[direction]();
		if (!target) return;
		this.#navigationCurrent = target;
		this.#view = target.view;
		this.#selectedTaskId = target.selectedTaskId;
		this.#taskFirstVisible = 0;
		this.#agentFocused = false;
		this.#fullscreen = false;
		this.#updateSessionSelection();
		void this.#persistState(
			(state) => ({
				...state,
				selectedTaskId: target.selectedTaskId,
				activeStatus: target.activeStatus,
				filters: target.filters,
			}),
			{ selection: true },
		).then(() => this.#scheduleRefresh());
	}

	async #followStartedTaskStatus(taskId: string, adopt: boolean): Promise<void> {
		const task = await this.#core.loadTaskForMutation(taskId);
		if (
			!task ||
			isTerminalStatus(task.status, this.#config?.statuses ?? []) ||
			adopt ||
			!task.status ||
			this.#selectedTaskId !== taskId ||
			this.#viewState?.current.activeStatus === task.status
		)
			return;
		this.#selectedTaskId = taskId;
		this.#taskFirstVisible = 0;
		this.#agentFocused = false;
		this.#rememberNavigation({ activeStatus: task.status, selectedTaskId: taskId });
		void this.#persistState((state) => ({ ...state, activeStatus: task.status, selectedTaskId: taskId }), {
			selection: true,
		});
	}

	#selectTask(taskId: string): void {
		if (!this.#tasks.has(taskId) || this.#selectedTaskId === taskId) return;
		this.#agentFocused = false;
		this.#selectedTaskId = taskId;
		this.#selectedGroupId = undefined;
		this.#updateSessionSelection();
		this.#rememberNavigation({ selectedTaskId: taskId, activeStatus: this.#tasks.get(taskId)?.status });
		void this.#persistState(
			(state) => ({
				...state,
				selectedTaskId: taskId,
				activeStatus: this.#tasks.get(taskId)?.status,
				selectedGroupId: undefined,
			}),
			{ selection: true },
		);
	}

	async #cycleMode(): Promise<void> {
		const taskId = this.#selectedTaskId;
		const store = this.#viewState;
		if (!taskId || this.#selectedGroupId !== undefined || !store) return;
		const catalog = await loadProjectModeCatalog(this.#core);
		const order = catalog.order.filter((id) => catalog.profiles[id]);
		if (order.length < 2 || this.#closed || this.#selectedTaskId !== taskId || this.#viewState !== store) return;
		await this.#persisting.catch(() => undefined);
		if (this.#closed || this.#selectedTaskId !== taskId || this.#viewState !== store) return;
		const current = selectedModeForTask(store.current, taskId, catalog);
		const next = order[(order.indexOf(current) + 1 + order.length) % order.length];
		if (!next) return;
		this.#modeCatalog = catalog;
		this.#updateSessionSelection(next);
		await this.#persistState(
			(state) => ({ ...state, selectedModeByTask: { ...state.selectedModeByTask, [taskId]: next } }),
			{ selection: true },
		);
		if (!this.#closed && this.#selectedTaskId === taskId) void this.#scheduleRefresh();
	}

	#selectGroup(groupId: string): void {
		if (!findGroup(this.#taskActions?.organization.groups ?? [], groupId) || this.#selectedGroupId === groupId) return;
		this.#agentFocused = false;
		this.#selectedGroupId = groupId;
		this.#selectedTaskId = undefined;
		this.#updateSessionSelection();
		this.#rememberNavigation({ selectedTaskId: undefined });
		void this.#persistState((state) => ({ ...state, selectedGroupId: groupId, selectedTaskId: undefined }));
	}

	#showBoard(): void {
		if (this.#view === "board") return;
		const selected = this.#selectedTaskId ? this.#tasks.get(this.#selectedTaskId) : undefined;
		if (selected) this.#board?.select(selected.status, selected.id);
		this.#view = "board";
		this.#taskFirstVisible = 0;
		this.#updateSessionSelection();
		this.#rememberNavigation({ view: "board" });
		void this.#scheduleRefresh();
	}

	#showWorkspace(task: Task | undefined): void {
		if (task?.id !== this.#selectedTaskId) this.#agentFocused = false;
		if (task) this.#selectedTaskId = task.id;
		if (this.#view !== "workspace" || task) this.#taskFirstVisible = 0;
		this.#view = "workspace";
		this.#updateSessionSelection();
		this.#rememberNavigation({
			view: "workspace",
			...(task ? { selectedTaskId: task.id, activeStatus: task.status } : {}),
		});
		void this.#persistState(
			(state) => ({ ...state, ...(task ? { selectedTaskId: task.id, activeStatus: task.status } : {}) }),
			{ selection: task !== undefined },
		);
		void this.#scheduleRefresh();
	}

	#openFilterEditor(): void {
		const host = this.#host;
		const viewState = this.#viewState;
		if (!host || !viewState || this.#closed || this.#hasModal()) return;
		const tasks = [...this.#tasks.values()];
		const filter = mountOpenTuiFilterEditor(host.renderer, host.root, {
			initial: openTuiFilters(viewState.current.filters),
			choices: {
				status: uniqueValues([...(this.#config?.statuses ?? []), ...tasks.map((task) => task.status)]),
				type: uniqueValues([...(this.#config?.types ?? []), ...tasks.map((task) => task.type)]),
				project: uniqueValues([...(this.#config?.projects ?? []), ...tasks.map((task) => task.project)]),
				priority: uniqueValues([...getPriorityLabels(this.#config), ...tasks.map((task) => task.priority)]),
				labels: uniqueValues(tasks.flatMap((task) => task.labels)),
				milestone: uniqueValues([
					...this.#milestones.map((milestone) => milestone.title),
					...this.#archivedMilestones.map((milestone) => milestone.title),
					...tasks.map((task) => task.milestone && getMilestoneLabel(task.milestone, this.#milestones)),
				]),
			},
			onApply: (filters) => {
				if (this.#filterEditor === filter) this.#filterEditor = undefined;
				const nextFilters = workspaceFilters(filters);
				const visible = TaskSearchIndex.apply([...this.#tasks.values()], taskFilterOptions(nextFilters));
				const selectedTaskId = visible.find((task) => task.id === this.#selectedTaskId)?.id ?? visible[0]?.id;
				this.#selectedTaskId = selectedTaskId;
				this.#updateSessionSelection();
				this.#taskFirstVisible = 0;
				this.#rememberNavigation({ filters: nextFilters, selectedTaskId });
				void this.#persistState((state) => ({ ...state, filters: nextFilters, selectedTaskId }), {
					selection: true,
				});
			},
			onCancel: () => {
				if (this.#filterEditor === filter) this.#filterEditor = undefined;
				void this.#scheduleRefresh();
			},
		});
		this.#filterEditor = filter;
	}

	#helpItems(): ReturnType<typeof shortcutHelpItems> {
		const items = shortcutHelpItems(this.#view);
		if (this.#view !== "workspace") return items;
		const task = this.#selectedTaskId ? this.#tasks.get(this.#selectedTaskId) : undefined;
		return task && isTerminalStatus(task.status, this.#config?.statuses ?? [])
			? items.filter((item) => item.shortcut.id !== "workspace.markDone")
			: items;
	}

	#openHelp(): void {
		const host = this.#host;
		if (!host || this.#closed || this.#hasModal()) return;
		const overlay = mountOpenTuiHelpOverlay(host.renderer, host.root, {
			items: this.#helpItems(),
			overrides: this.#viewState?.current.keyboardOverrides,
			onOverridesChange: async (keyboardOverrides) => {
				await this.#viewState?.update((state) => ({ ...state, keyboardOverrides }));
			},
			onClose: () => {
				if (this.#helpOverlay === overlay) this.#helpOverlay = undefined;
				void this.#scheduleRefresh();
			},
		});
		this.#helpOverlay = overlay;
	}

	async #openConfirm(title: string, message: string): Promise<boolean> {
		const host = this.#host;
		const overSettings = this.#settings?.visible ?? false;
		if (!host || this.#closed || this.#hasModal(overSettings)) return false;
		const confirm = this.#runtime.mountConfirm(host.renderer, host.root, {
			title,
			message,
			...(overSettings ? { zIndex: 50 } : {}),
		});
		this.#confirm = confirm;
		try {
			return await confirm.result;
		} finally {
			if (this.#confirm === confirm) this.#confirm = undefined;
		}
	}

	async #setHideEmptyColumns(hideEmpty: boolean): Promise<void> {
		try {
			const config = await this.#core.getStoredConfig();
			if (!config) throw new Error("No config found.");
			await this.#core.saveWorkspaceConfig({ ...config, hideEmptyColumns: hideEmpty });
			this.#notice = hideEmpty ? "Hidden empty columns" : "Showing empty columns";
		} catch (error) {
			this.#notice = `Could not update board: ${error instanceof Error ? error.message : "Unknown error"}`;
		} finally {
			void this.#scheduleRefresh();
		}
	}

	async #persistState(
		patch: (state: SharedWorkspaceState) => SharedWorkspaceState,
		options: { selection?: boolean; rejectFailure?: boolean } = {},
	): Promise<void> {
		const selection = options.selection === true;
		if (selection) this.#pendingSelectionWrites++;
		const write = this.#persisting
			.catch(() => undefined)
			.then(async () => {
				try {
					await this.#viewState?.update(patch);
				} catch (error) {
					this.#notice = `Could not save workspace view: ${error instanceof Error ? error.message : String(error)}`;
					void this.#scheduleRefresh().catch((refreshError: unknown) => {
						process.stderr.write(`Could not show workspace view error: ${String(refreshError)}\n`);
					});
					if (options.rejectFailure) throw error;
				}
			});
		this.#persisting = write;
		try {
			await write;
		} finally {
			if (selection) this.#pendingSelectionWrites--;
		}
	}

	async #quit(): Promise<void> {
		if (this.#closed || this.#confirm || this.#quitting) return;
		this.#quitting = true;
		try {
			await this.#sessions?.close();
			if (this.#closed) return;
			this.destroy();
			await this.#options.onQuit?.();
		} catch (error) {
			this.#quitting = false;
			this.#notice = `Could not close sessions: ${error instanceof Error ? error.message : String(error)}`;
			void this.#scheduleRefresh();
		}
	}
}
