import {
	BoxRenderable,
	type CliRenderer,
	InputRenderable,
	type KeyEvent,
	type PasteEvent,
	ScrollBoxRenderable,
	TextAttributes,
	TextRenderable,
} from "@opentui/core";
import { normalizeStringList } from "../../lib/string-list.ts";
import { labelComparisonKey } from "../../model/task/label-filter.ts";
import type { LabelMatchMode, TaskListFilter } from "../../model/types.ts";
import {
	createKeybindings,
	findShortcutConflict,
	formatShortcut,
	keybindingPropagation,
	type ShortcutDescriptor,
	type ShortcutKey,
	type ShortcutOverrides,
	shortcutKeyFromEvent,
	shortcutsConfig,
} from "./keybindings.ts";

const OPEN_TUI_FILTER_FIELDS = ["search", "status", "type", "project", "priority", "labels", "milestone"] as const;

export type OpenTuiFilterField = (typeof OPEN_TUI_FILTER_FIELDS)[number];

/** Canonical filter values shared by OpenTUI filter controls. */
export interface OpenTuiFilterState {
	search: string;
	status: string[];
	type: string[];
	project: string[];
	priority: string;
	labels: string[];
	milestone: string;
}

export type OpenTuiFilterChoices = {
	readonly status?: readonly string[];
	readonly type?: readonly string[];
	readonly project?: readonly string[];
	readonly priority?: readonly string[];
	readonly labels?: readonly string[];
	readonly milestone?: readonly string[];
};

export type OpenTuiFilterEditorOptions = {
	readonly choices?: OpenTuiFilterChoices;
	readonly initial?: Partial<OpenTuiFilterState>;
	readonly title?: string;
	readonly labelMatch?: LabelMatchMode;
	readonly onApply: (filters: OpenTuiFilterState, taskFilter: TaskListFilter) => void;
	readonly onCancel?: () => void;
};

export type OpenTuiFilterEditorMount = {
	values(): OpenTuiFilterState;
	focus(field: OpenTuiFilterField): void;
	apply(): void;
	reset(): void;
	cancel(): void;
	dispose(): void;
};

export type OpenTuiHelpItem = {
	readonly description: string;
} & (
	| { readonly shortcut: ShortcutDescriptor; readonly keys?: string }
	| { readonly keys: string; readonly shortcut?: undefined }
);

export type OpenTuiHelpOverlayOptions = {
	readonly title?: string;
	readonly items: readonly OpenTuiHelpItem[];
	readonly footer?: string;
	readonly onClose?: () => void;
	readonly overrides?: ShortcutOverrides;
	/** Persist project-local overrides and update the surface's dispatch state. Reject to keep the old binding. */
	readonly onOverridesChange?: (overrides: ShortcutOverrides) => void | Promise<void>;
};

export type OpenTuiHelpOverlayMount = {
	dispose(): void;
};

const MULTI_VALUE_FIELDS: Record<OpenTuiFilterField, boolean> = {
	search: false,
	status: true,
	type: true,
	project: true,
	priority: false,
	labels: true,
	milestone: false,
};
const FIELD_LABELS: Record<OpenTuiFilterField, string> = {
	search: "Search",
	status: "Status",
	type: "Type",
	project: "Project",
	priority: "Priority",
	labels: "Labels",
	milestone: "Milestone",
};

function emptyFilters(): OpenTuiFilterState {
	return { search: "", status: [], type: [], project: [], priority: "", labels: [], milestone: "" };
}

function copyFilters(filters: OpenTuiFilterState): OpenTuiFilterState {
	return {
		search: filters.search,
		status: [...filters.status],
		type: [...filters.type],
		project: [...filters.project],
		priority: filters.priority,
		labels: [...filters.labels],
		milestone: filters.milestone,
	};
}

function normalizeLabelValues(values: readonly string[] | undefined): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of values ?? []) {
		const trimmed = value.trim();
		const key = labelComparisonKey(trimmed);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(trimmed);
	}
	return result;
}

function normalizeFilters(filters: Partial<OpenTuiFilterState>): OpenTuiFilterState {
	return {
		search: filters.search?.trim() ?? "",
		status: exactNonemptyList(filters.status),
		type: normalizeStringList(filters.type) ?? [],
		project: normalizeStringList(filters.project) ?? [],
		priority: filters.priority ?? "",
		labels: normalizeLabelValues(filters.labels),
		milestone: filters.milestone?.trim() ?? "",
	};
}

function exactNonemptyList(values: readonly string[] | undefined): string[] {
	return [...new Set((values ?? []).filter((value) => value.length > 0))];
}

/** Converts editor state to existing pure task filter contract. Search remains a query value. */
function openTuiTaskListFilter(filters: OpenTuiFilterState, labelMatch: LabelMatchMode = "any"): TaskListFilter {
	return {
		...(filters.status.length > 0 && { status: [...filters.status] }),
		...(filters.type.length > 0 && { type: [...filters.type] }),
		...(filters.project.length > 0 && { project: [...filters.project] }),
		...(filters.priority && { priority: filters.priority }),
		...(filters.labels.length > 0 && { labels: [...filters.labels], labelMatch }),
		...(filters.milestone && { milestone: filters.milestone }),
	};
}

function addModalSurface(
	renderer: CliRenderer,
	parent: BoxRenderable,
	title: string,
	zIndex = 20,
): { backdrop: BoxRenderable; surface: BoxRenderable } {
	const backdrop = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		backgroundColor: "black",
		opacity: 0.55,
		zIndex,
	});
	const surface = new BoxRenderable(renderer, {
		position: "absolute",
		top: "12%",
		left: "12%",
		width: "76%",
		height: "76%",
		zIndex: zIndex + 1,
		backgroundColor: "#121212",
		shouldFill: true,
		focusable: true,
		border: true,
		borderColor: "cyan",
		focusedBorderColor: "cyan",
		title,
		flexDirection: "column",
		padding: 1,
		paddingRight: 3,
		rowGap: 1,
	});
	parent.add(backdrop);
	parent.add(surface);
	return { backdrop, surface };
}

function summary(field: OpenTuiFilterField, filters: OpenTuiFilterState): string {
	const value = filters[field];
	if (Array.isArray(value)) return value.length === 0 ? "All" : value.join(", ");
	return value || "All";
}

/** Mount keyboard-driven filter editor. Tab focuses fields, Enter edits, Ctrl+S applies, Ctrl+R resets. */
export function mountOpenTuiFilterEditor(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiFilterEditorOptions,
): OpenTuiFilterEditorMount {
	let disposed = false;
	const previousFocus = renderer.currentFocusedRenderable;
	let activeIndex = 0;
	let selecting: OpenTuiFilterField | undefined;
	let choiceIndex = 0;
	let filters = normalizeFilters(options.initial ?? emptyFilters());
	const { backdrop, surface } = addModalSurface(renderer, parent, options.title ?? "Filters");
	const search = new InputRenderable(renderer, {
		alignSelf: "stretch",
		value: filters.search,
		backgroundColor: "#121212",
		textColor: "#f3f4f6",
		focusedTextColor: "#f3f4f6",
		placeholder: "Search tasks",
		focusedBackgroundColor: "#262626",
	});
	const fields = new TextRenderable(renderer, {
		alignSelf: "stretch",
		flexGrow: 1,
		flexBasis: 0,
		wrapMode: "none",
		fg: "#f3f4f6",
	});
	const help = new TextRenderable(renderer, {
		alignSelf: "stretch",
		height: 2,
		wrapMode: "word",
		fg: "#cbd5e1",
	});
	surface.add(new TextRenderable(renderer, { alignSelf: "stretch", height: 1, content: "Search", fg: "#f3f4f6" }));
	surface.add(search);
	surface.add(fields);
	surface.add(help);

	const choicesFor = (field: Exclude<OpenTuiFilterField, "search">): string[] =>
		field === "labels"
			? normalizeLabelValues(options.choices?.labels)
			: field === "status" || field === "priority"
				? exactNonemptyList(options.choices?.[field])
				: (normalizeStringList(options.choices?.[field]) ?? []);
	const currentChoice = (): string[] => (selecting && selecting !== "search" ? choicesFor(selecting) : []);
	const updateSearch = (): void => {
		filters = { ...filters, search: search.plainText.trim() };
	};
	const render = (): void => {
		if (disposed) return;
		const selectedField = OPEN_TUI_FILTER_FIELDS[activeIndex] ?? "search";
		if (selecting) {
			const selectingField = selecting;
			const choices = currentChoice();
			fields.content = choices.length
				? choices
						.map((choice, index) => {
							const selected = MULTI_VALUE_FIELDS[selectingField]
								? (filters[selectingField] as string[]).some((value) =>
										selectingField === "labels"
											? labelComparisonKey(value) === labelComparisonKey(choice)
											: value === choice,
									)
								: filters[selectingField] === choice;
							return `${index === choiceIndex ? ">" : " "} ${selected ? "[x]" : "[ ]"} ${choice}`;
						})
						.join("\n")
				: "No choices available";
			help.content = `${formatShortcut(shortcutsConfig.filterEditor.previousChoice)}/${formatShortcut(shortcutsConfig.filterEditor.nextChoice)}: choose · ${formatShortcut(shortcutsConfig.filterEditor.toggle)}: toggle · ${formatShortcut(shortcutsConfig.filterEditor.clear)}: clear · ${formatShortcut(shortcutsConfig.filterEditor.confirm)}: done · ${formatShortcut(shortcutsConfig.filterEditor.cancel)}: back`;
		} else {
			fields.content = OPEN_TUI_FILTER_FIELDS.slice(1)
				.map((field) => `${field === selectedField ? ">" : " "} ${FIELD_LABELS[field]}: ${summary(field, filters)}`)
				.join("\n");
			help.content = `${formatShortcut(shortcutsConfig.filterEditor.nextField)}/${formatShortcut(shortcutsConfig.filterEditor.previousField)}: focus · ${formatShortcut(shortcutsConfig.filterEditor.confirm)}: ${activeIndex === 0 ? "apply" : "select"} · ${formatShortcut(shortcutsConfig.filterEditor.apply)}: apply · ${formatShortcut(shortcutsConfig.filterEditor.reset)}: reset · ${formatShortcut(shortcutsConfig.filterEditor.cancel)}: cancel`;
		}
		const selectedRow = selecting ? choiceIndex : Math.max(0, activeIndex - 1);
		fields.scrollY = Math.max(0, selectedRow - Math.max(1, fields.height) + 1);
		renderer.requestRender();
	};
	const setFocus = (index: number): void => {
		activeIndex = (index + OPEN_TUI_FILTER_FIELDS.length) % OPEN_TUI_FILTER_FIELDS.length;
		if (activeIndex === 0) search.focus();
		else surface.focus();
		render();
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		renderer.keyInput.off("keypress", onKeyPress);
		renderer.keyInput.off("paste", onPaste);
		keybindings.clear();
		backdrop.destroy();
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
	};
	const apply = (): void => {
		if (disposed) return;
		updateSearch();
		const applied = copyFilters(filters);
		dispose();
		options.onApply(applied, openTuiTaskListFilter(applied, options.labelMatch));
	};
	const cancel = (): void => {
		if (disposed) return;
		dispose();
		options.onCancel?.();
	};
	const reset = (): void => {
		filters = emptyFilters();
		search.value = "";
		selecting = undefined;
		choiceIndex = 0;
		setFocus(0);
	};
	const toggleChoice = (): void => {
		if (!selecting) return;
		const choice = currentChoice()[choiceIndex];
		if (!choice) return;
		if (MULTI_VALUE_FIELDS[selecting]) {
			const values = filters[selecting] as string[];
			const isSelected = (value: string): boolean =>
				selecting === "labels" ? labelComparisonKey(value) === labelComparisonKey(choice) : value === choice;
			filters = {
				...filters,
				[selecting]: values.some(isSelected) ? values.filter((value) => !isSelected(value)) : [...values, choice],
			};
		} else {
			filters = { ...filters, [selecting]: choice };
		}
		render();
	};
	const keybindings = createKeybindings();
	const handleCancel = (key: KeyEvent): void => {
		key.stopPropagation();
		if (selecting) {
			selecting = undefined;
			render();
			return;
		}
		cancel();
	};
	const handlePreviousChoice = (key: KeyEvent) => {
		if (!selecting) return keybindingPropagation.ignore;
		key.stopPropagation();
		const choices = currentChoice();
		if (choices.length) choiceIndex = (choiceIndex - 1 + choices.length) % choices.length;
		render();
	};
	const handleNextChoice = (key: KeyEvent) => {
		if (!selecting) return keybindingPropagation.ignore;
		key.stopPropagation();
		const choices = currentChoice();
		if (choices.length) choiceIndex = (choiceIndex + 1) % choices.length;
		render();
	};
	const handleClearChoice = (key: KeyEvent) => {
		if (!selecting) return keybindingPropagation.ignore;
		key.stopPropagation();
		if (MULTI_VALUE_FIELDS[selecting]) filters = { ...filters, [selecting]: [] };
		else filters = { ...filters, [selecting]: "" };
		selecting = undefined;
		render();
	};
	const handleToggleChoice = (key: KeyEvent) => {
		if (!selecting) return keybindingPropagation.ignore;
		key.stopPropagation();
		toggleChoice();
	};
	const handleApply = (key: KeyEvent): void => {
		key.stopPropagation();
		apply();
	};
	const handleReset = (key: KeyEvent): void => {
		key.stopPropagation();
		reset();
	};
	const handlePreviousField = (key: KeyEvent) => {
		if (selecting) return keybindingPropagation.ignore;
		key.stopPropagation();
		setFocus(activeIndex - 1);
	};
	const handleNextField = (key: KeyEvent) => {
		if (selecting) return keybindingPropagation.ignore;
		key.stopPropagation();
		setFocus(activeIndex + 1);
	};
	const handleConfirmChoice = (key: KeyEvent) => {
		if (selecting) {
			key.stopPropagation();
			if (!MULTI_VALUE_FIELDS[selecting]) toggleChoice();
			selecting = undefined;
			render();
			return;
		}
		if (activeIndex === 0) {
			key.stopPropagation();
			apply();
			return;
		}
		key.stopPropagation();
		selecting = OPEN_TUI_FILTER_FIELDS[activeIndex] as Exclude<OpenTuiFilterField, "search">;
		choiceIndex = 0;
		render();
	};
	const onKeyPress = (key: KeyEvent): void => {
		if (disposed || key.eventType === "release") return;
		// Global workspace shortcuts run before native inputs unless the modal owns dispatch.
		if (!keybindings.dispatch(key) && !selecting && activeIndex === 0) search.handleKeyPress(key);
		key.preventDefault();
		key.stopPropagation();
	};
	const onPaste = (event: PasteEvent): void => {
		if (disposed) return;
		if (!selecting && activeIndex === 0) search.handlePaste(event);
		event.preventDefault();
		event.stopPropagation();
	};
	keybindings.on(shortcutsConfig.filterEditor.cancel, handleCancel);
	keybindings.on(shortcutsConfig.filterEditor.previousChoice, handlePreviousChoice);
	keybindings.on(shortcutsConfig.filterEditor.nextChoice, handleNextChoice);
	keybindings.on(shortcutsConfig.filterEditor.clear, handleClearChoice);
	keybindings.on(shortcutsConfig.filterEditor.toggle, handleToggleChoice);
	keybindings.on(shortcutsConfig.filterEditor.apply, handleApply);
	keybindings.on(shortcutsConfig.filterEditor.reset, handleReset);
	keybindings.on(shortcutsConfig.filterEditor.previousField, handlePreviousField);
	keybindings.on(shortcutsConfig.filterEditor.nextField, handleNextField);
	keybindings.on(shortcutsConfig.filterEditor.confirm, handleConfirmChoice);
	renderer.keyInput.on("keypress", onKeyPress);
	renderer.keyInput.on("paste", onPaste);
	setFocus(0);
	return {
		values: () => copyFilters({ ...filters, search: search.plainText.trim() }),
		focus(field: OpenTuiFilterField): void {
			selecting = undefined;
			setFocus(OPEN_TUI_FILTER_FIELDS.indexOf(field));
		},
		apply,
		reset,
		cancel,
		dispose,
	};
}

// Every row reserves enough space for "Ctrl+Shift+F, ", the native pending input, and a description gap.
const SHORTCUT_BINDING_MIN_WIDTH = 28;
const SHORTCUT_BINDING_MAX_WIDTH = 32;
const SHORTCUT_PENDING_INPUT_WIDTH = 12;

/** Mount searchable help. Descriptor-backed rows can record project-local shortcut overrides. */
export function mountOpenTuiHelpOverlay(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiHelpOverlayOptions,
): OpenTuiHelpOverlayMount {
	let disposed = false;
	let overrides = options.overrides ?? {};
	let query = "";
	let searching = false;
	let recording: { item: OpenTuiHelpItem; keys: ShortcutKey[] } | undefined;
	let selected = 0;
	let saving = false;
	let message = "";
	let confirming = false;
	let confirmationAction: "save" | "discard" = "save";
	type ShortcutRow = {
		readonly item: OpenTuiHelpItem;
		readonly root: BoxRenderable;
		readonly marker: TextRenderable;
		readonly bindingCell: BoxRenderable;
		readonly binding: TextRenderable;
		pendingInput?: InputRenderable;
	};
	const previousFocus = renderer.currentFocusedRenderable;
	const { backdrop, surface } = addModalSurface(renderer, parent, options.title ?? "Keyboard shortcuts");
	const search = new TextRenderable(renderer, { width: "100%", height: 1, fg: "cyan" });
	const rows = new ScrollBoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		scrollX: false,
		contentOptions: { flexDirection: "column" },
	});
	const ensureSelectionVisible = (): void => {
		if (disposed) return;
		const height = Math.max(1, rows.viewport.height);
		if (selected < rows.scrollTop) rows.scrollTop = selected;
		else if (selected >= rows.scrollTop + height) rows.scrollTop = selected - height + 1;
	};
	for (const box of [rows.viewport, rows.content]) {
		const onSizeChange = box.onSizeChange;
		box.onSizeChange = () => {
			onSizeChange?.call(box);
			ensureSelectionVisible();
			updateBindingColumns();
		};
	}
	const footer = new BoxRenderable(renderer, {
		width: "100%",
		height: 3,
		flexShrink: 0,
		flexDirection: "column",
	});
	const footerText = new TextRenderable(renderer, {
		width: "100%",
		height: 2,
		wrapMode: "word",
		attributes: TextAttributes.DIM,
		fg: "#cbd5e1",
	});
	const confirmationPrompt = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: "Confirm selection",
		fg: "#f3f4f6",
		visible: false,
	});
	const confirmationActions = new BoxRenderable(renderer, {
		width: "100%",
		height: 1,
		flexDirection: "row",
		visible: false,
	});
	const saveAction = new TextRenderable(renderer, {
		width: 8,
		height: 1,
		content: " Save ",
		textAlign: "center",
	});
	const discardAction = new TextRenderable(renderer, {
		width: 11,
		height: 1,
		content: " Discard ",
		textAlign: "center",
	});
	confirmationActions.add(saveAction);
	confirmationActions.add(discardAction);
	footer.add(footerText);
	footer.add(confirmationPrompt);
	footer.add(confirmationActions);
	surface.add(search);
	surface.add(rows);
	surface.add(footer);
	const visibleItems = (): readonly OpenTuiHelpItem[] => {
		const needle = query.toLowerCase();
		return options.items.filter((item) => {
			const keys = item.shortcut ? formatShortcut(item.shortcut, overrides) : item.keys;
			return `${keys} ${item.description}`.toLowerCase().includes(needle);
		});
	};
	const formatSequence = (keys: readonly ShortcutKey[]): string =>
		keys.map((binding) => formatShortcut({ id: "", binding })).join(", ");
	const rowModels: ShortcutRow[] = [];
	let renderedItems: readonly OpenTuiHelpItem[] = [];
	const bindingValue = (item: OpenTuiHelpItem): string =>
		recording?.item === item
			? formatSequence(recording.keys)
			: item.shortcut
				? formatShortcut(item.shortcut, overrides)
				: item.keys;
	const bindingColumnWidth = (): number =>
		Math.min(SHORTCUT_BINDING_MAX_WIDTH, Math.max(SHORTCUT_BINDING_MIN_WIDTH, Math.floor(rows.viewport.width * 0.45)));
	const layoutBinding = (row: ShortcutRow, width: number): void => {
		row.bindingCell.width = width;
		const value = bindingValue(row.item);
		const prefix = row.pendingInput && value ? `${value}, ` : value;
		row.binding.content = prefix;
		row.binding.width = row.pendingInput
			? Math.min(Bun.stringWidth(prefix), width - SHORTCUT_PENDING_INPUT_WIDTH - 1)
			: width - 1;
	};
	const updateBindingColumns = (): void => {
		if (disposed) return;
		const width = bindingColumnWidth();
		for (const row of rowModels) layoutBinding(row, width);
	};
	const createRow = (item: OpenTuiHelpItem): ShortcutRow => {
		const root = new BoxRenderable(renderer, {
			id: `shortcut-row-${rowModels.length}`,
			width: "100%",
			height: 1,
			flexShrink: 0,
			flexDirection: "row",
			shouldFill: true,
		});
		const marker = new TextRenderable(renderer, { width: 2, height: 1, flexShrink: 0, fg: "#f3f4f6" });
		const bindingCell = new BoxRenderable(renderer, {
			width: bindingColumnWidth(),
			height: 1,
			flexShrink: 0,
			flexDirection: "row",
			paddingRight: 1,
		});
		const binding = new TextRenderable(renderer, {
			height: 1,
			flexShrink: 0,
			fg: "#f3f4f6",
			wrapMode: "none",
		});
		const description = new TextRenderable(renderer, {
			flexGrow: 1,
			flexBasis: 0,
			height: 1,
			content: item.description,
			fg: "#f3f4f6",
			wrapMode: "none",
		});
		bindingCell.add(binding);
		root.add(marker);
		root.add(bindingCell);
		root.add(description);
		rows.add(root);
		return { item, root, marker, bindingCell, binding };
	};
	const renderRows = (items: readonly OpenTuiHelpItem[]): void => {
		const itemsChanged =
			renderedItems.length !== items.length || renderedItems.some((item, index) => item !== items[index]);
		if (itemsChanged) {
			for (const row of rowModels) row.root.destroyRecursively();
			rowModels.length = 0;
			renderedItems = items;
			for (const item of items) rowModels.push(createRow(item));
		}
		for (const [index, row] of rowModels.entries()) {
			const pending = recording?.item === row.item && !confirming && !saving;
			if (pending && !row.pendingInput) {
				row.pendingInput = new InputRenderable(renderer, {
					width: SHORTCUT_PENDING_INPUT_WIDTH,
					flexShrink: 0,
					value: "",
					placeholder: "Press key...",
					backgroundColor: "#303030",
					textColor: "#f3f4f6",
					focusedTextColor: "#f3f4f6",
					focusedBackgroundColor: "#3a3a3a",
				});
				row.bindingCell.add(row.pendingInput);
			} else if (!pending && row.pendingInput) {
				row.pendingInput.destroy();
				row.pendingInput = undefined;
			}
			layoutBinding(row, bindingColumnWidth());
			row.marker.content = index === selected ? "> " : "  ";
			row.root.backgroundColor = index === selected ? "#262626" : "#121212";
		}
		ensureSelectionVisible();
		const pendingInput = rowModels.find((row) => row.pendingInput)?.pendingInput;
		if (pendingInput) pendingInput.focus();
		else surface.focus();
	};
	const renderFooter = (): void => {
		const showConfirmation = confirming && !saving;
		footerText.height = showConfirmation ? 1 : 2;
		footerText.content = saving
			? "Saving shortcut…"
			: showConfirmation
				? message
				: recording
					? `Recording: ${recording.item.description}\nPress optional second key. Escape confirms a single-stroke shortcut.`
					: message || options.footer || "↑/↓: select · Enter: record shortcut · /: search · Esc: back/close";
		confirmationPrompt.visible = showConfirmation;
		confirmationActions.visible = showConfirmation;
		saveAction.bg = confirmationAction === "save" ? "#e5e5e5" : "#262626";
		saveAction.fg = confirmationAction === "save" ? "#121212" : "#f3f4f6";
		saveAction.attributes = confirmationAction === "save" ? TextAttributes.BOLD : TextAttributes.NONE;
		discardAction.bg = confirmationAction === "discard" ? "#e5e5e5" : "#262626";
		discardAction.fg = confirmationAction === "discard" ? "#121212" : "#f3f4f6";
		discardAction.attributes = confirmationAction === "discard" ? TextAttributes.BOLD : TextAttributes.NONE;
	};
	const render = (): void => {
		if (disposed) return;
		const compact = renderer.height < 24;
		const narrow = renderer.width < 64;
		surface.top = compact ? 0 : "12%";
		surface.left = narrow ? 0 : "12%";
		surface.width = narrow ? "100%" : "76%";
		surface.height = compact ? "100%" : "76%";
		surface.paddingTop = compact ? 0 : 1;
		surface.paddingBottom = compact ? 0 : 1;
		surface.paddingRight = narrow ? 1 : 3;
		surface.rowGap = compact ? 0 : 1;
		const items = visibleItems();
		selected = Math.max(0, Math.min(selected, items.length - 1));
		search.content = searching ? `Search: /${query}_` : query ? `Search: /${query}` : "/: search shortcuts";
		renderRows(items);
		renderFooter();
		renderer.requestRender();
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		renderer.keyInput.off("keypress", onKeyPress);
		renderer.keyInput.off("paste", onPaste);
		renderer.off("resize", render);
		backdrop.destroy();
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
		options.onClose?.();
	};
	const conflictMessage = (): string | undefined => {
		const current = recording;
		if (!current?.item.shortcut) return undefined;
		const conflict = findShortcutConflict(current.item.shortcut, current.keys, overrides);
		if (!conflict) return undefined;
		const description = options.items.find((row) => row.shortcut?.id === conflict.id)?.description ?? conflict.id;
		return `Conflict: ${formatSequence(current.keys)} is assigned to ${description}.`;
	};
	const showConfirmation = (): void => {
		if (!recording?.item.shortcut) return;
		message = conflictMessage() ?? "";
		confirmationAction = "save";
		confirming = true;
		render();
	};
	const discardRecording = (): void => {
		const item = recording?.item;
		confirming = false;
		recording = undefined;
		message = item ? `Discarded shortcut for ${item.description}` : "";
		render();
	};
	const saveRecording = async (): Promise<void> => {
		const current = recording;
		if (!current?.item.shortcut || !options.onOverridesChange) return;
		const conflict = conflictMessage();
		if (conflict) {
			message = conflict;
			render();
			return;
		}
		const next: ShortcutOverrides = {
			...overrides,
			[current.item.shortcut.id]: { sequence: current.keys },
		};
		saving = true;
		render();
		try {
			await options.onOverridesChange(next);
			overrides = next;
			message = `Saved ${formatShortcut(current.item.shortcut, overrides)}: ${current.item.description}`;
			confirming = false;
			recording = undefined;
		} catch (error) {
			message = `Could not save shortcut: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			saving = false;
			render();
		}
	};
	const record = (key: KeyEvent): void => {
		const current = recording;
		if (!current?.item.shortcut || !options.onOverridesChange) return;
		const chord = shortcutKeyFromEvent(key);
		if (!chord) return;
		const plainEscape =
			chord.key === "escape" && !chord.ctrl && !chord.shift && !chord.meta && !chord.super && !chord.hyper;
		if (current.keys.length === 1 && plainEscape) {
			showConfirmation();
			return;
		}
		current.keys.push(chord);
		if (current.keys.length === 2) showConfirmation();
		else render();
	};
	const onKeyPress = (key: KeyEvent): void => {
		if (disposed) return;
		key.preventDefault();
		key.stopPropagation();
		if (key.eventType === "release" || saving) return;
		const plain = !key.ctrl && !key.meta && !key.option && !key.shift && !key.super && !key.hyper;
		if (confirming) {
			if (plain && (key.name === "left" || key.name === "right")) {
				confirmationAction = confirmationAction === "save" ? "discard" : "save";
				render();
			} else if (plain && (key.name === "return" || key.name === "enter")) {
				if (confirmationAction === "save") void saveRecording();
				else discardRecording();
			} else if (plain && key.name === "escape") discardRecording();
			return;
		}
		if (recording) {
			record(key);
			return;
		}
		if (plain && key.name === "escape") {
			message = "";
			if (searching || query) {
				searching = false;
				query = "";
				selected = 0;
			} else dispose();
		} else if (plain && (key.name === "up" || key.name === "down")) {
			const count = visibleItems().length;
			if (count) selected = (selected + (key.name === "up" ? -1 : 1) + count) % count;
			message = "";
		} else if (plain && (key.name === "return" || key.name === "enter")) {
			searching = false;
			const item = visibleItems()[selected];
			if (item?.shortcut && options.onOverridesChange) {
				recording = { item, keys: [] };
				message = "";
			} else message = item ? "This shortcut is read-only." : "No matching shortcuts";
		} else if (searching) {
			if (plain && key.name === "backspace") query = Array.from(query).slice(0, -1).join("");
			else if (!key.ctrl && !key.meta && !key.option && !key.super && !key.hyper) {
				const text =
					key.name === "space"
						? " "
						: key.sequence && !/\p{Cc}/u.test(key.sequence)
							? key.sequence
							: Array.from(key.name).length === 1
								? key.shift
									? key.name.toUpperCase()
									: key.name
								: "";
				query += text;
			}
			selected = 0;
			message = "";
		} else if (plain && key.name === "/") {
			searching = true;
			message = "";
		}
		render();
	};
	const onPaste = (event: PasteEvent): void => {
		event.preventDefault();
		event.stopPropagation();
		if (searching && !recording && !confirming && !saving) {
			query += new TextDecoder().decode(event.bytes).replace(/\p{Cc}/gu, "");
			selected = 0;
			render();
		}
	};
	renderer.keyInput.on("keypress", onKeyPress);
	renderer.keyInput.on("paste", onPaste);
	renderer.on("resize", render);
	surface.focus();
	render();
	return { dispose };
}
