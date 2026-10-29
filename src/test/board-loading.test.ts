import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import type { AgenticWorkspaceConfig, Task } from "../model/types.ts";
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

describe("Board Loading", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-board-loading");
		core = new Core(TEST_DIR);
		await initializeFilesystemTestWorkspace(coreFileSystem(core));

		// Initialize git repository for testing
		initGitRepo(TEST_DIR);

		// Initialize project with default config
		await initializeTestProject(core, "Test Project", false);
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	const createTestTask = (id: string, status = "To Do"): Task => ({
		id,
		title: `Test Task ${id}`,
		done: false,
		status,
		createdDate: "2025-01-08",
		labels: ["test"],
		dependencies: [],
		description: `This is test task ${id}`,
	});

	describe("Core.loadTasks()", () => {
		beforeEach(async () => {
			// Create some test tasks
			await new Storage(coreFileSystem(core)).createTask(createTestTask("task-1", "To Do"));
			await new Storage(coreFileSystem(core)).createTask(createTestTask("task-2", "In Progress"));
			await new Storage(coreFileSystem(core)).createTask(createTestTask("task-3", "Done"));

			// Commit them to have a clean state
			await $`git add .`.cwd(TEST_DIR).quiet();
			await $`git commit -m "Add test tasks"`.cwd(TEST_DIR).quiet();
		});

		it("should load tasks with default configuration", async () => {
			const tasks = await core.loadTasks();

			expect(tasks).toHaveLength(3);
			expect(tasks.find((t) => t.id === "TASK-1")).toBeDefined();
			expect(tasks.find((t) => t.id === "TASK-2")).toBeDefined();
			expect(tasks.find((t) => t.id === "TASK-3")).toBeDefined();
		});

		it("should handle empty task list gracefully", async () => {
			// Remove all tasks
			const tasksDir = coreFileSystem(core).tasksDir;
			await rm(tasksDir, { recursive: true, force: true });
			await mkdir(tasksDir, { recursive: true });

			const tasks = await core.loadTasks();
			expect(tasks).toEqual([]);
		});
	});

	describe("Config integration", () => {
		it("should use default values when config properties are undefined", async () => {
			// Save a minimal config without the branch-related settings
			const minimalConfig: AgenticWorkspaceConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				defaultStatus: "To Do",
				labels: [],
				dateFormat: "yyyy-mm-dd",
			};
			await coreFileSystem(core).saveConfig(minimalConfig);

			// Create a task to ensure we have something to load
			await new Storage(coreFileSystem(core)).createTask({
				id: "task-1",
				title: "Test Task",
				done: false,
				status: "To Do",
				createdDate: "2025-01-08",
				labels: [],
				dependencies: [],
				rawContent: "Test",
			});

			const tasks = await core.loadTasks();

			// Should still work with defaults
			expect(tasks.map((task) => task.id)).toEqual(["TASK-1"]);
		});
	});
});
