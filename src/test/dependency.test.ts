import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { Task as TaskModel } from "../model/task/task.ts";
import type { Task } from "../model/types.ts";
import { Storage } from "../storage/storage.ts";
import { coreFileSystem, initializeFilesystemTestProject, waitUntil } from "./test-utils.ts";

describe("Task Dependencies", () => {
	let tempDir: string;
	let core: Core;

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "agentic-workspace-dependency-test-"));

		core = new Core(tempDir);
		await initializeFilesystemTestProject(core, "test-project");
		await core.tasks.init();
	});

	afterEach(() => {
		core.tasks.dispose();
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("should create task with dependencies", async () => {
		// Create base tasks first
		const task1: Task = {
			id: "TASK-1",
			title: "Base Task 1",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Base task",
		};

		const task2: Task = {
			id: "TASK-2",
			title: "Base Task 2",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Another base task",
		};

		await Storage.open(core.projectRoot).createTask(task1);
		await Storage.open(core.projectRoot).createTask(task2);

		// Create task with dependencies
		const dependentTask: Task = {
			id: "TASK-3",
			title: "Dependent Task",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["TASK-1", "TASK-2"],
			description: "Task that depends on others",
		};

		await Storage.open(core.projectRoot).createTask(dependentTask);

		// Verify the task was created with dependencies
		const savedTask = await coreFileSystem(core).loadTask("TASK-3");
		expect(savedTask).not.toBeNull();
		expect(savedTask?.dependencies).toEqual(["TASK-1", "TASK-2"]);
	});

	test("should update task dependencies", async () => {
		// Create base tasks
		const task1: Task = {
			id: "TASK-1",
			title: "Base Task 1",
			status: "To Do",
			done: false,
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Base task",
		};

		const task2: Task = {
			id: "TASK-2",
			title: "Base Task 2",
			status: "To Do",
			done: false,
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Another base task",
		};

		const task3: Task = {
			id: "TASK-3",
			title: "Task without dependencies",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Task without dependencies initially",
		};

		await Storage.open(core.projectRoot).createTask(task1);
		await Storage.open(core.projectRoot).createTask(task2);
		await Storage.open(core.projectRoot).createTask(task3);
		core.tasks.dispose();
		await core.tasks.init();

		// Update task to add dependencies
		await core.storage.withTaskLock(task3.id, async (current) => {
			const model = new TaskModel(current);
			model.replaceDependencies(["TASK-1", "TASK-2"], await core.loadTasks());
			await core.tasks.edit(model.task);
		});

		// Verify the dependencies were updated
		const savedTask = await coreFileSystem(core).loadTask("TASK-3");
		expect(savedTask).not.toBeNull();
		expect(savedTask?.dependencies).toEqual(["TASK-1", "TASK-2"]);
	});

	test("should serialize and deserialize dependencies correctly", async () => {
		const task: Task = {
			id: "TASK-1",
			title: "Task with multiple dependencies",
			done: false,
			status: "In Progress",
			createdDate: "2024-01-01",
			labels: ["feature", "backend"],
			dependencies: ["TASK-2", "TASK-3", "TASK-4"],
			description: "Task with various metadata and dependencies",
		};

		// Create dependency tasks first
		for (let i = 2; i <= 4; i++) {
			const depTask: Task = {
				id: `TASK-${i}`,
				title: `Dependency Task ${i}`,
				done: false,
				status: "To Do",
				createdDate: "2024-01-01",
				labels: [],
				dependencies: [],
				description: `Dependency task ${i}`,
			};
			await Storage.open(core.projectRoot).createTask(depTask);
		}

		await Storage.open(core.projectRoot).createTask(task);

		// Load the task back and verify all fields
		const loadedTask = await coreFileSystem(core).loadTask("TASK-1");
		expect(loadedTask).not.toBeNull();
		expect(loadedTask?.id).toBe("TASK-1");
		expect(loadedTask?.title).toBe("Task with multiple dependencies");
		expect(loadedTask?.status).toBe("In Progress");
		expect(loadedTask?.labels).toEqual(["feature", "backend"]);
		expect(loadedTask?.dependencies).toEqual(["TASK-2", "TASK-3", "TASK-4"]);
	});

	test("should handle empty dependencies array", async () => {
		const task: Task = {
			id: "TASK-1",
			title: "Task without dependencies",
			status: "To Do",
			done: false,
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Task without dependencies",
		};

		await Storage.open(core.projectRoot).createTask(task);

		const loadedTask = await coreFileSystem(core).loadTask("TASK-1");
		expect(loadedTask).not.toBeNull();
		expect(loadedTask?.dependencies).toEqual([]);
	});

	test("should sanitize archived task dependencies across the working copy and the completed corpus", async () => {
		const archivedTarget: Task = {
			id: "TASK-1",
			title: "Archive target",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: [],
			description: "Task that will be archived",
		};

		const activeDependent: Task = {
			id: "TASK-2",
			title: "Active dependent task",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["TASK-1"],
			description: "Depends on archive target",
		};

		const completedDependent: Task = {
			id: "TASK-3",
			title: "Completed dependent task",
			done: true,
			status: "Done",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["TASK-1"],
			description: "A completed record still resolves the ID, so it is cleaned too",
		};

		const childTask: Task = {
			id: "TASK-4",
			title: "Child task",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["TASK-1"],
			parentTaskId: "TASK-1",
			description: "Parent relationship is out of scope for archive sanitization",
		};

		await Storage.open(core.projectRoot).createTask(archivedTarget);
		await Storage.open(core.projectRoot).createTask(activeDependent);
		await Storage.open(core.projectRoot).createTask(completedDependent);
		await Storage.open(core.projectRoot).createTask(childTask);
		core.tasks.dispose();
		await core.tasks.init();
		await coreFileSystem(core).moveTaskContainer(
			(await core.tasks.getTask("TASK-3"))!,
			coreFileSystem(core).completedDir,
		);
		core.tasks.dispose();
		await core.tasks.init();
		await waitUntil(
			() => core.tasks.getCompletedTasks().some((task) => task.id === "TASK-3"),
			"TASK-3 entering the completed corpus",
		);

		const archived = await core.tasks.archive("TASK-1");
		expect(archived.success).toBe(true);
		expect(archived.cleanedTaskIds).toEqual(["TASK-2", "TASK-4", "TASK-3"]);

		const updatedActive = await coreFileSystem(core).loadTask("TASK-2");
		const updatedChild = await coreFileSystem(core).loadTask("TASK-4");
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

		const { task: archiveTarget } = await core.tasks.create({
			title: "Custom prefix target",
		});
		const { task: dependentTask } = await core.tasks.create({
			title: "Custom prefix dependent",
			dependencies: [archiveTarget.id],
		});

		const archived = await core.tasks.archive(archiveTarget.id);
		expect(archived.success).toBe(true);

		const updatedDependent = await coreFileSystem(core).loadTask(dependentTask.id);
		expect(updatedDependent?.dependencies).toEqual([]);
	});

	test("accepts a completed task as a dependency at create and edit time", async () => {
		const { task: predecessor } = await core.tasks.create({ title: "Finished predecessor", status: "Done" });
		expect((await core.tasks.markDone(predecessor.id)).changed).toBe(true);

		const { task: created } = await core.tasks.create({
			title: "Created after completion",
			dependencies: [predecessor.id],
		});
		expect(created.dependencies).toEqual([predecessor.id]);

		const { task: edited } = await core.tasks.create({ title: "Edited after completion" });
		await core.storage.withTaskLock(edited.id, async (current) => {
			const model = new TaskModel(current);
			model.replaceDependencies([predecessor.id], await core.loadTasks());
			await core.tasks.edit(model.task);
		});
		expect((await coreFileSystem(core).loadTask(edited.id))?.dependencies).toEqual([predecessor.id]);
	});

	test("accepts an archived task as a dependency at create and edit time", async () => {
		const { task: predecessor } = await core.tasks.create({ title: "Archived predecessor" });
		// Keep an active task with a higher ID so the allocator does not reuse the archived ID.
		const { task: edited } = await core.tasks.create({ title: "Edited after archive" });
		expect((await core.tasks.archive(predecessor.id)).success).toBe(true);

		const { task: created } = await core.tasks.create({
			title: "Created after archive",
			dependencies: [predecessor.id],
		});
		expect(created.dependencies).toEqual([predecessor.id]);

		await core.storage.withTaskLock(edited.id, async (current) => {
			const model = new TaskModel(current);
			model.replaceDependencies(
				[predecessor.id],
				[...(await core.loadTasks()), ...(await coreFileSystem(core).listArchivedTasks())],
			);
			await core.tasks.edit(model.task);
		});
		expect((await coreFileSystem(core).loadTask(edited.id))?.dependencies).toEqual([predecessor.id]);
	});

	test("re-editing the dependency list of a task whose predecessor completed keeps working", async () => {
		const { task: predecessor } = await core.tasks.create({ title: "Predecessor", status: "Done" });
		const { task: other } = await core.tasks.create({ title: "Other target" });
		const { task: dependent } = await core.tasks.create({
			title: "Dependent",
			dependencies: [predecessor.id],
		});

		expect((await core.tasks.markDone(predecessor.id)).changed).toBe(true);

		// --depends-on replaces the whole list, so the existing completed entry must revalidate too.
		await core.storage.withTaskLock(dependent.id, async (current) => {
			const model = new TaskModel(current);
			model.replaceDependencies([predecessor.id, other.id], await core.loadTasks());
			await core.tasks.edit(model.task);
		});
		expect((await coreFileSystem(core).loadTask(dependent.id))?.dependencies).toEqual([predecessor.id, other.id]);
	});
});

describe("Self-referential and cyclic dependencies", () => {
	let tempDir: string;
	let core: Core;

	beforeEach(async () => {
		tempDir = mkdtempSync(join(tmpdir(), "agentic-workspace-dependency-cycle-test-"));
		core = new Core(tempDir);
		await initializeFilesystemTestProject(core, "test-project");
		await core.tasks.init();
	});

	afterEach(() => {
		core.tasks.dispose();
		rmSync(tempDir, { recursive: true, force: true });
	});

	test("rejects a task depending on itself", async () => {
		const { task } = await core.tasks.create({ title: "Self" });
		await expect(
			core.storage.withTaskLock(task.id, async (current) => {
				const model = new TaskModel(current);
				model.replaceDependencies([task.id], await core.loadTasks());
				await core.tasks.edit(model.task);
			}),
		).rejects.toThrow("cannot depend on itself");
		await expect(
			core.storage.withTaskLock(task.id, async (current) => {
				const model = new TaskModel(current);
				model.addDependencies([task.id], await core.loadTasks());
				await core.tasks.edit(model.task);
			}),
		).rejects.toThrow("cannot depend on itself");
		expect((await coreFileSystem(core).loadTask(task.id))?.dependencies ?? []).toEqual([]);
	});

	test("rejects a dependency that closes a two-task cycle, naming the path", async () => {
		const { task: first } = await core.tasks.create({ title: "First" });
		const { task: second } = await core.tasks.create({ title: "Second", dependencies: [first.id] });

		await expect(
			core.storage.withTaskLock(first.id, async (current) => {
				const model = new TaskModel(current);
				model.addDependencies([second.id], await core.loadTasks());
				await core.tasks.edit(model.task);
			}),
		).rejects.toThrow(`These dependencies would create a cycle: ${first.id} -> ${second.id} -> ${first.id}`);
		expect((await coreFileSystem(core).loadTask(first.id))?.dependencies ?? []).toEqual([]);
	});

	test("rejects a dependency that closes a multi-hop cycle, naming the full path", async () => {
		const { task: first } = await core.tasks.create({ title: "First" });
		const { task: second } = await core.tasks.create({ title: "Second", dependencies: [first.id] });
		const { task: third } = await core.tasks.create({ title: "Third", dependencies: [second.id] });

		await expect(
			core.storage.withTaskLock(first.id, async (current) => {
				const model = new TaskModel(current);
				model.replaceDependencies([third.id], await core.loadTasks());
				await core.tasks.edit(model.task);
			}),
		).rejects.toThrow(
			`These dependencies would create a cycle: ${first.id} -> ${third.id} -> ${second.id} -> ${first.id}`,
		);
		expect((await coreFileSystem(core).loadTask(first.id))?.dependencies ?? []).toEqual([]);
	});

	test("rejects a create whose allocated ID would close a cycle through a dangling reference", async () => {
		// A dangling dependency on the next ID can only be stored out-of-band; materializing that ID
		// with a dependency pointing back must not store the cycle.
		await Storage.open(core.projectRoot).createTask({
			id: "TASK-1",
			title: "Dangling forward reference",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["TASK-2"],
		});
		core.tasks.dispose();
		await core.tasks.init();

		await expect(core.tasks.create({ title: "Closes the loop", dependencies: ["TASK-1"] })).rejects.toThrow(
			"would create a cycle",
		);
		expect(await coreFileSystem(core).loadTask("TASK-2")).toBeNull();
	});

	test("repairing a stored cycle by replacing the dependency list succeeds", async () => {
		const storedTask = (id: string, dependencies: string[]): Task => ({
			id,
			title: `Stored ${id}`,
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies,
		});
		await Storage.open(core.projectRoot).createTask(storedTask("TASK-1", ["TASK-2"]));
		await Storage.open(core.projectRoot).createTask(storedTask("TASK-2", ["TASK-1"]));
		core.tasks.dispose();
		await core.tasks.init();
		const { task: other } = await core.tasks.create({ title: "Clean target" });

		// The stored record's own outgoing edges must not veto the repair that removes them.
		await core.storage.withTaskLock("TASK-1", async (current) => {
			const model = new TaskModel(current);
			model.replaceDependencies([other.id], await core.loadTasks());
			await core.tasks.edit(model.task);
		});
		expect((await coreFileSystem(core).loadTask("TASK-1"))?.dependencies).toEqual([other.id]);

		// A proposed list that is itself cyclic stays rejected.
		await expect(
			core.storage.withTaskLock("TASK-1", async (current) => {
				const model = new TaskModel(current);
				model.replaceDependencies(["TASK-2"], await core.loadTasks());
				await core.tasks.edit(model.task);
			}),
		).rejects.toThrow("would create a cycle");
	});

	test("a stored self-dependency does not block adding an unrelated dependency", async () => {
		const { task: other } = await core.tasks.create({ title: "Other" });
		const storedTask: Task = {
			id: "TASK-9",
			title: "Stored self-dependent",
			done: false,
			status: "To Do",
			createdDate: "2024-01-01",
			labels: [],
			dependencies: ["TASK-9"],
		};
		await Storage.open(core.projectRoot).createTask(storedTask);
		core.tasks.dispose();
		await core.tasks.init();

		await core.storage.withTaskLock(storedTask.id, async (current) => {
			const model = new TaskModel(current);
			model.addDependencies([other.id], await core.loadTasks());
			await core.tasks.edit(model.task);
		});
		expect((await coreFileSystem(core).loadTask(storedTask.id))?.dependencies).toEqual(["TASK-9", other.id]);
	});
});
