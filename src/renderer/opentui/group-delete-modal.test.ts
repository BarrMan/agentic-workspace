import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mountOpenTuiGroupDeleteModal, type OpenTuiGroupDeleteModalOptions } from "./group-delete-modal.ts";

describe("native group delete modal", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	const setupModal = async (overrides: Partial<OpenTuiGroupDeleteModalOptions> = {}) => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const confirmed: (string | null)[] = [];
		let cancelled = 0;
		const modal = mountOpenTuiGroupDeleteModal(setup.renderer, parent, {
			groupId: "BACK-17",
			groupName: "Group",
			taskCount: 2,
			childGroupCount: 1,
			destinationOptions: [{ label: "Parent", value: "BACK-1" }],
			defaultDestinationId: "BACK-1",
			onConfirm: (destination) => {
				confirmed.push(destination);
			},
			onCancel: () => {
				cancelled += 1;
			},
			...overrides,
		});
		await setup.flush();
		return { setup, modal, confirmed, cancelled: () => cancelled };
	};

	test("Root selected submits null", async () => {
		const { setup, modal, confirmed } = await setupModal({ defaultDestinationId: null });
		try {
			expect(setup.captureCharFrame()).toContain("[x] Root");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(confirmed).toEqual([null]);
		} finally {
			modal.dispose();
		}
	});

	test("Root unchecked with selected group submits its id", async () => {
		const { setup, modal, confirmed } = await setupModal();
		try {
			expect(setup.captureCharFrame()).toContain("[ ] Root");
			expect(setup.captureCharFrame()).toContain("Parent");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(confirmed).toEqual(["BACK-1"]);
		} finally {
			modal.dispose();
		}
	});

	test("defaults destination selection from defaultDestinationId", async () => {
		const { setup, modal } = await setupModal({
			destinationOptions: [
				{ label: "Parent", value: "BACK-1" },
				{ label: "Other", value: "BACK-2" },
			],
			defaultDestinationId: "BACK-2",
		});
		try {
			expect(setup.captureCharFrame()).toContain("Other");
		} finally {
			modal.dispose();
		}
	});

	test("offers only Root when there are no destinations", async () => {
		const { setup, modal, confirmed } = await setupModal({ destinationOptions: [], defaultDestinationId: null });
		try {
			expect(setup.captureCharFrame()).toContain("[x] Root");
			expect(setup.captureCharFrame()).not.toContain("Move into");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(confirmed).toEqual([null]);
		} finally {
			modal.dispose();
		}
	});

	test("Escape cancels", async () => {
		const { setup, modal, cancelled } = await setupModal();
		try {
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(cancelled()).toBe(1);
		} finally {
			modal.dispose();
		}
	});
});
