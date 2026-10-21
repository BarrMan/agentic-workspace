import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../index.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI search command", () => {
	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-search");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Search Command Project");

		await core.createTask({
			id: "task-1",
			title: "Central search integration",
			status: "To Do",
			createdDate: "2025-09-18",
			labels: ["search"],
			dependencies: [],
			rawContent: "Implements central search module",
			description: "Implements central search module",
			modifiedFiles: ["src/web/App.tsx"],
		});

		await core.createTask({
			id: "task-2",
			title: "High priority follow-up",
			status: "In Progress",
			createdDate: "2025-09-18",
			labels: ["search"],
			dependencies: [],
			rawContent: "Follow-up work",
			description: "Follow-up work",
			priority: "High",
			modifiedFiles: ["src/core/search-service.ts"],
		});
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("returns matching tasks in plain output", async () => {
		const result = await runInProcessCli(["search", "central", "--plain"], { cwd: TEST_DIR });

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("Tasks:");
		expect(stdout).toContain("TASK-1 - Central search integration");
	});

	it("honors status and priority filters for task results", async () => {
		const statusResult = await runInProcessCli(
			["search", "follow-up", "--type", "task", "--status", "In Progress", "--plain"],
			{ cwd: TEST_DIR },
		);
		expect(statusResult.exitCode).toBe(0);
		const statusStdout = statusResult.stdout.toString();
		expect(statusStdout).toContain("TASK-2 - High priority follow-up");
		expect(statusStdout).not.toContain("TASK-1 - Central search integration");

		const priorityResult = await runInProcessCli(
			["search", "follow-up", "--type", "task", "--priority", "high", "--plain"],
			{ cwd: TEST_DIR },
		);
		expect(priorityResult.exitCode).toBe(1);
		const exactPriorityResult = await runInProcessCli(
			["search", "follow-up", "--type", "task", "--priority", "High", "--plain"],
			{ cwd: TEST_DIR },
		);
		expect(exactPriorityResult.exitCode).toBe(0);
		const priorityStdout = exactPriorityResult.stdout.toString();
		expect(priorityStdout).toContain("TASK-2 - High priority follow-up");

		const paddedStatusResult = await runInProcessCli(
			["search", "follow-up", "--type", "task", "--status", " In Progress ", "--plain"],
			{ cwd: TEST_DIR },
		);
		expect(paddedStatusResult.exitCode).toBe(1);
	});

	it("rejects pagination and result-limit options", async () => {
		const result = await runInProcessCli(["search", "search", "--plain", "--limit", "1"], { cwd: TEST_DIR });
		const output = result.stdout.toString() + result.stderr.toString();

		expect(result.exitCode).toBe(1);
		expect(output).toContain("unknown option '--limit'");
		const helpResult = await runInProcessCli(["search", "--help"], { cwd: TEST_DIR });
		expect(helpResult.exitCode).toBe(0);
		const help = helpResult.stdout;
		expect(help).not.toContain("--max-count");
		expect(help).not.toContain("--skip");
		expect(help).not.toContain("--limit");
	});

	it("finds tasks by modified file path", async () => {
		const queryResult = await runInProcessCli(["search", "src/web/App.tsx", "--type", "task", "--plain"], {
			cwd: TEST_DIR,
		});
		expect(queryResult.exitCode).toBe(0);
		const queryStdout = queryResult.stdout.toString();
		expect(queryStdout).toContain("TASK-1 - Central search integration");

		const filterResult = await runInProcessCli(["search", "--modified-file", "core/search-service", "--plain"], {
			cwd: TEST_DIR,
		});
		expect(filterResult.exitCode).toBe(0);
		const filterStdout = filterResult.stdout.toString();
		expect(filterStdout).toContain("TASK-2 - High priority follow-up");
		expect(filterStdout).not.toContain("TASK-1 - Central search integration");
	});
});
