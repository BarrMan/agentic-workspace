import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import type { Task } from "../model/types.ts";
import { coreFileSystem, initializeFilesystemTestProject } from "./test-utils.ts";

describe("Task Dependencies", () => {
	let tempDir: string;
	let core: Core;

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "agentic-workspace-dependency-test-"));

		core = new Core(tempDir);
		await initializeFilesystemTestProject(core, "test-project");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("should create task with dependencies", async () => {
		// Create base tasks first
		const task1: Task = {
			id: "task-1",
			title: "Base Task 1",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Base task",
		};

		const task2: Task = {
			id: "task-2",
			title: "Base Task 2",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Another base task",
		};

		await core.createTask(task1);
		await core.createTask(task2);

		// Create task with dependencies
		const dependentTask: Task = {
			id: "task-3",
			title: "Dependent Task",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["task-1", "task-2"],
			description: "Task that depends on others",
		};

		await core.createTask(dependentTask);

		// Verify the task was created with dependencies
		const savedTask = await coreFileSystem(core).loadTask("task-3");
		expect(savedTask).not.toBeNull();
		expect(savedTask?.dependencies).toEqual(["task-1", "task-2"]);
	});

	test("should update task dependencies", async () => {
		// Create base tasks
		const task1: Task = {
			id: "task-1",
			title: "Base Task 1",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Base task",
		};

		const task2: Task = {
			id: "task-2",
			title: "Base Task 2",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Another base task",
		};

		const task3: Task = {
			id: "task-3",
			title: "Task without dependencies",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Task without dependencies initially",
		};

		await core.createTask(task1);
		await core.createTask(task2);
		await core.createTask(task3);

		// Update task to add dependencies
		await core.updateTaskFromInput(task3.id, { dependencies: ["task-1", "task-2"] });

		// Verify the dependencies were updated
		const savedTask = await coreFileSystem(core).loadTask("task-3");
		expect(savedTask).not.toBeNull();
		expect(savedTask?.dependencies).toEqual(["TASK-1", "TASK-2"]);
	});

	test("should serialize and deserialize dependencies correctly", async () => {
		const task: Task = {
			id: "task-1",
			title: "Task with multiple dependencies",
			status: "In Progress",
			createdDate: "2024-01-01",
			labels: ["feature", "backend"],
			dependencies: ["task-2", "task-3", "task-4"],
			description: "Task with various metadata and dependencies",
		};

		// Create dependency tasks first
		for (let i = 2; i <= 4; i++) {
			const depTask: Task = {
				id: `task-${i}`,
				title: `Dependency Task ${i}`,
				status: "To Do",
				createdDate: "2024-01-01",
				labels: [],
				dependencies: [],
				description: `Dependency task ${i}`,
			};
			await core.createTask(depTask);
		}

		await core.createTask(task);

		// Load the task back and verify all fields
		const loadedTask = await coreFileSystem(core).loadTask("task-1");
		expect(loadedTask).not.toBeNull();
		expect(loadedTask?.id).toBe("TASK-1");
		expect(loadedTask?.title).toBe("Task with multiple dependencies");
		expect(loadedTask?.status).toBe("In Progress");
		expect(loadedTask?.labels).toEqual(["feature", "backend"]);
		expect(loadedTask?.dependencies).toEqual(["task-2", "task-3", "task-4"]);
	});

	test("should handle empty dependencies array", async () => {
		const task: Task = {
			id: "task-1",
			title: "Task without dependencies",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Task without dependencies",
		};

		await core.createTask(task);

		const loadedTask = await coreFileSystem(core).loadTask("task-1");
		expect(loadedTask).not.toBeNull();
		expect(loadedTask?.dependencies).toEqual([]);
	});

	test("should sanitize archived task dependencies across the working copy and the completed corpus", async () => {
		const archivedTarget: Task = {
			id: "task-1",
			title: "Archive target",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Task that will be archived",
		};

		const activeDependent: Task = {
			id: "task-2",
			title: "Active dependent task",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["TASK-1", "task-1"],
			description: "Depends on archive target",
		};

		const completedDependent: Task = {
			id: "task-3",
			title: "Completed dependent task",
			status: "Done",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["task-1"],
			description: "A completed record still resolves the ID, so it is cleaned too",
		};

		const childTask: Task = {
			id: "task-4",
			title: "Child task",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["task-1"],
			parentTaskId: "task-1",
			description: "Parent relationship is out of scope for archive sanitization",
		};

		await core.createTask(archivedTarget);
		await core.createTask(activeDependent);
		await core.createTask(completedDependent);
		await core.createTask(childTask);
		await core.completeTask("task-3");

		const archived = await core.archiveTask("task-1");
		expect(archived.success).toBe(true);
		expect(archived.cleanedTaskIds).toEqual(["TASK-2", "TASK-4", "TASK-3"]);

		const updatedActive = await coreFileSystem(core).loadTask("task-2");
		const updatedChild = await coreFileSystem(core).loadTask("task-4");
		const completedTasks = await coreFileSystem(core).listCompletedTasks();
		const completed = completedTasks.find((task) => task.id === "TASK-3");

		expect(updatedActive?.dependencies).toEqual([]);
		expect(updatedChild?.dependencies).toEqual([]);
		expect(updatedChild?.parentTaskId).toBe("TASK-1");
		expect(completed?.dependencies).toEqual([]);
	});

	test("should sanitize archive links when archiving by full id with custom task prefix", async () => {
		const config = await coreFileSystem(core).loadConfig();
		expect(config).not.toBeNull();
		if (!config) {
			return;
		}
		config.prefixes = { task: "back" };
		await coreFileSystem(core).saveConfig(config);

		const { task: archiveTarget } = await core.createTaskFromInput({
			title: "Custom prefix target",
		});
		const { task: dependentTask } = await core.createTaskFromInput({
			title: "Custom prefix dependent",
			dependencies: [archiveTarget.id],
		});

		const archived = await core.archiveTask(archiveTarget.id);
		expect(archived.success).toBe(true);

		const updatedDependent = await coreFileSystem(core).loadTask(dependentTask.id);
		expect(updatedDependent?.dependencies).toEqual([]);
	});

	test("accepts a completed task as a dependency at create and edit time", async () => {
		const { task: predecessor } = await core.createTaskFromInput({ title: "Finished predecessor", status: "Done" });
		expect(await core.completeTask(predecessor.id)).toBe(true);

		const { task: created } = await core.createTaskFromInput({
			title: "Created after completion",
			dependencies: [predecessor.id],
		});
		expect(created.dependencies).toEqual([predecessor.id]);

		const { task: edited } = await core.createTaskFromInput({ title: "Edited after completion" });
		await core.updateTaskFromInput(edited.id, { dependencies: [predecessor.id] });
		expect((await coreFileSystem(core).loadTask(edited.id))?.dependencies).toEqual([predecessor.id]);
	});

	test("accepts an archived task as a dependency at create and edit time", async () => {
		const { task: predecessor } = await core.createTaskFromInput({ title: "Archived predecessor" });
		// Keep an active task with a higher ID so the allocator does not reuse the archived ID.
		const { task: edited } = await core.createTaskFromInput({ title: "Edited after archive" });
		expect((await core.archiveTask(predecessor.id)).success).toBe(true);

		const { task: created } = await core.createTaskFromInput({
			title: "Created after archive",
			dependencies: [predecessor.id],
		});
		expect(created.dependencies).toEqual([predecessor.id]);

		await core.updateTaskFromInput(edited.id, { dependencies: [predecessor.id] });
		expect((await coreFileSystem(core).loadTask(edited.id))?.dependencies).toEqual([predecessor.id]);
	});

	test("re-editing the dependency list of a task whose predecessor completed keeps working", async () => {
		const { task: predecessor } = await core.createTaskFromInput({ title: "Predecessor", status: "Done" });
		const { task: other } = await core.createTaskFromInput({ title: "Other target" });
		const { task: dependent } = await core.createTaskFromInput({
			title: "Dependent",
			dependencies: [predecessor.id],
		});

		expect(await core.completeTask(predecessor.id)).toBe(true);

		// --depends-on replaces the whole list, so the existing completed entry must revalidate too.
		await core.updateTaskFromInput(dependent.id, { dependencies: [predecessor.id, other.id] });
		expect((await coreFileSystem(core).loadTask(dependent.id))?.dependencies).toEqual([predecessor.id, other.id]);
	});

	test("fails closed when a completed task and an active file claim the same identity", async () => {
		const { task: predecessor } = await core.createTaskFromInput({ title: "Predecessor", status: "Done" });
		const { task: dependent } = await core.createTaskFromInput({ title: "Dependent" });
		expect(await core.completeTask(predecessor.id)).toBe(true);

		// Recreate the completed task's file in the active tasks directory so two files claim its ID.
		const completed = (await coreFileSystem(core).listCompletedTasks()).find((task) => task.id === predecessor.id);
		expect(completed?.filePath).toBeDefined();
		if (!completed?.filePath) return;
		const duplicatePath = join(coreFileSystem(core).tasksDir, "task-1", "task.md");
		await mkdir(join(coreFileSystem(core).tasksDir, "task-1"), { recursive: true });
		await Bun.write(duplicatePath, await Bun.file(completed.filePath).text());

		await expect(core.updateTaskFromInput(dependent.id, { dependencies: [predecessor.id] })).rejects.toThrow(
			/ambiguous/,
		);
		expect((await coreFileSystem(core).loadTask(dependent.id))?.dependencies ?? []).toEqual([]);
	});
});

describe("Self-referential and cyclic dependencies", () => {
	let tempDir: string;
	let core: Core;

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "agentic-workspace-dependency-cycle-test-"));
		core = new Core(tempDir);
		await initializeFilesystemTestProject(core, "test-project");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("rejects a task depending on itself, in its own spelling and in alias forms", async () => {
		const { task } = await core.createTaskFromInput({ title: "Self" });
		const match = task.id.match(/^(.+)-0*(\d+)$/);
		expect(match).not.toBeNull();
		if (!match) return;
		const [, prefix, digits] = match;
		const aliases = [task.id, task.id.toLowerCase(), task.id.toUpperCase()];
		for (const alias of aliases) {
			await expect(core.updateTaskFromInput(task.id, { dependencies: [alias] })).rejects.toThrow(
				"cannot depend on itself",
			);
			await expect(core.updateTaskFromInput(task.id, { addDependencies: [alias] })).rejects.toThrow(
				"cannot depend on itself",
			);
		}
		await expect(core.updateTaskFromInput(task.id, { dependencies: [`${prefix}-00${digits}`] })).rejects.toThrow(
			"The following dependencies do not exist",
		);
		expect((await coreFileSystem(core).loadTask(task.id))?.dependencies ?? []).toEqual([]);
	});

	test("rejects a dependency that closes a two-task cycle, naming the path", async () => {
		const { task: first } = await core.createTaskFromInput({ title: "First" });
		const { task: second } = await core.createTaskFromInput({ title: "Second", dependencies: [first.id] });

		await expect(core.updateTaskFromInput(first.id, { addDependencies: [second.id] })).rejects.toThrow(
			`These dependencies would create a cycle: ${first.id} -> ${second.id} -> ${first.id}`,
		);
		expect((await coreFileSystem(core).loadTask(first.id))?.dependencies ?? []).toEqual([]);
	});

	test("rejects a dependency that closes a multi-hop cycle, naming the full path", async () => {
		const { task: first } = await core.createTaskFromInput({ title: "First" });
		const { task: second } = await core.createTaskFromInput({ title: "Second", dependencies: [first.id] });
		const { task: third } = await core.createTaskFromInput({ title: "Third", dependencies: [second.id] });

		await expect(core.updateTaskFromInput(first.id, { dependencies: [third.id] })).rejects.toThrow(
			`These dependencies would create a cycle: ${first.id} -> ${third.id} -> ${second.id} -> ${first.id}`,
		);
		expect((await coreFileSystem(core).loadTask(first.id))?.dependencies ?? []).toEqual([]);
	});

	test("rejects a create whose allocated ID would close a cycle through a dangling reference", async () => {
		// A dangling dependency on the next ID can only be stored out-of-band; materializing that ID
		// with a dependency pointing back must not store the cycle.
		await core.createTask({
			id: "task-1",
			title: "Dangling forward reference",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["task-2"],
		});

		await expect(core.createTaskFromInput({ title: "Closes the loop", dependencies: ["task-1"] })).rejects.toThrow(
			"would create a cycle",
		);
		expect(await coreFileSystem(core).loadTask("task-2")).toBeNull();
	});

	test("repairing a stored cycle by replacing the dependency list succeeds", async () => {
		const storedTask = (id: string, dependencies: string[]): Task => ({
			id,
			title: `Stored ${id}`,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies,
		});
		await core.createTask(storedTask("task-1", ["task-2"]));
		await core.createTask(storedTask("task-2", ["task-1"]));
		const { task: other } = await core.createTaskFromInput({ title: "Clean target" });

		// The stored record's own outgoing edges must not veto the repair that removes them.
		await core.updateTaskFromInput("task-1", { dependencies: [other.id] });
		expect((await coreFileSystem(core).loadTask("task-1"))?.dependencies).toEqual([other.id]);

		// A proposed list that is itself cyclic stays rejected.
		await expect(core.updateTaskFromInput("task-1", { dependencies: ["task-2"] })).rejects.toThrow(
			"would create a cycle",
		);
	});

	test("fails closed when a forward path crosses an ambiguous identity", async () => {
		const record = (id: string, title: string, dependencies: string[]): Task => ({
			id,
			title,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies,
		});
		await core.createTask(record("task-1", "Root", []));
		await core.createTask(record("task-2", "Middle", ["task-3"]));
		// Two records claim TASK-3 across stores: one completed, one active. The graph refuses to
		// traverse the contested identity, so the return path behind it must fail the edit closed.
		await core.createTask({ ...record("task-3", "Contested", ["task-1"]), status: "Done" });
		expect(await core.completeTask("task-3")).toBe(true);
		const completed = (await coreFileSystem(core).listCompletedTasks()).find((task) => taskIdsEqual(task.id, "task-3"));
		expect(completed?.filePath).toBeDefined();
		if (!completed?.filePath) return;
		const duplicateDirectory = join(coreFileSystem(core).tasksDir, "task-3");
		await mkdir(duplicateDirectory, { recursive: true });
		await Bun.write(join(duplicateDirectory, "task.md"), await Bun.file(completed.filePath).text());

		await expect(core.updateTaskFromInput("task-1", { dependencies: ["task-2"] })).rejects.toThrow(
			"more than one record claims",
		);
		expect((await coreFileSystem(core).loadTask("task-1"))?.dependencies ?? []).toEqual([]);
	});

	test("a stored self-dependency does not block adding an unrelated dependency", async () => {
		const { task: other } = await core.createTaskFromInput({ title: "Other" });
		const storedTask: Task = {
			id: "task-9",
			title: "Stored self-dependent",
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["task-9"],
		};
		await core.createTask(storedTask);

		await core.updateTaskFromInput(storedTask.id, { addDependencies: [other.id] });
		expect((await coreFileSystem(core).loadTask(storedTask.id))?.dependencies).toEqual(["task-9", other.id]);
	});
});
