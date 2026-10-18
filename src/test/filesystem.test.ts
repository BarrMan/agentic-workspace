import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { AgenticWorkspaceConfig, Task } from "../types/index.ts";
import { AmbiguousIdError } from "../utils/entity-id.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("FileSystem", () => {
	let filesystem: FileSystem;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-agentic-workspace");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureAgenticWorkspaceStructure();
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("ensureAgenticWorkspaceStructure", () => {
		it("should create all required directories", async () => {
			const expectedDirs = [
				join(TEST_DIR, "agentic-workspace"),
				join(TEST_DIR, "agentic-workspace", "tasks"),
				join(TEST_DIR, "agentic-workspace", "drafts"),
				join(TEST_DIR, "agentic-workspace", "completed"),
				join(TEST_DIR, "agentic-workspace", "archive", "tasks"),
				join(TEST_DIR, "agentic-workspace", "archive", "drafts"),
				join(TEST_DIR, "agentic-workspace", "milestones"),
				join(TEST_DIR, "agentic-workspace", "archive", "milestones"),
			];

			for (const dir of expectedDirs) {
				const stats = await stat(dir);
				expect(stats.isDirectory()).toBe(true);
			}
		});

		it("should ignore EEXIST for existing directories", async () => {
			const projectDir = join(TEST_DIR, "onedrive-project");
			const expectedDirs = [
				join(projectDir, "agentic-workspace"),
				join(projectDir, "agentic-workspace", "tasks"),
				join(projectDir, "agentic-workspace", "drafts"),
				join(projectDir, "agentic-workspace", "completed"),
				join(projectDir, "agentic-workspace", "archive", "tasks"),
				join(projectDir, "agentic-workspace", "archive", "drafts"),
				join(projectDir, "agentic-workspace", "milestones"),
				join(projectDir, "agentic-workspace", "archive", "milestones"),
			];

			for (const dir of expectedDirs) {
				await mkdir(dir, { recursive: true });
			}

			const realMkdir = fsPromises.mkdir;
			const existingDirs = new Set(expectedDirs);
			const mkdirSpy = spyOn(fsPromises, "mkdir").mockImplementation(async (path, options) => {
				if (existingDirs.has(String(path))) {
					const error = new Error("file already exists") as NodeJS.ErrnoException;
					error.code = "EEXIST";
					throw error;
				}

				await realMkdir(path, options);
			});

			try {
				const { FileSystem: MockedFileSystem } = await import(
					`../file-system/operations.ts?eexist-directories=${Date.now()}`
				);
				const oneDriveFilesystem = new MockedFileSystem(projectDir);

				await oneDriveFilesystem.ensureAgenticWorkspaceStructure();

				for (const dir of expectedDirs) {
					const stats = await stat(dir);
					expect(stats.isDirectory()).toBe(true);
				}
			} finally {
				mkdirSpy.mockRestore();
			}
		});

		it("should not ignore EEXIST when the path is not a directory", async () => {
			const projectDir = join(TEST_DIR, "file-conflict-project");
			const agenticWorkspaceDir = join(projectDir, "agentic-workspace");
			const tasksPath = join(agenticWorkspaceDir, "tasks");
			await mkdir(agenticWorkspaceDir, { recursive: true });
			await Bun.write(tasksPath, "not a directory");

			const realMkdir = fsPromises.mkdir;
			const mkdirSpy = spyOn(fsPromises, "mkdir").mockImplementation(async (path, options) => {
				if (String(path) === tasksPath) {
					const error = new Error("file already exists") as NodeJS.ErrnoException;
					error.code = "EEXIST";
					throw error;
				}

				await realMkdir(path, options);
			});

			try {
				const { FileSystem: MockedFileSystem } = await import(`../file-system/operations.ts?eexist-file=${Date.now()}`);
				const conflictFilesystem = new MockedFileSystem(projectDir);

				await expect(conflictFilesystem.ensureAgenticWorkspaceStructure()).rejects.toMatchObject({ code: "EEXIST" });
			} finally {
				mkdirSpy.mockRestore();
			}
		});
	});

	describe("task operations", () => {
		const sampleTask: Task = {
			id: "task-1",
			title: "Test Task",
			status: "To Do",
			assignee: ["@developer"],
			reporter: "@manager",
			createdDate: "2025-06-03",
			labels: ["test"],
			milestone: "v1.0",
			dependencies: [],
			description: "This is a test task",
		};

		it("should save and load a task", async () => {
			await filesystem.saveTask(sampleTask);

			const loadedTask = await filesystem.loadTask("task-1");
			expect(loadedTask?.id).toBe("TASK-1"); // IDs are normalized to uppercase
			expect(loadedTask?.title).toBe(sampleTask.title);
			expect(loadedTask?.status).toBe(sampleTask.status);
			expect(loadedTask?.description).toBe(sampleTask.description);
		});

		it("rejects alphanumeric task IDs on save", async () => {
			await expect(filesystem.saveTask({ ...sampleTask, id: "TASK-PREFIXED" })).rejects.toThrow("Invalid task ID");
			await expect(filesystem.saveTask({ ...sampleTask, parentTaskId: "TASK-PREFIXED" })).rejects.toThrow(
				"Invalid parent task ID",
			);
		});

		it("preserves unknown frontmatter and opaque body when saving an existing task", async () => {
			await filesystem.saveTask({
				...sampleTask,
				dueDate: "2026-10-01",
				rawContent: "## Free-form\n\nThis body stays literal.",
			});
			const loaded = await filesystem.loadTask("task-1");
			if (!loaded?.filePath) throw new Error("Saved task was not found");
			const filepath = loaded.filePath;
			const original = await Bun.file(filepath).text();
			await Bun.write(
				filepath,
				original.replace("task_schema_version: 3", "task_schema_version: 3\ncustom_owner: platform"),
			);
			const updated = await filesystem.loadTask("task-1");
			if (!updated) throw new Error("Saved task was not found");

			await filesystem.saveTask({ ...updated, dueDate: undefined, status: "In Progress" });

			const saved = await Bun.file(filepath).text();
			expect(saved).toContain("custom_owner: platform");
			expect(saved).not.toContain("due_date:");
			expect((await filesystem.loadTask("task-1"))?.rawContent).toBe("## Free-form\n\nThis body stays literal.");
		});

		it("preserves fresh approvals through stale metadata saves and container moves", async () => {
			await filesystem.saveTask({ ...sampleTask, modeApprovals: { build: true } });
			const stale = await filesystem.loadTask("task-1");
			if (!stale) throw new Error("Saved task was not found");
			await filesystem.saveTask({ ...stale, title: "Metadata edit", modeApprovals: undefined });
			expect((await filesystem.loadTask("task-1"))?.modeApprovals).toEqual({ build: true });
			const current = await filesystem.loadTask("task-1");
			if (!current) throw new Error("Saved task was not found");
			await filesystem.moveTaskContainer(current, filesystem.completedDir);
			expect((await filesystem.listCompletedTasks()).find(({ id }) => id === "TASK-1")?.modeApprovals).toEqual({
				build: true,
			});
		});

		it("uses the same immediate-child identity rule for path saves and lifecycle operations", async () => {
			const cases = [
				{ name: "direct child", path: join(filesystem.tasksDir, "task-1", "task.md"), accepted: true },
				{ name: "nested container", path: join(filesystem.tasksDir, "parent", "task-1", "task.md"), accepted: false },
				{ name: "outside root", path: join(TEST_DIR, "outside", "task-1", "task.md"), accepted: false },
				{ name: "wrong container ID", path: join(filesystem.tasksDir, "task-2", "task.md"), accepted: false },
			];

			for (const item of cases) {
				const record = { ...sampleTask, id: "TASK-1", filePath: item.path };
				await mkdir(join(item.path, ".."), { recursive: true });
				await Bun.write(item.path, serializeTask(record));
				const before = await Bun.file(item.path).text();
				if (item.accepted) {
					await expect(filesystem.saveTask({ ...record, filePath: undefined }, { create: true })).rejects.toThrow();
					await filesystem.saveTask({ ...record, filePath: undefined, title: "Changed by ID" });
					expect(await Bun.file(item.path).text()).toContain("Changed by ID");
					await filesystem.saveTask({ ...record, title: "Changed" });
					expect(await Bun.file(item.path).text()).toContain("Changed");
					// Use a fresh copy after the save; lifecycle must validate the same identity.
					const saved = await filesystem.loadTask("TASK-1");
					if (!saved) throw new Error("Saved task was not found");
					await filesystem.moveTaskContainer(saved, filesystem.completedDir);
				} else {
					await expect(filesystem.saveTask({ ...record, title: "Changed" })).rejects.toThrow();
					await expect(filesystem.moveTaskContainer(record, filesystem.completedDir)).rejects.toThrow();
					expect(await Bun.file(item.path).text()).toBe(before);
				}
			}
		});

		it("refuses saves when a record ID has changed and when ID resolution is ambiguous", async () => {
			const filepath = join(filesystem.tasksDir, "task-1", "task.md");
			await mkdir(join(filesystem.tasksDir, "task-1"), { recursive: true });
			await Bun.write(filepath, serializeTask({ ...sampleTask, id: "TASK-2" }));
			const changedBefore = await Bun.file(filepath).text();
			await expect(filesystem.saveTask({ ...sampleTask, id: "TASK-1", filePath: filepath })).rejects.toThrow();
			await expect(
				filesystem.moveTaskContainer({ ...sampleTask, id: "TASK-1", filePath: filepath }, filesystem.completedDir),
			).rejects.toThrow();
			expect(await Bun.file(filepath).text()).toBe(changedBefore);
			await Bun.write(filepath, serializeTask({ ...sampleTask, id: "TASK-1" }));

			const duplicate = join(filesystem.completedDir, "task-1", "task.md");
			await mkdir(join(filesystem.completedDir, "task-1"), { recursive: true });
			await Bun.write(duplicate, serializeTask({ ...sampleTask, id: "TASK-1" }));
			const before = await Promise.all([filepath, duplicate].map((path) => Bun.file(path).text()));
			await expect(filesystem.saveTask({ ...sampleTask, id: "TASK-1" })).rejects.toThrow(/ambiguous/i);
			await expect(filesystem.archiveTask("TASK-1")).rejects.toThrow(/ambiguous/i);
			expect(await Promise.all([filepath, duplicate].map((path) => Bun.file(path).text()))).toEqual(before);
		});

		it("discovers tasks only from directory containers with task.md", async () => {
			const filepath = join(filesystem.tasksDir, "task-1.md");
			await Bun.write(filepath, serializeTask({ ...sampleTask, id: "TASK-1" }));
			const task = { ...sampleTask, id: "TASK-1", filePath: filepath };

			expect(await filesystem.listTasks()).toEqual([]);
			expect(await filesystem.loadTask("TASK-1")).toBeNull();
			await expect(filesystem.moveTaskContainer(task, filesystem.completedDir)).rejects.toThrow();
			expect(await Bun.file(filepath).text()).toContain("Test Task");
		});

		it("should return null for non-existent task", async () => {
			const task = await filesystem.loadTask("non-existent");
			expect(task).toBeNull();
		});

		it("does not read a longer numeric sibling for a shorter numeric ID", async () => {
			await filesystem.saveTask({ ...sampleTask, id: "BACK-12", title: "Longer sibling" });

			expect(await filesystem.loadTask("BACK-1")).toBeNull();
			expect((await filesystem.loadTask("back-12"))?.title).toBe("Longer sibling");
		});

		it("loads each padded spelling from its own container", async () => {
			const canonicalPath = join(filesystem.tasksDir, "task-1", "task.md");
			const twinPath = join(filesystem.tasksDir, "task-001", "task.md");
			await Bun.write(canonicalPath, serializeTask({ ...sampleTask, id: "TASK-1", title: "Canonical" }));
			await Bun.write(twinPath, serializeTask({ ...sampleTask, id: "TASK-001", title: "Twin" }));
			const before = await Promise.all([canonicalPath, twinPath].map(async (path) => await Bun.file(path).text()));

			expect(await filesystem.loadTask("TASK-1")).toMatchObject({ id: "TASK-1", title: "Canonical" });
			expect(await filesystem.loadTask("TASK-001")).toMatchObject({ id: "TASK-001", title: "Twin" });
			expect(await filesystem.loadTask(" task-1 ")).toMatchObject({ id: "TASK-1", title: "Canonical" });
			expect(await filesystem.loadTask(" task-001 ")).toMatchObject({ id: "TASK-001", title: "Twin" });
			expect(await Promise.all([canonicalPath, twinPath].map(async (path) => await Bun.file(path).text()))).toEqual(
				before,
			);
		});

		it("does not archive a longer numeric sibling for a shorter numeric ID", async () => {
			await filesystem.saveTask({ ...sampleTask, id: "BACK-12", title: "Longer sibling" });

			expect(await filesystem.archiveTask("BACK-1")).toBe(false);
			expect((await filesystem.loadTask("BACK-12"))?.title).toBe("Longer sibling");
			expect(await readdir(filesystem.archiveTasksDir)).toHaveLength(0);
		});

		it("does not complete a longer numeric sibling for a shorter numeric ID", async () => {
			await filesystem.saveTask({ ...sampleTask, id: "BACK-12", title: "Longer sibling" });

			expect(await filesystem.completeTask("BACK-1")).toBe(false);
			expect((await filesystem.loadTask("BACK-12"))?.title).toBe("Longer sibling");
			expect(await readdir(filesystem.completedDir)).toHaveLength(0);
		});

		it("does not delete a longer numeric sibling during numeric save cleanup", async () => {
			await filesystem.saveTask({ ...sampleTask, id: "BACK-12", title: "Longer sibling" });
			await filesystem.saveTask({ ...sampleTask, id: "BACK-1", title: "Numeric target" });

			expect((await filesystem.loadTask("BACK-1"))?.title).toBe("Numeric target");
			expect((await filesystem.loadTask("BACK-12"))?.title).toBe("Longer sibling");
		});

		it("should list all tasks", async () => {
			await filesystem.saveTask(sampleTask);
			await filesystem.saveTask({
				...sampleTask,
				id: "task-2",
				title: "Second Task",
			});

			const tasks = await filesystem.listTasks();
			expect(tasks).toHaveLength(2);
			expect(tasks.map((t) => t.id)).toEqual(["TASK-1", "TASK-2"]); // IDs are normalized to uppercase
		});

		it("propagates malformed task frontmatter instead of hiding corrupt task data", async () => {
			await filesystem.saveTask(sampleTask);
			await filesystem.saveTask({
				...sampleTask,
				id: "task-2",
				title: "Second Task",
			});

			const invalidPath = join(filesystem.tasksDir, "task-99", "task.md");
			await Bun.write(
				invalidPath,
				`---
id: task-99
assignee: [@broken
status: To Do
title: Broken Task
---

				Invalid content`,
			);

			const warning = spyOn(console, "warn").mockImplementation(() => {});
			try {
				const tasks = await filesystem.listTasks();
				expect(tasks.map(({ id }) => id)).toEqual(["TASK-1", "TASK-2"]);
				expect(warning).toHaveBeenCalledTimes(1);
				expect(warning.mock.calls[0]?.[0]).toContain(`${invalidPath}: YAML Parse error:`);
			} finally {
				warning.mockRestore();
			}
		});

		it("should sort tasks numerically by ID", async () => {
			// Create tasks with IDs that would sort incorrectly with string comparison
			const taskIds = ["task-2", "task-10", "task-1", "task-20", "task-3"];
			for (const id of taskIds) {
				await filesystem.saveTask({
					...sampleTask,
					id,
					title: `Task ${id}`,
				});
			}

			const tasks = await filesystem.listTasks();
			expect(tasks.map((t) => t.id)).toEqual(["TASK-1", "TASK-2", "TASK-3", "TASK-10", "TASK-20"]); // IDs normalized to uppercase
		});

		it("should sort tasks with decimal IDs correctly", async () => {
			// Create tasks with decimal IDs
			const taskIds = ["task-2.10", "task-2.2", "task-2", "task-1", "task-2.1"];
			for (const id of taskIds) {
				await filesystem.saveTask({
					...sampleTask,
					id,
					title: `Task ${id}`,
				});
			}

			const tasks = await filesystem.listTasks();
			expect(tasks.map((t) => t.id)).toEqual(["TASK-1", "TASK-2", "TASK-2.1", "TASK-2.2", "TASK-2.10"]); // IDs normalized to uppercase
		});

		it("should filter tasks by status and assignee", async () => {
			await filesystem.saveTask({
				...sampleTask,
				id: "task-1",
				status: "To Do",
				assignee: ["alice"],
				title: "Task 1",
			});
			await filesystem.saveTask({
				...sampleTask,
				id: "task-2",
				status: "Done",
				assignee: ["bob"],
				title: "Task 2",
			});
			await filesystem.saveTask({
				...sampleTask,
				id: "task-3",
				status: "To Do",
				assignee: ["bob"],
				title: "Task 3",
			});

			const statusFiltered = await filesystem.listTasks({ status: "to do" });
			expect(statusFiltered.map((t) => t.id)).toEqual(["TASK-1", "TASK-3"]); // IDs normalized to uppercase

			const assigneeFiltered = await filesystem.listTasks({ assignee: "bob" });
			expect(assigneeFiltered.map((t) => t.id)).toEqual(["TASK-2", "TASK-3"]); // IDs normalized to uppercase

			const combinedFiltered = await filesystem.listTasks({ status: "to do", assignee: "bob" });
			expect(combinedFiltered.map((t) => t.id)).toEqual(["TASK-3"]); // IDs normalized to uppercase
		});

		it("should archive a task", async () => {
			await filesystem.saveTask(sampleTask);

			const archived = await filesystem.archiveTask("task-1");
			expect(archived).toBe(true);

			const task = await filesystem.loadTask("task-1");
			expect(task).toBeNull();

			// Check that file exists in archive
			const archiveFiles = await readdir(join(TEST_DIR, "agentic-workspace", "archive", "tasks"));
			expect(archiveFiles.some((f) => f.startsWith("task-1"))).toBe(true);
		});

		it("should demote a task to drafts with new draft- ID", async () => {
			await filesystem.saveTask(sampleTask);

			const demoted = await filesystem.demoteTask("task-1");
			expect(demoted).toBe("DRAFT-1");

			// Task should be removed from tasks directory
			const tasksFiles = await readdir(join(TEST_DIR, "agentic-workspace", "tasks"));
			expect(tasksFiles.some((f) => f.startsWith("task-1"))).toBe(false);

			// Draft should exist with new draft- ID
			const draftsFiles = await readdir(join(TEST_DIR, "agentic-workspace", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-1"))).toBe(true);

			// Verify the demoted draft can be loaded and has correct ID
			const demotedDraft = await filesystem.loadDraft("draft-1");
			expect(demotedDraft?.id).toBe("DRAFT-1");
			expect(demotedDraft?.title).toBe(sampleTask.title);
		});
	});

	describe("draft operations", () => {
		// Drafts now use DRAFT-X id format and draft-x filename prefix
		const sampleDraft: Task = {
			id: "draft-1",
			title: "Draft Task",
			status: "Draft",
			assignee: [],
			createdDate: "2025-06-07",
			labels: [],
			dependencies: [],
			description: "Draft description",
		};

		it("should save and load a draft", async () => {
			await filesystem.saveDraft(sampleDraft);

			const loaded = await filesystem.loadDraft("draft-1");
			expect(loaded?.id).toBe("DRAFT-1"); // IDs are normalized to uppercase
			expect(loaded?.title).toBe(sampleDraft.title);
		});

		it("preserves unknown frontmatter and opaque body when saving an existing draft", async () => {
			await filesystem.saveDraft({
				...sampleDraft,
				dueDate: "2026-10-01",
				rawContent: "## Free-form\n\nThis body stays literal.",
			});
			const loaded = await filesystem.loadDraft("draft-1");
			if (!loaded?.filePath) throw new Error("Saved draft was not found");
			const filepath = loaded.filePath;
			const original = await Bun.file(filepath).text();
			await Bun.write(
				filepath,
				original.replace("task_schema_version: 3", "task_schema_version: 3\ncustom_owner: platform"),
			);
			const updated = await filesystem.loadDraft("draft-1");
			if (!updated) throw new Error("Saved draft was not found");

			await filesystem.saveDraft({ ...updated, dueDate: undefined, title: "Renamed Draft" });

			const saved = await Bun.file(join(await filesystem.getDraftsDir(), "draft-1", "task.md")).text();
			expect(saved).toContain("custom_owner: platform");
			expect(saved).not.toContain("due_date:");
			expect((await filesystem.loadDraft("draft-1"))?.rawContent).toBe("## Free-form\n\nThis body stays literal.");
		});

		it("rejects padded canonical draft twins without changing either draft record", async () => {
			const draftsDir = await filesystem.getDraftsDir();
			await mkdir(join(draftsDir, "draft-1"), { recursive: true });
			await mkdir(join(draftsDir, "draft-001"), { recursive: true });
			await Bun.write(join(draftsDir, "draft-1", "task.md"), serializeTask(sampleDraft));
			await Bun.write(
				join(draftsDir, "draft-001", "task.md"),
				serializeTask({
					id: "DRAFT-001",
					title: "Twin",
					status: "Draft",
					assignee: [],
					createdDate: "2026-08-24 10:00",
					labels: [],
					dependencies: [],
				}),
			);

			await expect(filesystem.loadDraft("DRAFT-1")).rejects.toBeInstanceOf(AmbiguousIdError);
			expect(await Bun.file(join(draftsDir, "draft-1", "task.md")).exists()).toBe(true);
			const files = (await readdir(draftsDir)).sort();
			expect(files).toEqual(["draft-001", "draft-1"]);
			expect(await Bun.file(join(draftsDir, "draft-001", "task.md")).text()).toContain("Twin");
		});

		it("discovers drafts only from directory containers", async () => {
			const draftsDir = await filesystem.getDraftsDir();
			const flatPath = join(draftsDir, "draft-1 - Historical.md");
			await Bun.write(flatPath, serializeTask(sampleDraft));

			expect(await filesystem.listDrafts()).toEqual([]);
			await expect(filesystem.draftReferenceFromPath(flatPath)).rejects.toThrow(/Invalid draft path/i);
		});

		it("should list all drafts", async () => {
			await filesystem.saveDraft(sampleDraft);
			await filesystem.saveDraft({ ...sampleDraft, id: "draft-2", title: "Second" });

			const drafts = await filesystem.listDrafts();
			expect(drafts.map((d) => d.id).sort()).toEqual(["DRAFT-1", "DRAFT-2"]);
		});

		it("uses the hardcoded draft prefix when config has no prefixes", async () => {
			const path = await filesystem.saveDraft({ ...sampleDraft, id: "1" });
			expect(path.endsWith(join("draft-1", "task.md"))).toBe(true);
			expect((await filesystem.loadDraft("1"))?.id).toBe("DRAFT-1");
		});

		it("should promote a draft to tasks with new task- ID", async () => {
			await filesystem.saveDraft(sampleDraft);

			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe("TASK-1");

			// Draft should be removed from drafts directory
			const draftsFiles = await readdir(join(TEST_DIR, "agentic-workspace", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-1"))).toBe(false);

			// Task should exist with new task- ID
			const tasksFiles = await readdir(join(TEST_DIR, "agentic-workspace", "tasks"));
			expect(tasksFiles.some((f) => f.startsWith("task-1"))).toBe(true);

			// Verify the promoted task can be loaded and has correct ID
			const promotedTask = await filesystem.loadTask("task-1");
			expect(promotedTask?.id).toBe("TASK-1");
			expect(promotedTask?.title).toBe(sampleDraft.title);
			expect(promotedTask?.status).toBe("To Do");
		});

		it("should promote a draft to the configured default status", async () => {
			const customConfig: AgenticWorkspaceConfig = {
				projectName: "Custom Default Status Project",
				defaultStatus: "Ready",
				statuses: ["Ready", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "yyyy-MM-dd",
			};
			await filesystem.saveConfig(customConfig);
			await filesystem.saveDraft(sampleDraft);

			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe("TASK-1");

			const promotedTask = await filesystem.loadTask("task-1");
			expect(promotedTask?.id).toBe("TASK-1");
			expect(promotedTask?.status).toBe("Ready");
		});

		it("should preserve a non-draft status when promoting a demoted task", async () => {
			await filesystem.saveTask({
				...sampleDraft,
				id: "task-1",
				title: "Demoted Task",
				status: "In Progress",
			});

			const demoted = await filesystem.demoteTask("task-1");
			expect(demoted).toBe("DRAFT-1");

			const draft = await filesystem.loadDraft("draft-1");
			expect(draft?.status).toBe("In Progress");

			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe("TASK-1");

			const promotedTask = await filesystem.loadTask("task-1");
			expect(promotedTask?.id).toBe("TASK-1");
			expect(promotedTask?.status).toBe("In Progress");
		});

		it("should promote draft with custom task prefix", async () => {
			// Configure custom task prefix
			const customConfig: AgenticWorkspaceConfig = {
				projectName: "Custom Prefix Project",
				statuses: ["To Do", "In Progress", "Done"],
				labels: [],
				milestones: [],
				dateFormat: "yyyy-MM-dd",
				prefixes: {
					task: "JIRA",
				},
			};
			await filesystem.saveConfig(customConfig);
			await filesystem.saveDraft(sampleDraft);

			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe("JIRA-1");

			// Draft should be removed
			const draftsFiles = await readdir(join(TEST_DIR, "agentic-workspace", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-1"))).toBe(false);

			// Task should exist with custom JIRA- prefix
			const tasksFiles = await readdir(join(TEST_DIR, "agentic-workspace", "tasks"));
			expect(tasksFiles.some((f) => f.startsWith("jira-1"))).toBe(true);

			// Verify the promoted task can be loaded with the custom prefix
			const promotedTask = await filesystem.loadTask("jira-1");
			expect(promotedTask?.id).toBe("JIRA-1");
			expect(promotedTask?.title).toBe(sampleDraft.title);
		});

		it("should not reuse completed task IDs when promoting draft", async () => {
			// Create a completed task directly in the completed directory
			// This simulates a task that was created and completed before the draft
			const completedDir = join(TEST_DIR, "agentic-workspace", "completed");
			await mkdir(completedDir, { recursive: true });

			const completedTask: Task = {
				id: "TASK-1",
				title: "Completed Task",
				status: "Done",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
			};
			const content = serializeTask(completedTask);
			await Bun.write(join(completedDir, "task-1", "task.md"), content);

			// Verify no active tasks exist
			const activeTasks = await filesystem.listTasks();
			expect(activeTasks.length).toBe(0);

			// Verify completed task exists
			const completedTasks = await filesystem.listCompletedTasks();
			expect(completedTasks.length).toBe(1);
			expect(completedTasks[0]?.id).toBe("TASK-1");

			// Create and promote a draft
			await filesystem.saveDraft(sampleDraft);
			const promoted = await filesystem.promoteDraft("draft-1");
			expect(promoted).toBe("TASK-2");

			// BUG: Currently returns TASK-1 because promoteDraft only checks active tasks
			// Expected: Should return TASK-2 to avoid collision with completed task
			const promotedTask = await filesystem.loadTask("task-2");
			expect(promotedTask?.id).toBe("TASK-2");
			expect(promotedTask?.title).toBe(sampleDraft.title);
		});

		it("should archive a draft", async () => {
			await filesystem.saveDraft(sampleDraft);

			const archived = await filesystem.archiveDraft("draft-1");
			expect(archived?.sourcePath).toContain(join("agentic-workspace", "drafts", "draft-1", "task.md"));
			expect(archived?.targetPath).toContain(join("agentic-workspace", "archive", "drafts", "draft-1", "task.md"));

			const draft = await filesystem.loadDraft("draft-1");
			expect(draft).toBeNull();

			const files = await readdir(join(TEST_DIR, "agentic-workspace", "archive", "drafts"));
			expect(files).toContain("draft-1");
		});
	});

	describe("config operations", () => {
		const sampleConfig: AgenticWorkspaceConfig = {
			projectName: "Test Project",
			defaultAssignee: ["@admin"],
			defaultStatus: "To Do",
			defaultReporter: undefined,
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["bug", "feature"],
			dateFormat: "yyyy-mm-dd",
		};

		it("should save and load config", async () => {
			await filesystem.saveConfig(sampleConfig);

			const loadedConfig = await filesystem.loadConfig();
			expect(loadedConfig).toEqual(sampleConfig);
		});

		it("should return null for missing config", async () => {
			// Create a fresh filesystem without any config
			const freshFilesystem = new FileSystem(join(TEST_DIR, "fresh"));
			await freshFilesystem.ensureAgenticWorkspaceStructure();

			const config = await freshFilesystem.loadConfig();
			expect(config).toBeNull();
		});

		it("should handle defaultReporter field", async () => {
			const cfg: AgenticWorkspaceConfig = {
				projectName: "Reporter",
				defaultReporter: "@author",
				statuses: ["To Do"],
				labels: [],
				dateFormat: "yyyy-mm-dd",
			};

			await filesystem.saveConfig(cfg);
			const loaded = await filesystem.loadConfig();
			expect(loaded?.defaultReporter).toBe("@author");
		});
	});

	describe("edge cases", () => {
		it("should handle task with task- prefix in id", async () => {
			const taskWithPrefix: Task = {
				id: "task-777",
				title: "Already Prefixed",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task with task- prefix",
			};
			const longerTask: Task = {
				...taskWithPrefix,
				id: "task-778",
				title: "Longer ID",
			};

			await filesystem.saveTask(taskWithPrefix);
			await filesystem.saveTask(longerTask);
			const loaded = await filesystem.loadTask("task-777");
			const longerLoaded = await filesystem.loadTask("task-778");

			expect(loaded?.id).toBe("TASK-777"); // IDs are normalized to uppercase
			expect(longerLoaded?.id).toBe("TASK-778");
		});

		it("should preserve custom prefix in id", async () => {
			// ID with a custom prefix pattern (letters-something)
			const taskWithCustomPrefix: Task = {
				id: "JIRA-456",
				title: "Custom Prefix",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task with custom prefix",
			};

			await filesystem.saveTask(taskWithCustomPrefix);
			const loaded = await filesystem.loadTask("jira-456");

			// IDs with existing prefix are preserved (normalized to uppercase)
			expect(loaded?.id).toBe("JIRA-456");
		});

		it("should return empty array when listing tasks in empty directory", async () => {
			const tasks = await filesystem.listTasks();
			expect(tasks).toEqual([]);
		});

		it("should return false when archiving non-existent task", async () => {
			const result = await filesystem.archiveTask("non-existent");
			expect(result).toBe(false);
		});

		it("should handle config with minimal fields", async () => {
			const minimalConfig: AgenticWorkspaceConfig = {
				projectName: "Minimal Project",
				statuses: ["To Do", "Done"],
				labels: [],
				dateFormat: "yyyy-mm-dd",
			};

			await filesystem.saveConfig(minimalConfig);
			const loaded = await filesystem.loadConfig();

			expect(loaded?.projectName).toBe("Minimal Project");
			expect(loaded?.defaultAssignee).toBeUndefined();
			expect(loaded?.defaultStatus).toBeUndefined();
		});

		it("should sanitize filenames correctly", async () => {
			const taskWithSpecialChars: Task = {
				id: "task-998",
				title: "Task/with\\special:chars?",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task with special characters in title",
			};

			await filesystem.saveTask(taskWithSpecialChars);
			const loaded = await filesystem.loadTask("task-998");

			expect(loaded?.title).toBe("Task/with\\special:chars?");
		});

		it("should preserve case in filenames", async () => {
			const taskWithMixedCase: Task = {
				id: "task-997",
				title: "Fix Task List Ordering",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task with mixed case title",
			};

			await filesystem.saveTask(taskWithMixedCase);

			// Check that the file exists with preserved case
			const files = await readdir(filesystem.tasksDir);
			expect(files).toContain("task-997");
			expect(await Bun.file(join(filesystem.tasksDir, "task-997", "task.md")).exists()).toBe(true);

			// Verify the task can be loaded
			const loaded = await filesystem.loadTask("task-997");
			expect(loaded?.title).toBe("Fix Task List Ordering");
		});

		it("ignores flat task files without changing their bytes", async () => {
			const flatTask: Task = {
				id: "task-995",
				title: "Historical user's login (OAuth)",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Historical punctuation task",
			};

			const flatPath = join(filesystem.tasksDir, "task-995 - Historical-user's-login-(OAuth).md");
			await Bun.write(flatPath, serializeTask(flatTask));
			expect(await filesystem.loadTask("task-995")).toBeNull();
			expect((await filesystem.listTasks()).some((task) => task.id === "TASK-995")).toBe(false);
			expect(await Bun.file(flatPath).exists()).toBe(true);
			expect(await Bun.file(flatPath).text()).toContain("task_schema_version: 3");
			expect((await readdir(filesystem.tasksDir)).some((file) => file === "task-995")).toBe(false);
		});

		it("should sanitize a variety of problematic task titles", async () => {
			const cases: Array<{ id: string; title: string; expected: string }> = [
				{
					id: "task-980",
					title: "Fix the user's login (OAuth)! #1",
					expected: "Fix-the-users-login-OAuth-1",
				},
				{
					id: "task-981",
					title: "Crazy!@#$%^&*()Name",
					expected: "Crazy-Name",
				},
				{
					id: "task-982",
					title: "File with <bad> |chars| and /slashes\\",
					expected: "File-with-bad-chars-and-slashes",
				},
				{
					id: "task-983",
					title: "Tabs\tand\nnewlines",
					expected: "Tabs-and-newlines",
				},
				{
					id: "task-984",
					title: "Edge -- dashes ???",
					expected: "Edge-dashes",
				},
			];

			for (const { id, title } of cases) {
				await filesystem.saveTask({
					id,
					title,
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-07",
					labels: [],
					dependencies: [],
					description: "Sanitization test",
				});

				const files = await readdir(filesystem.tasksDir);
				expect(files).toContain(id);
				expect(await Bun.file(join(filesystem.tasksDir, id, "task.md")).exists()).toBe(true);
			}
		});
	});

	describe("punctuation-only titles", () => {
		const punctuationOnlyTitle = "!!!";

		it("names a task file with a placeholder title instead of an empty segment", async () => {
			const task: Task = {
				id: "task-994",
				title: punctuationOnlyTitle,
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Punctuation-only title",
			};

			const filePath = await filesystem.saveTask(task);

			const files = await readdir(filesystem.tasksDir);
			expect(files).toContain("task-994");
			expect(filePath).toBe(join(filesystem.tasksDir, "task-994", "task.md"));
			// The title itself is preserved in the file; only the filename uses the placeholder
			expect((await filesystem.loadTask("task-994"))?.title).toBe(punctuationOnlyTitle);
		});

		it("keeps the id parseable by the readers that split the task filename", async () => {
			await filesystem.saveTask({
				id: "task-993",
				title: punctuationOnlyTitle,
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Punctuation-only title",
			});

			const files = await readdir(filesystem.tasksDir);
			const filename = files.find((f) => f.startsWith("task-993"));
			expect(filename).toBeDefined();
			expect(filename).toBe("task-993");
			expect(await Bun.file(join(filesystem.tasksDir, filename!, "task.md")).exists()).toBe(true);
		});

		it("names a draft file with a placeholder title", async () => {
			await filesystem.saveDraft({
				id: "draft-punct",
				title: punctuationOnlyTitle,
				status: "Draft",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Punctuation-only title",
			});

			const draftsDir = await filesystem.getDraftsDir();
			const draftFiles = await readdir(draftsDir);
			expect(draftFiles).toContain("draft-punct");
			expect(await Bun.file(join(draftsDir, "draft-punct", "task.md")).exists()).toBe(true);
		});

		it("publishes completed content mutations and supports unsubscribe", async () => {
			const mutations: string[] = [];
			const unsubscribe = filesystem.subscribeToContentMutations((mutation) => {
				mutations.push(`${mutation.type}:${mutation.root}`);
			});
			const task: Task = {
				id: "TASK-1",
				title: "Published task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-01-01",
				labels: [],
				dependencies: [],
				rawContent: "",
			};
			const taskPath = await filesystem.saveTask(task);

			expect(mutations).toEqual([`task:${filesystem.agenticWorkspaceDir}`]);
			unsubscribe();
			await filesystem.saveTask({ ...task, filePath: taskPath, title: "Unobserved task" });
			expect(mutations).toHaveLength(1);
		});
	});
});
