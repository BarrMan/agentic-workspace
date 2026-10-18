import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable, InputRenderable, TextRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { TaskListFilter } from "../types/index.ts";
import {
	mountOpenTuiFilterEditor,
	mountOpenTuiHelpOverlay,
	type OpenTuiFilterState,
	type OpenTuiHelpItem,
} from "../ui/opentui/filters.ts";
import { type ShortcutOverrides, shortcutHelpItems } from "../ui/opentui/keybindings.ts";
import { mountOpenTuiWorkspace } from "../ui/opentui/workspace.ts";

describe("native workspace filters", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	test("captures typing and applies edited choices without triggering workspace shortcuts", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const backgroundActions: string[] = [];
		let modal: ReturnType<typeof mountOpenTuiFilterEditor> | undefined;
		const workspace = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "BACK-1", title: "Task", status: "Todo" }],
			onTaskCreate: () => backgroundActions.push("create"),
			onTaskAction: () => backgroundActions.push("action"),
			onToggleDetails: () => backgroundActions.push("details"),
			onQuit: () => backgroundActions.push("quit"),
			onFilterRequest: () => {
				modal = mountOpenTuiFilterEditor(setup.renderer, parent, {
					initial,
					choices: { status: ["Todo", "Done"] },
					onApply: (filters, taskFilter) => applied.push({ filters, taskFilter }),
				});
			},
		});
		const background = new TextRenderable(setup.renderer, {
			position: "absolute",
			top: 12,
			left: 30,
			content: "UNDERLYING CONTENT",
		});
		parent.add(background);
		const applied: Array<{ filters: OpenTuiFilterState; taskFilter: TaskListFilter }> = [];
		const initial: OpenTuiFilterState = {
			search: "",
			status: ["Todo"],
			type: ["feature"],
			project: ["CLI"],
			priority: "high",
			labels: ["ui"],
			milestone: "Sprint 1",
		};
		try {
			setup.mockInput.pressKey("/");
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("UNDERLYING CONTENT");
			expect(setup.captureCharFrame()).toContain("Search tasks");
			expect(setup.captureCharFrame()).toContain("Status: Todo");
			await setup.mockInput.typeText("new query");
			setup.mockInput.pressTab();
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey(" ");
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressKey(" ");
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(applied).toEqual([
				{
					filters: { ...initial, search: "new query", status: ["Done"] },
					taskFilter: {
						status: ["Done"],
						type: ["feature"],
						project: ["CLI"],
						priority: "high",
						labels: ["ui"],
						labelMatch: "any",
						milestone: "Sprint 1",
					},
				},
			]);
			expect(backgroundActions).toEqual([]);
			expect(initial.search).toBe("");
			expect(initial.status).toEqual(["Todo"]);
		} finally {
			modal?.dispose();
			workspace.dispose();
		}
	});

	test("cancel discards edits while reset clears every filter only after apply", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const initial: OpenTuiFilterState = {
			search: "old",
			status: ["Todo"],
			type: ["feature"],
			project: ["CLI"],
			priority: "high",
			labels: ["ui"],
			milestone: "Sprint 1",
		};
		const applied: OpenTuiFilterState[] = [];
		let cancelled = 0;
		const options = {
			initial,
			onApply: (filters: OpenTuiFilterState) => applied.push(filters),
			onCancel: () => cancelled++,
		};
		let modal = mountOpenTuiFilterEditor(setup.renderer, parent, options);
		try {
			await setup.mockInput.typeText(" changed");
			setup.mockInput.pressEscape();
			expect(cancelled).toBe(1);
			expect(applied).toEqual([]);
			expect(initial.search).toBe("old");
			modal = mountOpenTuiFilterEditor(setup.renderer, parent, options);
			setup.mockInput.pressKey("r", { ctrl: true });
			expect(applied).toEqual([]);
			setup.mockInput.pressEnter();
			expect(applied).toEqual([
				{ search: "", status: [], type: [], project: [], priority: "", labels: [], milestone: "" },
			]);
		} finally {
			modal.dispose();
		}
	});
});

describe("native shortcut help", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	const shortcutRow = (parent: BoxRenderable, index: number) => {
		const root = parent.findDescendantById(`shortcut-row-${index}`);
		if (!(root instanceof BoxRenderable)) throw new Error(`Missing shortcut row ${index}`);
		const cell = root.getChildren()[1];
		const description = root.getChildren()[2];
		if (!(cell instanceof BoxRenderable) || !(description instanceof TextRenderable)) {
			throw new Error(`Missing shortcut columns in row ${index}`);
		}
		const binding = cell.getChildren()[0];
		if (!(binding instanceof TextRenderable)) throw new Error(`Missing shortcut text in row ${index}`);
		return { root, cell, binding, description };
	};
	const pendingInput = (setup: TestRendererSetup): InputRenderable => {
		const focused = setup.renderer.currentFocusedRenderable;
		if (!(focused instanceof InputRenderable)) throw new Error("Pending shortcut input must own focus");
		expect(focused.value).toBe("");
		expect(focused.cursorOffset).toBe(0);
		expect(focused.showCursor).toBe(true);
		return focused;
	};

	for (const [width, height, finish, ctrl] of [
		[120, 40, "second stroke", false],
		[80, 24, "Escape", false],
		[80, 24, "second stroke", true],
		[120, 40, "Escape", true],
	] as const) {
		const stroke = ctrl ? "Ctrl+Shift+F" : "Shift+F";
		test(`keeps measured columns and moves native pending focus at ${width}x${height} through ${stroke} and ${finish}`, async () => {
			const setup = await createTestRenderer({ width, height, kittyKeyboard: true });
			renderers.push(setup);
			const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
			setup.renderer.root.add(parent);
			const background = new BoxRenderable(setup.renderer, { width: 1, height: 1, focusable: true });
			parent.add(background);
			background.focus();
			const persisted: ShortcutOverrides[] = [];
			const help = mountOpenTuiHelpOverlay(setup.renderer, parent, {
				items: [
					{ shortcut: { id: "test.first", keys: [{ key: "f1" }] }, description: "First action" },
					{ shortcut: { id: "test.second", keys: [{ key: "f2" }] }, description: "Second action" },
				],
				onOverridesChange: (next) => {
					persisted.push(next);
				},
			});
			const checkColumns = (): number => {
				const first = shortcutRow(parent, 0);
				const second = shortcutRow(parent, 1);
				expect(first.cell.width).toBe(second.cell.width);
				expect(first.description.screenX).toBe(second.description.screenX);
				expect(first.description.width).toBeGreaterThanOrEqual("Second action".length);
				const frame = setup.captureCharFrame();
				for (const description of ["First action", "Second action"]) {
					const line = frame.split("\n").find((line) => line.includes(description));
					expect(line?.indexOf(description)).toBe(first.description.screenX);
				}
				return first.description.screenX;
			};
			try {
				await setup.flush();
				const descriptionX = checkColumns();
				const columnWidth = shortcutRow(parent, 0).cell.width;
				setup.mockInput.pressEnter();
				await setup.flush();
				expect(checkColumns()).toBe(descriptionX);
				const pending = pendingInput(setup);
				expect(pending.screenX).toBe(shortcutRow(parent, 0).binding.screenX);
				expect(setup.captureCharFrame()).toContain("Press key...");
				const initialInputX = pending.screenX;

				setup.mockInput.pressKey("f", { ctrl, shift: true });
				await setup.flush();
				const first = shortcutRow(parent, 0);
				expect(first.binding.plainText).toBe(`${stroke}, `);
				expect(first.binding.width).toBeGreaterThanOrEqual(Bun.stringWidth(`${stroke}, `));
				const captureLine = setup
					.captureCharFrame()
					.split("\n")
					.find((line) => line.includes("First action"));
				expect(captureLine).toContain(`${stroke}, Press key...`);
				expect(pendingInput(setup)).toBe(pending);
				expect(pending.screenX).toBe(initialInputX + Bun.stringWidth(first.binding.plainText));
				expect(pending.screenX + pending.width).toBeLessThan(descriptionX);
				expect(checkColumns()).toBe(descriptionX);
				expect(first.cell.width).toBe(columnWidth);
				await setup.mockInput.pasteBracketedText("must not edit shortcut");
				await setup.flush();
				expect(pendingInput(setup)).toBe(pending);
				expect(first.binding.plainText).toBe(`${stroke}, `);

				const resizedWidth = width === 120 ? 80 : 120;
				setup.resize(resizedWidth, resizedWidth === 80 ? 24 : 40);
				await setup.flush();
				const resizedX = checkColumns();
				expect(pendingInput(setup)).toBe(pending);
				expect(pending.screenX + pending.width).toBeLessThan(resizedX);
				expect(setup.captureCharFrame()).toContain("Press key...");
				expect(first.binding.width).toBeGreaterThanOrEqual(Bun.stringWidth(`${stroke}, `));
				const resizedLine = setup
					.captureCharFrame()
					.split("\n")
					.find((line) => line.includes("First action"));
				expect(resizedLine).toContain(`${stroke}, Press key...`);
				setup.resize(width, height);
				await setup.flush();
				expect(checkColumns()).toBe(descriptionX);

				if (finish === "Escape") setup.mockInput.pressEscape();
				else setup.mockInput.pressKey("x");
				await setup.flush();
				expect(pending.isDestroyed).toBe(true);
				expect(setup.renderer.currentFocusedRenderable).not.toBeInstanceOf(InputRenderable);
				const expectedBinding = finish === "Escape" ? stroke : `${stroke}, X`;
				expect(first.binding.plainText).toBe(expectedBinding);
				expect(checkColumns()).toBe(descriptionX);
				expect(setup.captureCharFrame()).not.toContain("Press key...");
				expect(setup.captureCharFrame()).toContain("Save");
				expect(setup.captureCharFrame()).toContain("Discard");
				setup.mockInput.pressEnter();
				await setup.flush();
				expect(persisted).toEqual([
					{
						"test.first": {
							sequence: [
								{ key: "f", shift: true, ...(ctrl ? { ctrl: true } : {}) },
								...(finish === "Escape" ? [] : [{ key: "x" }]),
							],
						},
					},
				]);
				expect(first.binding.plainText).toBe(expectedBinding);
				expect(checkColumns()).toBe(descriptionX);
				help.dispose();
				expect(setup.renderer.currentFocusedRenderable).toBe(background);
			} finally {
				help.dispose();
			}
		});
	}
	test("records, confirms, persists, and dispatches an ordered shortcut sequence", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		let overrides: ShortcutOverrides = {};
		const persisted: ShortcutOverrides[] = [];
		const actions: string[] = [];
		let workspace = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "BACK-1", title: "Task", status: "Todo" }],
			onTaskCreate: () => actions.push("create"),
			onQuit: () => actions.push("quit"),
		});
		const help = mountOpenTuiHelpOverlay(setup.renderer, parent, {
			items: shortcutHelpItems("workspace"),
			overrides,
			onOverridesChange: (next) => {
				overrides = JSON.parse(JSON.stringify(next));
				persisted.push(overrides);
			},
		});
		try {
			setup.mockInput.pressKey("/");
			await setup.mockInput.typeText("create task");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Press key...");
			setup.mockInput.pressKey("b", { ctrl: true });
			await setup.flush();
			expect(shortcutRow(parent, 0).binding.plainText).toBe("Ctrl+B, ");
			pendingInput(setup);
			expect(actions).toEqual([]);
			setup.mockInput.pressKey("d");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Confirm selection");
			expect(setup.captureCharFrame()).toContain("Discard");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(persisted).toEqual([
				{
					"workspace.createTask": {
						sequence: [{ key: "b", ctrl: true }, { key: "d" }],
					},
				},
			]);
			help.dispose();
			workspace.dispose();
			workspace = mountOpenTuiWorkspace(setup.renderer, parent, {
				tasks: [{ id: "BACK-1", title: "Task", status: "Todo" }],
				keyboardOverrides: overrides,
				onTaskCreate: () => actions.push("create"),
			});
			setup.mockInput.pressKey("b", { ctrl: true });
			expect(actions).toEqual([]);
			setup.mockInput.pressKey("d");
			expect(actions).toEqual(["create"]);
		} finally {
			help.dispose();
			workspace.dispose();
		}
	});

	test("keeps capture inline after filtering, scrolling, and resize, and navigates footer actions", async () => {
		const setup = await createTestRenderer({ width: 100, height: 16, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const persisted: ShortcutOverrides[] = [];
		const items: OpenTuiHelpItem[] = Array.from({ length: 12 }, (_, index) => ({
			shortcut: { id: `test.${index}`, keys: [{ key: `f${index + 1}` }] },
			description: `Group shortcut ${index}`,
		}));
		const help = mountOpenTuiHelpOverlay(setup.renderer, parent, {
			items,
			onOverridesChange: (next) => {
				persisted.push(next);
			},
		});
		try {
			setup.mockInput.pressKey("/");
			await setup.mockInput.typeText("group");
			setup.resize(60, 12);
			for (let index = 0; index < 8; index += 1) setup.mockInput.pressArrow("down");
			setup.mockInput.pressEnter();
			await setup.flush();
			const captureFrame = setup.captureCharFrame();
			const captureLine = captureFrame.split("\n").find((line) => line.includes("Press key..."));
			const selectedLine = captureFrame.split("\n").find((line) => line.includes("Group shortcut 8"));
			expect(captureFrame).not.toContain("Group shortcut 0");
			expect(captureLine).toBe(selectedLine);
			expect(captureLine).toContain("> Press key...");
			setup.mockInput.pressKey("x");
			await setup.flush();
			expect(shortcutRow(parent, 8).binding.plainText).toBe("X, ");
			pendingInput(setup);
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Confirm selection");
			expect(setup.renderer.currentFocusedRenderable).not.toBeInstanceOf(InputRenderable);
			expect(shortcutRow(parent, 8).binding.plainText).toBe("X");
			expect(setup.captureCharFrame()).toContain("Discard");
			setup.mockInput.pressArrow("right");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Discard");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(persisted).toEqual([]);
		} finally {
			help.dispose();
		}
	});

	test("records Escape as a binding and preserves the previous binding when discarded", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const original: ShortcutOverrides = {
			"workspace.historyBack": { sequence: [{ key: "z" }] },
		};
		const saved: ShortcutOverrides[] = [];
		const actions: string[] = [];
		let workspace = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [],
			onQuit: () => actions.push("quit"),
			onHistoryBack: () => actions.push("back"),
		});
		const help = mountOpenTuiHelpOverlay(setup.renderer, parent, {
			items: shortcutHelpItems("workspace"),
			overrides: original,
			onOverridesChange: (next) => {
				saved.push(next);
			},
		});
		try {
			setup.mockInput.pressKey("/");
			await setup.mockInput.typeText("Go back in navigation history");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Press key...");
			setup.mockInput.pressEscape();
			setup.mockInput.pressEscape();
			await setup.flush();
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(saved).toEqual([]);
			expect(original).toEqual({ "workspace.historyBack": { sequence: [{ key: "z" }] } });
			expect(actions).toEqual([]);
			setup.mockInput.pressEnter();
			setup.mockInput.pressEscape();
			setup.mockInput.pressEscape();
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(saved).toEqual([{ "workspace.historyBack": { sequence: [{ key: "escape" }] } }]);
			help.dispose();
			workspace.dispose();
			workspace = mountOpenTuiWorkspace(setup.renderer, parent, {
				tasks: [],
				keyboardOverrides: saved[0],
				onHistoryBack: () => actions.push("back"),
			});
			setup.mockInput.pressEscape();
			expect(actions).toEqual(["back"]);
		} finally {
			help.dispose();
			workspace.dispose();
		}
	});

	test("reports failed persistence without replacing a binding", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		let attempts = 0;
		const original: ShortcutOverrides = { "workspace.fullscreen": { sequence: [{ key: "z" }] } };
		const help = mountOpenTuiHelpOverlay(setup.renderer, parent, {
			items: shortcutHelpItems("workspace"),
			overrides: original,
			onOverridesChange: async () => {
				attempts += 1;
				throw new Error("disk full");
			},
		});
		try {
			setup.mockInput.pressKey("/");
			await setup.mockInput.typeText("fullscreen");
			setup.mockInput.pressEnter();
			setup.mockInput.pressKey("x", { ctrl: true });
			setup.mockInput.pressEscape();
			await setup.flush();
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(attempts).toBe(1);
			expect(setup.captureCharFrame()).toContain("Could not save shortcut: disk full");
			expect(original).toEqual({ "workspace.fullscreen": { sequence: [{ key: "z" }] } });
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("Ctrl+X");
		} finally {
			help.dispose();
		}
	});

	test("keeps string-only help searchable and read-only", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const help = mountOpenTuiHelpOverlay(setup.renderer, parent, {
			items: [{ keys: "Tab", description: "Switch view" }],
		});
		try {
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("read-only");
			setup.mockInput.pressKey("/");
			await setup.mockInput.typeText("tab");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Switch view");
		} finally {
			help.dispose();
		}
	});
});
