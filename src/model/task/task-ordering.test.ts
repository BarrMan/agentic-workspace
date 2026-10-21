import { describe, expect, it } from "bun:test";
import { TaskOrdering } from "./task-ordering.ts";

describe("TaskOrdering.boardColumns", () => {
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
