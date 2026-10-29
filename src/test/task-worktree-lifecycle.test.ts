import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { upsertAgentConfiguration } from "../controller/agent-configuration.ts";
import { Core } from "../controller/agentic-workspace.ts";
import { ensureTaskWorktree, taskWorktreeExists, taskWorktreePath } from "../filesystem/git/task-worktree.ts";
import type { Task } from "../model/types.ts";
import { getBuiltInAgentConfiguration } from "../storage/config.ts";
import { coreFileSystem, createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let WORKTREE_HOME: string;
let originalWorktreeHome: string | undefined;
let core: Core | undefined;

function newTask(id: string, title: string, status = "To Do"): Task {
	return {
		id,
		title,
		status,
		done: false,
		createdDate: "2026-10-07",
		labels: [],
		dependencies: [],
	};
}

async function git(...args: string[]): Promise<void> {
	const child = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" });
	const [, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) throw new Error(stderr);
}

async function commitFixture(): Promise<void> {
	await git(
		"-C",
		TEST_DIR,
		"-c",
		"user.name=Fixture",
		"-c",
		"user.email=fixture@example.test",
		"commit",
		"--allow-empty",
		"-m",
		"fixture",
	);
}

/**
 * Initializes a real git repository project and returns a Core bound to it. `worktreePerTask`
 * writes the project-scoped agent configuration that the lifecycle reads through the normal
 * card > project > root resolution.
 */
async function setupCore(options: { worktreePerTask?: boolean } = {}): Promise<Core> {
	const setupCore = new Core(TEST_DIR);
	await initializeTestProject(setupCore, "Task Worktree Lifecycle", true);
	if (options.worktreePerTask) {
		await upsertAgentConfiguration(setupCore, "project", {
			...getBuiltInAgentConfiguration(),
			sessions: { worktreePerTask: true, yoloMode: false },
		});
	}
	core = new Core(TEST_DIR);
	await core.tasks.init();
	return core;
}

describe("task worktree lifecycle", () => {
	beforeEach(async () => {
		originalWorktreeHome = process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
		TEST_DIR = createUniqueTestDir("test-task-worktree");
		WORKTREE_HOME = createUniqueTestDir("test-task-worktree-home");
		process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = WORKTREE_HOME;
		await mkdir(TEST_DIR, { recursive: true });
		await mkdir(WORKTREE_HOME, { recursive: true });
		initGitRepo(TEST_DIR, "main");
	});

	afterEach(async () => {
		core?.tasks.dispose();
		core = undefined;
		if (originalWorktreeHome === undefined) delete process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
		else process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = originalWorktreeHome;

		const cleanupErrors: unknown[] = [];
		for (const directory of [WORKTREE_HOME, TEST_DIR]) {
			try {
				await safeCleanup(directory);
			} catch (error) {
				cleanupErrors.push(error);
			}
		}
		if (cleanupErrors.length === 1) {
			throw cleanupErrors[0];
		}
		if (cleanupErrors.length > 1) {
			throw new AggregateError(cleanupErrors, "Worktree lifecycle teardown failed");
		}
	});

	it("freezes enabled policy without allocating a worktree at task creation", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const { task } = await current.tasks.create({ title: "Add worktree support" });

		const expectedPath = taskWorktreePath(TEST_DIR, task);
		expect(task.worktreePolicy).toBe("enabled");
		expect((await coreFileSystem(current).loadTask(task.id))?.worktreePolicy).toBe("enabled");
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(expectedPath)).toBe(false);
		expect(expectedPath).toBe(taskWorktreePath(TEST_DIR, { id: "TASK-1", title: "Add worktree support" }));
	});

	it("does not allocate through createTaskFromInput either", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const { task } = await current.tasks.create({ title: "Input path task" });

		expect(task.worktreePolicy).toBe("enabled");
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
	});

	it("does not create a worktree when worktreePerTask is disabled or absent", async () => {
		const current = await setupCore();
		const { task } = await current.tasks.create({ title: "No worktree here" });

		expect(task.worktreePolicy).toBe("disabled");
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(false);
	});

	it("finds a detached worktree moved to another ID-suffixed directory", async () => {
		const task = newTask("TASK-1", "Original title");
		await commitFixture();
		const originalPath = (await ensureTaskWorktree(TEST_DIR, task)) as string;
		const renamedPath = join(WORKTREE_HOME, "renamed-directory-TASK-1");
		await git("-C", TEST_DIR, "worktree", "move", originalPath, renamedPath);
		await git("-C", renamedPath, "checkout", "--detach");

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
	});

	it("only accepts exactly one worktree with the exact task ID", async () => {
		const task = newTask("TASK-1", "Original title");
		await commitFixture();
		await ensureTaskWorktree(TEST_DIR, task);
		const duplicatePath = join(WORKTREE_HOME, "second-directory-TASK-1");
		await git("-C", TEST_DIR, "worktree", "add", "--detach", duplicatePath);

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
	});
});
