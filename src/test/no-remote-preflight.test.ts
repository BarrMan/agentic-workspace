import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import { GitOperations } from "../git/operations.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { initGitRepo } from "./test-utils.ts";

async function runCliCommand(args: string[], cwd: string) {
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
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

describe("Missing git remote preflight", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "agentic-workspace-noremote-"));
		initGitRepo(tempDir);
		await writeFile(join(tempDir, "README.md"), "# Test");
		await $`git add README.md`.cwd(tempDir).quiet();
		await $`git commit -m "init"`.cwd(tempDir).quiet();
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("GitOperations.fetch() silently skips when no remotes exist", async () => {
		const gitOps = new GitOperations(tempDir, {
			projectName: "Test",
			statuses: ["To Do", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: true,
		} as AgenticWorkspaceConfig);

		// Capture console.warn to ensure no warning is printed during fetch
		const originalWarn = console.warn;
		const warns: string[] = [];
		console.warn = (msg: string) => {
			warns.push(msg);
		};

		await expect(async () => {
			await gitOps.fetch();
		}).not.toThrow();

		// Should not warn during fetch when no remotes
		expect(warns.length).toBe(0);

		console.warn = originalWarn;
	});

	it("Core cross-branch loading handles remoteOperations=true without a remote", async () => {
		const config: AgenticWorkspaceConfig = {
			projectName: "Test",
			statuses: ["To Do", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			checkActiveBranches: true,
			remoteOperations: true,
		};

		await mkdir(join(tempDir, "agentic-workspace", "tasks"), { recursive: true });
		await mkdir(join(tempDir, "agentic-workspace", "completed"), { recursive: true });
		const core = new Core(tempDir);
		await core.filesystem.saveConfig(config);

		await expect(core.loadTasks()).resolves.toEqual([]);
	});

	it("CLI init with includeRemote=true in no-remote repo shows a final warning", async () => {
		const result = await runCliCommand(
			[
				"init",
				"NoRemoteProj",
				"--defaults",
				"--check-branches",
				"true",
				"--include-remote",
				"true",
				"--auto-open-browser",
				"false",
			],
			tempDir,
		);
		expect(result.exitCode).toBe(0);
		const out = result.stdout + result.stderr;
		expect(out.toLowerCase()).toContain("remoteoperations is enabled");
		expect(out.toLowerCase()).toContain("no git remotes are configured");
	});
});
