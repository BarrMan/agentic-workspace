import type { KeyEvent } from "@opentui/core";
import {
	formatKey,
	formatKeymap,
	type KeymapAction,
	type KeymapContext,
	keymapKeys,
	metaModifierLabel,
} from "./keymap.ts";
import { charFromBaseCode, optionBaseKey } from "./option-compose.ts";

/** One key combination accepted by an OpenTUI shortcut. Modifiers match exactly. */
export type ShortcutKey = Readonly<{
	readonly key: string;
	readonly ctrl?: true;
	readonly shift?: true;
	readonly meta?: true;
	readonly super?: true;
	readonly hyper?: true;
}>;

/** A persisted ordered shortcut sequence. */
export type ShortcutSequence = Readonly<{
	readonly sequence: readonly ShortcutKey[];
}>;

/** One persisted shortcut override. */
export type ShortcutOverride = ShortcutSequence;

/** Project-local overrides, keyed by descriptor ID. An override replaces every default alias. */
export type ShortcutOverrides = Readonly<Record<string, ShortcutOverride>>;

/** Named OpenTUI action and every key combination that invokes it. */
export type ShortcutDescriptor<Name extends string = string> = Readonly<{
	readonly id: Name;
	readonly keys: readonly ShortcutKey[];
	readonly label?: string;
}>;

type OpenTuiShortcutConfig = Readonly<Record<string, ShortcutDescriptor>>;

type KeymapBinding = {
	[Context in KeymapContext]: readonly [context: Context, action: KeymapAction<Context>];
}[KeymapContext];

function keyFromCanonical(name: string): ShortcutKey {
	let key = name;
	let ctrl = false;
	let shift = false;
	let meta = false;
	let modifier = /^(C|S|M|A|Alt|Option)-(.*)$/i.exec(key);
	while (modifier) {
		const flag = (modifier[1] ?? "").toLowerCase();
		if (flag === "c") ctrl = true;
		if (flag === "s") shift = true;
		if (flag === "m" || flag === "a" || flag === "alt" || flag === "option") meta = true;
		key = modifier[2] ?? "";
		modifier = /^(C|S|M|A|Alt|Option)-(.*)$/i.exec(key);
	}
	if (key.length === 1 && key !== key.toLowerCase()) {
		shift = true;
		key = key.toLowerCase();
	}
	return {
		key: key.toLowerCase(),
		...(ctrl ? { ctrl: true as const } : {}),
		...(shift ? { shift: true as const } : {}),
		...(meta ? { meta: true as const } : {}),
	};
}

function canonicalShortcut<Name extends string>(
	id: Name,
	...bindings: readonly KeymapBinding[]
): ShortcutDescriptor<Name> {
	return {
		id,
		get keys(): readonly ShortcutKey[] {
			const seen = new Set<string>();
			return bindings
				.flatMap(([context, action]) => keymapKeys(context as never, action as never).map(keyFromCanonical))
				.filter((shortcut) => {
					const signature = `${shortcut.key}:${shortcut.ctrl ? 1 : 0}:${shortcut.shift ? 1 : 0}:${shortcut.meta ? 1 : 0}`;
					if (seen.has(signature)) return false;
					seen.add(signature);
					return true;
				});
		},
		get label(): string {
			return bindings.map(([context, action]) => formatKeymap(context as never, action as never)).join("/");
		},
	};
}

const sharedShortcuts = {
	quit: canonicalShortcut("shared.quit", ["shared", "quit"]),
	cancel: canonicalShortcut("shared.cancel", ["shared", "cancel"]),
	activate: canonicalShortcut("shared.activate", ["shared", "activate"]),
	help: canonicalShortcut("shared.help", ["shared", "help"]),
	up: canonicalShortcut("shared.up", ["shared", "up"], ["shared", "upVim"]),
	down: canonicalShortcut("shared.down", ["shared", "down"], ["shared", "downVim"]),
	previous: canonicalShortcut("shared.previous", ["shared", "previous"], ["shared", "previousVim"]),
	next: canonicalShortcut("shared.next", ["shared", "next"], ["shared", "nextVim"]),
	pageUp: canonicalShortcut("shared.pageUp", ["shared", "pageUp"]),
	pageDown: canonicalShortcut("shared.pageDown", ["shared", "pageDown"]),
	first: canonicalShortcut("shared.first", ["shared", "first"]),
	last: canonicalShortcut("shared.last", ["shared", "last"]),
	tab: canonicalShortcut("shared.tab", ["shared", "tab"]),
	previousTab: canonicalShortcut("shared.previousTab", ["shared", "previousTab"]),
	save: canonicalShortcut("shared.save", ["shared", "save"]),
	reset: canonicalShortcut("shared.reset", ["shared", "reset"]),
	backspace: canonicalShortcut("shared.backspace", ["shared", "backspace"]),
	delete: canonicalShortcut("shared.delete", ["shared", "delete"]),
	space: canonicalShortcut("shared.space", ["shared", "space"]),
} as const satisfies OpenTuiShortcutConfig;

/** Default OpenTUI shortcuts, grouped by surface and action. */
export const shortcutsConfig = {
	shared: sharedShortcuts,
	board: {
		cancelMove: canonicalShortcut("board.cancelMove", ["shared", "cancel"]),
		quit: canonicalShortcut("board.quit", ["shared", "quit"]),
		switchView: canonicalShortcut("board.switchView", ["shared", "tab"]),
		workspace: canonicalShortcut("board.workspace", ["board", "workspace"]),
		filter: canonicalShortcut("board.filter", ["taskList", "filter"]),
		createTask: canonicalShortcut("board.createTask", ["board", "create"]),
		help: canonicalShortcut("board.help", ["shared", "help"]),
		taskActions: canonicalShortcut("board.taskActions", ["shared", "space"]),
		toggleHideEmpty: canonicalShortcut("board.toggleHideEmpty", ["board", "toggleHideEmpty"]),
		recruit: canonicalShortcut("board.recruit", ["board", "recruit"]),
		move: canonicalShortcut("board.move", ["board", "move"]),
		previousColumn: canonicalShortcut("board.previousColumn", ["board", "navPrevious"]),
		nextColumn: canonicalShortcut("board.nextColumn", ["board", "navNext"]),
		previousTask: canonicalShortcut("board.previousTask", ["board", "navUp"], ["board", "navUpVim"]),
		nextTask: canonicalShortcut("board.nextTask", ["board", "navDown"], ["board", "navDownVim"]),
		pageUp: canonicalShortcut("board.pageUp", ["board", "pageUp"]),
		pageDown: canonicalShortcut("board.pageDown", ["board", "pageDown"]),
		first: canonicalShortcut("board.first", ["board", "first"]),
		last: canonicalShortcut("board.last", ["board", "last"]),
		confirm: canonicalShortcut("board.confirm", ["board", "open"]),
		editTask: canonicalShortcut("board.editTask", ["board", "edit"]),
		copyTask: canonicalShortcut("board.copyTask", ["board", "copy"]),
		completeTask: canonicalShortcut("board.completeTask", ["board", "complete"]),
		archiveTask: canonicalShortcut("board.archiveTask", ["board", "archive"]),
		historyBack: canonicalShortcut("board.historyBack", ["board", "historyBack"]),
		historyForward: canonicalShortcut("board.historyForward", ["board", "historyForward"]),
		settings: canonicalShortcut("board.settings", ["workspace", "settings"]),
	},
	taskViewer: {
		escape: canonicalShortcut("taskViewer.escape", ["taskList", "focusListEscape"]),
		quit: canonicalShortcut("taskViewer.quit", ["shared", "quit"]),
		switchView: canonicalShortcut("taskViewer.switchView", ["shared", "tab"]),
		workspace: canonicalShortcut("taskViewer.workspace", ["board", "workspace"]),
		createTask: canonicalShortcut("taskViewer.createTask", ["board", "create"]),
		filter: canonicalShortcut("taskViewer.filter", ["taskList", "filter"]),
		help: canonicalShortcut("taskViewer.help", ["shared", "help"]),
		taskActions: canonicalShortcut("taskViewer.taskActions", ["shared", "space"]),
		editTask: canonicalShortcut("taskViewer.editTask", ["taskList", "edit"]),
		copyTask: canonicalShortcut("taskViewer.copyTask", ["taskList", "copy"]),
		completeTask: canonicalShortcut("taskViewer.completeTask", ["taskList", "complete"]),
		archiveTask: canonicalShortcut("taskViewer.archiveTask", ["taskList", "archive"]),
		focusDetail: canonicalShortcut("taskViewer.focusDetail", ["taskList", "focusDetail"]),
		focusList: canonicalShortcut("taskViewer.focusList", ["taskList", "focusList"]),
		previous: canonicalShortcut("taskViewer.previous", ["list", "up"], ["list", "upVim"]),
		next: canonicalShortcut("taskViewer.next", ["list", "down"], ["list", "downVim"]),
		pageUp: canonicalShortcut("taskViewer.pageUp", ["list", "pageUp"]),
		pageDown: canonicalShortcut("taskViewer.pageDown", ["list", "pageDown"]),
		first: canonicalShortcut("taskViewer.first", ["taskList", "first"]),
		last: canonicalShortcut("taskViewer.last", ["taskList", "last"]),
		approveArtifact: { id: "taskViewer.approveArtifact", keys: [{ key: "a", ctrl: true, shift: true }] },
		revokeArtifact: { id: "taskViewer.revokeArtifact", keys: [{ key: "r", ctrl: true, shift: true }] },
	},
	workspace: {
		quit: canonicalShortcut("workspace.quit", ["shared", "quit"]),
		openArtifacts: { id: "workspace.openArtifacts", keys: [{ key: "o", ctrl: true, shift: true }] },
		toggleDetails: canonicalShortcut("workspace.toggleDetails", ["workspace", "details"]),
		toggleTaskPane: canonicalShortcut("workspace.toggleTaskPane", ["workspace", "toggleTaskPane"]),
		fullscreen: canonicalShortcut("workspace.fullscreen", ["workspace", "fullscreen"]),
		sessions: canonicalShortcut("workspace.sessions", ["workspace", "sessions"]),
		handoff: canonicalShortcut("workspace.handoff", ["workspace", "handoff"]),
		settings: canonicalShortcut("workspace.settings", ["workspace", "settings"]),
		agentConfig: canonicalShortcut("workspace.agentConfig", ["workspace", "agentConfig"]),
		historyBack: canonicalShortcut("workspace.historyBack", ["workspace", "historyBack"]),
		historyForward: canonicalShortcut("workspace.historyForward", ["workspace", "historyForward"]),
		board: canonicalShortcut("workspace.board", ["workspace", "board"]),
		createTask: canonicalShortcut("workspace.createTask", ["workspace", "newTask"]),
		filter: canonicalShortcut("workspace.filter", ["workspace", "search"]),
		help: canonicalShortcut("workspace.help", ["shared", "help"]),
		editTask: canonicalShortcut("workspace.editTask", ["workspace", "edit"]),
		copyTask: canonicalShortcut("workspace.copyTask", ["taskList", "copy"]),
		completeTask: canonicalShortcut("workspace.completeTask", ["taskList", "complete"]),
		archiveTask: canonicalShortcut("workspace.archiveTask", ["taskList", "archive"]),
		cycleMode: canonicalShortcut("workspace.cycleMode", ["shared", "tab"]),
		previousItem: canonicalShortcut("workspace.previousItem", ["workspace", "up"]),
		nextItem: canonicalShortcut("workspace.nextItem", ["workspace", "down"]),
		first: canonicalShortcut("workspace.first", ["workspace", "first"]),
		last: canonicalShortcut("workspace.last", ["workspace", "last"]),
		newGroup: canonicalShortcut("workspace.newGroup", ["workspace", "newGroup"]),
		expand: canonicalShortcut("workspace.expand", ["workspace", "expand"]),
		collapse: canonicalShortcut("workspace.collapse", ["workspace", "collapse"]),
		select: canonicalShortcut("workspace.select", ["workspace", "open"]),
		quickPreviewExit: canonicalShortcut("workspace.quickPreviewExit", ["workspace", "quickPreviewExit"]),
		markDone: canonicalShortcut("workspace.markDone", ["workspace", "markDone"]),
		deleteTask: canonicalShortcut("workspace.deleteTask", ["workspace", "deleteTask"]),
	},
	scrollableViewer: {
		quit: canonicalShortcut("scrollableViewer.quit", ["shared", "cancel"]),
		previousLine: canonicalShortcut("scrollableViewer.previousLine", ["list", "up"], ["list", "upVim"]),
		nextLine: canonicalShortcut("scrollableViewer.nextLine", ["list", "down"], ["list", "downVim"]),
		pageUp: canonicalShortcut("scrollableViewer.pageUp", ["list", "pageUp"]),
		pageDown: canonicalShortcut("scrollableViewer.pageDown", ["list", "pageDown"]),
		first: canonicalShortcut("scrollableViewer.first", ["list", "first"]),
		last: canonicalShortcut("scrollableViewer.last", ["list", "last"]),
	},
	taskActions: {
		cancel: canonicalShortcut("taskActions.cancel", ["shared", "cancel"]),
		confirm: canonicalShortcut("taskActions.confirm", ["shared", "confirm"]),
	},
	confirmOverlay: {
		accept: canonicalShortcut("confirmOverlay.accept", ["shared", "confirm"]),
		decline: canonicalShortcut("confirmOverlay.decline", ["shared", "decline"]),
	},
	taskForm: {
		cancel: canonicalShortcut("taskForm.cancel", ["shared", "cancel"]),
		nextField: canonicalShortcut("taskForm.nextField", ["shared", "tab"]),
		previousField: canonicalShortcut("taskForm.previousField", ["shared", "previousTab"]),
		submit: canonicalShortcut("taskForm.submit", ["shared", "save"]),
		advance: canonicalShortcut("taskForm.advance", ["shared", "advance"]),
	},
	filterEditor: {
		cancel: canonicalShortcut("filterEditor.cancel", ["shared", "cancel"]),
		apply: canonicalShortcut("filterEditor.apply", ["shared", "save"]),
		reset: canonicalShortcut("filterEditor.reset", ["shared", "reset"]),
		nextField: canonicalShortcut("filterEditor.nextField", ["shared", "tab"], ["shared", "down"]),
		previousField: canonicalShortcut("filterEditor.previousField", ["shared", "previousTab"], ["shared", "up"]),
		previousChoice: canonicalShortcut("filterEditor.previousChoice", ["shared", "up"]),
		nextChoice: canonicalShortcut("filterEditor.nextChoice", ["shared", "down"]),
		clear: canonicalShortcut("filterEditor.clear", ["shared", "backspace"], ["shared", "delete"]),
		toggle: canonicalShortcut("filterEditor.toggle", ["shared", "space"]),
		confirm: canonicalShortcut("filterEditor.confirm", ["shared", "advance"]),
	},
} as const;

const shortcutDescriptions: Readonly<Record<string, string>> = {
	quit: "Exit workspace or close view",
	toggleDetails: "Show or hide task details",
	toggleTaskPane: "Show or hide task pane",
	fullscreen: "Open agent fullscreen",
	sessions: "Choose a task session",
	handoff: "Hand off task to a new agent session",
	settings: "Configure project agent presets",
	agentConfig: "Choose task agent preset",
	historyBack: "Go back in navigation history",
	historyForward: "Go forward in navigation history",
	board: "Open board",
	workspace: "Open workspace",
	switchView: "Switch view",
	createTask: "Create task",
	filter: "Filter tasks",
	help: "Search and edit keyboard shortcuts",
	editTask: "Edit selected task",
	copyTask: "Copy selected task ID",
	completeTask: "Complete selected task",
	archiveTask: "Archive selected task",
	cycleMode: "Cycle mode",
	approveArtifact: "Approve selected artifact",
	revokeArtifact: "Revoke selected artifact approval",
	openArtifacts: "Open selected task artifacts",
	previousItem: "Select previous task",
	nextItem: "Select next task",
	markDone: "Mark selected task done",
	deleteTask: "Permanently delete selected task",
	select: "Start or show selected task agent",
	quickPreviewExit: "Leave agent input",
	cancelMove: "Cancel task move",
	taskActions: "Open task actions",
	toggleHideEmpty: "Show or hide empty columns",
	recruit: "Recruit task during move",
	move: "Start or confirm task move",
	previousColumn: "Select previous column",
	nextColumn: "Select next column",
	previousTask: "Select previous task",
	nextTask: "Select next task",
	pageUp: "Move up one page",
	pageDown: "Move down one page",
	first: "Move to first task",
	last: "Move to last task",
	newGroup: "Create a group",
	expand: "Expand group",
	collapse: "Collapse group",
	confirm: "Open selected task or confirm move",
	escape: "Focus task list, then close",
	focusDetail: "Focus task details",
	focusList: "Focus task list",
	previous: "Select previous task or scroll up",
	next: "Select next task or scroll down",
};

/** Help rows retain the same descriptors used by dispatch, never copied key labels. */
export function shortcutHelpItems(surface: "workspace" | "board" | "taskViewer"): Array<{
	shortcut: ShortcutDescriptor;
	description: string;
}> {
	return Object.entries(shortcutsConfig[surface]).map(([action, shortcut]) => ({
		shortcut,
		description: shortcutDescriptions[action] ?? action,
	}));
}

/** Normalize terminal aliases without conflating distinct modifier chords. */
function normalizedKey(key: ShortcutKey): ShortcutKey {
	const name = key.key.toLowerCase();
	if (key.key.length === 1 && key.key !== name) return { ...key, key: name, shift: true };
	if (name === "return") return { ...key, key: "enter" };
	if (name === " ") return { ...key, key: "space" };
	if (name === "{") return { ...key, key: "[", shift: true };
	return { ...key, key: name };
}

function sameKey(left: ShortcutKey, right: ShortcutKey): boolean {
	const a = normalizedKey(left);
	const b = normalizedKey(right);
	return (
		a.key === b.key &&
		Boolean(a.ctrl) === Boolean(b.ctrl) &&
		Boolean(a.shift) === Boolean(b.shift) &&
		Boolean(a.meta) === Boolean(b.meta) &&
		Boolean(a.super) === Boolean(b.super) &&
		Boolean(a.hyper) === Boolean(b.hyper)
	);
}

function isShortcutKey(value: unknown): value is ShortcutKey {
	if (typeof value !== "object" || value === null || !("key" in value) || typeof value.key !== "string") return false;
	const modifiers = value as Partial<Record<"ctrl" | "shift" | "meta" | "super" | "hyper", unknown>>;
	return (["ctrl", "shift", "meta", "super", "hyper"] as const).every(
		(modifier) => modifiers[modifier] === undefined || modifiers[modifier] === true,
	);
}

/** Invalid persisted values fall back to descriptor defaults. */
function overrideSequences(overrides: ShortcutOverrides, id: string): readonly (readonly ShortcutKey[])[] | undefined {
	const override = overrides[id];
	if (
		typeof override === "object" &&
		override !== null &&
		"sequence" in override &&
		Array.isArray(override.sequence) &&
		override.sequence.length >= 1 &&
		override.sequence.length <= 2 &&
		override.sequence.every(isShortcutKey)
	) {
		return [override.sequence];
	}
	return undefined;
}

function shortcutSequences(
	shortcut: ShortcutDescriptor,
	overrides: ShortcutOverrides,
): readonly (readonly ShortcutKey[])[] {
	const override = overrideSequences(overrides, shortcut.id);
	if (override) return override;
	return shortcut.keys.length === 0 ? [[]] : shortcut.keys.map((key) => [key]);
}

function sameSequence(left: readonly ShortcutKey[], right: readonly ShortcutKey[]): boolean {
	return left.length === right.length && left.every((key, index) => sameKey(key, right[index] as ShortcutKey));
}

/** Prefix collisions cannot dispatch deterministically without a timeout, so they conflict. */
function sequencesConflict(left: readonly ShortcutKey[], right: readonly ShortcutKey[]): boolean {
	if (left.length === 0 || right.length === 0) return left.length === 0 && right.length === 0;
	return (
		sameKey(left[0] as ShortcutKey, right[0] as ShortcutKey) &&
		(left.length === 1 || right.length === 1 || sameSequence(left, right))
	);
}

/** Capture a real chord, excluding modifier-only and key-release events. */
export function shortcutKeyFromEvent(event: KeyEvent): ShortcutKey | undefined {
	if (event.eventType === "release" || !event.name || /^(shift|ctrl|control|alt|meta|super|hyper)$/i.test(event.name)) {
		return undefined;
	}
	let key = event.name;
	let meta = Boolean(event.meta || event.option);
	if (meta) {
		if (typeof event.baseCode === "number") {
			const base = charFromBaseCode(event.baseCode);
			if (base) key = base;
		} else {
			key = optionBaseKey(key) ?? key;
		}
	} else if (!event.ctrl && !event.shift && !event.super && !event.hyper) {
		// iTerm2 Option=Normal: bare composed glyph, no modifier flag.
		const base = optionBaseKey(key);
		if (base) {
			key = base;
			meta = true;
		}
	}
	return normalizedKey({
		key,
		...(event.ctrl ? { ctrl: true } : {}),
		...(event.shift ? { shift: true } : {}),
		...(meta ? { meta: true } : {}),
		...(event.super ? { super: true } : {}),
		...(event.hyper ? { hyper: true } : {}),
	});
}

/** Returns true when event invokes a one-stroke shortcut. Ordered sequences require a registry. */
export function matchesShortcut(
	shortcut: ShortcutDescriptor,
	event: KeyEvent,
	overrides: ShortcutOverrides = {},
): boolean {
	const key = shortcutKeyFromEvent(event);
	return shortcutSequences(shortcut, overrides).some(
		(sequence) =>
			sequence.length === 0 || (sequence.length === 1 && key !== undefined && sameKey(sequence[0] as ShortcutKey, key)),
	);
}

/** Find another action on the same surface that owns an equal or ambiguous shortcut sequence. */
export function findShortcutConflict(
	shortcut: ShortcutDescriptor,
	key: ShortcutKey | readonly ShortcutKey[],
	overrides: ShortcutOverrides = {},
): ShortcutDescriptor | undefined {
	const sequence = Array.isArray(key) ? key : [key];
	const surface = shortcut.id.split(".")[0];
	const config = shortcutsConfig[surface as keyof typeof shortcutsConfig];
	if (!config) return undefined;
	return Object.values(config).find(
		(candidate) =>
			candidate.id !== shortcut.id &&
			shortcutSequences(candidate, overrides).some((existing) => sequencesConflict(existing, sequence)),
	);
}

/** Format one shortcut for terminal help text. */
export function formatShortcut(shortcut: ShortcutDescriptor, overrides: ShortcutOverrides = {}): string {
	const override = overrideSequences(overrides, shortcut.id);
	if (override) {
		return override.length
			? override.map((sequence) => sequence.map(formatShortcutKey).join(", ")).join(" or ")
			: "Unbound";
	}
	if (shortcut.label) return shortcut.label;
	if (shortcut.keys.length === 0) return "Any key";
	return shortcut.keys.map(formatShortcutKey).join(" or ");
}

/** Format one OpenTUI key combination for terminal help text. */
function formatShortcutKey(shortcut: ShortcutKey): string {
	const modifiers = [
		shortcut.ctrl && "Ctrl",
		shortcut.shift && "Shift",
		shortcut.meta && metaModifierLabel(),
		shortcut.super && "Super",
		shortcut.hyper && "Hyper",
	].filter((modifier): modifier is string => Boolean(modifier));
	return [...modifiers, formatKey(shortcut.key)].join("+");
}

export const keybindingPropagation = {
	/** Handle event and prevent lower-priority callbacks and renderer listeners. */
	stop: "stop",
	/** Handle event, then run lower-priority matching callbacks. */
	continue: "continue",
	/** Do not handle event. Lower-priority callbacks may handle it. */
	ignore: "ignore",
} as const;

export type KeybindingPropagation = (typeof keybindingPropagation)[keyof typeof keybindingPropagation];
// biome-ignore lint/suspicious/noConfusingVoidType: callbacks may omit a propagation result.
export type KeybindingCallback = (event: KeyEvent) => KeybindingPropagation | void;

export type KeybindingRegistry = {
	/** Register a named action. Earlier registrations have higher priority. */
	on(shortcut: ShortcutDescriptor, callback: KeybindingCallback): () => void;
	/** Dispatch one event to registered actions. Returns true when an action handled it. */
	dispatch(event: KeyEvent): boolean;
	/** Remove every registered action. */
	clear(): void;
};

type RegisteredKeybinding = Readonly<{
	shortcut: ShortcutDescriptor;
	callback: KeybindingCallback;
}>;

/** Create one surface-local shortcut registry. */
export function createKeybindings(getOverrides: () => ShortcutOverrides = () => ({})): KeybindingRegistry {
	const bindings: RegisteredKeybinding[] = [];
	let pending: ShortcutKey | undefined;
	const dispatchMatching = (
		event: KeyEvent,
		overrides: ShortcutOverrides,
		matches: (sequence: readonly ShortcutKey[]) => boolean,
	): boolean => {
		let handled = false;
		for (const binding of [...bindings]) {
			if (!shortcutSequences(binding.shortcut, overrides).some(matches)) continue;
			const propagation = binding.callback(event) ?? keybindingPropagation.stop;
			if (propagation === keybindingPropagation.ignore) continue;
			handled = true;
			if (propagation === keybindingPropagation.stop) break;
		}
		return handled;
	};
	return {
		on(shortcut, callback): () => void {
			const binding: RegisteredKeybinding = { shortcut, callback };
			bindings.push(binding);
			return () => {
				const index = bindings.indexOf(binding);
				if (index >= 0) bindings.splice(index, 1);
			};
		},
		dispatch(event): boolean {
			const key = shortcutKeyFromEvent(event);
			const overrides = getOverrides();
			if (pending && key) {
				const sequence = [pending, key];
				pending = undefined;
				dispatchMatching(event, overrides, (candidate) => sameSequence(candidate, sequence));
				event.stopPropagation();
				return true;
			}
			if (!key) return dispatchMatching(event, overrides, (candidate) => candidate.length === 0);
			const startsSequence = bindings.some((binding) =>
				shortcutSequences(binding.shortcut, overrides).some(
					(candidate) => candidate.length === 2 && sameKey(candidate[0] as ShortcutKey, key),
				),
			);
			if (startsSequence) {
				pending = key;
				event.stopPropagation();
				return true;
			}
			const handled = dispatchMatching(
				event,
				overrides,
				(candidate) => candidate.length === 0 || (candidate.length === 1 && sameKey(candidate[0] as ShortcutKey, key)),
			);
			if (handled) event.stopPropagation();
			return handled;
		},
		clear(): void {
			pending = undefined;
			bindings.length = 0;
		},
	};
}
