import { describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgenticWorkspaceConfig } from "../../model/types.ts";
import { GitOperations, isGitRepository } from "./operations.ts";

const TEST_CONFIG = {
	projectName: "Git operations",
	statuses: [],
	labels: [],
	dateFormat: "YYYY-MM-DD",
} satisfies AgenticWorkspaceConfig;

function createGate(): { promise: Promise<void>; release: () => void } {
	let release: () => void = () => {};
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release: () => release() };
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
}

async function waitForProcessExit(pid: number): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (isProcessAlive(pid)) {
		if (Date.now() >= deadline) throw new Error(`Process ${pid} survived the Git timeout`);
		await Bun.sleep(10);
	}
}

async function runGit(cwd: string, args: string[]): Promise<string> {
	const child = Bun.spawn(["git", ...args], { cwd, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if (exitCode !== 0) throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
	return stdout;
}

async function createRepository(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-git-test-"));
	await runGit(directory, ["init", "-q"]);
	await runGit(directory, ["config", "user.name", "AgenticWorkspace Test"]);
	await runGit(directory, ["config", "user.email", "agentic-workspace-test@example.invalid"]);
	return directory;
}

describe("Git Operations", () => {
	describe("isGitRepository", () => {
		it("detects temporary repositories and ordinary directories", async () => {
			const repository = await createRepository();
			const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-non-git-test-"));
			try {
				expect(await isGitRepository(repository)).toBe(true);
				expect(await new GitOperations(repository).isRepository()).toBe(true);
				expect(await isGitRepository(directory)).toBe(false);
				expect(await new GitOperations(directory).isRepository()).toBe(false);
			} finally {
				await rm(repository, { recursive: true, force: true });
				await rm(directory, { recursive: true, force: true });
			}
		});
	});

	describe("repository path resolution", () => {
		it("unstages only the selected path and leaves other repository state unchanged", async () => {
			const repository = await createRepository();
			try {
				const selected = join(repository, "selected.txt");
				const staged = join(repository, "staged.txt");
				const untouched = join(repository, "untouched.txt");
				await writeFile(selected, "selected original\n");
				await writeFile(staged, "staged original\n");
				await writeFile(untouched, "untouched original\n");
				await runGit(repository, ["add", "."]);
				await runGit(repository, ["commit", "-m", "initial files"]);
				await writeFile(selected, "selected changed\n");
				await writeFile(staged, "staged changed\n");
				await runGit(repository, ["add", "selected.txt", "staged.txt"]);

				await new GitOperations(repository).resetPaths([` ${selected} `, selected], repository);

				expect((await runGit(repository, ["diff", "--cached", "--name-only"])).trim().split("\n")).toEqual([
					"staged.txt",
				]);
				expect((await runGit(repository, ["diff", "--name-only"])).trim().split("\n")).toEqual(["selected.txt"]);
				expect(await readFile(selected, "utf8")).toBe("selected changed\n");
				expect(await readFile(staged, "utf8")).toBe("staged changed\n");
				expect(await readFile(untouched, "utf8")).toBe("untouched original\n");
			} finally {
				await rm(repository, { recursive: true, force: true });
			}
		});
	});

	describe("isRepository", () => {
		it("keeps filesystem-only mode authoritative for a real repository", async () => {
			const repository = await createRepository();
			try {
				const git = new GitOperations(repository, { ...TEST_CONFIG, filesystemOnly: false });
				expect(await git.isRepository()).toBe(true);
				git.setConfig({ ...TEST_CONFIG, filesystemOnly: true });
				expect(await git.isRepository()).toBe(false);
			} finally {
				await rm(repository, { recursive: true, force: true });
			}
		});
	});

	describe("fetch", () => {
		it("settles a failed process output read at the process adapter boundary", async () => {
			const git = new GitOperations(process.cwd());
			const internals = git as unknown as {
				execGit: (args: string[], options: { timeoutMs: number }) => Promise<{ stdout: string; stderr: string }>;
			};
			const runtime = Bun as unknown as { spawn: (...args: unknown[]) => unknown };
			const originalSpawn = runtime.spawn;
			runtime.spawn = () => ({
				pid: 424_242,
				stdin: null,
				stdout: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.error(new Error("output read failed"));
					},
				}),
				stderr: new ReadableStream<Uint8Array>({
					start(controller) {
						controller.close();
					},
				}),
				exited: Promise.resolve(0),
				kill() {},
			});

			try {
				await expect(internals.execGit(["--version"], { timeoutMs: 60_000 })).rejects.toThrow("output read failed");
			} finally {
				runtime.spawn = originalSpawn;
			}
		});

		it("hard-kills a timed-out Git process group even when a child holds its pipes", async () => {
			if (process.platform === "win32") return;
			const git = new GitOperations(process.cwd());
			const internals = git as unknown as {
				execGit: (
					args: string[],
					options: { timeoutMs: number; env?: Record<string, string> },
				) => Promise<{ stdout: string; stderr: string }>;
			};
			const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-git-timeout-"));
			const scriptPath = join(directory, "hang.sh");
			const pidPath = join(directory, "child.pid");
			let childPid: number | undefined;
			let deadlineCallback: (() => void) | undefined;
			const originalSetTimeout = globalThis.setTimeout;
			const deadlineTimer = (...[callback, delay, ...args]: Parameters<typeof setTimeout>) => {
				if (delay === 500) {
					deadlineCallback = () => {
						if (typeof callback === "function") callback(...args);
					};
					return originalSetTimeout(() => {}, 60_000);
				}
				return originalSetTimeout(callback, delay, ...args);
			};
			const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(
				Object.assign(deadlineTimer, originalSetTimeout),
			);
			let command: Promise<{ stdout: string; stderr: string }> | undefined;

			try {
				await writeFile(
					scriptPath,
					`#!/bin/sh
trap '' TERM
(trap '' TERM; sleep 30) &
child_pid=$!
printf '%s\\n' "$child_pid" > "$AGENTIC_WORKSPACE_TIMEOUT_PID_FILE"
wait "$child_pid"
`,
					{ mode: 0o755 },
				);

				command = internals.execGit(["-c", `alias.hang=!${scriptPath}`, "hang"], {
					timeoutMs: 500,
					env: { AGENTIC_WORKSPACE_TIMEOUT_PID_FILE: pidPath },
				});
				const readinessDeadline = Date.now() + 5_000;
				while (childPid === undefined) {
					try {
						childPid = Number((await readFile(pidPath, "utf8")).trim());
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
					}
					if (Date.now() >= readinessDeadline) throw new Error("Timed-out Git child did not become ready");
					await Bun.sleep(10);
				}
				expect(Number.isSafeInteger(childPid)).toBe(true);
				expect(deadlineCallback).toBeDefined();
				deadlineCallback?.();
				await expect(command).rejects.toThrow("Git command timeout after 500ms");
				await waitForProcessExit(childPid);
			} finally {
				setTimeoutSpy.mockRestore();
				try {
					if (childPid && isProcessAlive(childPid)) {
						process.kill(childPid, "SIGKILL");
						await waitForProcessExit(childPid);
					}
					await command?.catch(() => {});
				} finally {
					await rm(directory, { recursive: true, force: true });
				}
			}
		});

		it("coalesces concurrent fetches and bounds non-interactive Git work", async () => {
			const git = new GitOperations(process.cwd(), {
				...TEST_CONFIG,
				remoteOperations: true,
			});
			let remoteChecks = 0;
			let fetchCalls = 0;
			const fetchStarted = createGate();
			const fetchGate = createGate();
			let captured:
				| {
						args: string[];
						options?: { env?: Record<string, string>; timeoutMs?: number };
				  }
				| undefined;
			const internals = git as unknown as {
				hasAnyRemote: () => Promise<boolean>;
				execGit: (
					args: string[],
					options?: { env?: Record<string, string>; timeoutMs?: number },
				) => Promise<{ stdout: string; stderr: string }>;
			};
			internals.hasAnyRemote = async () => {
				remoteChecks += 1;
				return true;
			};
			internals.execGit = async (args, options) => {
				fetchCalls += 1;
				captured = { args, options };
				fetchStarted.release();
				await fetchGate.promise;
				return { stdout: "", stderr: "" };
			};

			const first = git.fetch();
			const second = git.fetch();
			await fetchStarted.promise;
			expect(remoteChecks).toBe(1);
			expect(fetchCalls).toBe(1);

			fetchGate.release();
			await Promise.all([first, second]);
			expect(captured).toEqual({
				args: ["fetch", "origin", "--prune", "--quiet"],
				options: {
					env: {
						GIT_TERMINAL_PROMPT: "0",
						GCM_INTERACTIVE: "Never",
					},
					timeoutMs: 10_000,
				},
			});

			await git.fetch();
			expect(remoteChecks).toBe(2);
			expect(fetchCalls).toBe(2);
		});

		it("loads configuration before deciding whether remote work is disabled", async () => {
			let configLoads = 0;
			let remoteChecks = 0;
			const git = new GitOperations(process.cwd(), null, async () => {
				configLoads += 1;
				return {
					...TEST_CONFIG,
					remoteOperations: false,
				};
			});
			const internals = git as unknown as {
				hasAnyRemote: () => Promise<boolean>;
			};
			internals.hasAnyRemote = async () => {
				remoteChecks += 1;
				return true;
			};

			await git.fetch();

			expect(configLoads).toBe(1);
			expect(remoteChecks).toBe(0);
		});

		it("coalesces lazy configuration and fetch work on concurrent first use", async () => {
			let configLoads = 0;
			let fetchCalls = 0;
			const configStarted = createGate();
			const configGate = createGate();
			const git = new GitOperations(process.cwd(), null, async () => {
				configLoads += 1;
				configStarted.release();
				await configGate.promise;
				return { ...TEST_CONFIG, remoteOperations: true };
			});
			const internals = git as unknown as {
				hasAnyRemote: () => Promise<boolean>;
				execGit: () => Promise<{ stdout: string; stderr: string }>;
			};
			internals.hasAnyRemote = async () => true;
			internals.execGit = async () => {
				fetchCalls += 1;
				return { stdout: "", stderr: "" };
			};

			const first = git.fetch();
			const second = git.fetch();
			await configStarted.promise;
			configGate.release();
			await Promise.all([first, second]);

			expect(configLoads).toBe(1);
			expect(fetchCalls).toBe(1);
		});

		it("treats a bounded fetch timeout as a transient network failure", async () => {
			const git = new GitOperations(process.cwd(), {
				...TEST_CONFIG,
				remoteOperations: true,
			});
			const internals = git as unknown as {
				hasAnyRemote: () => Promise<boolean>;
				execGit: () => Promise<{ stdout: string; stderr: string }>;
			};
			internals.hasAnyRemote = async () => true;
			internals.execGit = async () => {
				throw new Error("Git command timeout after 10000ms");
			};

			await expect(git.fetch()).resolves.toBeUndefined();
		});
	});

	describe("resolveCommit", () => {
		it("should terminate rev-parse options before the ref", async () => {
			const git = new GitOperations(process.cwd());
			let capturedArgs: string[] = [];
			const internals = git as unknown as {
				isRepository: () => Promise<boolean>;
				execGit: (args: string[], options?: unknown) => Promise<{ stdout: string; stderr: string }>;
			};
			internals.isRepository = async () => true;
			internals.execGit = async (args: string[]) => {
				capturedArgs = args;
				return {
					stdout: "abc123\n",
					stderr: "",
				};
			};

			const sha = await git.resolveCommit("-raw-ref");

			expect(sha).toBe("abc123");
			expect(capturedArgs).toEqual(["rev-parse", "--verify", "--quiet", "--end-of-options", "-raw-ref^{commit}"]);
		});
	});

	describe("listRecentBranchTips", () => {
		it("captures current-branch identity and ref tips in one Git query", async () => {
			const git = new GitOperations(process.cwd(), {
				...TEST_CONFIG,
				remoteOperations: true,
			});
			const now = Math.floor(Date.now() / 1000);
			let capturedArgs: string[] = [];
			let callCount = 0;
			const internals = git as unknown as {
				execGit: (args: string[], options?: unknown) => Promise<{ stdout: string; stderr: string }>;
			};
			internals.execGit = async (args: string[]) => {
				callCount += 1;
				capturedArgs = args;
				return {
					stdout: `*\0main\0aaa111\0${now}\n \0origin/feature\0bbb222\0${now}\n`,
					stderr: "",
				};
			};

			const tips = await git.listRecentBranchTips(30);

			expect(callCount).toBe(1);
			expect(capturedArgs).toEqual([
				"for-each-ref",
				"--format=%(HEAD)%00%(refname:short)%00%(objectname)%00%(committerdate:unix)",
				"refs/heads",
				"refs/remotes/origin",
			]);
			expect(tips).toEqual([
				{ name: "main", commit: "aaa111", current: true },
				{ name: "origin/feature", commit: "bbb222", current: false },
			]);
		});

		it("retains the current branch when its tip is older than the active window", async () => {
			const git = new GitOperations(process.cwd(), {
				...TEST_CONFIG,
				remoteOperations: false,
			});
			const oldTimestamp = Math.floor(Date.now() / 1000) - 60 * 24 * 60 * 60;
			const internals = git as unknown as {
				execGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
			};
			internals.execGit = async () => ({
				stdout: `*\0main\0aaa111\0${oldTimestamp}\n \0old-feature\0bbb222\0${oldTimestamp}\n`,
				stderr: "",
			});

			const tips = await git.listRecentBranchTips(30);

			expect(tips).toEqual([{ name: "main", commit: "aaa111", current: true }]);
		});
	});

	describe("getBranchLastModifiedMap", () => {
		it("uses raw NUL-delimited records so numeric filenames are not mistaken for timestamps", async () => {
			const git = new GitOperations(process.cwd());
			const internals = git as unknown as {
				isRepository: () => Promise<boolean>;
				execGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
			};
			internals.isRepository = async () => true;
			internals.execGit = async () => ({
				stdout: "1700000000\0:100644 100644 old new M\0" + "123\0",
				stderr: "",
			});

			expect(await git.getBranchLastModifiedMap("abc123", "agentic-workspace")).toEqual(
				new Map([["123", new Date(1_700_000_000 * 1_000)]]),
			);
		});

		it("passes an absolute cache cutoff to Git", async () => {
			const git = new GitOperations(process.cwd());
			let capturedArgs: string[] = [];
			const internals = git as unknown as {
				isRepository: () => Promise<boolean>;
				execGit: (args: string[]) => Promise<{ stdout: string; stderr: string }>;
			};
			internals.isRepository = async () => true;
			internals.execGit = async (args) => {
				capturedArgs = args;
				return { stdout: "", stderr: "" };
			};
			const cutoff = new Date("2026-07-11T00:00:00Z");

			expect(await git.getBranchLastModifiedMap("abc123", "agentic-workspace", cutoff)).toEqual(new Map());
			expect(capturedArgs).toContain("--raw");
			expect(capturedArgs).toContain(`--since=@${Math.floor(cutoff.getTime() / 1000)}`);
		});

		it("propagates Git history failures", async () => {
			const git = new GitOperations(process.cwd());
			const internals = git as unknown as {
				isRepository: () => Promise<boolean>;
				execGit: () => Promise<{ stdout: string; stderr: string }>;
			};
			internals.isRepository = async () => true;
			internals.execGit = async () => {
				throw new Error("history unavailable");
			};

			await expect(git.getBranchLastModifiedMap("abc123", "agentic-workspace")).rejects.toThrow("history unavailable");
		});
	});

	// Note: Skipping integration tests that require git repository setup
	// These tests can be enabled for local development but may timeout in CI
});
