import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import type { Decision, Task } from "../types";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

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

describe("CLI ID Incrementing Behavior", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-incrementing-ids");
		await mkdir(TEST_DIR, { recursive: true });
		core = new Core(TEST_DIR);
		// Initialize git repository first to avoid interactive prompts and ensure consistency

		await initializeFilesystemTestProject(core, "ID Incrementing Test");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	test("should increment task IDs correctly", async () => {
		const task1: Task = {
			id: "task-1",
			title: "First Task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-01-01",
			labels: [],
			dependencies: [],
			description: "A test task.",
		};
		await core.createTask(task1);

		const result = await runCommand(["task", "create", "Second Task"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Created task TASK-2");

		const task2 = await coreFileSystem(core).loadTask("task-2");
		expect(task2).toBeDefined();
		expect(task2?.title).toBe("Second Task");
	});

	test("should increment decision IDs correctly", async () => {
		const decision1: Decision = {
			id: "decision-1",
			title: "First Decision",
			date: "",
			status: "proposed",
			context: "",
			decision: "",
			consequences: "",
			rawContent: "",
		};
		await core.createDecision(decision1);

		const result = await runCommand(["decision", "create", "Second Decision"]);

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Created decision decision-2");

		const decision2 = await coreFileSystem(core).loadDecision("decision-2");
		expect(decision2).not.toBeNull();
		expect(decision2?.title).toBe("Second Decision");
	});
});
