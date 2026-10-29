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
	done: false,
	createdDate: "2026-09-30 12:00",
	labels: ["schema"],
	dependencies: ["TASK-0"],
	description: "First line\nSecond line",
};

function taskMarkdown(frontmatter: string): string {
	return `---\ntask_schema_version: 3\nid: TASK-1\ntitle: Schema-backed task\nstatus: To Do\ncreated_date: '2026-09-30'\nlabels: []\n${frontmatter}\n---\n\nBody\n`;
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

	it("preserves assignee frontmatter during an ordinary serialization", () => {
		const serialized = serializeTask(task, { assignee: "alice" });
		expect(parseFrontmatter(serialized).data.assignee).toBe("alice");
	});

	it("rejects non-string descriptions", () => {
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

	it("validates real calendar dates in date fields", () => {
		expect(parseTask(taskMarkdown("created_date: 2024-02-29")).createdDate).toBe("2024-02-29");
		expect(() => parseTask(taskMarkdown("created_date: 2025-02-29"))).toThrow("created_date must be a date string");
		expect(() => parseTask(taskMarkdown("created_date: '2026-09-30 24:00'"))).toThrow(
			"created_date must be a date string",
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

	it("requires argv commands in task-scoped agent configuration", () => {
		const valid = taskMarkdown(
			`agentConfiguration:\n  selectedPreset: custom\n  presets:\n    custom:\n      command: [agent, '', ' two spaces ']\n      env: {}\n      prepare: ''\n      bootstrap: pi`,
		);
		expect(parseTask(valid).agentConfiguration?.presets?.custom?.command).toEqual(["agent", "", " two spaces "]);
		const legacy = taskMarkdown(
			`agentConfiguration:\n  selectedPreset: custom\n  presets:\n    custom:\n      command: 'agent --flag'\n      env: {}\n      prepare: ''\n      bootstrap: pi`,
		);
		expect(() => parseTask(legacy)).toThrow(/command/);
	});
});
