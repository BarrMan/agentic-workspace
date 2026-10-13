import type { ProcessRunner } from "./session-process.ts";
import { fail, slug } from "./session-utils.ts";

/** Creates the task-owned branch and worktree while preserving injected process execution. */
export async function ensureSessionWorktree(
	runner: ProcessRunner,
	root: string,
	taskId: string,
	path: string,
): Promise<void> {
	const exists = await runner.run(["git", "worktree", "list", "--porcelain"], { cwd: root });
	if (exists.exitCode === 0 && exists.stdout.includes(`worktree ${path}`)) return;
	const branch = `backlog/session/${slug(taskId)}`;
	let result = await runner.run(["git", "worktree", "add", "-b", branch, path], { cwd: root });
	if (result.exitCode !== 0 && /already exists/i.test(result.stderr))
		result = await runner.run(["git", "worktree", "add", path, branch], { cwd: root });
	if (result.exitCode !== 0) throw fail(`Could not create worktree for ${taskId}`, result);
}
