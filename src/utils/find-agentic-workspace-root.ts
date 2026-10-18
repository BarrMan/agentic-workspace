import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { findGitWorktreeRoot, resolveMainWorktreeRoot } from "../git/main-worktree.ts";
import { resolveAgenticWorkspaceDirectory } from "./agentic-workspace-directory.ts";

function hasProjectMarker(root: string): boolean {
	return Boolean(resolveAgenticWorkspaceDirectory(root).configPath);
}

async function findMarkerRoot(startDir: string, boundary?: string): Promise<string | null> {
	let current = startDir;
	while (current !== dirname(current) || current === boundary) {
		if (hasProjectMarker(current)) return current;
		if (current === boundary) break;
		current = dirname(current);
	}
	return null;
}

/**
 * Finds the AgenticWorkspace project root, preferring the main worktree's corresponding project.
 *
 * @param startDir - The directory to start searching from (typically process.cwd())
 * @returns The project root path, or null if no AgenticWorkspace project found
 */
export async function findAgenticWorkspaceRoot(startDir: string): Promise<string | null> {
	const localRoot = await findMarkerRoot(startDir);

	const worktreeRoot = await findGitWorktreeRoot(startDir);
	const mainRoot = worktreeRoot ? await resolveMainWorktreeRoot(worktreeRoot) : null;
	if (worktreeRoot && mainRoot) {
		let offset = relative(worktreeRoot, resolve(localRoot ?? startDir));
		if (offset === ".." || offset.startsWith(`..${sep}`) || isAbsolute(offset)) {
			offset = relative(worktreeRoot, resolve(startDir));
		}
		if (offset !== ".." && !offset.startsWith(`..${sep}`) && !isAbsolute(offset)) {
			const mainProject = await findMarkerRoot(join(mainRoot, offset), mainRoot);
			if (mainProject) return mainProject;
		}
	}
	return localRoot;
}
