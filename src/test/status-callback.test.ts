import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { executeStatusCallback } from "../controller/status-callback.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem, initializeFilesystemTestProject } from "./test-utils.ts";

function projectDataDir(root: string): string {
	return join(root, ".agentic-workspace");
}

describe("Status Change Callbacks", () => {
	describe("executeStatusCallback", () => {
		const testCwd = process.cwd();

		test("executes command with environment variables", async () => {
			const result = await executeStatusCallback({
				command: 'echo "Task: $TASK_ID, Old: $OLD_STATUS, New: $NEW_STATUS, Title: $TASK_TITLE"',
				taskId: "task-123",
				oldStatus: "To Do",
				newStatus: "In Progress",
				taskTitle: "Test Task",
				cwd: testCwd,
			});

			expect(result.success).toBe(true);
			expect(result.output).toContain("Task: task-123");
			expect(result.output).toContain("Old: To Do");
			expect(result.output).toContain("New: In Progress");
			expect(result.output).toContain("Title: Test Task");
		});

		test("returns success false for failing command", async () => {
			const result = await executeStatusCallback({
				command: "exit 1",
				taskId: "task-123",
				oldStatus: "To Do",
				newStatus: "Done",
				taskTitle: "Test Task",
				cwd: testCwd,
			});

			expect(result.success).toBe(false);
			expect(result.exitCode).toBe(1);
		});

		test("returns error for empty command", async () => {
			const result = await executeStatusCallback({
				command: "",
				taskId: "task-123",
				oldStatus: "To Do",
				newStatus: "Done",
				taskTitle: "Test Task",
				cwd: testCwd,
			});

			expect(result.success).toBe(false);
			expect(result.error).toBe("Empty command");
		});

		test("captures stderr on failure", async () => {
			const result = await executeStatusCallback({
				command: 'echo "error message" >&2 && exit 1',
				taskId: "task-123",
				oldStatus: "To Do",
				newStatus: "Done",
				taskTitle: "Test Task",
				cwd: testCwd,
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain("error message");
		});

		test("handles special characters in variables", async () => {
			const result = await executeStatusCallback({
				command: 'echo "$TASK_TITLE"',
				taskId: "task-123",
				oldStatus: "To Do",
				newStatus: "Done",
				taskTitle: 'Task with "quotes" and $pecial chars',
				cwd: testCwd,
			});

			expect(result.success).toBe(true);
			expect(result.output).toContain('Task with "quotes" and $pecial chars');
		});
	});

	describe("TasksService.edit with callbacks", () => {
		let testDir: string;
		let core: Core;
		let callbackOutputFile: string;
		let callbackOutputPath: string;
		let previousHookOptIn: string | undefined;

		beforeEach(async () => {
			previousHookOptIn = process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
			testDir = join(tmpdir(), `agentic-workspace-callback-test-${Date.now()}`);
			await mkdir(testDir, { recursive: true });
			await initializeFilesystemTestProject(new Core(testDir), "Test");

			callbackOutputFile = join(testDir, "callback-output.txt");
			callbackOutputPath = callbackOutputFile.replace(/\\/g, "/");
		});

		afterEach(async () => {
			if (previousHookOptIn === undefined) delete process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
			else process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = previousHookOptIn;
			await rm(testDir, { recursive: true, force: true });
		});

		test("triggers global callback on status change", async () => {
			process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
			// Create config with onStatusChange
			const configContent = `project_name: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
date_format: yyyy-mm-dd
on_status_change: 'echo "$TASK_ID:$OLD_STATUS->$NEW_STATUS" > "${callbackOutputPath}"'
`;
			await writeFile(join(projectDataDir(testDir), "config.yml"), configContent);
			core = new Core(testDir);

			// Verify config was written correctly
			const writtenConfig = await Bun.file(join(projectDataDir(testDir), "config.yml")).text();
			expect(writtenConfig).toContain("on_status_change");

			// Create a task
			const { task } = await core.tasks.create({
				title: "Test Callback Task",
				status: "To Do",
			});

			// Invalidate config cache to ensure fresh read
			coreFileSystem(core).invalidateConfigCache();

			// Update status
			await core.storage.withTaskLock(task.id, (current) => core.tasks.edit({ ...current, status: "In Progress" }));

			// Check callback was executed
			const output = await Bun.file(callbackOutputFile).text();
			expect(output.trim()).toBe(`${task.id}:To Do->In Progress`);
		});

		test("ignores legacy per-task callback and runs opted-in project callback", async () => {
			process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
			// Create config with global onStatusChange
			const configContent = `project_name: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
date_format: yyyy-mm-dd
on_status_change: 'echo "global" > "${callbackOutputPath}"'
`;
			await writeFile(join(projectDataDir(testDir), "config.yml"), configContent);
			core = new Core(testDir);

			// Create a task with per-task callback
			const taskContent = serializeTask({
				id: "TASK-1",
				title: "Task with legacy callback",
				status: "To Do",
				createdDate: "2025-01-01",
				done: false,
				labels: [],
				dependencies: [],
			}).replace("---\n", `---\nonStatusChange: 'echo legacy > "${callbackOutputPath}"'\n`);
			await mkdir(join(projectDataDir(testDir), "tasks", "task-1"), { recursive: true });
			await writeFile(join(projectDataDir(testDir), "tasks", "task-1", "task.md"), taskContent);

			// Update status
			await core.storage.withTaskLock("task-1", (current) => core.tasks.edit({ ...current, status: "Done" }));

			// Legacy task frontmatter cannot override the project-level command.
			const output = await Bun.file(callbackOutputFile).text();
			expect(output.trim()).toBe("global");
		});

		test("does not execute a project hook without explicit opt-in", async () => {
			const config = `project_name: Test\nstatuses: [To Do, Done]\non_status_change: 'echo executed > "${callbackOutputPath}"'\n`;
			await writeFile(join(projectDataDir(testDir), "config.yml"), config);
			core = new Core(testDir);
			const { task } = await core.tasks.create({ title: "Opt-in gate", status: "To Do" });
			await core.storage.withTaskLock(task.id, (current) => core.tasks.edit({ ...current, status: "Done" }));
			expect(await Bun.file(callbackOutputFile).exists()).toBe(false);
		});

		test("no callback when status unchanged", async () => {
			process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
			// Create config with onStatusChange
			const configContent = `project_name: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
date_format: yyyy-mm-dd
on_status_change: 'echo "callback-ran" > "${callbackOutputPath}"'
`;
			await writeFile(join(projectDataDir(testDir), "config.yml"), configContent);
			core = new Core(testDir);

			// Create a task
			const { task } = await core.tasks.create({
				title: "Test No Callback Task",
				status: "To Do",
			});

			// Update something other than status
			await core.storage.withTaskLock(task.id, (current) => core.tasks.edit({ ...current, title: "Updated Title" }));

			// Check callback was NOT executed
			const exists = await Bun.file(callbackOutputFile).exists();
			expect(exists).toBe(false);
		});

		test("no callback when no callback configured", async () => {
			// Create config without onStatusChange
			const configContent = `project_name: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
date_format: yyyy-mm-dd
`;
			await writeFile(join(projectDataDir(testDir), "config.yml"), configContent);
			core = new Core(testDir);

			// Create a task
			const { task } = await core.tasks.create({
				title: "Test No Config Task",
				status: "To Do",
			});

			// Update status - should not fail even without callback
			const result = await core.storage.withTaskLock(task.id, (current) =>
				core.tasks.edit({ ...current, status: "In Progress" }),
			);
			expect(result.status).toBe("In Progress");
		});

		test("callback failure does not block status change", async () => {
			process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
			// Create config with failing callback
			const configContent = `project_name: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
date_format: yyyy-mm-dd
on_status_change: 'exit 1'
`;
			await writeFile(join(projectDataDir(testDir), "config.yml"), configContent);
			core = new Core(testDir);

			// Create a task
			const { task } = await core.tasks.create({
				title: "Test Failing Callback Task",
				status: "To Do",
			});

			await expect(
				core.storage.withTaskLock(task.id, (current) => core.tasks.edit({ ...current, status: "Done" })),
			).rejects.toThrow(`Task ${task.id} was saved, but post-commit work failed.`);
			expect(await coreFileSystem(core).loadTask(task.id)).toMatchObject({ status: "Done" });
		});

		test("triggers callback when reorderTask changes status", async () => {
			process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
			// Create config with onStatusChange
			const configContent = `project_name: Test
statuses:
  - To Do
  - In Progress
  - Done
labels: []
date_format: yyyy-mm-dd
on_status_change: 'echo "$TASK_ID:$OLD_STATUS->$NEW_STATUS" >> "${callbackOutputPath}"'
`;
			await writeFile(join(projectDataDir(testDir), "config.yml"), configContent);
			core = new Core(testDir);

			// Create a task in "To Do"
			const { task } = await core.tasks.create({
				title: "Reorder Callback Test",
				status: "To Do",
			});

			// Invalidate config cache
			coreFileSystem(core).invalidateConfigCache();

			// Reorder task to "In Progress" column (simulating board drag)
			await core.reorderTask({
				taskId: task.id,
				targetStatus: "In Progress",
				orderedTaskIds: [task.id],
			});

			// Check callback was executed
			const output = await Bun.file(callbackOutputFile).text();
			expect(output.trim()).toBe(`${task.id}:To Do->In Progress`);
		});
	});
});
