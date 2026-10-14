import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/agentic-workspace.ts";
import { loadTaskCorpus } from "../core/task-detail.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { buildDependencyGraph } from "../utils/dependency-graph.ts";
import { createUniqueTestDir, initGitRepo, safeCleanup } from "./test-utils.ts";

let testDir: string;
let core: Core;
let extraDirs: string[];
let extraCores: Core[];

function trackDir(suffix: string): string {
	const dir = `${testDir}-${suffix}`;
	extraDirs.push(dir);
	return dir;
}

function trackCore(instance: Core): Core {
	extraCores.push(instance);
	return instance;
}

function task(id: string, title: string, status = "To Do"): Task {
	return {
		id,
		title,
		status,
		assignee: [],
		createdDate: "2026-08-01",
		labels: [],
		dependencies: [],
		description: `${title} body`,
	};
}

async function writeTask(directory: string, _filename: string, value: Task): Promise<string> {
	const container = join(directory, value.id.toLowerCase());
	await mkdir(container, { recursive: true });
	const path = join(container, "task.md");
	await Bun.write(path, serializeTask(value));
	return path;
}

async function commit(message: string, date: string): Promise<void> {
	await $`git add -A`.cwd(testDir).quiet();
	await $`GIT_AUTHOR_DATE="${date}" GIT_COMMITTER_DATE="${date}" git -c user.name="AgenticWorkspace Test" -c user.email="test@example.com" commit -m ${message}`
		.cwd(testDir)
		.quiet();
}

function recentCommitDate(minutesAgo: number): string {
	return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

beforeEach(async () => {
	testDir = createUniqueTestDir("core-task-corpus-regressions");
	extraDirs = [];
	extraCores = [];
	core = new Core(testDir);
	await core.filesystem.ensureAgenticWorkspaceStructure();
	await core.filesystem.saveConfig({
		projectName: "Core task corpus regressions",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		checkActiveBranches: true,
		activeBranchDays: 30,
	});
	initGitRepo(testDir);
	await commit("Initialize project", recentCommitDate(3));
});

afterEach(async () => {
	for (const dir of [testDir, ...extraDirs]) {
		await safeCleanup(dir);
	}
});

describe("Core shared task corpus regressions", () => {
	it("reads changed completed branch content at the same path after its ref moves", async () => {
		await $`git switch -c feature-completed`.cwd(testDir).quiet();
		const completedPath = await writeTask(
			core.filesystem.completedDir,
			"task-1 - Completed.md",
			task("TASK-1", "Before ref move", "Done"),
		);
		await commit("Add completed branch task", recentCommitDate(2));
		await $`git switch main`.cwd(testDir).quiet();

		expect((await core.getTask("TASK-1"))?.title).toBe("Before ref move");

		await $`git switch feature-completed`.cwd(testDir).quiet();
		await Bun.write(completedPath, serializeTask(task("TASK-1", "After ref move", "Done")));
		await commit("Update completed branch task", recentCommitDate(1));
		await $`git switch main`.cwd(testDir).quiet();

		expect((await core.getTask("TASK-1"))?.title).toBe("After ref move");
		expect(
			((await core.loadTaskSnapshot()).branchStateEntries ?? []).find(
				(entry) => entry.id === "TASK-1" && entry.type === "completed",
			)?.task?.title ?? undefined,
		).toBe("After ref move");
	});

	it("resolves a dependency completed only on another branch as completed in the cross-branch corpus", async () => {
		await writeTask(core.filesystem.tasksDir, "task-2 - Root.md", {
			...task("TASK-2", "Root task"),
			dependencies: ["TASK-1"],
		});
		await commit("Add root task", recentCommitDate(2));
		await $`git switch -c feature-completed-dependency`.cwd(testDir).quiet();
		await writeTask(
			core.filesystem.completedDir,
			"task-1 - Completed elsewhere.md",
			task("TASK-1", "Completed elsewhere", "Done"),
		);
		await commit("Complete dependency on branch", recentCommitDate(1));
		await $`git switch main`.cwd(testDir).quiet();

		const corpus = await loadTaskCorpus(core, { includeCrossBranch: true });
		expect(corpus.completedTasks.some((candidate) => candidate.id === "TASK-1")).toBe(true);

		const root = corpus.tasks.find((candidate) => candidate.id === "TASK-2");
		expect(root).toBeDefined();
		const graph = buildDependencyGraph(root as Task, corpus);
		const dependency = graph.nodes.find((candidate) => candidate.id === "TASK-1");
		expect(dependency?.state).toBe("resolved");
		expect(dependency?.completed).toBe(true);
	});

	it("allocates past a completed task on another branch", async () => {
		await $`git switch -c feature-completed-id`.cwd(testDir).quiet();
		await writeTask(
			core.filesystem.completedDir,
			"task-41 - Completed.md",
			task("TASK-41", "Completed branch reservation", "Done"),
		);
		await commit("Reserve completed branch ID", recentCommitDate(2));
		await $`git branch feature-completed-id-alias`.cwd(testDir).quiet();
		await $`git switch main`.cwd(testDir).quiet();

		const created = await core.createTaskFromInput({ title: "Allocated after completed branch ID" });
		expect(created.task.id).toBe("TASK-42");
		expect(((await core.loadTaskSnapshot()).branchStateEntries ?? []).some((entry) => entry.id === "TASK-41")).toBe(
			true,
		);
	});

	it("keeps an in-flight Core bound to fresh branch state after an ID allocation", async () => {
		const watcherCore = trackCore(new Core(testDir));
		await $`git switch -c feature-stale`.cwd(testDir).quiet();
		await writeTask(watcherCore.filesystem.tasksDir, "task-1 - Branch.md", task("TASK-1", "Before ref move"));
		await commit("Add branch task", recentCommitDate(2));
		await $`git switch main`.cwd(testDir).quiet();

		// Establish an earlier read before the branch tip changes.
		expect((await watcherCore.getTask("TASK-1"))?.title).toBe("Before ref move");

		// Moving the tip from a second worktree leaves this project's watched
		// directories untouched, so only ref-fingerprint comparison can notice it.
		const worktreeDir = trackDir("worktree");
		await $`git worktree add ${worktreeDir} feature-stale`.cwd(testDir).quiet();
		const worktreeTaskPath = join(worktreeDir, "agentic-workspace", "tasks", "task-1", "task.md");
		await Bun.write(worktreeTaskPath, serializeTask(task("TASK-1", "After ref move")));
		await $`git add -A`.cwd(worktreeDir).quiet();
		await $`git -c user.name="AgenticWorkspace Test" -c user.email="test@example.com" commit -m "Move branch tip"`
			.cwd(worktreeDir)
			.quiet();

		// Allocation and the subsequent read each use a fresh persistent snapshot.
		expect(await watcherCore.generateNextId()).toBe("TASK-2");

		expect((await watcherCore.getTask("TASK-1"))?.title).toBe("After ref move");
	});

	it("keeps an in-flight Core bound to fresh branch state after a local deletion", async () => {
		const watcherCore = trackCore(new Core(testDir));
		await $`git switch -c feature-stale`.cwd(testDir).quiet();
		await writeTask(watcherCore.filesystem.tasksDir, "task-1 - Branch.md", task("TASK-1", "Before ref move"));
		await commit("Add branch task", recentCommitDate(2));
		await $`git switch main`.cwd(testDir).quiet();

		const deletedTaskPath = await writeTask(
			watcherCore.filesystem.tasksDir,
			"task-2 - Local only.md",
			task("TASK-2", "Local only task"),
		);

		// Establish an earlier read before the branch tip changes.
		expect((await watcherCore.getTask("TASK-1"))?.title).toBe("Before ref move");

		// Moving the tip from a second worktree leaves this project's watched
		// directories untouched, so only ref-fingerprint comparison can notice it.
		const worktreeDir = trackDir("worktree");
		await $`git worktree add ${worktreeDir} feature-stale`.cwd(testDir).quiet();
		const worktreeTaskPath = join(worktreeDir, "agentic-workspace", "tasks", "task-1", "task.md");
		await Bun.write(worktreeTaskPath, serializeTask(task("TASK-1", "After ref move")));
		await $`git add -A`.cwd(worktreeDir).quiet();
		await $`git -c user.name="AgenticWorkspace Test" -c user.email="test@example.com" commit -m "Move branch tip"`
			.cwd(worktreeDir)
			.quiet();

		await unlink(deletedTaskPath);
		expect(await watcherCore.getTask("TASK-2")).toBeNull();

		expect((await watcherCore.getTask("TASK-1"))?.title).toBe("After ref move");
	});
});
