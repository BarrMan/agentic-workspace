import { describe, expect, it } from "bun:test";
import { TaskSearchIndex } from "../model/task/task-search.ts";

describe("task search status filtering", () => {
	const tasks = ["To Do", "Done", "In Progress"].map((status, index) => ({
		id: `task-${index}`,
		title: status,
		status,
		assignee: [],
		createdDate: "2025-01-01",
		labels: [],
		dependencies: [],
	}));

	it("trims and matches statuses case-insensitively, dropping blank entries", () => {
		expect(TaskSearchIndex.apply(tasks, { status: ["  TO DO ", "", "DONE"] }).map((task) => task.status)).toEqual([
			"To Do",
			"Done",
		]);
	});

	it("keeps internal whitespace significant", () => {
		expect(TaskSearchIndex.apply(tasks, { status: "In Progress" }).map((task) => task.status)).toEqual(["In Progress"]);
		expect(TaskSearchIndex.apply(tasks, { status: "InProgress" })).toEqual([]);
	});

	it("treats a skipped empty filter differently from a nonempty selection", () => {
		expect(TaskSearchIndex.apply(tasks, { status: ["", "  "] })).toHaveLength(3);
		expect(TaskSearchIndex.apply(tasks, { status: "missing" })).toEqual([]);
	});
});
