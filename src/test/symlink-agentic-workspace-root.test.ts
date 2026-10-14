import { describe, expect, it } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { createUniqueTestDir, isWindows, safeCleanup } from "./test-utils.ts";

type SymlinkFixture = { repoDir: string; agenticWorkspaceDir: string };

/**
 * Runs one case against its own pair of throwaway directories. Each case builds and writes its own
 * repositories, so no two cases can ever touch the same repository, index or worktree, and the
 * cleanup stays inside the case that created it.
 */
async function withSymlinkFixture(run: (fixture: SymlinkFixture) => Promise<void>): Promise<void> {
	const repoDir = createUniqueTestDir("test-symlink-root-repo");
	const agenticWorkspaceDir = createUniqueTestDir("test-symlink-root-agentic-workspace");
	await mkdir(repoDir, { recursive: true });
	await mkdir(agenticWorkspaceDir, { recursive: true });
	try {
		await run({ repoDir, agenticWorkspaceDir });
	} finally {
		await safeCleanup(repoDir);
		await safeCleanup(agenticWorkspaceDir);
	}
}

describe("Symlinked agentic-workspace root", () => {
	/**
	 * Registers a case with fixture directories that only that case can see. Symlinked roots are a
	 * POSIX feature, so Windows skips the case instead of adapting the fixture.
	 */
	const itWithFixture = (name: string, body: (fixture: SymlinkFixture) => Promise<void>): void => {
		if (isWindows()) {
			it.skip(name, () => {});
			return;
		}
		it(name, () => withSymlinkFixture(body));
	};

	itWithFixture("creates tasks when agentic-workspace root is a symlink", async ({ repoDir, agenticWorkspaceDir }) => {
		await mkdir(join(agenticWorkspaceDir, "tasks"), { recursive: true });
		await mkdir(join(agenticWorkspaceDir, "drafts"), { recursive: true });
		await writeFile(
			join(agenticWorkspaceDir, "config.yml"),
			`project_name: "Symlink Root"
statuses: ["To Do", "In Progress", "Done"]
`,
		);

		await symlink(agenticWorkspaceDir, join(repoDir, "agentic-workspace"));

		const core = new Core(repoDir);
		const { task } = await core.createTaskFromInput({ title: "Symlink root task" });

		const taskFile = join(agenticWorkspaceDir, "tasks", "task-1", "task.md");
		expect(await Bun.file(taskFile).exists()).toBe(true);
		expect(task.id).toBe("TASK-1");

		const tasks = await core.queryTasks({ includeCrossBranch: false });
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.id).toBe("TASK-1");
	});
});
