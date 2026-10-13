/**
 * Test utilities for creating isolated test environments
 * Designed to handle Windows-specific file system quirks and prevent parallel test interference
 */

import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { chmod, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import type { Core } from "../core/backlog.ts";
import { initializeProject as initializeProjectShared } from "../core/init.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";

/**
 * Root for every test project and Git template. It lives in the operating-system temp directory,
 * never in this checkout: a fixture that is not a complete project would otherwise resolve its
 * project root by walking up to this repository's Git root and write into the real `backlog/`
 * workspace, and every run would leave its fixtures behind in the working tree. The test preload
 * points `TMPDIR` at a disposable worker directory and removes it after the suite completes.
 */
const TEST_TMP_ROOT = ((): string => {
	try {
		return join(realpathSync(tmpdir()), "backlog-tests");
	} catch {
		return join(tmpdir(), "backlog-tests");
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
	const taskPath = await core.filesystem.saveTask(localTask);
	await $`git add .`.cwd(core.filesystem.rootDir).quiet();
	await $`git commit -m "Add local task"`.cwd(core.filesystem.rootDir).quiet();

	await $`git switch -c progressed-task-variant`.cwd(core.filesystem.rootDir).quiet();
	if (distinctBranchPath) {
		await $`git rm -- ${taskPath}`.cwd(core.filesystem.rootDir).quiet();
	}
	const branchTaskPath = distinctBranchPath ?? taskPath;
	await Bun.write(branchTaskPath, serializeTask(branchTask));
	await $`git add -- ${branchTaskPath}`.cwd(core.filesystem.rootDir).quiet();
	await $`git commit -m "Progress padded task variant"`.cwd(core.filesystem.rootDir).quiet();
	await $`git switch main`.cwd(core.filesystem.rootDir).quiet();
}

/**
 * Sleep utility for tests that need to wait
 */
export function sleep(ms: number): Promise<void> {
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

type ChildCloseResult = { code: number | null; signal: NodeJS.Signals | null };

/**
 * Observes a child process immediately so close/error events cannot be missed,
 * while letting callers start the bounded shutdown timer only when cleanup begins.
 */
export function observeChildClose(child: ChildProcess, label: string, timeoutMs: number) {
	let startTimeout = () => {};
	const result = new Promise<ChildCloseResult>((resolve, reject) => {
		const gracefulTimeoutMs = Math.max(1, Math.floor(timeoutMs / 2));
		const forcedTimeoutMs = Math.max(1, timeoutMs - gracefulTimeoutMs);
		let settled = false;
		let timeoutStarted = false;
		let timeoutError: Error | undefined;
		let processError: Error | undefined;
		let terminalTimer: ReturnType<typeof setTimeout> | undefined;
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

		const cleanup = () => {
			settled = true;
			if (timeoutTimer) clearTimeout(timeoutTimer);
			if (terminalTimer) clearTimeout(terminalTimer);
			child.off("error", onError);
			child.off("close", onClose);
		};
		const rejectErrors = (errors: Error[]) => {
			cleanup();
			reject(errors.length === 1 ? errors[0] : new AggregateError(errors, `${label} cleanup failed`));
		};
		const onError = (error: Error) => {
			child.off("error", onError);
			processError = error;
		};
		const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
			const errors = [timeoutError, processError].filter((error): error is Error => error !== undefined);
			if (errors.length > 0) {
				rejectErrors(errors);
				return;
			}
			cleanup();
			resolve({ code, signal });
		};

		child.once("error", onError);
		child.once("close", onClose);
		startTimeout = () => {
			if (settled || timeoutStarted) return;
			timeoutStarted = true;
			timeoutTimer = setTimeout(() => {
				timeoutError = new Error(`Timed out waiting for ${label} to close`);
				terminalTimer = setTimeout(
					() =>
						rejectErrors(
							[timeoutError as Error, processError, new Error(`${label} did not close after SIGKILL`)].filter(
								(error): error is Error => error !== undefined,
							),
						),
					forcedTimeoutMs,
				);
				try {
					child.kill("SIGKILL");
				} catch (error) {
					onError(error as Error);
				}
			}, gracefulTimeoutMs);
		};
	});
	return { result, startTimeout: () => startTimeout() };
}

/**
 * Retry utility for operations that might fail intermittently
 * Particularly useful for Windows file operations
 */
export async function retry<T>(fn: () => Promise<T>, maxAttempts = 3, delay = 100): Promise<T> {
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
		const binaryPath = join(packageDir, isWindows() ? "agenticworkspace.exe" : "agenticworkspace");
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
 * Caps how many cases of one suite run at once. Bun executes every case of a
 * `describe.concurrent` block inside a single process, so a suite whose cases copy projects,
 * spawn processes or write Git state can oversubscribe a loaded machine and miss its own
 * real-time deadlines while other lanes are running.
 *
 * Each case keeps its own assertions and integration; only the overlap shrinks. Cases queue
 * first-in-first-out behind a private pool of `width` slots, so a case can wait for a slot and
 * the wait still counts against Bun's per-test timeout: pick a width whose queue drains well
 * inside that budget.
 */
export function createConcurrencyLimiter(width: number): <T>(task: () => T | Promise<T>) => Promise<T> {
	if (!Number.isInteger(width) || width < 1) {
		throw new Error(`Concurrency width must be a positive integer, received ${width}`);
	}
	let availableSlots = width;
	const waiters: Array<() => void> = [];
	return async <T>(task: () => T | Promise<T>): Promise<T> => {
		while (availableSlots === 0) {
			await new Promise<void>((resolve) => waiters.push(resolve));
		}
		availableSlots -= 1;
		try {
			return await task();
		} finally {
			availableSlots += 1;
			waiters.shift()?.();
		}
	};
}

/**
 * Shared test helper for project initialization.
 * Uses the same init path as CLI/web and optionally commits the fixture's initial state.
 */
export async function initializeTestProject(
	core: Core,
	projectName: string,
	commitFixture = false,
	backlogDirectory?: string,
): Promise<void> {
	await initializeTestProjectWithOptions(core, projectName, { backlogDirectory });
	if (commitFixture) {
		const repoRoot = await core.git.stageBacklogDirectory(core.filesystem.backlogDirName);
		await core.git.commitChanges(`backlog: Initialize backlog project: ${projectName}`, repoRoot);
	}
}

export async function initializeFilesystemTestProject(
	core: Core,
	projectName: string,
	backlogDirectory?: string,
): Promise<void> {
	await initializeTestProjectWithOptions(core, projectName, { backlogDirectory, filesystemOnly: true });
}

async function initializeTestProjectWithOptions(
	core: Core,
	projectName: string,
	options: { backlogDirectory?: string; filesystemOnly?: boolean },
): Promise<void> {
	const { backlogDirectory, filesystemOnly = false } = options;
	const backlogDirectorySource = backlogDirectory
		? backlogDirectory === "backlog" || backlogDirectory === ".backlog"
			? (backlogDirectory as "backlog" | ".backlog")
			: "custom"
		: undefined;
	const configLocation = backlogDirectorySource === "custom" ? "root" : "folder";

	await initializeProjectShared(core, {
		projectName,
		backlogDirectory,
		backlogDirectorySource,
		configLocation,
		integrationMode: "none",
		filesystemOnly,
		advancedConfig: {},
	});
}
