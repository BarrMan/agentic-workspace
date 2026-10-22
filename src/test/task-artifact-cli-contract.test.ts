import { afterEach, describe, expect, it } from "bun:test";
import { readFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const roots: string[] = [];
const CLI_COMMAND = getTestCliCommand();

afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function project(prefix: string) {
	const root = createUniqueTestDir(prefix);
	roots.push(root);
	const core = new Core(root);
	await initializeFilesystemTestProject(core, "Task Artifact Contract");
	const created = await Bun.$`${CLI_COMMAND} task create "Artifact contract task"`.cwd(root).nothrow().quiet();
	expect(created.exitCode).toBe(0);
	const tasks = await core.loadTasks();
	expect(tasks).toHaveLength(1);
	return { root, core, taskId: tasks[0]?.id ?? "" };
}

describe("generic task artifact CLI contract", () => {
	it("creates, lists, reads, writes and reports artifacts from a linked worktree with canonical paths", async () => {
		const { root, core, taskId } = await project("task-artifact-cli-worktree");
		const worktree = join(root, "linked-worktree");
		await Bun.$`git init -b main`.cwd(root).quiet();
		await Bun.$`git add .`.cwd(root).quiet();
		await Bun.$`git -c user.name=Test -c user.email=test@example.invalid commit -m initial`.cwd(root).quiet();
		await Bun.$`git worktree add ${worktree} -b linked`.cwd(root).quiet();
		const initialTaskList = await Bun.$`${CLI_COMMAND} task artifact list ${taskId} --json`
			.cwd(worktree)
			.nothrow()
			.quiet();
		expect(initialTaskList.exitCode).toBe(0);
		const initial = JSON.parse(initialTaskList.stdout.toString());
		const expectedDirectory = await coreFileSystem(core).taskArtifacts.containerPath(taskId);
		expect(initial).toEqual({ artifacts: [] });

		const write =
			await Bun.$`printf 'generic bytes without frontmatter\n' | ${CLI_COMMAND} task artifact write ${taskId} custom/brief.txt`
				.cwd(worktree)
				.nothrow()
				.quiet();
		expect(write.exitCode).toBe(0);
		expect(write.stdout.toString()).toContain("Written\tcustom/brief.txt");
		const canonicalPath = join(expectedDirectory, "artifacts", "custom", "brief.txt");
		expect(await readFile(canonicalPath, "utf8")).toBe("generic bytes without frontmatter\n");

		const listing = await Bun.$`${CLI_COMMAND} task artifact list ${taskId} --json`.cwd(worktree).nothrow().quiet();
		const listed = JSON.parse(listing.stdout.toString());
		expect(listed.artifacts).toEqual([
			{ path: "custom/brief.txt", size: Buffer.byteLength("generic bytes without frontmatter\n"), type: "text" },
		]);
		const read = await Bun.$`${CLI_COMMAND} task artifact read ${taskId} custom/brief.txt --json`
			.cwd(worktree)
			.nothrow()
			.quiet();
		expect(JSON.parse(read.stdout.toString())).toEqual({
			contentBase64: Buffer.from("generic bytes without frontmatter\n").toString("base64"),
		});
		const plain = await Bun.$`${CLI_COMMAND} task artifact list ${taskId} --plain`.cwd(worktree).nothrow().quiet();
		expect(plain.stdout.toString()).toContain("text\t");
		expect(plain.stdout.toString()).toContain("custom/brief.txt");

		const taskBefore = await readFile(join(expectedDirectory, "task.md"), "utf8");
		for (const ordinaryName of [".artifacts.json", "task.md"]) {
			const written = await Bun.$`printf x | ${CLI_COMMAND} task artifact write ${taskId} ${ordinaryName}`
				.cwd(worktree)
				.nothrow()
				.quiet();
			expect(written.exitCode).toBe(0);
			expect(await readFile(join(expectedDirectory, "artifacts", ordinaryName), "utf8")).toBe("x");
		}
		expect(await readFile(join(expectedDirectory, "task.md"), "utf8")).toBe(taskBefore);

		await symlink(root, join(expectedDirectory, "artifacts", "outside"), "dir");
		for (const invalid of ["../escape", "/escape", "outside/escape"]) {
			const rejected = await Bun.$`printf x | ${CLI_COMMAND} task artifact write ${taskId} ${invalid}`
				.cwd(worktree)
				.nothrow()
				.quiet();
			expect(rejected.exitCode).not.toBe(0);
		}
	});
});
