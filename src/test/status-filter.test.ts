import { describe, expect, it } from "bun:test";
import { parseTaskListRequest } from "../cli/features/tasks/list-parse.ts";
import type { Core } from "../index.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";

describe("task search status filtering", () => {
	const tasks = ["To Do", "Done", "In Progress"].map((status, index) => ({
		id: `task-${index}`,
		title: status,
		status,
		createdDate: "2025-01-01",
		labels: [],
		dependencies: [],
	}));

	it("matches exact labels and drops blank entries", () => {
		expect(TaskSearchIndex.apply(tasks, { status: ["To Do", "", "Done"] }).map((task) => task.status)).toEqual([
			"To Do",
			"Done",
		]);
		expect(TaskSearchIndex.apply(tasks, { status: ["TO DO", " DONE "] })).toEqual([]);
	});

	it("keeps internal whitespace significant", () => {
		expect(TaskSearchIndex.apply(tasks, { status: "In Progress" }).map((task) => task.status)).toEqual(["In Progress"]);
		expect(TaskSearchIndex.apply(tasks, { status: "InProgress" })).toEqual([]);
	});

	it("treats a skipped empty filter differently from a nonempty selection", () => {
		expect(TaskSearchIndex.apply(tasks, { status: ["", "  "] })).toHaveLength(3);
		expect(TaskSearchIndex.apply(tasks, { status: "missing" })).toEqual([]);
	});

	it("passes original status spelling from list options to exact validation", async () => {
		const received: string[][] = [];
		const request = await parseTaskListRequest({} as Core, { status: [" In Progress "] }, [], {
			statusList: async (_core, values) => {
				received.push(values);
				return null;
			},
			priority: async () => null,
			types: async () => null,
			projects: async () => null,
		});
		expect(request).toBeNull();
		expect(received).toEqual([[" In Progress "]]);
	});
});
