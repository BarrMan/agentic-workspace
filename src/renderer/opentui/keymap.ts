/** TUI defaults. Native OpenTUI project-local overrides are applied by its shortcut adapter. */
export const uiKeymap = {
	shared: {
		quit: "C-c",
		cancel: "escape",
		confirm: "enter",
		advance: "enter",
		decline: "escape",
		help: "?",
		up: "up",
		down: "down",
		previous: "left",
		next: "right",
		pageUp: "pageup",
		pageDown: "pagedown",
		first: "home",
		last: "end",
		activate: "enter",
		search: "/",
		find: "C-f",
		save: "C-s",
		reset: "C-r",
		backspace: "backspace",
		delete: "delete",
		deleteWord: "C-w",
		space: "space",
		tab: "tab",
		previousTab: "S-tab",
		escape: "escape",
		quitWithoutEscape: "q",
		dismissHelp: "escape",
	},
	board: {
		search: "/",
		workspace: "S-b",
		create: "n",
		filterType: "t",
		filterProject: "v",
		filterPriority: "p",
		filterMilestone: "i",
		filterLabels: "f",
		edit: "e",
		copy: "y",
		complete: "c",
		archive: "a",
		open: "enter",
		navPrevious: "left",
		navNext: "right",
		navUp: "up",
		navDown: "down",
		pageUp: "pageup",
		pageDown: "pagedown",
		first: "g",
		last: "S-g",
		moveHighlightUp: "S-up",
		moveHighlightDown: "S-down",
		moveHighlight: "S-up",
		move: "m",
		recruit: "M",
		switchView: "tab",
		toggleHideEmpty: "S-h",
		historyBack: "C-[",
		historyForward: "C-]",
	},
	taskList: {
		filterStatus: "s",
		filter: "f",
		filterType: "t",
		filterProject: "v",
		filterPriority: "p",
		filterMilestone: "i",
		filterLabels: "l",
		edit: "e",
		copy: "y",
		complete: "c",
		archive: "a",
		focusDetail: "right",
		focusList: "left",
		focusListEscape: "escape",
		first: "g",
		last: "S-g",
		detailUp: "up",
		detailPageUp: "pageup",
		detailPageDown: "pagedown",
		detailFirst: "g",
		detailLast: "S-g",
	},
	list: {
		up: "up",
		down: "down",
		pageUp: "pageup",
		pageDown: "pagedown",
		first: "home",
		last: "end",
		toggle: "space",
		select: "enter",
		search: "/",
		cancel: "escape",
	},
	workspace: {
		details: "space",
		open: "enter",
		edit: "e",
		sessions: "s",
		handoff: "h",
		settings: ",",
		agentConfig: "p",
		fullscreen: "f",
		historyBack: "C-[",
		historyForward: "C-]",
		toggleTaskPane: "S-[",
		board: "S-b",
		newTask: "n",
		up: "up",
		down: "down",
		first: "g",
		last: "S-g",
		newGroup: "M-g",
		expand: "right",
		collapse: "left",
		search: "/",
		quickPreviewExit: "C-q",
		markDone: "S-z",
		deleteTask: "S-d",
	},
} as const satisfies Readonly<Record<string, Readonly<Record<string, string>>>>;

export type KeymapContext = keyof typeof uiKeymap;
export type KeymapAction<C extends KeymapContext> = keyof (typeof uiKeymap)[C];

export function keymapKey<C extends KeymapContext>(context: C, action: KeymapAction<C>): string {
	return uiKeymap[context][action] as string;
}

/** Platform-specific label for the meta/alt modifier. */
export function metaModifierLabel(platform: NodeJS.Platform = process.platform): string {
	return platform === "darwin" ? "Option" : "Alt";
}

/** Human-facing form for a binding, including Ctrl/Shift notation. */
export function formatKey(key: string): string {
	const aliases: Record<string, string> = {
		escape: "Esc",
		enter: "Enter",
		return: "Enter",
		space: "Space",
		pageup: "PgUp",
		pagedown: "PgDn",
		home: "Home",
		end: "End",
		left: "←",
		right: "→",
		up: "↑",
		down: "↓",
		tab: "Tab",
	};
	const modifiers: string[] = [];
	let baseKey = key;
	let modifier = /^(C|S|M|A|Alt|Option)-(.*)$/i.exec(baseKey);
	while (modifier) {
		const name = (modifier[1] ?? "").toLowerCase();
		modifiers.push(name === "c" ? "Ctrl" : name === "s" ? "Shift" : metaModifierLabel());
		baseKey = modifier[2] ?? "";
		modifier = /^(C|S|M|A|Alt|Option)-(.*)$/i.exec(baseKey);
	}
	if (baseKey.length === 1 && baseKey !== baseKey.toLowerCase()) {
		if (!modifiers.includes("Shift")) modifiers.push("Shift");
		baseKey = baseKey.toLowerCase();
	}
	const displayKey = aliases[baseKey] ?? (modifiers.length > 0 ? baseKey.toUpperCase() : baseKey);
	return [...modifiers, displayKey].join("+");
}

export function formatKeymap<C extends KeymapContext>(context: C, action: KeymapAction<C>): string {
	return formatKey(keymapKey(context, action));
}
