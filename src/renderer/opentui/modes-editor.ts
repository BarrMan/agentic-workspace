import {
	BoxRenderable,
	type CliRenderer,
	InputRenderable,
	type KeyEvent,
	ScrollBoxRenderable,
	TextareaRenderable,
	TextRenderable,
} from "@opentui/core";
import { slug } from "../../lib/slug.ts";
import { validateArtifactPath } from "../../model/session/agent-config-schema.ts";
import { effectiveModeTextColor, MODE_TEXT_COLORS } from "../../model/session/mode-colors.ts";
import { profilePermissionSupport } from "../../runtime/agents/core/profile.ts";
import { AGENT_PRESENTATION_METADATA } from "../../storage/config.ts";
import type { OpenTuiAgentSettingsOptions } from "./agent-settings.ts";
import { mountOpenTuiModeModelPicker } from "./mode-model-picker.ts";
import type { ModeSettingsDraft } from "./mode-settings-draft.ts";

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

type ModesEditorOptions = Pick<
	OpenTuiAgentSettingsOptions,
	"configuration" | "profilePermissionSupport" | "modeSessionCounts" | "getModeSessionCount" | "discoverModeModels"
> & {
	readonly draft: ModeSettingsDraft | undefined;
	readonly onRender: () => void;
	readonly onError: (error: string | undefined) => void;
};

/** Owns Modes presentation and interaction; the settings shell owns category focus and saving. */
export function mountOpenTuiModesEditor(
	renderer: CliRenderer,
	parent: BoxRenderable,
	body: BoxRenderable,
	surface: BoxRenderable,
	options: ModesEditorOptions,
) {
	const modeDraft = options.draft;
	const draft = options.configuration;
	let disposed = false;
	let active = false;
	let selectedModeIndex = 0;
	let selectedModeId: string | undefined;
	let modeFocus: "list" | "profile" = "list";
	let modelPicker: ReturnType<typeof mountOpenTuiModeModelPicker> | undefined;
	const background = "#18181b";
	const text = "#d4d4d8";
	const dimmed = "#a1a1aa";
	const border = "#52525b";
	const accent = "#22d3ee";
	const inputOptions = {
		width: "100%" as const,
		backgroundColor: background,
		focusedBackgroundColor: background,
		textColor: text,
		focusedTextColor: accent,
	};
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
	const modeColorPreview = new TextRenderable(renderer, {
		id: "settings-mode-color-preview",
		width: "100%",
		wrapMode: "word",
		fg: text,
		flexShrink: 0,
		visible: false,
	});
	modeDetailPane.add(modeColorPreview);
	let modeActionInput: "add" | "rename" | "delete" | undefined;
	const modeActionLabel = new TextRenderable(renderer, {
		width: "100%",
		height: 1,
		content: "",
		fg: text,
		flexShrink: 0,
		visible: false,
	});
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
	body.add(modesPane);
	surface.add(modeActions);

	const render = options.onRender;
	const modeIds = (): string[] => modeDraft?.configuration.modes?.order ?? [];
	const selectedMode = (): string | undefined => {
		const ids = modeIds();
		if (selectedModeId && ids.includes(selectedModeId)) selectedModeIndex = ids.indexOf(selectedModeId);
		selectedModeId = ids[selectedModeIndex];
		return selectedModeId;
	};
	const ensureModeSelectionVisible = (): void => {
		if (disposed || !active || modeFocus !== "profile" || modelPicker) return;
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
	const focusModeList = (): void => {
		modeFocus = "list";
		modeListPane.focus();
		render();
	};
	const focusModeFields = (): void => {
		modeFocus = "profile";
		modeDetailPane.focus();
		render();
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
		options.onError(undefined);
		render();
	};
	const handleModeEditorKeyPress = (event: KeyEvent, plain: boolean): boolean => {
		if (modeColorEditing) {
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
		if (modeCustomApprovalEditing) {
			const currentProfile = modeDraft?.configuration.modes?.profiles[modeIds()[selectedModeIndex] ?? ""];
			if (plain && ["return", "linefeed", "kpenter"].includes(event.name)) {
				try {
					const path = modeApprovalInput.value.trim();
					if (currentProfile) currentProfile.approvalArtifact = path ? validateArtifactPath(path) : undefined;
					modeCustomApprovalEditing = false;
					options.onError(undefined);
				} catch (cause) {
					options.onError(errorMessage(cause, "Invalid approval artifact path."));
				}
				render();
				if (!modeCustomApprovalEditing) modeDetailPane.focus();
				return true;
			}
			modeApprovalInput.handleKeyPress(event);
			return true;
		}
		if (modeApprovalEditing || modeActionInput || modeEditing) {
			const currentId = modeIds()[selectedModeIndex];
			if (modeActionInput === "delete" && modeDraft) {
				if ((event.name === "return" || event.name === "linefeed" || event.name === "kpenter") && currentId) {
					modeDraft.deleteMode(currentId);
					selectedModeIndex = Math.min(selectedModeIndex, modeIds().length - 1);
					selectedModeId = modeIds()[selectedModeIndex];
					modeField = "model";
					modeActionInput = undefined;
				}
				render();
				return true;
			}
			if (modeActionInput && modeDraft) {
				if (event.name === "return" || event.name === "linefeed" || event.name === "kpenter") {
					try {
						const value = modeActionEditor.value.trim();
						if (!value || /[\0\r\n]/.test(value)) throw new Error("Mode name must be non-empty single-line text.");
						if (modeActionInput === "rename" && currentId) modeDraft.renameMode(currentId, value);
						if (modeActionInput === "add") {
							const newId = slug(value);
							modeDraft.addMode(newId, value);
							selectedModeId = newId;
							selectedModeIndex = modeIds().indexOf(newId);
							modeField = "model";
						}
						modeActionInput = undefined;
						options.onError(undefined);
						modeDetailPane.focus();
					} catch (cause) {
						options.onError(errorMessage(cause, "Invalid mode name."));
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
					options.onError(errorMessage(cause, "Invalid mode editor value."));
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
	return {
		get pickerOpen(): boolean {
			return Boolean(modelPicker);
		},
		activate(pane: "list" | "profile"): void {
			modeFocus = pane;
			(pane === "list" ? modeListPane : modeDetailPane).focus();
		},
		keyHints(width: number): string {
			if (modeActionInput) return "Name · Enter stage · Esc cancel";
			if (modeEditing) return "Enter newline · Ctrl+Enter stage · Esc cancel · Ctrl+S Save";
			if (modeCustomApprovalEditing) return "Artifact path · Enter stage · Esc cancel · Ctrl+S Save";
			if (modeApprovalEditing || modeColorEditing) return "↑/↓ choose · Enter stage · Esc cancel";
			return modeFocus === "list"
				? width < 72
					? "↑↓ mode →/Enter profile Tab pane ^S Save Esc Discard"
					: "↑/↓: mode  →/Enter: profile  Tab/Shift+Tab: pane  Ctrl+S: Save  Esc: Discard"
				: width < 72
					? "↑↓ field Enter edit ← modes Tab pane ^S Save Esc Discard"
					: "↑/↓: field  Enter: edit  ←: modes  Tab/Shift+Tab: pane  Ctrl+S: Save  Esc: Discard";
		},
		render(visible: boolean, focused: boolean, width: number): void {
			active = visible && focused;
			modesPane.visible = visible;
			modeActions.visible = visible;
			modeListPane.width = width >= 100 ? 24 : Math.max(16, Math.floor(width / 4));
			if (!visible || disposed) return;
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
				const focused = index === selectedModeIndex && active && modeFocus === "list" && !modelPicker;
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
						active && modeFocus === "profile" && modeField === field.id && !modeActionInput && !modelPicker;
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
			modeListPane.borderColor = active && modeFocus === "list" && !modelPicker ? accent : border;
			modeDetailPane.borderColor = active && modeFocus === "profile" && !modelPicker ? accent : border;
			modeDetailPane.title = profile ? `Profile · ${profile.name}` : "Profile";
			ensureModeSelectionVisible();
		},
		handleKeyPress(event: KeyEvent): "save" | "discard" | "categories" | "unhandled" | undefined {
			const plain = !event.ctrl && !event.shift && !event.meta && !event.option && !event.super && !event.hyper;
			// Escape still cancels the pending editor after a category click.
			if (plain && event.name === "escape") {
				if (modeColorEditing) {
					modeColorEditing = false;
				} else if (modeApprovalEditing || modeCustomApprovalEditing) {
					modeApprovalEditing = false;
					modeCustomApprovalEditing = false;
					modeDetailPane.focus();
				} else if (modeActionInput) {
					modeActionInput = undefined;
					modeFocus = "profile";
					modeDetailPane.focus();
				} else if (modeEditing) {
					modeEditing = false;
					modeDetailPane.focus();
				} else return active ? "discard" : "unhandled";
				options.onError(undefined);
				render();
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
				return active ? "save" : "unhandled";
			}
			if (!active) return "unhandled";
			if (handleModeEditorKeyPress(event, plain)) return;
			if (!event.ctrl && !event.meta && !event.option && !event.super && !event.hyper && event.name === "tab") {
				if (event.shift) {
					if (modeFocus === "profile") focusModeList();
					else return "categories";
				} else {
					if (modeFocus === "list") focusModeFields();
					else return "categories";
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
					options.onError("Initialize the project mode catalog before editing mode settings.");
					render();
					return;
				}
				modeActionInput = event.name === "a" ? "add" : "rename";
				modeFocus = "profile";
				modeActionEditor.setText(modeActionInput === "rename" ? (currentProfile?.name ?? "") : "");
				options.onError(undefined);
				render();
				modeActionEditor.focus();
				return;
			}
			if (event.name === "d" && currentId) {
				if (modeIds().length <= 1) options.onError("At least one mode is required.");
				else {
					modeActionInput = "delete";
					modeFocus = "profile";
					options.onError(undefined);
				}
				render();
				return;
			}
			if (event.name === "s" && currentId && modeDraft) {
				modeDraft.setModeDefault(currentId);
				render();
				return;
			}
			if ((event.name === "[" || event.name === "]") && currentId && modeDraft) {
				const target = Math.max(0, Math.min(modeIds().length - 1, selectedModeIndex + (event.name === "]" ? -1 : 1)));
				modeDraft.moveMode(currentId, target);
				selectedModeIndex = target;
				render();
				return;
			}
			if (event.name === "left") {
				if (modeFocus === "list") return "categories";
				focusModeList();
				return;
			}
			if (
				modeFocus === "profile" &&
				["return", "linefeed", "kpenter", "enter"].includes(event.name) &&
				currentProfile
			) {
				options.onError(undefined);
				if (modeField === "model") {
					const selectedPreset = draft.selectedPreset;
					const preset = selectedPreset ? draft.presets?.[selectedPreset] : undefined;
					if (!selectedPreset || !preset) {
						options.onError("Choose a configured preset before model discovery.");
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
		},
		dispose(): void {
			if (disposed) return;
			disposed = true;
			modelPicker?.dispose();
			modesPane.destroyRecursively();
			modeActions.destroy();
		},
	};
}
