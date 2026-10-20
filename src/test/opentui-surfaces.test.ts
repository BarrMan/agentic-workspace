import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { Task } from "../model/types.ts";
import { Board } from "../renderer/opentui/board/models/board.ts";
import { mountOpenTuiBoard } from "../renderer/opentui/board.ts";
import { mountOpenTuiWorkspace } from "../renderer/opentui/workspace.ts";

function task(id: string, status = "Todo"): Task {
	return { id, title: `Task ${id}`, status, createdDate: "2026-01-01", labels: [], dependencies: [] };
}

function attachSurfaceParent(setup: TestRendererSetup): BoxRenderable {
	const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(parent);
	return parent;
}

describe("OpenTUI surfaces", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	test("board keeps selected cards visible across long lanes and narrow screens", async () => {
		const setup = await createTestRenderer({ width: 45, height: 12 });
		renderers.push(setup);
		const tasks = Array.from({ length: 30 }, (_, index) => task(`BACK-${index + 1}`));
		tasks.push(task("BACK-31", "Doing"), task("BACK-32", "Done"));
		const board = new Board({ tasks, statuses: ["Todo", "Doing", "Done"] });
		const selected: string[] = [];
		const mount = mountOpenTuiBoard(setup.renderer, attachSurfaceParent(setup), {
			board,
			onTaskSelect: (candidate) => selected.push(candidate.id),
		});
		try {
			await setup.flush();
			setup.mockInput.pressKey("END");
			await setup.flush();
			expect(board.selectedTask?.id).toBe("BACK-1");
			expect(
				setup
					.captureCharFrame()
					.split("\n")
					.slice(1, setup.renderer.height - 2)
					.join("\n"),
			).toContain("BACK-1");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(selected).toEqual(["BACK-32"]);
			expect(
				setup
					.captureCharFrame()
					.split("\n")
					.slice(1, setup.renderer.height - 2)
					.join("\n"),
			).toContain("BACK-32");
		} finally {
			mount.dispose();
		}
	});

	test("task-pane collapse preserves selection and independent details visibility", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = attachSurfaceParent(setup);
		const tasks = [
			{ id: "BACK-1", title: "First", status: "Todo", description: "First task details" },
			{ id: "BACK-2", title: "Second", status: "Todo", description: "Second task details" },
		];
		let selectedTaskIndex = 0;
		let taskPaneVisible = true;
		let detailsVisible = true;
		const options = {
			tasks,
			onTaskSelect: (candidate: { id: string }) => {
				selectedTaskIndex = tasks.findIndex((task) => task.id === candidate.id);
			},
			onToggleTaskPane: (visible: boolean) => {
				taskPaneVisible = visible;
			},
			onToggleDetails: (visible: boolean) => {
				detailsVisible = visible;
			},
		};
		let mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressKey("[", { shift: true });
			await setup.flush();
			expect(taskPaneVisible).toBe(false);
			expect(selectedTaskIndex).toBe(1);
			expect(setup.captureCharFrame()).not.toContain("First");
			expect(setup.captureCharFrame()).toContain("Second task details");
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(detailsVisible).toBe(false);
			expect(setup.captureCharFrame()).not.toContain("Second task details");
			mount.dispose();
			mount = mountOpenTuiWorkspace(setup.renderer, parent, {
				...options,
				selectedTaskIndex,
				taskPaneVisible,
				detailsVisible,
			});
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("BACK-2");
			setup.mockInput.pressKey("[", { shift: true });
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(taskPaneVisible).toBe(true);
			expect(setup.captureCharFrame()).toContain("Second task details");
		} finally {
			mount.dispose();
		}
	});

	test("uses persisted task-pane override after remount without matching default Shift+[", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true });
		renderers.push(setup);
		const parent = attachSurfaceParent(setup);
		const tasks = [{ id: "BACK-1", title: "First", status: "Todo", description: "First task details" }];
		let taskPaneVisible = true;
		const options = {
			tasks,
			keyboardOverrides: { "workspace.toggleTaskPane": { sequence: [{ key: "z" }] } },
			onToggleTaskPane: (visible: boolean) => {
				taskPaneVisible = visible;
			},
		};
		let mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			setup.mockInput.pressKey("[", { shift: true });
			expect(taskPaneVisible).toBe(true);
			setup.mockInput.pressKey("z");
			expect(taskPaneVisible).toBe(false);
			mount.dispose();
			mount = mountOpenTuiWorkspace(setup.renderer, parent, { ...options, taskPaneVisible });
			await setup.flush();
			setup.mockInput.pressKey("z");
			expect(taskPaneVisible).toBe(true);
		} finally {
			mount.dispose();
		}
	});
});
