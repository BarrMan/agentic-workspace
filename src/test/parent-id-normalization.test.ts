import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import type { Task } from "../types/index.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../utils/task-path.ts";
import { createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

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

describe("CLI parent task id normalization", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-parent-normalization");
		await mkdir(TEST_DIR, { recursive: true });
		initGitRepo(TEST_DIR, "main");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("should normalize parent task id when creating subtasks", async () => {
		const core = new Core(TEST_DIR);
		await initializeTestProject(core, "Normalization Test", true);

		const parent: Task = {
			id: "task-4",
			title: "Parent",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-08",
			labels: [],
			dependencies: [],
		};
		await core.createTask(parent);

		await runCliCommand(["task", "create", "Child", "--parent", "4"], TEST_DIR);

		const child = await core.filesystem.loadTask("task-4.1");
		expect(child?.parentTaskId).toBe("TASK-4");
	});

	// A parent that only exists on another branch cannot be shown by any task command, so accepting
	// it would create a child whose parent the CLI reports as missing.
	it("rejects parent task IDs that exist only on another branch", async () => {
		const core = new Core(TEST_DIR);
		await initializeTestProject(core, "Cross Branch Parent Test", true);

		const remoteDir = join(TEST_DIR, "remote.git");
		await $`git init --bare -b main ${remoteDir}`.quiet();
		await $`git remote add origin ${remoteDir}`.cwd(TEST_DIR).quiet();
		await $`git push -u origin main`.cwd(TEST_DIR).quiet();

		await $`git checkout -b feature-parent`.cwd(TEST_DIR).quiet();
		await core.createTask({
			id: "task-1",
			title: "Cross-branch parent",
			status: "To Do",
			assignee: [],
			createdDate: "2026-07-08",
			labels: [],
			dependencies: [],
			rawContent: "Created on feature branch",
		});
		await $`git add backlog/tasks`.cwd(TEST_DIR).quiet();
		await $`git commit -m "Add cross-branch parent fixture"`.cwd(TEST_DIR).quiet();
		await $`git push -u origin feature-parent`.cwd(TEST_DIR).quiet();
		await $`git remote update origin --prune`.cwd(TEST_DIR).quiet();
		await $`git checkout main`.cwd(TEST_DIR).quiet();
		await core.git.fetch();

		const createResult = await runCliCommand(["task", "create", "Child", "--parent", "task-1"], TEST_DIR);

		expect(createResult.exitCode).toBe(1);
		expect(createResult.stderr).toContain("Parent task TASK-1 not found.");
		expect(createResult.stderr).toContain(LOCAL_TASK_LOOKUP_HINT);
		expect(await core.filesystem.loadTask("task-1.1")).toBeNull();
		expect(await core.filesystem.listTasks()).toHaveLength(0);
	});

	it("rejects milestone IDs as parent task IDs when creating subtasks", async () => {
		const core = new Core(TEST_DIR);
		await initializeTestProject(core, "Parent Validation Test", true);
		await runCliCommand(["milestone", "add", "Release"], TEST_DIR);

		const result = await runCliCommand(["task", "create", "Child", "--parent", "m-0"], TEST_DIR);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Parent task M-0 not found");
		expect(result.stderr).toContain("--milestone");
		expect(await core.filesystem.listTasks()).toHaveLength(0);
	});
});
