import { execFileSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "bun";

export async function findGitWorktreeRoot(
	startDir: string,
	options: { strict?: boolean } = {},
): Promise<string | null> {
	let current = resolve(startDir);
	while (true) {
		const gitPath = join(current, ".git");
		let found = false;
		try {
			const metadata = await lstat(gitPath);
			found = true;
			const entry = metadata.isSymbolicLink() ? await stat(gitPath) : metadata;
			if (entry.isFile() || entry.isDirectory()) return current;
			if (options.strict) throw new Error("Git marker is not a file or directory.");
		} catch (error) {
			if (options.strict && (found || (error as NodeJS.ErrnoException).code !== "ENOENT"))
				throw new Error(`Cannot inspect Git worktree marker at ${gitPath}; no state was changed.`, { cause: error });
		}
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}

export async function resolveMainWorktreeRoot(worktreeRoot: string): Promise<string | null> {
	try {
		if (!(await stat(join(worktreeRoot, ".git"))).isFile()) return null;
		const { exitCode, stdout } = await runGit(["worktree", "list", "--porcelain", "-z"], worktreeRoot);
		if (exitCode !== 0) return null;
		const entries: { path: string; bare: boolean }[] = [];
		for (const record of stdout.split("\0\0")) {
			const fields = record.split("\0");
			const first = fields[0];
			if (!first?.startsWith("worktree ")) continue;
			entries.push({ path: first.slice("worktree ".length), bare: fields.includes("bare") });
		}
		const main = entries[0];
		if (!main || main.bare) return null;
		const currentPath = await realpath(resolve(worktreeRoot));
		const registeredPaths = await Promise.all(entries.map((entry) => realpath(resolve(entry.path)).catch(() => null)));
		const mainPath = registeredPaths[0];
		if (!mainPath || mainPath === currentPath || !registeredPaths.includes(currentPath)) return null;
		return (await stat(mainPath)).isDirectory() ? mainPath : null;
	} catch {
		return null;
	}
}

export function resolveMainWorktreeRootSync(worktreeRoot: string): string | null {
	try {
		if (!statSync(join(worktreeRoot, ".git")).isFile()) return null;
		const stdout = execFileSync("git", ["worktree", "list", "--porcelain", "-z"], {
			cwd: worktreeRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		const entries: { path: string; bare: boolean }[] = [];
		for (const record of stdout.split("\0\0")) {
			const fields = record.split("\0");
			const first = fields[0];
			if (!first?.startsWith("worktree ")) continue;
			entries.push({ path: first.slice("worktree ".length), bare: fields.includes("bare") });
		}
		const main = entries[0];
		if (!main || main.bare) return null;
		const currentPath = realpathSync(worktreeRoot);
		const registeredPaths = entries.map((entry) => {
			try {
				return realpathSync(entry.path);
			} catch {
				return null;
			}
		});
		const mainPath = registeredPaths[0];
		if (!mainPath || mainPath === currentPath || !registeredPaths.includes(currentPath)) return null;
		return statSync(mainPath).isDirectory() ? mainPath : null;
	} catch {
		return null;
	}
}

async function runGit(args: string[], cwd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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
