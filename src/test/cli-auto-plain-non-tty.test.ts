import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { Storage } from "../storage/storage.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let core: Core;

describe("CLI auto-plain behavior in non-TTY runs", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-auto-plain-non-tty");
		await mkdir(TEST_DIR, { recursive: true });

		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Auto Plain Non-TTY Test");

		const seedTask: Task = {
			id: "task-1",
			title: "First Task",
			done: false,
			status: "To Do",
			createdDate: "2026-01-01 00:00",
			labels: [],
			dependencies: [],
			description: "Seed task description",
		};
		await new Storage(coreFileSystem(core)).createTask(seedTask);
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	test("task list falls back to plain output without --plain", async () => {
		const result = await runInProcessCli(["task", "list"], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);

		const out = result.stdout.toString();
		expect(out).toContain("To Do:");
		expect(out.toLowerCase()).toContain("task-1 - first task");
		expect(out).not.toContain("\x1b");
	});

	test("task view falls back to plain output without --plain", async () => {
		const result = await runInProcessCli(["task", "view", "TASK-1"], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);

		const out = result.stdout.toString();
		expect(out).toContain("Task TASK-1 - First Task");
		expect(out).toContain("Description:");
		expect(out).toContain("Seed task description");
		expect(out).not.toContain("\x1b");
	});

	test("task create preserves concise output without --plain", async () => {
		const result = await runInProcessCli(["task", "create", "Second Task"], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);

		const out = result.stdout.toString();
		expect(out).toContain("Created task TASK-2");
		expect(out).toContain("File: ");
		expect(out).not.toContain("Task TASK-2 - Second Task");
	});
});
