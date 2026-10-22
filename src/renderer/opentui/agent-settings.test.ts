import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable, InputRenderable, rgbToHex, TextareaRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentConfiguration } from "../../model/session/types.ts";
import { parseAgentPresetEnvironment } from "./agent-presets-editor.ts";
import { mountOpenTuiAgentSettings, mountOpenTuiPresetPicker } from "./agent-settings.ts";

function configuration(): AgentConfiguration & { presets: NonNullable<AgentConfiguration["presets"]> } {
	return {
		selectedPreset: "existing",
		presets: {
			existing: {
				command: ["agent", "{prompt}"],
				env: { TOKEN: "a=b" },
				prepare: "git status",
				bootstrap: "opencode",
				resumeFlag: "--resume",
			},
		},
		sessions: { worktreePerTask: false, yoloMode: false, autoResumeOnRestart: true },
	};
}

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

async function editSelectedField(setup: TestRendererSetup, value: string): Promise<void> {
	setup.mockInput.pressEnter();
	setup.mockInput.pressKey("END");
	setup.mockInput.pressKey("HOME", { shift: true });
	await setup.mockInput.pasteBracketedText(value);
	setup.mockInput.pressEnter();
	await setup.flush();
}

function cellColor(setup: TestRendererSetup, x: number, y: number) {
	let column = 0;
	for (const span of setup.captureSpans().lines[y]?.spans ?? []) {
		if (x < column + span.width) return span.fg;
		column += span.width;
	}
	throw new Error(`No rendered cell at ${x},${y}.`);
}

function spanColor(setup: TestRendererSetup, text: string, channel: "fg" | "bg"): string {
	const span = setup
		.captureSpans()
		.lines.flatMap((line) => line.spans)
		.find((candidate) => candidate.text.includes(text));
	if (!span) throw new Error(`No rendered span containing ${text}.`);
	return rgbToHex(span[channel]);
}

describe("native agent settings", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("parses environment values after only first equals sign", () => {
		expect(parseAgentPresetEnvironment("TOKEN=a=b\nEMPTY=")).toEqual({ TOKEN: "a=b", EMPTY: "" });
		expect(() => parseAgentPresetEnvironment("1BAD=value")).toThrow("invalid name");
		expect(() => parseAgentPresetEnvironment("TOKEN=one\nTOKEN=two")).toThrow("repeats TOKEN");
	});

	it("preserves full-screen adjacent rounded panes and shows editors only after Enter", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: configuration(),
			onSave: async () => {},
			onClose: () => {},
		});
		try {
			await setup.flush();
			const rows = setup.captureCharFrame().split("\n");
			expect(rows[0]).toContain("Settings");
			expect(rows[0]).toContain("[ Project ]");
			expect(rows[3]).toContain("╮╭");
			expect(rows[20]).toContain("╯╰");
			expect(setup.captureCharFrame()).toContain('["agent","{prompt}"]');
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			const focused = cellColor(setup, 0, 4);
			const neutral = cellColor(setup, 20, 4);
			expect(focused).not.toEqual(neutral);
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(cellColor(setup, 0, 4)).toEqual(neutral);
			expect(cellColor(setup, 20, 4)).toEqual(focused);
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			expect(setup.captureCharFrame()).toContain("JSON argv");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
			expect((setup.renderer.currentFocusedRenderable as InputRenderable).value).toBe('["agent","{prompt}"]');
			setup.mockInput.pressEscape();
			setup.mockInput.pressArrow("left");
			await setup.flush();
			expect(cellColor(setup, 0, 4)).toEqual(focused);
			expect(cellColor(setup, 20, 4)).toEqual(neutral);
		} finally {
			mount.dispose();
		}
	});

	it("keeps navigation and paste read-only and uses Left to return to categories without changing presets", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const existing = config.presets.existing;
		if (!existing) throw new Error("Expected existing preset.");
		config.presets.second = { ...structuredClone(existing), command: ["second", "{prompt}"] };
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("ignored");
			await setup.mockInput.pasteBracketedText("ignored paste");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("up");
			setup.mockInput.pressTab({ shift: true });
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("left");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("existing ● default");
			expect(setup.captureCharFrame()).not.toContain("ignored");
			expect(setup.captureCharFrame()).toContain("Right/Enter/Tab: fields");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved).toEqual(config);
		} finally {
			mount.dispose();
		}
	});

	it("changes preset options only in edit mode, cancels choice, and makes a committed choice default explicitly", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const existing = config.presets.existing;
		if (!existing) throw new Error("Expected existing preset.");
		config.presets.second = { ...structuredClone(existing), command: ["second", "{prompt}"] };
		let saved: AgentConfiguration | undefined;
		let closed = 0;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => closed++,
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressEnter();
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressTab();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("second  < >");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(closed).toBe(0);
			expect(setup.captureCharFrame()).toContain("existing ● default");
			setup.mockInput.pressEnter();
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain('["second","{prompt}"]');
			expect(setup.captureCharFrame()).not.toContain("second ● default");
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("second ● default");
			setup.mockInput.pressEnter();
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressEscape();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved).toEqual({ ...config, selectedPreset: "second" });
			expect(config.selectedPreset).toBe("existing");
		} finally {
			mount.dispose();
		}
	});

	it("does not save an uncommitted preset choice or apply default commands while editing the selectbox", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const existing = config.presets.existing;
		if (!existing) throw new Error("Expected existing preset.");
		config.presets.second = { ...structuredClone(existing), command: ["second", "{prompt}"] };
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressEnter();
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressKey(" ");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved).toEqual(config);
		} finally {
			mount.dispose();
		}
	});

	it("copies the selected preset under a new name on Enter without changing the default", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("n");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
			await setup.mockInput.typeText("copied");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("copied");
			expect(setup.captureCharFrame()).not.toContain("copied ● default");
			expect(saved).toBeUndefined();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.selectedPreset).toBe("existing");
			expect(saved?.presets?.copied).toEqual(original.presets.existing);
			expect(saved?.presets?.existing).toEqual(original.presets.existing);
			expect(config).toEqual(original);
		} finally {
			mount.dispose();
		}
	});

	it("cancels an entered name and does not save a pending preset-name buffer", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("n");
			await setup.mockInput.typeText("cancelled");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("cancelled");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("n");
			await setup.mockInput.typeText("pending");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
			expect((setup.renderer.currentFocusedRenderable as InputRenderable).value).toBe("pending");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.presets).toEqual(config.presets);
			expect(saved?.selectedPreset).toBe("existing");
		} finally {
			mount.dispose();
		}
	});

	it("cancels a pending preset name when mouse focus moves to another field", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: configuration(),
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		const clickVisibleText = async (text: string): Promise<void> => {
			const rows = setup.captureCharFrame().split("\n");
			const y = rows.findIndex((row) => row.includes(text));
			const x = rows[y]?.indexOf(text) ?? -1;
			if (x < 0) throw new Error(`Expected visible text: ${text}`);
			await setup.mockMouse.click(x + 1, y);
			await setup.flush();
		};
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("n");
			await setup.mockInput.typeText("abandoned");
			await setup.flush();
			await clickVisibleText("Command");
			expect(setup.captureCharFrame()).not.toContain("abandoned");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			setup.mockInput.pressEnter();
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
			setup.mockInput.pressKey("END");
			setup.mockInput.pressKey("HOME", { shift: true });
			await setup.mockInput.pasteBracketedText('["clicked", "{prompt}"]');
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.presets?.abandoned).toBeUndefined();
			expect(saved?.presets?.existing?.command).toEqual(["clicked", "{prompt}"]);
		} finally {
			mount.dispose();
		}
	});

	it("keeps the name editor focused after empty or duplicate names and permits recovery", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("n");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("must not be empty");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
			await setup.mockInput.typeText("existing");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("already exists");
			expect((setup.renderer.currentFocusedRenderable as InputRenderable).value).toBe("existing");
			setup.mockInput.pressKey("a", { ctrl: true });
			setup.mockInput.pressKey("k", { ctrl: true });
			await setup.mockInput.typeText("recovered");
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.presets?.recovered).toEqual(config.presets.existing);
			expect(saved?.presets?.existing).toEqual(config.presets.existing);
		} finally {
			mount.dispose();
		}
	});

	it("commits text with Enter, cancels only field edits with Escape, and discards the whole draft in navigation", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		let saved: AgentConfiguration | undefined;
		let closed = 0;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => closed++,
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressTab();
			await editSelectedField(setup, '["changed", "{prompt}"]');
			expect(setup.captureCharFrame()).toContain('["changed","{prompt}"]');
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("e", { ctrl: true });
			await setup.mockInput.typeText(" cancelled");
			setup.mockInput.pressTab();
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(closed).toBe(0);
			expect(setup.captureCharFrame()).toContain('["changed","{prompt}"]');
			expect(setup.captureCharFrame()).not.toContain("cancelled");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("END");
			await setup.mockInput.pasteBracketedText("\nCANCELLED=value");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("CANCELLED=value");
			expect(closed).toBe(0);
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(closed).toBe(1);
			expect(saved).toBeUndefined();
			expect(config).toEqual(configuration());
		} finally {
			mount.dispose();
		}
	});

	it("selects mouse-clicked fields without editing, then commits native text and multiline environment explicitly", async () => {
		const setup = await createTestRenderer({ width: 120, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		let saved: AgentConfiguration | undefined;
		const config = configuration();
		const existing = config.presets.existing;
		if (!existing) throw new Error("Expected existing preset.");
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		const clickVisibleText = async (text: string): Promise<void> => {
			const rows = setup.captureCharFrame().split("\n");
			const y = rows.findIndex((row) => row.includes(text));
			const x = rows[y]?.indexOf(text) ?? -1;
			if (x < 0) throw new Error(`Expected visible text: ${text}`);
			await setup.mockMouse.click(x + 1, y);
			await setup.flush();
		};
		try {
			await setup.flush();
			await clickVisibleText('["agent","{prompt}"]');
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			await setup.mockInput.typeText("ignored");
			await setup.mockInput.pasteBracketedText("ignored");
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("ignored");
			await editSelectedField(setup, '["changed", "{prompt}"]');
			await clickVisibleText("--resume");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			await editSelectedField(setup, "--mouse");
			await clickVisibleText('["changed","{prompt}"]');
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("e", { ctrl: true });
			await setup.mockInput.typeText(" uncommitted");
			await clickVisibleText("TOKEN=a=b");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			expect(setup.captureCharFrame()).not.toContain("uncommitted");
			setup.mockInput.pressEnter();
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(TextareaRenderable);
			setup.mockInput.pressKey("END");
			await setup.mockInput.pasteBracketedText("\nMOUSE=clicked");
			setup.mockInput.pressEnter({ shift: true });
			await setup.mockInput.typeText("EMPTY=");
			expect((setup.renderer.currentFocusedRenderable as TextareaRenderable).plainText).toBe(
				"TOKEN=a=b\nMOUSE=clicked\nEMPTY=",
			);
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.presets?.existing).toEqual({
				...existing,
				command: ["changed", "{prompt}"],
				resumeFlag: "--mouse",
				env: { TOKEN: "a=b", MOUSE: "clicked", EMPTY: "" },
			});
		} finally {
			mount.dispose();
		}
	});

	it("keeps selected values and native environment editing reachable after narrowing and shrinking", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		let saved: AgentConfiguration | undefined;
		const config = configuration();
		const existing = config.presets.existing;
		if (!existing) throw new Error("Expected existing preset.");
		existing.env = {};
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressTab();
			await editSelectedField(setup, '["runner", "{skill}", "{prompt}"]');
			setup.mockInput.pressTab();
			setup.mockInput.pressTab();
			setup.mockInput.pressEnter();
			await setup.mockInput.pasteBracketedText("TOKEN=visible\nEMPTY=");
			for (const [width, height] of [
				[80, 24],
				[50, 14],
				[50, 12],
				[80, 24],
			] as const) {
				setup.resize(width, height);
				await setup.flush();
				const editor = setup.renderer.currentFocusedRenderable;
				expect(editor).toBeInstanceOf(TextareaRenderable);
				if (!(editor instanceof TextareaRenderable)) throw new Error("Expected environment editor.");
				expect(editor.y).toBeGreaterThan(3);
				expect(editor.y + editor.height).toBeLessThanOrEqual(height - 4);
				expect(setup.captureCharFrame()).toContain("TOKEN=visible");
			}
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			expect(setup.captureCharFrame()).toContain("TOKEN=visible");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.presets?.existing?.env).toEqual({ TOKEN: "visible", EMPTY: "" });
			expect(saved?.presets?.existing?.command).toEqual(["runner", "{skill}", "{prompt}"]);
		} finally {
			mount.dispose();
		}
	});

	it("saves only committed project draft values when Ctrl+S arrives during field editing", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		let saved: AgentConfiguration | undefined;
		const config = configuration();
		const existing = config.presets.existing;
		if (!existing) throw new Error("Expected existing preset.");
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("down");
			await editSelectedField(setup, '["committed", "{prompt}"]');
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("END");
			await setup.mockInput.pasteBracketedText("\nUNCOMMITTED=value");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.presets?.existing).toEqual({
				...existing,
				command: ["committed", "{prompt}"],
			});
		} finally {
			mount.dispose();
		}
	});

	it("keeps an invalid command editor focused, then lets Escape cancel and a valid Enter commit save", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: configuration(),
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressTab();
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("a", { ctrl: true });
			setup.mockInput.pressKey("k", { ctrl: true });
			await setup.mockInput.typeText("not-json");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Error:");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
			expect((setup.renderer.currentFocusedRenderable as InputRenderable).value).toBe("not-json");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("Error:");
			expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(BoxRenderable);
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("a", { ctrl: true });
			setup.mockInput.pressKey("k", { ctrl: true });
			await setup.mockInput.typeText('["fixed", "{prompt}"]');
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.presets?.existing?.command).toEqual(["fixed", "{prompt}"]);
		} finally {
			mount.dispose();
		}
	});

	it("blocks edits and duplicate saves while pending, reports failure, and ignores late completion after disposal", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		let complete: (() => void) | undefined;
		let attempts = 0;
		let closed = 0;
		const root = parent(setup);
		root.focusable = true;
		root.focus();
		const mount = mountOpenTuiAgentSettings(setup.renderer, root, {
			configuration: configuration(),
			onSave: async (next) => {
				expect(next).toEqual(configuration());
				attempts++;
				await new Promise<void>((resolve) => {
					complete = resolve;
				});
				if (attempts === 1) throw new Error("write rejected");
			},
			onClose: () => {
				closed++;
			},
		});
		try {
			setup.mockInput.pressTab();
			setup.mockInput.pressTab();
			setup.mockInput.pressEnter();
			const editor = setup.renderer.currentFocusedRenderable as InputRenderable;
			setup.mockInput.pressKey("e", { ctrl: true });
			await setup.mockInput.typeText(" unsaved");
			setup.mockInput.pressKey("s", { ctrl: true });
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.mockInput.typeText("blocked");
			setup.mockInput.pressEscape();
			await setup.flush();
			const rows = setup.captureCharFrame().split("\n");
			const categoryRow = rows.findIndex((row) => row.includes("> Agents"));
			await setup.mockMouse.click(3, categoryRow);
			await setup.flush();
			expect(setup.renderer.currentFocusedRenderable).toBe(editor);
			expect(attempts).toBe(1);
			expect(editor.value).toBe('["agent","{prompt}"] unsaved');
			expect(closed).toBe(0);
			complete?.();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("write rejected");
			expect(editor.value).toBe('["agent","{prompt}"] unsaved');
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(closed).toBe(0);
			expect(setup.captureCharFrame()).not.toContain("unsaved");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(attempts).toBe(2);
			mount.dispose();
			complete?.();
			await setup.flush();
			expect(closed).toBe(1);
			expect(setup.captureCharFrame()).not.toContain("Settings");
			expect(setup.renderer.currentFocusedRenderable).toBe(root);
		} finally {
			mount.dispose();
		}
	});

	it("selects inherit explicitly and keeps picker open after callback failure", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const selected: Array<string | undefined> = [];
		let closed = 0;
		const root = parent(setup);
		const picker = mountOpenTuiPresetPicker(setup.renderer, root, {
			configuration: configuration(),
			inheritLabel: "Inherit project (existing)",
			onSelect: async (preset) => {
				selected.push(preset);
			},
			onClose: () => closed++,
		});
		try {
			await setup.flush();
			expect(spanColor(setup, "existing ●", "bg")).toBe("#22d3ee");
			expect(spanColor(setup, "existing ●", "fg")).toBe("#18181b");
			expect(spanColor(setup, "Inherit", "bg")).toBe("#18181b");
			setup.mockInput.pressArrow("up");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(selected).toEqual([undefined]);
			expect(closed).toBe(1);

			const failing = mountOpenTuiPresetPicker(setup.renderer, root, {
				configuration: configuration(),
				onSelect: async () => {
					throw new Error("preset rejected");
				},
				onClose: () => {},
			});
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("preset rejected");
			failing.dispose();
		} finally {
			picker.dispose();
		}
	});

	it("switches to the Sessions category and toggles the third option independently before saving", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		config.sessions = { worktreePerTask: true, yoloMode: false, autoResumeOnRestart: true };
		let saved: AgentConfiguration | undefined;
		let closed = 0;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => closed++,
		});
		try {
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("> Sessions");
			expect(setup.captureCharFrame()).toContain("[x] Worktree per task");
			expect(setup.captureCharFrame()).toContain("[ ] YOLO mode");
			expect(setup.captureCharFrame()).toContain("[x] Auto-resume on restart");
			expect(setup.captureCharFrame()).toContain("override permission");
			expect(setup.captureCharFrame()).toContain("even when YOLO mode is off");
			expect(setup.captureCharFrame()).toContain("--dangerously-skip-");
			expect(setup.captureCharFrame()).toContain("Pi has no verified flag");
			expect(setup.captureCharFrame()).toContain("never approves artifacts");
			setup.mockInput.pressArrow("right");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("> [x] Worktree per task");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("> [x] YOLO mode");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("> [ ] Auto-resume on restart");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.sessions).toEqual({ worktreePerTask: true, yoloMode: true, autoResumeOnRestart: false });
			expect(closed).toBe(1);
		} finally {
			mount.dispose();
		}
	});

	it("defaults absent session settings appropriately and keeps an Agents-only save valid", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		delete config.sessions;
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.sessions).toEqual({ worktreePerTask: false, yoloMode: false, autoResumeOnRestart: true });
			expect(saved?.selectedPreset).toBe("existing");
			expect(saved?.presets?.existing).toEqual(config.presets.existing);
		} finally {
			mount.dispose();
		}
	});

	it("enables session settings from an absent configuration and discards the draft with Escape", async () => {
		const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		delete config.sessions;
		let saved: AgentConfiguration | undefined;
		let closed = 0;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async (next) => {
				saved = next;
			},
			onClose: () => closed++,
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey(" ");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("> [x] YOLO mode");
			expect(setup.captureCharFrame()).toContain("[x] Auto-resume on restart");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(saved).toBeUndefined();
			expect(closed).toBe(1);
			expect(config.sessions).toBeUndefined();
		} finally {
			mount.dispose();
		}
	});
});
