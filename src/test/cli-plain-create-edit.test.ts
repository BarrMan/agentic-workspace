import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

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

describe("CLI --plain for task create/edit", () => {
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

	it("prints plain details after task create --plain", async () => {
		const result = await $`${cliCommand} task create "Example" --desc "Hello" --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		// Begins with File: line and contains key sections
		expect(out).toContain("File: ");
		expect(out).toContain("Task TASK-1 - Example");
		expect(out).toContain("Status:");
		expect(out).toContain("Created:");
		expect(out).toContain("Description:");
		expect(out).toContain("Hello");
		expect(out).not.toContain("Agent Summary:");
		// Should not contain TUI escape codes
		expect(out).not.toContain("[?1049h");
		expect(out).not.toContain("\x1b");
	});

	it("assigns default tail ordinals and preserves explicit ordinals on CLI create", async () => {
		const first = await $`${cliCommand} task create "First ordinal CLI task" --plain`.cwd(TEST_DIR).quiet();
		expect(first.exitCode).toBe(0);
		expect(first.stdout.toString()).toContain("Ordinal: 1000");

		const second = await $`${cliCommand} task create "Second ordinal CLI task" --plain`.cwd(TEST_DIR).quiet();
		expect(second.exitCode).toBe(0);
		expect(second.stdout.toString()).toContain("Ordinal: 2000");

		const explicit = await $`${cliCommand} task create "Explicit ordinal CLI task" --ordinal 7500 --plain`
			.cwd(TEST_DIR)
			.quiet();
		expect(explicit.exitCode).toBe(0);
		expect(explicit.stdout.toString()).toContain("Ordinal: 7500");
	});

	it("rejects non-finite ordinals on CLI create", async () => {
		const result = await $`${cliCommand} task create "Invalid ordinal CLI task" --ordinal Infinity`
			.cwd(TEST_DIR)
			.nothrow()
			.quiet();

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("Invalid ordinal: Infinity. Must be a non-negative number.");
	});

	it("prints plain details after task edit --plain", async () => {
		// Create base task first (without plain)
		await $`${cliCommand} task create "Edit Me" --desc "First"`.cwd(TEST_DIR).quiet();

		const result = await $`${cliCommand} task edit 1 -s "In Progress" --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		// Begins with File: line and contains updated details
		expect(out).toContain("File: ");
		expect(out).toContain("Task TASK-1 - Edit Me");
		expect(out).toContain("Status: ◒ In Progress");
		expect(out).toContain("Created:");
		expect(out).toContain("Updated:");
		expect(out).toContain("Description:");
		expect(out).not.toContain("Agent Summary:");
		// Should not contain TUI escape codes
		expect(out).not.toContain("[?1049h");
		expect(out).not.toContain("\x1b");
	});
});
