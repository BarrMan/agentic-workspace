import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

async function runCommand(args: string[]) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const out = new Writable({
		write: (chunk, _encoding, done) => {
			stdout.push(chunk.toString());
			done();
		},
	});
	const err = new Writable({
		write: (chunk, _encoding, done) => {
			stderr.push(chunk.toString());
			done();
		},
	});
	const exitCode = await runCli(args, { cwd: TEST_DIR, stdout: out, stderr: err });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("CLI exclude-status filtering", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("cli-exclude-status");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Exclude Status Project");

		await core.createTask({
			id: "task-1",
			title: "Todo visible",
			status: "To Do",
			assignee: ["@codex"],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
			description: "visible work",
			rawContent: "visible work",
		});
		await core.createTask({
			id: "task-2",
			title: "Progress visible",
			status: "In Progress",
			assignee: ["@codex"],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
			description: "visible work",
			rawContent: "visible work",
		});
		await core.createTask({
			id: "task-3",
			title: "Done visible",
			status: "Done",
			assignee: ["@codex"],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
			description: "visible work",
			rawContent: "visible work",
		});
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("excludes configured statuses from task list output", async () => {
		const result = await runCommand(["task", "list", "--exclude-status", "Done", "--plain"]);

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo visible");
		expect(stdout).toContain("TASK-2 - Progress visible");
		expect(stdout).not.toContain("TASK-3 - Done visible");
	});

	it("combines excluded statuses with included status filters case-insensitively", async () => {
		const result = await runCommand(["task", "list", "--status", "In Progress", "--exclude-status", "done", "--plain"]);

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-2 - Progress visible");
		expect(stdout).not.toContain("TASK-1 - Todo visible");
		expect(stdout).not.toContain("TASK-3 - Done visible");
	});

	it("excludes configured statuses from task search output", async () => {
		const result = await runCommand(["search", "visible", "--type", "task", "--exclude-status", "Done", "--plain"]);

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo visible");
		expect(stdout).toContain("TASK-2 - Progress visible");
		expect(stdout).not.toContain("TASK-3 - Done visible");
	});

	it("falls back to default statuses when configured statuses are empty", async () => {
		const core = new Core(TEST_DIR);
		const config = await core.filesystem.loadConfig();
		if (!config) {
			throw new Error("Config not loaded");
		}
		await core.filesystem.saveConfig({ ...config, statuses: [] });

		const result = await runCommand(["task", "list", "--exclude-status", "Done", "--plain"]);

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo visible");
		expect(stdout).toContain("TASK-2 - Progress visible");
		expect(stdout).not.toContain("TASK-3 - Done visible");
	});

	it("rejects invalid excluded statuses", async () => {
		const result = await runCommand(["task", "list", "--exclude-status", "Blocked", "--plain"]);
		const output = result.stdout + result.stderr;

		expect(result.exitCode).toBe(1);
		expect(output).toContain("Invalid exclude-status: Blocked. Valid statuses are: To Do, In Progress, Done");
	});
});
