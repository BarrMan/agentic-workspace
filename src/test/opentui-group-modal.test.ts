import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mountOpenTuiGroupModal, type OpenTuiGroupModalOptions } from "../renderer/opentui/group-modal.ts";

type Created = { name: string; parentGroupId: string | null };

describe("native group modal", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	const setupModal = async (overrides: Partial<OpenTuiGroupModalOptions> = {}) => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const created: Created[] = [];
		let cancelled = 0;
		const modal = mountOpenTuiGroupModal(setup.renderer, parent, {
			defaultRoot: false,
			parentGroupId: "BACK-1",
			parentGroupName: "Parent",
			onCreate: (input) => {
				created.push(input);
			},
			onCancel: () => {
				cancelled += 1;
			},
			...overrides,
		});
		await setup.flush();
		return { setup, parent, modal, created, cancelled: () => cancelled };
	};

	test("renders the title, root toggle, and name input", async () => {
		const { setup, modal } = await setupModal();
		try {
			const frame = setup.captureCharFrame();
			expect(frame).toContain("Create Group");
			expect(frame).toContain('[ ] Root (uncheck to nest inside "Parent")');
			expect(frame).toContain("Name *");
			expect(frame).toContain("Group name");
		} finally {
			modal.dispose();
		}
	});

	test("defaults root unchecked and submits the parent group id", async () => {
		const { setup, modal, created } = await setupModal();
		try {
			expect(setup.captureCharFrame()).toContain("[ ] Root");
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Child");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(created).toEqual([{ name: "Child", parentGroupId: "BACK-1" }]);
		} finally {
			modal.dispose();
		}
	});

	test("defaults root checked when no parent is available and submits null", async () => {
		const { setup, modal, created } = await setupModal({ defaultRoot: true, parentGroupId: null });
		try {
			expect(setup.captureCharFrame()).toContain("[x] Root");
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Top");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(created).toEqual([{ name: "Top", parentGroupId: null }]);
		} finally {
			modal.dispose();
		}
	});

	test("Space toggles root and submits without a parent", async () => {
		const { setup, modal, created } = await setupModal({ defaultRoot: false });
		try {
			expect(setup.captureCharFrame()).toContain("[ ] Root");
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("[x] Root");
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Loose");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(created).toEqual([{ name: "Loose", parentGroupId: null }]);
		} finally {
			modal.dispose();
		}
	});

	test("rejects an empty name", async () => {
		const { setup, modal, created } = await setupModal();
		try {
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(created).toEqual([]);
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
