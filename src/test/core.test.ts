import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { Storage } from "../storage/storage.ts";
import {
	coreFileSystem,
	createUniqueTestDir,
	initGitRepo,
	initializeFilesystemTestWorkspace,
	initializeTestProject,
	safeCleanup,
} from "./test-utils.ts";

let TEST_DIR: string;

async function writeTaskFixture(path: string, task: Task): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, serializeTask(task));
}

describe("Core", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-core");
		core = new Core(TEST_DIR);
		await initializeFilesystemTestWorkspace(coreFileSystem(core));

		initGitRepo(TEST_DIR);
	});

	afterEach(async () => {
		core.tasks.dispose();
		await safeCleanup(TEST_DIR);
	});

	describe("initialization", () => {
		it("should initialize project with default config", async () => {
			await initializeTestProject(core, "Test Project", true);

			const config = await coreFileSystem(core).loadConfig();
			expect(config?.projectName).toBe("Test Project");
			expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
			expect(config?.defaultStatus).toBe("To Do");
		});

		it("should use root agentic-workspace.config.yml for custom agentic-workspace directories", async () => {
			await initializeTestProject(core, "Custom Root Project", false, "planning/agentic-workspace-data");

			expect(await Bun.file(join(TEST_DIR, "agentic-workspace.config.yml")).exists()).toBe(true);
			expect(await Bun.file(join(TEST_DIR, "planning", "agentic-workspace-data", "config.yml")).exists()).toBe(false);

			const freshCore = new Core(TEST_DIR);
			const config = await coreFileSystem(freshCore).loadConfig();
			expect(config?.projectName).toBe("Custom Root Project");
			expect(coreFileSystem(freshCore).agenticWorkspaceDirName).toBe("planning/agentic-workspace-data");
		});
	});

	describe("task operations", () => {
		const sampleTask: Task = {
			id: "TASK-1",
			title: "Test Task",
			status: "To Do",
			done: false,
			createdDate: "2025-06-07",
			labels: ["test"],
			dependencies: [],
			description: "This is a test task",
		};

		beforeEach(async () => {
			await initializeTestProject(core, "Test Project");
			await core.tasks.init();
		});

		it("should create task without committing", async () => {
			await Storage.open(core.projectRoot).createTask(sampleTask);

			const loadedTask = await coreFileSystem(core).loadTask("task-1");
			expect(loadedTask?.id).toBe("TASK-1");
			expect(loadedTask?.title).toBe("Test Task");
		});

		it("makes archived lifecycle state unavailable to the next persistent read", async () => {
			const { task } = await core.tasks.create({ title: sampleTask.title, status: sampleTask.status });
			expect((await core.tasks.archive(task.id)).success).toBe(true);
			expect(await core.tasks.getTask(sampleTask.id)).toBeNull();
			expect(core.tasks.getActiveTasks()).toEqual([]);
		});

		it("does not update a longer numeric sibling for a shorter numeric ID", async () => {
			await Storage.open(core.projectRoot).createTask({ ...sampleTask, id: "BACK-12", title: "Longer sibling" });

			await expect(
				core.storage.withTaskLock("BACK-1", async (current) => core.tasks.edit({ ...current, title: "Wrong target" })),
			).rejects.toThrow("Task not found: BACK-1");
			expect((await coreFileSystem(core).loadTask("BACK-12"))?.title).toBe("Longer sibling");
		});

		it("keeps active and completed identities at distinct paths when completed tasks are included", async () => {
			const activePath = await coreFileSystem(core).saveTask(
				{
					...sampleTask,
					id: "TASK-1",
					title: "Active identity",
				},
				{ create: true },
			);
			const completedPath = join(coreFileSystem(core).completedDir, "task-001", "task.md");
			await writeTaskFixture(completedPath, {
				...sampleTask,
				id: "TASK-001",
				title: "Completed identity",
				status: "Done",
			});
			core.tasks.dispose();
			await core.tasks.init();

			const tasks = await core.loadTasks(undefined, undefined, { includeCompleted: true });
			expect(tasks.map((task) => task.title).sort()).toEqual(["Active identity", "Completed identity"]);
			expect((await core.loadTasks()).map((task) => task.title)).toEqual(["Active identity"]);
			const statisticsTasks = (await core.loadAllTasksForStatistics()).tasks;
			expect(statisticsTasks.map((task) => task.title).sort()).toEqual(["Active identity", "Completed identity"]);
			expect(activePath).not.toBe(completedPath);
			expect(await core.tasks.getTask("TASK-1")).toMatchObject({ id: "TASK-1", title: "Active identity" });
			expect(await core.tasks.getTask("TASK-001")).toMatchObject({ id: "TASK-001", title: "Completed identity" });
		});

		it("rejects a stored task ID outside the numeric ID grammar without changing its bytes", async () => {
			await mkdir(join(coreFileSystem(core).tasksDir, "task-prefixed"), { recursive: true });
			const filepath = join(coreFileSystem(core).tasksDir, "task-prefixed", "task.md");
			const content = serializeTask({ ...sampleTask, id: "TASK-PREFIXED", title: "Historical task" });
			await Bun.write(filepath, content);

			await expect(core.tasks.getTask("task-prefixed")).rejects.toThrow(/Invalid task ID.*PREFIX-NUMBER/);
			expect(await Bun.file(filepath).text()).toBe(content);
		});

		it("resolves distinct padded task IDs from their own canonical containers", async () => {
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "task-1", "task.md"), {
				...sampleTask,
				id: "TASK-1",
				title: "First",
			});
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "task-01", "task.md"), {
				...sampleTask,
				id: "TASK-01",
				title: "Second",
			});
			core.tasks.dispose();
			await core.tasks.init();

			expect(await core.tasks.getTask("TASK-1")).toMatchObject({ id: "TASK-1", title: "First" });
			expect(await core.tasks.getTask("TASK-01")).toMatchObject({ id: "TASK-01", title: "Second" });
		});

		it("assigns ordinal 1000 to the first created task when none exist", async () => {
			const { task } = await core.tasks.create({ title: "First ordinal task" });
			expect(task.ordinal).toBe(1000);

			const loadedTask = await coreFileSystem(core).loadTask(task.id);
			expect(loadedTask?.ordinal).toBe(1000);
		});

		it("assigns the next tail ordinal when existing tasks already have ordinals", async () => {
			await Storage.open(core.projectRoot).createTask({
				...sampleTask,
				id: "task-10",
				title: "Seed 1000",
				ordinal: 1000,
			});
			await Storage.open(core.projectRoot).createTask({
				...sampleTask,
				id: "task-11",
				title: "Seed 4000",
				ordinal: 4000,
			});

			const { task } = await core.tasks.create({ title: "Appended ordinal task" });
			expect(task.ordinal).toBe(5000);
		});

		it("preserves explicit ordinals on create input", async () => {
			const { task } = await core.tasks.create({
				title: "Explicit ordinal task",
				ordinal: 2750,
			});
			expect(task.ordinal).toBe(2750);
		});

		it("rejects non-finite ordinals on create input", async () => {
			await expect(
				core.tasks.create({
					title: "Invalid ordinal task",
					ordinal: Number.POSITIVE_INFINITY,
				}),
			).rejects.toThrow("Ordinal must be a non-negative number.");
		});

		it("ignores tasks without ordinals when computing the next tail ordinal", async () => {
			await Storage.open(core.projectRoot).createTask({
				...sampleTask,
				id: "task-20",
				title: "No ordinal seed",
			});
			await Storage.open(core.projectRoot).createTask({
				...sampleTask,
				id: "task-21",
				title: "Ordinal seed",
				ordinal: 3000,
			});

			const { task } = await core.tasks.create({ title: "Mixed ordinal task" });
			expect(task.ordinal).toBe(4000);
		});

		it("preserves no-ordinal ordering when no existing tasks have ordinals", async () => {
			await Storage.open(core.projectRoot).createTask({
				...sampleTask,
				id: "task-20",
				title: "Historical no ordinal seed",
			});

			const { task } = await core.tasks.create({ title: "Historical appended task" });
			expect(task.ordinal).toBeUndefined();

			const loadedTask = await coreFileSystem(core).loadTask(task.id);
			expect(loadedTask?.ordinal).toBeUndefined();
		});

		it("should NOT match numeric ID with typos when using custom prefix (BACK-364)", async () => {
			// Configure custom prefix
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				prefixes: { task: "back" },
			});

			// Create task with custom prefix
			const task: Task = { ...sampleTask, id: "back-358", title: "Custom Prefix Task" };
			await Storage.open(core.projectRoot).createTask(task);

			// Typos should NOT match (prevent parseInt coercion bug)
			await expect(core.tasks.getTask("358a")).rejects.toThrow(/Invalid task ID.*PREFIX-NUMBER/);

			await expect(core.tasks.getTask("35x8")).rejects.toThrow(/Invalid task ID.*PREFIX-NUMBER/);
		});

		it("should return false when archiving non-existent task", async () => {
			const archived = await core.tasks.archive("TASK-999");
			expect(archived.success).toBe(false);
		});

		it("should apply default status when task has empty status", async () => {
			const taskWithoutStatus: Task = {
				...sampleTask,
				status: "",
			};

			await core.tasks.create(taskWithoutStatus);

			const loadedTask = await coreFileSystem(core).loadTask("task-1");
			expect(loadedTask?.status).toBe("To Do"); // Should use default from config
		});

		it("should not override existing status", async () => {
			const taskWithStatus: Task = {
				...sampleTask,
				status: "In Progress",
			};

			await core.tasks.create(taskWithStatus);

			const loadedTask = await coreFileSystem(core).loadTask("task-1");
			expect(loadedTask?.status).toBe("In Progress");
		});

		it("stores description in frontmatter without adding body markers", async () => {
			const taskNoHeader: Task = {
				...sampleTask,
				id: "task-2",
				description: "Just text",
			};

			await Storage.open(core.projectRoot).createTask(taskNoHeader);
			const loaded = await coreFileSystem(core).loadTask("task-2");
			expect(loaded?.description).toBe("Just text");
			const body = await Storage.open(core.projectRoot).loadTaskContent("task-2");
			expect(body).toContain("description: Just text");
			expect(body).not.toContain("## Description");
		});

		it("keeps body content opaque when description resembles a heading", async () => {
			const taskWithHeader: Task = {
				...sampleTask,
				id: "task-3",
				description: "Existing",
				rawContent: "## Description\n\nFree-form note",
			};

			await Storage.open(core.projectRoot).createTask(taskWithHeader);
			const body = await Storage.open(core.projectRoot).loadTaskContent("task-3");
			expect(body).toEndWith("## Description\n\nFree-form note");
		});

		it("should handle task creation without committing when git fails", async () => {
			// Create task in directory without git
			const nonGitCore = new Core(join(TEST_DIR, "no-git"));
			await mkdir(nonGitCore.projectRoot, { recursive: true });
			await initializeFilesystemTestWorkspace(coreFileSystem(nonGitCore));

			// This should succeed even without git
			await Storage.open(nonGitCore.projectRoot).createTask(sampleTask);

			const loadedTask = await coreFileSystem(nonGitCore).loadTask("task-1");
			expect(loadedTask?.id).toBe("TASK-1");
		});

		it("matches labels by trimmed case-insensitive identity when adding and removing", async () => {
			await Storage.open(core.projectRoot).createTask({ ...sampleTask, labels: [" UI "] });

			await core.storage.withTaskLock("task-1", async (current) =>
				core.tasks.edit({
					...current,
					labels: current.labels.some((label) => label.trim().toLowerCase() === "ui")
						? current.labels
						: [...current.labels, "ui"],
				}),
			);
			expect((await coreFileSystem(core).loadTask("task-1"))?.labels).toEqual([" UI "]);

			await core.storage.withTaskLock("task-1", async (current) =>
				core.tasks.edit({ ...current, labels: current.labels.filter((label) => label.trim().toLowerCase() !== "ui") }),
			);
			expect((await coreFileSystem(core).loadTask("task-1"))?.labels).toEqual([]);
		});

		it("should create sub-tasks with proper hierarchical IDs", async () => {
			await initializeTestProject(core, "Subtask Project", true);

			// Create parent task
			const { task: parent } = await core.tasks.create({
				title: "Parent Task",
				status: "To Do",
			});
			expect(parent.id).toBe("TASK-1");

			// Create first sub-task
			const { task: child1 } = await core.tasks.create({
				title: "First Child",
				parentTaskId: parent.id,
				status: "To Do",
			});
			expect(child1.id).toBe("TASK-1.1");
			expect(child1.parentTaskId).toBe("TASK-1");

			// Create second sub-task
			const { task: child2 } = await core.tasks.create({
				title: "Second Child",
				parentTaskId: parent.id,
				status: "To Do",
			});
			expect(child2.id).toBe("TASK-1.2");
			expect(child2.parentTaskId).toBe("TASK-1");

			// Create another parent task to ensure sequential numbering still works
			const { task: parent2 } = await core.tasks.create({
				title: "Second Parent",
				status: "To Do",
			});
			expect(parent2.id).toBe("TASK-2");
		});
	});

	describe("integration with config", () => {
		it("should use custom default status from config", async () => {
			// Initialize with custom config
			await initializeTestProject(core, "Custom Project");

			// Update config with custom default status
			const config = await coreFileSystem(core).loadConfig();
			if (config) {
				config.statuses.push("Custom Status");
				config.defaultStatus = "Custom Status";
				await coreFileSystem(core).saveConfig(config);
			}

			const taskWithoutStatus: Task = {
				id: "task-990",
				title: "Custom Task",
				status: "",
				done: false,
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task without status",
			};

			const { task } = await core.tasks.create(taskWithoutStatus);

			const loadedTask = await coreFileSystem(core).loadTask(task.id);
			expect(loadedTask?.status).toBe("Custom Status");
		});

		it("should fall back to To Do when config has no default status", async () => {
			// Initialize project
			await initializeTestProject(core, "Fallback Project");

			// Update config to remove default status
			const config = await coreFileSystem(core).loadConfig();
			if (config) {
				config.defaultStatus = undefined;
				await coreFileSystem(core).saveConfig(config);
			}

			const taskWithoutStatus: Task = {
				id: "task-991",
				title: "Fallback Task",
				status: "",
				done: false,
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task without status",
			};

			const { task } = await core.tasks.create(taskWithoutStatus);

			const loadedTask = await coreFileSystem(core).loadTask(task.id);
			expect(loadedTask?.status).toBe("To Do");
		});
	});
});
