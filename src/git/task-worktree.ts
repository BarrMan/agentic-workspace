import { homedir } from "node:os";
import { basename, join } from "node:path";
import { spawn } from "bun";

/** Minimal task identity needed to name a task-owned worktree. */
export interface WorktreeTaskRef {
	id: string;
	title: string;
}

interface GitResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

function slug(value: string): string {
	return value
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-|-$/g, "");
}

/**
 * Root that holds task worktrees. Defaults to `~/.agentic-workspace`; the override exists so the test suite
 * (and sandboxed runs) never write into a developer's real home directory.
 */
export function taskWorktreeRoot(): string {
	const override = process.env.AGENTIC_WORKSPACE_WORKTREE_HOME?.trim();
	return override || join(homedir(), ".agentic-workspace");
}

/**
 * `<worktree root>/<project dir name>/<task title slug>-<task id>`.
 * The task id suffix keeps two tasks with the same title from colliding.
 */
export function taskWorktreePath(projectRoot: string, task: WorktreeTaskRef): string {
	const project = basename(projectRoot).replaceAll(/[^A-Za-z0-9._-]+/g, "-") || "project";
	const title = slug(task.title) || "task";
	return join(taskWorktreeRoot(), project, `${title}-${task.id}`);
}

export function taskWorktreeBranch(taskId: string): string {
	return `agentic-workspace/task/${taskId}`;
}

async function runGit(args: string[], cwd: string): Promise<GitResult> {
	try {
		const proc = spawn({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe" });
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		return { exitCode, stdout, stderr };
	} catch (error) {
		return { exitCode: -1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
	}
}

async function isGitWorkTree(projectRoot: string): Promise<boolean> {
	const result = await runGit(["rev-parse", "--is-inside-work-tree"], projectRoot);
	return result.exitCode === 0 && result.stdout.trim() === "true";
}

interface WorktreeEntry {
	path: string;
	branch?: string;
}

async function worktreeEntries(projectRoot: string): Promise<WorktreeEntry[]> {
	const result = await runGit(["worktree", "list", "--porcelain"], projectRoot);
	if (result.exitCode !== 0) return [];
	const entries: WorktreeEntry[] = [];
	let current: WorktreeEntry | undefined;
	for (const line of result.stdout.split("\n")) {
		if (line.startsWith("worktree ")) {
			current = { path: line.slice("worktree ".length).trimEnd() };
			entries.push(current);
		} else if (line.startsWith("branch ") && current) {
			current.branch = line.slice("branch ".length).trim();
		}
	}
	return entries;
}

/**
 * Locate a task's registered worktree by its id-based branch. Branch identity, not the title slug,
 * is authoritative: a task renamed after its worktree was created still resolves to the same path.
 * Falls back to the id-suffixed directory name for a detached or otherwise branch-less worktree.
 */
function findTaskWorktree(
	entries: WorktreeEntry[],
	projectRoot: string,
	task: WorktreeTaskRef,
): WorktreeEntry | undefined {
	const branchRef = `refs/heads/${taskWorktreeBranch(task.id)}`;
	const byBranch = entries.find((entry) => entry.branch === branchRef);
	if (byBranch) return byBranch;
	const computed = taskWorktreePath(projectRoot, task);
	return (
		entries.find((entry) => entry.path === computed) ??
		entries.find((entry) => basename(entry.path) === basename(computed))
	);
}

export async function taskWorktreeExists(projectRoot: string, task: WorktreeTaskRef): Promise<boolean> {
	if (!(await isGitWorkTree(projectRoot))) return false;
	return findTaskWorktree(await worktreeEntries(projectRoot), projectRoot, task) !== undefined;
}

/**
 * Create (or adopt) the task's worktree. Idempotent: an already-registered worktree (even one whose
 * title slug changed) is returned as-is.
 * Returns the worktree path, or `undefined` when the project is not a git repository.
 */
export async function ensureTaskWorktree(projectRoot: string, task: WorktreeTaskRef): Promise<string | undefined> {
	if (!(await isGitWorkTree(projectRoot))) return undefined;
	const existing = findTaskWorktree(await worktreeEntries(projectRoot), projectRoot, task);
	if (existing) return existing.path;
	const path = taskWorktreePath(projectRoot, task);
	const branch = taskWorktreeBranch(task.id);
	let result = await runGit(["worktree", "add", "-b", branch, path], projectRoot);
	if (result.exitCode !== 0 && /already exists/i.test(result.stderr)) {
		result = await runGit(["worktree", "add", path, branch], projectRoot);
	}
	if (result.exitCode !== 0) {
		throw new Error(`Could not create worktree for ${task.id}: ${(result.stderr || result.stdout).trim()}`);
	}
	return path;
}

/**
 * Remove the task's worktree and its branch. Git failures remain visible so destructive callers
 * can retain task tracking and report partial completion.
 */
export async function removeTaskWorktree(projectRoot: string, task: WorktreeTaskRef): Promise<void> {
	if (!(await isGitWorkTree(projectRoot))) return;
	const existing = findTaskWorktree(await worktreeEntries(projectRoot), projectRoot, task);
	if (!existing) return;
	const removed = await runGit(["worktree", "remove", existing.path], projectRoot);
	if (removed.exitCode !== 0)
		throw new Error(`Could not remove worktree for ${task.id}: ${(removed.stderr || removed.stdout).trim()}`);
	const pruned = await runGit(["worktree", "prune"], projectRoot);
	if (pruned.exitCode !== 0)
		throw new Error(
			`Worktree for ${task.id} was removed, but registration cleanup failed: ${(pruned.stderr || pruned.stdout).trim()}`,
		);
	const branch = await runGit(["branch", "-D", taskWorktreeBranch(task.id)], projectRoot);
	if (branch.exitCode !== 0)
		throw new Error(
			`Worktree for ${task.id} was removed, but its branch was not: ${(branch.stderr || branch.stdout).trim()}`,
		);
}
