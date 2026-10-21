import { describe, expect, test } from "bun:test";
import type { Task } from "../types.ts";
import { TaskSearchIndex } from "./task-search.ts";

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
	test("matches priorities exactly without trimming or merging case variants", () => {
		const index = new TaskSearchIndex([
			{ ...tasks[0]!, priority: "High" },
			{ ...tasks[1]!, priority: "high" },
		]);
		expect(index.search({ priority: "High" }).map((task) => task.id)).toEqual(["task-1"]);
		expect(index.search({ priority: "high" }).map((task) => task.id)).toEqual(["task-2"]);
		expect(index.search({ priority: " High " })).toEqual([]);
	});

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
