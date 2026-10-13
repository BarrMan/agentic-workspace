import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable, TextareaRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { getDefaultModeCatalog } from "../agent-workspace/config.ts";
import type { AgentConfiguration } from "../agent-workspace/types.ts";
import { mountOpenTuiAgentSettings, parseModeArtifactDefinitions } from "../ui/opentui/agent-settings.ts";

function configuration(): AgentConfiguration {
	const modes = getDefaultModeCatalog();
	const plan = modes.profiles.plan;
	expect(plan).toBeDefined();
	if (plan) plan.prompt = "original prompt";
	return {
		selectedPreset: "work",
		presets: {
			work: { command: "agent {prompt}", env: { TOKEN: "kept" }, prepare: "prepare", bootstrap: "claude" },
		},
		sessions: { worktreePerTask: false, yoloMode: false },
		modes,
	};
}

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

async function pasteFocusedTextarea(setup: TestRendererSetup, text: string): Promise<void> {
	await setup.mockInput.pasteBracketedText(text);
	await setup.flush();
}

describe("mode multiline editor contract", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("delivers native bracketed paste to a focused textarea through the test renderer", async () => {
		const setup = await createTestRenderer({ width: 80, height: 12 });
		renderers.push(setup);
		const input = new TextareaRenderable(setup.renderer, {
			width: 60,
			height: 6,
			keyBindings: [{ name: "return", action: "newline" }],
		});
		setup.renderer.root.add(input);
		input.focus();
		try {
			expect(setup.renderer.currentFocusedRenderable).toBe(input);
			await setup.mockInput.pasteBracketedText("native\npaste");
			await setup.flush();
			expect(input.plainText).toBe("native\npaste");
		} finally {
			input.destroy();
		}
	});

	it("parses multiple artifact path/purpose rows and rejects reserved and traversing paths", () => {
		expect(parseModeArtifactDefinitions("notes/plan.md — planning notes\nreports/final.md — final result")).toEqual([
			{ path: "notes/plan.md", purpose: "planning notes" },
			{ path: "reports/final.md", purpose: "final result" },
		]);
		for (const path of ["task.md", ".artifacts.json"]) {
			expect(() => parseModeArtifactDefinitions(`${path} — reserved`)).toThrow("reserved path");
		}
		for (const path of ["../outside.md", "notes/../../outside.md"]) {
			expect(() => parseModeArtifactDefinitions(`${path} — unsafe`)).toThrow("invalid relative path");
		}
	});

	it("edits multiline raw prompts, saves exact text, and Escape discards uncommitted text", async () => {
		const setup = await createTestRenderer({ width: 120, height: 36, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		let saved: AgentConfiguration | undefined;
		const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
			configuration: config,
			onSave: async () => {},
			onSaveModeSettings: async (plan) => {
				saved = structuredClone(plan.configuration);
			},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("right");
			await setup.flush();
			setup.mockInput.pressArrow("right");
			await setup.flush();
			for (let index = 0; index < 5; index += 1) {
				setup.mockInput.pressArrow("down");
				await setup.flush();
			}
			expect(setup.captureCharFrame()).toContain("> Prompt:");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.renderer.currentFocusedRenderable instanceof TextareaRenderable).toBe(true);
			setup.mockInput.pressKey("END");
			await pasteFocusedTextarea(setup, "\nFirst line\nSecond line\nThird line");
			setup.mockInput.pressEnter({ ctrl: true });
			await setup.flush();
			expect(setup.renderer.currentFocusedRenderable instanceof BoxRenderable).toBe(true);
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.modes?.profiles.plan?.prompt).toBe("original prompt\nFirst line\nSecond line\nThird line");
			expect(saved?.modes?.profiles.plan?.prompt).not.toContain("\\n");

			setup.mockInput.pressEnter();
			await setup.flush();
			setup.mockInput.pressKey("END");
			await pasteFocusedTextarea(setup, "\nDiscard this");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("Discard this");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved?.modes?.profiles.plan?.prompt).toBe("original prompt\nFirst line\nSecond line\nThird line");
		} finally {
			mount.dispose();
		}
	});
});
