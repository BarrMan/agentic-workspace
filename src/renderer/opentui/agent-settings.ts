import {
	BoxRenderable,
	type CliRenderer,
	InputRenderable,
	type KeyEvent,
	type PasteEvent,
	ScrollBoxRenderable,
	TextAttributes,
	TextareaRenderable,
	TextRenderable,
} from "@opentui/core";
import { slug } from "../../lib/slug.ts";
import { agentCommandArgvSchema, validateArtifactPath } from "../../model/session/agent-config-schema.ts";
import { effectiveModeTextColor, MODE_TEXT_COLORS } from "../../model/session/mode-colors.ts";
import {
	type AgentConfiguration,
	type AgentPreset,
	type ModeProfile,
	resolveSessionSettings,
	type SessionSettings,
} from "../../model/session/types.ts";
import { profilePermissionSupport } from "../../runtime/agents/core/profile.ts";
import { AGENT_PRESENTATION_METADATA } from "../../storage/config.ts";
import { mountOpenTuiModeModelPicker } from "./mode-model-picker.ts";
import { ModeSettingsDraft, type ModeSettingsSave } from "./mode-settings-draft.ts";

const SESSION_OPTION_COUNT = 3;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PRESET_PICKER_PALETTE = {
	background: "#18181b",
	text: "#d4d4d8",
	dimmed: "#a1a1aa",
	border: "#52525b",
	accent: "#22d3ee",
	danger: "#f87171",
} as const;

type FormState = {
	command: string;
	resumeFlag: string;
	environment: string;
	initialEnvironment: string;
};

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

function environmentLines(environment: Record<string, string>): string {
	return Object.entries(environment)
		.map(([name, value]) => `${name}=${value}`)
		.join("\n");
}

/** Parse NAME=value lines without treating later equals signs as separators. */
export function parseAgentPresetEnvironment(lines: string): Record<string, string> {
	const environment: Record<string, string> = {};
	for (const [index, line] of lines.split("\n").entries()) {
		if (!line.trim()) continue;
		const separator = line.indexOf("=");
		if (separator <= 0) throw new Error(`Environment line ${index + 1} must use NAME=value.`);
		const name = line.slice(0, separator);
		if (!ENV_NAME.test(name)) throw new Error(`Environment line ${index + 1} has invalid name ${name}.`);
		if (Object.hasOwn(environment, name)) throw new Error(`Environment line ${index + 1} repeats ${name}.`);
		environment[name] = line.slice(separator + 1);
	}
	return environment;
}

/** Parse editable artifact definitions without creating or touching task files. */
export function parseModeArtifactDefinitions(lines: string): Array<{ path: string; purpose: string }> {
	const definitions: Array<{ path: string; purpose: string }> = [];
	const paths = new Set<string>();
	for (const [index, line] of lines.split("\n").entries()) {
		if (!line.trim()) continue;
		const separator = line.indexOf(" — ");
		const path = (separator < 0 ? line : line.slice(0, separator)).trim();
		const purpose = (separator < 0 ? "Declared artifact" : line.slice(separator + 3)).trim();
		if (
			!path ||
			path.includes("\\") ||
			path.startsWith("/") ||
			/^[A-Za-z]:/.test(path) ||
			path.split("/").some((part) => !part || part === "." || part === "..")
		) {
			throw new Error(`Artifact definition line ${index + 1} has an invalid relative path: ${path}`);
		}
		if (path === "task.md" || path === ".artifacts.json") {
			throw new Error(`Artifact definition line ${index + 1} uses a reserved path: ${path}`);
		}
		if (paths.has(path)) throw new Error(`Artifact definition line ${index + 1} repeats ${path}.`);
		if (!purpose) throw new Error(`Artifact ${path} needs a purpose.`);
		paths.add(path);
		definitions.push({ path, purpose });
	}
	return definitions;
}

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

function presetState(preset: AgentPreset): FormState {
	const environment = environmentLines(preset.env);
	return {
		command: JSON.stringify(preset.command),
		resumeFlag: preset.resumeFlag ?? "",
		environment,
		initialEnvironment: environment,
	};
}

function editedPreset(name: string, preset: AgentPreset, state: FormState): AgentPreset {
	let command: string[];
	try {
		command = agentCommandArgvSchema.parse(JSON.parse(state.command));
	} catch (cause) {
		throw new Error(`Preset ${name} command must be valid JSON argv: ${errorMessage(cause, "invalid command.")}`);
	}
	const resumeFlag = state.resumeFlag.trim();
	const environment =
		state.environment === state.initialEnvironment
			? structuredClone(preset.env)
			: parseAgentPresetEnvironment(state.environment);
	const next: AgentPreset = { ...preset, command, env: environment };
	if (resumeFlag) next.resumeFlag = resumeFlag;
	else delete next.resumeFlag;
	return next;
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
	let activeField = -1;
	let categoryFocused = true;
	let editing = false;
	let editPresetIndex = 0;
	let selectedIndex = 0;
	let selectedModeIndex = 0;
	let selectedModeId: string | undefined;
	let modeFocus: "list" | "profile" = "list";
	let modelPicker: ReturnType<typeof mountOpenTuiModeModelPicker> | undefined;
	let error: string | undefined;
	const previousFocus = renderer.currentFocusedRenderable;
	const draft = structuredClone(options.configuration);
	let selectedCategory: "agents" | "sessions" | "modes" = "agents";
	let sessionIndex = 0;
	const modeDraft = draft.modes ? new ModeSettingsDraft(draft) : undefined;
	const sessionSettings: SessionSettings = { ...resolveSessionSettings(draft) };
	const presets = draft.presets ?? {};
	const names = Object.keys(presets);
	const states = new Map<string, FormState>(names.map((name) => [name, presetState(presets[name] as AgentPreset)]));
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
		border: true,
		borderStyle: "rounded",
		borderColor: border,
		paddingX: 1,
		flexDirection: "column",
	});
	const editorPane = new ScrollBoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		scrollX: false,
		contentOptions: { flexDirection: "column", padding: 0, rowGap: 1 },
		verticalScrollbarOptions: { trackOptions: { backgroundColor: background, foregroundColor: dimmed } },
	});
	// Horizontal editing belongs to the native inputs, not the settings viewport.
	editorPane.horizontalScrollBar.visible = false;
	const fieldLabel = (content: string): TextRenderable =>
		new TextRenderable(renderer, { width: "100%", height: 1, content, fg: text });
	const fieldDescription = (content: string): TextRenderable =>
		new TextRenderable(renderer, { width: "100%", content, wrapMode: "word", fg: dimmed, visible: false });
	const fieldValue = (): TextRenderable => new TextRenderable(renderer, { width: "100%", wrapMode: "word", fg: text });
	const inputOptions = {
		width: "100%" as const,
		backgroundColor: background,
		focusedBackgroundColor: background,
		textColor: text,
		focusedTextColor: accent,
	};
	const presetLabel = fieldLabel("Preset");
	const presetValue = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none", fg: text });
	const presetDescription = fieldDescription(
		"Enter edits preset choice; arrows change it only while editing. Space sets default.",
	);
	const commandLabel = fieldLabel("Command");
	const commandInput = new InputRenderable(renderer, {
		...inputOptions,
		placeholder: '["agent", "--skill", "{skill}", "--interactive", "{prompt}"]',
	});
	const commandDescription = fieldDescription("");
	const commandValue = fieldValue();
	const resumeLabel = fieldLabel("Resume flag (optional)");
	const resumeInput = new InputRenderable(renderer, { ...inputOptions, placeholder: "--resume" });
	const resumeDescription = fieldDescription("");
	const resumeValue = fieldValue();
	const environmentLabel = fieldLabel("Environment");
	const environmentValue = fieldValue();
	const environmentInput = new TextareaRenderable(renderer, {
		...inputOptions,
		height: 4,
		placeholder: "API_URL=https://example.test",
		wrapMode: "none",
		keyBindings: [{ name: "return", shift: true, action: "newline" }],
	});
	const environmentDescription = fieldDescription(
		"One NAME=value per line. Shell variables expand: AGENTIC_WORKSPACE_PROJECT_DIR, AGENTIC_WORKSPACE_WORKTREE_DIR, AGENTIC_WORKSPACE_TASK_DIR. Example: OUTPUT_DIR=$AGENTIC_WORKSPACE_TASK_DIR. Shift+Enter adds a line; Enter commits.",
	);
	const fieldGroup = (...children: Array<TextRenderable | InputRenderable | TextareaRenderable>): BoxRenderable => {
		const group = new BoxRenderable(renderer, {
			width: "100%",
			flexDirection: "column",
			flexShrink: 0,
			focusable: true,
		});
		for (const child of children) group.add(child);
		return group;
	};
	const presetGroup = new BoxRenderable(renderer, {
		width: "100%",
		flexDirection: "column",
		flexShrink: 0,
		focusable: true,
	});
	for (const child of [presetLabel, presetDescription, presetValue]) presetGroup.add(child);
	const commandGroup = fieldGroup(commandLabel, commandDescription, commandValue, commandInput);
	const resumeGroup = fieldGroup(resumeLabel, resumeDescription, resumeValue, resumeInput);
	const environmentGroup = fieldGroup(environmentLabel, environmentDescription, environmentValue, environmentInput);
	for (const group of [presetGroup, commandGroup, resumeGroup, environmentGroup]) editorPane.add(group);
	contentPane.add(editorPane);
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
	const modesPane = new BoxRenderable(renderer, {
		flexGrow: 1,
		flexBasis: 0,
		minWidth: 0,
		height: "100%",
		border: true,
		borderStyle: "rounded",
		borderColor: border,
		title: "Modes",
		titleColor: dimmed,
		paddingX: 1,
		flexDirection: "row",
		visible: false,
	});
	const modeListPane = new BoxRenderable(renderer, {
		id: "settings-modes-list",
		width: 24,
		height: "100%",
		flexShrink: 0,
		border: true,
		borderStyle: "rounded",
		borderColor: border,
		title: "Modes list",
		paddingX: 1,
		focusable: true,
		flexDirection: "column",
		rowGap: 0,
	});
	const modeDetailPane = new ScrollBoxRenderable(renderer, {
		id: "settings-mode-profile",
		flexGrow: 1,
		flexBasis: 0,
		minWidth: 0,
		height: "100%",
		contentOptions: { flexDirection: "column", padding: 0, rowGap: 0 },
		viewportCulling: false,
		border: true,
		borderStyle: "rounded",
		borderColor: border,
		title: "Profile",
		verticalScrollbarOptions: { trackOptions: { backgroundColor: background, foregroundColor: dimmed } },
		focusable: true,
	});
	modeDetailPane.horizontalScrollBar.visible = false;
	const modeOverview = new BoxRenderable(renderer, {
		width: "100%",
		flexShrink: 0,
		border: true,
		borderStyle: "rounded",
		borderColor: border,
		paddingX: 1,
		flexDirection: "column",
	});
	const modeRows = new Map<string, TextRenderable>();
	const modeDetail = new TextRenderable(renderer, { width: "100%", flexShrink: 0, wrapMode: "word", fg: text });
	modeOverview.add(modeDetail);
	modeDetailPane.add(modeOverview);
	const modeEditFields = [
		{ id: "model", label: "Model", kind: "picker" },
		{ id: "repository", label: "Repository", kind: "permission" },
		{ id: "task", label: "Task", kind: "permission" },
		{ id: "artifacts", label: "Artifacts", kind: "permission" },
		{ id: "subagents", label: "Subagents", kind: "permission" },
		{ id: "prompt", label: "Prompt", kind: "text" },
		{ id: "definitions", label: "Artifact definitions", kind: "text" },
		{ id: "approval", label: "Approval indicator", kind: "picker" },
		{ id: "color", label: "Color", kind: "picker" },
	] as const;
	type ModeField = (typeof modeEditFields)[number]["id"];
	let modeField: ModeField = "model";
	const modeFieldRows = new Map<ModeField, TextRenderable>();
	for (const field of modeEditFields) {
		const row = new TextRenderable(renderer, {
			id: `settings-mode-${field.id}`,
			width: "100%",
			flexShrink: 0,
			wrapMode: "word",
			fg: text,
		});
		modeFieldRows.set(field.id, row);
		modeDetailPane.add(row);
	}
	let modeEditing = false;
	let modeApprovalEditing = false;
	let modeCustomApprovalEditing = false;
	let modeApprovalChoices: Array<string | undefined> = [];
	let modeApprovalChoiceIndex = 0;
	let modeColorEditing = false;
	let modeColorChoiceIndex = 0;
	const colorChoices = [undefined, ...MODE_TEXT_COLORS];
	const modeColorPreview = fieldValue();
	modeColorPreview.id = "settings-mode-color-preview";
	modeColorPreview.flexShrink = 0;
	modeColorPreview.visible = false;
	modeDetailPane.add(modeColorPreview);
	let modeActionInput: "add" | "rename" | "delete" | undefined;
	const modeActionLabel = fieldLabel("");
	modeActionLabel.flexShrink = 0;
	modeActionLabel.visible = false;
	modeDetailPane.add(modeActionLabel);
	const modeActionEditor = new InputRenderable(renderer, {
		id: "settings-mode-name-editor",
		...inputOptions,
		backgroundColor: "#27272a",
		focusedBackgroundColor: "#164e63",
		flexShrink: 0,
		placeholder: "Mode name…",
		visible: false,
	});
	modeDetailPane.add(modeActionEditor);
	const modePromptInput = new TextareaRenderable(renderer, {
		id: "settings-mode-prompt-editor",
		...inputOptions,
		backgroundColor: "#27272a",
		focusedBackgroundColor: "#164e63",
		flexShrink: 0,
		height: 8,
		placeholder: "Mode prompt…",
		wrapMode: "word",
		keyBindings: [{ name: "return", action: "newline" }],
		visible: false,
	});
	const modeArtifactsInput = new TextareaRenderable(renderer, {
		id: "settings-mode-artifacts-editor",
		...inputOptions,
		backgroundColor: "#27272a",
		focusedBackgroundColor: "#164e63",
		flexShrink: 0,
		height: 5,
		placeholder: "relative/path.md — purpose",
		wrapMode: "word",
		keyBindings: [{ name: "return", action: "newline" }],
		visible: false,
	});
	const modeApprovalInput = new InputRenderable(renderer, {
		id: "settings-mode-approval-editor",
		...inputOptions,
		backgroundColor: "#27272a",
		focusedBackgroundColor: "#164e63",
		flexShrink: 0,
		placeholder: "relative/artifact/path.md",
		visible: false,
	});
	modeDetailPane.add(modePromptInput);
	modeDetailPane.add(modeArtifactsInput);
	modeDetailPane.add(modeApprovalInput);
	const modeContextHint = new TextRenderable(renderer, {
		width: "100%",
		flexShrink: 0,
		wrapMode: "word",
		fg: dimmed,
		visible: false,
	});
	modeDetailPane.add(modeContextHint);
	const modeActions = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		flexShrink: 0,
		wrapMode: "none",
		fg: dimmed,
		visible: false,
		content: "[a] Add  [n] Rename  [d] Delete  [s] Default  [/] Reorder",
	});
	modesPane.add(modeListPane);
	modesPane.add(modeDetailPane);
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
	body.add(modesPane);
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
	surface.add(modeActions);
	surface.add(body);
	surface.add(footer);
	parent.add(surface);

	const selectedName = (): string => names[selectedIndex] ?? "";
	const modeIds = (): string[] => modeDraft?.configuration.modes?.order ?? [];
	const selectedMode = (): string | undefined => {
		const ids = modeIds();
		if (selectedModeId && ids.includes(selectedModeId)) selectedModeIndex = ids.indexOf(selectedModeId);
		selectedModeId = ids[selectedModeIndex];
		return selectedModeId;
	};
	const selectedState = (): FormState => states.get(selectedName()) as FormState;
	const controls = (): Array<InputRenderable | TextareaRenderable> => [commandInput, resumeInput, environmentInput];
	const groups = (): BoxRenderable[] => [commandGroup, resumeGroup, environmentGroup];
	const values = (): TextRenderable[] => [commandValue, resumeValue, environmentValue];
	const keyHints = (): string => {
		if (selectedCategory === "modes" && !categoryFocused) {
			if (modeActionInput) return "Name · Enter stage · Esc cancel";
			if (modeEditing) return "Enter newline · Ctrl+Enter stage · Esc cancel · Ctrl+S Save";
			if (modeCustomApprovalEditing) return "Artifact path · Enter stage · Esc cancel · Ctrl+S Save";
			if (modeApprovalEditing || modeColorEditing) return "↑/↓ choose · Enter stage · Esc cancel";
		}
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
				: modeFocus === "list"
					? surface.width < 72
						? "↑↓ mode →/Enter profile Tab pane ^S Save Esc Discard"
						: "↑/↓: mode  →/Enter: profile  Tab/Shift+Tab: pane  Ctrl+S: Save  Esc: Discard"
					: surface.width < 72
						? "↑↓ field Enter edit ← modes Tab pane ^S Save Esc Discard"
						: "↑/↓: field  Enter: edit  ←: modes  Tab/Shift+Tab: pane  Ctrl+S: Save  Esc: Discard";
		}
		return categoryFocused
			? surface.width < 72
				? "→/Enter/Tab fields  ^S save  Esc discard"
				: "Right/Enter/Tab: fields  Ctrl+S: save draft  Esc: discard"
			: editing
				? surface.width < 72
					? "Enter commit  Esc cancel  ^S draft only"
					: "Enter: commit  Esc: cancel edit  Ctrl+S: save draft only"
				: surface.width < 72
					? "↑↓/Tab select Enter edit ← back ^S save Esc discard"
					: "↑/↓/Tab: select  Enter: edit  ←: categories  Ctrl+S: save  Esc: discard";
	};
	const ensureSelectionVisible = (): void => {
		if (disposed) return;
		environmentInput.height = Math.max(1, Math.min(4, editorPane.viewport.height - 2));
		if (categoryFocused) return;
		const group = activeField < 0 ? presetGroup : groups()[activeField];
		if (group) editorPane.scrollChildIntoView(group.id);
		// A description can exceed a short viewport; keep the selected value or editor reachable.
		const target = editing ? controls()[activeField] : values()[activeField];
		if (target) editorPane.scrollChildIntoView(target.id);
	};
	for (const box of [
		editorPane.viewport,
		editorPane.content,
		presetGroup,
		commandGroup,
		resumeGroup,
		environmentGroup,
	]) {
		const onSizeChange = box.onSizeChange;
		box.onSizeChange = () => {
			// ScrollBox measures overflow here; keep its native scrollbar bookkeeping.
			onSizeChange?.call(box);
			ensureSelectionVisible();
		};
	}
	surface.onSizeChange = () => {
		categories.width = surface.width >= 60 ? 20 : Math.max(10, Math.floor(surface.width / 4));
		modeListPane.width = surface.width >= 100 ? 24 : Math.max(16, Math.floor(surface.width / 4));
		keys.content = keyHints();
		ensureSelectionVisible();
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
		status.content = error
			? `Error: ${error}`
			: saving
				? "Saving project sessions…"
				: "Project sessions · settings apply to every launch";
		status.fg = error ? "#f87171" : dimmed;
		status.height = error ? 2 : 1;
		footer.height = error ? 4 : 3;
		renderer.requestRender();
	};
	const renderModesPane = (): void => {
		categories.borderColor = categoryFocused ? accent : border;
		for (const [category, row] of [
			["agents", agentsCategory],
			["sessions", sessionsCategory],
			["modes", modesCategory],
		] as const) {
			row.fg = categoryFocused && selectedCategory === category ? accent : text;
			row.attributes = selectedCategory === category ? TextAttributes.BOLD : TextAttributes.NONE;
		}
		const ids = modeIds();
		const catalog = modeDraft?.configuration.modes;
		for (const [id, row] of modeRows) {
			if (ids.includes(id)) continue;
			row.destroy();
			modeRows.delete(id);
		}
		selectedMode();
		for (const [index, id] of ids.entries()) {
			let row = modeRows.get(id);
			if (!row) {
				row = new TextRenderable(renderer, { width: "100%", height: 1, wrapMode: "none", fg: text });
				modeRows.set(id, row);
				modeListPane.add(row);
			}
			const profile = catalog?.profiles[id];
			const focused = index === selectedModeIndex && !categoryFocused && modeFocus === "list" && !modelPicker;
			row.content = `${focused ? ">" : " "} ${profile?.name ?? id}${id === catalog?.defaultModeId ? " ● default" : ""}`;
			row.fg = focused ? accent : text;
			row.bg = focused ? "#164e63" : background;
			modeListPane.remove(row);
			modeListPane.add(row);
		}
		const id = selectedMode();
		const profile = id ? catalog?.profiles[id] : undefined;
		modeActionEditor.visible = Boolean(modeActionInput && modeActionInput !== "delete");
		modeActionLabel.visible = Boolean(modeActionInput);
		modePromptInput.height = Math.max(1, Math.min(8, modeDetailPane.viewport.height - 3));
		modeArtifactsInput.height = Math.max(1, Math.min(5, modeDetailPane.viewport.height - 3));
		modeColorPreview.visible = modeColorEditing;
		modeActionLabel.content =
			modeActionInput === "add"
				? "Add mode · Name"
				: modeActionInput === "rename"
					? "Rename mode · Name"
					: "Delete mode";
		modeActionEditor.placeholder = modeActionInput === "rename" ? "Rename mode…" : "Mode name…";
		modePromptInput.visible = modeEditing && modeField === "prompt";
		modeArtifactsInput.visible = modeEditing && modeField === "definitions";
		modeApprovalInput.visible = modeCustomApprovalEditing;
		if (profile && id) {
			const model = profile.model.kind === "default" ? "Default" : profile.model.id;
			const draftConfiguration = modeDraft?.configuration ?? options.configuration;
			const selectedPresetName = draftConfiguration.selectedPreset;
			const selectedPreset = selectedPresetName ? draftConfiguration.presets?.[selectedPresetName] : undefined;
			const support = options.profilePermissionSupport
				? options.profilePermissionSupport(profile)
				: selectedPreset
					? profilePermissionSupport(selectedPreset.bootstrap, profile)
					: { native: [], instructionBased: ["repository/task/artifact path scope", "subagent policy"] };
			const supportFor = (scope: "repository" | "task" | "artifacts" | "subagents"): string => {
				const native = support.native.map((item) => item.toLowerCase());
				const instructions = support.instructionBased.map((item) => item.toLowerCase());
				const hasNative =
					scope === "subagents"
						? native.some((item) => item.includes("subagent") || item.includes("agent(*)"))
						: scope === "repository"
							? native.some((item) => item.includes("path") && (item.includes("rule") || item.includes("permission")))
							: native.some((item) => item.includes("path")) &&
								!instructions.some((item) => item.includes("path-scope differences"));
				return hasNative ? "Native" : "Instructions";
			};
			const values: Record<ModeField, string> = {
				model,
				repository: `${profile.permissions.repository} · ${supportFor("repository")}`,
				task: `${profile.permissions.task} · ${supportFor("task")}`,
				artifacts: `${profile.permissions.artifacts} · ${supportFor("artifacts")}`,
				subagents: `${profile.permissions.subagents} · ${supportFor("subagents")}`,
				prompt: profile.prompt || "(empty)",
				definitions: profile.artifacts.map((item) => `${item.path} — ${item.purpose}`).join("\n") || "(none)",
				approval: profile.approvalArtifact ?? "None",
				color:
					profile.textColor ??
					`Default${effectiveModeTextColor(profile, id) ? ` (${effectiveModeTextColor(profile, id)})` : ""}`,
			};
			modeDetail.content = `${profile.name} · ${id}\nPermission support:\nNative: ${support.native.join(", ") || "none"}\nInstructions: ${support.instructionBased.join(", ") || "none"}.\nInstructions are guidance, not filesystem isolation.`;
			for (const field of modeEditFields) {
				const row = modeFieldRows.get(field.id);
				if (!row) continue;
				const focused =
					!categoryFocused && modeFocus === "profile" && modeField === field.id && !modeActionInput && !modelPicker;
				row.content = `${focused ? ">" : " "} ${field.label}: ${values[field.id]}`;
				row.fg = field.id === "color" ? (effectiveModeTextColor(profile, id) ?? text) : focused ? accent : text;
				row.bg = focused ? "#164e63" : background;
			}
			if (modeColorEditing) {
				const choice = colorChoices[modeColorChoiceIndex];
				const name = choice?.replace("bright", "Bright ") ?? "Default";
				modeColorPreview.content = `Color: ${name}${choice ? ` (${choice})` : ""} · ${profile.name} preview\n↑/↓ choose · Enter select · Esc cancel`;
				modeColorPreview.fg = choice ?? effectiveModeTextColor({ name: profile.name }, id) ?? text;
			}
			if (!modeEditing) {
				modePromptInput.setText(profile.prompt);
				modeArtifactsInput.setText(profile.artifacts.map((item) => `${item.path} — ${item.purpose}`).join("\n"));
			}
		} else modeDetail.content = "No configured modes. Press a to add a mode.";
		if (modeApprovalEditing) {
			const choice = modeApprovalChoices[modeApprovalChoiceIndex];
			modeContextHint.content = `Approval indicator: ${choice === "" ? "Custom path" : (choice ?? "None")} · ↑/↓ choose · Enter select · Esc cancel`;
		} else if (modeActionInput === "delete" && id) {
			const count = options.getModeSessionCount?.(id) ?? options.modeSessionCounts?.[id] ?? 0;
			modeContextHint.content = `Delete ${profile?.name ?? id} (${count} workspace-owned sessions). Running agents will be stopped; session history will not be transferred. Save to confirm.`;
		}
		modeContextHint.visible = modeApprovalEditing || modeActionInput === "delete";
		modesPane.borderColor = border;
		modeListPane.borderColor = !categoryFocused && modeFocus === "list" && !modelPicker ? accent : border;
		modeDetailPane.borderColor = !categoryFocused && modeFocus === "profile" && !modelPicker ? accent : border;
		modeDetailPane.title = profile ? `Profile · ${profile.name}` : "Profile";
		ensureModeSelectionVisible();
	};
	const ensureModeSelectionVisible = (): void => {
		if (disposed || selectedCategory !== "modes" || categoryFocused || modeFocus !== "profile" || modelPicker) return;
		const target = modeActionInput
			? modeActionInput === "delete"
				? modeContextHint
				: modeActionEditor
			: modeColorEditing
				? modeColorPreview
				: modeApprovalEditing
					? modeContextHint
					: modeCustomApprovalEditing
						? modeApprovalInput
						: modeEditing
							? modeField === "prompt"
								? modePromptInput
								: modeArtifactsInput
							: modeFieldRows.get(modeField);
		if (target) modeDetailPane.scrollChildIntoView(target.id);
	};
	for (const box of [modeDetailPane.viewport, modeDetailPane.content]) {
		const onSizeChange = box.onSizeChange;
		box.onSizeChange = () => {
			onSizeChange?.call(box);
			ensureModeSelectionVisible();
		};
	}
	// Newly shown editors receive final positions during layout, after the input dispatch render.
	modeDetailPane.renderAfter = ensureModeSelectionVisible;
	const render = (): void => {
		if (disposed) return;
		const agentsSelected = selectedCategory === "agents";
		const sessionsSelected = selectedCategory === "sessions";
		contentPane.visible = agentsSelected;
		sessionsPane.visible = sessionsSelected;
		modesPane.visible = selectedCategory === "modes";
		modeActions.visible = selectedCategory === "modes";
		agentsCategory.content = `${categoryFocused && agentsSelected ? ">" : " "} Agents`;
		sessionsCategory.content = `${categoryFocused && sessionsSelected ? ">" : " "} Sessions`;
		modesCategory.content = `${categoryFocused && selectedCategory === "modes" ? ">" : " "} Modes`;
		if (sessionsSelected) {
			renderSessionsPane();
			return;
		}
		if (selectedCategory === "modes") {
			renderModesPane();
			keys.content = keyHints();
			status.content = error
				? `Error: ${error}`
				: saving
					? "Saving project modes…"
					: "Mode profile overview · edits are staged until Save";
			status.fg = error ? "#f87171" : dimmed;
			status.height = error ? 2 : 1;
			footer.height = error ? 4 : 3;
			renderer.requestRender();
			return;
		}
		const name = selectedName();
		const state = selectedState();
		if (!editing) {
			commandInput.value = state.command;
			resumeInput.value = state.resumeFlag;
			environmentInput.setText(state.environment);
		}
		const fieldValues = values();
		for (const [index, control] of controls().entries()) {
			control.visible = editing && activeField === index;
			control.focusable = control.visible;
			const value = fieldValues[index];
			if (value) value.visible = !control.visible;
		}
		commandValue.content = state.command || "(not set)";
		resumeValue.content = state.resumeFlag || "(adapter default)";
		environmentValue.content = state.environment || "(none)";
		const preset = presets[name];
		const documentedResumeFlag = preset ? AGENT_PRESENTATION_METADATA[preset.bootstrap].resumeFlag : undefined;
		resumeInput.placeholder = preset
			? preset.resumeFlag === undefined
				? documentedResumeFlag
					? `Default: ${documentedResumeFlag}`
					: "No documented exact-session resume"
				: "Explicit native resume flag"
			: "Optional explicit native resume flag";
		commandDescription.content = preset
			? `JSON argv. ${preset.bootstrap} adapter and other options are retained.`
			: "JSON argv.";
		resumeDescription.content = documentedResumeFlag
			? `Leave empty for native ${documentedResumeFlag} resume. An explicit flag overrides that default.`
			: "Optional native resume flag. Leave empty when this adapter has no documented exact-session resume.";
		const focusedDescriptions = [commandDescription, resumeDescription, environmentDescription];
		for (const description of [commandDescription, resumeDescription, environmentDescription]) {
			description.visible = !categoryFocused && focusedDescriptions[activeField] === description;
		}
		presetDescription.visible = !categoryFocused && activeField < 0;
		presetLabel.fg = !categoryFocused && activeField < 0 ? accent : text;
		presetValue.fg = !categoryFocused && activeField < 0 ? accent : text;
		const displayedName = editing && activeField < 0 ? (names[editPresetIndex] ?? name) : name;
		presetValue.content = `${displayedName}${displayedName === draft.selectedPreset ? " ● default" : ""}${editing && activeField < 0 ? "  < >" : ""}`;
		const labels = [commandLabel, resumeLabel, environmentLabel];
		for (const label of [commandLabel, resumeLabel, environmentLabel]) {
			label.fg = !categoryFocused && labels[activeField] === label ? accent : text;
		}
		categories.borderColor = categoryFocused ? accent : border;
		agentsCategory.fg = categoryFocused ? accent : text;
		agentsCategory.attributes = TextAttributes.BOLD;
		sessionsCategory.fg = categoryFocused && selectedCategory === "sessions" ? accent : text;
		sessionsCategory.attributes = selectedCategory === "sessions" ? TextAttributes.BOLD : TextAttributes.NONE;
		contentPane.borderColor = categoryFocused ? border : accent;
		keys.content = keyHints();
		status.content = error
			? `Error: ${error}`
			: saving
				? "Saving project agents…"
				: preset
					? `Adapter: ${preset.bootstrap} · prepare/worktree options retained`
					: "No preset selected";
		status.fg = error ? "#f87171" : dimmed;
		status.height = error ? 2 : 1;
		footer.height = error ? 4 : 3;
		ensureSelectionVisible();
		renderer.requestRender();
	};
	const focusList = (focusCategory = false): void => {
		controls()[activeField]?.blur();
		editing = false;
		activeField = -1;
		categoryFocused = focusCategory;
		(focusCategory ? categories : presetGroup).focus();
		if (categoryFocused) editorPane.scrollTo(0);
		render();
	};
	const focusField = (index: number): void => {
		controls()[activeField]?.blur();
		editing = false;
		categoryFocused = false;
		activeField = (index + controls().length) % controls().length;
		// Apply visibility first: native visibility changes blur even a newly focused group.
		render();
		groups()[activeField]?.focus();
	};
	const focusSessionsPane = (): void => {
		controls()[activeField]?.blur();
		editing = false;
		activeField = -1;
		categoryFocused = false;
		sessionsPane.focus();
		render();
	};
	const focusModeList = (): void => {
		controls()[activeField]?.blur();
		editing = false;
		activeField = -1;
		categoryFocused = false;
		modeFocus = "list";
		modeListPane.focus();
		render();
	};
	const focusModeFields = (): void => {
		controls()[activeField]?.blur();
		editing = false;
		categoryFocused = false;
		modeFocus = "profile";
		modeDetailPane.focus();
		render();
	};
	const beginEdit = (): void => {
		editing = true;
		editPresetIndex = selectedIndex;
		error = undefined;
		render();
		controls()[activeField]?.focus();
	};
	const finishEdit = (commit: boolean): void => {
		if (commit) {
			if (activeField < 0) selectedIndex = editPresetIndex;
			else {
				const fields: Array<keyof FormState> = ["command", "resumeFlag", "environment"];
				const field = fields[activeField];
				const control = controls()[activeField];
				if (field && control) {
					const value = control instanceof InputRenderable ? control.value : control.plainText;
					try {
						selectedState()[field] =
							field === "command" ? JSON.stringify(agentCommandArgvSchema.parse(JSON.parse(value))) : value;
					} catch (cause) {
						error = errorMessage(cause, "Command must be a JSON argv array.");
						render();
						return;
					}
				}
			}
			error = undefined;
		}
		if (activeField < 0) focusList();
		else focusField(activeField);
	};
	const nativeFocusHandlers: Array<[BoxRenderable | InputRenderable | TextareaRenderable, () => void]> = [
		[
			categories,
			() => {
				if (disposed || saving || categoryFocused) return;
				focusList(true);
			},
		],
		[
			presetGroup,
			() => {
				if (disposed || saving || (!categoryFocused && activeField < 0)) return;
				focusList();
			},
		],
	];
	for (const group of [commandGroup, resumeGroup, environmentGroup]) {
		nativeFocusHandlers.push([
			group,
			() => {
				const index = groups().indexOf(group);
				if (disposed || saving || index < 0 || (!categoryFocused && activeField === index)) return;
				focusField(index);
			},
		]);
	}
	for (const [target, handler] of nativeFocusHandlers) target.on("focused", handler);
	const setDefault = (): void => {
		draft.selectedPreset = selectedName();
		error = undefined;
		render();
	};
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		modelPicker?.dispose();
		renderer.keyInput.off("keypress", onKeyPress);
		renderer.keyInput.off("paste", onPaste);
		for (const [target, handler] of nativeFocusHandlers) target.off("focused", handler);
		surface.destroyRecursively();
		if (previousFocus && !previousFocus.isDestroyed) previousFocus.focus();
		options.onClose();
	};
	const buildConfiguration = (): AgentConfiguration => {
		// Only Enter-committed field values belong to the project draft.
		const presets: Record<string, AgentPreset> = {};
		const selectedPreset = draft.selectedPreset;
		for (const name of names) {
			const preset = draft.presets?.[name] as AgentPreset;
			presets[name] = editedPreset(name, preset, states.get(name) as FormState);
		}
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
	const commitModeEditor = (): void => {
		const profileId = modeIds()[selectedModeIndex];
		const profile = profileId ? modeDraft?.configuration.modes?.profiles[profileId] : undefined;
		if (!profile) return;
		if (modeField === "prompt") profile.prompt = modePromptInput.plainText;
		else if (modeField === "definitions")
			profile.artifacts = parseModeArtifactDefinitions(modeArtifactsInput.plainText);
		modeEditing = false;
		modeDetailPane.focus();
		error = undefined;
		render();
	};
	const handleModeEditorKeyPress = (event: KeyEvent, plain: boolean): boolean => {
		if (selectedCategory === "modes" && !categoryFocused && modeColorEditing) {
			if (plain && ["up", "down"].includes(event.name)) {
				modeColorChoiceIndex =
					(modeColorChoiceIndex + (event.name === "up" ? -1 : 1) + colorChoices.length) % colorChoices.length;
			} else if (plain && ["return", "linefeed", "kpenter"].includes(event.name)) {
				const profile = modeDraft?.configuration.modes?.profiles[selectedMode() ?? ""];
				const color = colorChoices[modeColorChoiceIndex];
				if (profile) {
					if (color === undefined) delete profile.textColor;
					else profile.textColor = color;
				}
				modeColorEditing = false;
			}
			render();
			return true;
		}
		if (selectedCategory === "modes" && !categoryFocused && modeCustomApprovalEditing) {
			const currentProfile = modeDraft?.configuration.modes?.profiles[modeIds()[selectedModeIndex] ?? ""];
			if (plain && event.name === "escape") {
				modeCustomApprovalEditing = false;
				modeDetailPane.focus();
				render();
				return true;
			}
			if (plain && ["return", "linefeed", "kpenter"].includes(event.name)) {
				try {
					const path = modeApprovalInput.value.trim();
					if (currentProfile) currentProfile.approvalArtifact = path ? validateArtifactPath(path) : undefined;
					modeCustomApprovalEditing = false;
					error = undefined;
				} catch (cause) {
					error = errorMessage(cause, "Invalid approval artifact path.");
				}
				render();
				if (!modeCustomApprovalEditing) modeDetailPane.focus();
				return true;
			}
			modeApprovalInput.handleKeyPress(event);
			return true;
		}
		if (selectedCategory === "modes" && !categoryFocused && (modeApprovalEditing || modeActionInput || modeEditing)) {
			const currentId = modeIds()[selectedModeIndex];
			if (modeActionInput === "delete") {
				if ((event.name === "return" || event.name === "linefeed" || event.name === "kpenter") && currentId) {
					modeDraft!.deleteMode(currentId);
					selectedModeIndex = Math.min(selectedModeIndex, modeIds().length - 1);
					selectedModeId = modeIds()[selectedModeIndex];
					modeField = "model";
					modeActionInput = undefined;
				}
				render();
				return true;
			}
			if (modeActionInput) {
				if (event.name === "return" || event.name === "linefeed" || event.name === "kpenter") {
					try {
						const value = modeActionEditor.value.trim();
						if (!value || /[\0\r\n]/.test(value)) throw new Error("Mode name must be non-empty single-line text.");
						if (modeActionInput === "rename" && currentId) modeDraft!.renameMode(currentId, value);
						if (modeActionInput === "add") {
							const newId = slug(value);
							modeDraft!.addMode(newId, value);
							selectedModeId = newId;
							selectedModeIndex = modeIds().indexOf(newId);
							modeField = "model";
						}
						modeActionInput = undefined;
						error = undefined;
						modeDetailPane.focus();
					} catch (cause) {
						error = errorMessage(cause, "Invalid mode name.");
					}
					render();
					return true;
				}
				modeActionEditor.handleKeyPress(event);
				return true;
			}
			if (modeApprovalEditing) {
				if (event.name === "up" || event.name === "k")
					modeApprovalChoiceIndex =
						(modeApprovalChoiceIndex + modeApprovalChoices.length - 1) % modeApprovalChoices.length;
				else if (event.name === "down" || event.name === "j")
					modeApprovalChoiceIndex = (modeApprovalChoiceIndex + 1) % modeApprovalChoices.length;
				else if (["return", "linefeed", "kpenter"].includes(event.name)) {
					const choice = modeApprovalChoices[modeApprovalChoiceIndex];
					const currentProfile = modeDraft?.configuration.modes?.profiles[modeIds()[selectedModeIndex] ?? ""];
					if (choice === "") {
						modeApprovalEditing = false;
						modeCustomApprovalEditing = true;
						modeApprovalInput.setText(currentProfile?.approvalArtifact ?? "");
						render();
						modeApprovalInput.focus();
						return true;
					}
					if (currentProfile) currentProfile.approvalArtifact = choice;
					modeApprovalEditing = false;
				}
				render();
				return true;
			}
			if (event.ctrl && event.name === "return") {
				try {
					commitModeEditor();
				} catch (cause) {
					error = errorMessage(cause, "Invalid mode editor value.");
					render();
				}
				return true;
			}
			if (!plain) {
				(modeField === "prompt" ? modePromptInput : modeArtifactsInput).handleKeyPress(event);
				return true;
			}
			if (event.name !== "tab") (modeField === "prompt" ? modePromptInput : modeArtifactsInput).handleKeyPress(event);
			return true;
		}
		return false;
	};
	const onKeyPress = (event: KeyEvent): void => {
		if (disposed || modelPicker || event.eventType === "release") return;
		event.preventDefault();
		event.stopPropagation();
		if (saving) return;
		const plain = !event.ctrl && !event.shift && !event.meta && !event.option && !event.super && !event.hyper;
		if (plain && event.name === "escape") {
			if (modeColorEditing) {
				modeColorEditing = false;
				error = undefined;
				render();
				return;
			}
			if (modeApprovalEditing || modeCustomApprovalEditing) {
				error = undefined;
				modeApprovalEditing = false;
				modeCustomApprovalEditing = false;
				modeDetailPane.focus();
				render();
				return;
			}
			if (modeActionInput) {
				error = undefined;
				modeActionInput = undefined;
				modeFocus = "profile";
				modeDetailPane.focus();
				render();
				return;
			}
			if (modeEditing) {
				error = undefined;
				modeEditing = false;
				modeDetailPane.focus();
				render();
				return;
			}
			if (editing) finishEdit(false);
			else dispose();
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
			if (modeActionInput || modeApprovalEditing || modeColorEditing) return;
			if (selectedCategory === "modes" && modeCustomApprovalEditing) {
				const currentProfile = modeDraft?.configuration.modes?.profiles[modeIds()[selectedModeIndex] ?? ""];
				try {
					const path = modeApprovalInput.value.trim();
					if (currentProfile) currentProfile.approvalArtifact = path ? validateArtifactPath(path) : undefined;
					modeCustomApprovalEditing = false;
				} catch (cause) {
					error = errorMessage(cause, "Invalid approval artifact path.");
					render();
					return;
				}
			}
			if (selectedCategory === "modes" && !categoryFocused && modeEditing) {
				try {
					commitModeEditor();
				} catch (cause) {
					error = errorMessage(cause, "Invalid mode editor value.");
					render();
					return;
				}
			}
			void save();
			return;
		}
		if (handleModeEditorKeyPress(event, plain)) return;
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
				if (event.shift) {
					if (categoryFocused) focusModeFields();
					else if (modeFocus === "profile") focusModeList();
					else focusList(true);
				} else {
					if (categoryFocused) focusModeList();
					else if (modeFocus === "list") focusModeFields();
					else focusList(true);
				}
				return;
			}
			if (categoryFocused) {
				if (plain && (event.name === "return" || event.name === "right")) focusModeList();
				if (plain && ["up", "k", "down", "j"].includes(event.name)) {
					selectedCategory = event.name === "up" || event.name === "k" ? "sessions" : "agents";
					render();
				}
				return;
			}
			if (!plain) return;
			const currentId = selectedMode();
			const currentProfile = currentId ? modeDraft?.configuration.modes?.profiles[currentId] : undefined;
			if (
				modeFocus === "list" &&
				(event.name === "up" || event.name === "k" || event.name === "down" || event.name === "j")
			) {
				const ids = modeIds();
				selectedModeIndex = Math.max(
					0,
					Math.min(ids.length - 1, selectedModeIndex + (event.name === "up" || event.name === "k" ? -1 : 1)),
				);
				selectedModeId = ids[selectedModeIndex];
				render();
				return;
			}
			if (modeFocus === "list" && ["right", "return", "linefeed", "kpenter"].includes(event.name)) {
				focusModeFields();
				return;
			}
			if (event.name === "a" || (event.name === "n" && currentId)) {
				if (!modeDraft) {
					error = "Initialize the project mode catalog before editing mode settings.";
					render();
					return;
				}
				modeActionInput = event.name === "a" ? "add" : "rename";
				modeFocus = "profile";
				modeActionEditor.setText(modeActionInput === "rename" ? (currentProfile?.name ?? "") : "");
				error = undefined;
				render();
				modeActionEditor.focus();
				return;
			}
			if (event.name === "d" && currentId) {
				if (modeIds().length <= 1) error = "At least one mode is required.";
				else {
					modeActionInput = "delete";
					modeFocus = "profile";
					error = undefined;
				}
				render();
				return;
			}
			if (event.name === "s" && currentId) {
				modeDraft!.setModeDefault(currentId);
				render();
				return;
			}
			if ((event.name === "[" || event.name === "]") && currentId) {
				const target = Math.max(0, Math.min(modeIds().length - 1, selectedModeIndex + (event.name === "]" ? -1 : 1)));
				modeDraft!.moveMode(currentId, target);
				selectedModeIndex = target;
				render();
				return;
			}
			if (event.name === "left") {
				if (modeFocus === "list") focusList(true);
				else focusModeList();
				return;
			}
			if (
				modeFocus === "profile" &&
				["return", "linefeed", "kpenter", "enter"].includes(event.name) &&
				currentProfile
			) {
				error = undefined;
				if (modeField === "model") {
					const selectedPreset = draft.selectedPreset;
					const preset = selectedPreset ? presets[selectedPreset] : undefined;
					if (!selectedPreset || !preset) {
						error = "Choose a configured preset before model discovery.";
						render();
						return;
					}
					modelPicker = mountOpenTuiModeModelPicker(renderer, parent, {
						harness: preset.bootstrap,
						preset: selectedPreset,
						selectedModel: currentProfile.model.kind === "explicit" ? currentProfile.model.id : undefined,
						discover: options.discoverModeModels ?? (async () => []),
						allowManualModel: AGENT_PRESENTATION_METADATA[preset.bootstrap].allowManualModel,
						onSelect: async (id) => {
							currentProfile.model = id ? { kind: "explicit", id } : { kind: "default" };
						},
						onClose: () => {
							modelPicker = undefined;
							if (!disposed) {
								modeDetailPane.focus();
								render();
							}
						},
					});
					render();
					return;
				}
				if (modeField === "prompt" || modeField === "definitions") {
					modeEditing = true;
					render();
					(modeField === "prompt" ? modePromptInput : modeArtifactsInput).focus();
				} else if (modeField === "approval") {
					const declared = currentProfile.artifacts.map((artifact) => artifact.path);
					modeApprovalChoices = [undefined, ...declared, ""].filter(
						(value, index, all) => index === all.indexOf(value),
					);
					const selectedChoice = modeApprovalChoices.indexOf(currentProfile.approvalArtifact);
					modeApprovalChoiceIndex = selectedChoice < 0 ? modeApprovalChoices.length - 1 : selectedChoice;
					modeApprovalEditing = true;
				} else if (modeField === "repository") {
					const choices = ["none", "read", "read-write"] as const;
					currentProfile.permissions.repository =
						choices[(choices.indexOf(currentProfile.permissions.repository) + 1) % choices.length] ?? "none";
				} else if (modeField === "task" || modeField === "artifacts") {
					currentProfile.permissions[modeField] =
						currentProfile.permissions[modeField] === "read" ? "read-write" : "read";
				} else if (modeField === "subagents") {
					currentProfile.permissions.subagents =
						currentProfile.permissions.subagents === "allowed" ? "disabled" : "allowed";
				} else if (modeField === "color") {
					modeColorChoiceIndex = Math.max(0, colorChoices.indexOf(currentProfile.textColor));
					modeColorEditing = true;
				}
				render();
				return;
			}
			if (modeFocus === "profile" && ["up", "k", "down", "j"].includes(event.name)) {
				const index = modeEditFields.findIndex((field) => field.id === modeField);
				const delta = event.name === "up" || event.name === "k" ? -1 : 1;
				modeField = modeEditFields[Math.max(0, Math.min(modeEditFields.length - 1, index + delta))]?.id ?? modeField;
			}
			render();
			return;
		}
		if (editing) {
			if (plain && (event.name === "return" || event.name === "linefeed" || event.name === "kpenter")) {
				finishEdit(true);
				return;
			}
			if (event.name === "tab") return;
			if (activeField < 0) {
				if (!plain) return;
				if (["up", "left", "k"].includes(event.name)) editPresetIndex = Math.max(0, editPresetIndex - 1);
				else if (["down", "right", "j"].includes(event.name)) {
					editPresetIndex = Math.min(names.length - 1, editPresetIndex + 1);
				}
				render();
			} else {
				controls()[activeField]?.handleKeyPress(event);
			}
			return;
		}
		if (!event.ctrl && !event.meta && !event.option && !event.super && !event.hyper && event.name === "tab") {
			if (event.shift) {
				if (categoryFocused) focusField(controls().length - 1);
				else if (activeField < 0) focusList(true);
				else if (activeField === 0) focusList();
				else focusField(activeField - 1);
				return;
			}
			if (categoryFocused) focusList();
			else if (activeField < 0) focusField(0);
			else if (activeField === controls().length - 1) focusList(true);
			else focusField(activeField + 1);
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
		if (event.name === "left") {
			focusList(true);
			return;
		}
		if (event.name === "return" || event.name === "linefeed" || event.name === "kpenter") {
			beginEdit();
			return;
		}
		if (event.name === "up" || event.name === "k") {
			if (activeField < 0) focusField(controls().length - 1);
			else if (activeField === 0) focusList();
			else focusField(activeField - 1);
			return;
		}
		if (event.name === "down" || event.name === "j") {
			if (activeField === controls().length - 1) focusList();
			else focusField(activeField + 1);
			return;
		}
		if (activeField < 0 && event.name === "space") {
			setDefault();
		}
	};
	const onPaste = (event: PasteEvent): void => {
		if (modelPicker) return;
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
