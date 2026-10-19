import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { ensureTaskWorktree, taskWorktreeExists, taskWorktreePath } from "../filesystem/git/task-worktree.ts";
import { resolveSessionSettings } from "../model/session/types.ts";
import type { Task } from "../model/types.ts";
import { sessionCwdFor } from "../runtime/session-service-mechanics.ts";
import { getBuiltInAgentConfiguration, upsertAgentConfiguration } from "../storage/config.ts";
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
		assignee: [],
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
		const task = newTask("TASK-1", "Add worktree support");
		await current.createTask(task);

		const expectedPath = taskWorktreePath(TEST_DIR, task);
		expect(task.worktreePolicy).toBe("enabled");
		expect((await coreFileSystem(current).loadTask(task.id))?.worktreePolicy).toBe("enabled");
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(expectedPath)).toBe(false);
		expect(expectedPath).toBe(taskWorktreePath(TEST_DIR, { id: "TASK-1", title: "Add worktree support" }));
	});

	it("does not allocate through createTaskFromInput either", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const { task } = await current.createTaskFromInput({ title: "Input path task" });

		expect(task.worktreePolicy).toBe("enabled");
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
	});

	it("does not create a worktree when worktreePerTask is disabled or absent", async () => {
		const current = await setupCore();
		const task = newTask("TASK-1", "No worktree here");
		await current.createTask(task);

		expect(task.worktreePolicy).toBe("disabled");
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(false);
	});

	it("does not create a worktree for a draft", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const { task } = await current.createTaskFromInput({ title: "Draft task", status: "Draft" });

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(false);
	});

	it("creates and uses the worktree at the first session cwd resolution", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Finish the worktree lifecycle");
		await current.createTask(task);
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(await sessionCwdFor(current, task, resolveSessionSettings(undefined))).toBe(
			taskWorktreePath(TEST_DIR, task),
		);
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
	});

	it("fails path-specifically rather than using project root when allocation fails", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Cannot allocate");
		await current.createTask(task);
		await safeCleanup(TEST_DIR);
		await expect(sessionCwdFor(current, task, resolveSessionSettings(undefined))).rejects.toThrow(
			taskWorktreePath(TEST_DIR, task),
		);
	});

	it("keeps creation policy after configuration changes", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Frozen enabled policy");
		await current.createTask(task);
		await upsertAgentConfiguration(current, "project", {
			...getBuiltInAgentConfiguration(),
			sessions: { worktreePerTask: false, yoloMode: false },
		});
		expect(await sessionCwdFor(current, task, resolveSessionSettings(undefined))).toBe(
			taskWorktreePath(TEST_DIR, task),
		);
	});

	it("retains the worktree when task status becomes Done", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Finish the worktree lifecycle");
		await current.createTask(task);
		await sessionCwdFor(current, task, resolveSessionSettings(undefined));

		await current.updateTaskFromInput(task.id, { status: "Done" });

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(true);
	});

	it("keeps the renamed task worktree until explicit destructive deletion", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Original title");
		await current.createTask(task);
		await sessionCwdFor(current, task, resolveSessionSettings(undefined));
		const originalPath = taskWorktreePath(TEST_DIR, task);
		expect(existsSync(originalPath)).toBe(true);

		await current.updateTaskFromInput(task.id, { title: "Renamed after worktree" });
		const renamed = (await current.loadTaskById(task.id, { includeCrossBranch: false })) as Task;
		// The slug changed, so a path recomputation no longer matches the on-disk directory.
		expect(taskWorktreePath(TEST_DIR, renamed)).not.toBe(originalPath);

		await current.updateTaskFromInput(task.id, { status: "Done" });

		expect(await taskWorktreeExists(TEST_DIR, renamed)).toBe(true);
		expect(existsSync(originalPath)).toBe(true);
		await current.deleteTask(task.id);
		expect(await taskWorktreeExists(TEST_DIR, renamed)).toBe(false);
		expect(existsSync(originalPath)).toBe(false);
	});

	it("preserves uncommitted work and task tracking when worktree removal is refused", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Keep uncommitted work");
		await current.createTask(task);
		await sessionCwdFor(current, task, resolveSessionSettings(undefined));
		const worktree = taskWorktreePath(TEST_DIR, task);
		const userFile = join(worktree, "uncommitted.txt");
		await Bun.write(userFile, "preserve this data\n");

		await expect(current.deleteTask(task.id)).rejects.toThrow("Could not remove worktree");

		expect(await coreFileSystem(current).loadTask(task.id)).not.toBeNull();
		expect(await Bun.file(userFile).text()).toBe("preserve this data\n");
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
	});

	it("is idempotent when the worktree already exists", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Idempotent worktree");
		await current.createTask(task);

		const firstPath = taskWorktreePath(TEST_DIR, task);
		await sessionCwdFor(current, task, resolveSessionSettings(undefined));

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
		expect(taskWorktreePath(TEST_DIR, task)).toBe(firstPath);
		expect(existsSync(firstPath)).toBe(true);
	});

	it("resolves lowercase and whitespace task IDs by identity", async () => {
		const task = newTask("TASK-1", "Readable title slug");
		const path = await ensureTaskWorktree(TEST_DIR, task);
		const alternateId = { ...task, id: " task-1 " };

		expect(path).toBe(taskWorktreePath(TEST_DIR, alternateId));
		expect(path).toContain("readable-title-slug-TASK-1");
		expect(await taskWorktreeExists(TEST_DIR, alternateId)).toBe(true);
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

	it("fails closed when multiple worktrees match the task identity", async () => {
		const task = newTask("TASK-1", "Original title");
		await commitFixture();
		await ensureTaskWorktree(TEST_DIR, task);
		const duplicatePath = join(WORKTREE_HOME, "second-directory-task-1");
		await git("-C", TEST_DIR, "worktree", "add", "--detach", duplicatePath);

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
	});
});
