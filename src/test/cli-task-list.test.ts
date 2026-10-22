import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ as shell } from "bun";
import { Core } from "../index.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI Integration", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli");
		await mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("task list command", () => {
		beforeEach(async () => {
			// Set up a git repository and initialize agentic-workspace
			await shell`git init -b main`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await initializeTestProject(core, "List Test Project");
		});

		it("should show 'No tasks found' when no tasks exist", async () => {
			const result = await runInProcessCli(["task", "list", "--plain"], { cwd: TEST_DIR });

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("No tasks found");
		});

		it("should list tasks grouped by status", async () => {
			const core = new Core(TEST_DIR);

			// Create test tasks with different statuses
			await core.createTask({
				id: "task-1",
				title: "First Task",
				status: "To Do",
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "First test task",
			});

			await core.createTask({
				id: "task-2",
				title: "Second Task",
				status: "Done",
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Second test task",
			});

			await core.createTask({
				id: "task-3",
				title: "Third Task",
				status: "To Do",
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Third test task",
			});

			const tasks = await coreFileSystem(core).listTasks();
			expect(tasks).toHaveLength(3);

			// Verify tasks are grouped correctly by status
			const todoTasks = tasks.filter((t) => t.status === "To Do");
			const doneTasks = tasks.filter((t) => t.status === "Done");

			expect(todoTasks).toHaveLength(2);
			expect(doneTasks).toHaveLength(1);
			expect(todoTasks.map((t) => t.id)).toEqual(["TASK-1", "TASK-3"]); // IDs normalized to uppercase
			expect(doneTasks.map((t) => t.id)).toEqual(["TASK-2"]); // IDs normalized to uppercase
		});

		it("honors the retained --limit option", async () => {
			const core = new Core(TEST_DIR);
			const fixtures = [
				["task-1", "First limited task"],
				["task-2", "Second limited task"],
			] as const;
			for (const [id, title] of fixtures) {
				await core.createTask({
					id,
					title,
					status: "To Do",
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: title,
				});
			}

			const result = await runInProcessCli(["task", "list", "--plain", "--limit", "1"], { cwd: TEST_DIR });
			expect(result.exitCode).toBe(0);
			const output = result.stdout.toString();
			expect(output.includes("First limited task")).not.toBe(output.includes("Second limited task"));
		});

		it("rejects malformed and unsafe list-window integers", async () => {
			for (const value of ["2junk", "nope", "9007199254740992"]) {
				const result = await runInProcessCli(["task", "list", "--max-count", value], { cwd: TEST_DIR });
				expect(result.exitCode).toBe(1);
				expect(result.stderr.toString()).toContain("--max-count must be a signed safe integer");
			}
		});

		it("clamps negative list-window values to zero", async () => {
			const core = new Core(TEST_DIR);
			await core.createTask({
				id: "task-1",
				title: "First task",
				status: "To Do",
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "First task",
			});

			const result = await runInProcessCli(["task", "list", "--plain", "--skip", "-1", "--max-count", "1"], {
				cwd: TEST_DIR,
			});
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain("First task");
		});

		it("should respect config status order", async () => {
			const core = new Core(TEST_DIR);

			// Load and verify default config status order
			const config = await coreFileSystem(core).loadConfig();
			expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
		});
	});
});
