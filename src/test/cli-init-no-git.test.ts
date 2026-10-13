import { describe, expect, test } from "bun:test";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { initializeProject } from "../core/init.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

async function runCommand(args: string[], cwd: string) {
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

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function createTestDir(): Promise<string> {
	const dir = createUniqueTestDir("test-cli-init-no-git");
	await mkdir(dir, { recursive: true });
	return dir;
}

async function initFilesystemOnlyProject(dir: string, projectName = "No Git Project"): Promise<Core> {
	const result = await runCommand(["init", projectName, "--no-git", "--defaults", "--integration-mode", "none"], dir);
	expect(result.exitCode).toBe(0);
	return new Core(dir);
}

describe("CLI init without Git", () => {
	test("initializes a filesystem-only project without creating a Git repository", async () => {
		const TEST_DIR = await createTestDir();
		try {
			const result = await runCommand(
				["init", "Filesystem Project", "--no-git", "--defaults", "--integration-mode", "none"],
				TEST_DIR,
			);

			expect(result.exitCode).toBe(0);
			expect(await pathExists(join(TEST_DIR, ".git"))).toBe(false);

			const core = new Core(TEST_DIR);
			const config = await core.filesystem.loadConfig();

			expect(config?.projectName).toBe("Filesystem Project");
			expect(config?.checkActiveBranches).toBe(false);
			expect(config?.remoteOperations).toBe(false);
			expect(config?.bypassGitHooks).toBe(false);
			expect(config?.filesystemOnly).toBe(true);
			expect(result.stdout.toString()).toContain("Git integration: disabled (filesystem-only)");
		} finally {
			await safeCleanup(TEST_DIR);
		}
	});

	test("shared init enforces Git-disabled config when filesystemOnly is requested", async () => {
		const TEST_DIR = await createTestDir();
		try {
			const core = new Core(TEST_DIR);

			await initializeProject(core, {
				projectName: "Core Filesystem Project",
				integrationMode: "none",
				filesystemOnly: true,
				advancedConfig: {
					checkActiveBranches: true,
					remoteOperations: true,
					bypassGitHooks: true,
				},
			});

			const config = await core.filesystem.loadConfig();

			expect(config?.checkActiveBranches).toBe(false);
			expect(config?.remoteOperations).toBe(false);
			expect(config?.bypassGitHooks).toBe(false);
			expect(config?.filesystemOnly).toBe(true);
			expect(await pathExists(join(TEST_DIR, ".git"))).toBe(false);
		} finally {
			await safeCleanup(TEST_DIR);
		}
	});

	test("local task, draft, document, decision, milestone, and list flows work without Git", async () => {
		const TEST_DIR = await createTestDir();
		try {
			const core = await initFilesystemOnlyProject(TEST_DIR);

			expect(await core.git.listAllBranches()).toEqual([]);
			expect(await core.git.listRecentBranches(30)).toEqual([]);
			expect(await core.git.hasAnyRemote()).toBe(false);

			const taskResult = await runCommand(["task", "create", "No Git Task", "--plain"], TEST_DIR);
			const draftResult = await runCommand(["draft", "create", "No Git Draft"], TEST_DIR);
			const docResult = await runCommand(["doc", "create", "No Git Doc"], TEST_DIR);
			const decisionResult = await runCommand(["decision", "create", "No Git Decision"], TEST_DIR);
			expect(taskResult.exitCode).toBe(0);
			expect(taskResult.stdout.toString()).toContain("Task TASK-1 - No Git Task");

			expect(draftResult.exitCode).toBe(0);
			expect(draftResult.stdout.toString()).toContain("Created draft DRAFT-1");

			expect(docResult.exitCode).toBe(0);
			expect(docResult.stdout.toString()).toContain("Created document doc-1");

			expect(decisionResult.exitCode).toBe(0);
			expect(decisionResult.stdout.toString()).toContain("Created decision decision-1");

			const promotedResult = await runCommand(["draft", "promote", "draft-1"], TEST_DIR);
			expect(promotedResult.exitCode).toBe(0);
			expect(promotedResult.stdout.toString()).toContain("Promoted draft DRAFT-1");

			const milestone = await core.filesystem.createMilestone("No Git Milestone");
			const archiveMilestoneResult = await core.archiveMilestone(milestone.id);
			expect(archiveMilestoneResult.success).toBe(true);

			const tasks = await core.loadTasks();
			const documents = await core.filesystem.listDocuments();
			const decisions = await core.filesystem.listDecisions();
			const archivedMilestones = await core.filesystem.listArchivedMilestones();

			expect(tasks.map((task) => task.title)).toContain("No Git Task");
			expect(tasks.map((task) => task.title)).toContain("No Git Draft");
			expect(documents.map((doc) => doc.title)).toContain("No Git Doc");
			expect(decisions.map((decision) => decision.title)).toContain("No Git Decision");
			expect(archivedMilestones.map((item) => item.title)).toContain("No Git Milestone");
			expect(await core.git.getStatus()).toBe("");
		} finally {
			await safeCleanup(TEST_DIR);
		}
	});

	test("filesystem-only mode ignores stale Git branches before explicit config loading", async () => {
		const TEST_DIR = await createTestDir();
		try {
			await $`git init -b main`.cwd(TEST_DIR).quiet();
			await Bun.write(join(TEST_DIR, "README.md"), "parent repo\n");
			await $`git add README.md`.cwd(TEST_DIR).quiet();
			await $`git commit -m initial`.cwd(TEST_DIR).quiet();

			await $`git checkout -b stale-backlog`.cwd(TEST_DIR).quiet();
			await mkdir(join(TEST_DIR, "backlog", "docs"), { recursive: true });
			await mkdir(join(TEST_DIR, "backlog", "decisions"), { recursive: true });
			await Bun.write(join(TEST_DIR, "backlog", "docs", "doc-8 - stale.md"), "# stale\n");
			await Bun.write(join(TEST_DIR, "backlog", "decisions", "decision-8 - stale.md"), "# stale\n");
			await $`git add backlog`.cwd(TEST_DIR).quiet();
			await $`git commit -m "add stale backlog ids"`.cwd(TEST_DIR).quiet();
			await $`git checkout main`.cwd(TEST_DIR).quiet();

			const core = await initFilesystemOnlyProject(TEST_DIR, "Nested No Git Project");

			expect(await core.git.listAllBranches()).toEqual([]);
			expect(await core.git.listRecentBranches(30)).toEqual([]);

			const docResult = await runCommand(["doc", "create", "Fresh Doc"], TEST_DIR);
			const decisionResult = await runCommand(["decision", "create", "Fresh Decision"], TEST_DIR);
			expect(docResult.exitCode).toBe(0);
			expect(docResult.stdout.toString()).toContain("Created document doc-1");

			expect(decisionResult.exitCode).toBe(0);
			expect(decisionResult.stdout.toString()).toContain("Created decision decision-1");
		} finally {
			await safeCleanup(TEST_DIR);
		}
	});
});
