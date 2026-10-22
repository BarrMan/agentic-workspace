import {
	BoxRenderable,
	type CliRenderer,
	InputRenderable,
	type KeyEvent,
	type PasteEvent,
	TextAttributes,
	TextareaRenderable,
	TextRenderable,
} from "@opentui/core";
import {
	type AgentConfiguration,
	type ModeProfile,
	resolveSessionSettings,
	type SessionSettings,
} from "../../model/session/types.ts";
import type { profilePermissionSupport } from "../../runtime/agents/core/profile.ts";
import { mountAgentPresetsEditor } from "./agent-presets-editor.ts";
import { ModeSettingsDraft, type ModeSettingsSave } from "./mode-settings-draft.ts";
import { mountOpenTuiModesEditor } from "./modes-editor.ts";

const SESSION_OPTION_COUNT = 3;
const PRESET_PICKER_PALETTE = {
	background: "#18181b",
	text: "#d4d4d8",
	dimmed: "#a1a1aa",
	border: "#52525b",
	accent: "#22d3ee",
	danger: "#f87171",
} as const;

export type OpenTuiAgentSettingsOptions = {
	readonly configuration: AgentConfiguration;
	readonly profilePermissionSupport?: (profile: ModeProfile) => ReturnType<typeof profilePermissionSupport>;
	readonly onSave: (configuration: AgentConfiguration) => Promise<void>;
	/** Optional atomic mode configuration/session-move save boundary. */
	readonly onSaveModeSettings?: ModeSettingsSave;
	readonly modeSessionCounts?: Readonly<Record<string, number>>;
	readonly getModeSessionCount?: (modeId: string) => number;
	readonly discoverModeModels?: (scope: {
		readonly harness: string;
		readonly preset: string;
	}) => Promise<readonly { id: string; label?: string }[]>;
	readonly onClose: () => void;
};

export type OpenTuiPresetPickerOptions = {
	readonly configuration: AgentConfiguration;
	readonly title?: string;
	readonly inheritLabel?: string;
	readonly onSelect: (presetName: string | undefined) => Promise<void>;
	readonly onClose: () => void;
};

export type OpenTuiAgentSettingsMount = {
	dispose(): void;
};

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

type PresetPickerSurface = {
	readonly backdrop: BoxRenderable;
	readonly surface: BoxRenderable;
	recenter(): void;
};

/** Compact, centered dropdown styled like the Settings screen, with a light dim backdrop. */
function addPresetPickerSurface(
	renderer: CliRenderer,
	parent: BoxRenderable,
	title: string,
	zIndex: number,
	longestEntry: number,
	rowCount: number,
): PresetPickerSurface {
	const backdrop = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		backgroundColor: "black",
		opacity: 0.35,
		zIndex,
	});
	const surface = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: 3,
		zIndex: zIndex + 1,
		backgroundColor: PRESET_PICKER_PALETTE.background,
		focusable: true,
		border: true,
		borderStyle: "rounded",
		borderColor: PRESET_PICKER_PALETTE.accent,
		focusedBorderColor: PRESET_PICKER_PALETTE.accent,
		title,
		titleColor: PRESET_PICKER_PALETTE.accent,
		flexDirection: "column",
		paddingY: 1,
		paddingX: 2,
		rowGap: 1,
	});
	const viewportWidth = (): number => (renderer.width > 0 ? renderer.width : 80);
	const viewportHeight = (): number => (renderer.height > 0 ? renderer.height : 24);
	const recenter = (): void => {
		const horizontalChrome = 6;
		const verticalChrome = 4;
		const rowGap = 1;
		const fractionalWidth = Math.floor(viewportWidth() * 0.8);
		const contentWidth = Math.max(title.length + 4, longestEntry + 4 + horizontalChrome, 56);
		const width = Math.max(8, Math.min(Math.max(fractionalWidth, contentWidth), Math.max(8, viewportWidth() - 4)));
		const desiredHeight = rowCount + rowCount * rowGap + 1 + verticalChrome;
		const height = Math.max(3, Math.min(desiredHeight, Math.max(3, viewportHeight() - 2)));
		surface.width = width;
		surface.height = height;
		surface.top = Math.max(0, Math.floor((viewportHeight() - height) / 2));
		surface.left = Math.max(0, Math.floor((viewportWidth() - width) / 2));
	};
	surface.onSizeChange = recenter;
	recenter();
	parent.add(backdrop);
	parent.add(surface);
	return { backdrop, surface, recenter };
}

/**
 * Mount full-screen, project-local agent settings. Changes persist only after Save.
 * AoE's header, adjacent rounded panes, and footer remain; unsupported scope/search UI does not.
 */
export function mountOpenTuiAgentSettings(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiAgentSettingsOptions,
): OpenTuiAgentSettingsMount {
	let disposed = false;
	let saving = false;
	let categoryFocused = true;
	let error: string | undefined;
	const previousFocus = renderer.currentFocusedRenderable;
	const draft = structuredClone(options.configuration);
	let selectedCategory: "agents" | "sessions" | "modes" = "agents";
	let sessionIndex = 0;
	const modeDraft = draft.modes ? new ModeSettingsDraft(draft) : undefined;
	const sessionSettings: SessionSettings = { ...resolveSessionSettings(draft) };
	const background = "#18181b";
	const text = "#d4d4d8";
	const dimmed = "#a1a1aa";
	const border = "#52525b";
	const accent = "#22d3ee";
	const surface = new BoxRenderable(renderer, {
		position: "absolute",
		top: 0,
		left: 0,
		width: "100%",
		height: "100%",
		zIndex: 41,
		backgroundColor: background,
		shouldFill: true,
		focusable: true,
		flexDirection: "column",
	});
	surface.onMouseDown = (event) => {
		// Suppress native mouse autofocus while saving without disabling focused controls' blur/cleanup.
		if (saving) event.preventDefault();
	};
	const header = new BoxRenderable(renderer, {
		width: "100%",
		height: 3,
		flexShrink: 0,
		border: ["bottom"],
		borderColor: border,
		paddingLeft: 2,
		flexDirection: "row",
	});
	header.add(new TextRenderable(renderer, { content: "Settings", width: 12, height: 1, fg: text }));
	header.add(new TextRenderable(renderer, { content: "[ Project ]", height: 1, fg: accent }));
	const body = new BoxRenderable(renderer, {
		width: "100%",
		flexGrow: 1,
		flexBasis: 0,
		minHeight: 3,
		flexDirection: "row",
		overflow: "hidden",
	});
	const categories = new BoxRenderable(renderer, {
		width: 20,
		height: "100%",
		flexShrink: 0,
		border: true,
		borderStyle: "rounded",
		borderColor: accent,
		focusable: true,
		focusedBorderColor: accent,
		title: "Categories",
		titleColor: dimmed,
		paddingX: 1,
		flexDirection: "column",
	});
	const agentsCategory = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: "> Agents",
		attributes: TextAttributes.BOLD,
		fg: accent,
	});
	const sessionsCategory = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: "  Sessions",
		fg: text,
	});
	const modesCategory = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: "  Modes",
		fg: text,
	});
	categories.add(agentsCategory);
	categories.add(sessionsCategory);
	categories.add(modesCategory);
	const contentPane = new BoxRenderable(renderer, {
		flexGrow: 1,
		flexBasis: 0,
		minWidth: 0,
		height: "100%",
		flexDirection: "column",
	});
	const fieldDescription = (content: string): TextRenderable =>
		new TextRenderable(renderer, { width: "100%", content, wrapMode: "word", fg: dimmed, visible: false });
	const agentsEditor = mountAgentPresetsEditor(renderer, contentPane, draft, () => {
		categoryFocused = false;
		render();
	});
	const sessionsPane = new BoxRenderable(renderer, {
		flexGrow: 1,
		flexBasis: 0,
		minWidth: 0,
		height: "100%",
		border: true,
		borderStyle: "rounded",
		borderColor: border,
		title: "Sessions",
		titleColor: dimmed,
		paddingX: 1,
		flexDirection: "column",
		focusable: true,
		visible: false,
	});
	const sessionsHeading = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: "Session behavior",
		attributes: TextAttributes.BOLD,
		fg: text,
	});
	const worktreeRow = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none", fg: text });
	const worktreeDescription = fieldDescription(
		"Create a git worktree per task and remove it when the task reaches Done.",
	);
	const yoloRow = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none", fg: text });
	const yoloDescription = fieldDescription(
		"Permission bypass flags configured by an agent preset override permission restrictions even when YOLO mode is off. OpenCode uses --auto; Claude may use --dangerously-skip-permissions; Pi has no verified flag. Permission auto-acceptance never approves artifacts; only you may approve them or change .artifacts.json.",
	);
	const autoResumeRow = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none", fg: text });
	const autoResumeDescription = fieldDescription(
		"Automatically resume eligible native agent sessions after a workspace restart.",
	);
	for (const child of [
		sessionsHeading,
		worktreeRow,
		worktreeDescription,
		yoloRow,
		yoloDescription,
		autoResumeRow,
		autoResumeDescription,
	]) {
		sessionsPane.add(child);
	}
	body.add(categories);
	body.add(contentPane);
	body.add(sessionsPane);
	const footer = new BoxRenderable(renderer, {
		width: "100%",
		height: 3,
		flexShrink: 0,
		border: ["top"],
		borderColor: border,
		flexDirection: "column",
	});
	const keys = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none", fg: dimmed });
	const status = new TextRenderable(renderer, { width: "100%", wrapMode: "word", fg: dimmed });
	footer.add(keys);
	footer.add(status);
	surface.add(header);
	const modesEditor = mountOpenTuiModesEditor(renderer, parent, body, surface, {
		configuration: draft,
		draft: modeDraft,
		profilePermissionSupport: options.profilePermissionSupport,
		modeSessionCounts: options.modeSessionCounts,
		getModeSessionCount: options.getModeSessionCount,
		discoverModeModels: options.discoverModeModels,
		onRender: () => render(),
		onError: (message) => {
			error = message;
		},
	});
	surface.add(body);
	surface.add(footer);
	parent.add(surface);

	const keyHints = (): string => {
		if (selectedCategory === "sessions") {
			return categoryFocused
				? surface.width < 72
					? "↑↓ category  Enter/Tab open  ^S save  Esc discard"
					: "↑/↓: category  Enter/Tab: open  Ctrl+S: save draft  Esc: discard"
				: surface.width < 72
					? "↑↓/Tab move Space toggle ← back ^S save Esc discard"
					: "↑/↓/Tab: move  Space/Enter: toggle  ←: categories  Ctrl+S: save  Esc: discard";
		}
		if (selectedCategory === "modes") {
			return categoryFocused
				? surface.width < 72
					? "↑↓ category  Enter/Tab open  ^S save  Esc discard"
					: "↑/↓: category  Enter/Tab: open  Ctrl+S: save draft  Esc: discard"
				: modesEditor.keyHints(surface.width);
		}
		return categoryFocused
			? surface.width < 72
				? "→/Enter/Tab fields  ^S save  Esc discard"
				: "Right/Enter/Tab: fields  Ctrl+S: save draft  Esc: discard"
			: agentsEditor.keyHints(surface.width);
	};
	surface.onSizeChange = () => {
		categories.width = surface.width >= 60 ? 20 : Math.max(10, Math.floor(surface.width / 4));
		agentsEditor.render(selectedCategory === "agents", categoryFocused);
		modesEditor.render(selectedCategory === "modes", !categoryFocused, surface.width);
		keys.content = keyHints();
	};
	const renderSessionsPane = (): void => {
		categories.borderColor = categoryFocused ? accent : border;
		agentsCategory.fg = categoryFocused && selectedCategory === "agents" ? accent : text;
		sessionsCategory.fg = categoryFocused && selectedCategory === "sessions" ? accent : text;
		modesCategory.fg = categoryFocused && selectedCategory === "modes" ? accent : text;
		agentsCategory.attributes = selectedCategory === "agents" ? TextAttributes.BOLD : TextAttributes.NONE;
		sessionsCategory.attributes = selectedCategory === "sessions" ? TextAttributes.BOLD : TextAttributes.NONE;
		modesCategory.attributes = selectedCategory === "modes" ? TextAttributes.BOLD : TextAttributes.NONE;
		sessionsPane.borderColor = categoryFocused ? border : accent;
		const sessionRows = [
			{
				row: worktreeRow,
				description: worktreeDescription,
				enabled: sessionSettings.worktreePerTask,
				label: "Worktree per task",
			},
			{ row: yoloRow, description: yoloDescription, enabled: sessionSettings.yoloMode, label: "YOLO mode" },
			{
				row: autoResumeRow,
				description: autoResumeDescription,
				enabled: sessionSettings.autoResumeOnRestart ?? true,
				label: "Auto-resume on restart",
			},
		];
		for (const [index, option] of sessionRows.entries()) {
			const focused = !categoryFocused && index === sessionIndex;
			option.row.content = `${focused ? ">" : " "} [${option.enabled ? "x" : " "}] ${option.label}`;
			option.row.fg = focused ? accent : text;
			option.description.visible = true;
		}
		keys.content = keyHints();
		const visibleError = error ?? agentsEditor.error;
		status.content = visibleError
			? `Error: ${visibleError}`
			: saving
				? "Saving project sessions…"
				: "Project sessions · settings apply to every launch";
		status.fg = visibleError ? "#f87171" : dimmed;
		status.height = visibleError ? 2 : 1;
		footer.height = visibleError ? 4 : 3;
		renderer.requestRender();
	};
	const render = (): void => {
		if (disposed) return;
		const agentsSelected = selectedCategory === "agents";
		const sessionsSelected = selectedCategory === "sessions";
		contentPane.visible = agentsSelected;
		sessionsPane.visible = sessionsSelected;
		agentsEditor.render(agentsSelected, categoryFocused);
		modesEditor.render(selectedCategory === "modes", !categoryFocused, surface.width);
		agentsCategory.content = `${categoryFocused && agentsSelected ? ">" : " "} Agents`;
		sessionsCategory.content = `${categoryFocused && sessionsSelected ? ">" : " "} Sessions`;
		modesCategory.content = `${categoryFocused && selectedCategory === "modes" ? ">" : " "} Modes`;
		if (sessionsSelected) {
			renderSessionsPane();
			return;
		}
		if (selectedCategory === "modes") {
			categories.borderColor = categoryFocused ? accent : border;
			for (const [category, row] of [
				["agents", agentsCategory],
				["sessions", sessionsCategory],
				["modes", modesCategory],
			] as const) {
				row.fg = categoryFocused && selectedCategory === category ? accent : text;
				row.attributes = selectedCategory === category ? TextAttributes.BOLD : TextAttributes.NONE;
			}
			keys.content = keyHints();
			const visibleError = error ?? agentsEditor.error;
			status.content = visibleError
				? `Error: ${visibleError}`
				: saving
					? "Saving project modes…"
					: "Mode profile overview · edits are staged until Save";
			status.fg = visibleError ? "#f87171" : dimmed;
			status.height = visibleError ? 2 : 1;
			footer.height = visibleError ? 4 : 3;
			renderer.requestRender();
			return;
		}
		categories.borderColor = categoryFocused ? accent : border;
		agentsCategory.fg = categoryFocused ? accent : text;
		agentsCategory.attributes = TextAttributes.BOLD;
		sessionsCategory.fg = categoryFocused && selectedCategory === "sessions" ? accent : text;
		sessionsCategory.attributes = selectedCategory === "sessions" ? TextAttributes.BOLD : TextAttributes.NONE;
		keys.content = keyHints();
		const visibleError = error ?? agentsEditor.error;
		status.content = visibleError
			? `Error: ${visibleError}`
			: saving
				? "Saving project agents…"
				: agentsEditor.statusText();
		status.fg = visibleError ? "#f87171" : dimmed;
		status.height = visibleError ? 2 : 1;
		footer.height = visibleError ? 4 : 3;
		renderer.requestRender();
	};
	const focusList = (focusCategory = false): void => {
		categoryFocused = focusCategory;
		if (focusCategory) {
			agentsEditor.deactivate();
			categories.focus();
		} else if (selectedCategory === "agents") agentsEditor.activate();
		else if (selectedCategory === "sessions") focusSessionsPane();
		else focusModes("list");
		render();
	};
	const focusSessionsPane = (): void => {
		agentsEditor.deactivate();
		categoryFocused = false;
		sessionsPane.focus();
		render();
	};
	const focusModes = (pane: "list" | "profile"): void => {
		agentsEditor.deactivate();
		categoryFocused = false;
		modesEditor.activate(pane);
		render();
	};
	const categoryFocusHandler = (): void => {
		if (disposed || saving || categoryFocused) return;
		focusList(true);
	};
	categories.on("focused", categoryFocusHandler);
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		agentsEditor.dispose();
		modesEditor.dispose();
		renderer.keyInput.off("keypress", onKeyPress);
		renderer.keyInput.off("paste", onPaste);
		categories.off("focused", categoryFocusHandler);
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
		options.onClose();
	};
	const buildConfiguration = (): AgentConfiguration => {
		// Only Enter-committed field values belong to the project draft.
		const presets = agentsEditor.buildPresets();
		const selectedPreset = draft.selectedPreset;
		if (!selectedPreset || !Object.hasOwn(presets, selectedPreset))
			throw new Error("Choose a configured default preset.");
		const result = { ...draft, selectedPreset, presets, sessions: { ...sessionSettings } };
		if (modeDraft) result.modes = structuredClone(modeDraft.configuration.modes);
		if (modeDraft) modeDraft.validate();
		return result;
	};
	const save = async (): Promise<void> => {
		if (saving || disposed) return;
		saving = true;
		error = undefined;
		agentsEditor.clearError();
		render();
		try {
			const configuration = buildConfiguration();
			if (modeDraft && options.onSaveModeSettings) {
				modeDraft.configuration = configuration;
				await modeDraft.save(options.onSaveModeSettings);
			} else await options.onSave(configuration);
			dispose();
		} catch (cause) {
			if (!disposed) {
				error = errorMessage(cause, "Could not save project agent settings.");
			}
		} finally {
			saving = false;
			render();
		}
	};
	const onKeyPress = (event: KeyEvent): void => {
		if (disposed || modesEditor.pickerOpen || event.eventType === "release") return;
		event.preventDefault();
		event.stopPropagation();
		if (saving) return;
		const agentAction = selectedCategory === "agents" ? agentsEditor.handleKeyPress(event) : "unhandled";
		if (agentAction !== "unhandled") {
			if (agentAction === "save") void save();
			else if (agentAction === "discard") dispose();
			else if (agentAction === "categories") focusList(true);
			render();
			return;
		}
		const action = modesEditor.handleKeyPress(event);
		if (action !== "unhandled") {
			if (action === "save") void save();
			else if (action === "discard") dispose();
			else if (action === "categories") focusList(true);
			return;
		}
		const plain = !event.ctrl && !event.shift && !event.meta && !event.option && !event.super && !event.hyper;
		if (plain && event.name === "escape") {
			dispose();
			return;
		}
		if (
			event.ctrl &&
			!event.shift &&
			!event.meta &&
			!event.option &&
			!event.super &&
			!event.hyper &&
			event.name === "s"
		) {
			void save();
			return;
		}
		if (selectedCategory === "sessions") {
			if (!event.ctrl && !event.meta && !event.option && !event.super && !event.hyper && event.name === "tab") {
				if (event.shift) {
					if (categoryFocused || sessionIndex === 0) focusList(true);
					else sessionIndex -= 1;
				} else if (categoryFocused) {
					focusSessionsPane();
					return;
				} else if (sessionIndex === SESSION_OPTION_COUNT - 1) {
					focusList(true);
					return;
				} else {
					sessionIndex += 1;
				}
				render();
				return;
			}
			if (categoryFocused) {
				if (plain && (event.name === "return" || event.name === "right")) {
					focusSessionsPane();
					return;
				}
				if (plain && ["up", "k", "down", "j"].includes(event.name)) {
					selectedCategory = event.name === "up" || event.name === "k" ? "agents" : "modes";
					render();
				}
				return;
			}
			if (!plain) return;
			if (event.name === "left") {
				focusList(true);
				return;
			}
			if (["up", "k", "down", "j"].includes(event.name)) {
				const delta = event.name === "up" || event.name === "k" ? -1 : 1;
				sessionIndex = (sessionIndex + delta + SESSION_OPTION_COUNT) % SESSION_OPTION_COUNT;
				render();
				return;
			}
			if (["space", "return", "linefeed", "kpenter"].includes(event.name)) {
				switch (sessionIndex) {
					case 0:
						sessionSettings.worktreePerTask = !sessionSettings.worktreePerTask;
						break;
					case 1:
						sessionSettings.yoloMode = !sessionSettings.yoloMode;
						break;
					case 2:
						sessionSettings.autoResumeOnRestart = !(sessionSettings.autoResumeOnRestart ?? true);
						break;
				}
				error = undefined;
				render();
				return;
			}
			return;
		}
		if (selectedCategory === "modes") {
			if (!event.ctrl && !event.meta && !event.option && !event.super && !event.hyper && event.name === "tab") {
				focusModes(event.shift ? "profile" : "list");
				return;
			}
			if (plain && (event.name === "return" || event.name === "right")) focusModes("list");
			if (plain && ["up", "k", "down", "j"].includes(event.name)) {
				selectedCategory = event.name === "up" || event.name === "k" ? "sessions" : "agents";
				render();
			}
			return;
		}
		if (categoryFocused) {
			if (plain && (event.name === "return" || event.name === "right")) focusList();
			if (plain && ["up", "k", "down", "j"].includes(event.name)) {
				selectedCategory = event.name === "up" || event.name === "k" ? "modes" : "sessions";
				render();
			}
			return;
		}
		if (!plain) return;
		if (selectedCategory === "agents") return;
	};
	const onPaste = (event: PasteEvent): void => {
		if (modesEditor.pickerOpen) return;
		event.preventDefault();
		event.stopPropagation();
		if (disposed || saving) return;
		const focused = renderer.currentFocusedRenderable;
		if (focused instanceof TextareaRenderable || focused instanceof InputRenderable) {
			focused.handlePaste(event);
			renderer.requestRender();
		}
	};
	renderer.keyInput.on("keypress", onKeyPress);
	renderer.keyInput.on("paste", onPaste);
	focusList(true);
	return { dispose };
}

/** Mount keyboard picker for a task or handoff preset. Callback failure leaves picker open. */
export function mountOpenTuiPresetPicker(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiPresetPickerOptions,
): OpenTuiAgentSettingsMount {
	const entries = [
		...(options.inheritLabel ? [{ name: options.inheritLabel, value: undefined }] : []),
		...Object.keys(options.configuration.presets ?? {}).map((name) => ({ name, value: name })),
	];
	let selected = Math.max(
		0,
		entries.findIndex((entry) => entry.value === options.configuration.selectedPreset),
	);
	let busy = false;
	let disposed = false;
	let error: string | undefined;
	const previousFocus = renderer.currentFocusedRenderable;
	const longestEntry = entries.reduce((max, entry) => Math.max(max, entry.name.length), 0);
	const { backdrop, surface } = addPresetPickerSurface(
		renderer,
		parent,
		options.title ?? "Choose agent preset",
		50,
		longestEntry,
		Math.max(1, entries.length),
	);
	const rows = entries.map(
		() =>
			new TextRenderable(renderer, {
				width: "100%",
				height: 1,
				wrapMode: "none",
				fg: PRESET_PICKER_PALETTE.text,
				bg: PRESET_PICKER_PALETTE.background,
			}),
	);
	const footer = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		wrapMode: "none",
		fg: PRESET_PICKER_PALETTE.dimmed,
	});
	for (const row of rows) surface.add(row);
	surface.add(footer);
	const render = (): void => {
		if (disposed) return;
		for (const [index, entry] of entries.entries()) {
			const row = rows[index];
			if (!row) continue;
			const marker = entry.value === options.configuration.selectedPreset ? " ●" : "";
			row.content = `${index === selected ? ">" : " "} ${entry.name}${marker}`;
			if (index === selected) {
				row.fg = PRESET_PICKER_PALETTE.background;
				row.bg = PRESET_PICKER_PALETTE.accent;
				row.attributes = TextAttributes.BOLD;
			} else {
				row.fg = PRESET_PICKER_PALETTE.text;
				row.bg = PRESET_PICKER_PALETTE.background;
				row.attributes = TextAttributes.NONE;
			}
		}
		if (entries.length === 0) {
			footer.content = "No configured presets.";
			footer.fg = PRESET_PICKER_PALETTE.dimmed;
		} else if (error) {
			footer.content = `Error: ${error}`;
			footer.fg = PRESET_PICKER_PALETTE.danger;
		} else if (busy) {
			footer.content = "Selecting preset…";
			footer.fg = PRESET_PICKER_PALETTE.dimmed;
		} else {
			footer.content = "↑/↓ select · Enter choose · Esc cancel";
			footer.fg = PRESET_PICKER_PALETTE.dimmed;
		}
		renderer.requestRender();
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		renderer.keyInput.off("keypress", onKeyPress);
		renderer.keyInput.off("paste", onPaste);
		backdrop.destroy();
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
		options.onClose();
	};
	const choose = async (): Promise<void> => {
		const entry = entries[selected];
		if (!entry || busy) return;
		busy = true;
		error = undefined;
		render();
		try {
			await options.onSelect(entry.value);
			dispose();
		} catch (cause) {
			if (!disposed) {
				error = errorMessage(cause, "Could not select preset.");
				render();
			}
		} finally {
			busy = false;
		}
	};
	const onKeyPress = (event: KeyEvent): void => {
		if (disposed || event.eventType === "release") return;
		event.preventDefault();
		event.stopPropagation();
		if (busy) return;
		if (event.ctrl || event.shift || event.meta || event.option || event.super || event.hyper) return;
		if (event.name === "escape") {
			dispose();
			return;
		}
		if (event.name === "return") {
			void choose();
			return;
		}
		if (event.name === "up" || event.name === "k") selected = Math.max(0, selected - 1);
		if (event.name === "down" || event.name === "j") selected = Math.min(entries.length - 1, selected + 1);
		render();
	};
	const onPaste = (event: PasteEvent): void => {
		event.preventDefault();
		event.stopPropagation();
	};
	renderer.keyInput.on("keypress", onKeyPress);
	renderer.keyInput.on("paste", onPaste);
	surface.focus();
	render();
	return { dispose };
}
