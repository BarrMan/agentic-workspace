import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let NON_BACKLOG_DIR: string | undefined;

describe("CLI agents command", () => {
	// Every test only reads the initialized project, so the fixture is built once.
	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-agents-cli");
		NON_BACKLOG_DIR = undefined;
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git repo first
		await shell`git init`.cwd(TEST_DIR).quiet();

		// Initialize backlog project using Core
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Agents Test Project");
	});

	afterAll(async () => {
		await Promise.all([
			...(NON_BACKLOG_DIR ? [rm(NON_BACKLOG_DIR, { recursive: true, force: true })] : []),
			safeCleanup(TEST_DIR),
		]);
	});

	it("should show help when no options are provided", async () => {
		const result = await runCliWithOutput(TEST_DIR, ["agents"]);

		expect(result.exitCode).toBe(0);
	});

	it("should show help text with agents --help", async () => {
		const result = await runCliWithOutput(TEST_DIR, ["agents", "--help"]);
		const output = result.stdout.toString();

		expect(result.exitCode).toBe(0);
		expect(output).toContain("manage the short AgenticWorkspace CLI nudge in agent instruction files");
		expect(output).toContain("--update-instructions");
		expect(output).toContain("preserving existing content");
		expect(output).toContain("Input schema:");
		expect(output).toContain("--update-instructions: Boolean");
		expect(output).toContain("Reads:");
		expect(output).toContain("Project config and existing agent instruction files");
		expect(output).toContain("Writes:");
		expect(output).toContain("preserves existing content outside the managed block");
		expect(output).toContain("Output:");
		expect(output).toContain("Examples:");
		expect(output).toContain("agenticworkspace agents --update-instructions");
	});

	it("should fail when not in a backlog project", async () => {
		// Use OS temp directory to ensure complete isolation from project
		const tempDir = await import("node:os").then((os) => os.tmpdir());
		NON_BACKLOG_DIR = join(tempDir, `test-non-backlog-${Date.now()}-${Math.random().toString(36).substring(7)}`);

		// Create a temporary directory that's not a backlog project
		await mkdir(NON_BACKLOG_DIR, { recursive: true });

		// Initialize git repo
		await shell`git init`.cwd(NON_BACKLOG_DIR).quiet();

		const result = await runCliWithOutput(NON_BACKLOG_DIR, ["agents", "--update-instructions"]);

		expect(result.exitCode).toBe(1);
	});
});

async function runCliWithOutput(cwd: string, args: string[]) {
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
	const exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	return { exitCode, stdout: { toString: () => stdout.join("") }, stderr: { toString: () => stderr.join("") } };
}
