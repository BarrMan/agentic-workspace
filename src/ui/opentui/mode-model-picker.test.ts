import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { type ModeModelOption, mountOpenTuiModeModelPicker } from "./mode-model-picker.ts";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (cause: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

describe("mode model picker public behavior", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	async function mount(options: Parameters<typeof mountOpenTuiModeModelPicker>[2]) {
		const setup = await createTestRenderer({ width: 100, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const picker = mountOpenTuiModeModelPicker(setup.renderer, parent, options);
		await setup.flush();
		return { setup, picker };
	}

	const scope = { harness: "opencode", preset: "custom" };

	test("Default stays selectable during loading and when discovery is empty", async () => {
		const pending = deferred<readonly ModeModelOption[]>();
		const selected: (string | undefined)[] = [];
		const { setup } = await mount({
			...scope,
			discover: () => pending.promise,
			onSelect: async (id) => {
				selected.push(id);
			},
			onClose: () => {},
		});
		expect(setup.captureCharFrame()).toContain("Discovering models");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(selected).toEqual([undefined]);
		pending.resolve([]);
	});

	test("displays discovery failures while keeping Default available", async () => {
		const { setup } = await mount({
			...scope,
			discover: async () => {
				throw new Error("offline");
			},
			onSelect: async () => {},
			onClose: () => {},
		});
		expect(setup.captureCharFrame()).toContain("Discovery failed: offline");
		expect(setup.captureCharFrame()).toContain("Default remains selectable");
	});

	test("lists searchable model IDs and selects the canonical discovered ID", async () => {
		const selected: (string | undefined)[] = [];
		const { setup } = await mount({
			...scope,
			discover: async () => [{ id: "provider/claude-sonnet-4", label: "Sonnet" }, { id: "provider/other" }],
			onSelect: async (id) => {
				selected.push(id);
			},
			onClose: () => {},
		});
		expect(setup.captureCharFrame()).toContain("provider/claude-sonnet-4");
		setup.mockInput.pressArrow("down");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(selected).toEqual(["provider/claude-sonnet-4"]);
	});

	test("allows a manual Claude model ID via Ctrl+Enter", async () => {
		const selected: (string | undefined)[] = [];
		const { setup } = await mount({
			harness: "Claude Code",
			preset: "custom",
			allowManualModel: true,
			discover: async () => [],
			onSelect: async (id) => {
				selected.push(id);
			},
			onClose: () => {},
		});
		await setup.mockInput.typeText("claude-opus-4-custom");
		setup.mockInput.pressEnter({ ctrl: true });
		await setup.flush();
		expect(selected).toEqual(["claude-opus-4-custom"]);
	});

	test("retains an unavailable explicit model as editable text without substitution", async () => {
		const selected: (string | undefined)[] = [];
		const { setup } = await mount({
			...scope,
			selectedModel: "missing/model-id",
			discover: async () => [{ id: "available/model" }],
			onSelect: async (id) => {
				selected.push(id);
			},
			onClose: () => {},
		});
		expect(setup.captureCharFrame()).toContain("missing/model-id");
		expect(setup.captureCharFrame()).toContain("unavailable");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(selected).toEqual([undefined]);
	});

	test("ignores stale discovery after scope refresh and emits the newly selected choice", async () => {
		const stale = deferred<readonly ModeModelOption[]>();
		const chosen: (string | undefined)[] = [];
		const currentScope = { ...scope };
		const { setup, picker } = await mount({
			...currentScope,
			discover: ({ preset }) => (preset === "first" ? stale.promise : Promise.resolve([{ id: "new/model" }])),
			onSelect: async (id) => {
				chosen.push(id);
			},
			onClose: () => {},
		});
		currentScope.preset = "second";
		await picker.refresh();
		stale.resolve([{ id: "stale/model" }]);
		await setup.flush();
		expect(setup.captureCharFrame()).toContain("new/model");
		expect(setup.captureCharFrame()).not.toContain("stale/model");
		setup.mockInput.pressArrow("down");
		setup.mockInput.pressEnter();
		await setup.flush();
		expect(chosen).toEqual(["new/model"]);
	});

	test("cancel restores prior focus, calls close once, and late results cannot update disposed UI", async () => {
		const pending = deferred<readonly ModeModelOption[]>();
		const setup = await createTestRenderer({ width: 100, height: 32, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const focus = new BoxRenderable(setup.renderer, { focusable: true });
		parent.add(focus);
		focus.focus();
		let closed = 0;
		const picker = mountOpenTuiModeModelPicker(setup.renderer, parent, {
			...scope,
			discover: () => pending.promise,
			onSelect: async () => {},
			onClose: () => {
				closed++;
			},
		});
		setup.mockInput.pressEscape();
		await setup.flush();
		expect(setup.renderer.currentFocusedRenderable).toBe(focus);
		expect(closed).toBe(1);
		pending.resolve([{ id: "late/model" }]);
		await picker.refresh();
		await setup.flush();
		expect(setup.captureCharFrame()).not.toContain("late/model");
		expect(closed).toBe(1);
	});
});
