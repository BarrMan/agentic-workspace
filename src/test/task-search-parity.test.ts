import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../controller/agentic-workspace.ts";
import { withReadiness } from "../controller/task-detail.ts";
import { NO_MILESTONE_FILTER_VALUE, type TaskFilterOptions, TaskSearchIndex } from "../model/task/task-search.ts";
import type { Task, TaskSearchResult } from "../model/types.ts";
import type { FileSystem } from "../storage/file-system.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

/**
 * The local one-shot index (`task list --search`, the TUI views) and the
 * persistent search (`agentic-workspace search`, the web API) must agree on what a query matches
 * and on what a filter means. These tests pin that agreement.
 */

const labelledTask: Task = {
	id: "task-1",
	title: "Rework the exporter",
	status: "To Do",
	reporter: "@morgan",
	createdDate: "2026-01-05 09:00",
	labels: ["backend", "infrastructure"],
	dependencies: [],
	rawContent: "## Description\nNothing here mentions the label.",
	description: "Nothing here mentions the label.",
};

const otherTask: Task = {
	id: "task-2",
	title: "Polish the sidebar",
	status: "To Do",
	reporter: "@riley",
	createdDate: "2026-01-05 09:00",
	labels: ["backend"],
	dependencies: [],
	rawContent: "## Description\nUnrelated body text.",
	description: "Unrelated body text.",
};

const tasks = [labelledTask, otherTask];

function taskIds(results: Task[]): string[] {
	return results.map((task) => task.id).sort();
}

describe("task search corpus", () => {
	it("puts labels in the searchable text", () => {
		const bodyText = TaskSearchIndex.bodyText(labelledTask);
		expect(bodyText).toContain("infrastructure");
	});
});

describe("cross-surface search parity", () => {
	let TEST_DIR: string;
	let core: Core;
	let filesystem: FileSystem;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("task-search-parity");
		core = new Core(TEST_DIR);
		filesystem = coreFileSystem(core);
		await filesystem.ensureAgenticWorkspaceStructure();
		for (const task of tasks) {
			await filesystem.saveTask(task);
		}
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	const persistentTaskIds = async (query: string): Promise<string[]> =>
		(await core.searchPersistently({ query, types: ["task"] }))
			.filter((result): result is TaskSearchResult => result.type === "task")
			.map((result) => result.task.id)
			.sort();

	it("finds a task by a label it carries through both surfaces", async () => {
		const localMatches = taskIds(new TaskSearchIndex(tasks).search({ query: "infrastructure" }));

		expect(localMatches).toEqual(["task-1"]);
		expect(await persistentTaskIds("infrastructure")).toEqual(["TASK-1"]);
	});

	it("uses case-insensitive literal matching with stable corpus order", async () => {
		const localMatches = new TaskSearchIndex(tasks).search({ query: "REWORK" });
		const persistentMatches = await persistentTaskIds("REWORK");

		expect(localMatches.map((task) => task.id)).toEqual(["task-1"]);
		expect(persistentMatches).toEqual(["TASK-1"]);
		expect(new TaskSearchIndex(tasks).search({ query: "rewrok" })).toEqual([]);
	});

	it("agrees on a label filter applied without a query", async () => {
		const localMatches = taskIds(TaskSearchIndex.apply(tasks, { labels: ["backend"] }));
		const serviceMatches = (await core.searchPersistently({ types: ["task"], filters: { labels: ["backend"] } }))
			.filter((result): result is TaskSearchResult => result.type === "task")
			.map((result) => result.task.id)
			.sort();

		expect(localMatches).toEqual(["task-1", "task-2"]);
		expect(serviceMatches).toEqual(["TASK-1", "TASK-2"]);
	});

	it("applies the same labelMatch semantics with and without a query", () => {
		const bothLabels = ["backend", "infrastructure"];

		expect(taskIds(TaskSearchIndex.apply(tasks, { labels: bothLabels, labelMatch: "all" }))).toEqual(["task-1"]);
		expect(taskIds(TaskSearchIndex.apply(tasks, { labels: bothLabels, labelMatch: "any" }))).toEqual([
			"task-1",
			"task-2",
		]);

		const withQuery = { query: "the", labels: bothLabels } as const;
		expect(taskIds(TaskSearchIndex.apply(tasks, { ...withQuery, labelMatch: "all" }))).toEqual(["task-1"]);
		expect(taskIds(TaskSearchIndex.apply(tasks, { ...withQuery, labelMatch: "any" }))).toEqual(["task-1", "task-2"]);
	});
});

/**
 * The TUI task viewer used to re-implement the milestone, labelMatch=all, and readiness filters by
 * hand on top of a query, so those three could drift from the same filters applied without one.
 * They all live in the shared predicate now; these pin that a query no longer changes what a filter
 * means.
 */
describe("filters mean the same thing with and without a query", () => {
	const milestoneTasks: Task[] = [
		{
			id: "task-10",
			title: "Wire the release checklist",
			status: "To Do",
			createdDate: "2026-01-05 09:00",
			labels: [],
			dependencies: [],
			milestone: "m-1",
		},
		{
			id: "task-11",
			title: "Wire the follow-up checklist",
			status: "To Do",
			createdDate: "2026-01-05 09:00",
			labels: [],
			dependencies: ["task-10"],
			milestone: "m-2",
		},
		{
			id: "task-12",
			title: "Wire the unscheduled checklist",
			status: "To Do",
			createdDate: "2026-01-05 09:00",
			labels: [],
			dependencies: [],
		},
	];
	// Every task's title matches, so the query narrows nothing and only the filter can change the set.
	const query = "checklist";

	it("resolves a milestone title the same way with and without a query", () => {
		const options = { milestone: "m-1" } as const;
		expect(taskIds(TaskSearchIndex.apply(milestoneTasks, options))).toEqual(["task-10"]);
		expect(taskIds(TaskSearchIndex.apply(milestoneTasks, { ...options, query }))).toEqual(["task-10"]);
	});

	it("keeps the no-milestone filter meaning the same with and without a query", () => {
		const options = { milestone: NO_MILESTONE_FILTER_VALUE } as const;
		expect(taskIds(TaskSearchIndex.apply(milestoneTasks, options))).toEqual(["task-12"]);
		expect(taskIds(TaskSearchIndex.apply(milestoneTasks, { ...options, query }))).toEqual(["task-12"]);
	});

	it("keeps dependency readiness meaning the same with and without a query", () => {
		// Readiness is no longer a filter predicate: it is derived over whatever the other filters
		// left, against the whole corpus. A query must not change which rows come back ready.
		const corpus = { tasks: milestoneTasks, completedTasks: [], statuses: ["To Do", "In Progress", "Done"] };
		const readyIds = (options: TaskFilterOptions) =>
			withReadiness(TaskSearchIndex.apply(milestoneTasks, options), corpus)
				.filter((row) => row.isReady)
				.map((row) => row.id);
		// task-11 depends on an unfinished task-10, so it is the one readiness must drop.
		expect(readyIds({})).toEqual(["task-10", "task-12"]);
		expect(readyIds({ query })).toEqual(["task-10", "task-12"]);
	});
});

describe("labelMatch semantics", () => {
	it("defaults to matching any selected label", () => {
		expect(taskIds(TaskSearchIndex.apply(tasks, { labels: ["backend", "infrastructure"] }))).toEqual([
			"task-1",
			"task-2",
		]);
	});

	it("requires every label when the caller asks for all", () => {
		expect(taskIds(TaskSearchIndex.apply(tasks, { labels: ["backend", "infrastructure"], labelMatch: "all" }))).toEqual(
			["task-1"],
		);
	});

	it("matches labels case-insensitively in both modes", () => {
		expect(taskIds(TaskSearchIndex.apply(tasks, { labels: ["BACKEND"] }))).toEqual(["task-1", "task-2"]);
		expect(taskIds(TaskSearchIndex.apply(tasks, { labels: ["BackEnd", "INFRASTRUCTURE"], labelMatch: "all" }))).toEqual(
			["task-1"],
		);
	});
});

/**
 * Filters reach the shared predicate through several different call sites, and an argument dropped
 * at any one of them is invisible to a test that only exercises the predicate directly. These tests
 * drive the real CLI surface so the wiring itself is pinned.
 */
describe("filter wiring across surfaces", () => {
	let testDir: string;
	let core: Core;

	beforeEach(async () => {
		testDir = createUniqueTestDir("task-search-wiring");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Filter Wiring");
		const config = await coreFileSystem(core).loadConfig();
		if (!config) throw new Error("Expected test config");
		await coreFileSystem(core).saveConfig({ ...config, projects: ["Web", "API"] });

		await core.createTaskFromInput({
			title: "Wiring both labels",
			project: "web",
			status: "To Do",
			labels: ["backend", "infrastructure"],
		});
		await core.createTaskFromInput({ title: "Wiring one label", project: "api", status: "To Do", labels: ["backend"] });
		await core.createTaskFromInput({ title: "Wiring no labels", status: "To Do" });
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("does not expose unlisted task-list filters", async () => {
		const result = await runInProcessCli(["task", "list", "--labels", "backend", "--plain"], { cwd: testDir });
		expect(result.exitCode).not.toBe(0);
		expect(result.stderr.toString()).toContain("unknown option '--labels'");
	});

	it("filters project records through Core and the supported cross-record search", async () => {
		const expected = ["Wiring both labels"];

		// Core.queryTasks backs `task list` and `GET /api/tasks`.
		const coreTasks = await core.queryTasks({ filters: { project: "web" } });
		expect(coreTasks.map((task) => task.title)).toEqual(expected);

		const searchTitles = (await core.searchPersistently({ types: ["task"], filters: { project: "web" } }))
			.filter((result): result is TaskSearchResult => result.type === "task")
			.map((result) => result.task.title);
		expect(searchTitles).toEqual(expected);

		const search = await runInProcessCli(["search", "Wiring", "--project", "web", "--plain"], { cwd: testDir });
		expect(search.exitCode).toBe(0);
		expect(search.stdout).toContain("Wiring both labels");
		expect(search.stdout).not.toContain("Wiring one label");
	});

	it("keeps OR semantics when several projects are requested", async () => {
		const both = await core.queryTasks({ filters: { project: ["WEB", "api"] } });
		expect(both.map((task) => task.title).sort()).toEqual(["Wiring both labels", "Wiring one label"]);
		// A task with no project never matches a non-empty project filter.
		expect(both.some((task) => task.project === undefined)).toBe(false);
	});

	it("searches the local task corpus before applying task-list filters", async () => {
		const matches = await core.queryTasks({
			query: "Wiring",
			filters: { project: "api" },
		});

		expect(matches.map((task) => task.title)).toEqual(["Wiring one label"]);
	});
});
