import { describe, expect, it } from "bun:test";
import { parseTask } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";

describe("task description storage", () => {
	it("replaces the YAML description without interpreting a body heading", () => {
		const task: Task = {
			id: "task-1",
			title: "Description",
			status: "To Do",
			assignee: [],
			createdDate: "2026-09-30",
			labels: [],
			dependencies: [],
			description: "Updated description",
			rawContent: "## Description\n\nThis body heading is opaque.",
		};
		const parsed = parseTask(serializeTask(task));
		expect(parsed.description).toBe("Updated description");
		expect(parsed.rawContent).toBe(task.rawContent);
	});
});
