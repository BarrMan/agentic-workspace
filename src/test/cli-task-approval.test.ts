import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { getDefaultModeCatalog, updateAgentConfiguration } from "../agent-workspace/config.ts";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
let configHome: string;
const previousConfigHome = process.env.XDG_CONFIG_HOME;
const previousTaskId = process.env.AGENTIC_WORKSPACE_TASK_ID;
let cliQueue = Promise.resolve();

function runTaskCommand(args: string[]) {
	const execution = cliQueue.then(async () => {
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
		const exitCode = await runCli(args, { cwd: testDir, stdout: out, stderr: err });
		return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
	});
	cliQueue = execution.then(
		() => undefined,
		() => undefined,
	);
	return execution;
}

describe("CLI task mode approval", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("cli-task-approval");
		configHome = await mkdtemp(`${tmpdir()}/cli-task-approval-config-`);
		process.env.XDG_CONFIG_HOME = configHome;
		await mkdir(testDir, { recursive: true });
		await shell`git init -b main`.cwd(testDir).quiet();
		await initializeTestProject(new Core(testDir), "CLI task approval");
		await updateAgentConfiguration(new Core(testDir), "project", (configuration) => ({
			...configuration,
			modes: getDefaultModeCatalog(),
		}));
		await new Core(testDir).createTask({
			id: "task-1",
			title: "Approval target",
			status: "To Do",
			assignee: [],
			createdDate: "2026-10-17",
			labels: [],
			dependencies: [],
			rawContent: "## Description\n\nTask body",
		});
	});
	afterEach(async () => {
		await safeCleanup(testDir);
		await rm(configHome, { recursive: true, force: true });
		if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = previousConfigHome;
		if (previousTaskId === undefined) delete process.env.AGENTIC_WORKSPACE_TASK_ID;
		else process.env.AGENTIC_WORKSPACE_TASK_ID = previousTaskId;
	});

	it("records only the named task/mode approval in task.md", async () => {
		const result = await runTaskCommand(["task", "approve", "1", "build"]);
		expect(result.exitCode, result.stderr).toBe(0);
		expect(result.stdout).toContain("task TASK-1 for mode build");
		const content = await readFile(`${testDir}/agentic-workspace/tasks/task-1/task.md`, "utf8");
		expect(content).toContain("mode_approvals:\n  build: true");
		const task = await new Core(testDir).filesystem.loadTask("task-1");
		expect(task?.modeApprovals).toEqual({ build: true });
	});

	it("fails for unknown tasks and modes", async () => {
		const unknownTask = await runTaskCommand(["task", "approve", "missing", "build"]);
		expect(unknownTask.exitCode).not.toBe(0);
		const unknownMode = await runTaskCommand(["task", "approve", "1", "missing"]);
		expect(unknownMode.exitCode).not.toBe(0);
	});

	it("does not grant approval when marking a task done", async () => {
		process.env.AGENTIC_WORKSPACE_TASK_ID = "TASK-1";
		const result = await runTaskCommand(["task", "done"]);
		expect(result.exitCode).toBe(0);
		expect((await new Core(testDir).filesystem.loadTask("task-1"))?.modeApprovals ?? {}).toEqual({});
	});
});
