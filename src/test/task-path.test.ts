import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { Storage } from "../storage/storage.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

async function writeTaskContainer(directory: string, id: string, title: string): Promise<string> {
	const task: Task = {
		id,
		title,
		status: "To Do",
		done: false,
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
	let storage: Storage;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-task-path");
		await mkdir(TEST_DIR, { recursive: true });
		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Test Project");
		storage = Storage.open(core.projectRoot);
		await writeTaskContainer(storage.taskRecordsDirectory, "TASK-123", "Test Task 123");
		await writeTaskContainer(storage.taskRecordsDirectory, "TASK-0001", "Padded One");
		await writeTaskContainer(storage.taskRecordsDirectory, "TASK-3.01", "Subtask Padded");
		await core.tasks.init();
	});

	afterEach(async () => {
		core.tasks.dispose();
		await safeCleanup(TEST_DIR);
	});

	it("constructs a path from an exact prefixed ID", async () => {
		expect(await storage.findTaskRecordPath("TASK-123")).toBe(
			join(storage.taskRecordsDirectory, "task-123", "task.md"),
		);
		expect(await storage.findTaskRecordPath("TASK-3.01")).toBe(
			join(storage.taskRecordsDirectory, "task-3.01", "task.md"),
		);
	});

	it("does not infer a prefix or discard padding", async () => {
		expect(await storage.findTaskRecordPath("123")).toBeNull();
		expect(await storage.findTaskRecordPath("TASK-1")).toBeNull();
		expect(await storage.findTaskRecordPath("TASK-01")).toBeNull();
		expect(await storage.findTaskRecordPath("TASK-123x")).toBeNull();
	});

	it("ignores flat task records", async () => {
		const flatPath = join(storage.taskRecordsDirectory, "task-999 - Exact.md");
		await writeFile(flatPath, "# Exact");
		expect((await core.loadTasks()).some((task) => task.id === "TASK-999")).toBe(false);
		expect(await storage.findTaskRecordPath("TASK-999")).toBeNull();
		expect(await Bun.file(flatPath).text()).toBe("# Exact");
	});
});
