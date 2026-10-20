import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { MILLISECONDS_PER_DAY } from "../../lib/time.ts";
import { DEFAULT_DIRECTORIES } from "../../model/constants.ts";
import type { AgenticWorkspaceConfig } from "../../model/types.ts";

type GitPathContext = {
	repoRoot: string;
	relativePath: string;
};

type GitConfigLoader = () => Promise<AgenticWorkspaceConfig | null>;

const FETCH_TIMEOUT_MS = 10_000;
const MILLISECONDS_PER_SECOND = 1_000;

export interface GitBranchTip {
	name: string;
	commit: string;
	current: boolean;
}

function branchLogArgs(ref: string, dir: string, since?: number | Date): string[] {
	const args = ["log", "--pretty=format:%ct%x00", "--raw", "-z"];
	if (typeof since === "number" && since) args.push(`--since=${since}.days`);
	else if (since instanceof Date) args.push(`--since=@${Math.floor(since.getTime() / MILLISECONDS_PER_SECOND)}`);
	return [...args, ref, "--", dir];
}

function parseBranchModificationLog(output: string): Map<string, Date> {
	const modified = new Map<string, Date>();
	const parts = output.split("\0").filter(Boolean);
	let index = 0;
	while (index < parts.length) {
		const timestamp = Number(parts[index]?.trim());
		if (!Number.isInteger(timestamp)) break;
		index += 1;
		const date = new Date(timestamp * MILLISECONDS_PER_SECOND);
		while (parts[index]?.trimStart().startsWith(":")) {
			const status = parts[index]?.trimStart().split(" ").at(-1) ?? "";
			index += 1;
			const pathCount = status.startsWith("R") || status.startsWith("C") ? 2 : 1;
			for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
				const file = parts[index++];
				if (file && !modified.has(file)) modified.set(file, date);
			}
		}
	}
	return modified;
}

export class GitOperations {
	private projectRoot: string;
	private config: AgenticWorkspaceConfig | null = null;
	private readonly configLoader?: GitConfigLoader;
	private readonly repositories = new Set<string>();
	private readonly repositoryChecks = new Map<string, Promise<boolean>>();
	private readonly fetches = new Map<string, Promise<void>>();

	constructor(projectRoot: string, config: AgenticWorkspaceConfig | null = null, configLoader?: GitConfigLoader) {
		this.projectRoot = projectRoot;
		this.config = config;
		this.configLoader = configLoader;
	}

	setConfig(config: AgenticWorkspaceConfig | null): void {
		this.config = config;
	}

	private async loadConfigIfNeeded(): Promise<void> {
		if (this.config || !this.configLoader) {
			return;
		}
		try {
			this.config = await this.configLoader();
		} catch {
			this.config = null;
		}
	}

	async isRepository(cwd = this.projectRoot): Promise<boolean> {
		await this.loadConfigIfNeeded();
		if (this.config?.filesystemOnly) {
			return false;
		}

		const cacheKey = resolve(cwd);
		if (this.repositories.has(cacheKey)) {
			return true;
		}

		let check = this.repositoryChecks.get(cacheKey);
		if (!check) {
			check = this.detectRepository(cwd);
			this.repositoryChecks.set(cacheKey, check);
		}

		try {
			const isRepository = await check;
			if (isRepository) {
				this.repositories.add(cacheKey);
			}
			return isRepository;
		} finally {
			if (this.repositoryChecks.get(cacheKey) === check) {
				this.repositoryChecks.delete(cacheKey);
			}
		}
	}

	private async detectRepository(cwd: string): Promise<boolean> {
		return await isGitRepository(cwd);
	}

	async commitChanges(message: string, repoRoot?: string | null): Promise<void> {
		if (!(await this.isRepository(repoRoot ?? this.projectRoot))) {
			return;
		}
		const args = ["commit", "-m", message];
		if (this.config?.bypassGitHooks) {
			args.push("--no-verify");
		}
		await this.execGit(args, { cwd: repoRoot ?? undefined });
	}

	async resetPaths(filePaths: string[], repoRoot?: string | null): Promise<void> {
		const uniqueFilePaths = this.normalizeFilePaths(filePaths);
		if (uniqueFilePaths.length === 0) {
			return;
		}

		const paths = await this.resolveRepositoryPaths(uniqueFilePaths, repoRoot);
		if (!paths) return;
		const { repoRoot: resolvedRepoRoot, relativePaths: uniqueRelativePaths } = paths;

		await this.execGit(["reset", "HEAD", "--", ...uniqueRelativePaths], { cwd: resolvedRepoRoot });
	}

	private normalizeFilePaths(filePaths: readonly string[]): string[] {
		return Array.from(new Set(filePaths.map((path) => path.trim()).filter((path) => path.length > 0)));
	}

	private async rebasePathsForRepo(filePaths: readonly string[], repoRoot: string): Promise<string[]> {
		const relativePaths = await Promise.all(
			filePaths.map(async (filePath) => (await this.getRelativePathForRepo(filePath, repoRoot)) ?? filePath),
		);
		return Array.from(new Set(relativePaths.filter((path) => path.length > 0)));
	}

	private async resolveRepositoryPaths(
		filePaths: readonly string[],
		requestedRepoRoot?: string | null,
	): Promise<{ repoRoot: string; relativePaths: string[] } | null> {
		const repoRoot = requestedRepoRoot ?? (await this.getPathContext(filePaths[0] ?? ""))?.repoRoot ?? this.projectRoot;
		if (!(await this.isRepository(repoRoot))) return null;
		const relativePaths = await this.rebasePathsForRepo(filePaths, repoRoot);
		return relativePaths.length > 0 ? { repoRoot, relativePaths } : null;
	}

	async getCurrentBranch(): Promise<string> {
		if (!(await this.isRepository())) {
			return "";
		}
		const { stdout } = await this.execGit(["branch", "--show-current"], { readOnly: true });
		return stdout.trim();
	}

	async getRepositoryRoot(cwd = this.projectRoot): Promise<string | null> {
		return await this.resolveRepoRoot(cwd);
	}

	async listWorktreePaths(): Promise<string[]> {
		if (!(await this.isRepository())) {
			return [];
		}
		try {
			const { stdout } = await this.execGit(["worktree", "list", "--porcelain", "-z"], { readOnly: true });
			return stdout
				.split("\0")
				.filter((line) => line.startsWith("worktree "))
				.map((line) => line.slice("worktree ".length))
				.filter(Boolean);
		} catch {
			return [];
		}
	}

	async getLastCommitMessage(): Promise<string> {
		if (!(await this.isRepository())) {
			return "";
		}
		const { stdout } = await this.execGit(["log", "-1", "--pretty=format:%s"], { readOnly: true });
		return stdout.trim();
	}

	async fetch(remote = "origin"): Promise<void> {
		let fetch = this.fetches.get(remote);
		if (!fetch) {
			fetch = this.fetchConfiguredRemote(remote);
			this.fetches.set(remote, fetch);
		}

		try {
			await fetch;
		} finally {
			if (this.fetches.get(remote) === fetch) {
				this.fetches.delete(remote);
			}
		}
	}

	private async fetchConfiguredRemote(remote: string): Promise<void> {
		await this.loadConfigIfNeeded();
		if (this.config?.remoteOperations === false) {
			if (process.env.DEBUG) {
				console.warn("Remote operations are disabled in config. Skipping fetch.");
			}
			return;
		}
		await this.fetchRemote(remote);
	}

	private async fetchRemote(remote: string): Promise<void> {
		// Preflight: skip if repository has no remotes configured
		const hasRemotes = await this.hasAnyRemote();
		if (!hasRemotes) {
			// No remotes configured; silently skip fetch. A consolidated warning is shown during init if applicable.
			return;
		}

		try {
			// Use --prune to remove dead refs and reduce later scans
			await this.execGit(["fetch", remote, "--prune", "--quiet"], {
				timeoutMs: FETCH_TIMEOUT_MS,
				env: {
					GIT_TERMINAL_PROMPT: "0",
					GCM_INTERACTIVE: "Never",
				},
			});
		} catch (error) {
			// Check if this is a network-related error
			if (this.isNetworkError(error)) {
				// Don't show console warnings - let the calling code handle user messaging
				if (process.env.DEBUG) {
					console.warn(`Network error details: ${error}`);
				}
				return;
			}
			// Re-throw non-network errors
			throw error;
		}
	}

	private isNetworkError(error: unknown): boolean {
		if (typeof error === "string") {
			return this.containsNetworkErrorPattern(error);
		}
		if (error instanceof Error) {
			return this.containsNetworkErrorPattern(error.message);
		}
		return false;
	}

	private containsNetworkErrorPattern(message: string): boolean {
		const networkErrorPatterns = [
			"could not resolve host",
			"connection refused",
			"network is unreachable",
			"timeout",
			"no route to host",
			"connection timed out",
			"temporary failure in name resolution",
			"operation timed out",
		];

		const lowerMessage = message.toLowerCase();
		return networkErrorPatterns.some((pattern) => lowerMessage.includes(pattern));
	}

	async stageAgenticWorkspaceDirectory(
		agenticWorkspaceDir: string = DEFAULT_DIRECTORIES.AGENTIC_WORKSPACE,
	): Promise<string | null> {
		const context = await this.getPathContext(agenticWorkspaceDir);
		if (context) {
			const pathForAdd = context.relativePath === "." ? "." : context.relativePath;
			await this.execGit(["add", pathForAdd], { cwd: context.repoRoot });
			return context.repoRoot;
		}
		if (!(await this.isRepository())) {
			return null;
		}

		await this.execGit(["add", `${agenticWorkspaceDir}/`]);
		return null;
	}
	/**
	 * List recent branch names and immutable tips in one Git process.
	 * The result is sorted so callers can use it as a stable ref fingerprint.
	 */
	async listRecentBranchTips(daysAgo: number): Promise<GitBranchTip[]> {
		await this.loadConfigIfNeeded();
		if (this.config?.filesystemOnly) {
			return [];
		}
		try {
			const since = Date.now() - daysAgo * MILLISECONDS_PER_DAY;

			// Build refs to check based on remoteOperations config
			const refs = ["refs/heads"];
			if (this.config?.remoteOperations !== false) {
				refs.push("refs/remotes/origin");
			}

			// Get local and remote branches with commit dates
			const { stdout } = await this.execGit(
				["for-each-ref", "--format=%(HEAD)%00%(refname:short)%00%(objectname)%00%(committerdate:unix)", ...refs],
				{ readOnly: true },
			);

			return stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.map((line) => {
					const [head, name, commit, timestamp] = line.split("\0");
					return { name, commit, current: head === "*", timestamp: Number(timestamp) * MILLISECONDS_PER_SECOND };
				})
				.filter(
					(entry): entry is GitBranchTip & { timestamp: number } =>
						Boolean(entry.name && entry.commit) &&
						entry.name !== "origin/HEAD" &&
						Number.isFinite(entry.timestamp) &&
						(entry.current || entry.timestamp >= since),
				)
				.map(({ name, commit, current }) => ({ name, commit, current }))
				.sort((left, right) => left.name.localeCompare(right.name));
		} catch {
			// Fallback to all branches if the command fails
			const branches = await this.listAllBranches();
			const currentBranch = await this.getCurrentBranch();
			const tips = await Promise.all(
				branches.map(async (name) => {
					const commit = await this.resolveCommit(name);
					return commit ? { name, commit, current: name === currentBranch } : null;
				}),
			);
			return tips
				.filter((tip): tip is GitBranchTip => tip !== null)
				.sort((left, right) => left.name.localeCompare(right.name));
		}
	}

	async listAllBranches(_remote = "origin"): Promise<string[]> {
		if (!(await this.isRepository())) {
			return [];
		}
		try {
			// Use -a flag only if remote operations are enabled
			const branchArgs =
				this.config?.remoteOperations === false
					? ["branch", "--format=%(refname:short)"]
					: ["branch", "-a", "--format=%(refname:short)"];

			const { stdout } = await this.execGit(branchArgs, { readOnly: true });
			return stdout
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean)
				.filter((b) => !b.includes("HEAD"));
		} catch {
			return [];
		}
	}

	/**
	 * Returns true if the current repository has any remotes configured
	 */
	async hasAnyRemote(): Promise<boolean> {
		if (!(await this.isRepository())) {
			return false;
		}
		try {
			const { stdout } = await this.execGit(["remote"], { readOnly: true });
			return (
				stdout
					.split("\n")
					.map((s) => s.trim())
					.filter(Boolean).length > 0
			);
		} catch {
			return false;
		}
	}

	/**
	 * Resolve a ref (branch name, tag, remote-tracking ref, ...) to its immutable
	 * commit SHA. Returns null when the ref cannot be resolved.
	 *
	 * Used to pin cross-branch task hydration to a fixed commit: the task index is
	 * built (ls-tree) and the content fetched (git show) in two separate steps that
	 * can be seconds apart on large repos. If the branch is deleted, renamed or moved
	 * in between, `git show <branch>:<path>` fails ("failed to stat ...") and the task
	 * is silently dropped. Resolving the SHA up front and hydrating via
	 * `git show <sha>:<path>` makes the second step immune to ref movement.
	 */
	async resolveCommit(ref: string): Promise<string | null> {
		if (!(await this.isRepository())) {
			return null;
		}
		try {
			const { stdout } = await this.execGit(
				["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`],
				{
					readOnly: true,
				},
			);
			const sha = stdout.trim();
			return sha || null;
		} catch {
			return null;
		}
	}
	/**
	 * Build a map of file -> last modified date for all files in a directory in one git log pass
	 * Much more efficient than individual getFileLastModifiedTime calls
	 * Returns a Map of filePath -> Date
	 */
	async getBranchLastModifiedMap(ref: string, dir: string, since?: number | Date): Promise<Map<string, Date>> {
		if (!(await this.isRepository())) {
			return new Map();
		}
		const { stdout } = await this.execGit(branchLogArgs(ref, dir, since), { readOnly: true });
		return parseBranchModificationLog(stdout);
	}

	private async execGit(
		args: string[],
		options?: {
			readOnly?: boolean;
			cwd?: string;
			input?: string;
			env?: Record<string, string>;
			acceptedExitCodes?: readonly number[];
			timeoutMs?: number;
		},
	): Promise<{ stdout: string; stderr: string }> {
		// Use Bun.spawn so we can explicitly control stdio behaviour on Windows. When running
		// under a piped transport, delegating to git with inherited stdin can deadlock.
		const env = {
			...process.env,
			...(options?.readOnly ? { GIT_OPTIONAL_LOCKS: "0" } : {}),
			...options?.env,
		} as Record<string, string>;

		const useProcessGroup = options?.timeoutMs !== undefined && process.platform !== "win32";
		const subprocess = Bun.spawn(["git", ...args], {
			cwd: options?.cwd ?? this.projectRoot,
			stdin: options?.input === undefined ? "ignore" : "pipe",
			stdout: "pipe",
			stderr: "pipe",
			env,
			detached: useProcessGroup,
		});
		const stdoutReader = subprocess.stdout?.getReader();
		const stderrReader = subprocess.stderr?.getReader();
		const readAll = async (reader: ReadableStreamDefaultReader<Uint8Array> | undefined): Promise<string> => {
			if (!reader) return "";
			const decoder = new TextDecoder();
			let output = "";
			while (true) {
				const { done, value } = await reader.read();
				if (done) return `${output}${decoder.decode()}`;
				output += decoder.decode(value, { stream: true });
			}
		};
		if (options?.input !== undefined && subprocess.stdin) {
			subprocess.stdin.write(options.input);
			await subprocess.stdin.end();
		}

		const completion = Promise.all([subprocess.exited, readAll(stdoutReader), readAll(stderrReader)]);
		const killDirectly = () => {
			try {
				subprocess.kill("SIGKILL");
			} catch {
				try {
					subprocess.kill();
				} catch {}
			}
		};
		const killProcessTree = () => {
			if (useProcessGroup) {
				try {
					process.kill(-subprocess.pid, "SIGKILL");
					return;
				} catch {
					killDirectly();
					return;
				}
			}
			if (process.platform !== "win32") {
				killDirectly();
				return;
			}

			try {
				const taskkill = Bun.spawn(["taskkill", "/PID", String(subprocess.pid), "/T", "/F"], {
					stdin: "ignore",
					stdout: "ignore",
					stderr: "ignore",
				});
				void taskkill.exited
					.then((exitCode) => {
						if (exitCode !== 0) killDirectly();
					})
					.catch(killDirectly);
			} catch {
				killDirectly();
			}
		};
		let timeout: ReturnType<typeof setTimeout> | undefined;
		let result: Awaited<typeof completion>;
		try {
			result =
				options?.timeoutMs === undefined
					? await completion
					: await Promise.race([
							completion,
							new Promise<never>((_, reject) => {
								timeout = setTimeout(() => {
									killProcessTree();
									void stdoutReader?.cancel().catch(() => undefined);
									void stderrReader?.cancel().catch(() => undefined);
									reject(new Error(`Git command timeout after ${options.timeoutMs}ms: git ${args.join(" ")}`));
								}, options.timeoutMs);
								timeout.unref();
							}),
						]);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
		const [exitCode, stdout, stderr] = result;

		if (exitCode !== 0 && !options?.acceptedExitCodes?.includes(exitCode)) {
			throw new Error(`Git command failed (exit code ${exitCode}): git ${args.join(" ")}\n${stderr}`);
		}

		return { stdout, stderr };
	}

	private async getPathContext(targetPath: string): Promise<GitPathContext | null> {
		const absolutePath = isAbsolute(targetPath) ? targetPath : join(this.projectRoot, targetPath);
		const resolvedPath = await realpath(absolutePath).catch(() => null);
		if (resolvedPath) {
			return this.buildContext(resolvedPath);
		}

		const resolvedDir = await realpath(dirname(absolutePath)).catch(() => null);
		if (!resolvedDir) return null;
		const reconstructedPath = join(resolvedDir, basename(absolutePath));
		return this.buildContext(reconstructedPath, resolvedDir);
	}

	private async getRelativePathForRepo(targetPath: string, repoRoot: string): Promise<string | null> {
		const absolutePath = isAbsolute(targetPath) ? targetPath : join(this.projectRoot, targetPath);
		const resolvedPath = await realpath(absolutePath).catch(() => null);
		const pathForRelative = resolvedPath ?? (await this.resolveMissingPath(absolutePath));
		if (!pathForRelative) return null;

		const relativePath = this.normalizeGitPath(relative(repoRoot, pathForRelative));
		if (!relativePath || relativePath.startsWith("..")) return null;
		return relativePath === "" ? "." : relativePath;
	}

	private async resolveRepoRoot(startDir: string): Promise<string | null> {
		await this.loadConfigIfNeeded();
		if (this.config?.filesystemOnly) {
			return null;
		}
		try {
			const { stdout } = await this.execGit(["rev-parse", "--show-toplevel"], { readOnly: true, cwd: startDir });
			const root = stdout.trim();
			return root.length > 0 ? root : null;
		} catch {
			return null;
		}
	}

	private async resolveMissingPath(absolutePath: string): Promise<string | null> {
		const resolvedDir = await realpath(dirname(absolutePath)).catch(() => null);
		if (!resolvedDir) return null;
		return join(resolvedDir, basename(absolutePath));
	}

	private async buildContext(resolvedPath: string, resolvedDirHint?: string): Promise<GitPathContext | null> {
		let cwd = resolvedDirHint;
		if (!cwd) {
			const stats = await stat(resolvedPath).catch(() => null);
			if (!stats) {
				cwd = dirname(resolvedPath);
			} else {
				cwd = stats.isDirectory() ? resolvedPath : dirname(resolvedPath);
			}
		}

		const repoRoot = cwd ? await this.resolveRepoRoot(cwd) : null;
		if (!repoRoot) return null;

		const relativePath = this.normalizeGitPath(relative(repoRoot, resolvedPath));
		if (!relativePath || relativePath.startsWith("..")) return null;
		return { repoRoot, relativePath: relativePath === "" ? "." : relativePath };
	}

	private normalizeGitPath(pathValue: string): string {
		return pathValue.replaceAll("\\", "/");
	}
}

export async function isGitRepository(projectRoot: string): Promise<boolean> {
	try {
		const subprocess = Bun.spawn(["git", "rev-parse", "--git-dir"], {
			cwd: projectRoot,
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});

		return (await subprocess.exited) === 0;
	} catch {
		return false;
	}
}
