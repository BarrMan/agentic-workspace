import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { initializeFilesystemTestProject } from "./test-utils.ts";

const CLI_COMMAND = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; nothrow?: boolean } = {};
	const result = async () => {
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
		const exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		nothrow() {
			config.nothrow = true;
			return chain;
		},
		quiet() {
			return result();
		},
		async text() {
			return (await result()).stdout;
		},
	};
	return chain;
}

describe("CLI parent shorthand option", () => {
	let testDir: string;

	beforeAll(async () => {
		testDir = await mkdtemp(join(tmpdir(), "agentic-workspace-test-"));

		// Initialize git repository first to avoid interactive prompts

		// Initialize agentic-workspace project using Core (simulating CLI)
		const core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Test Project");
	});

	afterAll(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("should accept -p as shorthand for --parent", async () => {
		// Create parent task
		const createParent = await $`${CLI_COMMAND} task create "Parent Task"`.cwd(testDir).nothrow().quiet();
		expect(createParent.exitCode).toBe(0);

		const createSubtaskShort = await $`${CLI_COMMAND} task create -p task-1 "Subtask with -p"`
			.cwd(testDir)
			.nothrow()
			.quiet();
		expect(createSubtaskShort.exitCode).toBe(0);

		// Verify the subtask was created with correct parent
		const subtaskFile = Bun.file(join(testDir, "agentic-workspace", "tasks", "task-1.1", "task.md"));
		expect(await subtaskFile.exists()).toBe(true);
		expect(await subtaskFile.text()).toContain("parent_task_id: TASK-1");
	});

	it("should show -p in help text", async () => {
		const helpResult = await $`${CLI_COMMAND} task create --help`.cwd(testDir).nothrow().quiet();

		expect(helpResult.exitCode).toBe(0);
		const stdout = helpResult.stdout.toString();
		expect(stdout).toContain("-p, --parent <taskId>");
		expect(stdout).toContain("specify existing parent task ID, not a");
		expect(stdout).toContain("milestone ID");
	});
});
