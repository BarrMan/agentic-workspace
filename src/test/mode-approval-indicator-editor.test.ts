import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentConfiguration } from "../model/session/types.ts";
import { mountOpenTuiAgentSettings } from "../renderer/opentui/agent-settings.ts";

function configuration(): AgentConfiguration {
	return {
		selectedPreset: "work",
		presets: { work: { command: ["agent", "{prompt}"], env: {}, prepare: "", bootstrap: "claude" } },
		sessions: { worktreePerTask: true, yoloMode: false },
		modes: {
			version: 1,
			defaultModeId: "plan",
			order: ["plan"],
			profiles: {
				plan: {
					name: "PLAN",
					model: { kind: "default" },
					prompt: "plan prompt",
					permissions: { repository: "read", task: "read", artifacts: "read-write", subagents: "allowed" },
					artifacts: [{ path: "plan.md", purpose: "declared plan" }],
				},
			},
		},
	};
}

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

const renderers: TestRendererSetup[] = [];
afterEach(() => {
	for (const setup of renderers.splice(0)) setup.renderer.destroy();
});

async function openIndicatorField(
	setup: TestRendererSetup,
	config: AgentConfiguration,
	onSave: (value: AgentConfiguration) => void,
) {
	const mount = mountOpenTuiAgentSettings(setup.renderer, parent(setup), {
		configuration: config,
		onSave: async () => {},
		onSaveModeSettings: async ({ configuration: saved }) => onSave(structuredClone(saved)),
		onClose: () => {},
	});
	for (let index = 0; index < 2; index++) {
		setup.mockInput.pressArrow("down");
		await setup.flush();
	}
	for (let index = 0; index < 2; index++) {
		setup.mockInput.pressArrow("right");
		await setup.flush();
	}
	for (let index = 0; index < 7; index++) {
		setup.mockInput.pressArrow("down");
		await setup.flush();
	}
	return mount;
}

async function pressEnter(setup: TestRendererSetup): Promise<void> {
	setup.mockInput.pressEnter();
	await setup.flush();
}

async function pressDown(setup: TestRendererSetup): Promise<void> {
	setup.mockInput.pressArrow("down");
	await setup.flush();
}

async function pasteFocusedInput(setup: TestRendererSetup, text: string): Promise<void> {
	await setup.mockInput.pasteBracketedText(text);
	await setup.flush();
}

async function replaceInputText(setup: TestRendererSetup, currentText: string, nextText: string): Promise<void> {
	setup.mockInput.pressKey("HOME");
	await setup.flush();
	for (let index = 0; index < currentText.length; index++) {
		setup.mockInput.pressKey("DELETE");
		await setup.flush();
	}
	await pasteFocusedInput(setup, nextText);
}

describe("Modes approval indicator editor", () => {
	it("edits None, declared, and custom paths through the settings UI, while rejecting unsafe paths", async () => {
		const setup = await createTestRenderer({ width: 120, height: 36, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		const saved: AgentConfiguration[] = [];
		const mount = await openIndicatorField(setup, config, (value) => saved.push(value));
		try {
			expect(setup.captureCharFrame()).toContain("Approval indicator: None");
			await pressEnter(setup);
			await pressDown(setup);
			await pressEnter(setup);
			expect(setup.captureCharFrame()).toContain("Approval indicator: plan.md");
			await pressEnter(setup);
			await pressDown(setup);
			await pressEnter(setup);
			expect(setup.renderer.currentFocusedRenderable?.constructor.name).toBe("InputRenderable");
			await replaceInputText(setup, "plan.md", "review/results.md");
			await pressEnter(setup);
			expect(setup.captureCharFrame()).toContain("Approval indicator: review/results.md");
			expect(saved).toHaveLength(0);
			await pressEnter(setup);
			await pressEnter(setup);
			expect(setup.renderer.currentFocusedRenderable?.constructor.name).toBe("InputRenderable");
			await replaceInputText(setup, "review/results.md", "../outside.md");
			await pressEnter(setup);
			expect(setup.captureCharFrame()).toContain("Approval indicator: review/results.md");
			expect(setup.captureCharFrame()).toContain("Invalid task artifact path");
			await pressEscape(setup);
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(saved[0]?.modes?.profiles.plan?.approvalArtifact).toBe("review/results.md");
			expect(config).toEqual(original);
		} finally {
			mount.dispose();
		}
	});

	it("rejects reserved paths and traversal and discards edits with Escape without mutating files", async () => {
		const setup = await createTestRenderer({ width: 120, height: 36, kittyKeyboard: true });
		renderers.push(setup);
		const config = configuration();
		const original = structuredClone(config);
		let saves = 0;
		const mount = await openIndicatorField(setup, config, () => saves++);
		try {
			for (const path of ["task.md", ".artifacts.json", "folder/../outside.md"]) {
				await pressEnter(setup);
				await pressDown(setup);
				await pressDown(setup);
				await pressEnter(setup);
				expect(setup.renderer.currentFocusedRenderable?.constructor.name).toBe("InputRenderable");
				await pasteFocusedInput(setup, path);
				await pressEnter(setup);
				expect(setup.captureCharFrame()).toContain("Invalid task artifact path");
				await pressEscape(setup);
				expect(setup.captureCharFrame()).toContain("Approval indicator: None");
			}
			await pressEnter(setup);
			await pressDown(setup);
			await pressEnter(setup);
			expect(setup.captureCharFrame()).toContain("Approval indicator: plan.md");
			expect(saves).toBe(0);
			expect(config).toEqual(original);
			await pressEscape(setup);
			expect(config).toEqual(original);
		} finally {
			mount.dispose();
		}
	});
});

async function pressEscape(setup: TestRendererSetup): Promise<void> {
	setup.mockInput.pressEscape();
	await setup.flush();
}
