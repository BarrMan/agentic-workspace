import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { getTaskPath, taskIdsEqual } from "../utils/task-path.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

async function writeTaskContainer(directory: string, id: string, title: string): Promise<string> {
	const task: Task = {
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2026-09-30",
		labels: [],
		dependencies: [],
	};
	const path = join(directory, id.toLowerCase(), "task.md");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, serializeTask(task));
	return path;
}

describe("Task path utilities", () => {
	let TEST_DIR: string;
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-task-path");
		await mkdir(TEST_DIR, { recursive: true });
		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Test Project");
		await writeTaskContainer(core.filesystem.tasksDir, "TASK-123", "Test Task 123");
		await writeTaskContainer(core.filesystem.tasksDir, "TASK-0001", "Padded One");
		await writeTaskContainer(core.filesystem.tasksDir, "TASK-3.01", "Subtask Padded");
	});

	afterEach(async () => await safeCleanup(TEST_DIR));

	it("compares task IDs case-insensitively without numeric normalization", () => {
		expect(taskIdsEqual("TASK-1.2", "TASK-1.2")).toBe(true);
		expect(taskIdsEqual("TASK-1.2", "TASK-1.02")).toBe(false);
		expect(taskIdsEqual("TASK-1", "task-1")).toBe(true);
	});

	it("constructs a path from an exact prefixed ID", async () => {
		expect(await getTaskPath("TASK-123", core)).toBe(join(core.filesystem.tasksDir, "task-123", "task.md"));
		expect(await getTaskPath("TASK-3.01", core)).toBe(join(core.filesystem.tasksDir, "task-3.01", "task.md"));
	});

	it("does not infer a prefix or discard padding", async () => {
		expect(await getTaskPath("123", core)).toBeNull();
		expect(await getTaskPath("TASK-1", core)).toBeNull();
		expect(await getTaskPath("TASK-01", core)).toBeNull();
		expect(await getTaskPath("TASK-123x", core)).toBeNull();
	});

	it("does not search other containers for a case-variant ID", async () => {
		await writeTaskContainer(core.filesystem.tasksDir, "BACK-12", "Variant");
		expect(await getTaskPath("BACK-12", core)).toBe(join(core.filesystem.tasksDir, "back-12", "task.md"));
	});

	it("refuses flat task records with manual conversion guidance", async () => {
		const flatPath = join(core.filesystem.tasksDir, "task-999 - Exact.md");
		await writeFile(flatPath, "# Exact");
		await expect(core.filesystem.listTasks()).rejects.toThrow(/unsupported flat task record.*manually convert/i);
		expect(await Bun.file(flatPath).text()).toBe("# Exact");
	});
});
