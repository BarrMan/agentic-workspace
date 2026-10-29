import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createUniqueTestDir, safeCleanup } from "../test/test-utils.ts";
import { FileSystem } from "./file-system.ts";
import { serializeTask } from "./markdown/serializer.ts";
import { Storage } from "./storage.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function filesystem() {
	const root = createUniqueTestDir("filesystem-records");
	roots.push(root);
	const fs = new FileSystem(root);
	await new Storage(fs).initializeWorkspace(
		{ projectName: "test", statuses: ["To Do"], labels: [], dateFormat: "yyyy-MM-dd" },
		{ agenticWorkspaceDirectory: ".agentic-workspace", configLocation: "folder" },
	);
	return fs;
}

describe("persisted task counter", () => {
	it.each([
		"null",
		"[]",
		"{",
		'{"TASK":{"lastAllocated":-1}}',
		'{"TASK":{}}',
		'{"TASK":{"lastAllocated":1.5}}',
		'{"TASK":{"next":3}}',
		'{"TASK":{"lastAllocated":"2"}}',
		'{"OPS":{"lastAllocated":2},"TASK":null}',
		'{"TASK":{"lastAllocated":2,"extra":1}}',
		'{"task":{"lastAllocated":2}}',
		'{"TASK":{"lastAllocated":9007199254740992}}',
	])("rejects malformed whole counter unchanged: %s", async (raw) => {
		const fs = await filesystem();
		const path = join(fs.agenticWorkspaceDir, "task-counter.json");
		await writeFile(path, raw);
		let scanned = false;
		await expect(
			fs.withCreateLock(() =>
				fs.allocateTaskId("OPS", undefined, async () => {
					scanned = true;
					return [];
				}),
			),
		).rejects.toThrow(path);
		expect(scanned).toBe(false);
		expect(await readFile(path, "utf8")).toBe(raw);
	});

	it("increments last-allocated counters and bootstraps only an absent prefix", async () => {
		const fs = await filesystem();
		const path = join(fs.agenticWorkspaceDir, "task-counter.json");
		await writeFile(path, '{"TASK":{"lastAllocated":6}}');
		const allocate = (prefix: string, ids: () => Promise<string[]>) =>
			fs.withCreateLock(() => fs.allocateTaskId(prefix, undefined, ids));
		expect(
			await allocate("TASK", async () => {
				throw new Error("must not scan");
			}),
		).toBe("TASK-7");
		expect(await allocate("OPS", async () => ["OPS-12", "OPS-12.9"])).toBe("OPS-13");
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({
			TASK: { lastAllocated: 7 },
			OPS: { lastAllocated: 13 },
		});
	});

	it("consumes completed and archived collisions and rejects exhausted counters unchanged", async () => {
		const fs = await filesystem();
		const path = join(fs.agenticWorkspaceDir, "task-counter.json");
		await writeFile(path, '{"TASK":{"lastAllocated":0}}');
		await mkdir(join(fs.completedDir, "task-1"));
		await mkdir(join(await fs.getArchiveTasksDir(), "task-2"));
		expect(await fs.withCreateLock(() => fs.allocateTaskId("TASK", undefined, async () => []))).toBe("TASK-3");
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ TASK: { lastAllocated: 3 } });
		const exhausted = JSON.stringify({ TASK: { lastAllocated: Number.MAX_SAFE_INTEGER } });
		await writeFile(path, exhausted);
		await expect(fs.withCreateLock(() => fs.allocateTaskId("TASK", undefined, async () => []))).rejects.toThrow(
			"safe integer",
		);
		expect(await readFile(path, "utf8")).toBe(exhausted);
	});
});

it("warns and skips mismatched identity in collections but fails direct loads and edits", async () => {
	const fs = await filesystem();
	const task = {
		id: "TASK-1",
		title: "kept",
		status: "To Do",
		done: false,
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
	};
	const path = await fs.saveTask(task, { create: true });
	const raw = serializeTask({ ...task, id: "TASK-2" });
	await writeFile(path, raw);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		expect(await fs.listTasks()).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain(path);
		expect(String(warn.mock.calls[0]?.[0])).toContain("identity");
		await expect(fs.loadTask("TASK-1")).rejects.toThrow(path);
		await expect(fs.saveTask(task, { create: true })).rejects.toThrow(path);
		await expect(fs.saveTask({ ...task, filePath: path })).rejects.toThrow(path);
		expect(await readFile(path, "utf8")).toBe(raw);
	} finally {
		warn.mockRestore();
	}
});

it("preserves malformed identity in completed and archived collections and direct targets", async () => {
	const fs = await filesystem();
	const directories = [fs.completedDir, await fs.getArchiveTasksDir()];
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		for (const directory of directories) {
			const path = join(directory, "task-1", "task.md");
			await mkdir(join(directory, "task-1"), { recursive: true });
			const raw = serializeTask({
				id: "TASK-2",
				title: "mismatch",
				status: "Done",
				done: true,
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
			});
			await writeFile(path, raw);
			await expect(fs.loadTask("TASK-1", { includeArchived: true })).rejects.toThrow("identity");
			expect(await readFile(path, "utf8")).toBe(raw);
		}
		expect(await fs.listCompletedTasks()).toEqual([]);
		expect(await fs.listArchivedTasks()).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(2);
	} finally {
		warn.mockRestore();
	}
});

it("uses a configured external task root without changing existing project data", async () => {
	const fs = await filesystem();
	const root = fs.rootDir;
	const outside = join(root, "..", `${root.split("/").at(-1)}-external`);
	roots.push(outside);
	await mkdir(outside, { recursive: true });
	await writeFile(
		join(root, "agentic-workspace.config.yml"),
		`project_name: Test\nagentic_workspace_directory: ${JSON.stringify(outside)}\n`,
	);
	const selected = new FileSystem(root);
	await new Storage(fs).initializeWorkspace(
		{ projectName: "test", statuses: ["To Do"], labels: [], dateFormat: "yyyy-MM-dd" },
		{ agenticWorkspaceDirectory: outside, configLocation: "root" },
	);
	const task = {
		id: "TASK-1",
		title: "external",
		status: "To Do",
		done: false,
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
	};
	const path = await selected.saveTask(task, { create: true });
	const bytes = new TextEncoder().encode("artifact");
	await selected.taskArtifacts.write(task.id, "task.md", bytes);
	await expect(selected.taskArtifacts.read(task.id, "task.md")).resolves.toEqual(bytes);
	await expect(selected.loadTask(task.id)).resolves.toMatchObject({ id: task.id, filePath: path });
	expect(path).toBe(join(selected.agenticWorkspaceDir, "tasks", "task-1", "task.md"));
	expect(await fs.listTasks()).toEqual([]);
});
