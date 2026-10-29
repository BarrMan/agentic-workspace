import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../controller/agentic-workspace.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("Task References", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-references");
		await mkdir(TEST_DIR, { recursive: true });

		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Test References Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("Create task with references", () => {
		it("should create a task without references", async () => {
			const { task } = await core.tasks.create({
				title: "Task without refs",
			});

			expect(task.references).toEqual([]);
		});
	});

	describe("Update task references", () => {
		it("should not add duplicate references", async () => {
			const { task } = await core.tasks.create({
				title: "Task with refs",
				references: ["file1.ts", "file2.ts"],
			});

			const updated = await core.storage.withTaskLock(task.id, async (current) =>
				core.tasks.edit({
					...current,
					references: [
						...(current.references ?? []),
						...["file2.ts", "file3.ts"].filter((value) => !current.references?.includes(value)),
					],
				}),
			);

			expect(updated.references).toEqual(["file1.ts", "file2.ts", "file3.ts"]);
		});

		it("should replace references when setting directly", async () => {
			const { task } = await core.tasks.create({
				title: "Task with refs to replace",
				references: ["old1.ts", "old2.ts"],
			});

			const updated = await core.storage.withTaskLock(task.id, async (current) =>
				core.tasks.edit({ ...current, references: ["new1.ts", "new2.ts"] }),
			);

			expect(updated.references).toEqual(["new1.ts", "new2.ts"]);
		});
	});

	describe("References in markdown", () => {
		it("should not include empty references in frontmatter", async () => {
			const { filePath } = await core.tasks.create({
				title: "Task without refs",
			});

			const content = await Bun.file(filePath as string).text();
			expect(content).not.toContain("references:");
		});
	});

	describe("Archive cleanup", () => {
		it("removes only exact-ID references when archiving, in the working copy and the completed corpus", async () => {
			const { task: archiveTarget } = await core.tasks.create({
				title: "Archive target",
			});

			const { task: activeTask } = await core.tasks.create({
				title: "Active referencing task",
				references: [
					"task-1",
					"TASK-1",
					"https://example.com/tasks/task-1",
					"docs/task-1.md",
					"prefix-task-1-suffix",
					"1",
					"JIRA-1",
					"task-12",
				],
			});

			const { task: completedTask } = await core.tasks.create({
				title: "Completed referencing task",
				status: "Done",
				references: ["task-1", "https://example.com/tasks/task-1"],
			});
			await coreFileSystem(core).moveTaskContainer(completedTask, coreFileSystem(core).completedDir);

			const archived = await core.tasks.archive(archiveTarget.id);
			expect(archived.success).toBe(true);

			const updatedActive = await core.tasks.getTask(activeTask.id);
			const completedTasks = await coreFileSystem(core).listCompletedTasks();
			const updatedCompleted = completedTasks.find((task) => task.id === completedTask.id);

			expect(updatedActive?.references).toEqual([
				"https://example.com/tasks/task-1",
				"docs/task-1.md",
				"prefix-task-1-suffix",
				"1",
				"JIRA-1",
				"task-12",
			]);
			// Archive cleanup removes exact-ID references from the completed corpus too.
			expect(updatedCompleted?.references).toEqual(["https://example.com/tasks/task-1"]);
		});
	});
});
