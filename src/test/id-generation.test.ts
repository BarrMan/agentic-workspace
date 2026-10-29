import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { isValidTaskId, parseTaskId } from "../model/task/task-id.ts";
import { coreFileSystem, waitUntil } from "./test-utils.ts";

const TEST_DIR = join(tmpdir(), "agentic-workspace-id-gen-test");

describe("shared task ID grammar", () => {
	it("parses numeric segments without conflating stored casing or zero padding", () => {
		expect(parseTaskId("BACK-01.2", "BACK")).toEqual({ prefix: "BACK", segments: ["01", "2"] });
		expect(parseTaskId("BACK-1x", "back")).toBeNull();
		expect(isValidTaskId("back-01.2")).toBe(true);
		expect(isValidTaskId("JIRA-001")).toBe(true);
		expect(isValidTaskId("TASK-PREFIXED")).toBe(false);
		expect(isValidTaskId("1")).toBe(false);
	});
});

describe("Task ID Generation with Archives", () => {
	let core: Core;
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(TEST_DIR);
		core = new Core(testDir);
		await initializeTestProject(core, "Test Project", false);
		await core.tasks.init();
	});

	afterEach(async () => {
		core.tasks.dispose();
		await rm(testDir, { recursive: true, force: true });
	});

	it("should not reuse IDs from archived tasks", async () => {
		// Create tasks 1-5
		await core.tasks.create({ title: "Task 1" });
		await core.tasks.create({ title: "Task 2" });
		await core.tasks.create({ title: "Task 3" });
		await core.tasks.create({ title: "Task 4" });
		await core.tasks.create({ title: "Task 5" });

		// Archive all tasks
		await core.tasks.archive("TASK-1");
		await core.tasks.archive("TASK-2");
		await core.tasks.archive("TASK-3");
		await core.tasks.archive("TASK-4");
		await core.tasks.archive("TASK-5");

		// Verify tasks directory has no active tasks
		const activeTasks = await coreFileSystem(core).listTasks();
		expect(activeTasks.length).toBe(0);

		// Archived canonical containers remain part of the task identity inventory.
		const result = await core.tasks.create({ title: "Task After Archive" });
		expect(result.task.id).toBe("TASK-6");

		// Verify the task was created with correct ID
		const newTask = (await coreFileSystem(core).listArchivedTasks()).find((task) => task.id === "TASK-1");
		expect(newTask?.title).toBe("Task 1");
	});

	it("should consider completed and archived tasks for ID generation", async () => {
		// Create tasks 1-3
		await core.tasks.create({ title: "Task 1", status: "To Do" });
		const { task: completedTask } = await core.tasks.create({ title: "Task 2", status: "Done" });
		await core.tasks.create({ title: "Task 3", status: "To Do" });

		// Archive task-1; its canonical ID remains occupied.
		await core.tasks.archive("TASK-1");

		// Seed a historical completed task whose ID cannot be reused.
		await coreFileSystem(core).moveTaskContainer(completedTask, coreFileSystem(core).completedDir);
		await waitUntil(
			() => core.tasks.getCompletedTasks().some((task) => task.id === completedTask.id),
			"completed task entering the loaded corpus",
		);

		// Keep task-3 active
		const activeTasks = await coreFileSystem(core).listTasks();
		expect(activeTasks.length).toBe(1);
		expect(activeTasks[0]?.id).toBe("TASK-3");

		// Create new task - should be TASK-4 (max of active 3 + completed 2 is 3, so next is 4)
		// Archived IDs remain reserved along with active and completed IDs.
		const result = await core.tasks.create({ title: "Task 4" });
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
		await core.tasks.create({ title: "Parent Task" });

		// Create subtasks
		const subtask1 = await core.tasks.create({ title: "Subtask 1", parentTaskId: "TASK-1" });
		const subtask2 = await core.tasks.create({ title: "Subtask 2", parentTaskId: "TASK-1" });

		expect(subtask1.task.id).toBe("TASK-1.1");
		expect(subtask2.task.id).toBe("TASK-1.2");

		// Archive parent and all subtasks
		await core.tasks.archive("TASK-1");
		await core.tasks.archive("TASK-1.1");
		await core.tasks.archive("TASK-1.2");

		// Create a new parent task without reusing the archived identity.
		const newParent = await core.tasks.create({ title: "New Parent" });
		expect(newParent.task.id).toBe("TASK-2");

		// Create a subtask under the new parent.
		const newSubtask = await core.tasks.create({ title: "New Subtask", parentTaskId: "TASK-2" });
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
		await core.tasks.create({ title: "Task 1" });
		const task1 = await core.tasks.getTask("TASK-001");
		expect(task1?.id).toBe("TASK-001");

		await core.tasks.archive("TASK-001");

		// Create new task - should advance beyond archived ID (TASK-002)
		const result = await core.tasks.create({ title: "Task 2" });
		expect(result.task.id).toBe("TASK-002");
	});

	it("should not collide when zero padding is enabled after an unpadded task exists", async () => {
		const first = await core.tasks.create({ title: "Unpadded task" });
		const config = await coreFileSystem(core).loadConfig();
		if (config) {
			config.zeroPaddedIds = 3;
			await coreFileSystem(core).saveConfig(config);
		}

		const second = await core.tasks.create({ title: "Padded task" });
		expect(first.task.id).toBe("TASK-1");
		expect(second.task.id).toBe("TASK-002");
	});
});

import { initializeTestProject } from "./test-utils.ts";
