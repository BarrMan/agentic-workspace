import { describe, expect, it } from "bun:test";
import type { Task } from "../model/types.ts";
import { TaskFrontmatterSchemaError } from "../storage/errors/frontmatter.ts";
import { parseFrontmatter } from "../storage/markdown/frontmatter.ts";
import { parseTask } from "../storage/markdown/parser.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";

const task: Task = {
	id: "TASK-1",
	title: "Schema-backed task",
	status: "To Do",
	assignee: ["@alex"],
	createdDate: "2026-09-30 12:00",
	labels: ["schema"],
	dependencies: ["TASK-0"],
	description: "First line\nSecond line",
};

function taskMarkdown(frontmatter: string): string {
	return `---\ntask_schema_version: 3\nid: TASK-1\ntitle: Schema-backed task\nstatus: To Do\nassignee: []\ncreated_date: '2026-09-30'\nlabels: []\n${frontmatter}\n---\n\nBody\n`;
}

describe("declarative task frontmatter schema", () => {
	it("round-trips a task and retains unknown frontmatter keys on save", () => {
		const retained = { custom_owner: "platform", custom_nested: { keep: true } };
		const first = serializeTask(task, retained);
		const parsed = parseTask(first);

		expect(parsed).toMatchObject(task);

		const resaved = serializeTask(parsed, parseFrontmatter(first).data);
		expect(parseFrontmatter(resaved).data.custom_owner).toBe("platform");
		expect(parseFrontmatter(resaved).data.custom_nested).toEqual({ keep: true });
	});

	it("rejects scalar assignees and non-string descriptions", () => {
		expect(() => parseTask(taskMarkdown("assignee: '@alex'"))).toThrow("assignee must be a list");
		expect(() => parseTask(taskMarkdown("description:\n  nested: value"))).toThrow("description must be a string");
	});

	it("rejects invalid dates and unknown worktree policies as schema errors", () => {
		expect(() => parseTask(taskMarkdown("created_date: 08-06-25"))).toThrow(TaskFrontmatterSchemaError);
		expect(() => parseTask(taskMarkdown("created_date: 08-06-25"))).toThrow("created_date must be a date string");
		expect(() => parseTask(taskMarkdown("worktree_policy: sometimes"))).toThrow(TaskFrontmatterSchemaError);
		expect(() => parseTask(taskMarkdown("worktree_policy: sometimes"))).toThrow(
			"worktree_policy must be enabled or disabled",
		);
	});

	it("keeps due-date normalization and date strings as strings", () => {
		const parsed = parseTask(taskMarkdown("due_date: 2026-10-01 14:30"));
		expect(parsed.dueDate).toBe("2026-10-01");
		expect(parsed.createdDate).toBe("2026-09-30");
	});

	it("uses the last value for a duplicate frontmatter key", () => {
		const parsed = parseTask(
			`---
task_schema_version: 3
id: TASK-1
id: TASK-2
title: Duplicate
status: To Do
assignee: []
created_date: 2026-09-30
labels: []
---
`,
		);
		expect(parsed.id).toBe("TASK-2");
	});

	it("rejects malformed nested dependency entries with the public dependency error", () => {
		expect(() => parseTask(taskMarkdown("dependencies: [TASK-0, { id: TASK-2 }]"))).toThrow(
			"Invalid dependencies in task TASK-1: entry 2",
		);
	});
});
