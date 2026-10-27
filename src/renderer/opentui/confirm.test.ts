import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable, TextRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mountOpenTuiConfirm } from "./confirm.ts";

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

	test("accept uses the displayed Enter binding and unmounts", async () => {
		const { setup, parent, modal } = await setupConfirm();
		const frame = setup.captureCharFrame();
		expect(frame).toContain("Delete this task?");
		expect(frame).toContain("Enter: Yes · Esc: No");
		setup.mockInput.pressKey("y");
		await setup.flush();
		expect(parent.getChildren()).toHaveLength(3);
		setup.mockInput.pressEnter();
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
