import {
	BoxRenderable,
	type CliRenderer,
	InputRenderable,
	type KeyEvent,
	ScrollBoxRenderable,
	TextareaRenderable,
	TextRenderable,
} from "@opentui/core";
import { agentCommandArgvSchema, assertAgentConfiguration } from "../../model/session/agent-config-schema.ts";
import type { AgentConfiguration, AgentPreset } from "../../model/session/types.ts";
import { AGENT_PRESENTATION_METADATA } from "../../storage/config.ts";

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const background = "#18181b";
const text = "#d4d4d8";
const dimmed = "#a1a1aa";
const border = "#52525b";
const accent = "#22d3ee";

type FormState = { command: string; resumeFlag: string; environment: string; initialEnvironment: string };
type AgentPresetKeyAction = "unhandled" | "handled" | "categories" | "save" | "discard";

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

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
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

export function mountAgentPresetsEditor(
	renderer: CliRenderer,
	parent: BoxRenderable,
	draft: AgentConfiguration,
	onFocus: () => void,
) {
	let categoryFocused = true;
	let activeField = -1;
	let editing = false;
	let presetNameEditing = false;
	let editPresetIndex = 0;
	let selectedIndex = 0;
	let error: string | undefined;
	const presets = draft.presets ?? {};
	const names = Object.keys(presets);
	const states = new Map<string, FormState>(names.map((name) => [name, presetState(presets[name] as AgentPreset)]));
	const pane = new BoxRenderable(renderer, {
		flexGrow: 1,
		flexBasis: 0,
		minWidth: 0,
		height: "100%",
		border: true,
		borderStyle: "rounded",
		borderColor: border,
		paddingX: 1,
		flexDirection: "column",
		visible: false,
	});
	const editorPane = new ScrollBoxRenderable(renderer, {
		width: "100%",
		height: "100%",
		scrollX: false,
		contentOptions: { flexDirection: "column", padding: 0, rowGap: 1 },
		verticalScrollbarOptions: { trackOptions: { backgroundColor: background, foregroundColor: dimmed } },
	});
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
		"Enter edits preset choice; arrows change it only while editing. Space sets default; n copies this preset under a new name.",
	);
	const presetNameLabel = fieldLabel("New preset name");
	presetNameLabel.visible = false;
	const presetNameInput = new InputRenderable(renderer, {
		...inputOptions,
		placeholder: "Preset name…",
		visible: false,
	});
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
	for (const child of [presetLabel, presetDescription, presetValue, presetNameLabel, presetNameInput])
		presetGroup.add(child);
	const commandGroup = fieldGroup(commandLabel, commandDescription, commandValue, commandInput);
	const resumeGroup = fieldGroup(resumeLabel, resumeDescription, resumeValue, resumeInput);
	const environmentGroup = fieldGroup(environmentLabel, environmentDescription, environmentValue, environmentInput);
	for (const group of [presetGroup, commandGroup, resumeGroup, environmentGroup]) editorPane.add(group);
	pane.add(editorPane);
	parent.add(pane);

	const selectedName = (): string => names[selectedIndex] ?? "";
	const selectedState = (): FormState => states.get(selectedName()) as FormState;
	const controls = (): Array<InputRenderable | TextareaRenderable> => [commandInput, resumeInput, environmentInput];
	const groups = (): BoxRenderable[] => [commandGroup, resumeGroup, environmentGroup];
	const values = (): TextRenderable[] => [commandValue, resumeValue, environmentValue];
	const keyHints = (width: number): string =>
		presetNameEditing
			? "Name · Enter create · Esc cancel"
			: categoryFocused
				? width < 72
					? "→/Enter/Tab fields  ^S save  Esc discard"
					: "Right/Enter/Tab: fields  Ctrl+S: save draft  Esc: discard"
				: editing
					? width < 72
						? "Enter commit  Esc cancel  ^S draft only"
						: "Enter: commit  Esc: cancel edit  Ctrl+S: save draft only"
					: width < 72
						? "↑↓/Tab select Enter edit ← back ^S save Esc discard"
						: "↑/↓/Tab: select  Enter: edit  ←: categories  Ctrl+S: save  Esc: discard";
	const ensureSelectionVisible = (): void => {
		if (!pane.visible) return;
		environmentInput.height = Math.max(1, Math.min(4, editorPane.viewport.height - 2));
		if (categoryFocused) return;
		const group = activeField < 0 ? presetGroup : groups()[activeField];
		if (group) editorPane.scrollChildIntoView(group.id);
		const target = presetNameEditing ? presetNameInput : editing ? controls()[activeField] : values()[activeField];
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
			onSizeChange?.call(box);
			ensureSelectionVisible();
		};
	}
	const render = (isActive = pane.visible, isCategoryFocused = categoryFocused): void => {
		categoryFocused = isCategoryFocused;
		pane.visible = isActive;
		if (!pane.visible) return;
		const name = selectedName();
		const state = selectedState();
		presetNameLabel.visible = presetNameEditing;
		presetNameInput.visible = presetNameEditing;
		presetNameInput.focusable = presetNameEditing;
		presetValue.visible = !presetNameEditing;
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
		const descriptions = [commandDescription, resumeDescription, environmentDescription];
		for (const description of descriptions)
			description.visible = !categoryFocused && descriptions[activeField] === description;
		presetDescription.visible = !categoryFocused && activeField < 0 && !presetNameEditing;
		presetLabel.fg = !categoryFocused && activeField < 0 ? accent : text;
		presetValue.fg = !categoryFocused && activeField < 0 ? accent : text;
		const displayedName = editing && activeField < 0 ? (names[editPresetIndex] ?? name) : name;
		presetValue.content = `${displayedName}${displayedName === draft.selectedPreset ? " ● default" : ""}${editing && activeField < 0 ? "  < >" : ""}`;
		const labels = [commandLabel, resumeLabel, environmentLabel];
		for (const label of labels) label.fg = !categoryFocused && labels[activeField] === label ? accent : text;
		pane.borderColor = categoryFocused ? border : accent;
		ensureSelectionVisible();
		renderer.requestRender();
	};
	const focusList = (focusCategory = false): void => {
		cancelPresetNameEntry();
		controls()[activeField]?.blur();
		editing = false;
		activeField = -1;
		if (!focusCategory && categoryFocused) onFocus();
		categoryFocused = focusCategory;
		(focusCategory ? pane : presetGroup).focus();
		if (focusCategory) editorPane.scrollTo(0);
		render();
	};
	const focusField = (index: number): void => {
		cancelPresetNameEntry();
		controls()[activeField]?.blur();
		editing = false;
		categoryFocused = false;
		activeField = (index + controls().length) % controls().length;
		render();
		groups()[activeField]?.focus();
		onFocus();
	};
	const finishEdit = (commit: boolean): void => {
		if (commit) {
			if (activeField < 0) selectedIndex = editPresetIndex;
			else {
				const field = (["command", "resumeFlag", "environment"] as const)[activeField];
				const control = controls()[activeField];
				if (field && control) {
					const value = control instanceof InputRenderable ? control.value : control.plainText;
					try {
						selectedState()[field] =
							field === "command" ? JSON.stringify(agentCommandArgvSchema.parse(JSON.parse(value))) : value;
						error = undefined;
					} catch (cause) {
						error = errorMessage(cause, "Command must be a JSON argv array.");
						render();
						return;
					}
				}
			}
		}
		if (activeField < 0) focusList();
		else focusField(activeField);
	};
	const createPreset = (): void => {
		const name = presetNameInput.value.trim();
		try {
			if (!name) throw new Error("Preset name must not be empty.");
			if (Object.hasOwn(presets, name)) throw new Error(`Preset ${name} already exists.`);
			const sourceName = selectedName();
			const source = presets[sourceName];
			if (!source) throw new Error("Select a configured preset to copy.");
			const copied = editedPreset(sourceName, source, selectedState());
			assertAgentConfiguration({ ...draft, presets: { ...presets, [name]: copied } }, "project", "Invalid preset");
			presets[name] = copied;
			draft.presets = presets;
			names.push(name);
			states.set(name, presetState(copied));
			selectedIndex = names.length - 1;
			presetNameInput.blur();
			presetNameEditing = false;
			error = undefined;
			focusList();
		} catch (cause) {
			error = errorMessage(cause, "Invalid preset name.");
			render();
			presetNameInput.focus();
		}
	};
	function cancelPresetNameEntry(): void {
		if (!presetNameEditing) return;
		presetNameInput.blur();
		presetNameEditing = false;
		error = undefined;
	}
	const focusHandlers: Array<[BoxRenderable | InputRenderable | TextareaRenderable, () => void]> = [
		[
			presetGroup,
			() => {
				if (pane.visible && !categoryFocused && !presetNameEditing) return;
				focusList();
				onFocus();
			},
		],
	];
	for (const group of groups())
		focusHandlers.push([
			group,
			() => {
				const index = groups().indexOf(group);
				if (!pane.visible || (!categoryFocused && activeField === index)) return;
				focusField(index);
			},
		]);
	for (const [target, handler] of focusHandlers) target.on("focused", handler);

	return {
		get error(): string | undefined {
			return error;
		},
		pane,
		keyHints,
		statusText(): string {
			const preset = presets[selectedName()];
			return preset ? `Adapter: ${preset.bootstrap} · prepare/worktree options retained` : "No preset selected";
		},
		activate(): void {
			onFocus();
			focusList();
		},
		focusField,
		clearError(): void {
			error = undefined;
		},
		deactivate(): void {
			cancelPresetNameEntry();
			controls()[activeField]?.blur();
			categoryFocused = true;
		},
		render,
		buildPresets(): Record<string, AgentPreset> {
			const result: Record<string, AgentPreset> = {};
			for (const name of names)
				result[name] = editedPreset(name, presets[name] as AgentPreset, states.get(name) as FormState);
			return result;
		},
		handleKeyPress(event: KeyEvent): AgentPresetKeyAction {
			if (!pane.visible) return "unhandled";
			const plain = !event.ctrl && !event.shift && !event.meta && !event.option && !event.super && !event.hyper;
			if (
				categoryFocused &&
				!event.ctrl &&
				!event.meta &&
				!event.option &&
				!event.super &&
				!event.hyper &&
				event.name === "tab"
			) {
				if (event.shift) focusField(controls().length - 1);
				else focusList();
				return "handled";
			}
			if (categoryFocused) return "unhandled";
			if (presetNameEditing && plain && event.name === "escape") {
				presetNameInput.blur();
				presetNameEditing = false;
				error = undefined;
				render();
				return "categories";
			}
			if (plain && event.name === "escape") {
				if (editing) {
					error = undefined;
					finishEdit(false);
				} else return "discard";
				return "handled";
			}
			if (
				event.ctrl &&
				!event.shift &&
				!event.meta &&
				!event.option &&
				!event.super &&
				!event.hyper &&
				event.name === "s"
			)
				return "save";
			if (presetNameEditing) {
				if (plain && ["return", "linefeed", "kpenter"].includes(event.name)) createPreset();
				else if (event.name !== "tab") presetNameInput.handleKeyPress(event);
				return "handled";
			}
			if (editing) {
				if (plain && ["return", "linefeed", "kpenter"].includes(event.name)) {
					finishEdit(true);
					return "handled";
				}
				if (event.name === "tab") return "handled";
				if (activeField < 0) {
					if (!plain) return "handled";
					if (["up", "left", "k"].includes(event.name)) editPresetIndex = Math.max(0, editPresetIndex - 1);
					else if (["down", "right", "j"].includes(event.name))
						editPresetIndex = Math.min(names.length - 1, editPresetIndex + 1);
					render();
				} else controls()[activeField]?.handleKeyPress(event);
				return "handled";
			}
			if (!event.ctrl && !event.meta && !event.option && !event.super && !event.hyper && event.name === "tab") {
				if (event.shift) {
					if (activeField < 0) return "categories";
					if (activeField === 0) focusList();
					else focusField(activeField - 1);
				} else if (activeField < 0) focusField(0);
				else if (activeField === controls().length - 1) return "categories";
				else focusField(activeField + 1);
				return "handled";
			}
			if (!plain) return "unhandled";
			if (event.name === "left") return "categories";
			if (activeField < 0 && event.name === "n") {
				if (!selectedName()) {
					error = "Select a configured preset to copy.";
					render();
					return "handled";
				}
				presetNameInput.setText("");
				presetNameEditing = true;
				error = undefined;
				render();
				presetNameInput.focus();
				return "handled";
			}
			if (["return", "linefeed", "kpenter"].includes(event.name)) {
				editing = true;
				editPresetIndex = selectedIndex;
				error = undefined;
				render();
				controls()[activeField]?.focus();
				return "handled";
			}
			if (["up", "k"].includes(event.name)) {
				if (activeField < 0) focusField(controls().length - 1);
				else if (activeField === 0) focusList();
				else focusField(activeField - 1);
				return "handled";
			}
			if (["down", "j"].includes(event.name)) {
				if (activeField === controls().length - 1) focusList();
				else focusField(activeField + 1);
				return "handled";
			}
			if (activeField < 0 && event.name === "space") {
				draft.selectedPreset = selectedName();
				error = undefined;
				render();
				return "handled";
			}
			return "unhandled";
		},
		dispose(): void {
			for (const [target, handler] of focusHandlers) target.off("focused", handler);
			pane.destroyRecursively();
		},
	};
}
