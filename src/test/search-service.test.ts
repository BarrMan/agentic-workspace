import { afterEach, describe, expect, it } from "bun:test";
import { Core } from "../controller/agentic-workspace.ts";
import { searchSnapshot } from "../controller/search-service.ts";
import type { Task, TaskSearchResult } from "../model/types.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestWorkspace, safeCleanup } from "./test-utils.ts";

const directories: string[] = [];

async function createProject(): Promise<Core> {
	const root = createUniqueTestDir("snapshot-search");
	directories.push(root);
	const core = new Core(root);
	await initializeFilesystemTestWorkspace(coreFileSystem(core));
	await coreFileSystem(core).saveConfig({
		projectName: "Snapshot search",
		statuses: ["To Do", "Done"],
		labels: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
	});
	return core;
}

function task(id: string, title: string, rawContent: string, extra: Partial<Task> = {}): Task {
	return {
		id,
		title,
		description: rawContent,
		rawContent: "",
		status: "To Do",
		done: false,
		labels: [],
		dependencies: [],
		createdDate: "2026-09-30",
		...extra,
	};
}

function titles(results: Awaited<ReturnType<Core["searchPersistently"]>>): string[] {
	return results
		.filter((result): result is TaskSearchResult => result.type === "task")
		.map((result) => result.task.title);
}

afterEach(async () => {
	await Promise.all(directories.splice(0).map(safeCleanup));
});

describe("snapshot search", () => {
	it("filters task metadata and ranks full-text matches", async () => {
		const core = await createProject();
		await coreFileSystem(core).saveTask(
			task("TASK-1", "Needle query", "needle needle", { labels: ["web"], priority: "High" }),
			{ create: true },
		);
		await coreFileSystem(core).saveTask(task("TASK-2", "Other", "needle", { labels: ["api"], priority: "Low" }), {
			create: true,
		});

		expect(titles(await core.searchPersistently({ query: "needle", types: ["task"] }))).toEqual([
			"Needle query",
			"Other",
		]);
		expect(
			titles(await core.searchPersistently({ types: ["task"], filters: { labels: ["web"], priority: "High" } })),
		).toEqual(["Needle query"]);
		expect(
			titles(await core.searchPersistently({ types: ["task"], filters: { labels: ["web"], priority: " high " } })),
		).toEqual([]);
	});

	it("applies global limits and reflects the next disk read", async () => {
		const core = await createProject();
		const filePath = await coreFileSystem(core).saveTask(task("TASK-1", "First", "needle"), { create: true });
		await coreFileSystem(core).saveTask(task("TASK-2", "Second", "needle"), { create: true });
		expect(titles(await core.searchPersistently({ query: "needle", types: ["task"], limit: 1 }))).toHaveLength(1);

		await coreFileSystem(core).saveTask(task("TASK-1", "Updated", "replacement", { filePath }));
		expect(titles(await core.searchPersistently({ query: "replacement", types: ["task"] }))).toEqual(["Updated"]);
	});

	it("matches literal substrings case-insensitively without fuzzy ranking", async () => {
		const core = await createProject();
		await coreFileSystem(core).saveTask(task("TASK-1", "Needle", "ordinary text"), { create: true });
		await coreFileSystem(core).saveTask(task("TASK-2", "Needful", "ordinary text"), { create: true });

		expect(titles(await core.searchPersistently({ query: "NEEDLE", types: ["task"] }))).toEqual(["Needle"]);
		expect(titles(await core.searchPersistently({ query: "needel", types: ["task"] }))).toEqual([]);
	});

	it("keeps matching and empty-query results in supplied corpus order", () => {
		const first = task("TASK-2", "needle first", "");
		const second = task("TASK-1", "needle second", "");
		const matches = searchSnapshot([first, second], { query: "NEEDLE", types: ["task"] });
		const unfiltered = searchSnapshot([first, second], { query: "  ", types: ["task"] });

		expect(matches.map((result) => result.type === "task" && result.task.id)).toEqual(["TASK-2", "TASK-1"]);
		expect(unfiltered.map((result) => result.type === "task" && result.task.id)).toEqual(["TASK-2", "TASK-1"]);
		expect(searchSnapshot([], { query: "missing" })).toEqual([]);
	});
});
