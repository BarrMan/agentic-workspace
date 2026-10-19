import {
	BoxRenderable,
	bg,
	bold,
	type CliRenderer,
	type EmbeddedTerminalRenderable,
	fg,
	type KeyEvent,
	type MouseEvent,
	type PasteEvent,
	parseColor,
	StyledText,
	strikethrough,
	TextAttributes,
	TextRenderable,
	t,
} from "@opentui/core";
import type { TaskDetail } from "../../controller/task-detail.ts";
import type { AgentIndication } from "../../model/session/types.ts";
import { formatAssignee } from "../../model/task/assignee-filter.ts";
import { statusComparisonKey } from "../../model/task/status.ts";
import { isTerminalStatus } from "../../model/task/terminal-status.ts";
import type { AgentHost } from "../../runtime/live/agent-host.ts";
import type { GroupMembership, TaskGroup } from "../../storage/group-store.ts";
import { getIndicationColor, getSelectedIndicationColor } from "../formatters/status-icon.ts";
import { buildGroupRows, findGroup, type GroupRow } from "./groups.ts";
import {
	createKeybindings,
	findShortcutConflict,
	formatShortcut,
	matchesShortcut,
	type ShortcutOverrides,
	shortcutsConfig,
} from "./keybindings.ts";
import { renderModeRowLabel } from "./mode-row-label.ts";
import { TaskArtifactView, type TaskArtifactViewApi } from "./task-artifact-view.ts";
import { generateTaskDetailStyled, type TaskDetailStyledOptions } from "./task-detail-content.ts";

const artifactViewShortcut = shortcutsConfig.workspace.openArtifacts;
const artifactCloseShortcut = shortcutsConfig.taskViewer.escape;

/** Task-list wheel changes selection, not TextRenderable's private scroll offset. */
class TaskListText extends TextRenderable {
	protected override onMouseEvent(event: MouseEvent): void {
		if (event.type !== "scroll") super.onMouseEvent(event);
	}
}

const SELECTED_TASK_BACKGROUND = "#cbd5e1";
const SELECTED_TASK_FOREGROUND = "#111111";

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

// Matches AOE's session list: fixed 35 columns, leaving the preview at least 40.
const AOE_LIST_WIDTH = 35;
const AOE_PREVIEW_MIN_WIDTH = 40;
function sliceByCells(value: string, start: number, end: number): string {
	let result = "";
	let offset = 0;
	for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)) {
		const next = offset + Bun.stringWidth(segment);
		if (offset >= start && next <= end) result += segment;
		offset = next;
	}
	return result;
}

function workspaceTaskListWidth(availableWidth: number): number {
	return Math.max(10, Math.min(AOE_LIST_WIDTH, availableWidth - AOE_PREVIEW_MIN_WIDTH));
}

export type OpenTuiWorkspaceTaskEntry = {
	readonly id: string;
	readonly title: string;
	readonly status: string;
	readonly description?: string;
	readonly assignees?: readonly string[];
	readonly labels?: readonly string[];
	readonly priority?: string;
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
	/** Actual execution directory captured on the session, never the application cwd. */
	readonly cwd: string;
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

export type OpenTuiWorkspaceTaskAction = "edit" | "copy" | "complete" | "archive" | "done" | "delete";

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
	readonly onAgentStart?: (entry: OpenTuiWorkspaceTaskEntry, columns: number, rows: number) => void;
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
	/** Rendering options for {@link generateTaskDetailStyled}. */
	readonly taskDetailOptions?: TaskDetailStyledOptions;
	/** Canonical artifact repository adapter; when provided, Ctrl+Shift+O opens the selected task's artifacts. */
	readonly taskArtifactApi?: TaskArtifactViewApi;
	/** Optional profile-declared artifacts, shown as Missing until created. */
	readonly taskArtifactPathsByTask?: ReadonlyMap<string, readonly string[]>;
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

function visibleStart(selectedIndex: number, firstVisible: number, visibleRows: number, length: number): number {
	if (selectedIndex < firstVisible) return selectedIndex;
	if (selectedIndex >= firstVisible + visibleRows) return selectedIndex - visibleRows + 1;
	return Math.max(0, Math.min(firstVisible, Math.max(0, length - visibleRows)));
}

function taskDetails(task: OpenTuiWorkspaceTaskEntry | undefined): string {
	if (!task) return "No task selected.";
	const assignees = task.assignees?.map(formatAssignee).filter((assignee) => assignee !== null) ?? [];
	const fields = [
		`Status: ${task.status}`,
		task.priority ? `Priority: ${task.priority}` : undefined,
		assignees.length ? `Assignees: ${assignees.join(", ")}` : undefined,
		task.labels?.length ? `Labels: ${task.labels.join(", ")}` : undefined,
		"",
		task.description?.trim() || "No description.",
	];
	return fields.filter((field): field is string => field !== undefined).join("\n");
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
				[...statusBuckets.keys()].find((value) => statusComparisonKey(value) === statusComparisonKey(task.status)) ??
				task.status;
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
	const taskList = new BoxRenderable(renderer, {
		width: workspaceTaskListWidth(renderer.width),
		flexShrink: 0,
		height: "100%",
		flexDirection: "column",
		border: ["top"],
		title: " Tasks ",
		borderColor: "#555555",
		backgroundColor: "#1f1f1f",
		focusable: true,
	});
	const details = new BoxRenderable(renderer, {
		flexGrow: 1,
		flexBasis: 0,
		height: "100%",
		minHeight: 0,
		flexDirection: "column",
	});
	const taskViewport = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		minHeight: 0,
		overflow: "hidden",
		border: ["left", "right", "bottom"],
		borderStyle: "rounded",
		borderColor: "#555555",
		backgroundColor: "#1f1f1f",
	});
	const taskText = new TaskListText(renderer, {
		width: "100%",
		height: "100%",
		wrapMode: "none",
		overflow: "hidden",
		selectable: false,
	});
	const detailRegion = new BoxRenderable(renderer, {
		backgroundColor: "#111111",
		width: "100%",
		height: "30%",
		flexShrink: 0,
		border: true,
		title: " Details ",
		borderColor: "gray",
		bottomTitleAlignment: "right",
		overflow: "hidden",
	});
	const detailText = new TextRenderable(renderer, {
		width: "100%",
		height: "100%",
		wrapMode: "word",
		overflow: "hidden",
		fg: "#e5e5e5",
		bg: "#111111",
	});
	let artifactView: TaskArtifactView | undefined;
	let artifactViewOpen = false;
	let artifactViewTaskId: string | undefined;
	const agentRegion = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		minHeight: 5,
		border: true,
		title: " Live preview ",
		borderColor: "gray",
		flexDirection: "column",
		overflow: "hidden",
	});
	const agentHeader = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none" });
	const agentOutput = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		overflow: "hidden",
	});
	const agentPlaceholder = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		justifyContent: "center",
		backgroundColor: "#111111",
		zIndex: 1,
	});
	const agentText = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		wrapMode: "word",
		fg: "#e5e5e5",
		bg: "#111111",
	});
	const fullscreenHint = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		flexShrink: 0,
		wrapMode: "word",
		fg: "#f5f5f5",
		bg: "#111111",
	});
	let agentMount: EmbeddedTerminalRenderable | undefined;
	let mountedAgent: AgentHost | undefined;
	const footer = new TextRenderable(renderer, {
		width: "100%",
		height: "auto",
		flexShrink: 0,
		wrapMode: "word",
		attributes: TextAttributes.DIM,
	});

	taskViewport.add(taskText);
	taskList.add(taskViewport);
	detailRegion.add(detailText);
	const mountArtifactView = (taskId: string): void => {
		if (!opts.taskArtifactApi) return;
		if (!artifactView) {
			artifactView = new TaskArtifactView({
				renderer,
				parent: detailRegion,
				taskId,
				api: opts.taskArtifactApi,
				declaredPaths: opts.taskArtifactPathsByTask?.get(taskId),
				onError: (message) => {
					notice = `Artifact review: ${message}`;
					redraw();
				},
			});
			artifactView.root.visible = false;
			artifactView.setOpen(false);
		} else if (artifactViewTaskId !== taskId) {
			void artifactView.setTask(taskId, opts.taskArtifactPathsByTask?.get(taskId));
		}
		artifactViewTaskId = taskId;
		artifactViewOpen = true;
		artifactView.setOpen(true);
		artifactView.root.visible = true;
		detailText.visible = false;
		redraw();
	};
	agentPlaceholder.add(agentText);
	agentOutput.add(agentPlaceholder);
	const agentPane = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		minHeight: 0,
		flexDirection: "column",
	});
	agentPane.add(agentHeader);
	agentPane.add(agentRegion);
	agentRegion.add(agentOutput);
	details.add(detailRegion);
	details.add(agentPane);
	body.add(taskList);
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
		formatShortcut({ ...descriptor, keys: descriptor.keys.slice(0, 1), label: undefined }, opts.keyboardOverrides);
	const visibleTaskRows = (): number => Math.max(1, taskViewport.height - 1);
	redraw = (): void => {
		if (disposed) return;
		const scrollAnchor = Math.max(0, selectedRow);
		taskList.title = ` Tasks (${opts.tasks.length}) `;
		taskList.width = workspaceTaskListWidth(renderer.width);
		// Before the first layout pass the task viewport has no measured height. Treating that as a
		// one-row viewport would scroll the selection to the top and pin it there on every remount.
		const measuredRows = taskViewport.height - 1;
		if (measuredRows > 0) {
			const nextFirstVisible = visibleStart(scrollAnchor, taskFirstVisible, measuredRows, rows.length);
			if (nextFirstVisible !== taskFirstVisible) {
				taskFirstVisible = nextFirstVisible;
				opts.onTaskScrollChange?.(taskFirstVisible);
			}
		} else {
			taskFirstVisible = Math.max(0, Math.min(taskFirstVisible, Math.max(0, rows.length - 1)));
		}
		filterText.content = opts.filterSummary ?? "All tasks";
		const showDetails = detailsVisible && !fullscreen;
		detailRegion.visible = showDetails;
		detailRegion.height = showDetails ? "30%" : 0;
		taskList.visible = taskPaneVisible && !fullscreen;
		navbar.visible = !fullscreen;
		footer.visible = !fullscreen;
		agentHeader.visible = !fullscreen && Boolean(selectedSession());
		body.columnGap = taskPaneVisible && !fullscreen ? 1 : 0;
		taskText.content = rows.length
			? new StyledText(
					rows.slice(taskFirstVisible, taskFirstVisible + visibleTaskRows()).flatMap((row, offset) => {
						const rowIndex = taskFirstVisible + offset;
						const selected = rowIndex === selectedRow;
						if (row.kind === "group") {
							const label = `${"  ".repeat(row.depth)}${row.collapsed ? "▸" : "▾"} ${row.name} (${row.taskCount})`;
							if (selected) {
								return t`${bg(SELECTED_TASK_BACKGROUND)(fg(SELECTED_TASK_FOREGROUND)(bold(label)))}\n`.chunks;
							}
							return t`${fg("#60a5fa")(bold(label))}\n`.chunks;
						}
						const task = opts.tasks.find((entry) => entry.id === row.id);
						if (!task) return [];
						const projectedMode = opts.modeProjectionByTask?.(task.id);
						const indication = indicationByTask.get(task.id);
						const marker = indication ? "●" : "";
						const label = renderModeRowLabel({
							title: task.title,
							modeLabel: projectedMode?.modeLabel ?? "",
							approved: projectedMode?.approved ?? false,
							selected,
							activityMarker: marker,
							depth: row.depth,
							done: isTerminalStatus(task.status, opts.statuses ?? []),
							width: Math.max(0, taskViewport.width - 2),
							narrow: taskViewport.width < 24,
						});
						const terminal = isTerminalStatus(task.status, opts.statuses ?? []);
						const title = sliceByCells(label.text, label.title.start, label.title.end);
						const beforeTitle = sliceByCells(label.text, 0, label.title.start);
						const activityStart = 0;
						const activityEnd = activityStart + (indication ? marker.length : 0);
						const afterActivity = beforeTitle.slice(activityEnd);
						const modeColor = modeDisplayColor(projectedMode?.modeColor, selected);
						const styled = (value: string, color?: string, done = false, emphasize = true) => {
							let content = emphasize ? bold(value) : value;
							if (done) content = strikethrough(content);
							if (color || selected) content = fg(color ?? SELECTED_TASK_FOREGROUND)(content);
							if (selected) content = bg(SELECTED_TASK_BACKGROUND)(content);
							return t`${content}`.chunks;
						};
						const rowChunks = [
							...styled(beforeTitle.slice(0, activityStart)),
							...(indication
								? styled(
										marker,
										selected ? getSelectedIndicationColor(indication) : getIndicationColor(indication),
										false,
										false,
									)
								: []),
							...styled(afterActivity),
							...styled(title, undefined, terminal),
							...styled(sliceByCells(label.text, label.title.end, label.mode.start)),
							...styled(label.text.slice(label.mode.characterStart, label.mode.characterEnd), modeColor),
							...styled(label.text.slice(label.mode.characterEnd)),
						];
						return [...rowChunks, ...t`\n`.chunks];
					}),
				)
			: "No tasks.";
		const task = selectedTask();
		// The controller precomputes one rich TaskDetail for the selected task; entries without
		// one (fixtures, or before the detail read lands) keep the compact fallback.
		const selectedDetail = task ? opts.taskDetails?.get(task.id) : undefined;
		if (artifactView) {
			artifactView.root.visible = artifactViewOpen && Boolean(task && opts.taskArtifactApi);
			if (task && task.id !== artifactViewTaskId) {
				artifactViewTaskId = task.id;
				void artifactView.setTask(task.id, opts.taskArtifactPathsByTask?.get(task.id));
			}
		}
		detailText.visible = !artifactViewOpen;
		if (!task) {
			detailText.content = "No task selected.";
		} else if (selectedDetail) {
			detailText.content = generateTaskDetailStyled(selectedDetail, opts.taskDetailOptions ?? {});
		} else {
			detailText.content = t`${bold(fg("blue")(task.id))} - ${task.title}\n${taskDetails(task)}`;
		}
		const session = selectedSession();
		const liveAgent = opts.liveAgent?.taskId === selectedTask()?.id ? opts.liveAgent : undefined;
		const activeHost = liveAgent?.status !== "error" ? liveAgent?.host : undefined;
		if (mountedAgent !== activeHost || agentMount !== (activeHost ? liveAgent?.terminal : undefined)) {
			detachAgent();
			mountedAgent = activeHost;
			agentMount = activeHost ? liveAgent?.terminal : undefined;
			if (agentMount) {
				agentOutput.add(agentMount);
				agentMount.on("focused", onAgentFocus);
				agentMount.invalidate();
			}
		}
		const selectedMode = task ? opts.modeProjectionByTask?.(task.id) : undefined;
		const modeLabel = selectedMode?.modeLabel ?? opts.selectedModeId ?? "mode";
		const headerModeColor = modeDisplayColor(selectedMode?.modeColor);
		const headerStatus = session?.status ?? "stopped";
		agentHeader.content = headerModeColor
			? t`Agent session · ${headerStatus} · ${fg(headerModeColor)(bold(modeLabel))} · ${session?.cwd ?? ""}`
			: `Agent session · ${headerStatus} · ${modeLabel} · ${session?.cwd ?? ""}`;
		agentPlaceholder.visible = !agentMount && (!session || session.status === "stopped");
		if (agentFocused && !agentMount) {
			agentFocused = false;
			opts.onAgentFocusChange?.(false);
		}
		agentText.content =
			session?.status === "stopped"
				? `Session ended · press ${shortcut(shortcutsConfig.workspace.sessions)} to resume`
				: session
					? ""
					: `No session in ${modeLabel}`;
		const navigationShortcuts = [
			task && opts.taskArtifactApi
				? `[${formatShortcut(artifactViewShortcut, opts.keyboardOverrides)}] Artifacts`
				: undefined,
			opts.onTaskCreate ? `[${shortcut(shortcutsConfig.workspace.createTask)}] Create` : undefined,
			opts.onNewGroup ? `[${shortcut(shortcutsConfig.workspace.newGroup)}] Group` : undefined,
			rows[selectedRow]?.kind === "group" && opts.onGroupToggle
				? `[${shortcut(shortcutsConfig.workspace.expand)}] Expand · [${shortcut(shortcutsConfig.workspace.collapse)}] Collapse`
				: undefined,
			task && !detailsVisible ? `[${shortcut(shortcutsConfig.workspace.toggleDetails)}] Details` : undefined,
			selectedTaskHasSessions()
				? opts.onSessionRequest && opts.onHandoffRequest
					? `[${shortcut(shortcutsConfig.workspace.sessions)}] Sessions · [${shortcut(shortcutsConfig.workspace.handoff)}] Handoff`
					: opts.onSessionRequest
						? `[${shortcut(shortcutsConfig.workspace.sessions)}] Sessions`
						: opts.onHandoffRequest
							? `[${shortcut(shortcutsConfig.workspace.handoff)}] Handoff`
							: undefined
				: task && opts.onAgentStart
					? `[${shortcut(shortcutsConfig.workspace.select)}] Start`
					: undefined,
			task && !isTerminalStatus(task.status, opts.statuses ?? []) && opts.onTaskAction
				? `[${shortcut(shortcutsConfig.workspace.markDone)}] Done`
				: undefined,
			task && opts.onTaskAction ? `[${shortcut(shortcutsConfig.workspace.deleteTask)}] Delete` : undefined,
			rows[selectedRow]?.kind === "group" && opts.onGroupDelete
				? `[${shortcut(shortcutsConfig.workspace.deleteTask)}] Delete`
				: undefined,
			opts.onFilterRequest ? `[${shortcut(shortcutsConfig.workspace.filter)}] Filter` : undefined,
			agentMount ? `[${shortcut(shortcutsConfig.workspace.fullscreen)}] Fullscreen` : undefined,
			opts.onSettingsRequest ? `[${shortcut(shortcutsConfig.workspace.settings)}] Settings` : undefined,
			opts.onQuit ? `[${shortcut(shortcutsConfig.workspace.quit)}] Exit` : undefined,
		].filter((value): value is string => Boolean(value));
		if (opts.onHelp) {
			navigationShortcuts.push(`[${shortcut(shortcutsConfig.workspace.help)}] Help`);
		}
		const shortcuts = artifactViewOpen
			? `Artifacts · ${formatShortcut(artifactCloseShortcut, opts.keyboardOverrides)}: close · ↑/↓: select · ${formatShortcut(shortcutsConfig.taskViewer.approveArtifact, opts.keyboardOverrides)}: Approve current version · ${formatShortcut(shortcutsConfig.taskViewer.revokeArtifact, opts.keyboardOverrides)}: Revoke approval`
			: (opts.footer ?? navigationShortcuts.join(" · "));
		footer.content = agentFocused
			? ` Agent input · [${shortcut(shortcutsConfig.workspace.quickPreviewExit)}] Leave agent `
			: notice
				? `${notice}\n${shortcuts}`
				: shortcuts;
		detailRegion.bottomTitle = detailsVisible
			? ` Press ${shortcut(shortcutsConfig.workspace.toggleDetails)} to collapse `
			: undefined;
		fullscreenHint.visible = fullscreen;
		fullscreenHint.content = ` Press ${shortcut(shortcutsConfig.workspace.quickPreviewExit)} to exit fullscreen `;
		taskList.borderColor = "#555555";
		agentRegion.borderColor = agentFocused ? "yellow" : "gray";
		agentRegion.border = !fullscreen;
		agentRegion.title = agentFocused ? " Live preview (active) " : " Live preview ";
		if (agentFocused) {
			taskList.blur();
			// A controller-owned modal owns focus while it is open; a refresh must not take it.
			const focused = renderer.currentFocusedRenderable;
			if (!focused || surface.focused || surface.hasFocusedDescendant) agentMount?.focus();
		} else {
			agentMount?.blur();
			// Restore pane focus after controller remounts without stealing modal focus.
			const focused = renderer.currentFocusedRenderable;
			if (taskPaneVisible && (!focused || surface.focused || surface.hasFocusedDescendant)) taskList.focus();
			else taskList.blur();
		}
		renderer.requestRender();
	};
	const focusAgent = (): void => {
		if (agentFocused) return;
		agentFocused = true;
		opts.onAgentFocusChange?.(true);
		redraw();
	};
	const onAgentFocus = (): void => {
		focusAgent();
	};
	const detachAgent = (): void => {
		if (!agentMount) return;
		agentMount.off("focused", onAgentFocus);
		agentMount.blur();
		if (agentMount.hasSelection()) renderer.clearSelection();
		agentOutput.remove(agentMount);
		agentMount = undefined;
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
	const requestTaskAction = (action: OpenTuiWorkspaceTaskAction): void => {
		const task = selectedTask();
		if (!task) return;
		if (action === "done" && isTerminalStatus(task.status, opts.statuses ?? [])) return;
		opts.onTaskAction?.(task, action);
	};
	const onKeyPress = (key: KeyEvent): void => {
		if (disposed || key.eventType === "release") return;
		if (renderer.currentFocusedRenderable && !surface.focused && !surface.hasFocusedDescendant) return;
		// A retained terminal can regain native focus before the controller observes
		// its focus event (for example when a session picker closes).
		if (agentMount?.focused) focusAgent();
		if (agentFocused) {
			key.preventDefault();
			key.stopPropagation();
			if (!agentKeybindings.dispatch(key)) agentMount?.handleKeyPress(key);
			return;
		}
		if (artifactViewOpen) {
			if (matchesShortcut(artifactCloseShortcut, key, opts.keyboardOverrides)) {
				key.preventDefault();
				key.stopPropagation();
				artifactViewOpen = false;
				artifactView?.setOpen(false);
				redraw();
				taskList.focus();
				return;
			}
			if (matchesShortcut(shortcutsConfig.taskViewer.approveArtifact, key, opts.keyboardOverrides)) {
				key.preventDefault();
				key.stopPropagation();
				void artifactView?.approveCurrentVersion();
				return;
			}
			if (matchesShortcut(shortcutsConfig.taskViewer.revokeArtifact, key, opts.keyboardOverrides)) {
				key.preventDefault();
				key.stopPropagation();
				void artifactView?.revokeApproval();
				return;
			}
			if (
				matchesShortcut(shortcutsConfig.shared.up, key, opts.keyboardOverrides) ||
				matchesShortcut(shortcutsConfig.shared.down, key, opts.keyboardOverrides)
			) {
				key.preventDefault();
				key.stopPropagation();
				void artifactView?.navigate(matchesShortcut(shortcutsConfig.shared.up, key, opts.keyboardOverrides) ? -1 : 1);
				return;
			}
		}
		if (
			opts.taskArtifactApi &&
			!findShortcutConflict(artifactViewShortcut, artifactViewShortcut.keys[0], opts.keyboardOverrides) &&
			matchesShortcut(artifactViewShortcut, key, opts.keyboardOverrides)
		) {
			const task = selectedTask();
			if (task) {
				key.preventDefault();
				key.stopPropagation();
				mountArtifactView(task.id);
				return;
			}
		}
		keybindings.dispatch(key);
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
		if (!agentMount) return;
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
		opts.onAgentStart?.(
			task,
			Math.max(1, agentOutput.width || Math.floor((renderer.width - 1) * (taskPaneVisible ? 0.7 : 1)) - 2),
			Math.max(1, agentOutput.height || renderer.height - 9),
		);
	});
	keybindings.on(shortcutsConfig.workspace.editTask, () => requestTaskAction("edit"));
	keybindings.on(shortcutsConfig.workspace.copyTask, () => requestTaskAction("copy"));
	keybindings.on(shortcutsConfig.workspace.completeTask, () => requestTaskAction("complete"));
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
	taskList.onMouseScroll = (event): void => {
		event.preventDefault();
		event.stopPropagation();
		if (agentFocused || !event.scroll) return;
		const delta = event.scroll.direction === "up" ? -1 : event.scroll.direction === "down" ? 1 : 0;
		if (delta) select(selectedRow + delta);
	};
	taskText.onMouseUp = (event): void => {
		if (event.button !== 0) return;
		const row = event.y - taskText.screenY;
		const rowIndex = taskFirstVisible + row;
		if (rowIndex < 0 || rowIndex >= rows.length) return;
		event.preventDefault();
		event.stopPropagation();
		agentFocused = false;
		opts.onAgentFocusChange?.(false);
		select(rowIndex);
		redraw();
	};
	keybindings.on(shortcutsConfig.workspace.toggleDetails, () => toggleDetails());
	keybindings.on(shortcutsConfig.workspace.toggleTaskPane, () => toggleTaskPane());
	const previousTaskViewportOnSizeChange = taskViewport.onSizeChange;
	const onTaskViewportSizeChange = (): void => {
		previousTaskViewportOnSizeChange?.call(taskViewport);
		redraw();
	};
	taskViewport.onSizeChange = onTaskViewportSizeChange;
	const onResize = (): void => redraw();
	const onPaste = (event: PasteEvent): void => {
		if (disposed || !agentFocused || !mountedAgent) return;
		if (renderer.currentFocusedRenderable && !surface.focused && !surface.hasFocusedDescendant) return;
		event.preventDefault();
		event.stopPropagation();
		agentMount?.handlePaste(event);
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
			if (taskViewport.onSizeChange === onTaskViewportSizeChange) {
				taskViewport.onSizeChange = previousTaskViewportOnSizeChange;
			}
			keybindings.clear();
			agentKeybindings.clear();
			detachAgent();
			artifactView?.dispose();
			surface.destroyRecursively();
		},
	};
}
