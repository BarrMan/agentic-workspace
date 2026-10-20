import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

async function writeTaskContainer(directory: string, id: string, title: string): Promise<string> {
	const task: Task = {
		id,
		title,
		status: "To Do",
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
		await writeTaskContainer(coreFileSystem(core).tasksDir, "TASK-123", "Test Task 123");
		await writeTaskContainer(coreFileSystem(core).tasksDir, "TASK-0001", "Padded One");
		await writeTaskContainer(coreFileSystem(core).tasksDir, "TASK-3.01", "Subtask Padded");
	});

	afterEach(async () => await safeCleanup(TEST_DIR));

	it("compares task IDs case-insensitively without numeric normalization", () => {
		expect(taskIdsEqual("TASK-1.2", "TASK-1.2")).toBe(true);
		expect(taskIdsEqual("TASK-1.2", "TASK-1.02")).toBe(false);
		expect(taskIdsEqual("TASK-1", "task-1")).toBe(true);
	});

	it("constructs a path from an exact prefixed ID", async () => {
		expect(await core.findTaskRecordPath("TASK-123")).toBe(join(coreFileSystem(core).tasksDir, "task-123", "task.md"));
		expect(await core.findTaskRecordPath("TASK-3.01")).toBe(
			join(coreFileSystem(core).tasksDir, "task-3.01", "task.md"),
		);
	});

	it("resolves case and surrounding-whitespace variants to the canonical container", async () => {
		expect(await core.findTaskRecordPath(" task-123 ")).toBe(
			join(coreFileSystem(core).tasksDir, "task-123", "task.md"),
		);
		expect(await core.findTaskRecordPath(" Task-3.01 ")).toBe(
			join(coreFileSystem(core).tasksDir, "task-3.01", "task.md"),
		);
	});

	it("does not infer a prefix or discard padding", async () => {
		expect(await core.findTaskRecordPath("123")).toBeNull();
		expect(await core.findTaskRecordPath("TASK-1")).toBeNull();
		expect(await core.findTaskRecordPath("TASK-01")).toBeNull();
		expect(await core.findTaskRecordPath("TASK-123x")).toBeNull();
	});

	it("does not search other containers for a case-variant ID", async () => {
		await writeTaskContainer(coreFileSystem(core).tasksDir, "BACK-12", "Variant");
		expect(await core.findTaskRecordPath("BACK-12")).toBe(join(coreFileSystem(core).tasksDir, "back-12", "task.md"));
	});

	it("ignores flat task records", async () => {
		const flatPath = join(coreFileSystem(core).tasksDir, "task-999 - Exact.md");
		await writeFile(flatPath, "# Exact");
		expect((await coreFileSystem(core).listTasks()).some((task) => task.id === "TASK-999")).toBe(false);
		expect(await core.findTaskRecordPath("TASK-999")).toBeNull();
		expect(await Bun.file(flatPath).text()).toBe("# Exact");
	});
});
