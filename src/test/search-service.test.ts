import { afterEach, describe, expect, it } from "bun:test";
import { Core } from "../core/agentic-workspace.ts";
import type { Decision, Task, TaskSearchResult } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const directories: string[] = [];

async function createProject(): Promise<Core> {
	const root = createUniqueTestDir("snapshot-search");
	directories.push(root);
	const core = new Core(root);
	await core.filesystem.ensureAgenticWorkspaceStructure();
	await core.filesystem.saveConfig({
		projectName: "Snapshot search",
		statuses: ["To Do", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		checkActiveBranches: false,
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
		assignee: [],
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
		await core.filesystem.saveTask(
			task("TASK-1", "Needle query", "needle needle", { labels: ["web"], priority: "High" }),
		);
		await core.filesystem.saveTask(task("TASK-2", "Other", "needle", { labels: ["api"], priority: "Low" }));

		expect(titles(await core.searchPersistently({ query: "needle", types: ["task"] }))).toEqual([
			"Needle query",
			"Other",
		]);
		expect(
			titles(await core.searchPersistently({ types: ["task"], filters: { labels: ["web"], priority: "high" } })),
		).toEqual(["Needle query"]);
	});

	it("applies global limits and reflects the next disk read", async () => {
		const core = await createProject();
		await core.filesystem.saveTask(task("TASK-1", "First", "needle"));
		await core.filesystem.saveTask(task("TASK-2", "Second", "needle"));
		expect(titles(await core.searchPersistently({ query: "needle", types: ["task"], limit: 1 }))).toHaveLength(1);

		await core.filesystem.saveTask(task("TASK-1", "Updated", "replacement"));
		expect(titles(await core.searchPersistently({ query: "replacement", types: ["task"] }))).toEqual(["Updated"]);
	});

	it("searches structured decision fields without depending on opaque content", async () => {
		const core = await createProject();
		const decision: Decision = {
			id: "decision-1",
			title: "Choose storage",
			date: "2026-09-30",
			status: "accepted",
			context: "Needle context",
			decision: "Use frontmatter fields",
			consequences: "Needle consequence",
			alternatives: "Needle alternative",
			rawContent: "Opaque body",
		};
		await core.createDecision(decision);

		for (const query of ["context", "consequence", "alternative"]) {
			const results = await core.searchPersistently({ query, types: ["decision"] });
			expect(results).toHaveLength(1);
			expect(results[0]).toMatchObject({ type: "decision", decision: { id: decision.id } });
		}
	});
});
