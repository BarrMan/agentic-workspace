import { randomUUID } from "node:crypto";
import { watch } from "node:fs";
import { dirname } from "node:path";
import {
	getEditableAgentConfiguration,
	loadProjectModeCatalog,
	resolveAgentConfiguration,
	resolveSessionPreset,
} from "../../controller/agent-configuration.ts";
import type { Core } from "../../controller/agentic-workspace.ts";
import type { ObservedSession } from "../../controller/session-application.ts";
import { loadTaskDetail } from "../../controller/task-detail.ts";
import type { WorkspaceStateService } from "../../controller/workspace-state.ts";
import { copyToClipboard } from "../../lib/clipboard.ts";
import { effectiveModeTextColor } from "../../model/session/mode-colors.ts";
import type { SessionRuntime } from "../../model/session/session.ts";
import type { ActivityMetadata, ModeCatalog, SessionSnapshot, TerminalAttachment } from "../../model/session/types.ts";
import {
	type AgentActivity,
	type AgentIndication,
	type AgentSession,
	activityToIndication,
	type TaskSessions,
} from "../../model/session/types.ts";
import type {
	SessionHandoffMarker as SessionHandoff,
	WorkspaceRequestMarker as WorkspaceRequest,
} from "../../model/session/workspace-request.ts";
import { getMilestoneLabel } from "../../model/task/milestones.ts";
import { getPriorityLabels } from "../../model/task/priority-config.ts";
import { TaskOrdering } from "../../model/task/task-ordering.ts";
import type { TaskDetail } from "../../model/task/task-projection.ts";
import { TaskSearchIndex } from "../../model/task/task-search.ts";
import { getTaskTypeValues } from "../../model/task/task-type-config.ts";
import { isTerminalStatus } from "../../model/task/terminal-status.ts";
import type { AgenticWorkspaceConfig, Milestone, Task, TaskCreateInput, TaskUpdateInput } from "../../model/types.ts";
import { createActivityObserver } from "../../runtime/activity-observer.ts";
import {
	type ActivityProbe,
	type ActivityProbeEvidence,
	type ActivityProbeTarget,
	createActivityProbe,
} from "../../runtime/agent-status-probe.ts";
import { profilePermissionSupport } from "../../runtime/agents/core/profile.ts";
import { resolveLaunchPreset } from "../../runtime/agents/opencode/opencode-resolution.ts";
import { harnessRegistry } from "../../runtime/agents/startup.ts";
import { ExactResumeUnavailableError } from "../../runtime/errors/sessions.ts";
import { createExistingAgentHost } from "../../runtime/live/existing-agent-host.ts";
import { createTmuxExec } from "../../runtime/live/tmux/exec.ts";
import type { TmuxResult } from "../../runtime/live/tmux/types.ts";
import { sessionActivityDir } from "../../runtime/status-hooks.ts";
import {
	emptyGroupState,
	type GroupState,
	type GroupStore,
	openGroupStore,
	type TaskGroup,
} from "../../storage/group-store.ts";
import { openViewStateStore, type ViewStateStore } from "../../storage/view-state-store.ts";
import { mountOpenTuiAgentSettings, mountOpenTuiPresetPicker } from "./agent-settings.ts";
import { Board, type BoardMoveCommit } from "./board/models/board.ts";
import { mountOpenTuiBoard, type OpenTuiBoardMount, type OpenTuiBoardProps } from "./board.ts";
import { mountOpenTuiConfirm, type OpenTuiConfirmMount } from "./confirm.ts";
import { mountTaskForm, type TaskFormField } from "./controls.ts";
import {
	mountOpenTuiFilterEditor,
	mountOpenTuiHelpOverlay,
	type OpenTuiFilterEditorMount,
	type OpenTuiFilterState,
	type OpenTuiHelpOverlayMount,
} from "./filters.ts";
import { mountOpenTuiGroupDeleteModal, type OpenTuiGroupDeleteModalMount } from "./group-delete-modal.ts";
import { mountOpenTuiGroupModal, type OpenTuiGroupModalMount } from "./group-modal.ts";
import { collectDescendantGroupIds, findGroup, setCollapsed } from "./groups.ts";
import { createOpenTuiHost, type OpenTuiHost } from "./host.ts";
import { shortcutHelpItems } from "./keybindings.ts";
import { deleteModeFromChoice, type ModeDeletionPickerMount, mountModeDeletionPicker } from "./mode-deletion-picker.ts";
import { WorkspaceNavigationHistory, type WorkspaceNavigationSnapshot } from "./navigation-history.ts";
import { mountOpenTuiSessionPicker } from "./session-picker.ts";
import { mountOpenTuiTaskComposer, type OpenTuiTaskComposerMount } from "./task-composer.ts";
import { taskFilterOptions } from "./task-filters.ts";
import { runTaskLifecycleAction } from "./task-lifecycle.ts";
import { changedTaskFields, createWorkspaceDraft, type WorkspaceDraft } from "./workspace/model/drafts.ts";
import {
	createWorkspaceFilters,
	pruneSelectedModeForTask,
	type SharedWorkspaceState,
	selectedModeForTask,
} from "./workspace/state.ts";
import {
	mountOpenTuiWorkspace,
	type OpenTuiWorkspaceAgentSession,
	type OpenTuiWorkspaceLiveAgent,
	type OpenTuiWorkspaceMount,
	type OpenTuiWorkspaceOptions,
	type OpenTuiWorkspaceTaskAction,
	type OpenTuiWorkspaceTaskEntry,
} from "./workspace.ts";
import { createWorkspaceAgent } from "./workspace-agent.ts";
import { createWorkspaceAgentHostOwner } from "./workspace-agent-host-owner.ts";
import { settleWorkspaceClose } from "./workspace-close.ts";

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
	/** Creates the batched tmux/filesystem activity probe used by the status poller. */
	readonly createActivityProbe: () => ActivityProbe;
};

type RetainedWorkspaceAgent = OpenTuiWorkspaceLiveAgent & {
	origin?: { record: AgentSession; paneId: string };
	hostOwner?: ReturnType<typeof createWorkspaceAgentHostOwner>;
};

type PendingAgentLaunch = {
	taskId: string;
	invalidated: boolean;
	agent?: RetainedWorkspaceAgent;
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

/** Coalescing window for sidecar `fs.watch` events, so a burst of hook writes causes one poll. */
const ACTIVITY_WATCH_COALESCE_MS = 10;
/** Backstop tick that re-checks liveness of durable-active sessions the activity poller cannot see. */
const LIVENESS_INTERVAL_MS = 30_000;

export type OpenTuiWorkspaceControllerOptions = {
	readonly initialView?: "workspace" | "board";
	readonly boardMilestoneMode?: boolean;
	readonly selectedTaskId?: string;
	readonly workspaceState?: WorkspaceStateService;
	/** Runtime paired with Core by createApplication; it supplies renderer attachment targets. */
	readonly sessionRuntime?: SessionRuntime;
	readonly groupStore?: GroupStore;
	readonly viewStateStore?: ViewStateStore<SharedWorkspaceState>;
	readonly runtime?: Partial<OpenTuiWorkspaceRuntime>;
	readonly onQuit?: () => void | Promise<void>;
	/** Override the activity-poll interval; tests set a small value to drive the poller deterministically. */
	readonly activityPollIntervalMs?: number;
};

type WorkspaceSnapshot = {
	readonly tasks: Task[];
	readonly boardTasks: Task[];
	readonly selectedTask: Task | undefined;
	readonly activeAgentSession: AgentSession | undefined;
	readonly activeAgentSnapshot: SessionSnapshot | undefined;
	readonly selectedModeId: string | undefined;
	readonly modeProjectionByTask: ReadonlyMap<string, { modeLabel: string; approved: boolean; modeColor?: string }>;
	readonly projectName: string | undefined;
	readonly filterSummary: string;
	readonly detailsVisible: boolean;
	readonly selectedTaskIndex: number;
	readonly config: AgenticWorkspaceConfig | null;
	/** Rich detail for the selected task, keyed by id; empty in board view. */
	readonly taskDetails: ReadonlyMap<string, TaskDetail>;
};

type WorkspaceEditorField = "title" | "description" | "type" | "priority";

type TaskEditorField = WorkspaceEditorField | "group";
type WorkspaceEditorValues = Record<WorkspaceEditorField, string>;
type TaskEditorFormValues = WorkspaceEditorValues & { group: string };
type SurfaceMount = OpenTuiWorkspaceMount | OpenTuiBoardMount;

/** In-memory activity for one live session. Never persisted (`[D2]`); dropped with the controller. */
type ActivityEntry = {
	readonly activity: AgentActivity;
	readonly taskId: string;
};

/** A transient overlay can refine, but never invent, the selected-mode active-session dot. */
export function modeSessionIndication(snapshot: SessionSnapshot | undefined): AgentIndication | undefined {
	if (!snapshot) return undefined;
	if (snapshot.state === "stopped") return "ended";
	return activityToIndication(snapshot.activity);
}

/** Everything the poller needs to probe one live session's pane and sidecar. */
type AgentActivityTarget = {
	readonly taskId: string;
	readonly bootstrap: string;
	readonly statusDir: string | undefined;
	/** True for an attached external pane (shared CLI server) rather than a workspace-owned one. */
	readonly attached: boolean;
	readonly supervised?: boolean;
	readonly createdAt: string;
	readonly exec: (argv: readonly string[]) => Promise<TmuxResult>;
	readonly target: string;
	/** For an owned VT session, its fused-tick metadata; external sessions omit it and fork a probe. */
	readonly read?: () => ActivityMetadata | undefined;
};

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
	return {
		id: session.id,
		status: snapshot.state,
		preset: session.preset,
		cwd: session.cwd,
		taskId: session.taskId,
	};
}

function summarizeFilters(state: SharedWorkspaceState): string {
	const filters = state.filters;
	const values = [
		filters.search ? `Search: ${filters.search}` : undefined,
		`Status: ${filters.status.join(", ") || "All"}`,
		`Type: ${filters.taskTypes.join(", ") || "All"}`,
		`Project: ${filters.projects.join(", ") || "All"}`,
		`Priority: ${filters.priority || "All"}`,
		`Milestone: ${filters.milestone || "All"}`,
		`Labels: ${filters.labels.join(", ") || "All"}`,
	];
	return values.filter((value): value is string => Boolean(value)).join(" · ");
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

function editorFields(
	draft: WorkspaceDraft,
	config: AgenticWorkspaceConfig | null,
	groupOptions: readonly { label: string; value: string }[],
	currentGroupId: string,
): readonly TaskFormField<TaskEditorField>[] {
	return [
		{ kind: "input", name: "title", label: "Title", value: draft.values.title },
		{ kind: "textarea", name: "description", label: "Description", value: draft.values.description, height: 4 },
		{
			kind: "select",
			name: "type",
			label: "Type",
			options: [{ label: "None", value: "" }, ...getTaskTypeValues(config).map((value) => ({ label: value, value }))],
			value: draft.values.type,
		},
		{
			kind: "select",
			name: "priority",
			label: "Priority",
			options: [
				{ label: "None", value: "" },
				...getPriorityLabels(config).map((priority) => ({ label: priority, value: priority })),
			],
			value: draft.values.priority,
		},
		{
			kind: "select",
			name: "group",
			label: "Group",
			options: [{ label: "Root (none)", value: "" }, ...groupOptions],
			value: currentGroupId,
		},
	];
}

/** Owns one OpenTUI host, task workflow, and retained native agent terminals. */
export class OpenTuiWorkspaceController {
	readonly #core: Core;
	readonly #workspaceState: WorkspaceStateService;
	readonly #sessionRuntime: SessionRuntime | undefined;
	readonly #options: OpenTuiWorkspaceControllerOptions;
	readonly #runtime: OpenTuiWorkspaceRuntime;
	#viewState: ViewStateStore<SharedWorkspaceState> | undefined;
	#modeCatalog: ModeCatalog | undefined;
	#ownsViewState = false;
	#groupStore: GroupStore | undefined;
	#ownsGroupStore = false;
	#groupState: GroupState = emptyGroupState();
	#groupModal: OpenTuiGroupModalMount | undefined;
	#groupDeleteModal: OpenTuiGroupDeleteModalMount | undefined;
	#selectedGroupId: string | undefined;
	#unsubscribeGroups: (() => void) | undefined;
	#host: OpenTuiHost | undefined;
	#mount: SurfaceMount | undefined;
	/** Which surface `#mount` currently holds, so a workspace refresh can update in place. */
	#mountView: "workspace" | "board" | undefined;
	#taskComposer: OpenTuiTaskComposerMount | undefined;
	#taskEditor: { dispose(): void } | undefined;
	#filterEditor: OpenTuiFilterEditorMount | undefined;
	#helpOverlay: OpenTuiHelpOverlayMount | undefined;
	#sessionPicker: { dispose(): void } | undefined;
	#confirm: OpenTuiConfirmMount | undefined;
	#modeDeletionForm: ModeDeletionPickerMount | undefined;
	#agentSettings: { dispose(): void } | undefined;
	#configurationLoading = false;
	readonly #sessionTaskIds = new Set<string>();
	#sessionPickerLoading = false;
	#sessionPickerRequest = 0;
	#unsubscribe: (() => void) | undefined;
	#tasks = new Map<string, Task>();
	/** Artifact-view listeners are scoped to normalized task ids and removed with their leaf view. */
	readonly #artifactChangeListeners = new Map<string, Set<() => void>>();
	/** Watches the tasks directory so a CLI edit is reflected without a user action. */
	#taskWatcher: { stop: () => void } | undefined;
	/** Watches the config file so an external config edit is reflected without a user action. */
	#configWatcher: { stop: () => void } | undefined;
	#selectedTaskId: string | undefined;
	#refreshRevision = 0;
	#view: "workspace" | "board" = "workspace";
	#board: Board | undefined;
	readonly #navigationHistory = new WorkspaceNavigationHistory();
	#navigationCurrent: WorkspaceNavigationSnapshot | undefined;
	#taskPaneVisible = true;
	/** First visible row of the workspace status pane, retained across selection remounts. */
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
	/** Selection writes still in flight; while any are pending the local selection outranks the store. */
	#pendingSelectionWrites = 0;
	#resolveCompletion: (() => void) | undefined;
	readonly #agents = new Map<string, RetainedWorkspaceAgent>();
	readonly #readOnlyAttachments = new Set<string>();
	readonly #activeAgents = new Map<string, string>();
	#modeActiveSessions = new Map<string, AgentSession>();
	/** This controller's execution choice, isolated by fixed task/mode identity. */
	readonly #localSelections = new Map<string, string>();
	readonly #localSessionModes = new Map<string, string>();
	readonly #startingTasks = new Set<string>();
	readonly #deletingTasks = new Set<string>();
	readonly #startingTaskModes = new Map<string, object>();
	readonly #agentAlive = new Map<string, () => Promise<boolean>>();
	readonly #agentStarts = new Set<Promise<void>>();
	readonly #pendingAgentLaunches = new Set<PendingAgentLaunch>();
	/** Durable session ids with an in-flight auto-attach to an already-running external pane. */
	readonly #attachingSessions = new Set<string>();
	readonly #attachStarts = new Set<Promise<void>>();
	/** Every task's durable session state from the latest snapshot read; the adoption scan's input. */
	#allSessions: ReadonlyMap<string, TaskSessions> | undefined;
	/** Durable session ids with an in-flight adoption, so a record is never launched twice. */
	readonly #adoptingSessions = new Set<string>();
	/** Derived activity per live session id. In-memory only; never serialized (`[D2]`). */
	readonly #activity = new Map<string, ActivityEntry>();
	readonly #activityObserver = createActivityObserver();
	/** Current model-owned observations, refreshed with the renderer snapshot. */
	readonly #sessionSnapshots = new Map<string, SessionSnapshot>();
	/** Probe targets per live session id; a target's absence is what makes a late poll stale. */
	readonly #activityTargets = new Map<string, AgentActivityTarget>();
	/** `fs.watch` handles on each tracked session's sidecar dir, keyed by session id. */
	readonly #activityWatchers = new Map<string, { close(): void }>();
	#activityProbe: ActivityProbe | undefined;
	#activityTimer: ReturnType<typeof setTimeout> | undefined;
	#livenessTimer: ReturnType<typeof setTimeout> | undefined;
	#activityPolling = false;
	/** Polls the request-marker directory so a registered request is adopted without user input. */
	#requestTimer: ReturnType<typeof setTimeout> | undefined;
	#requestPolling = false;

	constructor(core: Core, options: OpenTuiWorkspaceControllerOptions = {}) {
		this.#core = core;
		this.#workspaceState = options.workspaceState ?? core.workspaceState;
		this.#sessionRuntime = options.sessionRuntime;
		this.#options = options;
		this.#runtime = { ...defaultRuntime, ...options.runtime };
		this.#view = options.initialView ?? "workspace";
		this.#selectedTaskId = options.selectedTaskId;
	}

	async run(): Promise<void> {
		if (this.#completion) return await this.#completion;
		if (this.#closed) throw new Error("OpenTUI workspace controller is closed.");
		// Reject uninitialized projects before any local store or terminal acquisition.
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
		let groupStore: GroupStore | undefined = this.#options.groupStore;
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
		if (groupStore) {
			this.#groupState = groupStore.current;
			this.#unsubscribeGroups = groupStore.subscribe((state) => {
				this.#groupState = state;
				void this.#scheduleRefresh().catch(() => undefined);
			});
		}
		try {
			const host = await this.#runtime.createHost();
			if (this.#closed) {
				host.destroy();
				return await completion;
			}
			this.#host = host;
			host.renderer.once("destroy", () => this.destroy());
			await this.#refresh();
			if (this.#closed || !this.#viewState) return await completion;
			this.#unsubscribe = this.#viewState.subscribe(() => {
				void this.#scheduleRefresh().catch(() => undefined);
			});
			this.#startWatchers();
			// Start the activity poller only after the first paint and the view subscription exist,
			// so the first tick can never race the initial mount.
			this.#activityProbe = this.#runtime.createActivityProbe();
			this.#scheduleActivityPoll(0);
			// A durable-active session with no owned/attached pane has no probe target, so the activity
			// poller never sees it die. This slower backstop reconciles those sessions' liveness.
			this.#scheduleLivenessPoll(LIVENESS_INTERVAL_MS);
			// Settle stale requests once, then keep polling markers so a request is adopted even when
			// the user never touches the workspace (refresh alone is event-driven and can stay idle).
			await this.#pollLiveness(true);
			this.#scheduleRequestPoll(0);
		} catch (error) {
			this.destroy();
			throw error;
		}
		return await completion;
	}

	/**
	 * Subscribe to the authoritative task/config watchers so an external CLI edit (for example
	 * marking a task done, or editing the agentic-workspace config) repaints without a user action. Best-effort:
	 * a watcher failure never keeps the workspace from opening, and a core with no watchable paths
	 * (unit stubs) simply runs without live external updates.
	 */
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
						// Artifact events do not alter task.md and must not be filtered through task reconciliation.
						this.#notifyArtifactChanged(taskId);
						refresh();
					},
					onTaskRemoved: async (taskId) => {
						let error: unknown;
						for (let attempt = 0; attempt < 2; attempt++) {
							try {
								await this.#finalTaskRemoval(taskId);
								error = undefined;
								break;
							} catch (removalError) {
								error = removalError;
							} finally {
								refresh();
							}
						}
						if (error) throw error;
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

	/** Force a refresh that observes the view state as of this call, then await it. */
	async refresh(): Promise<void> {
		this.#refreshRequested = true;
		await this.#ensureRefreshLoop();
	}

	destroy(): void {
		if (this.#closed) return;
		this.#closed = true;
		clearTimeout(this.#activityTimer);
		this.#activityTimer = undefined;
		clearTimeout(this.#livenessTimer);
		this.#livenessTimer = undefined;
		clearTimeout(this.#requestTimer);
		this.#requestTimer = undefined;
		this.#activityProbe = undefined;
		for (const sessionId of [...this.#activityWatchers.keys()]) this.#closeActivityWatcher(sessionId);
		this.#activity.clear();
		this.#activityTargets.clear();
		this.#artifactChangeListeners.clear();
		this.#unsubscribe?.();
		this.#unsubscribe = undefined;
		this.#taskWatcher?.stop();
		this.#taskWatcher = undefined;
		this.#configWatcher?.stop();
		this.#configWatcher = undefined;
		this.#taskComposer?.dispose();
		this.#taskComposer = undefined;
		this.#taskEditor?.dispose();
		this.#taskEditor = undefined;
		this.#filterEditor?.dispose();
		this.#filterEditor = undefined;
		this.#helpOverlay?.dispose();
		this.#helpOverlay = undefined;
		this.#sessionPicker?.dispose();
		this.#sessionPicker = undefined;
		this.#confirm?.dispose();
		this.#confirm = undefined;
		this.#modeDeletionForm?.dispose();
		this.#modeDeletionForm = undefined;
		this.#agentSettings?.dispose();
		this.#agentSettings = undefined;
		this.#groupModal?.dispose();
		this.#groupModal = undefined;
		this.#groupDeleteModal?.dispose();
		this.#groupDeleteModal = undefined;
		this.#unsubscribeGroups?.();
		this.#unsubscribeGroups = undefined;
		if (this.#ownsGroupStore) this.#groupStore?.close();
		this.#groupStore = undefined;
		this.#groupState = emptyGroupState();
		this.#mount?.dispose();
		this.#mount = undefined;
		this.#mountView = undefined;
		for (const session of this.#agents.values()) session.terminal?.destroy();
		this.#host?.destroy();
		this.#host = undefined;
		if (this.#ownsViewState) this.#viewState?.close();
		this.#viewState = undefined;
		void this.#stopAgents().finally(() => this.#resolveCompletion?.());
	}

	/**
	 * Request a refresh without awaiting it. Rapid navigation only marks the request: the loop runs
	 * at most one further cycle after the one in flight, so the UI settles on the latest view state
	 * instead of replaying one full snapshot per keystroke.
	 */
	#scheduleRefresh(): Promise<void> {
		this.#refreshRequested = true;
		const loop = this.#ensureRefreshLoop();
		void loop.catch((error: unknown) => {
			process.stderr.write(`Could not refresh workspace: ${String(error)}\n`);
		});
		return loop;
	}

	#notifyArtifactChanged(taskId: string): void {
		const listeners = this.#artifactChangeListeners.get(taskId);
		if (!listeners) return;
		for (const listener of [...listeners]) listener();
	}

	#ensureRefreshLoop(): Promise<void> {
		const running = this.#refreshLoop;
		if (running) return running;
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
		return Boolean(
			this.#taskComposer ||
				this.#taskEditor ||
				this.#filterEditor ||
				this.#groupModal ||
				this.#groupDeleteModal ||
				this.#helpOverlay ||
				this.#sessionPicker ||
				this.#confirm ||
				this.#modeDeletionForm ||
				(!exceptSettings && this.#agentSettings) ||
				this.#configurationLoading ||
				this.#sessionPickerLoading,
		);
	}

	#scheduleActivityPoll(delayMs: number): void {
		if (this.#closed) return;
		clearTimeout(this.#activityTimer);
		this.#activityTimer = setTimeout(() => {
			this.#activityTimer = undefined;
			void this.#pollActivity();
		}, delayMs);
	}

	/**
	 * The next activity-poll delay. A target with no sidecar (a custom prompt, or a provider that
	 * installs no hook) has no event source, so it keeps the adaptive cadence: 500 ms owned, 1 s for
	 * attached externals. When every target is sidecar-backed, the `fs.watch` events drive re-reads
	 * and the poller only needs a slow 30 s backstop.
	 */
	#activityInterval(): number {
		if (this.#options.activityPollIntervalMs !== undefined) return this.#options.activityPollIntervalMs;
		let hasAttachedOnly = false;
		for (const target of this.#activityTargets.values()) {
			if (target.statusDir !== undefined) continue;
			if (!target.attached) return 500;
			hasAttachedOnly = true;
		}
		return hasAttachedOnly ? 1_000 : 30_000;
	}

	/** Schedule the next liveness backstop tick; mirrors {@link #scheduleActivityPoll}. */
	#scheduleLivenessPoll(delayMs: number): void {
		if (this.#closed) return;
		clearTimeout(this.#livenessTimer);
		this.#livenessTimer = setTimeout(() => {
			this.#livenessTimer = undefined;
			void this.#pollLiveness();
		}, delayMs);
	}

	/**
	 * Discover supervised work across tasks and modes, and reconcile its cleanup without attaching.
	 * An uncertain session is skipped independently; a conclusive settlement refreshes durable dots.
	 */
	async #pollLiveness(discoverOnly = false): Promise<void> {
		if (this.#closed) return;
		try {
			const sessions = this.#allSessions;
			if (sessions) {
				await this.#refreshObservedSessions();
				let settled = false;
				for (const [taskId, taskSessions] of sessions) {
					for (const active of taskSessions.sessions) {
						if ((active as AgentSession & { ownerScope?: string }).ownerScope === "foreign") continue;
						const observed = this.#sessionSnapshots.get(active.id);
						if (discoverOnly && (observed?.state !== "running" || !active.nativeWorkspace)) continue;
						if (observed?.state !== "starting" && observed?.state !== "running") continue;
						if (this.#activityTargets.has(active.id) && !this.#activityTargets.get(active.id)?.supervised) continue;
						try {
							const live = await this.#workspaceState.sessionApplication.readObserved(taskId, active.id);
							if (this.#closed) return;
							if (
								live.snapshot.state !== "running" &&
								live.snapshot.state !== "starting" &&
								live.snapshot.state !== "parked"
							) {
								this.#forgetActivity(active.id);
								settled = true;
							} else if (!this.#activityTargets.has(active.id)) {
								const target = await this.#sessionRuntime!.attach(live.record);
								const bootstrap = target.bootstrap || (await resolveSessionPreset(this.#core, active)).bootstrap;
								this.#trackActivityTarget(active.id, {
									taskId,
									bootstrap,
									statusDir: sessionActivityDir(dirname(active.outputPath), active.id),
									attached: true,
									supervised: false,
									createdAt: active.createdAt,
									exec: (argv) => target.exec.run(argv),
									target: target.paneId,
								});
							}
						} catch {
							// An uncertain runtime must not block discovery of another task's live work.
						}
					}
				}
				if (settled) void this.#scheduleRefresh();
			}
		} catch {
			// A backstop probe is best-effort; the next tick retries.
		} finally {
			if (!this.#closed) this.#scheduleLivenessPoll(LIVENESS_INTERVAL_MS);
		}
	}

	/**
	 * One poller tick. It probes only the live agents this workspace owns or has attached, never on
	 * the paint path, and pauses while a modal owns focus or a launch/attach is in flight. A tick
	 * with nothing to probe makes no tmux call at all.
	 */
	async #pollActivity(): Promise<void> {
		if (this.#closed || !this.#activityProbe || this.#activityPolling) return;
		this.#activityPolling = true;
		try {
			if (this.#hasModal() || this.#agentStarts.size > 0 || this.#attachStarts.size > 0) return;
			const probeTargets: ActivityProbeTarget[] = [];
			for (const [sessionId, target] of this.#activityTargets) {
				probeTargets.push({
					sessionId,
					bootstrap: target.bootstrap,
					statusDir: target.statusDir,
					exec: target.exec,
					target: target.target,
					read: target.read,
				});
			}
			if (probeTargets.length === 0) return;
			let evidence: Map<string, ActivityProbeEvidence>;
			try {
				evidence = await this.#activityProbe.probe(probeTargets);
			} catch {
				evidence = new Map();
			}
			if (this.#closed) return;
			this.#commitActivity(evidence);
		} finally {
			this.#activityPolling = false;
			if (!this.#closed) this.#scheduleActivityPoll(this.#activityInterval());
		}
	}

	/** Turn raw probe evidence into derived activity, dropping late results for superseded sessions. */
	#commitActivity(evidence: Map<string, ActivityProbeEvidence>): void {
		let changed = false;
		// A session whose target is gone (stopped/replaced) is stale identity: drop its overlay.
		for (const sessionId of [...this.#activity.keys()]) {
			if (!this.#activityTargets.has(sessionId)) {
				this.#activity.delete(sessionId);
				changed = true;
			}
		}
		for (const [sessionId, target] of this.#activityTargets) {
			const measured = evidence.get(sessionId);
			// A probe that returned no row for a live session is inconclusive; keep the last value.
			if (!measured) continue;
			const previous = this.#activity.get(sessionId);
			const next = this.#resolveActivity(sessionId, target, measured);
			if (!previous || previous.activity !== next.activity) changed = true;
			this.#activity.set(sessionId, next);
		}
		if (changed) this.#applyActivity();
	}

	#resolveActivity(sessionId: string, target: AgentActivityTarget, measured: ActivityProbeEvidence): ActivityEntry {
		const activity = this.#activityObserver.observe(
			{
				sessionId,
				bootstrap: target.bootstrap,
			},
			measured,
		);
		return {
			activity,
			taskId: target.taskId,
		};
	}

	/** Push the settled indication onto the live workspace mount. Never disposes, remounts, or refreshes. */
	#applyActivity(): void {
		if (this.#closed || this.#mountView !== "workspace" || !this.#mount) return;
		(this.#mount as OpenTuiWorkspaceMount).setIndication(this.#indicationByTask());
	}

	/**
	 * One indication per active selected-mode session, projected from its in-memory activity evidence.
	 */
	#indicationByTask(): Map<string, AgentIndication> {
		const byTask = new Map<string, AgentIndication>();

		for (const [taskId, active] of this.#modeActiveSessions) {
			const indication = modeSessionIndication(this.#sessionSnapshots.get(active.id));
			if (indication) byTask.set(taskId, indication);
		}
		return byTask;
	}

	/** Register a live session's probe target and poll once immediately for a first derived value. */
	#trackActivityTarget(sessionId: string, target: AgentActivityTarget): void {
		this.#activityTargets.set(sessionId, target);
		this.#watchActivitySidecar(sessionId, target);
		this.#scheduleActivityPoll(0);
	}

	/**
	 * Watch a session's sidecar directory so a hook write re-derives the overlay within ~10 ms instead
	 * of waiting for the backstop tick. Best-effort: watcher errors are ignored, events are coalesced,
	 * and the watcher is `unref`'d so it never keeps the process alive on its own.
	 */
	#watchActivitySidecar(sessionId: string, target: AgentActivityTarget): void {
		const statusDir = target.statusDir;
		if (!statusDir || this.#activityWatchers.has(sessionId)) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const watcher = watch(statusDir, () => {
				clearTimeout(timer);
				timer = setTimeout(() => {
					timer = undefined;
					if (!this.#closed) void this.#pollActivity();
				}, ACTIVITY_WATCH_COALESCE_MS);
			});
			watcher.on("error", () => {});
			watcher.unref();
			this.#activityWatchers.set(sessionId, {
				close: () => {
					clearTimeout(timer);
					timer = undefined;
					watcher.close();
				},
			});
		} catch {
			// A missing sidecar dir (or a filesystem that cannot watch) is not fatal; the backstop covers it.
		}
	}

	#closeActivityWatcher(sessionId: string): void {
		const watcher = this.#activityWatchers.get(sessionId);
		if (!watcher) return;
		this.#activityWatchers.delete(sessionId);
		try {
			watcher.close();
		} catch {
			// Best-effort teardown.
		}
	}

	/** Forget a session's activity when its agent stops, so no stale overlay lingers. */
	#forgetActivity(sessionId: string): void {
		this.#closeActivityWatcher(sessionId);
		const tracked = this.#activityTargets.delete(sessionId);
		this.#activity.delete(sessionId);
		this.#activityObserver.clear(sessionId);
		if (tracked && !this.#closed) this.#applyActivity();
	}

	async #refresh(): Promise<void> {
		if (this.#closed || !this.#host || !this.#viewState || this.#hasModal()) return;
		const refreshRevision = ++this.#refreshRevision;
		const state = this.#viewState.current;
		if (state.selectedGroupId !== undefined && findGroup(this.#groupState.groups, state.selectedGroupId))
			this.#selectedGroupId = state.selectedGroupId;
		else if (
			state.selectedGroupId === undefined &&
			this.#selectedGroupId !== undefined &&
			this.#pendingSelectionWrites === 0
		)
			this.#selectedGroupId = undefined;
		let snapshot = await this.#loadSnapshot(state);
		if (this.#closed || !this.#host || this.#hasModal() || refreshRevision !== this.#refreshRevision) return;
		if (state !== this.#viewState.current) {
			void this.#scheduleRefresh();
			return;
		}
		this.#selectedTaskId = this.#selectedGroupId === undefined ? snapshot.selectedTask?.id : undefined;
		snapshot = await this.#syncSelectedSession(state, snapshot);
		if (this.#closed || !this.#host || this.#hasModal() || refreshRevision !== this.#refreshRevision) return;
		if (state !== this.#viewState.current) {
			void this.#scheduleRefresh();
			return;
		}
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
				statuses: snapshot.config?.statuses ?? [],
				milestoneMode: this.#options.boardMilestoneMode,
				milestones: this.#milestones,
				filterSummary: snapshot.filterSummary,
				notice: this.#notice,
				keyboardOverrides: this.#viewState.current.keyboardOverrides,
				onHelp: () => this.#openHelp(),
				onSettingsRequest: () => void this.#openAgentSettings(),
				onHistoryBack: () => this.#restoreNavigation("back"),
				onHistoryForward: () => this.#restoreNavigation("forward"),
				onSelectionChange: (task) => {
					if (task) this.#selectTask(task.id);
				},
				onWorkspaceHandoff: (task) => this.#showWorkspace(task),
				onViewSwitch: (task) => this.#showWorkspace(task),
				onFilterRequest: () => this.#openFilterEditor(),
				onTaskCreate: () => this.#openTaskComposer(),
				onTaskAction: (task, action) => {
					void this.#handleTaskAction(task.id, action).catch((error: unknown) => {
						this.#notice = `Could not ${action} ${task.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
						void this.#scheduleRefresh().catch(() => undefined);
					});
				},
				onHideEmptyToggle: (hideEmpty) => {
					void this.#setHideEmptyColumns(hideEmpty);
				},
				onMoveCommit: (commit) => {
					void this.#persistMove(commit);
				},
				onTaskSelect: (task) => this.#showWorkspace(task),
				onQuit: () => this.#quit(),
			});
			this.#mountView = "board";
			return;
		}
		const selectedAgent = snapshot.selectedTask ? this.#agents.get(snapshot.activeAgentSession?.id ?? "") : undefined;
		const indications = this.#indicationByTask();
		const workspaceOptions: OpenTuiWorkspaceOptions & {
			readonly selectedModeId?: string;
			readonly onCycleMode?: () => void;
		} = {
			tasks: snapshot.tasks.map(taskEntry),
			groups: this.#groupState.groups,
			groupMembership: this.#groupState.membership,
			selectedGroupId: this.#selectedGroupId,
			statuses: snapshot.config?.statuses,
			activeAgentSession: sessionEntry(snapshot.activeAgentSession, snapshot.activeAgentSnapshot),
			selectedModeId: snapshot.selectedModeId,
			modeProjectionByTask: (taskId) => snapshot.modeProjectionByTask.get(taskId),
			taskArtifactApi: {
				list: async (taskId) => await this.#core.listTaskArtifacts(taskId),
				read: async (taskId, path) => this.#core.readTaskArtifact(taskId, path),
				write: async (taskId, path, bytes) => this.#core.writeTaskArtifact(taskId, path, bytes),
				subscribeArtifactChanges: (taskId, callback) => {
					const key = taskId;
					let listeners = this.#artifactChangeListeners.get(key);
					if (!listeners) {
						listeners = new Set();
						this.#artifactChangeListeners.set(key, listeners);
					}
					listeners.add(callback);
					return () => {
						listeners?.delete(callback);
						if (listeners?.size === 0) this.#artifactChangeListeners.delete(key);
					};
				},
			},
			onCycleMode: () => void this.#cycleMode(),
			sessionTaskIds: [...this.#sessionTaskIds],
			indicationByTask: indications,
			liveAgent:
				snapshot.selectedTask &&
				this.#startingTasks.has(snapshot.selectedTask.id) &&
				(!selectedAgent || selectedAgent.status === "error")
					? { taskId: snapshot.selectedTask.id, label: "agent", status: "starting" }
					: selectedAgent,
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
				void this.#openSessionPicker(entry.id);
			},
			onHandoffRequest: (entry) => {
				const state = this.#viewState?.current;
				const modeId = state && this.#modeCatalog ? selectedModeForTask(state, entry.id, this.#modeCatalog) : undefined;
				if (modeId) void this.#handoffLocalSession(entry.id, modeId);
			},
			onSettingsRequest: () => void this.#openAgentSettings(),
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
			onAgentStart: (entry, columns, rows) => this.#startTaskSession(entry.id, columns, rows, { focus: true }),
			onToggleDetails: (visible) => this.#setDetailsVisible(visible),
			onToggleTaskPane: (visible) => {
				this.#taskPaneVisible = visible;
			},
			onAgentFocusChange: (focused) => {
				this.#agentFocused = focused;
			},
			onTaskAction: (entry, action) => {
				void this.#handleTaskAction(entry.id, action).catch((error: unknown) => {
					this.#notice = `Could not ${action} ${entry.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
					void this.#scheduleRefresh().catch(() => undefined);
				});
			},
			onTaskCreate: () => this.#openTaskComposer(),
			onNewGroup: () => void this.#openGroupComposer(),
			onGroupSelect: (entry) => this.#selectGroup(entry.id),
			onGroupToggle: (groupId, direction) =>
				void this.#toggleGroup(groupId, direction).catch((error) => this.#handleGroupActionError(error)),
			onGroupDelete: (entry) => void this.#deleteGroup(entry.id).catch((error) => this.#handleGroupActionError(error)),
			onFilterRequest: () => this.#openFilterEditor(),
			onBoardRequest: () => this.#showBoard(),
			onHelp: () => this.#openHelp(),
			onQuit: () => this.#quit(),
		};
		const workspaceMount = this.#mountView === "workspace" ? (this.#mount as OpenTuiWorkspaceMount) : undefined;
		if (workspaceMount) {
			workspaceMount.update(workspaceOptions);
		} else {
			this.#mount?.dispose();
			this.#mount = this.#runtime.mountWorkspace(this.#host.renderer, this.#host.root, workspaceOptions);
			this.#mountView = "workspace";
		}
	}

	async #loadSnapshot(state: SharedWorkspaceState): Promise<WorkspaceSnapshot> {
		// Refreshes rebuild this cache so task, mode, and durable session changes cannot leave stale row dots.
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
		const boardTasks = tasks.map((task) => {
			return task.milestone && archivedIds.has(task.milestone) ? { ...task, milestone: undefined } : task;
		});
		// While a locally chosen selection is still being persisted, the in-memory selection outranks the
		// store: rapid navigation must settle on the newest keypress. Once every write has settled the
		// store is authoritative, so an external writer's selection is observed instead of shadowed.
		const preferredTaskId = this.#pendingSelectionWrites > 0 ? this.#selectedTaskId : state.selectedTaskId;
		const activeStatus = this.#view === "board" ? state.activeStatus : undefined;
		const matchesStatus = (task: Task): boolean => !activeStatus || task.status === activeStatus;
		const persistedTask = visibleTasks.find((task) => task.id === preferredTaskId && matchesStatus(task));
		// The board paints every lane newest-first, so an unpersisted board selection opens on the newest match.
		const fallbackTask =
			this.#view === "board"
				? TaskOrdering.boardColumns(visibleTasks, config?.statuses ?? []).find(
						(column) => !activeStatus || column.status === activeStatus,
					)?.tasks[0]
				: visibleTasks.find(matchesStatus);
		// A selected group owns the workspace selection: never fall back to a task row.
		const groupSelected =
			this.#view === "workspace" &&
			this.#selectedGroupId !== undefined &&
			findGroup(this.#groupState.groups, this.#selectedGroupId) !== undefined;
		const selectedTask = groupSelected ? undefined : (persistedTask ?? fallbackTask);
		const selectedTaskIndex = selectedTask ? visibleTasks.indexOf(selectedTask) : -1;
		const taskSessions = await this.#taskSessions(visibleTasks, selectedTask);
		await this.#refreshObservedSessions();
		const sessions = selectedTask ? taskSessions.get(selectedTask.id) : undefined;
		let selectedModeId: string | undefined;
		const modeProjectionByTask = new Map<string, { modeLabel: string; approved: boolean; modeColor?: string }>();
		let activeAgentSession = sessions?.sessions.find((session) => session.id === sessions.activeSessionId);
		let activeAgentSnapshot = activeAgentSession ? this.#sessionSnapshots.get(activeAgentSession.id) : undefined;
		const modeActiveSessions = new Map<string, AgentSession>();
		const modeHistories = new Map<string, TaskSessions>();
		if (this.#view === "workspace") {
			const catalog = await loadProjectModeCatalog(this.#core);
			this.#modeCatalog = catalog;
			if (selectedTask) {
				selectedModeId = selectedModeForTask(state, selectedTask.id, catalog);
				const modeSessions = await this.#workspaceState.listModeSessions(selectedTask.id, selectedModeId);
				modeHistories.set(selectedTask.id, modeSessions);
				const localId = this.#localSelections.get(`${selectedTask.id}\u0000${selectedModeId}`);
				// Prefer the mode's active session, then the local picker choice, then its most recently used history.
				activeAgentSession =
					modeSessions.sessions.find((session) => session.id === modeSessions.activeSessionId) ??
					(localId ? modeSessions.sessions.find((session) => session.id === localId) : undefined) ??
					[...modeSessions.sessions].sort((a, b) =>
						(b.lastUsedAt ?? b.createdAt).localeCompare(a.lastUsedAt ?? a.createdAt),
					)[0];
				activeAgentSnapshot = activeAgentSession ? this.#sessionSnapshots.get(activeAgentSession.id) : undefined;
				const active = modeSessions.sessions.find((session) => session.id === modeSessions.activeSessionId);
				if (active) modeActiveSessions.set(selectedTask.id, active);
			}
			let cursor = 0;
			const projectTask = async (task: Task): Promise<void> => {
				const modeId = selectedModeForTask(state, task.id, catalog);
				let modeSessions = modeHistories.get(task.id);
				if (!modeSessions) {
					modeSessions = await this.#workspaceState.listModeSessions(task.id, modeId);
					modeHistories.set(task.id, modeSessions);
				}
				const active = modeSessions.sessions.find((session) => session.id === modeSessions.activeSessionId);
				if (active) modeActiveSessions.set(task.id, active);
				const profile = catalog.profiles[modeId];
				if (!profile) return;
				modeProjectionByTask.set(task.id, {
					modeLabel: profile.name,
					approved: false,
					modeColor: effectiveModeTextColor(profile, modeId),
				});
			};
			await Promise.all(
				Array.from({ length: Math.min(4, visibleTasks.length) }, async () => {
					while (cursor < visibleTasks.length) {
						const task = visibleTasks[cursor++];
						if (task) await projectTask(task);
					}
				}),
			);
			this.#modeActiveSessions = modeActiveSessions;
		}
		if (selectedTask) {
			if (sessions?.sessions.length) this.#sessionTaskIds.add(selectedTask.id);
			else this.#sessionTaskIds.delete(selectedTask.id);
		}
		// The detail pane renders relationships (dependency graph, readiness) that resolve against
		// the whole corpus, including tasks hidden by the active filters, so a detail read is its own
		// corpus load rather than a projection of the visible list.
		const taskDetails = new Map<string, TaskDetail>();
		if (this.#view !== "board" && selectedTask) {
			taskDetails.set(selectedTask.id, await loadTaskDetail(this.#core, selectedTask));
		}
		return {
			tasks: visibleTasks,
			boardTasks,
			selectedTask,
			activeAgentSession,
			activeAgentSnapshot,
			selectedModeId,
			modeProjectionByTask,
			projectName: config?.projectName || undefined,
			filterSummary: summarizeFilters(state),
			detailsVisible: state.detailsVisible,
			selectedTaskIndex,
			config: config ?? null,
			taskDetails,
		};
	}

	async #refreshObservedSessions(): Promise<void> {
		const inventory = await this.#workspaceState.sessionApplication.projectInventory();
		this.#sessionSnapshots.clear();
		for (const { sessions } of inventory) {
			for (const { record, snapshot } of sessions) this.#sessionSnapshots.set(record.id, snapshot);
		}
	}

	/**
	 * Session state for one mount. The workspace view marks every visible task with its durable
	 * session dot, so it reads the project's session directory once; calling `listSessions` per task
	 * instead loads the whole task corpus again for every visible task. The board view shows one
	 * task, so it keeps the single-task read (and its friendlier error message).
	 */
	async #taskSessions(
		visibleTasks: readonly Task[],
		selectedTask: Task | undefined,
	): Promise<Map<string, TaskSessions>> {
		if (this.#view !== "workspace")
			return new Map(selectedTask ? [[selectedTask.id, await this.#workspaceState.listSessions(selectedTask.id)]] : []);
		const all = await this.#workspaceState.listAllSessions();
		this.#allSessions = all;
		return new Map(visibleTasks.map((task) => [task.id, all.get(task.id) ?? { taskId: task.id, sessions: [] }]));
	}

	/** Resume the selected mode's parked conversation; inspect and attach selected externally running sessions. */
	async #syncSelectedSession(state: SharedWorkspaceState, snapshot: WorkspaceSnapshot): Promise<WorkspaceSnapshot> {
		if (this.#closed || !this.#host || this.#view !== "workspace") return snapshot;
		const task = snapshot.selectedTask;
		const session = snapshot.activeAgentSession;
		const observed = snapshot.activeAgentSnapshot;
		const modeId = snapshot.selectedModeId;
		if (!task || !session || !modeId || !observed || observed.state === "starting" || observed.state === "stopped")
			return snapshot;
		if (this.#agents.has(session.id) || this.#startingTasks.has(task.id) || this.#attachingSessions.has(session.id))
			return snapshot;
		if (observed.state === "parked") return snapshot;
		if (observed.state !== "running") return snapshot;
		const catalog = this.#modeCatalog ?? (await loadProjectModeCatalog(this.#core));
		const selectedModeId = selectedModeForTask(state, task.id, catalog);
		if (selectedModeId !== modeId) return snapshot;
		let probe: ObservedSession | undefined;
		try {
			probe = await this.#workspaceState.sessionApplication.readObserved(task.id, session.id);
		} catch (error) {
			if (!this.#closed && this.#viewState?.current === state && this.#selectedTaskId === task.id)
				this.#notice = `Could not inspect agent session ${session.id}: ${error instanceof Error ? error.message : String(error)}`;
			return snapshot;
		}
		if (
			this.#closed ||
			!this.#host ||
			this.#viewState?.current !== state ||
			this.#selectedTaskId !== task.id ||
			selectedModeForTask(state, task.id, catalog) !== modeId
		)
			return snapshot;
		if (probe.snapshot.state !== "running" && probe.snapshot.state !== "parked") {
			return await this.#loadSnapshot(state);
		}
		this.#attachRunningSession(task.id, session);
		return snapshot;
	}

	/** Attach the native terminal to an already-running external pane without touching its lifecycle. */
	#attachRunningSession(taskId: string, session: AgentSession): void {
		const host = this.#host;
		if (!host || this.#closed || this.#attachingSessions.has(session.id)) return;
		this.#attachingSessions.add(session.id);
		const columns = Math.max(20, host.renderer.width);
		const rows = Math.max(5, host.renderer.height - 6);
		this.#launchSession(
			taskId,
			columns,
			rows,
			session.id,
			{ attachOnly: true },
			{
				sessions: this.#attachingSessions,
				starts: this.#attachStarts,
				notice: (message) => `Could not attach to ${session.id}: ${message}`,
				ignore: (message) =>
					message === `Task ${taskId} is no longer selected.` || message === "Workspace closed before agent launch.",
				onError: (message) => {
					// Surface the failure instead of retrying the attach on every refresh. Enter now retries
					// through the normal launch path, which may resume the exact conversation.
					this.#agents.set(session.id, { taskId, label: session.preset, status: "error", error: message });
					this.#agentAlive.delete(session.id);
					this.#forgetActivity(session.id);
					this.#activeAgents.set(taskId, session.id);
				},
			},
		);
	}

	#startTaskSession(
		taskId: string,
		columns: number,
		rows: number,
		options: {
			sessionId?: string;
			modeId?: string;
			focus?: boolean;
			rejectFailure?: boolean;
		} = {},
	): Promise<void> {
		const state = this.#viewState?.current;
		const catalog = this.#modeCatalog;
		if (!catalog) return Promise.resolve();
		const modeId = options.modeId ?? selectedModeForTask(state ?? {}, taskId, catalog);
		const launchKey = `${taskId}\u0000${modeId}`;
		const settleAutomaticResume = (message: string): void => {
			const sessionId = options.sessionId;
			if (!sessionId || options.rejectFailure || this.#agents.has(sessionId)) return;
			const session = this.#allSessions?.get(taskId)?.sessions.find((candidate) => candidate.id === sessionId);
			this.#agents.set(sessionId, {
				taskId,
				label: session?.preset ?? modeId,
				status: "error",
				error: message,
			});
			this.#activeAgents.set(taskId, sessionId);
		};
		if (this.#deletingTasks.has(taskId)) return Promise.resolve();
		if (
			this.#closed ||
			!this.#host ||
			this.#view !== "workspace" ||
			this.#selectedTaskId !== taskId ||
			this.#hasModal() ||
			this.#startingTaskModes.has(launchKey)
		)
			return Promise.resolve();
		this.#startingTasks.add(taskId);
		const startOwner = {};
		this.#startingTaskModes.set(launchKey, startOwner);
		void this.#scheduleRefresh();
		const start = (async () => {
			const catalog = await loadProjectModeCatalog(this.#core);
			const selectedModeId = state ? selectedModeForTask(state, taskId, catalog) : modeId;
			if (selectedModeId !== modeId) throw new Error(`Selected mode changed before launching ${taskId}.`);
			const sessionId = options.sessionId;
			const currentState = this.#viewState?.current;
			if (
				this.#closed ||
				this.#selectedTaskId !== taskId ||
				currentState !== state ||
				!currentState ||
				selectedModeForTask(currentState, taskId, catalog) !== modeId
			)
				return;
			const selectionKey = `${taskId}\u0000${modeId}`;
			if (sessionId === undefined) {
				const localId = this.#localSelections.get(selectionKey);
				const local = localId ? this.#agents.get(localId) : undefined;
				if (localId && local?.terminal && !local.terminal.isDestroyed) {
					this.#activeAgents.set(taskId, localId);
					this.#agentFocused = true;
					void this.#scheduleRefresh();
					return;
				}
			}
			const currentViewState = this.#viewState;
			if (
				this.#closed ||
				this.#selectedTaskId !== taskId ||
				currentViewState?.current !== state ||
				!currentViewState ||
				selectedModeForTask(currentViewState.current, taskId, catalog) !== modeId
			)
				return;
			const completed = await this.#launchAgent(taskId, columns, rows, sessionId, { modeId });
			if (!completed) return;
			// Enter focuses the embedded preview only once a usable terminal exists.
			// Read-only hosts still allow preview focus; the host owns input permissions.
			const activeSessionId = this.#localSelections.get(selectionKey);
			if (activeSessionId) {
				this.#localSelections.set(selectionKey, activeSessionId);
				this.#localSessionModes.set(activeSessionId, modeId);
			}
			if (
				options.focus &&
				!this.#closed &&
				this.#view === "workspace" &&
				this.#selectedTaskId === taskId &&
				!this.#hasModal() &&
				this.#viewState &&
				selectedModeForTask(this.#viewState.current, taskId, catalog) === modeId &&
				activeSessionId &&
				this.#agents.get(activeSessionId)?.terminal
			) {
				this.#agentFocused = true;
			}
		})()
			.catch(async (error: unknown) => {
				if (error instanceof ExactResumeUnavailableError && options.sessionId) {
					this.#notice = error.message;
					const confirmed = await this.#openConfirm(
						"Exact resume unavailable",
						`${error.message}\n\nStart a fresh conversation instead?`,
					);
					if (confirmed && !this.#closed && this.#selectedTaskId === taskId) {
						try {
							const completed = await this.#launchAgent(taskId, columns, rows, undefined, {
								modeId,
								newSession: true,
							});
							if (completed) this.#notice = undefined;
						} catch (freshError) {
							this.#notice = `Could not start a fresh conversation: ${String(freshError)}`;
							if (options.rejectFailure) throw freshError;
						}
						return;
					}
					settleAutomaticResume(error.message);
					if (options.rejectFailure) throw error;
					return;
				}
				this.#notice = `Could not start agent: ${String(error)}`;
				settleAutomaticResume(error instanceof Error ? error.message : String(error));
				if (options.rejectFailure) throw error;
			})
			.finally(() => {
				this.#agentStarts.delete(start);
				if (this.#startingTaskModes.get(launchKey) === startOwner) this.#startingTaskModes.delete(launchKey);
				if (![...this.#startingTaskModes.keys()].some((key) => key.startsWith(`${taskId}\u0000`)))
					this.#startingTasks.delete(taskId);
				if (!this.#closed) void this.#scheduleRefresh();
			});
		this.#agentStarts.add(start);
		return start;
	}

	/** Start the replacement first, then retire only an app-owned predecessor. */
	async #handoffLocalSession(taskId: string, modeId: string): Promise<void> {
		const key = `${taskId}\u0000${modeId}`;
		const id = this.#localSelections.get(key);
		if (this.#startingTaskModes.has(key)) return;
		const local = id ? this.#agents.get(id) : undefined;
		const startOwner = {};
		this.#startingTasks.add(taskId);
		this.#startingTaskModes.set(key, startOwner);
		let successorStarted = false;
		try {
			const history = await this.#workspaceState.listModeSessions(taskId, modeId);
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
				Math.max(20, this.#host?.renderer.width ?? 80),
				Math.max(5, (this.#host?.renderer.height ?? 24) - 6),
				undefined,
				{ modeId, newSession: true, handoff },
			);
			if (!started || this.#startingTaskModes.get(key) !== startOwner) {
				return;
			}
			successorStarted = true;
			if (id && local) {
				await local.hostOwner?.detachAndDestroy(local.terminal, this.#activityObserver.snapshot(id));
				local.terminal?.destroy();
				if (this.#agents.get(id) === local) this.#agents.delete(id);
				this.#agentAlive.delete(id);
				this.#forgetActivity(id);
				this.#localSessionModes.delete(id);
				if (this.#localSelections.get(key) === id) this.#localSelections.delete(key);
				if (this.#activeAgents.get(taskId) === id) this.#activeAgents.delete(taskId);
			}
		} catch (error) {
			this.#notice = successorStarted
				? `Successor is running, but predecessor cleanup failed: ${String(error)}`
				: `Could not start handoff session: ${String(error)}`;
		} finally {
			if (this.#startingTaskModes.get(key) === startOwner) this.#startingTaskModes.delete(key);
			if (![...this.#startingTaskModes.keys()].some((candidate) => candidate.startsWith(`${taskId}\u0000`)))
				this.#startingTasks.delete(taskId);
			if (!this.#closed) void this.#scheduleRefresh();
		}
	}

	#adoptSession(taskId: string, sessionId: string, width: number, height: number, modeId?: string): void {
		if (this.#closed || !this.#host || this.#view !== "workspace" || this.#adoptingSessions.has(sessionId)) return;
		this.#adoptingSessions.add(sessionId);
		const columns = Math.max(20, width);
		const rows = Math.max(5, height - 6);
		this.#launchSession(
			taskId,
			columns,
			rows,
			sessionId,
			{ adopt: true, modeId },
			{
				sessions: this.#adoptingSessions,
				starts: this.#agentStarts,
				notice: (message) => `Could not adopt agent request ${sessionId}: ${message}`,
				ignore: (message) => message === "Workspace closed before agent launch.",
			},
		);
	}

	#launchSession(
		taskId: string,
		columns: number,
		rows: number,
		sessionId: string,
		options: { attachOnly?: boolean; adopt?: boolean; modeId?: string },
		config: {
			sessions: Set<string>;
			starts: Set<Promise<void>>;
			notice: (message: string) => string;
			ignore: (message: string) => boolean;
			onError?: (message: string) => void;
		},
	): void {
		const launch = this.#launchAgent(taskId, columns, rows, sessionId, options)
			.then(() => undefined)
			.catch((error: unknown) => {
				if (this.#closed) return;
				const message = error instanceof Error ? error.message : String(error);
				if (config.ignore(message)) return;
				this.#notice = config.notice(message);
				config.onError?.(message);
			})
			.finally(() => {
				config.starts.delete(launch);
				config.sessions.delete(sessionId);
				if (!this.#closed) void this.#scheduleRefresh();
			});
		config.starts.add(launch);
	}

	/** Schedule the next marker poll; the delay tracks the activity cadence, capped at one second. */
	#scheduleRequestPoll(delayMs: number): void {
		if (this.#closed) return;
		clearTimeout(this.#requestTimer);
		this.#requestTimer = setTimeout(() => {
			this.#requestTimer = undefined;
			void this.#pollRequests();
		}, delayMs);
	}

	/**
	 * Adopt registered requests without waiting for user input.
	 */
	async #pollRequests(): Promise<void> {
		if (this.#closed || this.#requestPolling) return;
		this.#requestPolling = true;
		try {
			for (const request of await this.#workspaceState.sessionApplication.pendingRequests()) {
				if (this.#closed) return;
				await this.#adoptRequest(request);
			}
		} catch (error) {
			this.#notice = `Could not check pending session requests: ${error instanceof Error ? error.message : String(error)}`;
			if (!this.#closed) void this.#scheduleRefresh();
		} finally {
			this.#requestPolling = false;
			if (!this.#closed) this.#scheduleRequestPoll(Math.min(this.#activityInterval(), 1_000));
		}
	}

	/** Adopt one marker, or retire it when it is stale. Only a live request owned by this process launches. */
	async #adoptRequest(request: WorkspaceRequest): Promise<void> {
		const host = this.#host;
		if (this.#closed || !host || this.#view !== "workspace") return;
		if (this.#agents.has(request.sessionId) || this.#adoptingSessions.has(request.sessionId)) return;
		this.#adoptSession(request.taskId, request.sessionId, host.renderer.width, host.renderer.height);
	}

	#launchAgent(
		taskId: string,
		columns: number,
		rows: number,
		sessionId?: string,
		options: {
			attachOnly?: boolean;
			adopt?: boolean;
			modeId?: string;
			newSession?: boolean;
			handoff?: SessionHandoff;
		} = {},
	): Promise<AgentSession | false> {
		const launch: PendingAgentLaunch = { taskId, invalidated: false };
		this.#pendingAgentLaunches.add(launch);
		return this.#performAgentLaunch(taskId, columns, rows, sessionId, options, launch)
			.catch((error: unknown) => {
				if (launch.invalidated) return false as const;
				throw error;
			})
			.finally(() => {
				this.#pendingAgentLaunches.delete(launch);
			});
	}

	async #performAgentLaunch(
		taskId: string,
		columns: number,
		rows: number,
		sessionId: string | undefined,
		options: { attachOnly?: boolean; adopt?: boolean; modeId?: string; newSession?: boolean; handoff?: SessionHandoff },
		launch: PendingAgentLaunch,
	): Promise<AgentSession | false> {
		const attachOnly = options.attachOnly === true;
		let resolvedSessionId = sessionId;
		// Adoption launches a pending record for any task, not only the selected one; the pane is
		// retained in `#agents` and appears when the user selects its task.
		const adopt = options.adopt === true;
		if (!resolvedSessionId && !options.newSession && options.modeId) {
			const selected = this.#localSelections.get(`${taskId}\u0000${options.modeId}`);
			const retained = selected ? this.#agents.get(selected) : undefined;
			if (retained?.terminal && !retained.terminal.isDestroyed) resolvedSessionId = selected;
			else {
				const history = await this.#workspaceState.listModeSessions(taskId, options.modeId);
				resolvedSessionId = history.activeSessionId;
			}
		}
		if (
			launch.invalidated ||
			this.#closed ||
			this.#deletingTasks.has(taskId) ||
			!this.#host ||
			this.#view !== "workspace"
		)
			throw new Error(`Task ${taskId} is no longer selected.`);
		const retained = resolvedSessionId ? this.#agents.get(resolvedSessionId) : undefined;
		const alive = resolvedSessionId ? this.#agentAlive.get(resolvedSessionId) : undefined;
		if (retained?.origin && alive) {
			const retainedAlive = await alive();
			if (launch.invalidated || this.#deletingTasks.has(taskId)) return false;
			if (retainedAlive) {
				this.#activeAgents.set(taskId, resolvedSessionId as string);
				if (options.modeId) {
					this.#localSelections.set(`${taskId}\u0000${options.modeId}`, resolvedSessionId as string);
					this.#localSessionModes.set(resolvedSessionId as string, options.modeId);
				}
				return retained.origin.record;
			}
		}
		if (retained) {
			if (launch.invalidated || this.#deletingTasks.has(taskId)) return false;
			retained.status = "error";
			retained.error = "Agent stopped; select this session to resume its exact conversation.";
		}
		if (
			launch.invalidated ||
			this.#closed ||
			this.#deletingTasks.has(taskId) ||
			!this.#host ||
			this.#view !== "workspace"
		)
			throw new Error(`Task ${taskId} is no longer selected.`);
		const application = this.#workspaceState.sessionApplication;
		let observed: ObservedSession | undefined;
		if (resolvedSessionId) {
			observed = adopt
				? await application.adoptRequest(taskId, resolvedSessionId)
				: await application.readObserved(taskId, resolvedSessionId);
			const live =
				observed.snapshot.state === "running" ||
				observed.snapshot.state === "starting" ||
				observed.snapshot.state === "parked";
			if (!live && !adopt) {
				if (attachOnly) {
					// The pane is gone; report the truth instead of resuming or attaching a second parser.
					this.#notice = `Agent session ${resolvedSessionId} is no longer running.`;
					return false;
				}
				observed = await application.resumeSession(taskId, resolvedSessionId);
			}
		} else if (attachOnly) {
			this.#notice = `Agent session ${resolvedSessionId ?? "active"} is no longer running.`;
			return false;
		}
		if (this.#closed || !this.#host || this.#view !== "workspace")
			throw new Error(`Task ${taskId} is no longer selected.`);
		const localModeId =
			adopt && resolvedSessionId
				? ((await this.#workspaceState.findSessionMode(taskId, resolvedSessionId)) ?? options.modeId)
				: options.modeId;
		const selectionKey = localModeId ? `${taskId}\u0000${localModeId}` : undefined;
		const selectionAtAdmission = selectionKey ? this.#localSelections.get(selectionKey) : undefined;
		if (!observed) {
			if (!options.modeId) throw new Error("A mode is required when creating a session.");
			const predecessorId = options.handoff?.predecessor?.id ?? options.handoff?.priorActiveSessionId;
			observed =
				options.newSession && predecessorId
					? await application.handoff(taskId, predecessorId, options.modeId)
					: await application.newSession(taskId, options.modeId);
			await this.#followStartedTaskStatus(taskId, adopt);
		}
		if (launch.invalidated || this.#deletingTasks.has(taskId)) return false;
		const { record } = observed;
		const terminalAttachment: TerminalAttachment = await this.#sessionRuntime!.attach(record);
		const origin = { record: structuredClone(record), paneId: terminalAttachment.paneId };
		const session: RetainedWorkspaceAgent = { taskId, label: record.preset, status: "starting", origin };
		let startupError: Error | undefined;
		let owner: ReturnType<typeof createWorkspaceAgentHostOwner> | undefined;
		const onError = (error: Error): void => {
			startupError = error;
			if (this.#closed || launch.invalidated) return;
			this.#notice = `Agent ${session.label}: ${error.message}`;
			void this.#scheduleRefresh().catch(() => undefined);
		};
		const onOutput = (bytes: Uint8Array): void => {
			if (this.#closed || launch.invalidated || bytes.length === 0) return;
			// Native hosts and supervised reconnects tail the helper-owned append sink.
			session.terminal?.write(bytes);
			if (session.status === "starting") {
				session.status = "running";
				void this.#scheduleRefresh().catch(() => undefined);
			}
		};
		try {
			if (!this.#host && !this.#closed) throw new Error("Workspace host is unavailable.");
			owner = createWorkspaceAgentHostOwner(
				terminalAttachment,
				{ onOutput, onError },
				this.#runtime.createExistingAgentHost,
				async () => await this.#sessionRuntime!.detach(terminalAttachment),
				() => this.#workspaceState.sessionApplication.stopSession(taskId, record.id),
				() => this.#forgetActivity(record.id),
			);
			const host = owner.host;
			const isAlive = () => host.alive();
			const probeTarget: AgentActivityTarget = {
				taskId,
				bootstrap: terminalAttachment.bootstrap,
				statusDir: sessionActivityDir(dirname(record.outputPath), record.id),
				attached: true,
				supervised: false,
				createdAt: record.createdAt,
				exec: (argv) => terminalAttachment.exec.run(argv),
				target: terminalAttachment.paneId,
			};
			session.hostOwner = owner;
			session.host = owner.host;
			launch.agent = session;
			if (this.#host)
				session.terminal = this.#runtime.createWorkspaceAgent(
					this.#host.renderer,
					session.host,
					columns,
					rows,
					onError,
				);
			await session.host.start();
			if (launch.invalidated || this.#deletingTasks.has(taskId)) {
				await owner?.detachAndDestroy(session.terminal);
				return false;
			}
			await session.host.resize?.(columns, rows);
			if (startupError) throw startupError;
			if (launch.invalidated || this.#deletingTasks.has(taskId)) {
				await owner?.detachAndDestroy(session.terminal);
				return false;
			}
			if (this.#closed && host.detach) {
				// The close lane awaits launches before releasing them; do not roll back work already started.
				session.terminal?.destroy();
				this.#agents.set(record.id, session);
				return record;
			}
			if (this.#closed || this.#view !== "workspace") throw new Error(`Task ${taskId} is no longer selected.`);
			if (!attachOnly && !adopt) await this.#followStartedTaskStatus(taskId, adopt);
			this.#agents.set(record.id, session);
			this.#readOnlyAttachments.delete(record.id);
			this.#agentAlive.set(record.id, isAlive);
			retained?.terminal?.destroy();
			const modePairRaced = Boolean(
				adopt &&
					selectionKey &&
					(this.#startingTaskModes.has(selectionKey) ||
						this.#localSelections.get(selectionKey) !== selectionAtAdmission),
			);
			if (!modePairRaced) this.#activeAgents.set(taskId, record.id);
			if (localModeId && !modePairRaced) {
				this.#localSelections.set(`${taskId}\u0000${localModeId}`, record.id);
				this.#localSessionModes.set(record.id, localModeId);
			}
			if (probeTarget) this.#trackActivityTarget(record.id, probeTarget);
			return record;
		} catch (error) {
			this.#forgetActivity(record.id);
			try {
				await owner?.detachAndDestroy(session.terminal);
			} catch {
				// detach can throw; the terminal must still be destroyed, as before.
				session.terminal?.destroy();
			}
			if (launch.invalidated) return false;
			throw error;
		}
	}

	async #openSessionPicker(taskId: string): Promise<void> {
		if (
			this.#closed ||
			!this.#host ||
			this.#hasModal() ||
			this.#view !== "workspace" ||
			this.#selectedTaskId !== taskId
		)
			return;
		const request = ++this.#sessionPickerRequest;
		this.#sessionPickerLoading = true;
		try {
			const state = this.#viewState?.current;
			const catalog = await loadProjectModeCatalog(this.#core);
			const modeId = state ? selectedModeForTask(state, taskId, catalog) : catalog.defaultModeId;
			const sessions = await this.#workspaceState.listModeSessions(taskId, modeId);
			if (
				this.#closed ||
				!this.#host ||
				this.#view !== "workspace" ||
				this.#selectedTaskId !== taskId ||
				request !== this.#sessionPickerRequest ||
				this.#viewState?.current !== state ||
				!state ||
				selectedModeForTask(state, taskId, catalog) !== modeId
			)
				return;
			this.#sessionPicker = this.#runtime.mountSessionPicker(this.#host.renderer, this.#host.root, {
				taskId,
				sessions: sessions.sessions,
				snapshots: this.#sessionSnapshots,
				activeSessionId: sessions.activeSessionId,
				localSessionIds: new Set(
					[...this.#agents.entries()]
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
					const agent = this.#agents.get(id);
					if (!agent?.terminal || agent.terminal.isDestroyed) {
						const session = sessions.sessions.find((candidate) => candidate.id === id);
						if (session)
							void this.#workspaceState.sessionApplication.readObserved(taskId, id).then((observed) => {
								if (observed.snapshot.state === "running") this.#attachRunningSession(taskId, session);
							});
						return;
					}
					this.#localSelections.set(`${taskId}\u0000${modeId}`, id);
					this.#activeAgents.set(taskId, id);
					this.#agentFocused = true;
					void this.#scheduleRefresh();
				},
				onResume: async (id) => {
					if (
						this.#closed ||
						!this.#host ||
						this.#view !== "workspace" ||
						this.#selectedTaskId !== taskId ||
						request !== this.#sessionPickerRequest ||
						this.#viewState?.current !== state ||
						!state ||
						selectedModeForTask(state, taskId, catalog) !== modeId
					)
						throw new Error(`Task ${taskId} is no longer selected.`);
					const picker = this.#sessionPicker;
					this.#sessionPicker = undefined;
					try {
						await this.#startTaskSession(
							taskId,
							Math.max(20, this.#host.renderer.width),
							Math.max(5, this.#host.renderer.height - 6),
							{ sessionId: id, modeId, focus: true, rejectFailure: true },
						);
					} catch (error) {
						if (!this.#closed && request === this.#sessionPickerRequest) this.#sessionPicker = picker;
						throw error;
					}
				},
				onDelete: async (id) => {
					if (
						this.#closed ||
						!this.#host ||
						this.#view !== "workspace" ||
						this.#selectedTaskId !== taskId ||
						request !== this.#sessionPickerRequest ||
						this.#viewState?.current !== state ||
						!state ||
						selectedModeForTask(state, taskId, catalog) !== modeId
					)
						throw new Error(`Task ${taskId} is no longer selected.`);
					await this.#workspaceState.sessionApplication.deleteSession(taskId, id, { force: true });
					const agent = this.#agents.get(id);
					if (agent) {
						agent.terminal?.destroy();
						this.#agents.delete(id);
					}
					this.#agentAlive.delete(id);
					this.#forgetActivity(id);
					if (this.#activeAgents.get(taskId) === id) this.#activeAgents.delete(taskId);
					if (this.#localSelections.get(`${taskId}\u0000${modeId}`) === id)
						this.#localSelections.delete(`${taskId}\u0000${modeId}`);
					this.#localSessionModes.delete(id);
					if (!this.#closed) void this.#scheduleRefresh();
				},
				onClose: () => {
					if (request !== this.#sessionPickerRequest) return;
					this.#sessionPicker = undefined;
					if (!this.#closed) void this.#scheduleRefresh();
				},
			});
		} catch (error) {
			this.#notice = `Could not list sessions: ${String(error)}`;
		} finally {
			if (request === this.#sessionPickerRequest) this.#sessionPickerLoading = false;
			if (!this.#closed && !this.#sessionPicker) void this.#scheduleRefresh();
		}
	}

	async #stopAgents(): Promise<void> {
		await Promise.allSettled([...this.#agentStarts, ...this.#attachStarts]);
		const results = await Promise.allSettled(
			[...this.#agents.entries()].map(async ([id, session]) => {
				if (session.host?.detach) await session.host.detach(this.#activityObserver.snapshot(id));
				else await session.host?.stop();
				this.#activityObserver.clear(id);
			}),
		);
		this.#agents.clear();
		this.#readOnlyAttachments.clear();
		for (const result of results) {
			if (result.status === "rejected") {
				process.stderr.write(`Could not stop workspace agent: ${String(result.reason)}\n`);
			}
		}
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

	/** Follow the selected task's active-work status tab after the service starts or resumes it. */
	async #followStartedTaskStatus(taskId: string, adopt: boolean): Promise<void> {
		const task = await this.#core.loadTaskForMutation(taskId);
		if (!task || isTerminalStatus(task.status, this.#config?.statuses ?? [])) return;
		this.#followActivationStatus(taskId, task.status, adopt);
	}

	/**
	 * A session started from the workspace moves its task into the configured active-work status
	 * (the service performs the write). Because that task is the selected one, follow the status tab
	 * to it so the same task stays visible and selected. Adopted requests for other tasks never steal
	 * the view, and an attach (passive) never reaches here.
	 */
	#followActivationStatus(taskId: string, activeStatus: string | undefined, adopt: boolean): void {
		if (adopt || !activeStatus || this.#selectedTaskId !== taskId) return;
		if (this.#selectedTaskId === taskId && this.#viewState?.current.activeStatus === activeStatus) return;
		this.#selectedTaskId = taskId;
		this.#taskFirstVisible = 0;
		this.#agentFocused = false;
		this.#rememberNavigation({ activeStatus, selectedTaskId: taskId });
		void this.#persistState((state) => ({ ...state, activeStatus, selectedTaskId: taskId }), { selection: true });
	}

	#selectTask(taskId: string): void {
		if (!this.#tasks.has(taskId) || this.#selectedTaskId === taskId) return;
		this.#agentFocused = false;
		this.#selectedTaskId = taskId;
		this.#selectedGroupId = undefined;
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
		const order = catalog.order.filter((modeId) => catalog.profiles[modeId]);
		if (order.length < 2 || this.#closed || this.#selectedTaskId !== taskId || this.#viewState !== store) return;
		await this.#persisting.catch(() => undefined);
		if (this.#closed || this.#selectedTaskId !== taskId || this.#viewState !== store) return;
		const current = selectedModeForTask(store.current, taskId, catalog);
		const index = order.indexOf(current);
		const next = order[(index + 1 + order.length) % order.length];
		if (!next) return;
		await this.#persistState(
			(state) => ({
				...state,
				selectedModeByTask: { ...state.selectedModeByTask, [taskId]: next },
			}),
			{ selection: true },
		);
		if (!this.#closed && this.#selectedTaskId === taskId) void this.#scheduleRefresh();
	}

	#selectGroup(groupId: string): void {
		if (!findGroup(this.#groupState.groups, groupId) || this.#selectedGroupId === groupId) return;
		this.#agentFocused = false;
		this.#selectedGroupId = groupId;
		this.#selectedTaskId = undefined;
		this.#rememberNavigation({ selectedTaskId: undefined });
		void this.#persistState((state) => ({ ...state, selectedGroupId: groupId, selectedTaskId: undefined }));
	}

	async #toggleGroup(groupId: string, direction: "expand" | "collapse"): Promise<void> {
		const store = this.#groupStore;
		const group = findGroup(this.#groupState.groups, groupId);
		if (!store || !group) return;
		const descendants = collectDescendantGroupIds(this.#groupState.groups, groupId);
		const expand = direction === "expand";
		const alreadyAtTarget = expand ? !group.collapsed : group.collapsed;
		const ids = alreadyAtTarget ? [groupId, ...descendants] : [groupId];
		await store.update((state) => ({ ...state, groups: setCollapsed(state.groups, ids, !expand) }));
		this.#groupState = store.current;
		void this.#scheduleRefresh();
	}

	#handleGroupActionError(error: unknown): void {
		this.#notice = error instanceof Error ? error.message : String(error);
		void this.#scheduleRefresh().catch(() => undefined);
	}

	async #deleteGroup(groupId: string): Promise<void> {
		const group = findGroup(this.#groupState.groups, groupId);
		const host = this.#host;
		const store = this.#groupStore;
		if (!group || this.#closed || !host || !store) return;

		const directTaskIds = Object.entries(this.#groupState.membership)
			.filter(([, membershipGroupId]) => membershipGroupId === groupId)
			.map(([taskId]) => taskId);
		const directChildIds = new Set(
			this.#groupState.groups.filter((candidate) => candidate.parentId === groupId).map((candidate) => candidate.id),
		);

		const removeGroup = async (destinationGroupId: string | null): Promise<void> => {
			await store.update((state) => {
				const membership = { ...state.membership };
				for (const taskId of directTaskIds) {
					if (destinationGroupId === null) delete membership[taskId];
					else membership[taskId] = destinationGroupId;
				}
				return {
					...state,
					membership,
					groups: state.groups
						.filter((candidate) => candidate.id !== groupId)
						.map((candidate) =>
							directChildIds.has(candidate.id) ? { ...candidate, parentId: destinationGroupId } : candidate,
						),
				};
			});
			this.#groupState = store.current;
			if (this.#selectedGroupId === groupId) this.#selectedGroupId = undefined;
			this.#notice = `Deleted group ${group.name}`;
			void this.#scheduleRefresh();
		};

		if (directTaskIds.length === 0 && directChildIds.size === 0) {
			const confirmed = await this.#openConfirm(
				"Delete group",
				`Permanently delete group ${group.name}?\nThis cannot be undone.`,
			);
			if (confirmed && !this.#closed) await removeGroup(null);
			return;
		}

		const descendants = new Set(collectDescendantGroupIds(this.#groupState.groups, groupId));
		const destinationOptions = this.#groupOptions().filter(
			(option) => option.value !== groupId && !descendants.has(option.value),
		);
		let modal: OpenTuiGroupDeleteModalMount;
		modal = this.#runtime.mountGroupDelete(host.renderer, host.root, {
			groupId,
			groupName: group.name,
			taskCount: directTaskIds.length,
			childGroupCount: directChildIds.size,
			destinationOptions,
			defaultDestinationId: group.parentId,
			onConfirm: async (destinationGroupId) => {
				await removeGroup(destinationGroupId);
				if (this.#groupDeleteModal === modal) this.#groupDeleteModal = undefined;
			},
			onCancel: () => {
				if (this.#groupDeleteModal === modal) this.#groupDeleteModal = undefined;
				void this.#scheduleRefresh();
			},
		});
		this.#groupDeleteModal = modal;
	}

	#groupParentContext(): TaskGroup | null {
		if (this.#selectedGroupId) {
			const group = findGroup(this.#groupState.groups, this.#selectedGroupId);
			if (group) return group;
		}
		if (this.#selectedTaskId) {
			const groupId = this.#groupState.membership[this.#selectedTaskId];
			const group = groupId ? findGroup(this.#groupState.groups, groupId) : undefined;
			if (group) return group;
		}
		return null;
	}

	async #openGroupComposer(): Promise<void> {
		const host = this.#host;
		const store = this.#groupStore;
		if (!host || !store || this.#closed || this.#hasModal()) return;
		const parent = this.#groupParentContext();
		const modal = mountOpenTuiGroupModal(host.renderer, host.root, {
			defaultRoot: parent === null,
			parentGroupId: parent?.id ?? null,
			parentGroupName: parent?.name,
			onCreate: async ({ name, parentGroupId }) => {
				const order = this.#groupState.groups.filter((g) => g.parentId === parentGroupId).length;
				await store.update((state) => ({
					...state,
					groups: [
						...state.groups,
						{ id: `grp-${randomUUID().slice(0, 8)}`, name, parentId: parentGroupId, order, collapsed: false },
					],
				}));
				this.#groupState = store.current;
				if (this.#groupModal === modal) this.#groupModal = undefined;
				this.#notice = `Created group ${name}`;
				void this.#scheduleRefresh();
			},
			onCancel: () => {
				if (this.#groupModal === modal) this.#groupModal = undefined;
				void this.#scheduleRefresh();
			},
		});
		this.#groupModal = modal;
	}

	#setDetailsVisible(detailsVisible: boolean): void {
		void this.#persistState((state) => ({ ...state, detailsVisible }));
	}

	#showBoard(): void {
		if (this.#view === "board") return;
		const selected = this.#selectedTaskId ? this.#tasks.get(this.#selectedTaskId) : undefined;
		if (selected) this.#board?.select(selected.status, selected.id);
		this.#view = "board";
		this.#taskFirstVisible = 0;
		this.#rememberNavigation({ view: "board" });
		void this.#scheduleRefresh();
	}

	#showWorkspace(task: Task | undefined): void {
		if (task?.id !== this.#selectedTaskId) this.#agentFocused = false;
		if (task) this.#selectedTaskId = task.id;
		if (this.#view !== "workspace" || task) this.#taskFirstVisible = 0;
		this.#view = "workspace";
		this.#rememberNavigation({
			view: "workspace",
			...(task ? { selectedTaskId: task.id, activeStatus: task.status } : {}),
		});
		void this.#persistState(
			(state) => ({
				...state,
				...(task ? { selectedTaskId: task.id, activeStatus: task.status } : {}),
			}),
			{ selection: task !== undefined },
		);
		void this.#scheduleRefresh();
	}

	async #openTaskComposer(): Promise<void> {
		const host = this.#host;
		if (!host || this.#closed || this.#hasModal()) return;
		this.#configurationLoading = true;
		try {
			const resolved = await resolveAgentConfiguration(this.#core);
			if (this.#closed || this.#host !== host) return;
			const parent = this.#groupParentContext();
			const composer = mountOpenTuiTaskComposer(host.renderer, host.root, {
				statuses: this.#config?.statuses ?? [],
				types: this.#config?.types,
				priorities: this.#config?.priorities,
				agentConfiguration: resolved.config,
				defaultGroupId: parent?.id ?? null,
				defaultGroupName: parent?.name,
				persist: (input, context) => this.#createTask(input, context.groupId),
			});
			this.#taskComposer = composer;
			void composer.result.then(() => {
				if (this.#taskComposer === composer) this.#taskComposer = undefined;
				void this.#scheduleRefresh();
			});
		} catch (error) {
			this.#notice = `Could not open task composer: ${String(error)}`;
		} finally {
			this.#configurationLoading = false;
			if (!this.#closed && !this.#taskComposer) void this.#scheduleRefresh();
		}
	}

	async #createTask(input: TaskCreateInput, groupId: string | null = null): Promise<Task> {
		try {
			const { task } = await this.#core.createTaskFromInput(input);
			if (groupId && this.#groupStore) {
				await this.#groupStore.update((state) => ({
					...state,
					membership: { ...state.membership, [task.id]: groupId },
				}));
				this.#groupState = this.#groupStore.current;
			}
			this.#selectedTaskId = task.id;
			await this.#persistState((state) => ({ ...state, selectedTaskId: task.id, activeStatus: task.status }), {
				selection: true,
			});
			this.#notice = `Created ${task.id}`;
			return task;
		} catch (error) {
			this.#notice = `Could not create task: ${error instanceof Error ? error.message : "Unknown error"}`;
			throw error;
		}
	}

	#openTaskEditor(taskId: string): void {
		const host = this.#host;
		const task = this.#tasks.get(taskId);
		if (!host || !task || this.#closed || this.#hasModal()) return;
		const draft = createWorkspaceDraft(task);
		const groupOptions = this.#groupOptions();
		const currentGroupId = this.#groupState.membership[task.id] ?? "";
		let editor: { dispose(): void } | undefined;
		editor = mountTaskForm(host.renderer, host.root, {
			title: `Edit ${task.id}`,
			fields: editorFields(draft, this.#config, groupOptions, currentGroupId),
			submitLabel: "save",
			onSubmit: async (values: TaskEditorFormValues) => {
				const { group, ...textValues } = values;
				await this.#saveTaskFields(task.id, draft, textValues as WorkspaceEditorValues);
				await this.#setTaskGroup(task.id, group || null);
				if (this.#taskEditor === editor) this.#taskEditor = undefined;
				void this.#scheduleRefresh();
			},
			onCancel: () => {
				if (this.#taskEditor === editor) this.#taskEditor = undefined;
				void this.#scheduleRefresh();
			},
		});
		this.#taskEditor = editor;
	}

	async #saveTaskFields(taskId: string, draft: WorkspaceDraft, values: WorkspaceEditorValues): Promise<void> {
		try {
			const latest = await this.#core.getTask(taskId);
			if (!latest) throw new Error(`Task ${taskId} no longer exists.`);
			const submitted: WorkspaceDraft = { ...draft, values: { ...draft.values, ...values } };
			const changes = changedTaskFields(submitted, latest);
			const inputTyped: TaskUpdateInput = changes;
			if (Object.keys(inputTyped).length === 0) {
				this.#notice = "No task fields changed.";
				return;
			}
			await this.#core.updateTaskFromInput(taskId, inputTyped, {});
			this.#notice = `Saved ${taskId}`;
		} catch (error) {
			this.#notice = `Could not save task: ${error instanceof Error ? error.message : "Unknown error"}`;
			throw error;
		} finally {
			void this.#scheduleRefresh();
		}
	}

	async #setTaskGroup(taskId: string, groupId: string | null): Promise<void> {
		const store = this.#groupStore;
		if (!store) return;
		await store.update((state) => {
			if (groupId === null) {
				if (!(taskId in state.membership)) return state;
				const { [taskId]: _removed, ...membership } = state.membership;
				return { ...state, membership };
			}
			if (state.membership[taskId] === groupId) return state;
			return { ...state, membership: { ...state.membership, [taskId]: groupId } };
		});
		this.#groupState = store.current;
	}

	#groupOptions(): { label: string; value: string }[] {
		const children = new Map<string, TaskGroup[]>();
		const roots: TaskGroup[] = [];
		for (const group of this.#groupState.groups) {
			const parent = group.parentId === null ? undefined : findGroup(this.#groupState.groups, group.parentId);
			if (!parent) {
				roots.push(group);
				continue;
			}
			const siblings = children.get(parent.id);
			if (siblings) siblings.push(group);
			else children.set(parent.id, [group]);
		}
		const compare = (a: TaskGroup, b: TaskGroup): number => {
			if (a.order !== b.order) return a.order - b.order;
			const byName = a.name.localeCompare(b.name);
			return byName !== 0 ? byName : a.id.localeCompare(b.id);
		};
		roots.sort(compare);
		const options: { label: string; value: string }[] = [];
		const seen = new Set<string>();
		const visit = (group: TaskGroup, depth: number): void => {
			if (seen.has(group.id)) return;
			seen.add(group.id);
			options.push({ label: `${"  ".repeat(depth)}${group.name}`, value: group.id });
			for (const child of [...(children.get(group.id) ?? [])].sort(compare)) visit(child, depth + 1);
		};
		for (const root of roots) visit(root, 0);
		return options;
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
				this.#taskFirstVisible = 0;
				this.#rememberNavigation({ filters: nextFilters, selectedTaskId });
				void this.#persistState((state) => ({ ...state, filters: nextFilters, selectedTaskId }), { selection: true });
			},
			onCancel: () => {
				if (this.#filterEditor === filter) this.#filterEditor = undefined;
				void this.#scheduleRefresh();
			},
		});
		this.#filterEditor = filter;
	}

	async #openAgentSettings(): Promise<void> {
		const host = this.#host;
		if (!host || this.#closed || this.#hasModal()) return;
		this.#configurationLoading = true;
		try {
			const configuration = await getEditableAgentConfiguration(this.#core, "project");
			if (this.#closed || this.#host !== host) return;
			const historicalModeCounts: Record<string, number> = {};
			const availablePresets = { ...configuration.presets };
			const saveConfiguration = async (next: typeof configuration): Promise<void> => {
				await this.#core.patchAgentConfiguration("project", next);
				this.#notice = "Saved project agent settings";
			};
			const settings = mountOpenTuiAgentSettings(host.renderer, host.root, {
				configuration: {
					...configuration,
					presets: availablePresets,
				},
				profilePermissionSupport: (profile) => {
					const selectedPreset = configuration.selectedPreset
						? availablePresets[configuration.selectedPreset]
						: undefined;
					return selectedPreset
						? profilePermissionSupport(selectedPreset.bootstrap, profile)
						: { native: [], instructionBased: ["repository/task/artifact path scope", "subagent policy"] };
				},
				onSave: saveConfiguration,
				discoverModeModels: async ({ preset: presetName }) => {
					const preset = availablePresets[presetName];
					if (!preset) throw new Error(`Unknown project preset: ${presetName}`);
					const effectiveEnv: Record<string, string> = {};
					for (const [name, value] of Object.entries(process.env)) {
						if (value !== undefined) effectiveEnv[name] = value;
					}
					Object.assign(effectiveEnv, preset.env);
					const discoveryPreset = await resolveLaunchPreset(preset, {
						cwd: this.#core.projectRoot,
						env: effectiveEnv,
					});
					const adapter = harnessRegistry.forPreset(discoveryPreset.bootstrap);
					if (!adapter.discoverModels) return [];
					const found = await adapter.discoverModels({
						command: discoveryPreset.command,
						env: { ...effectiveEnv, ...discoveryPreset.env },
						timeoutMs: 5_000,
					});
					return found.map((model) => ({ id: model.id, label: model.name }));
				},
				onSaveModeSettings: async ({ configuration: next, deletedModeIds }) => {
					const confirmedDeletions: string[] = [];
					for (const modeId of deletedModeIds) {
						const confirmed = await this.#openConfirm(
							"Delete mode",
							`Delete ${modeId}? Discarding stops agents and removes their session history. Moving keeps sessions and execution alive in the chosen mode.`,
						);
						if (!confirmed) throw new Error("Mode deletion cancelled.");
						confirmedDeletions.push(modeId);
					}
					if (confirmedDeletions.length === 0) {
						await saveConfiguration(next);
						return;
					}
					const catalog = next.modes;
					if (!catalog) throw new Error("Mode catalog is unavailable.");
					const deleted = new Set(confirmedDeletions);
					const order = catalog.order.filter((modeId) => !deleted.has(modeId));
					if (order.length === 0) throw new Error("Cannot delete the last configured mode.");
					const completedDeletions: string[] = [];
					try {
						for (const modeId of confirmedDeletions) {
							const deletedMode = await deleteModeFromChoice(
								modeId,
								async () => await this.#chooseModeDeletionDestination(modeId, order),
								async (id, options) => await this.#core.deleteMode(id, options),
							);
							if (!deletedMode) throw new Error("Mode deletion cancelled.");
							completedDeletions.push(modeId);
						}
					} catch (cause) {
						if (completedDeletions.length === 0) throw cause;
						throw new AggregateError(
							[cause],
							`Mode settings save failed after deleting modes: ${completedDeletions.join(", ")}.`,
							{
								cause,
							},
						);
					}
					const { ...profiles } = catalog.profiles;
					for (const modeId of deleted) delete profiles[modeId];
					try {
						await saveConfiguration({
							...next,
							modes: {
								...catalog,
								order,
								profiles,
								defaultModeId: deleted.has(catalog.defaultModeId) ? order[0]! : catalog.defaultModeId,
							},
						});
					} catch (cause) {
						throw new AggregateError(
							[cause],
							`Mode settings save failed after deleting modes: ${completedDeletions.join(", ")}.`,
							{ cause },
						);
					}
				},
				modeSessionCounts: historicalModeCounts,
				onClose: () => {
					if (this.#agentSettings === settings) this.#agentSettings = undefined;
					if (!this.#closed) void this.#scheduleRefresh();
				},
			});
			this.#agentSettings = settings;
		} catch (error) {
			this.#notice = `Could not open settings: ${String(error)}`;
		} finally {
			this.#configurationLoading = false;
			if (!this.#closed && !this.#agentSettings) void this.#scheduleRefresh();
		}
	}

	#helpItems(): ReturnType<typeof shortcutHelpItems> {
		const items = shortcutHelpItems(this.#view);
		if (this.#view !== "workspace") return items;
		const task = this.#selectedTaskId ? this.#tasks.get(this.#selectedTaskId) : undefined;
		if (!task || !isTerminalStatus(task.status, this.#config?.statuses ?? [])) return items;
		return items.filter((item) => item.shortcut.id !== "workspace.markDone");
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

	async #handleTaskAction(taskId: string, action: OpenTuiWorkspaceTaskAction): Promise<void> {
		if (action === "edit") {
			this.#openTaskEditor(taskId);
			return;
		}
		try {
			const task = await this.#core.getTask(taskId);
			if (!task) {
				this.#notice = `Task ${taskId} no longer exists.`;
				return;
			}
			if (action === "copy") {
				this.#notice = (await copyToClipboard(task.id)) ? `Copied ${task.id}` : `Could not copy ${task.id}`;
				return;
			}
			if (action === "done") {
				const result = await this.#core.markTaskDone(task.id);
				this.#notice = result.changed
					? `Moved ${task.id} to ${result.task.status}`
					: `Task ${task.id} is already done.`;
				return;
			}
			if (action === "delete") {
				this.#notice = await this.#deleteTask(task);
				return;
			}
			const outcome = await runTaskLifecycleAction(this.#core, task, action);
			this.#notice = outcome.message;
		} catch (error) {
			this.#notice = `Could not ${action} ${taskId}: ${error instanceof Error ? error.message : "Unknown error"}`;
		} finally {
			void this.#scheduleRefresh();
		}
	}

	async #deleteTask(task: Task): Promise<string> {
		const confirmed = await this.#openConfirm(
			"Delete task",
			`Permanently delete ${task.id} - ${task.title}?\nThis cannot be undone.`,
		);
		if (!confirmed) return "Delete cancelled";
		this.#deletingTasks.add(task.id);
		try {
			const result = await this.#core.deleteTask(task.id, {});
			if (!result.success) return `Could not delete ${task.id}`;
			try {
				await this.#finalTaskRemoval(task.id);
			} catch (error) {
				return `Task ${task.id} was deleted, but workspace cleanup is incomplete: ${error instanceof Error ? error.message : String(error)}`;
			}
			try {
				await this.#setTaskGroup(task.id, null);
			} catch (error) {
				return `Task ${task.id} was deleted, but group cleanup is incomplete: ${error instanceof Error ? error.message : String(error)}`;
			}
			if (this.#selectedTaskId === task.id) this.#selectedTaskId = undefined;
			return `Deleted ${task.id}`;
		} finally {
			this.#deletingTasks.delete(task.id);
		}
	}

	/** Forget local observation and task-scoped view state without stopping shared execution. */
	async #finalTaskRemoval(taskId: string): Promise<void> {
		const pendingLaunches = [...this.#pendingAgentLaunches].filter((launch) => launch.taskId === taskId);
		for (const launch of pendingLaunches) launch.invalidated = true;
		await this.#persistState((state) => pruneSelectedModeForTask(state, taskId));
		for (const launch of pendingLaunches) {
			if (!launch.agent) continue;
			await launch.agent.hostOwner?.detachAndDestroy(
				launch.agent.terminal,
				this.#activityObserver.snapshot(launch.agent.origin?.record.id ?? ""),
			);
		}
		const sessions = [...this.#agents.entries()].filter(([, agent]) => agent.taskId === taskId);
		for (const [sessionId, agent] of sessions) {
			await agent.hostOwner?.detachAndDestroy(agent.terminal, this.#activityObserver.snapshot(sessionId));
			this.#agents.delete(sessionId);
			this.#agentAlive.delete(sessionId);
			this.#readOnlyAttachments.delete(sessionId);
			this.#localSessionModes.delete(sessionId);
			for (const [key, selectedId] of this.#localSelections)
				if (selectedId === sessionId) this.#localSelections.delete(key);
			this.#forgetActivity(sessionId);
		}
		this.#activeAgents.delete(taskId);
		this.#sessionTaskIds.delete(taskId);
		this.#startingTasks.delete(taskId);
		for (const key of this.#startingTaskModes.keys()) {
			if (key.startsWith(`${taskId}\u0000`)) this.#startingTaskModes.delete(key);
		}
	}

	async #openConfirm(title: string, message: string): Promise<boolean> {
		const host = this.#host;
		// Settings may request a destructive confirmation without closing first; mount above its overlay.
		const overSettings = this.#agentSettings !== undefined;
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

	async #chooseModeDeletionDestination(modeId: string, remainingModeIds: readonly string[]): Promise<string | null> {
		const host = this.#host;
		if (!host || this.#closed || !this.#agentSettings || remainingModeIds.length === 0) return null;
		const picker = mountModeDeletionPicker(host.renderer, host.root, { modeId, remainingModeIds });
		this.#modeDeletionForm = picker;
		try {
			return await picker.result;
		} finally {
			if (this.#modeDeletionForm === picker) this.#modeDeletionForm = undefined;
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

	async #persistMove(commit: BoardMoveCommit): Promise<void> {
		try {
			if (commit.kind === "move") {
				const result = await this.#core.moveTasksToStatus({
					taskIds: commit.taskIds,
					targetStatus: commit.targetStatus,
					orderedTaskIds: commit.orderedTaskIds,
				});
				this.#notice = result.failures.length
					? `Moved ${result.movedTasks.length} task(s); ${result.failures.length} failed`
					: `Moved ${result.movedTasks.length} task(s) to ${commit.targetStatus}`;
				return;
			}
			await this.#core.reorderTask({
				taskId: commit.taskIds[0] ?? "",
				targetStatus: commit.targetStatus,
				orderedTaskIds: commit.orderedTaskIds,
			});
			this.#notice = `Reordered task in ${commit.targetStatus}`;
		} catch (error) {
			this.#notice = `Could not move task: ${error instanceof Error ? error.message : "Unknown error"}`;
		} finally {
			void this.#scheduleRefresh();
		}
	}

	async #persistState(
		patch: (state: SharedWorkspaceState) => SharedWorkspaceState,
		options: { selection?: boolean } = {},
	): Promise<void> {
		const selection = options.selection === true;
		if (selection) this.#pendingSelectionWrites += 1;
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
				}
			});
		this.#persisting = write;
		try {
			await write;
		} finally {
			if (selection) this.#pendingSelectionWrites -= 1;
		}
	}

	async #quit(): Promise<void> {
		if (this.#closed || this.#confirm || this.#quitting) return;
		this.#quitting = true;
		const hasWorkingSessions = [...this.#sessionSnapshots.values()].some(
			(snapshot) => snapshot.state === "running" && snapshot.activity === "working",
		);
		try {
			await settleWorkspaceClose({
				hasWorkingSessions,
				confirm: () =>
					this.#openConfirm(
						"Running sessions",
						"Working sessions are still running. Yes: force close and stop all sessions. No: close while keeping execution alive; reopening will attach to the existing pane.",
					),
				settlePending: async () => {
					await Promise.allSettled([...this.#agentStarts, ...this.#attachStarts]);
				},
				shutdown: () => this.#workspaceState.sessionApplication.shutdown(),
				close: async () => {
					if (this.#closed) return;
					this.destroy();
					await this.#options.onQuit?.();
				},
			});
		} catch (error) {
			this.#quitting = false;
			this.#notice = `Could not close sessions: ${error instanceof Error ? error.message : String(error)}`;
			void this.#scheduleRefresh();
			return;
		}
	}
}
