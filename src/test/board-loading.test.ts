import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/agentic-workspace.ts";
import type { AgenticWorkspaceConfig, Task } from "../types/index.ts";
import { createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Board Loading with checkActiveBranches", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-board-loading");
		core = new Core(TEST_DIR);
		await core.filesystem.ensureAgenticWorkspaceStructure();

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
		status,
		assignee: [],
		createdDate: "2025-01-08",
		labels: ["test"],
		dependencies: [],
		description: `This is test task ${id}`,
	});

	describe("Core.loadTasks()", () => {
		beforeEach(async () => {
			// Create some test tasks
			await core.createTask(createTestTask("task-1", "To Do"));
			await core.createTask(createTestTask("task-2", "In Progress"));
			await core.createTask(createTestTask("task-3", "Done"));

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

		it("should respect activeBranchDays configuration", async () => {
			// Create a new branch with an old commit date
			await $`git checkout -b old-branch`.cwd(TEST_DIR).quiet();
			await core.createTask(createTestTask("task-4", "To Do"));
			await $`git add .`.cwd(TEST_DIR).quiet();

			// Commit with an old date (40 days ago)
			const oldDate = new Date();
			oldDate.setDate(oldDate.getDate() - 40);
			const dateStr = oldDate.toISOString();
			await $`GIT_AUTHOR_DATE="${dateStr}" GIT_COMMITTER_DATE="${dateStr}" git commit -m "Old task"`
				.cwd(TEST_DIR)
				.quiet();

			await $`git checkout main`.cwd(TEST_DIR).quiet();

			// Set activeBranchDays to 30 (should exclude the old branch)
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Config not loaded");
			const updatedConfig: AgenticWorkspaceConfig = {
				...config,
				checkActiveBranches: true,
				activeBranchDays: 30,
			};
			await core.filesystem.saveConfig(updatedConfig);

			const tasks = await core.loadTasks();

			// The task-4 from old branch should not be included if branch checking is working
			// However, since we're in main branch, we should only see the 3 main tasks
			expect(tasks).toHaveLength(3);
			expect(tasks.find((t) => t.id === "TASK-4")).toBeUndefined();
		});

		it("should handle empty task list gracefully", async () => {
			// Remove all tasks
			await $`rm -rf agentic-workspace/tasks/*`.cwd(TEST_DIR).quiet();

			const tasks = await core.loadTasks();
			expect(tasks).toEqual([]);
		});
	});

	it("warns and skips completed branch history with an absent task schema version", async () => {
		await core.createTask(createTestTask("task-1"));
		await $`git add .`.cwd(TEST_DIR).quiet();
		await $`git commit -m "Add local task"`.cwd(TEST_DIR).quiet();
		await $`git checkout -b legacy-history`.cwd(TEST_DIR).quiet();
		await core.createTask(createTestTask("task-3"));
		await $`git add .`.cwd(TEST_DIR).quiet();
		await $`git commit -m "Add branch task"`.cwd(TEST_DIR).quiet();
		const completedLegacyPath = join(core.filesystem.completedDir, "task-2", "task.md");
		await mkdir(join(core.filesystem.completedDir, "task-2"), { recursive: true });
		await Bun.write(
			completedLegacyPath,
			"---\nid: TASK-2\ntitle: Legacy\nstatus: Done\nassignee: []\ncreated_date: '2026-10-01'\nlabels: []\ndependencies: []\n---\n",
		);
		await $`git add .`.cwd(TEST_DIR).quiet();
		await $`git commit -m "Add unversioned completed task"`.cwd(TEST_DIR).quiet();
		await $`git checkout main`.cwd(TEST_DIR).quiet();

		const warning = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const tasks = await core.loadTasks();
			expect(tasks.map((task) => task.id)).toContain("TASK-3");
			expect(tasks.map((task) => task.id)).not.toContain("TASK-2");
			expect(warning).toHaveBeenCalledWith(
				expect.stringContaining(
					"agentic-workspace/completed/task-2/task.md: Task TASK-2 has no task frontmatter schema version.",
				),
			);
		} finally {
			warning.mockRestore();
		}
	});

	describe("Config integration", () => {
		it("should use default values when config properties are undefined", async () => {
			// Save a minimal config without the branch-related settings
			const minimalConfig: AgenticWorkspaceConfig = {
				projectName: "Test Project",
				statuses: ["To Do", "In Progress", "Done"],
				defaultStatus: "To Do",
				labels: [],
				milestones: [],
				dateFormat: "yyyy-mm-dd",
			};
			await core.filesystem.saveConfig(minimalConfig);

			// Create a task to ensure we have something to load
			await core.createTask({
				id: "task-1",
				title: "Test Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-08",
				labels: [],
				dependencies: [],
				rawContent: "Test",
			});

			const tasks = await core.loadTasks();

			// Should still work with defaults
			expect(tasks.map((task) => task.id)).toEqual(["TASK-1"]);
		});

		it("should not load tasks from other branches when checkActiveBranches is false", async () => {
			// 0. Ensure main has at least one commit so it exists
			await core.createTask(createTestTask("TASK-900"));
			await $`git add .`.cwd(TEST_DIR).quiet();
			await $`git commit -m "Initial commit on main"`.cwd(TEST_DIR).quiet();

			// 1. Create a task on a different branch
			await $`git checkout -b other-branch`.cwd(TEST_DIR).quiet();
			const otherTask = createTestTask("TASK-901", "To Do");
			await core.createTask(otherTask);
			await $`git add .`.cwd(TEST_DIR).quiet();
			await $`git commit -m "Add task on other branch"`.cwd(TEST_DIR).quiet();

			// 2. Go back to main
			await $`git checkout main`.cwd(TEST_DIR).quiet();

			// 3. Disable checkActiveBranches
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Config not loaded");
			await core.filesystem.saveConfig({
				...config,
				checkActiveBranches: false,
			});

			// 4. Load tasks
			const tasks = await core.loadTasks();

			// 5. Verify task from other branch is NOT loaded
			expect(tasks.find((t) => t.id === "TASK-OTHER")).toBeUndefined();
			// Only the 1 task from main should be there
			expect(tasks).toHaveLength(1);
		});
	});
});
