import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatRootEntry, printRootEntry } from "../cli/root-entry.ts";
import { Core } from "../index.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { initializeFilesystemTestProject } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI root entry (bare run)", () => {
	beforeEach(async () => {
		TEST_DIR = await mkdtemp(join(tmpdir(), "agentic-workspace-root-entry-"));
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
		const result = await runInProcessCli([], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);
		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		expect(out).toContain("██████╗");
		expect(out).toContain("AgenticWorkspace v");
		expect(out).toContain("No AgenticWorkspace project is available");
		expect(out).not.toContain("agentic-workspace init");
		expect(out).not.toContain("agentic-workspace instructions");
		expect(out).toContain("agentic-workspace <command> --help");
		expect(out).toContain("Docs: https://github.com/BarrMan/agentic-workspace");
		expect(out).not.toContain("\u001B[");
		expect(out).not.toContain("\u001B]");
	});

	it("prints a plain local entry point in initialized repo", async () => {
		// Initialize Git + project via Core
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Splash Test");

		const result = await runInProcessCli([], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);
		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		expect(out).toContain("██████╗");
		expect(out).toContain("Common workflow:");
		expect(out).toContain("agentic-workspace task view TASK-123 --plain");
		expect(out).toContain("agentic-workspace task create");
		expect(out).toContain("agentic-workspace workspace                    Open the task workspace");
		expect(out).toContain("Open the task workspace");
		expect(out).not.toContain("agentic-workspace board");
		expect(out).not.toContain("agentic-workspace instructions");
		expect(out).not.toContain("agentic-workspace init");
		expect(out).toContain("Docs: https://github.com/BarrMan/agentic-workspace");
		expect(out).not.toContain("\u001B[");
		expect(out).not.toContain("\u001B]");
	});

	it("--help shows commander help, not the root entry", async () => {
		const result = await runInProcessCli(["--help"], { cwd: TEST_DIR });
		expect(result.exitCode).toBe(0);
		const out = result.stdout.toString();
		expect(result.exitCode).toBe(0);
		expect(out).toMatch(/Usage: .*agentic-workspace/);
		expect(out).not.toContain("agentic-workspace init");
		expect(out).not.toContain("agentic-workspace cleanup");
		expect(out).toContain("  workspace");
		const taskHelpResult = await runInProcessCli(["task", "--help"], { cwd: TEST_DIR });
		expect(taskHelpResult.exitCode).toBe(0);
		const taskHelp = taskHelpResult.stdout;
		expect(taskHelp).toContain("done");
		expect(taskHelp).not.toContain("archive");
		expect(taskHelp).not.toContain("complete");
		expect(taskHelp).not.toContain("demote");
		const sessionHelpResult = await runInProcessCli(["agent-session", "--help"], { cwd: TEST_DIR });
		expect(sessionHelpResult.exitCode).toBe(0);
		const sessionHelp = sessionHelpResult.stdout;
		expect(sessionHelp).toContain("start");
		expect(sessionHelp).toContain("ask");
		expect(sessionHelp).not.toContain("reset");
		const configHelpResult = await runInProcessCli(["agent-config", "--help"], { cwd: TEST_DIR });
		expect(configHelpResult.exitCode).toBe(0);
		const configHelp = configHelpResult.stdout;
		expect(configHelp).toContain("model");
		expect(configHelp).not.toContain("init");
	});
});
