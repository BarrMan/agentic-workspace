import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const cliCommand = ["agentic-workspace"];
let runQueue = Promise.resolve();

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
		const invocation = runQueue.then(() =>
			runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err }),
		);
		runQueue = invocation.then(
			() => undefined,
			() => undefined,
		);
		const exitCode = await invocation;
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

describe("CLI task milestone assignment", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-task-milestone");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "CLI Milestone Assignment Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("creates tasks with milestone titles resolved to canonical milestone IDs", async () => {
		const core = new Core(TEST_DIR);
		const milestone = await core.filesystem.createMilestone("Release CLI");

		const result = await $`${cliCommand} task create "Milestone create task" --milestone "Release CLI" --plain`
			.cwd(TEST_DIR)
			.quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain(`Milestone: ${milestone.id}`);

		const task = await core.filesystem.loadTask("task-1");
		expect(task?.milestone).toBe(milestone.id);
	});

	it("edits and clears task milestones from the CLI", async () => {
		const core = new Core(TEST_DIR);
		const first = await core.filesystem.createMilestone("Release Alpha");
		const second = await core.filesystem.createMilestone("Release Beta");

		const create = await $`${cliCommand} task create "Milestone edit task" --milestone ${first.id}`
			.cwd(TEST_DIR)
			.quiet();
		expect(create.exitCode).toBe(0);

		const edit = await $`${cliCommand} task edit 1 --milestone "Release Beta" --plain`.cwd(TEST_DIR).quiet();
		expect(edit.exitCode).toBe(0);
		expect(edit.stdout.toString()).toContain(`Milestone: ${second.id}`);

		const updated = await core.filesystem.loadTask("task-1");
		expect(updated?.milestone).toBe(second.id);

		const clear = await $`${cliCommand} task edit 1 --clear-milestone --plain`.cwd(TEST_DIR).quiet();
		expect(clear.exitCode).toBe(0);
		expect(clear.stdout.toString()).not.toContain("Milestone:");

		const cleared = await core.filesystem.loadTask("task-1");
		expect(cleared?.milestone).toBeUndefined();
	});

	it("rejects conflicting milestone edit flags", async () => {
		const core = new Core(TEST_DIR);
		await core.filesystem.createMilestone("Release CLI");
		await $`${cliCommand} task create "Conflicting milestone flags"`.cwd(TEST_DIR).quiet();

		const result = await $`${cliCommand} task edit 1 --milestone "Release CLI" --clear-milestone`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Cannot use --milestone and --clear-milestone together.");
	});

	it("shows milestone create and edit flags in help output", async () => {
		const createHelp = await $`${cliCommand} task create --help`.cwd(TEST_DIR).quiet();
		const editHelp = await $`${cliCommand} task edit --help`.cwd(TEST_DIR).quiet();

		expect(createHelp.stdout.toString()).toContain("-m, --milestone <milestone>");
		expect(editHelp.stdout.toString()).toContain("-m, --milestone <milestone>");
		expect(editHelp.stdout.toString()).toContain("--clear-milestone");
	});
});
