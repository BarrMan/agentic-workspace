import { describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { mountModeDeletionPicker } from "./mode-deletion-picker.ts";
import { modeDeletionDestinations } from "./workspace-settings.ts";

describe("workspace settings mode deletion destinations", () => {
	it("offers persisted remaining modes in the staged order, excluding additions and deletions", () => {
		expect(modeDeletionDestinations(["A", "B"], ["C", "B"], ["A"])).toEqual(["B"]);
	});

	it("keeps an empty move destination list when no persisted mode remains eligible", () => {
		expect(modeDeletionDestinations(["A"], ["C"], ["A"])).toEqual([]);
	});

	it("still offers discard when no move destination is eligible", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(root);
		const picker = mountModeDeletionPicker(setup.renderer, root, { modeId: "A", remainingModeIds: [] });
		try {
			await setup.flush();
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Discard sessions");
			expect(setup.captureCharFrame()).not.toContain("Move to");
		} finally {
			picker.dispose();
			setup.renderer.destroy();
		}
	});
});
