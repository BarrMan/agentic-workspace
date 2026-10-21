import { describe, expect, it } from "bun:test";
import { taskIdKey, taskIdsEqual } from "./task-id.ts";

describe("exact task IDs", () => {
	it("compares task IDs case-insensitively without numeric normalization", () => {
		expect(taskIdsEqual("TASK-1.2", "TASK-1.2")).toBe(true);
		expect(taskIdsEqual("TASK-1", "task-1")).toBe(true);
		expect(taskIdsEqual("TASK-01", "TASK-1")).toBe(false);
		expect(taskIdsEqual("TASK-1.2", "TASK-01.2")).toBe(false);
		expect(taskIdsEqual("BACK-7", "JIRA-7")).toBe(false);
	});

	it("uses one comparison key that trims but does not normalize numeric segments", () => {
		expect(taskIdKey("  task-01.02 ")).toBe("TASK-01.02");
		expect(taskIdsEqual(" TASK-01.02 ", "task-01.02")).toBe(true);
		expect(taskIdsEqual(" TASK-01 ", "TASK-1")).toBe(false);
	});
});
