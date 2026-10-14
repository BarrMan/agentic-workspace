import { describe, expect, it } from "bun:test";
import { BranchTaskLoader, getBranchHistoryCutoff } from "../core/task-loader.ts";
import type { GitOperations } from "../git/operations.ts";
import { UnsupportedTaskFrontmatterSchemaError } from "../markdown/parser.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { AgenticWorkspaceConfig, Task } from "../types/index.ts";

const commit = "1".repeat(40);
const tips = [
	{ name: "main", commit: "0".repeat(40), current: true },
	{ name: "feature/current", commit, current: false },
];
const config: AgenticWorkspaceConfig = {
	projectName: "Current Git snapshots",
	statuses: ["To Do", "In Progress", "Done"],
	labels: [],
	milestones: [],
	dateFormat: "YYYY-MM-DD",
	activeBranchDays: 30,
	remoteOperations: true,
	prefixes: { task: "task" },
};

function task(id = "TASK-1", status = "To Do", updatedDate = "2026-10-10"): Task {
	return {
		id,
		title: id,
		status,
		assignee: [],
		createdDate: "2026-10-01",
		updatedDate,
		labels: [],
		dependencies: [],
		rawContent: "Current snapshot",
	};
}

function fixture(records: Map<string, string>) {
	const calls = { tree: 0, history: 0, blobs: [] as string[], cutoffs: [] as Array<Date | undefined> };
	const git = {
		listFilesInTree: async () => {
			calls.tree += 1;
			return [...records.keys()];
		},
		getBranchLastModifiedMap: async (_commit: string, _root: string, cutoff: Date | undefined) => {
			calls.history += 1;
			calls.cutoffs.push(cutoff);
			return new Map([...records.keys()].map((path) => [path, new Date("2026-10-10T00:00:00Z")]));
		},
		showFile: async (_commit: string, path: string) => {
			calls.blobs.push(path);
			const content = records.get(path);
			if (content === undefined) throw new Error(`Unexpected blob read: ${path}`);
			return content;
		},
	} as unknown as GitOperations;
	return { loader: new BranchTaskLoader(git), calls };
}

describe("current-only Git task snapshots", () => {
	it("never reads flat records or artifacts, even when they contain current task frontmatter", async () => {
		const path = "agentic-workspace/tasks/task-1/task.md";
		const ignored = [
			"agentic-workspace/tasks/task-1 - Old.md",
			"agentic-workspace/completed/task-2 - Current schema, flat layout.md",
			"agentic-workspace/archive/tasks/task-3 - Old.md",
			"agentic-workspace/tasks/task-1/plan.md",
			"agentic-workspace/tasks/task-1/nested/task.md",
			"agentic-workspace/tasks/task-2 - Title/task.md",
			"agentic-workspace/tasks/TASK-2/task.md",
			"agentic-workspace/tasks/2/task.md",
			"agentic-workspace/tasks/not an id/task.md",
			"agentic-workspace/docs/task-2/task.md",
			"other/tasks/task-2/task.md",
		];
		const records = new Map(ignored.map((record) => [record, serializeTask(task("TASK-2"))]));
		records.set(ignored[0] ?? "", "---\nid: TASK-1\n---\nOld record");
		records.set(path, serializeTask(task()));
		const { loader, calls } = fixture(records);
		const result = await loader.load(tips, config, [], true);
		expect(result.complete).toBe(true);
		expect(result.entries.map((entry) => entry.path)).toEqual([path]);
		expect(calls.blobs).toEqual([path]);
		for (const record of ignored.filter((record) => !record.startsWith("other/"))) {
			expect(await loader.loadPersistentTask(commit, record)).toBeNull();
		}
		expect(calls.blobs).toEqual([path]);
	});

	for (const version of [undefined, 1, 2, 9]) {
		it(`skips schema ${String(version)} at a current path and warns during automatic reads`, async () => {
			const path = "agentic-workspace/tasks/task-1/task.md";
			const schema = version === undefined ? "" : `task_schema_version: ${version}`;
			const content = serializeTask(task()).replace("task_schema_version: 3", schema);
			const { loader, calls } = fixture(new Map([[path, content]]));
			const warnings: string[] = [];
			const originalWarn = console.warn;
			console.warn = (message) => warnings.push(String(message));
			try {
				const result = await loader.load(tips, config, [], false);
				expect(result.complete).toBe(true);
				expect(result.entries[0]?.task).toBeUndefined();
				expect(warnings).toHaveLength(1);
				expect(warnings[0]).toContain(
					version === undefined
						? `${commit}:${path}: Task TASK-1 has no task frontmatter schema version.`
						: `${commit}:${path}: Task TASK-1 uses unsupported task frontmatter schema version`,
				);
			} finally {
				console.warn = originalWarn;
			}
			await expect(loader.loadPersistentTask(commit, path)).rejects.toBeInstanceOf(
				UnsupportedTaskFrontmatterSchemaError,
			);
			expect(calls.blobs).toEqual([path, path]);
		});
	}

	for (const agenticWorkspaceDir of ["agentic-workspace", ".agentic-workspace", "planning/custom-agentic-workspace"]) {
		it(`preserves exact IDs and lifecycle state under ${agenticWorkspaceDir}`, async () => {
			const active = `${agenticWorkspaceDir}/tasks/back-001.02/task.md`;
			const completed = `${agenticWorkspaceDir}/completed/back-3/task.md`;
			const draft = `${agenticWorkspaceDir}/drafts/back-4/task.md`;
			const archived = `${agenticWorkspaceDir}/archive/tasks/back-5/task.md`;
			const { loader, calls } = fixture(
				new Map([
					[active, serializeTask(task("BACK-001.02", "In Progress"))],
					[completed, serializeTask(task("BACK-3", "Done"))],
					[draft, serializeTask(task("BACK-4", "Draft"))],
					[archived, serializeTask(task("BACK-5", "Done"))],
					[`${agenticWorkspaceDir}/tasks/task-6/task.md`, serializeTask(task("TASK-6"))],
				]),
			);
			const customConfig = { ...config, prefixes: { task: "BACK" } };
			const result = await loader.load(tips, customConfig, [], true, agenticWorkspaceDir);
			expect(result.complete).toBe(true);
			expect(result.entries.map(({ id, type, path }) => ({ id, type, path }))).toEqual([
				{ id: "BACK-001.02", type: "task", path: active },
				{ id: "BACK-3", type: "completed", path: completed },
				{ id: "BACK-4", type: "draft", path: draft },
				{ id: "BACK-5", type: "archived", path: archived },
			]);
			expect(result.entries[0]?.task).toMatchObject({
				id: "BACK-001.02",
				status: "In Progress",
				createdDate: "2026-10-01",
				updatedDate: "2026-10-10",
				contentRef: commit,
			});
			expect(result.entries[1]?.task?.status).toBe("Done");
			expect(calls.blobs).toEqual([active, completed]);
			expect(await loader.loadPersistentTask(commit, archived)).toMatchObject({ id: "BACK-5" });
			const activeOnly = await loader.load(tips, customConfig, [], false, agenticWorkspaceDir);
			expect(activeOnly.entries[1]?.task).toBeUndefined();
			expect(calls.history).toBe(1);
			expect(calls.cutoffs).toEqual([getBranchHistoryCutoff(config.activeBranchDays ?? 30)]);
		});
	}

	it("keeps identity conflicts visible while preferring active records on a date tie", async () => {
		const active = "agentic-workspace/tasks/task-1/task.md";
		const completed = "agentic-workspace/completed/task-1/task.md";
		const { loader, calls } = fixture(
			new Map([
				[active, serializeTask(task("TASK-1", "In Progress"))],
				[completed, serializeTask(task("TASK-1", "Done"))],
			]),
		);
		const result = await loader.load(tips, config, [], true);
		expect(result.entries.map((entry) => entry.path)).toEqual([active, completed]);
		expect(result.entries[0]?.task?.status).toBe("In Progress");
		expect(result.entries[1]?.task).toBeUndefined();
		expect(calls.blobs).toEqual([active]);
	});

	it("reuses bounded history and evicts only snapshots no longer retained", async () => {
		const path = "agentic-workspace/tasks/task-1/task.md";
		const { loader, calls } = fixture(new Map([[path, serializeTask(task())]]));
		await loader.load(tips, config, [], false);
		loader.retainSnapshot(tips, { agenticWorkspaceDir: "agentic-workspace", prefix: "task", activeBranchDays: 30 });
		await loader.load(tips, config, [], false);
		expect(calls.tree).toBe(1);
		expect(calls.history).toBe(1);
		expect(calls.blobs).toEqual([path]);
		loader.retainSnapshot([], { agenticWorkspaceDir: "agentic-workspace", prefix: "task", activeBranchDays: 30 });
		await loader.load(tips, config, [], false);
		expect(calls.tree).toBe(2);
		expect(calls.history).toBe(2);
		expect(calls.blobs).toEqual([path, path]);
		expect(calls.cutoffs).toEqual([getBranchHistoryCutoff(30), getBranchHistoryCutoff(30)]);
	});

	it("keeps a newer local authority without reading its older same-path branch blob", async () => {
		const path = "agentic-workspace/tasks/task-1/task.md";
		const { loader, calls } = fixture(new Map([[path, serializeTask(task())]]));
		const local = { ...task("TASK-1", "Done", "2026-10-11"), filePath: path };
		const result = await loader.load(tips, { ...config, taskResolutionStrategy: "most_recent" }, [local], false);
		expect(result.complete).toBe(true);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0]?.task).toBeUndefined();
		expect(calls.blobs).toEqual([]);
	});
});
