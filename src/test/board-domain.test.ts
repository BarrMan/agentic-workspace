import { describe, expect, test } from "bun:test";
import type { Task } from "../model/types.ts";
import { Board } from "../renderer/opentui/board/models/board.ts";
import { Filter } from "../renderer/opentui/board/models/filter.ts";

const task = (id: string, status: string, ordinal: number, branch?: string): Task => ({
	id,
	title: id,
	done: false,
	status,
	ordinal,
	branch,
	createdDate: "2025-01-01",
	labels: [],
	dependencies: [],
});

describe("board domain", () => {
	test("normalizes filters, applies them, and permits status exclusion during moves", () => {
		const filter = new Filter({ excludeStatus: ["Done"] });
		expect(filter.blocksMoves()).toBe(false);
		expect(filter.apply([task("A", "To Do", 1), task("B", "Done", 2)]).map((item) => item.id)).toEqual(["A"]);
		filter.value.excludeStatus.push("To Do");
		expect(filter.apply([task("A", "To Do", 1), task("B", "Done", 2)]).map((item) => item.id)).toEqual(["A"]);
		expect(new Filter({ searchQuery: "A" }).blocksMoves()).toBe(true);
		filter.update({ searchQuery: "A" });
		expect(filter.blocksMoves()).toBe(true);
	});

	test("keeps hidden empty lanes available while moving and produces persistence-ready moves", () => {
		const board = new Board({
			tasks: [task("A", "To Do", 1), task("B", "To Do", 2)],
			statuses: ["To Do", "In Progress", "Done"],
			hideEmptyColumns: true,
		});
		expect(board.lanes.map((lane) => lane.status)).toEqual(["To Do"]);
		expect(board.beginMove()).toBe("entered");
		expect(board.lanes.map((lane) => lane.status)).toEqual(["To Do", "In Progress", "Done"]);
		board.moveToAdjacentLane("next");
		expect(board.completeMove()).toEqual({
			taskIds: ["B"],
			targetStatus: "In Progress",
			orderedTaskIds: ["B"],
			kind: "reorder",
		});
	});

	test("preserves selection identity and the active move when write updates arrive", () => {
		const board = new Board({ tasks: [task("A", "To Do", 1), task("B", "To Do", 2)], statuses: ["To Do", "Done"] });
		board.select("To Do", "B");
		board.beginMove();
		board.update([task("A", "To Do", 1), { ...task("B", "To Do", 2), title: "updated" }]);
		expect(board.selectedTask?.title).toBe("updated");
		expect(board.move?.taskId).toBe("B");
	});

	test("recruits adjacent tasks and retains the projected order for a batch move", () => {
		const board = new Board({
			tasks: [task("A", "To Do", 1), task("B", "To Do", 2), task("C", "To Do", 3)],
			statuses: ["To Do", "Done"],
		});
		board.beginMove();
		expect(board.toggleRecruit()).toBe("selected");
		board.moveToAdjacentLane("next");
		expect(board.completeMove()).toEqual({
			taskIds: ["C", "B"],
			targetStatus: "Done",
			orderedTaskIds: ["C", "B"],
			kind: "move",
		});
	});

	test("requires confirmation after inspecting a recruit highlight", () => {
		const board = new Board({
			tasks: [task("A", "To Do", 1), task("B", "Done", 2), task("C", "Done", 3)],
			statuses: ["To Do", "Done"],
		});
		board.beginMove();
		board.moveToAdjacentLane("next");
		expect(board.toggleRecruit()).toBe("selected");
		expect(board.walkRecruitHighlight("down")).toBe(true);
		expect(board.move?.highlightTaskId).toBe("B");
		expect(board.completeMove()).toBeNull();
		expect(board.move?.highlightTaskId).toBeNull();
		expect(board.completeMove()?.taskIds).toEqual(["A", "C"]);
	});

	test("rejects branch tasks and protects move previews from renderer mutation", () => {
		const board = new Board({
			tasks: [task("A", "To Do", 1, "feature/a"), task("B", "To Do", 2)],
			statuses: ["To Do", "Done"],
		});
		board.select("To Do", "A");
		expect(board.beginMove()).toBe("branched");
		board.select("To Do", "B");
		board.beginMove();
		const preview = board.move;
		if (preview) preview.targetStatus = "Done";
		expect(board.move?.targetStatus).toBe("To Do");
		expect(board.walkRecruitHighlight("down")).toBe(true);
		expect(board.move?.highlightTaskId).toBe("A");
		expect(board.toggleRecruit()).toBe("branched");
	});

	test("commits against the latest corpus after an external update", () => {
		const board = new Board({
			tasks: [task("A", "To Do", 1), task("B", "Done", 2)],
			statuses: ["To Do", "Done"],
		});
		board.beginMove();
		board.moveToAdjacentLane("next");
		board.update([task("A", "To Do", 1), task("C", "Done", 2), task("B", "Done", 3)]);
		expect(board.completeMove()).toEqual({
			taskIds: ["A"],
			targetStatus: "Done",
			orderedTaskIds: ["A", "B", "C"],
			kind: "reorder",
		});
	});
});
