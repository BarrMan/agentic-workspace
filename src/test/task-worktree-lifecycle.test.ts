import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { getBuiltInAgentConfiguration, upsertAgentConfiguration } from "../agent-workspace/config.ts";
import { Core } from "../core/agentic-workspace.ts";
import { taskWorktreeExists, taskWorktreePath } from "../git/task-worktree.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

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

	it("creates the task worktree on task creation when worktreePerTask is enabled", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Add worktree support");
		await current.createTask(task);

		const expectedPath = taskWorktreePath(TEST_DIR, task);
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
		expect(existsSync(expectedPath)).toBe(true);
		expect(expectedPath).toBe(taskWorktreePath(TEST_DIR, { id: "TASK-1", title: "Add worktree support" }));
	});

	it("creates the worktree through createTaskFromInput as well", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const { task } = await current.createTaskFromInput({ title: "Input path task" });

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(true);
	});

	it("does not create a worktree when worktreePerTask is disabled or absent", async () => {
		const current = await setupCore();
		const task = newTask("TASK-1", "No worktree here");
		await current.createTask(task);

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(false);
	});

	it("does not create a worktree for a draft", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const { task } = await current.createTaskFromInput({ title: "Draft task", status: "Draft" });

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(false);
	});

	it("removes the worktree when the task status becomes Done", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Finish the worktree lifecycle");
		await current.createTask(task);
		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);

		await current.updateTaskFromInput(task.id, { status: "Done" });

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(false);
		expect(existsSync(taskWorktreePath(TEST_DIR, task))).toBe(false);
	});

	it("still removes the worktree after the task title changes", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Original title");
		await current.createTask(task);
		const originalPath = taskWorktreePath(TEST_DIR, task);
		expect(existsSync(originalPath)).toBe(true);

		await current.updateTaskFromInput(task.id, { title: "Renamed after worktree" });
		const renamed = (await current.loadTaskById(task.id, { includeCrossBranch: false })) as Task;
		// The slug changed, so a path recomputation no longer matches the on-disk directory.
		expect(taskWorktreePath(TEST_DIR, renamed)).not.toBe(originalPath);

		await current.updateTaskFromInput(task.id, { status: "Done" });

		expect(await taskWorktreeExists(TEST_DIR, renamed)).toBe(false);
		expect(existsSync(originalPath)).toBe(false);
	});

	it("is idempotent when the worktree already exists", async () => {
		const current = await setupCore({ worktreePerTask: true });
		const task = newTask("TASK-1", "Idempotent worktree");
		await current.createTask(task);

		const firstPath = taskWorktreePath(TEST_DIR, task);
		await current.ensureTaskWorktreeFor(task);

		expect(await taskWorktreeExists(TEST_DIR, task)).toBe(true);
		expect(taskWorktreePath(TEST_DIR, task)).toBe(firstPath);
		expect(existsSync(firstPath)).toBe(true);
	});
});
