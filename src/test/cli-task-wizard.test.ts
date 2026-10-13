import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
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

describe("CLI task wizard integration compatibility", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-task-wizard");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "CLI Wizard Compatibility");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("preserves non-interactive missing title error for task create", async () => {
		const result = await $`${CLI_COMMAND} task create`.cwd(TEST_DIR).nothrow().quiet();
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain("error: missing required argument 'title'");
	});

	it("preserves non-interactive missing taskId error for task edit", async () => {
		const result = await $`${CLI_COMMAND} task edit`.cwd(TEST_DIR).nothrow().quiet();
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain("error: missing required argument 'taskId'");
	});

	it("keeps legacy non-interactive edit behavior when taskId is provided", async () => {
		await $`${CLI_COMMAND} task create "Edit target" --desc "Before edit"`.cwd(TEST_DIR).quiet();
		const result = await $`${CLI_COMMAND} task edit 1`.cwd(TEST_DIR).nothrow().quiet();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Updated task");
	});
});
