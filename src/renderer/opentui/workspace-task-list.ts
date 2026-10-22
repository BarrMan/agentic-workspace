import {
	BoxRenderable,
	bg,
	bold,
	type CliRenderer,
	fg,
	type MouseEvent,
	StyledText,
	strikethrough,
	TextRenderable,
	t,
} from "@opentui/core";
import type { AgentIndication } from "../../model/session/types.ts";
import { isTerminalStatus } from "../../model/task/terminal-status.ts";
import { getIndicationColor, getSelectedIndicationColor } from "../formatters/status-icon.ts";
import type { GroupRow } from "./groups.ts";
import { renderModeRowLabel } from "./mode-row-label.ts";
import type { OpenTuiWorkspaceModeProjectionByTask, OpenTuiWorkspaceTaskEntry } from "./workspace.ts";

const SELECTED_TASK_BACKGROUND = "#cbd5e1";
const SELECTED_TASK_FOREGROUND = "#111111";
const AOE_LIST_WIDTH = 35;
const AOE_PREVIEW_MIN_WIDTH = 40;

/** Task-list wheel changes selection, not TextRenderable's private scroll offset. */
class TaskListText extends TextRenderable {
	protected override onMouseEvent(event: MouseEvent): void {
		if (event.type !== "scroll") super.onMouseEvent(event);
	}
}

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

function visibleStart(selectedIndex: number, firstVisible: number, visibleRows: number, length: number): number {
	if (selectedIndex < firstVisible) return selectedIndex;
	if (selectedIndex >= firstVisible + visibleRows) return selectedIndex - visibleRows + 1;
	return Math.max(0, Math.min(firstVisible, Math.max(0, length - visibleRows)));
}

export type WorkspaceTaskListState = {
	readonly tasks: readonly OpenTuiWorkspaceTaskEntry[];
	readonly statuses: readonly string[];
	readonly rows: readonly GroupRow[];
	readonly selectedRow: number;
	readonly firstVisibleTaskIndex: number;
	readonly indicationByTask: ReadonlyMap<string, AgentIndication>;
	readonly modeProjectionByTask?: OpenTuiWorkspaceModeProjectionByTask;
	readonly displayModeColor: (color: string | undefined, selected: boolean) => string | undefined;
};

export type WorkspaceTaskList = {
	readonly root: BoxRenderable;
	update(state: WorkspaceTaskListState): void;
	dispose(): void;
};

export function mountWorkspaceTaskList(
	renderer: CliRenderer,
	parent: BoxRenderable,
	onSelect: (rowIndex: number) => void,
	onScroll: (delta: number) => void,
	onVisibleStartChange: (firstVisibleTaskIndex: number) => void,
	onLayoutChange: () => void,
): WorkspaceTaskList {
	const root = new BoxRenderable(renderer, {
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
	const viewport = new BoxRenderable(renderer, {
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
	const text = new TaskListText(renderer, {
		width: "100%",
		height: "100%",
		wrapMode: "none",
		overflow: "hidden",
		selectable: false,
	});
	viewport.add(text);
	root.add(viewport);
	parent.add(root);
	let state: WorkspaceTaskListState | undefined;
	let firstVisible = 0;
	let requestedFirstVisible: number | undefined;
	let disposed = false;
	const render = (): void => {
		if (!state || disposed) return;
		root.title = ` Tasks (${state.tasks.length}) `;
		root.width = workspaceTaskListWidth(renderer.width);
		const measuredRows = viewport.height - 1;
		if (measuredRows > 0) {
			const nextFirstVisible = visibleStart(
				Math.max(0, state.selectedRow),
				firstVisible,
				measuredRows,
				state.rows.length,
			);
			if (nextFirstVisible !== firstVisible) {
				firstVisible = nextFirstVisible;
				onScrollChange(firstVisible);
			}
		} else {
			firstVisible = Math.max(0, Math.min(firstVisible, Math.max(0, state.rows.length - 1)));
		}
		const count = Math.max(1, viewport.height - 1);
		text.content = state.rows.length
			? new StyledText(
					state.rows.slice(firstVisible, firstVisible + count).flatMap((row, offset) => {
						const rowIndex = firstVisible + offset;
						const selected = rowIndex === state?.selectedRow;
						if (row.kind === "group") {
							const label = `${"  ".repeat(row.depth)}${row.collapsed ? "▸" : "▾"} ${row.name} (${row.taskCount})`;
							if (selected)
								return t`${bg(SELECTED_TASK_BACKGROUND)(fg(SELECTED_TASK_FOREGROUND)(bold(label)))}\n`.chunks;
							return t`${fg("#60a5fa")(bold(label))}\n`.chunks;
						}
						const task = state?.tasks.find((entry) => entry.id === row.id);
						if (!task) return [];
						const projectedMode = state?.modeProjectionByTask?.(task.id);
						const indication = state?.indicationByTask.get(task.id);
						const marker = indication ? "●" : "";
						const label = renderModeRowLabel({
							title: task.title,
							modeLabel: projectedMode?.modeLabel ?? "",
							approved: projectedMode?.approved ?? false,
							selected,
							activityMarker: marker,
							depth: row.depth,
							done: isTerminalStatus(task.status, state?.statuses ?? []),
							width: Math.max(0, viewport.width - 2),
							narrow: viewport.width < 24,
						});
						const terminal = isTerminalStatus(task.status, state?.statuses ?? []);
						const title = sliceByCells(label.text, label.title.start, label.title.end);
						const beforeTitle = sliceByCells(label.text, 0, label.title.start);
						const afterActivity = beforeTitle.slice(indication ? marker.length : 0);
						const modeColor = state?.displayModeColor(projectedMode?.modeColor, selected);
						const styled = (value: string, color?: string, done = false, emphasize = true) => {
							let content = emphasize ? bold(value) : value;
							if (done) content = strikethrough(content);
							if (color || selected) content = fg(color ?? SELECTED_TASK_FOREGROUND)(content);
							if (selected) content = bg(SELECTED_TASK_BACKGROUND)(content);
							return t`${content}`.chunks;
						};
						return [
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
							...t`\n`.chunks,
						];
					}),
				)
			: "No tasks.";
	};
	const previousOnSizeChange = viewport.onSizeChange;
	const onSizeChange = (): void => {
		previousOnSizeChange?.call(viewport);
		onLayoutChange();
	};
	viewport.onSizeChange = onSizeChange;
	root.onMouseScroll = (event): void => {
		event.preventDefault();
		event.stopPropagation();
		if (!event.scroll) return;
		const delta = event.scroll.direction === "up" ? -1 : event.scroll.direction === "down" ? 1 : 0;
		if (delta) onScroll(delta);
	};
	text.onMouseUp = (event): void => {
		if (event.button !== 0) return;
		const rowIndex = firstVisible + (event.y - text.screenY);
		if (!state || rowIndex < 0 || rowIndex >= state.rows.length) return;
		event.preventDefault();
		event.stopPropagation();
		onSelect(rowIndex);
	};
	const onScrollChange = (firstVisibleTaskIndex: number): void => {
		firstVisible = firstVisibleTaskIndex;
		requestedFirstVisible = firstVisibleTaskIndex;
		onVisibleStartChange(firstVisibleTaskIndex);
	};
	return {
		root,
		update(next): void {
			if (disposed) return;
			if (requestedFirstVisible !== next.firstVisibleTaskIndex) {
				firstVisible = next.firstVisibleTaskIndex;
				requestedFirstVisible = next.firstVisibleTaskIndex;
			}
			state = next;
			render();
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			if (viewport.onSizeChange === onSizeChange) viewport.onSizeChange = previousOnSizeChange;
			root.destroyRecursively();
		},
	};
}
