/**
 * Test utilities for creating isolated test environments
 * Designed to handle Windows-specific file system quirks and prevent parallel test interference
 */

import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { $ } from "bun";
import type { Core } from "../controller/agentic-workspace.ts";
import { initializeProject as initializeProjectShared } from "../controller/init.ts";
import type { Task } from "../model/types.ts";
import type { FileSystem } from "../storage/file-system.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";

/** Opens the public persistence API for a Core instance in tests. */
export function coreFileSystem(core: Core): FileSystem {
	return (core as unknown as { storage: { filesystem: FileSystem } }).storage.filesystem;
}

/**
 * Root for every test project and Git template. It lives in the operating-system temp directory,
 * never in this checkout: a fixture that is not a complete project would otherwise resolve its
 * project root by walking up to this repository's Git root and write into the real `agentic-workspace/`
 * workspace, and every run would leave its fixtures behind in the working tree. The test preload
 * points `TMPDIR` at a disposable worker directory and removes it after the suite completes.
 */
const TEST_TMP_ROOT = ((): string => {
	try {
		return join(realpathSync(tmpdir()), "agentic-workspace-tests");
	} catch {
		return join(tmpdir(), "agentic-workspace-tests");
	}
})();

/**
 * Creates a unique test directory name to avoid conflicts in parallel execution.
 * All test directories are created under the test temp root, outside the checkout.
 */
export function createUniqueTestDir(prefix: string): string {
	const uuid = randomUUID().slice(0, 8); // Short UUID for readability
	const timestamp = Date.now().toString(36); // Base36 timestamp
	const pid = process.pid.toString(36); // Process ID for additional uniqueness
	return join(TEST_TMP_ROOT, `${prefix}-${timestamp}-${pid}-${uuid}`);
}

// Prepared `.git` directories keyed by initial branch, created lazily on first use. Spawning
// `git init` costs about 30ms per case on this platform, while copying the template costs about
// 1ms. The template is removed at process exit so nothing leaks between runs.
const gitInitTemplates: Record<string, string> = {};

/**
 * Makes `dir` a real git repository with real commits, branches and worktrees support.
 * Equivalent to `git init -b <branch>` (or a plain `git init` when `branch` is omitted) in `dir`,
 * but copies a prepared `.git` template. `dir` must already exist, and the suite must call this
 * before it needs any git state.
 */
export function initGitRepo(dir: string, branch?: string): void {
	const key = branch ?? "";
	let template = gitInitTemplates[key];
	if (!template) {
		template = join(
			TEST_TMP_ROOT,
			`git-init-template-${branch ? branch.replaceAll("/", "-") : "default"}-${process.pid.toString(36)}-${randomUUID().slice(0, 8)}`,
		);
		mkdirSync(template, { recursive: true });
		const result = Bun.spawnSync(branch ? ["git", "init", "-b", branch] : ["git", "init"], {
			cwd: template,
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		if (result.exitCode !== 0) {
			rmSync(template, { recursive: true, force: true });
			throw new Error(`Unable to prepare the git repository template for branch ${branch ?? "(default)"}`);
		}
		process.once("exit", () => {
			try {
				rmSync(template as string, { recursive: true, force: true });
			} catch {
				// Best effort: the operating system releases its own temp directory behind us.
			}
		});
		gitInitTemplates[key] = template;
	}
	cpSync(join(template, ".git"), join(dir, ".git"), { recursive: true });
}

export async function commitSamePathBranchTaskVariant(
	core: Core,
	localTask: Task,
	branchTask: Task,
	distinctBranchPath?: string,
): Promise<void> {
	const taskPath = await core.createTask(localTask);
	await $`git add .`.cwd(core.projectRoot).quiet();
	await $`git commit -m "Add local task"`.cwd(core.projectRoot).quiet();

	await $`git switch -c progressed-task-variant`.cwd(core.projectRoot).quiet();
	if (distinctBranchPath) {
		await $`git rm -- ${taskPath}`.cwd(coreFileSystem(core).rootDir).quiet();
	}
	const branchTaskPath = distinctBranchPath ?? taskPath;
	await Bun.write(branchTaskPath, serializeTask(branchTask));
	await $`git add -- ${branchTaskPath}`.cwd(core.projectRoot).quiet();
	await $`git commit -m "Progress padded task variant"`.cwd(core.projectRoot).quiet();
	await $`git switch main`.cwd(core.projectRoot).quiet();
}

/**
 * Sleep utility for tests that need to wait
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rejects if an operation does not settle in time and always clears its timer
 * when the operation resolves or rejects first.
 */
export function withTimeout<T>(operation: Promise<T>, label: string, timeoutMs: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => {
			clearTimeout(timer);
			reject(new Error(`Timed out waiting for ${label}`));
		}, timeoutMs);

		operation.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error: unknown) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
}

/**
 * Retry utility for operations that might fail intermittently
 * Particularly useful for Windows file operations
 */
async function retry<T>(fn: () => Promise<T>, maxAttempts = 3, delay = 100): Promise<T> {
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;
			if (attempt < maxAttempts) {
				await sleep(delay * attempt); // Exponential backoff
			}
		}
	}

	throw lastError || new Error("Retry failed");
}

/**
 * Windows-safe directory cleanup with retry logic
 * Windows can have file locking issues that prevent immediate deletion
 */
export async function safeCleanup(dir: string): Promise<void> {
	await retry(
		async () => {
			await rm(dir, { recursive: true, force: true });
		},
		5,
		50,
	); // More attempts for cleanup
}

/**
 * Detects if we're running on Windows (useful for conditional test behavior)
 */
export function isWindows(): boolean {
	return process.platform === "win32";
}

/**
 * Lays out an npm install of the launcher in dir. writeBinary, when given, creates the platform package binary at the
 * path it receives. Returns the launcher script path.
 */
export async function createLauncherInstall(
	dir: string,
	writeBinary?: (path: string) => Promise<void>,
): Promise<string> {
	const { getCandidatePackageNames } = require("../../scripts/resolveBinary.cjs");
	const scriptsDir = join(import.meta.dir, "..", "..", "scripts");
	// A package.json and node_modules dir keep Bun's auto-install from resolving real packages
	await mkdir(join(dir, "node_modules"), { recursive: true });
	await writeFile(join(dir, "package.json"), "{}");
	for (const file of ["cli.cjs", "resolveBinary.cjs"]) {
		await copyFile(join(scriptsDir, file), join(dir, file));
	}
	if (writeBinary) {
		const packageDir = join(dir, "node_modules", getCandidatePackageNames()[0]);
		await mkdir(packageDir, { recursive: true });
		const binaryPath = join(packageDir, isWindows() ? "agentic-workspace.exe" : "agentic-workspace");
		await writeBinary(binaryPath);
		await chmod(binaryPath, 0o755);
	}
	return join(dir, "cli.cjs");
}

/**
 * Gets appropriate timeout for the current platform
 * Windows operations tend to be slower due to file system overhead
 */
export function getPlatformTimeout(baseTimeout = 5000): number {
	return isWindows() ? baseTimeout * 2 : baseTimeout;
}

/**
 * Polls a predicate until it is true, for asserting on async/watcher-driven state.
 */
export async function waitUntil(
	predicate: () => boolean,
	label: string,
	timeout = getPlatformTimeout(15000),
): Promise<void> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await sleep(25);
	}
	throw new Error(`Timed out waiting for ${label}`);
}

/**
 * Shared test helper for project initialization.
 * Uses the same init path as CLI/web and optionally commits the fixture's initial state.
 */
export async function initializeTestProject(
	core: Core,
	projectName: string,
	commitFixture = false,
	agenticWorkspaceDirectory?: string,
): Promise<void> {
	await initializeTestProjectWithOptions(core, projectName, { agenticWorkspaceDirectory });
	if (commitFixture) {
		const repoRoot = await core.git.stageAgenticWorkspaceDirectory(relative(core.projectRoot, core.workspaceDirectory));
		await core.git.commitChanges(`agentic-workspace: Initialize agentic-workspace project: ${projectName}`, repoRoot);
	}
}

export async function initializeFilesystemTestProject(
	core: Core,
	projectName: string,
	agenticWorkspaceDirectory?: string,
): Promise<void> {
	await initializeTestProjectWithOptions(core, projectName, { agenticWorkspaceDirectory, filesystemOnly: true });
}

async function initializeTestProjectWithOptions(
	core: Core,
	projectName: string,
	options: { agenticWorkspaceDirectory?: string; filesystemOnly?: boolean },
): Promise<void> {
	const { agenticWorkspaceDirectory, filesystemOnly = false } = options;
	const agenticWorkspaceDirectorySource = agenticWorkspaceDirectory
		? agenticWorkspaceDirectory === "agentic-workspace" || agenticWorkspaceDirectory === ".agentic-workspace"
			? (agenticWorkspaceDirectory as "agentic-workspace" | ".agentic-workspace")
			: "custom"
		: undefined;
	const configLocation = agenticWorkspaceDirectorySource === "custom" ? "root" : "folder";

	await initializeProjectShared(core, {
		projectName,
		agenticWorkspaceDirectory,
		agenticWorkspaceDirectorySource,
		configLocation,
		filesystemOnly,
		advancedConfig: {},
	});
}
