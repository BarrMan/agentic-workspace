import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { deleteModeFromChoice, mountModeDeletionPicker } from "./mode-deletion-picker.ts";

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

describe("mode deletion choice", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("allows choosing a remaining mode and disposes the picker", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const picker = mountModeDeletionPicker(setup.renderer, parent(setup), {
			modeId: "plan",
			remainingModeIds: ["build"],
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Choose an action");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Discard sessions");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Move to build");
			setup.mockInput.pressKey("s", { ctrl: true });
			expect(await picker.result).toBe("build");
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("Delete mode plan");
		} finally {
			picker.dispose();
		}
	});

	it("resolves cancellation and disposes the picker", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const picker = mountModeDeletionPicker(setup.renderer, parent(setup), {
			modeId: "plan",
			remainingModeIds: ["build"],
		});
		setup.mockInput.pressEscape();
		expect(await picker.result).toBeNull();
		await setup.flush();
		expect(setup.captureCharFrame()).not.toContain("Delete mode plan");
	});

	it("passes the destination for a move and omits it when discarding", async () => {
		const calls: { modeId: string; options: { confirmed: true; moveToModeId?: string } }[] = [];
		const deleteMode = async (modeId: string, options: { confirmed: true; moveToModeId?: string }) => {
			calls.push({ modeId, options });
		};
		await deleteModeFromChoice("plan", async () => "build", deleteMode);
		await deleteModeFromChoice("review", async () => "__discard__", deleteMode);
		expect(calls).toEqual([
			{ modeId: "plan", options: { confirmed: true, moveToModeId: "build" } },
			{ modeId: "review", options: { confirmed: true } },
		]);
	});

	it("does not delete a mode when the choice is cancelled", async () => {
		let deleted = false;
		const result = await deleteModeFromChoice(
			"plan",
			async () => null,
			async () => {
				deleted = true;
			},
		);
		expect(result).toBe(false);
		expect(deleted).toBe(false);
	});
});
