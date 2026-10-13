import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agenticworkspace"];
let cliQueue = Promise.resolve();

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
	const result = () => {
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
			const exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
			const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
			if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
			return value;
		});
		cliQueue = execution.then(
			() => undefined,
			() => undefined,
		);
		return execution;
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

let TEST_DIR: string;

describe("CLI Zero Padded IDs Feature", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-zero-padded-ids");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Padding Test");

		// Enable zero padding in the config
		const config = await core.filesystem.loadConfig();
		if (config) {
			config.zeroPaddedIds = 3;
			await core.filesystem.saveConfig(config);
		}
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	test("should create a task with a zero-padded ID", async () => {
		const result = await $`${CLI_COMMAND} task create "Padded Task"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const tasksDir = join(TEST_DIR, "backlog", "tasks");
		const files = await readdir(tasksDir);
		expect(files.length).toBe(1);
		expect(files[0]).toStartWith("task-001");
	});

	test("should create a document with a zero-padded ID", async () => {
		const result = await $`${CLI_COMMAND} doc create "Padded Doc"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const docsDir = join(TEST_DIR, "backlog", "docs");
		const files = await readdir(docsDir);
		expect(files.length).toBe(1);
		expect(files[0]).toStartWith("doc-001");
	});

	test("should create a decision with a zero-padded ID", async () => {
		const result = await $`${CLI_COMMAND} decision create "Padded Decision"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const decisionsDir = join(TEST_DIR, "backlog", "decisions");
		const files = await readdir(decisionsDir);
		expect(files.length).toBe(1);
		expect(files[0]).toStartWith("decision-001");
	});

	test("should correctly increment a padded task ID", async () => {
		await $`${CLI_COMMAND} task create "First Padded Task"`.cwd(TEST_DIR).quiet();
		const result = await $`${CLI_COMMAND} task create "Second Padded Task"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const tasksDir = join(TEST_DIR, "backlog", "tasks");
		const files = await readdir(tasksDir);
		expect(files.length).toBe(2);
		expect(files.some((file) => file.startsWith("task-002"))).toBe(true);
	});

	test("should create a sub-task with a zero-padded ID", async () => {
		// Create parent task first
		await $`${CLI_COMMAND} task create "Parent Task"`.cwd(TEST_DIR).quiet();

		// Create sub-task
		const result = await $`${CLI_COMMAND} task create "Padded Sub-task" -p task-001`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const tasksDir = join(TEST_DIR, "backlog", "tasks");
		const files = await readdir(tasksDir);
		expect(files.length).toBe(2);
		expect(files.some((file) => file.startsWith("task-001.01"))).toBe(true);
	});
});
