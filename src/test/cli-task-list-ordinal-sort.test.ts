import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import type { Task } from "../types/index.ts";
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

const createTask = (overrides: Partial<Task>): Task => ({
	id: "task-1",
	title: "Task",
	status: "To Do",
	assignee: [],
	labels: [],
	dependencies: [],
	createdDate: "2026-01-01",
	...overrides,
});

const expectInOrder = (output: string, ids: string[]) => {
	let previousPosition = -1;
	for (const id of ids) {
		const position = output.indexOf(id);
		expect(position).toBeGreaterThanOrEqual(0);
		expect(position).toBeGreaterThan(previousPosition);
		previousPosition = position;
	}
};

describe("CLI task list ordinal sorting", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-task-list-ordinal-sort");
		await rm(TEST_DIR, { recursive: true, force: true });
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Task List Ordinal Sort Test");

		await core.createTask(createTask({ id: "task-1", title: "No ordinal" }));
		await core.createTask(createTask({ id: "task-2", title: "Second ordinal", ordinal: 20 }));
		await core.createTask(createTask({ id: "task-3", title: "First ordinal", ordinal: 10 }));
		await core.createTask(createTask({ id: "task-4", title: "Tied ordinal", ordinal: 20 }));
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("orders tasks by ordinal before task ID and leaves missing ordinals last", async () => {
		const result = await $`${cliCommand} task list --sort ordinal --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expectInOrder(result.stdout.toString(), ["TASK-3", "TASK-2", "TASK-4", "TASK-1"]);
	});

	it("shows ordinal in the invalid sort field message", async () => {
		const result = await $`${cliCommand} task list --sort invalid --plain`.cwd(TEST_DIR).nothrow().quiet();

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Invalid sort field: invalid");
		expect(result.stderr.toString()).toContain("Valid values are: priority, id, ordinal, newest");
	});
});
