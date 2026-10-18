import { describe, expect, it } from "bun:test";
import type { Task } from "../types/index.ts";
import { createTaskRecordIndex } from "../utils/task-record-index.ts";

function task(id: string, status = "To Do"): Task {
	return {
		id,
		title: id,
		status,
		assignee: [],
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
	};
}

describe("createTaskRecordIndex", () => {
	it("looks up identities by the shared comparison key", () => {
		const record = task("TASK-1");
		const index = createTaskRecordIndex({ tasks: [record] });

		expect(index.lookup(" task-1 ")).toEqual({ task: record, completedRecord: false });
	});

	it("keeps padded identities distinct", () => {
		const index = createTaskRecordIndex({ tasks: [task("TASK-01")] });

		expect(index.lookup("TASK-1")).toBeUndefined();
		expect(index.lookup(" task-01 ")).toMatchObject({ completedRecord: false });
	});

	it("fails closed on seeded ambiguous identities", () => {
		const index = createTaskRecordIndex({ tasks: [task("TASK-1")], ambiguousIds: new Set([" task-1 "]) });

		expect(index.lookup("TASK-1")).toBe("ambiguous");
	});

	it("treats a completed-corpus record as finished", () => {
		const index = createTaskRecordIndex({ tasks: [], completedTasks: [task("TASK-1", "In Progress")] });
		const record = index.lookup("task-1");

		if (!record || record === "ambiguous") throw new Error("expected the completed record to be indexed");
		expect(index.isFinished(record)).toBe(true);
	});
});
