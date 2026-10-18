import {
	BoxRenderable,
	bg,
	bold,
	type CliRenderer,
	fg,
	type KeyEvent,
	StyledText,
	TextAttributes,
	TextRenderable,
} from "@opentui/core";
import { getMilestoneLabel } from "../../core/milestones.ts";
import type { Milestone, Task } from "../../types/index.ts";
import { formatAssignee } from "../../utils/assignee-filter.ts";
import type { Board, BoardMoveCommit } from "./board/models/board.ts";
import { mountOpenTuiHelpOverlay, type OpenTuiHelpOverlayMount } from "./filters.ts";
import {
	createKeybindings,
	formatShortcut as formatConfiguredShortcut,
	keybindingPropagation,
	type ShortcutDescriptor,
	type ShortcutOverrides,
	shortcutHelpItems,
	shortcutsConfig,
} from "./keybindings.ts";
import { mountOpenTuiTaskActions, type OpenTuiTaskAction, type OpenTuiTaskActionsMount } from "./task-actions.ts";

const FOOTER_ROWS = 1;
const BOARD_ROWS = 4;
const COLUMN_GAP = "  ";

export type OpenTuiBoardUpdate = (tasks: readonly Task[], statuses: readonly string[]) => void;
export type OpenTuiBoardTaskAction = Exclude<OpenTuiTaskAction, "cancel">;

/** Controller-owned intents emitted by retained board interactions. */
export type OpenTuiBoardCallbacks = {
	/** Fires after keyboard navigation selects another task or lane. */
	readonly onSelectionChange?: (task: Task | undefined) => void;
	/** Receives current selection before controller switches board view. */
	readonly onViewSwitch?: (task: Task | undefined) => void;
	/** Receives current selection before controller opens workspace. */
	readonly onWorkspaceHandoff?: (task: Task | undefined) => void;
	/** Fires when shortcut help opens. */
	readonly onHelp?: () => void;
	readonly onSettingsRequest?: () => void;
	/** Requests the controller-owned filter editor. */
	readonly onFilterRequest?: () => void;
	/** Receives edit, copy, complete, or archive request for selected task. */
	readonly onTaskAction?: (task: Task, action: OpenTuiBoardTaskAction) => void;
	/** Requests controller-owned task creation. */
	readonly onTaskCreate?: () => void;
	/** Requests persistence of next empty-column visibility setting. */
	readonly onHideEmptyToggle?: (hideEmpty: boolean) => void;
	/** Fires after Board enters local move-preview mode. */
	readonly onMoveStart?: (task: Task) => void;
	/** Fires after Board cancels local move-preview mode. */
	readonly onMoveCancel?: () => void;
	/** Receives immutable move or reorder intent for controller persistence. */
	readonly onMoveCommit?: (commit: BoardMoveCommit) => void;
	readonly onHistoryBack?: () => void;
	readonly onHistoryForward?: () => void;
};

export type OpenTuiBoardProps = OpenTuiBoardCallbacks & {
	readonly board: Board;
	readonly tasks?: readonly Task[];
	readonly statuses?: readonly string[];
	readonly milestoneMode?: boolean;
	readonly milestones?: readonly Milestone[];
	readonly filterSummary?: string;
	readonly notice?: string;
	readonly keyboardOverrides?: ShortcutOverrides;
	readonly onTaskSelect?: (task: Task) => void;
	readonly onQuit?: () => void;
	readonly subscribe?: (listener: OpenTuiBoardUpdate) => () => void;
};

export type OpenTuiBoardMount = {
	dispose(): void;
};

function clipped(value: string, width: number): string {
	if (width <= 0) return "";
	if (Bun.stringWidth(value) <= width) return value;
	let result = "";
	let cells = 0;
	for (const character of value) {
		const size = Bun.stringWidth(character);
		if (cells + size > width - 1) break;
		result += character;
		cells += size;
	}
	return `${result}…`;
}

function pad(value: string, width: number): string {
	const content = clipped(value, width);
	return `${content}${" ".repeat(Math.max(0, width - Bun.stringWidth(content)))}`;
}

type BoardRow = { label: string } | { tasks: (Task | undefined)[] };

function boardRows(board: Board, props: OpenTuiBoardProps): BoardRow[] {
	const lanes = board.lanes;
	const rows: BoardRow[] = [];
	const appendTasks = (columns: readonly Task[][]): void => {
		const count = Math.max(0, ...columns.map((tasks) => tasks.length));
		for (let index = 0; index < count; index++) {
			rows.push({ tasks: columns.map((tasks) => tasks[index]) });
		}
	};
	// Move previews retain the model's insertion order, including recruited tasks.
	if (!props.milestoneMode || board.move) {
		appendTasks(lanes.map((lane) => lane.tasks));
		return rows;
	}
	const milestones = [...(props.milestones ?? [])];
	const groups = new Map<string, { label: string; columns: Task[][] }>();
	for (const [column, lane] of lanes.entries()) {
		for (const task of lane.tasks) {
			const milestone = task.milestone?.trim() ?? "";
			const key = milestone;
			let group = groups.get(key);
			if (!group) {
				group = {
					label: milestone ? getMilestoneLabel(milestone, milestones) : "No Milestone",
					columns: lanes.map(() => []),
				};
				groups.set(key, group);
			}
			group.columns[column]?.push(task);
		}
	}
	const orderedKeys = new Set(["", ...milestones.map((milestone) => milestone.id), ...groups.keys()]);
	for (const key of orderedKeys) {
		const group = groups.get(key);
		if (!group) continue;
		rows.push({ label: group.label });
		appendTasks(group.columns);
	}
	return rows;
}

function selectedTaskContent(task: Task | undefined): string {
	if (!task) return "No task selected";
	const assignees = task.assignee.map(formatAssignee).filter((assignee) => assignee !== null);
	const metadata = [task.priority, task.type, assignees.length ? assignees.join(", ") : undefined]
		.filter((value): value is string => Boolean(value))
		.join(" · ");
	return metadata ? `${task.id}: ${task.title} · ${metadata}` : `${task.id}: ${task.title}`;
}

/** Mount a retained OpenTUI Kanban board into an existing host. */
export function mountOpenTuiBoard(
	renderer: CliRenderer,
	parent: BoxRenderable,
	props: OpenTuiBoardProps,
): OpenTuiBoardMount {
	const formatShortcut = (shortcut: ShortcutDescriptor): string =>
		formatConfiguredShortcut(
			{ ...shortcut, keys: shortcut.keys.slice(0, 1), label: undefined },
			props.keyboardOverrides,
		);
	const root = new BoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		flexDirection: "column",
	});
	const filtersText = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: `${formatShortcut(shortcutsConfig.board.filter)}: filters · ${props.filterSummary ?? "All tasks"}`,
		wrapMode: "none",
	});
	const boardText = new TextRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		content: "",
		wrapMode: "none",
	});
	const selectedText = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: "",
		wrapMode: "none",
		attributes: TextAttributes.DIM,
	});
	const footer = new TextRenderable(renderer, {
		width: "100%",
		height: FOOTER_ROWS,
		content: "",
		flexShrink: 0,
		wrapMode: "none",
		attributes: TextAttributes.DIM,
	});
	root.add(filtersText);
	root.add(boardText);
	root.add(selectedText);
	root.add(footer);
	parent.add(root);

	if (props.tasks) props.board.update(props.tasks, props.statuses);
	let disposed = false;
	let helpOverlay: OpenTuiHelpOverlayMount | undefined;
	let taskActions: OpenTuiTaskActionsMount | undefined;
	let selectionId = props.board.selectedTask?.id;
	let selectionStatus = props.board.selectedLane?.status;
	let firstRow = 0;
	let firstColumn = 0;
	const redraw = (): void => {
		if (disposed) return;
		const lanes = props.board.lanes;
		const move = props.board.move;
		const activeStatus = move?.targetStatus ?? props.board.selectedLane?.status;
		const activeId = move?.highlightTaskId ?? move?.taskId ?? props.board.selectedTask?.id;
		const activeColumn = lanes.findIndex((lane) => lane.status === activeStatus);
		const terminalWidth = Math.max(1, root.width || renderer.width);
		const hints = move
			? [
					`${formatShortcut(shortcutsConfig.board.quit)} Exit`,
					`${formatShortcut(shortcutsConfig.board.previousColumn)}/${formatShortcut(shortcutsConfig.board.nextColumn)} Status`,
					`${formatShortcut(shortcutsConfig.board.previousTask)}/${formatShortcut(shortcutsConfig.board.nextTask)} Position`,
					`${formatShortcut(shortcutsConfig.board.confirm)} Confirm`,
					`${formatShortcut(shortcutsConfig.board.cancelMove)} Cancel`,
				]
			: [
					`${formatShortcut(shortcutsConfig.board.quit)} Exit`,
					`${formatShortcut(shortcutsConfig.board.createTask)} Create`,
					...(props.board.selectedTask ? [`${formatShortcut(shortcutsConfig.board.editTask)} Edit`] : []),
					`${formatShortcut(shortcutsConfig.board.filter)} Filter`,
					`${formatShortcut(shortcutsConfig.board.previousColumn)}/${formatShortcut(shortcutsConfig.board.nextColumn)} Status`,
					`${formatShortcut(shortcutsConfig.board.previousTask)}/${formatShortcut(shortcutsConfig.board.nextTask)} Tasks`,
					`${formatShortcut(shortcutsConfig.board.switchView)} Workspace`,
					`${formatShortcut(shortcutsConfig.board.help)} Help`,
				];
		const footerLines: string[] = [];
		for (const hint of hints) {
			const last = footerLines.length - 1;
			if (last >= 0 && Bun.stringWidth(`${footerLines[last]} · ${hint}`) <= terminalWidth)
				footerLines[last] += ` · ${hint}`;
			else footerLines.push(hint);
		}
		footer.height = footerLines.length;
		footer.content = footerLines.join("\n");
		const columnCount = Math.max(1, Math.min(lanes.length, Math.floor((terminalWidth + COLUMN_GAP.length) / 24)));
		firstColumn = Math.max(0, Math.min(firstColumn, lanes.length - columnCount));
		if (activeColumn < firstColumn) firstColumn = Math.max(0, activeColumn);
		if (activeColumn >= firstColumn + columnCount) firstColumn = activeColumn - columnCount + 1;
		const width = Math.max(1, Math.floor((terminalWidth - COLUMN_GAP.length * (columnCount - 1)) / columnCount));
		const visibleLanes = lanes.slice(firstColumn, firstColumn + columnCount);
		const rows = boardRows(props.board, props);
		const visibleRows = Math.max(1, (root.height || renderer.height) - BOARD_ROWS - footerLines.length);
		const activeRow = rows.findIndex((row) => "tasks" in row && row.tasks.some((task) => task?.id === activeId));
		firstRow = Math.max(0, Math.min(firstRow, rows.length - visibleRows));
		if (activeRow >= 0 && activeRow < firstRow) firstRow = activeRow;
		if (activeRow >= firstRow + visibleRows) firstRow = activeRow - visibleRows + 1;
		const chunks: StyledText["chunks"] = [];
		for (const [index, lane] of visibleLanes.entries()) {
			if (index > 0) chunks.push({ __isChunk: true, text: COLUMN_GAP });
			const label = pad(`${lane.status || "No Status"} (${lane.tasks.length})`, width);
			chunks.push(lane.status === activeStatus ? bold(fg("cyan")(label)) : bold(label));
		}
		chunks.push({ __isChunk: true, text: `\n${"─".repeat(terminalWidth)}` });
		for (const row of rows.slice(firstRow, firstRow + visibleRows)) {
			chunks.push({ __isChunk: true, text: "\n" });
			if ("label" in row) {
				chunks.push(bold(fg("cyan")(clipped(row.label, terminalWidth))));
				continue;
			}
			for (const [index, lane] of visibleLanes.entries()) {
				if (index > 0) chunks.push({ __isChunk: true, text: COLUMN_GAP });
				const task = row.tasks[firstColumn + index];
				const selected = task && lane.status === activeStatus && task.id === activeId;
				const recruited = task && move?.selectedIds.includes(task.id);
				const text = task
					? pad(`${selected ? ">" : recruited ? "+" : " "} ${task.id} ${task.title}`, width)
					: " ".repeat(width);
				chunks.push(selected ? bold(bg("#9fd8f5")(fg("#08131b")(text))) : { __isChunk: true, text });
			}
		}
		if (lanes.length === 0) chunks.push({ __isChunk: true, text: "\nNo board columns configured." });
		else if (rows.length === 0) chunks.push({ __isChunk: true, text: "\nNo tasks match the current filters." });
		boardText.content = new StyledText(chunks);
		selectedText.content = props.notice || selectedTaskContent(props.board.selectedTask);
		renderer.requestRender();
	};
	const notifySelectionChange = (): void => {
		const task = props.board.selectedTask;
		const status = props.board.selectedLane?.status;
		if (task?.id === selectionId && status === selectionStatus) return;
		selectionId = task?.id;
		selectionStatus = status;
		props.onSelectionChange?.(task);
	};
	const moveColumn = (direction: -1 | 1): boolean => {
		if (props.board.move) {
			return props.board.moveToAdjacentLane(direction === -1 ? "previous" : "next");
		}
		const lanes = props.board.lanes;
		const current = lanes.findIndex((lane) => lane.status === props.board.selectedLane?.status);
		const next = Math.max(0, Math.min(lanes.length - 1, (current < 0 ? 0 : current) + direction));
		const lane = lanes[next];
		if (!lane) return false;
		return props.board.select(
			lane.status,
			lane.tasks[Math.max(0, props.board.selectedLane?.selectedIndex ?? 0)]?.id ?? null,
		);
	};
	const moveTask = (delta: number): boolean => {
		if (props.board.move) return props.board.moveInsertion(delta < 0 ? "up" : "down");
		const lane = props.board.selectedLane;
		if (!lane || lane.tasks.length === 0) return false;
		const column = props.board.lanes.findIndex((candidate) => candidate.status === lane.status);
		const tasks = boardRows(props.board, props).flatMap((row) => {
			const task = "tasks" in row ? row.tasks[column] : undefined;
			return task ? [task] : [];
		});
		const current = tasks.findIndex((task) => task.id === lane.selectedId);
		const index = Math.max(0, Math.min(tasks.length - 1, current + delta));
		return props.board.select(lane.status, tasks[index]?.id ?? null);
	};
	const beginMove = (): void => {
		const task = props.board.selectedTask;
		if (!task || props.board.beginMove() !== "entered") return;
		props.onMoveStart?.(task);
	};
	const cancelMove = (): void => {
		if (!props.board.cancelMove()) return;
		props.onMoveCancel?.();
	};
	const commitMove = (): void => {
		const commit = props.board.completeMove();
		if (commit) props.onMoveCommit?.(commit);
	};
	const requestTaskAction = (action: OpenTuiBoardTaskAction): boolean => {
		const task = props.board.selectedTask;
		if (!task || props.board.move || !props.onTaskAction) return false;
		props.onTaskAction(task, action);
		return true;
	};
	const presentHelp = (): void => {
		if (helpOverlay) return;
		if (props.onHelp) {
			props.onHelp();
			return;
		}
		const overlay = mountOpenTuiHelpOverlay(renderer, parent, {
			items: shortcutHelpItems("board"),
			overrides: props.keyboardOverrides,
			onClose: () => {
				helpOverlay = undefined;
			},
		});
		helpOverlay = overlay;
	};
	const presentTaskActions = (): boolean => {
		const task = props.board.selectedTask;
		if (!task || props.board.move || !props.onTaskAction || taskActions) return false;
		const modal = mountOpenTuiTaskActions(renderer, parent, {
			task,
			onEdit: (candidate) => props.onTaskAction?.(candidate, "edit"),
			onCopy: (candidate) => props.onTaskAction?.(candidate, "copy"),
			onComplete: (candidate) => props.onTaskAction?.(candidate, "complete"),
			onArchive: (candidate) => props.onTaskAction?.(candidate, "archive"),
			onCancel: () => undefined,
		});
		taskActions = modal;
		void modal.result.then(
			() => {
				if (taskActions === modal) taskActions = undefined;
			},
			() => {
				if (taskActions === modal) taskActions = undefined;
			},
		);
		return true;
	};
	const keybindings = createKeybindings(() => props.keyboardOverrides ?? {});
	const finishInteraction = (selectionChanged = false): void => {
		if (selectionChanged) notifySelectionChange();
		redraw();
	};
	const handleCancelMove = () => {
		if (!props.board.move) return keybindingPropagation.ignore;
		cancelMove();
		finishInteraction();
	};
	const handleQuit = (): void => {
		props.onQuit?.();
	};
	const handleViewSwitch = (): void => {
		props.onViewSwitch?.(props.board.selectedTask);
		finishInteraction();
	};
	const handleWorkspaceHandoff = (): void => {
		props.onWorkspaceHandoff?.(props.board.selectedTask);
		finishInteraction();
	};
	const handleCreate = (): void => {
		props.onTaskCreate?.();
		finishInteraction();
	};
	const handleHelp = (): void => {
		presentHelp();
		finishInteraction();
	};
	const handleTaskActions = (): void => {
		finishInteraction(presentTaskActions());
	};
	const handleHideEmptyToggle = (): void => {
		props.onHideEmptyToggle?.(!props.board.hideEmptyColumns);
		finishInteraction();
	};
	const handleRecruit = (): void => {
		finishInteraction(props.board.move ? props.board.toggleRecruit() !== "inactive" : false);
	};
	const handleMove = (): void => {
		if (props.board.move) commitMove();
		else beginMove();
		finishInteraction(true);
	};
	const handlePreviousColumn = (): void => {
		finishInteraction(moveColumn(-1));
	};
	const handleNextColumn = (): void => {
		finishInteraction(moveColumn(1));
	};
	const handlePreviousTask = (): void => {
		finishInteraction(moveTask(-1));
	};
	const handleNextTask = (): void => {
		finishInteraction(moveTask(1));
	};
	const handlePageUp = () => {
		if (props.board.move) return keybindingPropagation.ignore;
		finishInteraction(moveTask(-Math.max(1, renderer.height - BOARD_ROWS - FOOTER_ROWS)));
	};
	const handlePageDown = () => {
		if (props.board.move) return keybindingPropagation.ignore;
		finishInteraction(moveTask(Math.max(1, renderer.height - BOARD_ROWS - FOOTER_ROWS)));
	};
	const handleFirst = () => {
		if (props.board.move) return keybindingPropagation.ignore;
		finishInteraction(moveTask(-Number.MAX_SAFE_INTEGER));
	};
	const handleLast = () => {
		if (props.board.move) return keybindingPropagation.ignore;
		finishInteraction(moveTask(Number.MAX_SAFE_INTEGER));
	};
	const handleConfirm = () => {
		if (props.board.move) {
			commitMove();
			finishInteraction(true);
			return;
		}
		const task = props.board.selectedTask;
		if (!task) return keybindingPropagation.ignore;
		props.onTaskSelect?.(task);
		finishInteraction();
	};
	const handleEdit = (): void => {
		finishInteraction(requestTaskAction("edit"));
	};
	const handleCopy = (): void => {
		finishInteraction(requestTaskAction("copy"));
	};
	const handleComplete = (): void => {
		finishInteraction(requestTaskAction("complete"));
	};
	const handleArchive = (): void => {
		finishInteraction(requestTaskAction("archive"));
	};
	keybindings.on(shortcutsConfig.board.cancelMove, handleCancelMove);
	keybindings.on(shortcutsConfig.board.quit, handleQuit);
	keybindings.on(shortcutsConfig.board.historyBack, () => {
		if (!props.board.move) props.onHistoryBack?.();
	});
	keybindings.on(shortcutsConfig.board.historyForward, () => {
		if (!props.board.move) props.onHistoryForward?.();
	});
	keybindings.on(shortcutsConfig.board.switchView, handleViewSwitch);
	keybindings.on(shortcutsConfig.board.workspace, handleWorkspaceHandoff);
	keybindings.on(shortcutsConfig.board.createTask, handleCreate);
	keybindings.on(shortcutsConfig.board.help, handleHelp);
	keybindings.on(shortcutsConfig.board.taskActions, handleTaskActions);
	keybindings.on(shortcutsConfig.board.toggleHideEmpty, handleHideEmptyToggle);
	keybindings.on(shortcutsConfig.board.recruit, handleRecruit);
	keybindings.on(shortcutsConfig.board.move, handleMove);
	keybindings.on(shortcutsConfig.board.previousColumn, handlePreviousColumn);
	keybindings.on(shortcutsConfig.board.nextColumn, handleNextColumn);
	keybindings.on(shortcutsConfig.board.previousTask, handlePreviousTask);
	keybindings.on(shortcutsConfig.board.nextTask, handleNextTask);
	keybindings.on(shortcutsConfig.board.pageUp, handlePageUp);
	keybindings.on(shortcutsConfig.board.pageDown, handlePageDown);
	keybindings.on(shortcutsConfig.board.first, handleFirst);
	keybindings.on(shortcutsConfig.board.last, handleLast);
	keybindings.on(shortcutsConfig.board.confirm, handleConfirm);
	keybindings.on(shortcutsConfig.board.editTask, handleEdit);
	keybindings.on(shortcutsConfig.board.copyTask, handleCopy);
	keybindings.on(shortcutsConfig.board.completeTask, handleComplete);
	keybindings.on(shortcutsConfig.board.archiveTask, handleArchive);
	keybindings.on(shortcutsConfig.board.filter, () => {
		if (!props.board.move) props.onFilterRequest?.();
	});
	keybindings.on(shortcutsConfig.board.settings, () => {
		if (!props.board.move) props.onSettingsRequest?.();
	});
	const onKeyPress = (key: KeyEvent): void => {
		if (key.eventType === "release" || key.propagationStopped || disposed || helpOverlay || taskActions) return;
		if (renderer.currentFocusedRenderable && !root.focused && !root.hasFocusedDescendant) return;
		keybindings.dispatch(key);
	};
	const unsubscribe = props.subscribe?.((tasks, statuses) => {
		props.board.update(tasks, statuses);
		notifySelectionChange();
		redraw();
	});
	renderer.keyInput.on("keypress", onKeyPress);
	renderer.on("resize", redraw);
	root.on("resized", redraw);
	redraw();

	return {
		dispose(): void {
			if (disposed) return;
			disposed = true;
			unsubscribe?.();
			renderer.keyInput.off("keypress", onKeyPress);
			renderer.off("resize", redraw);
			root.off("resized", redraw);
			keybindings.clear();
			helpOverlay?.dispose();
			taskActions?.dispose();
			root.destroyRecursively();
		},
	};
}
