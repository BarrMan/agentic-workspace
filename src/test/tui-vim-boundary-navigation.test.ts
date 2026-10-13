import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable, InputRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { Task } from "../types/index.ts";
import { Board } from "../ui/opentui/board/models/board.ts";
import { mountOpenTuiBoard } from "../ui/opentui/board.ts";

function task(id: string, status = "To Do", visible = true): Task {
	return {
		id,
		title: `Task ${id}`,
		status,
		assignee: [],
		createdDate: "2026-01-01",
		labels: visible ? ["visible"] : [],
		dependencies: [],
	};
}

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

describe("task boundary shortcuts", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	test("board jumps within the selected filtered status pane and leaves empty panes safe", async () => {
		const setup = await createTestRenderer({ width: 80, height: 12, kittyKeyboard: true });
		renderers.push(setup);
		const tasks = Array.from({ length: 20 }, (_, index) => task(`TASK-${index + 1}`));
		tasks.push(task("TASK-21", "To Do", false), task("TASK-22", "Doing"), task("TASK-23", "Doing"));
		const board = new Board({ tasks, statuses: ["To Do", "Doing", "Empty"], filters: { labelFilter: ["visible"] } });
		const mount = mountOpenTuiBoard(setup.renderer, parent(setup), { board });
		try {
			await setup.flush();
			setup.mockInput.pressKey("G");
			await setup.flush();
			expect(board.selectedTask?.id).toBe("TASK-1");
			expect(setup.captureCharFrame().split("\n").slice(1, -2).join("\n")).toContain("TASK-1");
			setup.mockInput.pressKey("g");
			expect(board.selectedTask?.id).toBe("TASK-20");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("g", { shift: true });
			expect(board.selectedLane?.status).toBe("Doing");
			expect(board.selectedTask?.id).toBe("TASK-22");
			setup.mockInput.pressKey("HOME");
			expect(board.selectedTask?.id).toBe("TASK-23");
			setup.mockInput.pressKey("END");
			expect(board.selectedTask?.id).toBe("TASK-22");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressKey("g");
			setup.mockInput.pressKey("G");
			expect(board.selectedLane?.status).toBe("Empty");
			expect(board.selectedTask).toBeUndefined();
		} finally {
			mount.dispose();
		}
	});

	test("board ignores boundary jumps during move previews and shortcut help", async () => {
		const setup = await createTestRenderer({ width: 80, height: 16, kittyKeyboard: true });
		renderers.push(setup);
		const board = new Board({ tasks: [task("TASK-1"), task("TASK-2"), task("TASK-3")], statuses: ["To Do"] });
		board.select("To Do", "TASK-2");
		const mount = mountOpenTuiBoard(setup.renderer, parent(setup), { board });
		try {
			setup.mockInput.pressKey("m");
			const preview = board.move;
			expect(preview).not.toBeNull();
			for (const key of ["g", "G", "HOME", "END"]) setup.mockInput.pressKey(key);
			expect(board.move).toEqual(preview);
			setup.mockInput.pressEscape();
			expect(board.move).toBeNull();
			setup.mockInput.pressKey("?");
			setup.mockInput.pressKey("G");
			expect(board.selectedTask?.id).toBe("TASK-2");
			setup.mockInput.pressEscape();
			setup.mockInput.pressKey("G");
			expect(board.selectedTask?.id).toBe("TASK-1");
		} finally {
			mount.dispose();
		}
	});

	test("board project overrides replace both letter and Home/End aliases", async () => {
		const setup = await createTestRenderer({ width: 80, height: 16 });
		renderers.push(setup);
		const board = new Board({ tasks: [task("TASK-1"), task("TASK-2"), task("TASK-3")], statuses: ["To Do"] });
		board.select("To Do", "TASK-2");
		const mount = mountOpenTuiBoard(setup.renderer, parent(setup), {
			board,
			keyboardOverrides: {
				"board.first": { sequence: [{ key: "x" }] },
				"board.last": { sequence: [{ key: "z" }] },
			},
		});
		try {
			for (const key of ["g", "G", "HOME", "END"]) setup.mockInput.pressKey(key);
			expect(board.selectedTask?.id).toBe("TASK-2");
			setup.mockInput.pressKey("z");
			expect(board.selectedTask?.id).toBe("TASK-1");
			setup.mockInput.pressKey("x");
			expect(board.selectedTask?.id).toBe("TASK-3");
		} finally {
			mount.dispose();
		}
	});

	test("board leaves g/G in an external editable control", async () => {
		const setup = await createTestRenderer({ width: 80, height: 16 });
		renderers.push(setup);
		const board = new Board({ tasks: [task("TASK-1"), task("TASK-2"), task("TASK-3")], statuses: ["To Do"] });
		board.select("To Do", "TASK-2");
		const mount = mountOpenTuiBoard(setup.renderer, parent(setup), { board });
		try {
			const input = new InputRenderable(setup.renderer, { width: 20 });
			setup.renderer.root.add(input);
			input.focus();
			setup.mockInput.pressKey("g");
			setup.mockInput.pressKey("G");
			expect(input.value).toBe("gG");
			expect(board.selectedTask?.id).toBe("TASK-2");
		} finally {
			mount.dispose();
		}
	});
});
