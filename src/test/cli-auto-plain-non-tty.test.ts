import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import type { ShellExpression } from "bun";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import type { Task } from "../types";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: ShellExpression[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.includes("agentic-workspace")) return shell(parts, ...values);
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

let TEST_DIR: string;
let core: Core;

describe("CLI auto-plain behavior in non-TTY runs", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-auto-plain-non-tty");
		await mkdir(TEST_DIR, { recursive: true });

		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Auto Plain Non-TTY Test");

		const seedTask: Task = {
			id: "task-1",
			title: "First Task",
			status: "To Do",
			assignee: [],
			createdDate: "2026-01-01 00:00",
			labels: [],
			dependencies: [],
			description: "Seed task description",
		};
		await core.createTask(seedTask);
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	test("task list falls back to plain output without --plain", async () => {
		const result = await $`${CLI_COMMAND} task list`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const out = result.stdout.toString();
		expect(out).toContain("To Do:");
		expect(out.toLowerCase()).toContain("task-1 - first task");
		expect(out).not.toContain("\x1b");
	});

	test("task view falls back to plain output without --plain", async () => {
		const result = await $`${CLI_COMMAND} task view TASK-1`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const out = result.stdout.toString();
		expect(out).toContain("Task TASK-1 - First Task");
		expect(out).toContain("Description:");
		expect(out).toContain("Seed task description");
		expect(out).not.toContain("\x1b");
	});

	test("task create preserves legacy concise output without --plain", async () => {
		const result = await $`${CLI_COMMAND} task create "Second Task"`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);

		const out = result.stdout.toString();
		expect(out).toContain("Created task TASK-2");
		expect(out).toContain("File: ");
		expect(out).not.toContain("Task TASK-2 - Second Task");
	});
});
