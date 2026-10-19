import { describe, expect, it } from "bun:test";
import { toTaskDetail } from "../controller/task-detail.ts";
import type { Task } from "../model/types.ts";
import { formatTaskPlainText } from "../renderer/formatters/task-plain-text.ts";

describe("plain text assignee display", () => {
	it("adds one prefix, trims display values, and skips blanks", () => {
		const task: Task = {
			id: "task-1",
			title: "Assigned",
			status: "To Do",
			assignee: [" @Alice ", "bob", "  "],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
		};
		const detail = toTaskDetail(task, { tasks: [task], completedTasks: [], statuses: ["To Do"] });

		const output = formatTaskPlainText(detail);
		expect(output).toContain("Assignee: @Alice, @bob");
		expect(output).not.toContain("@@Alice");
		expect(output).not.toContain("@, ");
	});

	it("omits the assignee line when every value is blank", () => {
		const task: Task = {
			id: "task-1",
			title: "Unassigned",
			status: "To Do",
			assignee: [" ", "\t"],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
		};
		const detail = toTaskDetail(task, { tasks: [task], completedTasks: [], statuses: ["To Do"] });

		expect(formatTaskPlainText(detail)).not.toContain("Assignee:");
	});
});
