import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { buildTaskUpdateInput } from "../cli/task-edit-builder.ts";
import { Core } from "../index.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const cliCommand = ["agentic-workspace"];

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
		const exitCode = await runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err });
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

describe("CLI task create/edit descriptions", () => {
	it("distinguishes omitted, explicit empty, and blank-only label lists", () => {
		expect(buildTaskUpdateInput({})).not.toHaveProperty("labels");
		expect(buildTaskUpdateInput({ labels: [] }).labels).toEqual([]);
		expect(buildTaskUpdateInput({ labels: [" "] })).not.toHaveProperty("labels");
	});

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-plain-create-edit");
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git repo first using shell API (same as other tests)

		// Initialize agentic-workspace project using Core
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Plain Create/Edit Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("creates and edits a task description", async () => {
		await $`${cliCommand} task create "Example" --description "Hello"`.cwd(TEST_DIR).quiet();
		const core = new Core(TEST_DIR);
		expect((await coreFileSystem(core).loadTask("task-1"))?.description).toBe("Hello");

		await $`${cliCommand} task edit task-1 --description "Updated description"`.cwd(TEST_DIR).quiet();
		expect((await coreFileSystem(core).loadTask("task-1"))?.description).toBe("Updated description");
	});
});
