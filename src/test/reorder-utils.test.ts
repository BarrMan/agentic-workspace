import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { Storage } from "../storage/storage.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let core: Core;

const FIXED_DATE = "2025-01-01 00:00";

const buildTask = (id: string, status: string, ordinal?: number, overrides: Partial<Task> = {}): Task => ({
	id,
	title: `Task ${id}`,
	status,
	done: false,
	createdDate: FIXED_DATE,
	labels: [],
	dependencies: [],
	...(ordinal !== undefined ? { ordinal } : {}),
	...overrides,
});

describe("Core.reorderTask", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("reorder-utils");
		await mkdir(TEST_DIR, { recursive: true });
		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Reorder Utilities Test Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	const createTasks = async (tasks: Array<[string, string, number?, Partial<Task>?]>) => {
		for (const [id, status, ordinal, overrides] of tasks) {
			await Storage.open(core.projectRoot).createTask(buildTask(id, status, ordinal, overrides));
		}
	};

	it("updates updatedDate when ordinal changes with another task field", async () => {
		await Storage.open(core.projectRoot).createTask(
			buildTask("task-1", "To Do", 1000, {
				updatedDate: "2025-01-02 12:00",
			}),
		);

		await core.storage.withTaskLock("task-1", (current) =>
			core.tasks.edit({ ...current, ordinal: 2000, title: "Updated Task" }),
		);

		const updatedTask = await coreFileSystem(core).loadTask("task-1");
		const now = new Date().toISOString().slice(0, 16).replace("T", " ");
		expect(updatedTask?.title).toBe("Updated Task");
		expect(updatedTask?.ordinal).toBe(2000);
		expect(updatedTask?.updatedDate).toBe(now);
	});

	it("reorders within a column without touching unaffected tasks", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "To Do", 2000],
			[
				"task-3",
				"To Do",
				3000,
				{
					updatedDate: "2025-01-02 12:00",
				},
			],
		]);

		const result = await core.reorderTask({
			taskId: "task-3",
			targetStatus: "To Do",
			orderedTaskIds: ["task-1", "task-3", "task-2"],
		});

		expect(result.updatedTask.id).toBe("TASK-3");
		expect(result.updatedTask.ordinal).toBeGreaterThan(1000);
		expect(result.updatedTask.ordinal).toBeLessThan(2000);
		expect(result.changedTasks.map((task) => task.id)).toEqual(["TASK-3"]);

		const task2 = await coreFileSystem(core).loadTask("task-2");
		const task3 = await coreFileSystem(core).loadTask("task-3");
		expect(task2?.ordinal).toBe(2000);
		expect(task3?.updatedDate).toBe("2025-01-02 12:00");
	});

	it("rebalances ordinals when collisions exist", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "To Do", 1000],
			["task-3", "To Do", 1000],
		]);

		const result = await core.reorderTask({
			taskId: "task-3",
			targetStatus: "To Do",
			orderedTaskIds: ["task-1", "task-3", "task-2"],
		});

		expect(result.changedTasks.map((task) => task.id).sort()).toEqual(["TASK-2", "TASK-3"]);

		const task1 = await coreFileSystem(core).loadTask("task-1");
		const task2 = await coreFileSystem(core).loadTask("task-2");
		const task3 = await coreFileSystem(core).loadTask("task-3");
		expect(task1?.ordinal).toBe(1000);
		expect(task2?.ordinal).toBe(3000);
		expect(task3?.ordinal).toBe(2000);
	});

	it("ignores stale IDs in the supplied order", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "To Do", 2000],
			["task-3", "To Do", 3000],
		]);

		const result = await core.reorderTask({
			taskId: "task-3",
			targetStatus: "To Do",
			orderedTaskIds: ["TASK-1", "TASK-9", "TASK-3", "TASK-2"],
		});

		expect(result.updatedTask.ordinal).toBeGreaterThan(1000);
		expect(result.updatedTask.ordinal).toBeLessThan(2000);
		expect(result.changedTasks.map((task) => task.id)).toEqual(["TASK-3"]);
	});

	it("updates status and ordinal when moving across columns", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "In Progress", 1000],
			["task-3", "In Progress", 2000],
		]);

		const result = await core.reorderTask({
			taskId: "task-1",
			targetStatus: "In Progress",
			orderedTaskIds: ["task-1", "task-2", "task-3"],
		});

		expect(result.updatedTask.status).toBe("In Progress");
		expect(result.updatedTask.ordinal).toBeGreaterThan(0);
		expect(result.changedTasks.map((task) => task.id)).toContain("TASK-1");

		const task2 = await coreFileSystem(core).loadTask("task-2");
		const task3 = await coreFileSystem(core).loadTask("task-3");
		expect(task2?.ordinal).toBe(1000);
		expect(task3?.ordinal).toBe(2000);
	});

	it("reorders tasks with lowercase IDs", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "To Do", 2000],
		]);

		await Storage.open(core.projectRoot).createTask(buildTask("task-3", "To Do", 3000));

		const result = await core.reorderTask({
			taskId: "task-3",
			targetStatus: "To Do",
			orderedTaskIds: ["task-1", "task-3", "task-2"],
		});

		expect(result.updatedTask.id).toBe("TASK-3");
	});
});
