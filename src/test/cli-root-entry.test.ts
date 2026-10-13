import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { formatRootEntry, printRootEntry } from "../cli/root-entry.ts";
import { Core } from "../index.ts";
import { initializeFilesystemTestProject } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_COMMAND = ["agenticworkspace"];
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
			runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err }),
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

describe("CLI root entry (bare run)", () => {
	beforeEach(async () => {
		TEST_DIR = await mkdtemp(join(tmpdir(), "backlog-root-entry-"));
		await mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		await rm(TEST_DIR, { recursive: true, force: true });
	});

	it("can colorize the plain root entry when color is enabled", () => {
		const out = formatRootEntry({ version: "1.2.3", initialized: true, color: true });

		expect(out).toContain("\u001B[1;36m██████╗");
		expect(out).toContain("\u001B[1mAgenticWorkspace\u001B[0m v1.2.3");
		expect(out).toContain("\u001B[1;33mCommon workflow:\u001B[0m");
		expect(out).toContain("\u001B[0m");
	});

	it("honors explicit color false even when stdout is a TTY", async () => {
		const originalWrite = process.stdout.write;
		const originalIsTTY = process.stdout.isTTY;
		let output = "";

		Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
		process.stdout.write = ((chunk: string | Uint8Array) => {
			output += chunk.toString();
			return true;
		}) as typeof process.stdout.write;

		try {
			await printRootEntry({ version: "1.2.3", initialized: true, color: false });
		} finally {
			process.stdout.write = originalWrite;
			Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalIsTTY });
		}

		expect(output).toContain("AgenticWorkspace v1.2.3");
		expect(output).not.toContain("\u001B[");
		expect(output).not.toContain("\u001B]");
	});

	it("prints a plain local entry point in non-initialized repo", async () => {
		const result = await $`${CLI_COMMAND}`.cwd(TEST_DIR).quiet();
		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		expect(out).toContain("██████╗");
		expect(out).toContain("AgenticWorkspace v");
		expect(out).toContain("This directory is not initialized for AgenticWorkspace.");
		expect(out).toContain("Project setup:");
		expect(out).toContain("agenticworkspace init");
		expect(out).toContain("Local instructions:");
		expect(out).toContain("agenticworkspace instructions");
		expect(out).toContain("agenticworkspace instructions overview");
		expect(out).toContain("agenticworkspace <command> --help");
		expect(out).toContain("Docs: https://github.com/BarrMan/agentic-workspace");
		expect(out).not.toContain("\u001B[");
		expect(out).not.toContain("\u001B]");
	});

	it("prints a plain local entry point in initialized repo", async () => {
		// Initialize Git + project via Core
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Splash Test");

		const result = await $`${CLI_COMMAND}`.cwd(TEST_DIR).quiet();
		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		expect(out).toContain("██████╗");
		expect(out).toContain("Common workflow:");
		expect(out).toContain("agenticworkspace task view TASK-123 --plain");
		expect(out).toContain("agenticworkspace task create");
		expect(out).toContain("agenticworkspace board");
		expect(out).toContain("Open the TUI Kanban board");
		expect(out).toContain("Local instructions:");
		expect(out).toContain("agenticworkspace instructions task-execution");
		expect(out).not.toContain("agenticworkspace init");
		expect(out).toContain("Docs: https://github.com/BarrMan/agentic-workspace");
		expect(out).not.toContain("\u001B[");
		expect(out).not.toContain("\u001B]");
	});

	it("--help shows commander help, not the root entry", async () => {
		const result = await $`${CLI_COMMAND} --help`.cwd(TEST_DIR).quiet();
		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		expect(out).toMatch(/Usage: .*agenticworkspace/);
		expect(out).not.toContain("Local instructions:");
	});
});
