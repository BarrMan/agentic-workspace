import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const cliCommand = ["agenticworkspace"];
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

const task = (id: string, title: string, status: string) => ({
	id,
	title,
	status,
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
	description: "work",
	rawContent: "work",
});

describe("CLI status filtering", () => {
	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("cli-status");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Status Project");

		await core.createTask(task("task-1", "Todo one", "To Do"));
		await core.createTask(task("task-2", "Progress one", "In Progress"));
		await core.createTask(task("task-3", "Done one", "Done"));
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("filters by a single status", async () => {
		const result = await $`${cliCommand} task list --status "To Do" --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo one");
		expect(stdout).not.toContain("TASK-2 - Progress one");
		expect(stdout).not.toContain("TASK-3 - Done one");
	});

	// Repeating the flag used to overwrite rather than accumulate, so asking for everything
	// unfinished returned only whatever matched the last status — and silently, since an empty
	// list looks exactly like having no such tasks.
	it("returns tasks matching any status when the flag is repeated", async () => {
		const result = await $`${cliCommand} task list --status "To Do" --status "In Progress" --plain`
			.cwd(TEST_DIR)
			.quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo one");
		expect(stdout).toContain("TASK-2 - Progress one");
		expect(stdout).not.toContain("TASK-3 - Done one");
	});

	it("accepts several statuses separated by commas", async () => {
		const result = await $`${cliCommand} task list --status "To Do,Done" --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo one");
		expect(stdout).toContain("TASK-3 - Done one");
		expect(stdout).not.toContain("TASK-2 - Progress one");
	});

	it("matches statuses case-insensitively when several are given", async () => {
		const result = await $`${cliCommand} task list --status "to do" --status "DONE" --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo one");
		expect(stdout).toContain("TASK-3 - Done one");
	});

	it("still honours exclude-status alongside several included statuses", async () => {
		const result = await $`${cliCommand} task list --status "To Do" --status "Done" --exclude-status Done --plain`
			.cwd(TEST_DIR)
			.quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo one");
		expect(stdout).not.toContain("TASK-3 - Done one");
	});

	it("returns tasks matching any repeated status in JSON output", async () => {
		const result = await $`${cliCommand} task list --status "To Do" --status "Done" --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe("");
		const ids = JSON.parse(result.stdout.toString()).tasks.map((t: { id: string }) => t.id);
		expect(ids).toContain("TASK-1");
		expect(ids).toContain("TASK-3");
		expect(ids).not.toContain("TASK-2");
	});

	it("accepts comma-separated statuses in JSON output", async () => {
		const result = await $`${cliCommand} task list --status "To Do,Done" --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const ids = JSON.parse(result.stdout.toString()).tasks.map((t: { id: string }) => t.id);
		expect(ids).toContain("TASK-1");
		expect(ids).toContain("TASK-3");
		expect(ids).not.toContain("TASK-2");
	});

	it("search keeps every selected status in plain output when the flag is repeated", async () => {
		const result = await $`${cliCommand} search work --type task --status "To Do" --status "Done" --plain`
			.cwd(TEST_DIR)
			.quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo one");
		expect(stdout).toContain("TASK-3 - Done one");
		expect(stdout).not.toContain("TASK-2 - Progress one");
	});

	it("search accepts comma-separated statuses in plain output", async () => {
		const result = await $`${cliCommand} search work --type task --status "to do,DONE" --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("TASK-1 - Todo one");
		expect(stdout).toContain("TASK-3 - Done one");
		expect(stdout).not.toContain("TASK-2 - Progress one");
	});
});
