/** TUI defaults. Native OpenTUI project-local overrides are applied by its shortcut adapter. */
export const uiKeymap = {
	shared: {
		quit: ["C-c"],
		cancel: ["escape"],
		confirm: ["enter", "return", "y", "Y"],
		advance: ["enter", "return"],
		decline: ["escape", "n", "N"],
		help: ["?", "S-?"],
		up: ["up"],
		upVim: ["k"],
		down: ["down"],
		downVim: ["j"],
		previous: ["left"],
		previousVim: ["h"],
		next: ["right"],
		nextVim: ["l"],
		pageUp: ["pageup"],
		pageDown: ["pagedown"],
		first: ["home"],
		last: ["end"],
		activate: ["enter", "return", "space"],
		search: ["/"],
		find: ["C-f"],
		save: ["C-s"],
		reset: ["C-r"],
		backspace: ["backspace"],
		delete: ["delete"],
		deleteWord: ["C-w"],
		space: ["space"],
		tab: ["tab"],
		previousTab: ["S-tab"],
		escape: ["escape"],
		quitWithoutEscape: ["q", "C-c"],
		dismissHelp: ["escape", "?"],
	},
	board: {
		search: ["/", "C-f"],
		workspace: ["S-b", "C-q"],
		create: ["n", "N"],
		filterType: ["t", "T"],
		filterProject: ["v", "V"],
		filterPriority: ["p", "P"],
		filterMilestone: ["i", "I"],
		filterLabels: ["f", "F"],
		edit: ["e", "E", "S-e"],
		copy: ["y", "Y"],
		complete: ["c", "C"],
		archive: ["a", "A"],
		open: ["enter", "return"],
		navPrevious: ["left", "h"],
		navNext: ["right", "l"],
		navUp: ["up"],
		navUpVim: ["k"],
		navDown: ["down"],
		navDownVim: ["j"],
		pageUp: ["pageup", "C-u"],
		pageDown: ["pagedown", "C-d"],
		first: ["home", "g"],
		last: ["end", "G", "S-g"],
		moveHighlightUp: ["S-up"],
		moveHighlightDown: ["S-down"],
		moveHighlight: ["S-up", "S-down"],
		move: ["m"],
		recruit: ["M", "S-m"],
		switchView: ["tab"],
		toggleHideEmpty: ["S-h"],
		historyBack: ["C-[", "escape"],
		historyForward: ["C-]"],
	},
	taskList: {
		filterStatus: ["s", "S"],
		filter: ["f", "/"],
		filterType: ["t", "T"],
		filterProject: ["v", "V"],
		filterPriority: ["p", "P"],
		filterMilestone: ["i", "I"],
		filterLabels: ["l", "L"],
		edit: ["e", "E", "S-e"],
		copy: ["y", "Y"],
		complete: ["c", "C"],
		archive: ["a", "A"],
		focusDetail: ["right", "l"],
		focusList: ["left", "h"],
		focusListEscape: ["escape"],
		first: ["home", "g"],
		last: ["end", "G", "S-g"],
		detailUp: ["up"],
		detailUpVim: ["k"],
		detailPageUp: ["pageup", "b"],
		detailPageDown: ["pagedown", "space"],
		detailFirst: ["home", "g"],
		detailLast: ["end", "G"],
	},
	list: {
		up: ["up"],
		upVim: ["k"],
		down: ["down"],
		downVim: ["j"],
		pageUp: ["pageup", "C-u"],
		pageDown: ["pagedown", "C-d"],
		first: ["home"],
		last: ["end"],
		toggle: ["space"],
		select: ["enter", "return"],
		search: ["/"],
		cancel: ["escape"],
	},
	workspace: {
		details: ["space"],
		open: ["enter", "return"],
		edit: ["e", "E", "S-e"],
		sessions: ["s"],
		handoff: ["h"],
		settings: [","],
		agentConfig: ["p"],
		fullscreen: ["f"],
		historyBack: ["C-[", "escape"],
		historyForward: ["C-]"],
		toggleTaskPane: ["S-[", "{"],
		board: ["S-b"],
		newTask: ["n", "N"],
		up: ["up"],
		down: ["down"],
		first: ["home", "g"],
		last: ["end", "G"],
		newGroup: ["M-g"],
		expand: ["right"],
		collapse: ["left"],
		search: ["/"],
		quickPreviewExit: ["C-q", "C-c"],
		markDone: ["S-z"],
		deleteTask: ["S-d"],
	},
} as const;

/** Compact established labels for bindings whose terminal notation is more verbose. */
const uiKeymapLabels: Partial<Record<`${KeymapContext}.${string}`, string>> = {
	"board.moveHighlight": "Shift+↑↓",
	"board.recruit": "Shift+M",
	"board.toggleHideEmpty": "H",
	"workspace.quickPreviewExit": "Ctrl+Q/Ctrl+C",
};

export type KeymapContext = keyof typeof uiKeymap;
export type KeymapAction<C extends KeymapContext> = keyof (typeof uiKeymap)[C];

export function keymapKeys<C extends KeymapContext>(context: C, action: KeymapAction<C>): string[] {
	return [...(uiKeymap[context][action] as readonly string[])];
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
	if (aliases[key]) return aliases[key];
	if (key.startsWith("C-")) return `Ctrl+${key.slice(2).toUpperCase()}`;
	const meta = /^(?:M|A|Alt|Option)-(.*)$/i.exec(key);
	if (meta) return `${metaModifierLabel()}+${(meta[1] ?? "").toUpperCase()}`;
	if (key.startsWith("S-")) return `Shift+${key.slice(2).toUpperCase()}`;
	return key.length === 1 ? key.toUpperCase() : key;
}

export function formatKeymap<C extends KeymapContext>(context: C, action: KeymapAction<C>): string {
	return uiKeymapLabels[`${context}.${String(action)}`] ?? formatKey(keymapKeys(context, action)[0] ?? "");
}
