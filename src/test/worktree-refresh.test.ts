import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { coreFileSystem, createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let WORKTREE_DIR: string;
let mainCore: Core | undefined;
let featureCore: Core | undefined;
let worktreeAdded = false;

describe("worktree task refresh", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-worktree-refresh");
		WORKTREE_DIR = `${TEST_DIR}-feature`;
		worktreeAdded = false;
		await mkdir(TEST_DIR, { recursive: true });
		initGitRepo(TEST_DIR, "main");
	});

	afterEach(async () => {
		mainCore = undefined;
		featureCore = undefined;

		const cleanupErrors: unknown[] = [];
		if (worktreeAdded) {
			try {
				await $`git worktree remove --force ${WORKTREE_DIR}`.cwd(TEST_DIR).quiet();
			} catch (error) {
				cleanupErrors.push(error);
			}
			worktreeAdded = false;
		}
		for (const directory of [WORKTREE_DIR, TEST_DIR]) {
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
			throw new AggregateError(cleanupErrors, "Worktree teardown failed");
		}
	});

	it("refreshes the main-worktree task store after a linked-worktree create", async () => {
		const setupCore = new Core(TEST_DIR);
		await initializeTestProject(setupCore, "Worktree Refresh", true);
		const config = await coreFileSystem(setupCore).loadConfig();
		if (!config) {
			throw new Error("Expected initialized config");
		}
		await coreFileSystem(setupCore).saveConfig({
			...config,
			remoteOperations: false,
		});
		await $`git add agentic-workspace/config.yml`.cwd(TEST_DIR).quiet();
		await $`git commit -m "Configure active branch scanning"`.cwd(TEST_DIR).quiet();

		mainCore = new Core(TEST_DIR);
		expect(await mainCore.queryTasks()).toEqual([]);
		expect(await mainCore.queryTasks({ query: "Created elsewhere" })).toEqual([]);

		await $`git worktree add ${WORKTREE_DIR} -b feature`.cwd(TEST_DIR).quiet();
		worktreeAdded = true;
		featureCore = new Core(WORKTREE_DIR);
		const worktreeTask: Task = {
			id: "task-1",
			title: "Created elsewhere",
			status: "To Do",
			assignee: [],
			createdDate: "2026-07-01",
			labels: [],
			dependencies: [],
			rawContent: "## Description\nCreated after the main Core initialized.",
		};
		await featureCore.createTask(worktreeTask);
		await $`git add agentic-workspace/tasks`.cwd(TEST_DIR).quiet();
		await $`git commit -m "Add shared task-store fixture"`.cwd(TEST_DIR).quiet();

		const searchResults = await mainCore.queryTasks({ query: "Created elsewhere" });
		expect(searchResults.map((task) => task.id)).toContain("TASK-1");

		const listedTasks = await mainCore.queryTasks();
		expect(listedTasks.map((task) => task.id)).toContain("TASK-1");
	});

	it("reads working-copy mutations made after an earlier persistent query", async () => {
		mainCore = new Core(TEST_DIR);
		await initializeTestProject(mainCore, "Missed Working Copy Refresh", true);
		expect(await mainCore.queryTasks()).toEqual([]);
		await mainCore.createTask({
			id: "TASK-1",
			title: "Recovered by persistent read",
			status: "To Do",
			assignee: [],
			createdDate: "2026-08-10",
			labels: [],
			dependencies: [],
		});

		expect((await mainCore.queryTasks()).map((task) => task.title)).toEqual(["Recovered by persistent read"]);
		expect(
			(await mainCore.searchPersistently({ query: "persistent read", types: ["task"] })).flatMap((result) =>
				result.type === "task" ? [result.task.title] : [],
			),
		).toEqual(["Recovered by persistent read"]);
	});
});
