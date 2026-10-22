import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { Core } from "../controller/agentic-workspace.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI Zero Padded IDs Feature", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-zero-padded-ids");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Padding Test");

		// Enable zero padding in the config
		const config = await coreFileSystem(core).loadConfig();
		if (config) {
			config.zeroPaddedIds = 3;
			await coreFileSystem(core).saveConfig(config);
		}
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	test("should create a task with a zero-padded ID", async () => {
		const result = await runInProcessCli(["task", "create", "Padded Task"], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);
		expect(result.exitCode).toBe(0);

		const tasksDir = coreFileSystem(new Core(TEST_DIR)).tasksDir;
		const files = await readdir(tasksDir);
		expect(files.length).toBe(1);
		expect(files[0]).toStartWith("task-001");
	});

	test("should correctly increment a padded task ID", async () => {
		expect((await runInProcessCli(["task", "create", "First Padded Task"], { cwd: TEST_DIR })).exitCode).toBe(0);
		const result = await runInProcessCli(["task", "create", "Second Padded Task"], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);
		expect(result.exitCode).toBe(0);

		const tasksDir = coreFileSystem(new Core(TEST_DIR)).tasksDir;
		const files = await readdir(tasksDir);
		expect(files.length).toBe(2);
		expect(files.some((file) => file.startsWith("task-002"))).toBe(true);
	});
});
