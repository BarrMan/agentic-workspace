import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

async function runCliCommand(args: string[], cwd: string) {
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
	const exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("task id generation", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-start-id");
		await mkdir(TEST_DIR, { recursive: true });
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "ID Test");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("starts numbering tasks at 1", async () => {
		const result = await runCliCommand(["task", "create", "First"], TEST_DIR);
		expect(result.exitCode).toBe(0);

		const task = await Bun.file(join(TEST_DIR, "agentic-workspace", "tasks", "task-1", "task.md")).exists();
		expect(task).toBe(true);
	});
});
