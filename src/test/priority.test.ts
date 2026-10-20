import { describe, expect, it } from "bun:test";
import { getPriorityOptions, getPriorityRank, resolvePriorityValue } from "../model/task/priority-config.ts";
import type { Task } from "../model/types.ts";
import { FileSystem } from "../storage/file-system.ts";
import { parseTask } from "../storage/markdown/parser.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

describe("Priority functionality", () => {
	describe("priority configuration", () => {
		it("normalizes configured priorities while preserving labels", () => {
			const config = { priorities: ["Very High", "High", "Medium", "Low", "Very Low"] };

			expect(getPriorityOptions(config)).toEqual([
				{ label: "Very High", value: "very high" },
				{ label: "High", value: "high" },
				{ label: "Medium", value: "medium" },
				{ label: "Low", value: "low" },
				{ label: "Very Low", value: "very low" },
			]);
			expect(resolvePriorityValue("VERY HIGH", config)).toBe("very high");
			expect(getPriorityRank("very high", config)).toBe(5);
			expect(getPriorityRank("very low", config)).toBe(1);
		});

		it("keeps the first normalized spelling and configured order, falling back when empty", () => {
			expect(getPriorityOptions(["  Urgent   Work ", "urgent work", "Normal", "  "])).toEqual([
				{ label: "Urgent Work", value: "urgent work" },
				{ label: "Normal", value: "normal" },
			]);
			expect(getPriorityOptions(["", "   "])).toEqual([
				{ label: "High", value: "high" },
				{ label: "Medium", value: "medium" },
				{ label: "Low", value: "low" },
			]);
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
assignee: []
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
assignee: []
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
assignee: []
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
				assignee: [],
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
					assignee: [],
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
