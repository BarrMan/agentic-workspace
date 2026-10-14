import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { getTaskFilename, getTaskPath, normalizeTaskId, taskFileExists, taskIdsEqual } from "../utils/task-path.ts";
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

		// Create some test task files
		const tasksDir = core.filesystem.tasksDir;
		await writeTaskContainer(tasksDir, "TASK-123", "Test Task 123");
		await writeTaskContainer(tasksDir, "TASK-456", "Another Task 456");
		await writeTaskContainer(tasksDir, "TASK-789", "Final Task 789");
		// Additional: padded and dotted ids
		await writeTaskContainer(tasksDir, "TASK-0001", "Padded One");
		await writeTaskContainer(tasksDir, "TASK-3.01", "Subtask Padded 3.01");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("normalizeTaskId", () => {
		it("should add uppercase TASK- prefix if missing", () => {
			expect(normalizeTaskId("123")).toBe("TASK-123");
			expect(normalizeTaskId("456")).toBe("TASK-456");
		});

		it("should normalize existing prefix to uppercase", () => {
			expect(normalizeTaskId("task-123")).toBe("TASK-123");
			expect(normalizeTaskId("TASK-456")).toBe("TASK-456");
		});

		it("should preserve non-default prefixes when present", () => {
			expect(normalizeTaskId("JIRA-456")).toBe("JIRA-456");
			expect(normalizeTaskId("jira-789")).toBe("JIRA-789");
		});

		it("should handle empty strings", () => {
			expect(normalizeTaskId("")).toBe("TASK-");
		});

		it("should normalize mixed-case prefixes to uppercase", () => {
			expect(normalizeTaskId("TASK-001")).toBe("TASK-001");
			expect(normalizeTaskId("Task-42")).toBe("TASK-42");
			expect(normalizeTaskId("task-99")).toBe("TASK-99");
		});

		it("should work with custom prefixes (uppercase output)", () => {
			expect(normalizeTaskId("123", "JIRA")).toBe("JIRA-123");
			expect(normalizeTaskId("JIRA-456", "JIRA")).toBe("JIRA-456");
			expect(normalizeTaskId("jira-789", "JIRA")).toBe("JIRA-789");
		});

		it("should work with draft prefix (uppercase output)", () => {
			expect(normalizeTaskId("1", "draft")).toBe("DRAFT-1");
			expect(normalizeTaskId("draft-5", "draft")).toBe("DRAFT-5");
		});
	});

	describe("taskIdsEqual", () => {
		it("should compare IDs case-insensitively", () => {
			expect(taskIdsEqual("task-123", "TASK-123")).toBe(true);
			expect(taskIdsEqual("Task-456", "task-456")).toBe(true);
		});

		it("keeps zero padding in the exact ID body", () => {
			expect(taskIdsEqual("task-1", "task-01")).toBe(false);
			expect(taskIdsEqual("task-001", "task-1")).toBe(false);
			expect(taskIdsEqual("task-0", "TASK-0000")).toBe(false);
			expect(taskIdsEqual("task-0.00", "TASK-000.0")).toBe(false);
		});

		it("should compare subtask IDs correctly", () => {
			expect(taskIdsEqual("task-1.2", "task-1.2")).toBe(true);
			expect(taskIdsEqual("task-1.2", "task-1.02")).toBe(false);
			expect(taskIdsEqual("task-1.2", "task-1.3")).toBe(false);
		});

		it("should work with custom prefixes", () => {
			expect(taskIdsEqual("JIRA-100", "jira-100", "JIRA")).toBe(true);
			expect(taskIdsEqual("100", "JIRA-100", "JIRA")).toBe(true);
		});

		it("should return false for different IDs", () => {
			expect(taskIdsEqual("task-1", "task-2")).toBe(false);
			expect(taskIdsEqual("task-1.1", "task-1.2")).toBe(false);
		});

		it("should NOT match IDs with non-numeric suffixes (prevent parseInt coercion)", () => {
			// IDs with trailing letters should NOT match the numeric portion
			// This tests the extractTaskBody regex validation
			expect(taskIdsEqual("task-123a", "task-123")).toBe(false);
			expect(taskIdsEqual("task-1.2x", "task-1.2")).toBe(false);
			expect(taskIdsEqual("123a", "task-123")).toBe(false);
		});
	});

	describe("getTaskPath", () => {
		it("should return full path for existing task", async () => {
			const path = await getTaskPath("123", core);
			expect(path).toBeTruthy();
			expect(path).toBe(join(core.filesystem.tasksDir, "task-123", "task.md"));
			expect(path).toContain(core.filesystem.tasksDir);
		});

		it("should NOT match when input has non-numeric characters (e.g., typos)", async () => {
			// "123a" should NOT match task-123 (prevent parseInt coercion bugs)
			const path = await getTaskPath("123a", core);
			expect(path).toBeNull();

			// "456x" should NOT match task-456
			const path2 = await getTaskPath("456x", core);
			expect(path2).toBeNull();

			// "1.2x" should NOT match any subtask
			const path3 = await getTaskPath("1.2x", core);
			expect(path3).toBeNull();

			// Leading non-numeric characters
			const path4 = await getTaskPath("a123", core);
			expect(path4).toBeNull();

			// Mixed non-numeric in dotted segments
			const path5 = await getTaskPath("3.a1", core);
			expect(path5).toBeNull();

			// Hex-like input should not match decimal
			const path6 = await getTaskPath("0x123", core);
			expect(path6).toBeNull();
		});

		it("should work with task- prefix", async () => {
			const path = await getTaskPath("task-456", core);
			expect(path).toBeTruthy();
			expect(path).toBe(join(core.filesystem.tasksDir, "task-456", "task.md"));
		});

		it("refuses a flat task match with manual conversion guidance", async () => {
			const tasksDir = core.filesystem.tasksDir;
			const flatPath = join(tasksDir, "task-prefixed - Exact.md");
			await writeFile(flatPath, "# Exact");

			await expect(getTaskPath("TASK-PREFIXED", core)).rejects.toThrow(/unsupported flat layout.*manually convert/i);
			expect(await Bun.file(flatPath).text()).toBe("# Exact");
		});

		it("matches exact current container IDs without numeric-prefix coercion", async () => {
			const tasksDir = core.filesystem.tasksDir;
			const path = await writeTaskContainer(tasksDir, "BACK-1-EXTRA", "Longer sibling");

			expect(await getTaskPath("BACK-1", core)).toBeNull();
			expect(await getTaskFilename("back-001", core)).toBeNull();
			expect(await taskFileExists("BaCk-1", core)).toBe(false);
			expect(await getTaskPath("BACK-1-EXTRA", core)).toBe(path);
		});

		it("matches padded and unpadded IDs independently", async () => {
			const tasksDir = core.filesystem.tasksDir;
			const padded = await writeTaskContainer(tasksDir, "BACK-0001.002", "Padded dotted");
			const unpadded = await writeTaskContainer(tasksDir, "BACK-1.2", "Unpadded dotted");

			expect(await getTaskPath("bAcK-1.2", core)).toBe(unpadded);
			expect(await getTaskPath("BACK-0001.002", core)).toBe(padded);
		});

		it("does not infer away zero padding in numeric IDs", async () => {
			expect(await getTaskPath("1", core)).toBeNull();
			expect(await getTaskPath("0123", core)).toBeNull();
		});

		it("should resolve case-insensitive task IDs", async () => {
			const uppercase = await getTaskPath("TASK-0001", core);
			expect(uppercase).toBeTruthy();
			expect(uppercase).toBe(join(core.filesystem.tasksDir, "task-0001", "task.md"));

			const mixedCase = await getTaskPath("Task-456", core);
			expect(mixedCase).toBeTruthy();
			expect(mixedCase).toBe(join(core.filesystem.tasksDir, "task-456", "task.md"));
		});

		it("resolves huge adjacent and dotted IDs without precision loss or padding collapse", async () => {
			const tasksDir = core.filesystem.tasksDir;
			await writeTaskContainer(tasksDir, "TASK-9007199254740992", "Huge target");
			await writeTaskContainer(tasksDir, "TASK-9007199254740993", "Huge neighbor");
			await writeTaskContainer(tasksDir, "TASK-9007199254740992.0002", "Huge subtask");

			const target = await getTaskPath("TASK-9007199254740992", core);
			expect(target).toContain("task-9007199254740992/task.md");
			const neighbor = await getTaskPath("TASK-9007199254740993", core);
			expect(neighbor).toContain("task-9007199254740993/task.md");
			const dotted = await getTaskPath("task-9007199254740992.0002", core);
			expect(dotted).toContain("task-9007199254740992.0002/task.md");
		});

		it("keeps huge padded file identities distinct", async () => {
			const tasksDir = core.filesystem.tasksDir;
			await writeTaskContainer(tasksDir, "TASK-9007199254740992", "Huge target");
			await writeTaskContainer(tasksDir, "TASK-09007199254740992", "Huge duplicate");

			expect(await getTaskPath("TASK-9007199254740992", core)).toContain("task-9007199254740992/task.md");
			expect(await getTaskFilename("09007199254740992", core)).toBe("task.md");
			expect(await taskFileExists("9007199254740992", core)).toBe(true);
		});

		it("should return null for non-existent task", async () => {
			const path = await getTaskPath("999", core);
			expect(path).toBeNull();
		});
	});

	describe("getTaskFilename", () => {
		it("should return filename for existing task", async () => {
			const filename = await getTaskFilename("789", core);
			expect(filename).toBe("task.md");
		});

		it("should resolve dotted IDs with exact padding", async () => {
			const filename = await getTaskFilename("3.01", core);
			expect(filename).toBe("task.md");
		});

		it("should resolve case-insensitive IDs when fetching filenames", async () => {
			const filename = await getTaskFilename("TASK-789", core);
			expect(filename).toBe("task.md");
		});

		it("should return null for non-existent task", async () => {
			const filename = await getTaskFilename("999", core);
			expect(filename).toBeNull();
		});
	});

	describe("taskFileExists", () => {
		it("should return true for existing tasks", async () => {
			const exists = await taskFileExists("123", core);
			expect(exists).toBe(true);
		});

		it("should return false for non-existent tasks", async () => {
			const exists = await taskFileExists("999", core);
			expect(exists).toBe(false);
		});

		it("should work with task- prefix", async () => {
			const exists = await taskFileExists("task-456", core);
			expect(exists).toBe(true);
		});
	});

	describe("numeric ID lookup with custom prefix", () => {
		beforeEach(async () => {
			// Create tasks with custom prefix (simulating configured prefix)
			const tasksDir = core.filesystem.tasksDir;
			await writeTaskContainer(tasksDir, "BACK-358", "Custom Prefix Task");
			await writeTaskContainer(tasksDir, "BACK-5.1", "Custom Subtask");
		});

		it("should find task by numeric ID when file has custom prefix", async () => {
			// Numeric-only lookup should find "back-358" when searching all files
			const path = await getTaskPath("358", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-358/task.md");
		});

		it("should find subtask by dotted numeric ID with custom prefix", async () => {
			const path = await getTaskPath("5.1", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-5.1/task.md");
		});

		it("should NOT match numeric ID with typo even when custom prefix exists", async () => {
			// "358a" should NOT match "back-358" (the core parseInt coercion bug)
			const path = await getTaskPath("358a", core);
			expect(path).toBeNull();

			// "5.1x" should NOT match "back-5.1"
			const path2 = await getTaskPath("5.1x", core);
			expect(path2).toBeNull();
		});

		it("should find task when using full prefixed ID", async () => {
			const path = await getTaskPath("back-358", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-358/task.md");
		});

		it("should be case-insensitive for prefixed lookups", async () => {
			const path = await getTaskPath("BACK-358", core);
			expect(path).toBeTruthy();
			expect(path).toContain("back-358/task.md");
		});
	});

	describe("getTaskFilename with non-numeric input", () => {
		it("should NOT match filenames when input has non-numeric characters", async () => {
			// Same validation as getTaskPath applies to getTaskFilename
			const filename = await getTaskFilename("789x", core);
			expect(filename).toBeNull();

			const filename2 = await getTaskFilename("3.a1", core);
			expect(filename2).toBeNull();
		});
	});
});
