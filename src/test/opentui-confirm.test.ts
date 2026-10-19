import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable, TextRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mountOpenTuiConfirm } from "../renderer/opentui/confirm.ts";

describe("native confirm overlay", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	const setupConfirm = async (message = "Delete this task?") => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const background = new TextRenderable(setup.renderer, { content: "UNDERLYING CONTENT" });
		parent.add(background);
		const modal = mountOpenTuiConfirm(setup.renderer, parent, { message });
		await setup.flush();
		return { setup, parent, modal };
	};

	test("accept resolves true and unmounts", async () => {
		const { setup, parent, modal } = await setupConfirm();
		expect(setup.captureCharFrame()).toContain("Delete this task?");
		expect(setup.captureCharFrame()).toContain(": Yes · ");
		setup.mockInput.pressKey("y");
		await setup.flush();
		expect(await modal.result).toBe(true);
		expect(parent.getChildren()).toHaveLength(1);
		expect(setup.captureCharFrame()).not.toContain("Delete this task?");
	});

	test("decline resolves false", async () => {
		const { setup, parent, modal } = await setupConfirm();
		setup.mockInput.pressEscape();
		await setup.flush();
		expect(await modal.result).toBe(false);
		expect(parent.getChildren()).toHaveLength(1);
		expect(setup.captureCharFrame()).not.toContain("Delete this task?");
	});

	test("dispose resolves false and unmounts", async () => {
		const { setup, parent, modal } = await setupConfirm();
		modal.dispose();
		await setup.flush();
		expect(await modal.result).toBe(false);
		expect(parent.getChildren()).toHaveLength(1);
		expect(setup.captureCharFrame()).not.toContain("Delete this task?");
	});
});
