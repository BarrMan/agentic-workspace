import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { isValidTaskId, parseTaskId, taskIdsEqual } from "../model/task/task-id.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem } from "./test-utils.ts";

const TEST_DIR = join(tmpdir(), "agentic-workspace-id-gen-test");

describe("shared task ID grammar", () => {
	it("parses numeric segments without conflating stored casing or zero padding", () => {
		expect(parseTaskId("BACK-01.2", "back")).toEqual({ prefix: "BACK", segments: ["01", "2"] });
		expect(parseTaskId("BACK-1x", "back")).toBeNull();
		expect(isValidTaskId("back-01.2")).toBe(true);
		expect(isValidTaskId("JIRA-001")).toBe(true);
		expect(isValidTaskId("TASK-PREFIXED")).toBe(false);
		expect(isValidTaskId("1")).toBe(false);
		expect(taskIdsEqual("back-01", "BACK-01")).toBe(true);
		expect(taskIdsEqual("BACK-01", "BACK-1")).toBe(false);
	});
});

describe("Task ID Generation with Archives", () => {
	let core: Core;
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(TEST_DIR);
		core = new Core(testDir);
		await initializeTestProject(core, "Test Project", false);
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("should not reuse IDs from archived tasks", async () => {
		// Create tasks 1-5
		await core.createTaskFromInput({ title: "Task 1" });
		await core.createTaskFromInput({ title: "Task 2" });
		await core.createTaskFromInput({ title: "Task 3" });
		await core.createTaskFromInput({ title: "Task 4" });
		await core.createTaskFromInput({ title: "Task 5" });

		// Archive all tasks
		await core.archiveTask("task-1");
		await core.archiveTask("task-2");
		await core.archiveTask("task-3");
		await core.archiveTask("task-4");
		await core.archiveTask("task-5");

		// Verify tasks directory has no active tasks
		const activeTasks = await coreFileSystem(core).listTasks();
		expect(activeTasks.length).toBe(0);

		// Archived canonical containers remain part of the task identity inventory.
		const result = await core.createTaskFromInput({ title: "Task After Archive" });
		expect(result.task.id).toBe("TASK-6");

		// Verify the task was created with correct ID
		const newTask = (await coreFileSystem(core).listArchivedTasks()).find((task) => task.id === "TASK-1");
		expect(newTask?.title).toBe("Task 1");
	});

	it("should consider completed and archived tasks for ID generation", async () => {
		// Create tasks 1-3
		await core.createTaskFromInput({ title: "Task 1", status: "To Do" });
		await core.createTaskFromInput({ title: "Task 2", status: "Done" });
		await core.createTaskFromInput({ title: "Task 3", status: "To Do" });

		// Archive task-1; its canonical ID remains occupied.
		await core.archiveTask("task-1");

		// Complete task-2 (moves to completed directory, ID cannot be reused)
		await core.completeTask("task-2");

		// Keep task-3 active
		const activeTasks = await coreFileSystem(core).listTasks();
		expect(activeTasks.length).toBe(1);
		expect(activeTasks[0]?.id).toBe("TASK-3");

		// Create new task - should be TASK-4 (max of active 3 + completed 2 is 3, so next is 4)
		// Archived IDs remain reserved along with active and completed IDs.
		const result = await core.createTaskFromInput({ title: "Task 4" });
		expect(result.task.id).toBe("TASK-4");

		// Verify archived task still exists
		const archivedTasks = await coreFileSystem(core).listArchivedTasks();
		expect(archivedTasks.some((t) => t.id === "TASK-1")).toBe(true);

		// Verify completed task still exists
		const completedTasks = await coreFileSystem(core).listCompletedTasks();
		expect(completedTasks.some((t) => t.id === "TASK-2")).toBe(true);
	});

	it("should handle subtasks correctly with archived parents", async () => {
		// Create parent task-1
		await core.createTaskFromInput({ title: "Parent Task" });

		// Create subtasks
		const subtask1 = await core.createTaskFromInput({ title: "Subtask 1", parentTaskId: "task-1" });
		const subtask2 = await core.createTaskFromInput({ title: "Subtask 2", parentTaskId: "task-1" });

		expect(subtask1.task.id).toBe("TASK-1.1");
		expect(subtask2.task.id).toBe("TASK-1.2");

		// Archive parent and all subtasks
		await core.archiveTask("task-1");
		await core.archiveTask("task-1.1");
		await core.archiveTask("task-1.2");

		// Create a new parent task without reusing the archived identity.
		const newParent = await core.createTaskFromInput({ title: "New Parent" });
		expect(newParent.task.id).toBe("TASK-2");

		// Create a subtask under the new parent.
		const newSubtask = await core.createTaskFromInput({ title: "New Subtask", parentTaskId: "task-2" });
		expect(newSubtask.task.id).toBe("TASK-2.1");
	});

	it("should work with zero-padded IDs and reserve archived IDs", async () => {
		// Update config to use zero-padded IDs
		const config = await coreFileSystem(core).loadConfig();
		if (config) {
			config.zeroPaddedIds = 3;
			await coreFileSystem(core).saveConfig(config);
		}

		// Create and archive tasks with padding
		await core.createTaskFromInput({ title: "Task 1" });
		const task1 = await core.getTask("task-001");
		expect(task1?.id).toBe("TASK-001");

		await core.archiveTask("task-001");

		// Create new task - should advance beyond archived ID (TASK-002)
		const result = await core.createTaskFromInput({ title: "Task 2" });
		expect(result.task.id).toBe("TASK-002");
	});

	it("should not collide when zero padding is enabled after an unpadded task exists", async () => {
		const first = await core.createTaskFromInput({ title: "Unpadded task" });
		const config = await coreFileSystem(core).loadConfig();
		if (config) {
			config.zeroPaddedIds = 3;
			await coreFileSystem(core).saveConfig(config);
		}

		const second = await core.createTaskFromInput({ title: "Padded task" });
		expect(first.task.id).toBe("TASK-1");
		expect(second.task.id).toBe("TASK-002");
	});

	it("should detect existing subtasks with different casing (historical data)", async () => {
		// Create parent task via Core (will be uppercase TASK-1)
		await core.createTaskFromInput({ title: "Parent Task" });

		// Simulate a lowercase stored subtask by directly writing to filesystem
		// This represents a file created before the uppercase ID change
		const tasksDir = coreFileSystem(core).tasksDir;
		const lowercaseSubtask: Task = {
			id: "task-1.1", // Lowercase stored casing
			title: "Historical Subtask",
			status: "To Do",
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			parentTaskId: "task-1",
		};
		const content = serializeTask(lowercaseSubtask);
		await Bun.write(join(tasksDir, "task-1.1", "task.md"), content);

		// Create new subtask via Core - should detect the lowercase stored subtask and get TASK-1.2
		// BUG: Currently returns TASK-1.1 due to case-sensitive startsWith() check
		const newSubtask = await core.createTaskFromInput({ title: "New Subtask", parentTaskId: "task-1" });
		expect(newSubtask.task.id).toBe("TASK-1.2");
	});
});

import { initializeTestProject } from "./test-utils.ts";
