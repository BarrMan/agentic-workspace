import { describe, expect, it } from "bun:test";
import { parseFrontmatter } from "../markdown/frontmatter.ts";
import { parseMarkdown, parseTask, UnsupportedTaskFrontmatterSchemaError } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";

describe("Markdown Parser", () => {
	describe("parseMarkdown", () => {
		it("should parse frontmatter and content", () => {
			const content = `---
title: "Test Task"
status: "To Do"
labels: ["bug", "urgent"]
---

This is the task description.

## Details

- [ ] First criterion
- [ ] Second criterion`;

			const result = parseMarkdown(content);

			expect(result.frontmatter.title).toBe("Test Task");
			expect(result.frontmatter.status).toBe("To Do");
			expect(result.frontmatter.labels).toEqual(["bug", "urgent"]);
			expect(result.content).toContain("This is the task description");
		});

		it("should handle content without frontmatter", () => {
			const content = "Just some markdown content";
			const result = parseMarkdown(content);

			expect(result.frontmatter).toEqual({});
			expect(result.content).toBe("Just some markdown content");
		});

		it("should handle empty content", () => {
			const content = "";
			const result = parseMarkdown(content);

			expect(result.frontmatter).toEqual({});
			expect(result.content).toBe("");
		});
	});

	describe("parseTask", () => {
		it("should parse a complete task", () => {
			const content = `---
task_schema_version: 3
id: task-1
title: "Fix login bug"
status: "In Progress"
assignee: ["@developer"]
reporter: "@manager"
created_date: "2025-06-03"
labels: ["bug", "frontend"]
milestone: "v1.0"
dependencies: ["task-0"]
modified_files: ["src/auth/login.ts", "src/web/LoginForm.tsx"]
parent_task_id: "task-parent"
subtasks: ["task-1.1", "task-1.2"]
agent_summary: "Fixed the login race and verified the error paths."
---

## Description

Fix the login bug that prevents users from signing in.

## Details

- [ ] Login form validates correctly
- [ ] Error messages are displayed properly`;

			const task = parseTask(content);

			expect(task.id).toBe("task-1");
			expect(task.title).toBe("Fix login bug");
			expect(task.status).toBe("In Progress");
			expect(task.assignee).toEqual(["@developer"]);
			expect(task.reporter).toBe("@manager");
			expect(task.createdDate).toBe("2025-06-03");
			expect(task.labels).toEqual(["bug", "frontend"]);
			expect(task.milestone).toBe("v1.0");
			expect(task.dependencies).toEqual(["task-0"]);
			expect(task.modifiedFiles).toEqual(["src/auth/login.ts", "src/web/LoginForm.tsx"]);
			expect(task.parentTaskId).toBe("task-parent");
			expect(task.subtasks).toEqual(["task-1.1", "task-1.2"]);
		});

		it("should parse a task with minimal fields", () => {
			const content = `---
task_schema_version: 3
id: task-2
title: "Simple task"
---

Just a basic task.`;

			const task = parseTask(content);

			expect(task.id).toBe("task-2");
			expect(task.title).toBe("Simple task");
			expect(task.status).toBe("");
			expect(task.assignee).toEqual([]);
			expect(task.reporter).toBeUndefined();
			expect(task.labels).toEqual([]);
			expect(task.dependencies).toEqual([]);
			expect(task.parentTaskId).toBeUndefined();
			expect(task.subtasks).toBeUndefined();
		});

		it("should parse unquoted created_date", () => {
			const content = `---
task_schema_version: 3
id: task-5
title: "Unquoted"
created_date: 2025-06-08
---`;

			const task = parseTask(content);

			expect(task.createdDate).toBe("2025-06-08");
		});

		it("rejects unsupported historical created_date formats", () => {
			const content = `---
task_schema_version: 3
id: task-6
title: "Short"
created_date: 08-06-25
---`;

			expect(() => parseTask(content)).toThrow("created_date must be a date string");
		});

		it("should preserve frontmatter when title contains dollar-sign digit sequences", () => {
			const content = `---
task_schema_version: 3
id: task-112.11
title: 'Build ~$15,000 System (Magnepan 1.7x)'
status: To Do
assignee: []
created_date: "2026-02-10 18:24"
labels:
  - TLR
dependencies: []
priority: high
---

Task body.`;

			const task = parseTask(content);

			expect(task.id).toBe("task-112.11");
			expect(task.title).toBe("Build ~$15,000 System (Magnepan 1.7x)");
			expect(task.status).toBe("To Do");
			expect(task.createdDate).toBe("2026-02-10 18:24");
			expect(task.labels).toEqual(["TLR"]);
			expect(task.priority).toBe("high");
		});

		it("treats missing schema versions as unsupported and leaves the body opaque", () => {
			const content = `---
id: task-4
title: "Test with mixed criteria"
---

## Acceptance Criteria

- [ ] Todo item
- [x] Done item
- [ ] Another todo`;

			expect(() => parseTask(content)).toThrow(UnsupportedTaskFrontmatterSchemaError);
		});

		it("rejects invalid YAML rather than repairing it", () => {
			const content = `---
task_schema_version: 3
id: task-5
title: "Assignee Test"
			assignee: [unterminated
---

Test task.`;

			expect(() => parseTask(content)).toThrow();
		});

		it("rejects retired scalar assignees", () => {
			const content = `---
task_schema_version: 3
id: task-5
title: "Assignee Test"
assignee: "@MrLesk"
---
`;

			expect(() => parseTask(content)).toThrow("assignee must be a list");
		});
	});
});

describe("malformed frontmatter", () => {
	// gray-matter caches the file object before parsing, so an uncached second parse used to
	// return empty frontmatter and make an unparseable file look like one with no id.
	it("fails on every parse, not just the first", () => {
		const malformed = "---\nid: task-2\ntitle: [unterminated\n---\n\nBody\n";

		for (const parse of [parseTask, parseMarkdown]) {
			expect(() => parse(malformed)).toThrow();
		}
	});
});

describe("frontmatter parse cache", () => {
	// gray-matter hands the same data object to every caller that parses identical content, so a
	// caller mutating its own result used to change what later parses of that content returned.
	const content = "---\ntask_schema_version: 3\nid: task-608\ntitle: Cache probe\nlabels: [cache]\n---\n\nBody text\n";

	it("gives each parseFrontmatter call an independent result", () => {
		const first = parseFrontmatter(content);
		first.data.title = "mutated title";
		first.data.injected = true;
		(first.data.labels as string[]).push("mutated label");
		first.content = "mutated content";

		const second = parseFrontmatter(content);
		expect(second.data).toEqual({ task_schema_version: 3, id: "task-608", title: "Cache probe", labels: ["cache"] });
		expect(second.content.trim()).toBe("Body text");
	});

	it("parses a task correctly after an earlier parse of the same content was mutated", () => {
		const parsed = parseMarkdown(content);
		parsed.frontmatter.title = "mutated title";
		parsed.frontmatter.status = "Done";
		delete parsed.frontmatter.id;

		const task = parseTask(content);
		expect(task.id).toBe("task-608");
		expect(task.title).toBe("Cache probe");
		expect(task.status).toBe("");
		expect(task.labels).toEqual(["cache"]);
	});
});

describe("Markdown Serializer", () => {
	describe("serializeTask", () => {
		it("should serialize a task correctly", () => {
			const task: Task = {
				id: "task-1",
				title: "Test Task",
				status: "To Do",
				assignee: ["@developer"],
				reporter: "@manager",
				createdDate: "2025-06-03",
				labels: ["bug", "frontend"],
				milestone: "v1.0",
				dependencies: ["task-0"],
				modifiedFiles: ["src/auth/login.ts", "src/web/LoginForm.tsx"],
				description: "This is a test task description.",
			};

			const result = serializeTask(task);

			expect(result).toContain("id: task-1");
			expect(result).toContain("title: Test Task");
			expect(result).toContain("status: To Do");
			expect(result).toContain("created_date: '2025-06-03'");
			expect(result).toContain("labels:");
			expect(result).toContain("- bug");
			expect(result).toContain("- frontend");
			expect(result).toContain("modified_files:");
			expect(result).toContain("- src/auth/login.ts");
			expect(result).toContain("- src/web/LoginForm.tsx");
			expect(result).toContain("task_schema_version: 3");
			expect(result).toContain("description: This is a test task description.");
			expect(result).not.toContain("## Description");
		});

		it("should serialize task with subtasks", () => {
			const task: Task = {
				id: "task-parent",
				title: "Parent Task",
				status: "In Progress",
				assignee: [],
				createdDate: "2025-06-03",
				labels: [],
				dependencies: [],
				description: "A parent task with subtasks.",
				subtasks: ["task-parent.1", "task-parent.2"],
			};

			const result = serializeTask(task);

			expect(result).toContain("subtasks:");
			expect(result).toContain("- task-parent.1");
			expect(result).toContain("- task-parent.2");
		});

		it("should serialize task with parent", () => {
			const task: Task = {
				id: "task-1.1",
				title: "Subtask",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-03",
				labels: [],
				dependencies: [],
				description: "A subtask.",
				parentTaskId: "task-1",
			};

			const result = serializeTask(task);

			expect(result).toContain("parent_task_id: task-1");
		});

		it("should serialize minimal task", () => {
			const task: Task = {
				id: "task-minimal",
				title: "Minimal Task",
				status: "Draft",
				assignee: [],
				createdDate: "2025-06-03",
				labels: [],
				dependencies: [],
				description: "Minimal task.",
			};

			const result = serializeTask(task);

			expect(result).toContain("id: task-minimal");
			expect(result).toContain("title: Minimal Task");
			expect(result).toContain("assignee: []");
			expect(result).not.toContain("reporter:");
			expect(result).not.toContain("updated_date:");
		});

		it("emits populated frontmatter in canonical order and omits empty optional lists", () => {
			const result = serializeTask({
				id: "task-policy",
				title: "Frontmatter policy",
				status: "In Progress",
				assignee: ["@developer"],
				reporter: "@reporter",
				createdDate: "2026-09-29",
				updatedDate: "2026-09-30",
				dueDate: "2026-10-01",
				labels: ["serializer"],
				milestone: "v1",
				dependencies: ["task-1"],
				references: ["docs/design.md"],
				documentation: ["reference-1"],
				modifiedFiles: ["src/markdown/serializer.ts"],
				parentTaskId: "task-parent",
				subtasks: ["task-policy.1"],
				priority: "high",
				type: "feature",
				project: "cli",
				ordinal: 0,
			});

			const frontmatter = parseFrontmatter(result).data;
			expect(Object.keys(frontmatter)).toEqual([
				"task_schema_version",
				"id",
				"title",
				"status",
				"assignee",
				"reporter",
				"created_date",
				"updated_date",
				"due_date",
				"labels",
				"milestone",
				"dependencies",
				"references",
				"documentation",
				"modified_files",
				"parent_task_id",
				"subtasks",
				"priority",
				"type",
				"project",
				"ordinal",
			]);
			expect(result).toContain("created_date: '2026-09-29'");
			expect(result).toContain("due_date: '2026-10-01'");
			expect(frontmatter.ordinal).toBe(0);

			const emptyOptionals = serializeTask({
				id: "task-empty-optionals",
				title: "Empty optionals",
				status: "To Do",
				assignee: [],
				createdDate: "2026-09-29",
				labels: [],
				dependencies: [],
				references: [],
				documentation: [],
				modifiedFiles: [],
				subtasks: [],
			});
			expect(emptyOptionals).toContain("labels: []");
			expect(emptyOptionals).toContain("dependencies: []");
			expect(emptyOptionals).not.toMatch(/(?:references|documentation|modified_files|subtasks):/);
		});
	});
});
