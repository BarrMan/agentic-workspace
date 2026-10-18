import {
	BoxRenderable,
	type CliRenderer,
	type KeyEvent,
	SelectRenderable,
	TextAttributes,
	TextRenderable,
} from "@opentui/core";
import type { Task } from "../../types/index.ts";
import { formatAssignee } from "../../utils/assignee-filter.ts";
import { createKeybindings, formatShortcut, keybindingPropagation, shortcutsConfig } from "./keybindings.ts";

const OPEN_TUI_TASK_ACTIONS = ["edit", "copy", "complete", "archive", "cancel"] as const;

export type OpenTuiTaskAction = (typeof OPEN_TUI_TASK_ACTIONS)[number];

export type OpenTuiTaskActionCallback = (task: Task) => void | Promise<void>;

export type OpenTuiTaskActionCallbacks = {
	readonly onEdit: OpenTuiTaskActionCallback;
	readonly onCopy: OpenTuiTaskActionCallback;
	readonly onComplete: OpenTuiTaskActionCallback;
	readonly onArchive: OpenTuiTaskActionCallback;
	readonly onCancel: OpenTuiTaskActionCallback;
};

export type OpenTuiTaskActionsOptions = OpenTuiTaskActionCallbacks & {
	readonly task: Task;
	readonly title?: string;
};

export type OpenTuiTaskActionsMount = {
	readonly result: Promise<OpenTuiTaskAction>;
	dispose(): void;
};

type ActionOption = {
	readonly action: OpenTuiTaskAction;
	readonly label: string;
	readonly description: string;
};

const ACTION_OPTIONS: readonly ActionOption[] = [
	{ action: "edit", label: "Edit task", description: "Open task editor." },
	{ action: "copy", label: "Copy task ID", description: "Copy task ID for reuse." },
	{ action: "complete", label: "Complete task", description: "Move task to completed work." },
	{ action: "archive", label: "Archive task", description: "Archive task and remove it from active work." },
	{ action: "cancel", label: "Cancel", description: "Close this menu." },
];

function metadata(task: Task): string {
	const assignees = task.assignee.map(formatAssignee).filter((assignee) => assignee !== null);
	const fields = [
		`ID: ${task.id}`,
		`Status: ${task.status}`,
		task.type ? `Type: ${task.type}` : undefined,
		task.priority ? `Priority: ${task.priority}` : undefined,
		task.project ? `Project: ${task.project}` : undefined,
		assignees.length ? `Assignees: ${assignees.join(", ")}` : undefined,
		task.labels.length ? `Labels: ${task.labels.join(", ")}` : undefined,
		task.milestone ? `Milestone: ${task.milestone}` : undefined,
		task.parentTaskId ? `Parent: ${task.parentTaskId}` : undefined,
		task.dueDate ? `Due: ${task.dueDate}` : undefined,
		task.createdDate ? `Created: ${task.createdDate}` : undefined,
		task.updatedDate ? `Updated: ${task.updatedDate}` : undefined,
	];
	const description = task.description?.trim();
	return `${task.title}\n${fields.filter((field): field is string => field !== undefined).join("\n")}${
		description ? `\n\n${description}` : ""
	}`;
}

/** Mount task metadata with callback-backed edit, copy, complete, archive, and cancel actions. */
export function mountOpenTuiTaskActions(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiTaskActionsOptions,
): OpenTuiTaskActionsMount {
	let disposed = false;
	let settled = false;
	let resolveResult: (action: OpenTuiTaskAction) => void = () => undefined;
	let rejectResult: (reason: unknown) => void = () => undefined;
	const result = new Promise<OpenTuiTaskAction>((resolve, reject) => {
		resolveResult = resolve;
		rejectResult = reject;
	});
	const backdrop = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		backgroundColor: "black",
		opacity: 0.55,
		zIndex: 10,
	});
	const surface = new BoxRenderable(renderer, {
		position: "absolute",
		top: "12%",
		left: "14%",
		width: "72%",
		height: "76%",
		zIndex: 11,
		backgroundColor: "#161616",
		shouldFill: true,
		border: true,
		borderColor: "cyan",
		focusedBorderColor: "cyan",
		title: options.title ?? "Task actions",
		flexDirection: "column",
		padding: 1,
		rowGap: 1,
	});
	const details = new TextRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		wrapMode: "word",
		content: metadata(options.task),
	});
	const select = new SelectRenderable(renderer, {
		width: "100%",
		height: Math.min(ACTION_OPTIONS.length, 5),
		options: ACTION_OPTIONS.map((option) => ({
			name: option.label,
			description: option.description,
			value: option.action,
		})),
		showDescription: true,
		showScrollIndicator: false,
		wrapSelection: true,
		backgroundColor: "#161616",
		focusedBackgroundColor: "#303030",
		selectedBackgroundColor: "#484848",
		selectedTextColor: "white",
	});
	const help = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		wrapMode: "none",
		attributes: TextAttributes.DIM,
		content: `${formatShortcut(shortcutsConfig.shared.up)}/${formatShortcut(shortcutsConfig.shared.down)}: choose · ${formatShortcut(shortcutsConfig.taskActions.confirm)}: confirm · ${formatShortcut(shortcutsConfig.taskActions.cancel)}: cancel`,
	});
	parent.add(backdrop);
	parent.add(surface);
	surface.add(details);
	surface.add(select);
	surface.add(help);
	select.focus();

	const destroy = (): void => {
		if (disposed) return;
		disposed = true;
		renderer.keyInput.off("keypress", onKeyPress);
		keybindings.clear();
		backdrop.destroy();
		surface.destroyRecursively();
	};
	const callbackFor = (action: OpenTuiTaskAction): OpenTuiTaskActionCallback => {
		switch (action) {
			case "edit":
				return options.onEdit;
			case "copy":
				return options.onCopy;
			case "complete":
				return options.onComplete;
			case "archive":
				return options.onArchive;
			case "cancel":
				return options.onCancel;
		}
	};
	const settle = async (action: OpenTuiTaskAction): Promise<void> => {
		if (settled) return;
		settled = true;
		destroy();
		try {
			await callbackFor(action)(options.task);
			resolveResult(action);
		} catch (error) {
			rejectResult(error);
		}
	};
	const keybindings = createKeybindings();
	const handleCancel = (key: KeyEvent): void => {
		key.stopPropagation();
		void settle("cancel");
	};
	const handleConfirm = (key: KeyEvent) => {
		const action = select.getSelectedOption()?.value;
		if (!OPEN_TUI_TASK_ACTIONS.includes(action as OpenTuiTaskAction)) return keybindingPropagation.ignore;
		key.stopPropagation();
		void settle(action as OpenTuiTaskAction);
	};
	const onKeyPress = (key: KeyEvent): void => {
		if (disposed || key.eventType === "release") return;
		keybindings.dispatch(key);
	};
	keybindings.on(shortcutsConfig.taskActions.cancel, handleCancel);
	keybindings.on(shortcutsConfig.taskActions.confirm, handleConfirm);
	renderer.keyInput.on("keypress", onKeyPress);

	return {
		result,
		dispose(): void {
			void settle("cancel");
		},
	};
}
