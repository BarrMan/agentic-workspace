import { describe, expect, it } from "bun:test";
import { getPriorityRank, resolvePriorityLabel } from "../model/task/priority-config.ts";
import type { Task } from "../model/types.ts";
import { FileSystem } from "../storage/file-system.ts";
import { parseTask } from "../storage/markdown/parser.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

describe("Priority functionality", () => {
	describe("priority configuration", () => {
		it("normalizes configured priority labels", () => {
			const config = { priorities: ["Very High", "High", "Medium", "Low", "Very Low"] };

			expect(resolvePriorityLabel("VERY HIGH", config)).toBe("Very High");
			expect(getPriorityRank("Very High", config)).toBe(5);
			expect(getPriorityRank("Very Low", config)).toBe(1);
		});

		it("uses configured priority labels directly", () => {
			expect(resolvePriorityLabel(" urgent   work ", ["Urgent Work", "Normal"])).toBe("Urgent Work");
			expect(resolvePriorityLabel("Urgent", ["Urgent Work", "Normal"])).toBeUndefined();
		});

		it("round-trips configured priorities through config.yml", async () => {
			const testDir = createUniqueTestDir("priority-config");
			const filesystem = new FileSystem(testDir);
			try {
				await filesystem.ensureAgenticWorkspaceStructure();
				await filesystem.saveConfig({
					projectName: "Priority Config",
					statuses: ["To Do", "Done"],
					labels: [],
					priorities: ["Very High", "High", "Medium", "Low", "Very Low"],
					dateFormat: "yyyy-mm-dd",
				});

				const reloaded = await new FileSystem(testDir).loadConfig();
				expect(reloaded?.priorities).toEqual(["Very High", "High", "Medium", "Low", "Very Low"]);
			} finally {
				await safeCleanup(testDir);
			}
		});
	});

	describe("parseTask", () => {
		it("should preserve non-default priority values", () => {
			const content = `---
task_schema_version: 3
id: task-1
title: "Custom priority task"
status: "To Do"
priority: Very High
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This task has a custom priority.`;

			const task = parseTask(content);

			expect(task.priority).toBe("Very High");
		});

		it("should handle task without priority field", () => {
			const content = `---
task_schema_version: 3
id: task-1
title: "No priority task"
status: "To Do"
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This task has no priority.`;

			const task = parseTask(content);

			expect(task.priority).toBeUndefined();
		});

		it("should handle case-insensitive priority values", () => {
			const content = `---
task_schema_version: 3
id: task-1
title: "Mixed case priority"
status: "To Do"
priority: HIGH
created_date: "2025-06-20"
labels: []
dependencies: []
---

## Description

This task has mixed case priority.`;

			const task = parseTask(content);

			expect(task.priority).toBe("HIGH");
		});
	});

	describe("serializeTask", () => {
		it("should not include priority field when undefined", () => {
			const task: Task = {
				id: "task-1",
				title: "No priority task",
				status: "To Do",
				createdDate: "2025-06-20",
				labels: [],
				dependencies: [],
				rawContent: "## Description\n\nThis task has no priority.",
			};

			const serialized = serializeTask(task);

			expect(serialized).not.toContain("priority:");
		});

		it("should round-trip priority values correctly", () => {
			const priorities = ["very high", "high", "medium", "low", "very low"];

			for (const priority of priorities) {
				const originalTask: Task = {
					id: "task-1",
					title: `${priority} priority task`,
					status: "To Do",
					createdDate: "2025-06-20",
					labels: [],
					dependencies: [],
					rawContent: `## Description\n\nThis is a ${priority} priority task.`,
					priority,
				};

				const serialized = serializeTask(originalTask);
				const parsed = parseTask(serialized);

				expect(parsed.priority).toBe(priority);
			}
		});
	});
});
