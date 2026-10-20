import { describe, expect, test } from "bun:test";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import type { Task } from "../model/types.ts";

const tasks: Task[] = [
	{
		id: "task-1",
		title: "Add auth",
		status: "To Do",
		labels: ["backend", "security"],
		createdDate: "2025-01-01",
		dependencies: [],
		modifiedFiles: ["src/server/auth.ts"],
	},
	{
		id: "task-2",
		title: "Fix button",
		status: "To Do",
		labels: [" UI "],
		createdDate: "2025-01-01",
		dependencies: [],
		modifiedFiles: ["src/web/components/Button.tsx"],
	},
	{
		id: "task-3",
		title: "Docs",
		status: "Done",
		labels: ["docs", "ui"],
		createdDate: "2025-01-01",
		dependencies: [],
		modifiedFiles: ["docs/search.md"],
	},
];

describe("TaskSearchIndex label filtering", () => {
	test("filters tasks by single label", () => {
		const index = new TaskSearchIndex(tasks);
		const results = index.search({ labels: [" Ui "] });
		expect(results.map((t) => t.id)).toEqual(["task-2", "task-3"]);
	});

	test("matches any of the selected labels", () => {
		const index = new TaskSearchIndex(tasks);
		const results = index.search({ labels: ["ui", "docs"] });
		expect(results.map((t) => t.id)).toEqual(["task-2", "task-3"]);
	});

	test("can require all selected labels", () => {
		const index = new TaskSearchIndex(tasks);
		const results = index.search({ labels: ["ui", "docs"], labelMatch: "all" });
		expect(results.map((t) => t.id)).toEqual(["task-3"]);
	});

	test("finds tasks by modified file query", () => {
		const index = new TaskSearchIndex(tasks);
		const results = index.search({ query: "components/Button.tsx" });
		expect(results.map((t) => t.id)).toEqual(["task-2"]);
	});

	test("filters tasks by modified file substring", () => {
		const index = new TaskSearchIndex(tasks);
		const results = index.search({ modifiedFiles: ["button"] });
		expect(results.map((t) => t.id)).toEqual(["task-2"]);
	});
});
