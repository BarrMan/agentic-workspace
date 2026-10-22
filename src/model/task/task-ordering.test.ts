import { describe, expect, it } from "bun:test";
import { TaskOrdering } from "./task-ordering.ts";

describe("TaskOrdering.boardColumns", () => {
	it("walks grandchildren with canonical parent IDs and preserves cyclic and duplicate entries once", () => {
		const tasks =
			TaskOrdering.boardColumns(
				[
					{ id: "TASK-1", status: "To Do" },
					{ id: "TASK-1.1", parentTaskId: "task-1", status: "To Do" },
					{ id: "TASK-1.1.1", parentTaskId: "task-1.1", status: "To Do" },
					{ id: "task-1.1.1", parentTaskId: "TASK-1.1", status: "To Do" },
					{ id: "TASK-2", parentTaskId: "TASK-3", status: "To Do" },
					{ id: "TASK-3", parentTaskId: "TASK-2", status: "To Do" },
				],
				["To Do"],
			)[0]?.tasks ?? [];
		expect(tasks.filter((task) => task.id.startsWith("TASK-1")).map((task) => task.id)).toEqual([
			"TASK-1",
			"TASK-1.1",
			"TASK-1.1.1",
		]);
		expect(tasks).toHaveLength(5);
		expect(tasks.map((task) => task.id)).toContain("TASK-2");
		expect(tasks.map((task) => task.id)).toContain("TASK-3");
	});
	it("projects configured and unconfigured columns with parent-child placement", () => {
		const columns = TaskOrdering.boardColumns(
			[
				{ id: "TASK-2", status: "Done", ordinal: 1000 },
				{ id: "TASK-1", status: "To Do", ordinal: 1000 },
				{ id: "TASK-1.2", parentTaskId: "TASK-1", status: "To Do", ordinal: 1 },
				{ id: "TASK-1.1", parentTaskId: "TASK-1", status: "To Do", ordinal: 2 },
				{ id: "TASK-3", status: "Blocked" },
			],
			["To Do", "Done"],
		);

		expect(columns.map(({ status, tasks }) => [status, tasks.map(({ id }) => id)])).toEqual([
			["To Do", ["TASK-1", "TASK-1.1", "TASK-1.2"]],
			["Done", ["TASK-2"]],
			["Blocked", ["TASK-3"]],
		]);
	});
});
