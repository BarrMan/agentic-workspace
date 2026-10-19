import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable, InputRenderable, parseColor, TextareaRenderable, type TextRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { MODE_TEXT_COLORS } from "../model/session/mode-colors.ts";
import type { AgentConfiguration } from "../model/session/types.ts";
import { mountOpenTuiAgentSettings, type OpenTuiAgentSettingsOptions } from "../renderer/opentui/agent-settings.ts";

function configuration(): AgentConfiguration {
	return {
		selectedPreset: "work",
		presets: { work: { command: "agent {prompt}", env: { TOKEN: "raw" }, bootstrap: "claude", prepare: "kept" } },
		modes: {
			version: 1,
			defaultModeId: "plan",
			order: ["plan", "build"],
			profiles: {
				plan: {
					name: "PLAN",
					model: { kind: "default" },
					prompt: "original",
					permissions: { repository: "read", task: "read", artifacts: "read", subagents: "allowed" },
					artifacts: [{ path: "plan.md", purpose: "plan" }],
					approvalArtifact: "plan.md",
				},
				build: {
					name: "BUILD",
					model: { kind: "explicit", id: "missing-model" },
					prompt: "build",
					permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "disabled" },
					artifacts: [],
				},
			},
		},
	};
}

describe("Modes parser-input interactions", () => {
	const setups: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of setups.splice(0)) setup.renderer.destroy();
	});
	async function open(options: Partial<OpenTuiAgentSettingsOptions> = {}, width = 120, height = 36) {
		const setup = await createTestRenderer({ width, height, kittyKeyboard: true });
		setups.push(setup);
		const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(root);
		const config = options.configuration ?? configuration();
		let saved: AgentConfiguration | undefined;
		let closed = 0;
		const mount = mountOpenTuiAgentSettings(setup.renderer, root, {
			configuration: config,
			onSave: async (value) => {
				saved = value;
			},
			onClose: () => closed++,
			...options,
		});
		setup.mockInput.pressArrow("down");
		setup.mockInput.pressArrow("down");
		setup.mockInput.pressEnter();
		await setup.flush();
		return { setup, mount, config, saved: () => saved, closed: () => closed };
	}
	function profile(setup: TestRendererSetup) {
		setup.mockInput.pressEnter();
	}
	function down(setup: TestRendererSetup, count = 1) {
		for (let i = 0; i < count; i++) setup.mockInput.pressArrow("down");
	}
	function clear(setup: TestRendererSetup) {
		setup.mockInput.pressKey("a", { ctrl: true });
		setup.mockInput.pressKey("k", { ctrl: true });
	}
	function save(setup: TestRendererSetup) {
		setup.mockInput.pressKey("s", { ctrl: true });
	}
	function markers(setup: TestRendererSetup) {
		return setup.captureCharFrame().match(/> /g)?.length ?? 0;
	}

	it("traverses three distinct panes in both directions with one active row", async () => {
		const { setup } = await open();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-modes-list");
		expect(markers(setup)).toBe(1);
		expect(setup.captureCharFrame()).toContain("Modes list");
		expect(setup.captureCharFrame()).toContain("Profile · PLAN");
		for (const action of ["Add", "Rename", "Delete", "Default", "Save", "Discard"])
			expect(setup.captureCharFrame()).toContain(action);
		setup.mockInput.pressTab();
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-profile");
		expect(markers(setup)).toBe(1);
		expect(setup.captureCharFrame()).toContain("> Model:");
		setup.mockInput.pressTab({ shift: true });
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-modes-list");
		setup.mockInput.pressTab({ shift: true });
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("> Modes");
		setup.mockInput.pressTab({ shift: true });
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-profile");
		setup.mockInput.pressArrow("left");
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-modes-list");
	});

	it("activates model discovery, filters j/k as text, exclusively owns input and saves selection", async () => {
		let scope: unknown;
		const { setup, saved, config } = await open({
			discoverModeModels: async (value) => {
				scope = value;
				return [{ id: "j-model" }, { id: "k-model" }];
			},
		});
		profile(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(scope).toEqual({ harness: "claude", preset: "work" });
		expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-model-search");
		await setup.mockInput.typeText("j");
		save(setup);
		await setup.flush();
		expect(saved()).toBeUndefined();
		expect((setup.renderer.currentFocusedRenderable as InputRenderable).value).toBe("j");
		down(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-profile");
		expect(setup.captureCharFrame()).toContain("Model: j-model");
		expect(config.modes?.profiles.plan?.model).toEqual({ kind: "default" });
		save(setup);
		await setup.flush();
		expect(saved()?.modes?.profiles.plan?.model).toEqual({ kind: "explicit", id: "j-model" });
		expect(saved()?.presets).toEqual(config.presets);
	});

	it("edits every permission field with Enter and stages multiline prompt and artifact definitions", async () => {
		const { setup, saved, config } = await open();
		profile(setup);
		for (const label of ["Repository", "Task", "Artifacts", "Subagents"]) {
			down(setup);
			await setup.flush();
			expect(setup.captureCharFrame()).toContain(`> ${label}:`);
			setup.mockInput.pressEnter();
		}
		down(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-prompt-editor");
		expect(setup.captureCharFrame()).toContain("Ctrl+Enter stage");
		clear(setup);
		await setup.mockInput.typeText("first");
		setup.mockInput.pressEnter();
		await setup.mockInput.typeText("second");
		setup.mockInput.pressEnter({ ctrl: true });
		down(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-artifacts-editor");
		clear(setup);
		await setup.mockInput.typeText("result.md — result");
		setup.mockInput.pressEnter({ ctrl: true });
		save(setup);
		await setup.flush();
		const mode = saved()?.modes?.profiles.plan;
		expect(mode?.permissions).toEqual({
			repository: "read-write",
			task: "read-write",
			artifacts: "read-write",
			subagents: "disabled",
		});
		expect(mode?.prompt).toBe("first\nsecond");
		expect(mode?.artifacts).toEqual([{ path: "result.md", purpose: "result" }]);
		expect(config.modes?.profiles.plan?.prompt).toBe("original");
	});

	it("chooses None, a declared approval artifact, and validates custom paths", async () => {
		const { setup, saved } = await open();
		profile(setup);
		down(setup, 7);
		setup.mockInput.pressEnter();
		setup.mockInput.pressArrow("up");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Approval indicator: None");
		setup.mockInput.pressEnter();
		down(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Approval indicator: plan.md");
		setup.mockInput.pressEnter();
		down(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-approval-editor");
		clear(setup);
		await setup.mockInput.typeText("../bad.md");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Error:");
		expect(saved()).toBeUndefined();
		clear(setup);
		await setup.mockInput.typeText("approved.md");
		setup.mockInput.pressEnter();
		save(setup);
		await setup.flush();
		expect(saved()?.modes?.profiles.plan?.approvalArtifact).toBe("approved.md");
	});

	it("previews named colors, saves brightgreen and removes the optional field for Default", async () => {
		const first = await open();
		profile(first.setup);
		down(first.setup, 8);
		await first.setup.flush();
		expect(first.setup.captureCharFrame()).toContain("Color: Default");
		const colorRow = first.setup.renderer.root.findDescendantById("settings-mode-color") as TextRenderable;
		expect(colorRow.fg).toEqual(parseColor("#d4d4d8"));
		first.setup.mockInput.pressArrow("left");
		down(first.setup);
		profile(first.setup);
		await first.setup.flush();
		expect(colorRow.fg).toEqual(parseColor("#d4d4d8"));
		first.setup.mockInput.pressArrow("left");
		first.setup.mockInput.pressArrow("up");
		profile(first.setup);
		first.setup.mockInput.pressEnter();
		down(first.setup, MODE_TEXT_COLORS.indexOf("brightgreen") + 1);
		await first.setup.flush();
		expect(first.setup.captureCharFrame()).toContain("Bright green (brightgreen)");
		const preview = first.setup.renderer.root.findDescendantById("settings-mode-color-preview") as TextRenderable;
		expect(preview.fg).toEqual(parseColor("brightgreen"));
		first.setup.mockInput.pressEnter();
		save(first.setup);
		await first.setup.flush();
		expect(first.saved()?.modes?.profiles.plan?.textColor).toBe("brightgreen");
		const second = await open({ configuration: first.saved() });
		profile(second.setup);
		down(second.setup, 8);
		second.setup.mockInput.pressEnter();
		for (let i = 0; i <= MODE_TEXT_COLORS.indexOf("brightgreen"); i++) second.setup.mockInput.pressArrow("up");
		second.setup.mockInput.pressEnter();
		save(second.setup);
		await second.setup.flush();
		expect(Object.hasOwn(second.saved()?.modes?.profiles.plan ?? {}, "textColor")).toBe(false);
	});

	it("shows Add input on short terminals, catches invalid/duplicate names, selects the new mode and prefills Rename", async () => {
		const { setup, saved } = await open({}, 72, 14);
		setup.mockInput.pressKey("a");
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-name-editor");
		expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(InputRenderable);
		expect(setup.captureCharFrame()).toContain("Mode name");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Error:");
		await setup.mockInput.typeText("123");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Invalid mode id");
		clear(setup);
		await setup.mockInput.typeText("PLAN");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("already exists");
		clear(setup);
		await setup.mockInput.typeText("REVIEW");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Profile · REVIEW");
		setup.mockInput.pressKey("n");
		await setup.flush();
		expect((setup.renderer.currentFocusedRenderable as InputRenderable).value).toBe("REVIEW");
		clear(setup);
		await setup.mockInput.typeText("CHECK");
		setup.mockInput.pressEnter();
		save(setup);
		await setup.flush();
		expect(saved()?.modes?.profiles.review?.name).toBe("CHECK");
	});

	it("cancels editors and picker then discards the draft without save callbacks", async () => {
		const { setup, saved, closed, config } = await open({ discoverModeModels: async () => [{ id: "other" }] }, 72, 14);
		const original = structuredClone(config);
		profile(setup);
		down(setup);
		setup.mockInput.pressEnter();
		down(setup, 4);
		setup.mockInput.pressEnter();
		clear(setup);
		await setup.mockInput.typeText("cancelled");
		setup.mockInput.pressEscape();
		setup.mockInput.pressArrow("left");
		setup.mockInput.pressEnter();
		for (let i = 0; i < 5; i++) setup.mockInput.pressArrow("up");
		setup.mockInput.pressEnter();
		await setup.flush();
		setup.mockInput.pressEscape();
		await setup.flush();
		expect(closed()).toBe(0);
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-profile");
		setup.mockInput.pressEscape();
		await setup.flush();
		expect(saved()).toBeUndefined();
		expect(closed()).toBe(1);
		expect(config).toEqual(original);
	});

	it("retains an unavailable explicit model and allows Default despite failed discovery", async () => {
		const { setup, saved } = await open({
			discoverModeModels: async () => {
				throw new Error("offline");
			},
		});
		down(setup);
		profile(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("unavailable");
		expect(setup.captureCharFrame()).toContain("offline");
		down(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Model: missing-model");
		setup.mockInput.pressEnter();
		await setup.flush();
		setup.mockInput.pressEnter();
		await setup.flush();
		save(setup);
		await setup.flush();
		expect(saved()?.modes?.profiles.build?.model).toEqual({ kind: "default" });
	});

	it("keeps every selected field and editor visible on a short terminal and safely cancels invalid artifacts", async () => {
		const { setup, saved } = await open({}, 80, 16);
		profile(setup);
		for (const label of [
			"Model",
			"Repository",
			"Task",
			"Artifacts",
			"Subagents",
			"Prompt",
			"Artifact definitions",
			"Approval indicator",
			"Color",
		]) {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain(`> ${label}:`);
			expect(markers(setup)).toBe(1);
			down(setup);
		}
		setup.mockInput.pressArrow("up");
		setup.mockInput.pressArrow("up");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-artifacts-editor");
		clear(setup);
		await setup.mockInput.typeText("../bad.md — bad");
		setup.mockInput.pressEnter({ ctrl: true });
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Error:");
		expect(setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-artifacts-editor");
		setup.mockInput.pressEscape();
		save(setup);
		await setup.flush();
		expect(saved()?.modes?.profiles.plan?.artifacts).toEqual([{ path: "plan.md", purpose: "plan" }]);
	});

	it("keeps profile selection and prompt staging reachable at 72×14", async () => {
		const { setup, saved } = await open({}, 72, 14);
		profile(setup);
		down(setup, 5);
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("> Prompt:");
		expect(markers(setup)).toBe(1);
		setup.mockInput.pressEnter();
		await setup.flush();
		const editor = setup.renderer.currentFocusedRenderable;
		expect(editor?.id).toBe("settings-mode-prompt-editor");
		expect(editor).toBeInstanceOf(TextareaRenderable);
		if (!(editor instanceof TextareaRenderable)) throw new Error("Expected prompt editor.");
		expect(editor.y).toBeGreaterThan(3);
		expect(editor.y + editor.height).toBeLessThanOrEqual(10);
		clear(setup);
		await setup.mockInput.typeText("short terminal prompt");
		setup.mockInput.pressEnter({ ctrl: true });
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("Prompt: short terminal");
		save(setup);
		await setup.flush();
		expect(saved()?.modes?.profiles.plan?.prompt).toBe("short terminal prompt");
	});

	it("cancels color and approval choices without applying them and keeps failed saves retryable", async () => {
		let attempts = 0;
		let persisted: AgentConfiguration | undefined;
		const { setup, closed } = await open({
			onSave: async (value) => {
				if (++attempts === 1) throw new Error("save rejected");
				persisted = value;
			},
		});
		profile(setup);
		down(setup, 7);
		setup.mockInput.pressEnter();
		setup.mockInput.pressArrow("up");
		setup.mockInput.pressEscape();
		down(setup);
		setup.mockInput.pressEnter();
		down(setup);
		setup.mockInput.pressEscape();
		save(setup);
		await setup.flush();
		expect(closed()).toBe(0);
		expect(setup.captureCharFrame()).toContain("save rejected");
		save(setup);
		await setup.flush();
		expect(closed()).toBe(1);
		expect(persisted?.modes?.profiles.plan?.approvalArtifact).toBe("plan.md");
		expect(Object.hasOwn(persisted?.modes?.profiles.plan ?? {}, "textColor")).toBe(false);
	});

	it("opens Model without discovery, accepts explicit manual Claude IDs, and preserves missing-mode preflight", async () => {
		const { setup, saved } = await open();
		profile(setup);
		setup.mockInput.pressEnter();
		await setup.flush();
		await setup.mockInput.typeText("manual-model");
		setup.mockInput.pressEnter({ ctrl: true });
		await setup.flush();
		save(setup);
		await setup.flush();
		expect(saved()?.modes?.profiles.plan?.model).toEqual({ kind: "explicit", id: "manual-model" });
		const config = configuration();
		delete config.modes;
		const missing = await open({ configuration: config });
		missing.setup.mockInput.pressKey("a");
		await missing.setup.flush();
		expect(missing.setup.captureCharFrame()).toContain("Initialize the project mode catalog");
		expect(missing.saved()).toBeUndefined();
		expect(config.modes).toBeUndefined();
	});
});
