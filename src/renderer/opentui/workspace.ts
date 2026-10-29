import {
	BoxRenderable,
	type CliRenderer,
	type EmbeddedTerminalRenderable,
	type KeyEvent,
	type PasteEvent,
	parseColor,
	TextAttributes,
	TextRenderable,
} from "@opentui/core";
import type { AgentIndication } from "../../model/session/types.ts";
import { statusComparisonKey } from "../../model/task/status.ts";
import type { TaskDetail } from "../../model/task/task-projection.ts";
import type { AgentHost } from "../../runtime/live/agent-host.ts";
import type { GroupMembership, TaskGroup } from "../../storage/group-store.ts";
import { buildGroupRows, findGroup, type GroupRow } from "./groups.ts";
import {
	createKeybindings,
	findShortcutConflict,
	formatShortcut,
	matchesShortcut,
	type ShortcutOverrides,
	shortcutKeyFromEvent,
	shortcutsConfig,
} from "./keybindings.ts";
import type { TaskArtifactViewApi } from "./task-artifact-view.ts";
import type { TaskDetailStyledOptions } from "./task-detail-content.ts";
import { mountWorkspaceDetails } from "./workspace-details.ts";
import { mountWorkspacePreview } from "./workspace-preview.ts";
import { mountWorkspaceTaskList } from "./workspace-task-list.ts";

const SELECTED_TASK_BACKGROUND = "#cbd5e1";
const SELECTED_TASK_FOREGROUND = "#111111";
const artifactViewShortcut = shortcutsConfig.workspace.openArtifacts;
const artifactCloseShortcut = shortcutsConfig.taskViewer.escape;

/** Keep catalog hues legible on either surface without tying mode identity to UI focus. */
function modeDisplayColor(color: string | undefined, selected = false): string | undefined {
	if (!color) return undefined;
	const rgb = (value: string): number[] => parseColor(value).toInts().slice(0, 3);
	const luminance = (channels: number[]): number =>
		channels.reduce((sum, channel, index) => {
			const value = channel / 255;
			return (
				sum +
				(value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][index] ?? 0)
			);
		}, 0);
	const surface = luminance(rgb(selected ? SELECTED_TASK_BACKGROUND : "#111111"));
	const original = rgb(color);
	for (let step = 0; step <= 100; step += 1) {
		const channels = original.map((channel) => Math.round(channel + (((selected ? 0 : 255) - channel) * step) / 100));
		const light = luminance(channels);
		if ((Math.max(light, surface) + 0.05) / (Math.min(light, surface) + 0.05) >= 4.5)
			return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
	}
	return selected ? SELECTED_TASK_FOREGROUND : "#ffffff";
}

export type OpenTuiWorkspaceTaskEntry = {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly description?: string;
	readonly labels?: readonly string[];
	readonly priority?: string;
	readonly done: boolean;
};

export type OpenTuiWorkspaceModeProjection = {
	readonly modeLabel: string;
	readonly approved: boolean;
	/** Effective color from the current project catalog, not a session launch snapshot. */
	readonly modeColor?: string;
};

/** Controller-provided presentation metadata; mode state is deliberately not read from task titles. */
export type OpenTuiWorkspaceModeProjectionByTask = (taskId: string) => OpenTuiWorkspaceModeProjection | undefined;

export type OpenTuiWorkspaceGroupEntry = { readonly id: string; readonly name: string };

export type OpenTuiWorkspaceGroupToggleDirection = "expand" | "collapse";

export type OpenTuiWorkspaceAgentSession = {
	readonly id: string;
	readonly status: string;
	readonly preset: string;
	readonly cwd?: string;
	readonly taskId?: string;
	readonly summary?: string;
};

export type OpenTuiWorkspaceLiveAgent = {
	readonly taskId: string;
	label: string;
	status: "starting" | "running" | "error";
	host?: AgentHost;
	terminal?: EmbeddedTerminalRenderable;
	error?: string;
};

export type OpenTuiWorkspaceTaskAction = "edit" | "copy" | "archive" | "done" | "delete";

export type OpenTuiWorkspaceCallbacks = {
	readonly onTaskSelect?: (entry: OpenTuiWorkspaceTaskEntry) => void;
	/** Reports the first visible task row of the active status pane so a remount keeps the window. */
	readonly onTaskScrollChange?: (firstVisibleTaskIndex: number) => void;
	readonly onFullscreenChange?: (fullscreen: boolean) => void;
	readonly onSessionRequest?: (entry: OpenTuiWorkspaceTaskEntry) => void;
	readonly onHandoffRequest?: (entry: OpenTuiWorkspaceTaskEntry) => void;
	readonly onSettingsRequest?: () => void;
	readonly onAgentConfigRequest?: (entry: OpenTuiWorkspaceTaskEntry) => void;
	readonly onHistoryBack?: () => void;
	readonly onHistoryForward?: () => void;
	readonly onSessionAction?: (entry: OpenTuiWorkspaceTaskEntry, columns: number, rows: number) => void;
	readonly onCycleMode?: () => void;
	readonly onToggleDetails?: (visible: boolean) => void;
	readonly onToggleTaskPane?: (visible: boolean) => void;
	readonly onAgentFocusChange?: (focused: boolean) => void;
	readonly onTaskAction?: (entry: OpenTuiWorkspaceTaskEntry, action: OpenTuiWorkspaceTaskAction) => void;
	readonly onTaskCreate?: () => void;
	readonly onNewGroup?: () => void;
	readonly onGroupSelect?: (entry: OpenTuiWorkspaceGroupEntry) => void;
	readonly onGroupToggle?: (groupId: string, direction: OpenTuiWorkspaceGroupToggleDirection) => void;
	readonly onGroupDelete?: (entry: OpenTuiWorkspaceGroupEntry) => void;
	readonly onFilterRequest?: () => void;
	readonly onBoardRequest?: () => void;
	readonly onHelp?: () => void;
	readonly onQuit?: () => void;
};

export type OpenTuiWorkspaceOptions = OpenTuiWorkspaceCallbacks & {
	readonly tasks: readonly OpenTuiWorkspaceTaskEntry[];
	readonly statuses?: readonly string[];
	readonly activeStatus?: string;
	readonly selectedTaskIndex?: number;
	readonly groups?: readonly TaskGroup[];
	readonly groupMembership?: GroupMembership;
	readonly selectedGroupId?: string;
	/** First visible row of the active status pane, so a remount keeps the list window instead of re-pinning the selection. */
	readonly firstVisibleTaskIndex?: number;
	readonly activeAgentSession?: OpenTuiWorkspaceAgentSession;
	readonly selectedModeId?: string;
	/** Resolves configured/default mode presentation and approval for each task row. */
	readonly modeProjectionByTask?: OpenTuiWorkspaceModeProjectionByTask;
	readonly liveAgent?: OpenTuiWorkspaceLiveAgent;
	/**
	 * Settled agent indication per task id, supplied by the controller. Never persisted; drives the
	 * row marker colour and the agent header/placeholder overlay. A key present means a session
	 * indication exists for that task.
	 */
	readonly indicationByTask?: ReadonlyMap<string, AgentIndication>;
	/** IDs of tasks with saved sessions, including inactive sessions. */
	readonly sessionTaskIds?: readonly string[];
	readonly projectName?: string;
	readonly filterSummary?: string;
	readonly detailsVisible?: boolean;
	readonly taskPaneVisible?: boolean;
	readonly agentFocused?: boolean;
	readonly fullscreen?: boolean;
	readonly keyboardOverrides?: ShortcutOverrides;
	readonly footer?: string;
	readonly notice?: string;
	/** Rich detail per task id, precomputed by the controller from the full task corpus. */
	readonly taskDetails?: ReadonlyMap<string, TaskDetail>;
	/** Rendering options for task detail sections. */
	readonly taskDetailOptions?: TaskDetailStyledOptions;
	/** Canonical artifact repository adapter; when provided, Ctrl+Shift+O opens the selected task's artifacts. */
	readonly taskArtifactApi?: TaskArtifactViewApi;
};

export type OpenTuiWorkspaceMount = {
	/** Re-derive the screen from a fresh option set, keeping the mounted nodes and their geometry. */
	update(options: OpenTuiWorkspaceOptions): void;
	/** Update only the derived indication overlay; never disposes, remounts, or churns the tabs. */
	setIndication(indication: ReadonlyMap<string, AgentIndication>): void;
	dispose(): void;
};

function clampIndex(index: number, length: number): number {
	if (length === 0) return 0;
	return Math.max(0, Math.min(index, length - 1));
}

/** Mount one retained normal-task workspace screen inside an existing OpenTUI host. */
export function mountOpenTuiWorkspace(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiWorkspaceOptions,
): OpenTuiWorkspaceMount {
	let disposed = false;
	let opts = options;
	let notice = options.notice;
	let taskIndex = -1;
	let selectedRow = -1;
	let selectedGroupId: string | undefined;
	let rows: GroupRow[] = [];
	let taskFirstVisible = 0;
	let detailsVisible = true;
	let taskPaneVisible = true;
	let agentFocused = false;
	let initiallySelectedTaskId: string | undefined;
	let statusBuckets = new Map<string, number[]>();
	let statuses: string[] = [];
	let taskOrder: number[] = [];
	let indicationByTask = new Map<string, AgentIndication>();
	let fullscreen = false;
	let redraw = (): void => {};

	const selectedTask = (): OpenTuiWorkspaceTaskEntry | undefined => {
		const row = rows[selectedRow];
		if (row?.kind !== "task") return undefined;
		return opts.tasks.find((task) => task.id === row.id);
	};
	/** Walk up from a hidden task's group to the nearest ancestor group that is actually rendered. */
	const findVisibleAncestorRow = (groupId: string | null): number => {
		let current = groupId;
		while (current !== null) {
			const index = rows.findIndex((row) => row.kind === "group" && row.id === current);
			if (index >= 0) return index;
			current = findGroup(opts.groups ?? [], current)?.parentId ?? null;
		}
		return -1;
	};

	// The controller rebuilds this screen's options on every refresh. Re-deriving them here
	// instead of remounting keeps every node and its measured geometry, so a selection change
	// cannot repaint the task list from a zero-width, pre-layout state.
	const apply = (next: OpenTuiWorkspaceOptions): void => {
		opts = next;
		notice = next.notice;
		const requestedTaskIndex = clampIndex(opts.selectedTaskIndex ?? 0, opts.tasks.length);
		taskFirstVisible = Math.max(0, opts.firstVisibleTaskIndex ?? 0);
		detailsVisible = opts.detailsVisible ?? true;
		taskPaneVisible = opts.taskPaneVisible ?? true;
		agentFocused = opts.agentFocused ?? false;
		statusBuckets = new Map<string, number[]>((opts.statuses ?? []).map((status) => [status, []]));
		for (const [index, task] of opts.tasks.entries()) {
			const status =
				[...statusBuckets.keys()].find((value) => statusComparisonKey(value) === task.status) ?? task.status;
			const bucket = statusBuckets.get(status) ?? [];
			bucket.push(index);
			statusBuckets.set(status, bucket);
		}
		statuses = [...statusBuckets.keys()];
		taskOrder = statuses.flatMap((status) => statusBuckets.get(status) ?? []);
		rows = buildGroupRows(
			opts.groups ?? [],
			opts.groupMembership ?? {},
			taskOrder.map((index) => opts.tasks[index]?.id ?? ""),
		);
		selectedRow = -1;
		selectedGroupId = undefined;
		taskIndex = -1;
		const requestedGroupId = opts.selectedGroupId;
		if (requestedGroupId !== undefined) {
			const groupRow = rows.findIndex((row) => row.kind === "group" && row.id === requestedGroupId);
			if (groupRow >= 0) {
				selectedRow = groupRow;
				selectedGroupId = requestedGroupId;
			}
		}
		if (selectedGroupId === undefined) {
			const desiredTaskId = opts.tasks[requestedTaskIndex]?.id;
			const taskRow =
				desiredTaskId !== undefined ? rows.findIndex((row) => row.kind === "task" && row.id === desiredTaskId) : -1;
			if (taskRow >= 0) {
				selectedRow = taskRow;
				taskIndex = requestedTaskIndex;
			} else if (desiredTaskId !== undefined) {
				const ancestorRow = findVisibleAncestorRow(opts.groupMembership?.[desiredTaskId] ?? null);
				const ancestor = ancestorRow >= 0 ? rows[ancestorRow] : undefined;
				if (ancestor?.kind === "group") {
					selectedRow = ancestorRow;
					selectedGroupId = ancestor.id;
				}
			}
		}
		initiallySelectedTaskId = selectedTask()?.id;
		taskFirstVisible = clampIndex(taskFirstVisible, rows.length);
		indicationByTask = new Map(opts.indicationByTask ?? []);
		const liveAgent = opts.liveAgent;
		if (opts.indicationByTask === undefined && (liveAgent?.status === "starting" || liveAgent?.status === "running")) {
			indicationByTask.set(liveAgent.taskId, "parked");
		}
		fullscreen =
			(opts.fullscreen ?? false) &&
			liveAgent?.taskId === selectedTask()?.id &&
			liveAgent?.status !== "error" &&
			Boolean(liveAgent?.host && liveAgent.terminal);
		if (fullscreen) agentFocused = true;
	};
	apply(options);
	const surface = new BoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		flexDirection: "column",
		rowGap: 0,
		focusable: true,
	});
	const navbar = new BoxRenderable(renderer, {
		width: "100%",
		height: "auto",
		minHeight: 3,
		flexShrink: 0,
		border: true,
		borderColor: "cyan",
		title: ` Filters · ${opts.projectName ?? "Workspace"} `,
		paddingLeft: 1,
		paddingRight: 1,
	});
	const filterText = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		wrapMode: "word",
	});
	navbar.add(filterText);
	const body = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		flexDirection: "row",
		columnGap: 1,
	});
	const details = new BoxRenderable(renderer, {
		flexGrow: 1,
		flexBasis: 0,
		height: "100%",
		minHeight: 0,
		flexDirection: "column",
	});
	const fullscreenHint = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		flexShrink: 0,
		wrapMode: "word",
		fg: "#f5f5f5",
		bg: "#111111",
	});
	const footer = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		flexShrink: 0,
		wrapMode: "word",
		attributes: TextAttributes.DIM,
	});

	const detailPane = mountWorkspaceDetails(
		renderer,
		details,
		opts.taskArtifactApi,
		(message) => {
			notice = `Artifact review: ${message}`;
			redraw();
		},
		() => redraw(),
	);
	const preview = mountWorkspacePreview(renderer, details, () => focusAgent());
	const taskList = mountWorkspaceTaskList(
		renderer,
		body,
		(rowIndex) => {
			agentFocused = false;
			opts.onAgentFocusChange?.(false);
			select(rowIndex);
			redraw();
		},
		(delta) => {
			if (!agentFocused) select(selectedRow + delta);
		},
		(firstVisibleTaskIndex) => {
			taskFirstVisible = firstVisibleTaskIndex;
			opts.onTaskScrollChange?.(firstVisibleTaskIndex);
		},
		() => redraw(),
	);
	body.add(details);
	surface.add(navbar);
	surface.add(body);
	surface.add(footer);
	surface.add(fullscreenHint);
	parent.add(surface);

	const selectedSession = (): OpenTuiWorkspaceAgentSession | undefined => {
		const session = opts.activeAgentSession;
		const task = selectedTask();
		if (!session || !task) return undefined;
		if (session.taskId) return session.taskId === task.id ? session : undefined;
		return task.id === initiallySelectedTaskId ? session : undefined;
	};
	const selectedTaskHasSessions = (): boolean => {
		const task = selectedTask();
		return Boolean(task && (opts.sessionTaskIds?.includes(task.id) ?? selectedSession()));
	};
	const shortcut = (descriptor: Parameters<typeof formatShortcut>[0]): string =>
		formatShortcut(descriptor, opts.keyboardOverrides);
	redraw = (): void => {
		if (disposed) return;
		filterText.content = opts.filterSummary ?? "All tasks";
		const task = selectedTask();
		taskList.update({
			tasks: opts.tasks,
			statuses: opts.statuses ?? [],
			rows,
			selectedRow,
			firstVisibleTaskIndex: taskFirstVisible,
			indicationByTask,
			modeProjectionByTask: opts.modeProjectionByTask,
			displayModeColor: modeDisplayColor,
		});
		const showDetails = detailsVisible && !fullscreen;
		detailPane.updateArtifactApi(opts.taskArtifactApi);
		detailPane.update({
			task,
			detail: task ? opts.taskDetails?.get(task.id) : undefined,
			options: opts.taskDetailOptions,
			visible: showDetails,
			collapseShortcut: shortcut(shortcutsConfig.workspace.toggleDetails),
		});
		taskList.root.visible = taskPaneVisible && !fullscreen;
		navbar.visible = !fullscreen;
		footer.visible = !fullscreen;
		body.columnGap = taskPaneVisible && !fullscreen ? 1 : 0;
		const session = selectedSession();
		const liveAgent = opts.liveAgent?.taskId === selectedTask()?.id ? opts.liveAgent : undefined;
		const selectedMode = task ? opts.modeProjectionByTask?.(task.id) : undefined;
		const modeLabel = selectedMode?.modeLabel ?? opts.selectedModeId ?? "mode";
		const terminal = liveAgent?.status === "error" ? undefined : liveAgent?.terminal;
		if (agentFocused && !terminal) {
			agentFocused = false;
			opts.onAgentFocusChange?.(false);
		}
		const focusedRenderable = renderer.currentFocusedRenderable;
		const mayFocusPreview = !focusedRenderable || surface.focused || surface.hasFocusedDescendant;
		preview.update({
			session,
			liveAgent,
			modeLabel,
			modeColor: modeDisplayColor(selectedMode?.modeColor),
			resumeShortcut: shortcut(shortcutsConfig.workspace.sessions),
			actionShortcut: shortcut(shortcutsConfig.workspace.select),
			focused: agentFocused,
			mayFocus: mayFocusPreview,
			fullscreen,
		});
		const navigationShortcuts = [
			task && opts.taskArtifactApi
				? `[${formatShortcut(artifactViewShortcut, opts.keyboardOverrides)}] Artifacts`
				: undefined,
			...actionInventory().map((action) => `[${shortcut(action.shortcut)}] ${action.label}`),
		].filter((value): value is string => Boolean(value));
		const shortcuts = detailPane.artifactsOpen
			? `Artifacts · ${formatShortcut(artifactCloseShortcut, opts.keyboardOverrides)}: close · ↑/↓: select`
			: (opts.footer ?? navigationShortcuts.join(" · "));
		footer.content = agentFocused
			? ` Agent input · [${shortcut(shortcutsConfig.workspace.quit)}] Leave preview · [${shortcut(shortcutsConfig.workspace.quickPreviewExit)}] Leave agent `
			: notice
				? `${notice}\n${shortcuts}`
				: shortcuts;
		fullscreenHint.visible = fullscreen;
		fullscreenHint.content = ` Press ${shortcut(shortcutsConfig.workspace.quickPreviewExit)} to exit fullscreen `;
		if (agentFocused) {
			taskList.root.blur();
			// A controller-owned modal owns focus while it is open; a refresh must not take it.
			if (mayFocusPreview) preview.terminal?.focus();
		} else {
			preview.terminal?.blur();
			// Restore pane focus after controller remounts without stealing modal focus.
			const focused = renderer.currentFocusedRenderable;
			if (taskPaneVisible && (!focused || focused.isDestroyed || surface.focused || surface.hasFocusedDescendant)) {
				taskList.root.focus();
			} else {
				taskList.root.blur();
				if (!taskPaneVisible && (!focused || focused.isDestroyed || surface.focused || surface.hasFocusedDescendant)) {
					surface.focus();
				}
			}
		}
		renderer.requestRender();
	};
	const focusAgent = (): void => {
		if (agentFocused) return;
		agentFocused = true;
		opts.onAgentFocusChange?.(true);
		redraw();
	};
	const select = (rowIndex: number): void => {
		if (rowIndex < 0 || rowIndex >= rows.length) return;
		const row = rows[rowIndex];
		if (!row) return;
		if (row.kind === "group") {
			if (selectedRow === rowIndex && selectedGroupId === row.id) return;
			selectedRow = rowIndex;
			selectedGroupId = row.id;
			taskIndex = -1;
			agentFocused = false;
			opts.onAgentFocusChange?.(false);
			redraw();
			opts.onGroupSelect?.({ id: row.id, name: row.name });
			return;
		}
		const nextTaskIndex = opts.tasks.findIndex((task) => task.id === row.id);
		if (nextTaskIndex === taskIndex) return;
		selectedRow = rowIndex;
		selectedGroupId = undefined;
		taskIndex = nextTaskIndex;
		agentFocused = false;
		opts.onAgentFocusChange?.(false);
		redraw();
		const task = selectedTask();
		if (task) opts.onTaskSelect?.(task);
	};
	const toggleDetails = (): void => {
		detailsVisible = !detailsVisible;
		redraw();
		opts.onToggleDetails?.(detailsVisible);
	};
	const toggleTaskPane = (): void => {
		taskPaneVisible = !taskPaneVisible;
		redraw();
		opts.onToggleTaskPane?.(taskPaneVisible);
	};
	const keybindings = createKeybindings(() => opts.keyboardOverrides ?? {});
	const agentKeybindings = createKeybindings(() => opts.keyboardOverrides ?? {});
	let pendingActionSequence = false;
	const requestTaskAction = (action: OpenTuiWorkspaceTaskAction): void => {
		const task = selectedTask();
		if (!task) return;
		if (action === "done" && task.done) return;
		opts.onTaskAction?.(task, action);
	};
	// This is the single source for normal-focus discovery and dispatch. Keep it local because
	// availability depends on the current selected row, session, and terminal attachment.
	const actionInventory = () => {
		const task = selectedTask();
		const selectedRowGroup = rows[selectedRow];
		const group = selectedRowGroup?.kind === "group" ? selectedRowGroup : undefined;
		return [
			{ shortcut: shortcutsConfig.workspace.previousItem, label: "Previous", run: () => select(selectedRow - 1) },
			{ shortcut: shortcutsConfig.workspace.nextItem, label: "Next", run: () => select(selectedRow + 1) },
			{ shortcut: shortcutsConfig.workspace.first, label: "First", run: () => select(0) },
			{ shortcut: shortcutsConfig.workspace.last, label: "Last", run: () => select(rows.length - 1) },
			opts.onHistoryBack && {
				shortcut: shortcutsConfig.workspace.historyBack,
				label: "Back",
				run: () => opts.onHistoryBack?.(),
			},
			opts.onHistoryForward && {
				shortcut: shortcutsConfig.workspace.historyForward,
				label: "Forward",
				run: () => opts.onHistoryForward?.(),
			},
			task &&
				opts.onCycleMode && {
					shortcut: shortcutsConfig.workspace.cycleMode,
					label: "Mode",
					run: () => opts.onCycleMode?.(),
				},
			opts.onBoardRequest && {
				shortcut: shortcutsConfig.workspace.board,
				label: "Board",
				run: () => opts.onBoardRequest?.(),
			},
			task &&
				opts.onAgentConfigRequest && {
					shortcut: shortcutsConfig.workspace.agentConfig,
					label: "Agent config",
					run: () => opts.onAgentConfigRequest?.(task),
				},
			opts.onTaskCreate && {
				shortcut: shortcutsConfig.workspace.createTask,
				label: "Create",
				run: () => opts.onTaskCreate?.(),
			},
			opts.onNewGroup && {
				shortcut: shortcutsConfig.workspace.newGroup,
				label: "Group",
				run: () => opts.onNewGroup?.(),
			},
			group &&
				opts.onGroupToggle && {
					shortcut: shortcutsConfig.workspace.expand,
					label: "Expand",
					run: () => opts.onGroupToggle?.(group.id, "expand"),
				},
			group &&
				opts.onGroupToggle && {
					shortcut: shortcutsConfig.workspace.collapse,
					label: "Collapse",
					run: () => opts.onGroupToggle?.(group.id, "collapse"),
				},
			task && { shortcut: shortcutsConfig.workspace.toggleDetails, label: "Details", run: toggleDetails },
			{ shortcut: shortcutsConfig.workspace.toggleTaskPane, label: "Tasks", run: toggleTaskPane },
			task &&
				opts.onSessionRequest && {
					shortcut: shortcutsConfig.workspace.sessions,
					label: "Choose session",
					run: () => opts.onSessionRequest?.(task),
				},
			task &&
				selectedTaskHasSessions() &&
				opts.onHandoffRequest && {
					shortcut: shortcutsConfig.workspace.handoff,
					label: "Handoff",
					run: () => opts.onHandoffRequest?.(task),
				},
			task &&
				opts.onSessionAction && {
					shortcut: shortcutsConfig.workspace.select,
					label:
						selectedSession()?.status === "stopped"
							? "Resume"
							: selectedSession()?.status === "starting"
								? "Starting"
								: selectedSession()?.status === "unknown"
									? "Check session"
									: selectedSession()
										? "Use session"
										: "Start",
					run: () =>
						opts.onSessionAction?.(
							task,
							Math.max(1, preview.outputSize.width || 1),
							Math.max(1, preview.outputSize.height || 1),
						),
				},
			task &&
				!task.done &&
				opts.onTaskAction && {
					shortcut: shortcutsConfig.workspace.markDone,
					label: "Done",
					run: () => requestTaskAction("done"),
				},
			task &&
				opts.onTaskAction && {
					shortcut: shortcutsConfig.workspace.editTask,
					label: "Edit",
					run: () => requestTaskAction("edit"),
				},
			task &&
				opts.onTaskAction && {
					shortcut: shortcutsConfig.workspace.copyTask,
					label: "Copy",
					run: () => requestTaskAction("copy"),
				},
			task &&
				opts.onTaskAction && {
					shortcut: shortcutsConfig.workspace.archiveTask,
					label: "Archive",
					run: () => requestTaskAction("archive"),
				},
			task &&
				opts.onTaskAction && {
					shortcut: shortcutsConfig.workspace.deleteTask,
					label: "Delete",
					run: () => requestTaskAction("delete"),
				},
			group &&
				opts.onGroupDelete && {
					shortcut: shortcutsConfig.workspace.deleteTask,
					label: "Delete",
					run: () => opts.onGroupDelete?.({ id: group.id, name: group.name }),
				},
			opts.onFilterRequest && {
				shortcut: shortcutsConfig.workspace.filter,
				label: "Filter",
				run: () => queueMicrotask(() => opts.onFilterRequest?.()),
			},
			preview.terminal && {
				shortcut: shortcutsConfig.workspace.fullscreen,
				label: "Fullscreen",
				run: () => {
					fullscreen = true;
					agentFocused = true;
					redraw();
					opts.onFullscreenChange?.(true);
					opts.onAgentFocusChange?.(true);
				},
			},
			opts.onSettingsRequest && {
				shortcut: shortcutsConfig.workspace.settings,
				label: "Settings",
				run: () => opts.onSettingsRequest?.(),
			},
			opts.onQuit && { shortcut: shortcutsConfig.workspace.quit, label: "Exit", run: () => opts.onQuit?.() },
			opts.onHelp && { shortcut: shortcutsConfig.workspace.help, label: "Help", run: () => opts.onHelp?.() },
		].filter((entry): entry is Exclude<typeof entry, false | undefined> => Boolean(entry));
	};
	const onKeyPress = (key: KeyEvent): void => {
		if (disposed || key.eventType === "release") return;
		if (renderer.currentFocusedRenderable && !surface.focused && !surface.hasFocusedDescendant) return;
		// A retained terminal can regain native focus before the controller observes
		// its focus event (for example when a session picker closes).
		if (preview.terminal?.focused) focusAgent();
		if (agentFocused) {
			key.preventDefault();
			key.stopPropagation();
			if (!agentKeybindings.dispatch(key)) preview.terminal?.handleKeyPress(key);
			return;
		}
		if (detailPane.artifactsOpen) {
			if (matchesShortcut(artifactCloseShortcut, key, opts.keyboardOverrides)) {
				key.preventDefault();
				key.stopPropagation();
				detailPane.closeArtifacts();
				redraw();
				taskList.root.focus();
				return;
			}
			if (
				matchesShortcut(shortcutsConfig.shared.up, key, opts.keyboardOverrides) ||
				matchesShortcut(shortcutsConfig.shared.down, key, opts.keyboardOverrides)
			) {
				key.preventDefault();
				key.stopPropagation();
				detailPane.navigateArtifacts(matchesShortcut(shortcutsConfig.shared.up, key, opts.keyboardOverrides) ? -1 : 1);
				return;
			}
		}
		if (
			opts.taskArtifactApi &&
			!findShortcutConflict(artifactViewShortcut, artifactViewShortcut.binding, opts.keyboardOverrides) &&
			matchesShortcut(artifactViewShortcut, key, opts.keyboardOverrides)
		) {
			const task = selectedTask();
			if (task) {
				key.preventDefault();
				key.stopPropagation();
				detailPane.openArtifacts();
				return;
			}
		}
		const actions = actionInventory();
		const stroke = shortcutKeyFromEvent(key);
		const startsActionSequence =
			stroke !== undefined &&
			actions.some((action) => {
				const first = opts.keyboardOverrides?.[action.shortcut.id]?.sequence[0];
				return (
					first?.key === stroke.key &&
					Boolean(first.ctrl) === Boolean(stroke.ctrl) &&
					Boolean(first.shift) === Boolean(stroke.shift) &&
					Boolean(first.meta) === Boolean(stroke.meta) &&
					Boolean(first.super) === Boolean(stroke.super) &&
					Boolean(first.hyper) === Boolean(stroke.hyper) &&
					opts.keyboardOverrides?.[action.shortcut.id]?.sequence.length === 2
				);
			});
		if (pendingActionSequence || startsActionSequence) {
			const wasPending = pendingActionSequence;
			if (keybindings.dispatch(key)) {
				pendingActionSequence = !wasPending;
				key.preventDefault();
				key.stopPropagation();
				return;
			}
		}
		const action = actions.find((entry) => matchesShortcut(entry.shortcut, key, opts.keyboardOverrides));
		if (action) {
			key.preventDefault();
			key.stopPropagation();
			action.run();
		}
	};
	const leaveAgent = (): void => {
		const wasFullscreen = fullscreen;
		fullscreen = false;
		agentFocused = false;
		redraw();
		if (wasFullscreen) opts.onFullscreenChange?.(false);
		opts.onAgentFocusChange?.(false);
	};
	agentKeybindings.on(shortcutsConfig.workspace.quickPreviewExit, leaveAgent);
	agentKeybindings.on(shortcutsConfig.workspace.quit, leaveAgent);
	keybindings.on(shortcutsConfig.workspace.historyBack, () => opts.onHistoryBack?.());
	keybindings.on(shortcutsConfig.workspace.historyForward, () => opts.onHistoryForward?.());
	keybindings.on(shortcutsConfig.workspace.sessions, () => {
		const task = selectedTask();
		if (task) opts.onSessionRequest?.(task);
	});
	keybindings.on(shortcutsConfig.workspace.handoff, () => {
		const task = selectedTask();
		if (task && selectedTaskHasSessions()) opts.onHandoffRequest?.(task);
	});
	keybindings.on(shortcutsConfig.workspace.fullscreen, () => {
		if (!preview.terminal) return;
		fullscreen = true;
		agentFocused = true;
		redraw();
		opts.onFullscreenChange?.(true);
		opts.onAgentFocusChange?.(true);
	});
	keybindings.on(shortcutsConfig.workspace.cycleMode, () => {
		if (selectedTask()) opts.onCycleMode?.();
	});
	keybindings.on(shortcutsConfig.workspace.quit, () => opts.onQuit?.());
	keybindings.on(shortcutsConfig.workspace.board, () => opts.onBoardRequest?.());
	keybindings.on(shortcutsConfig.workspace.settings, () => opts.onSettingsRequest?.());
	keybindings.on(shortcutsConfig.workspace.agentConfig, () => {
		const task = selectedTask();
		if (task) opts.onAgentConfigRequest?.(task);
	});
	keybindings.on(shortcutsConfig.workspace.createTask, () => opts.onTaskCreate?.());
	keybindings.on(shortcutsConfig.workspace.newGroup, () => opts.onNewGroup?.());
	keybindings.on(shortcutsConfig.workspace.expand, () => {
		const row = rows[selectedRow];
		if (row?.kind === "group") opts.onGroupToggle?.(row.id, "expand");
	});
	keybindings.on(shortcutsConfig.workspace.collapse, () => {
		const row = rows[selectedRow];
		if (row?.kind === "group") opts.onGroupToggle?.(row.id, "collapse");
	});
	keybindings.on(shortcutsConfig.workspace.filter, () => opts.onFilterRequest?.());
	keybindings.on(shortcutsConfig.workspace.help, () => opts.onHelp?.());
	keybindings.on(shortcutsConfig.workspace.select, () => {
		const task = selectedTask();
		if (!task) return;
		opts.onSessionAction?.(
			task,
			Math.max(1, preview.outputSize.width || Math.floor((renderer.width - 1) * (taskPaneVisible ? 0.7 : 1)) - 2),
			Math.max(1, preview.outputSize.height || renderer.height - 9),
		);
	});
	keybindings.on(shortcutsConfig.workspace.editTask, () => requestTaskAction("edit"));
	keybindings.on(shortcutsConfig.workspace.copyTask, () => requestTaskAction("copy"));
	keybindings.on(shortcutsConfig.workspace.archiveTask, () => requestTaskAction("archive"));
	keybindings.on(shortcutsConfig.workspace.markDone, () => requestTaskAction("done"));
	keybindings.on(shortcutsConfig.workspace.deleteTask, () => {
		const row = rows[selectedRow];
		if (row?.kind === "group") {
			opts.onGroupDelete?.({ id: row.id, name: row.name });
			return;
		}
		requestTaskAction("delete");
	});
	keybindings.on(shortcutsConfig.workspace.previousItem, () => select(selectedRow - 1));
	keybindings.on(shortcutsConfig.workspace.nextItem, () => select(selectedRow + 1));
	keybindings.on(shortcutsConfig.workspace.first, () => select(0));
	keybindings.on(shortcutsConfig.workspace.last, () => select(rows.length - 1));
	keybindings.on(shortcutsConfig.workspace.toggleDetails, () => toggleDetails());
	keybindings.on(shortcutsConfig.workspace.toggleTaskPane, () => toggleTaskPane());
	const onResize = (): void => redraw();
	const onPaste = (event: PasteEvent): void => {
		if (disposed || !agentFocused || !preview.terminal) return;
		if (renderer.currentFocusedRenderable && !surface.focused && !surface.hasFocusedDescendant) return;
		event.preventDefault();
		event.stopPropagation();
		preview.terminal.handlePaste(event);
	};

	renderer.keyInput.on("keypress", onKeyPress);
	renderer.keyInput.on("paste", onPaste);
	renderer.on("resize", onResize);
	redraw();

	return {
		update(next: OpenTuiWorkspaceOptions): void {
			if (disposed) return;
			apply(next);
			navbar.title = ` Filters · ${opts.projectName ?? "Workspace"} `;
			redraw();
		},
		setIndication(next: ReadonlyMap<string, AgentIndication>): void {
			if (disposed) return;
			if (next.size === indicationByTask.size) {
				let unchanged = true;
				for (const [taskId, indication] of next) {
					if (indicationByTask.get(taskId) !== indication) {
						unchanged = false;
						break;
					}
				}
				if (unchanged) return;
			}
			indicationByTask = new Map(next);
			redraw();
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			renderer.keyInput.off("keypress", onKeyPress);
			renderer.keyInput.off("paste", onPaste);
			renderer.off("resize", onResize);
			keybindings.clear();
			agentKeybindings.clear();
			taskList.dispose();
			preview.dispose();
			detailPane.dispose();
			surface.destroyRecursively();
		},
	};
}
