import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUniqueTestDir, initGitRepo, safeCleanup } from "../test/test-utils.ts";
import { FileSystem } from "./file-system.ts";
import { serializeTask } from "./markdown/serializer.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function filesystem() {
	const root = createUniqueTestDir("filesystem-records");
	roots.push(root);
	const fs = new FileSystem(root);
	await fs.ensureAgenticWorkspaceStructure();
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

	it("explicitly converts all prefixes once, preserving next allocation and mode", async () => {
		const fs = await filesystem();
		const path = join(fs.agenticWorkspaceDir, "task-counter.json");
		const raw = '{"TASK":{"next":3},"OPS":{"next":1}}';
		await writeFile(path, raw, { mode: 0o600 });
		await expect(fs.withCreateLock(() => fs.allocateTaskId("TASK", undefined, async () => []))).rejects.toThrow(
			"scripts/migrate-task-counter.ts",
		);
		expect(await readFile(path, "utf8")).toBe(raw);
		expect(await fs.convertTaskCounterToLastAllocated()).toEqual({ path, converted: true });
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ TASK: { lastAllocated: 2 }, OPS: { lastAllocated: 0 } });
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		expect(await fs.convertTaskCounterToLastAllocated()).toEqual({ path, converted: false });
		expect(await fs.withCreateLock(() => fs.allocateTaskId("TASK", undefined, async () => []))).toBe("TASK-3");
		expect(await fs.withCreateLock(() => fs.allocateTaskId("OPS", undefined, async () => []))).toBe("OPS-1");
	});

	it.each([
		"null",
		"[]",
		"{",
		'{"TASK":{"next":0}}',
		'{"TASK":{"next":3},"OPS":{"next":-1}}',
		'{"TASK":{"next":3},"OPS":{"lastAllocated":2}}',
		'{"TASK":{"next":3,"extra":true}}',
	])("refuses malformed or mixed-format conversion unchanged: %s", async (raw) => {
		const fs = await filesystem();
		const path = join(fs.agenticWorkspaceDir, "task-counter.json");
		await writeFile(path, raw);
		await expect(fs.convertTaskCounterToLastAllocated()).rejects.toThrow(path);
		expect(await readFile(path, "utf8")).toBe(raw);
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

	it("runs conversion only through explicit script invocation and keeps the configured old folder", async () => {
		const fs = await filesystem();
		const directory = join(fs.rootDir, "agentic-workspace");
		await mkdir(directory);
		const path = join(directory, "task-counter.json");
		await writeFile(path, '{"TASK":{"next":3}}');
		const script = fileURLToPath(new URL("../../scripts/migrate-task-counter.ts", import.meta.url));
		const run = () => Bun.spawnSync([process.execPath, script, fs.rootDir], { timeout: 10_000 });
		const blocked = run();
		expect(blocked.exitCode).toBe(1);
		expect(blocked.stderr.toString()).toContain("explicit location decision");
		expect(await readFile(path, "utf8")).toBe('{"TASK":{"next":3}}');
		await writeFile(
			join(fs.rootDir, "agentic-workspace.config.yml"),
			"project_name: Test\nagentic_workspace_directory: agentic-workspace\n",
		);
		const converted = run();
		expect(converted.exitCode).toBe(0);
		expect(JSON.parse(converted.stdout.toString()).converted).toBe(true);
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ TASK: { lastAllocated: 2 } });
		expect((await new FileSystem(fs.rootDir).loadConfig())?.agenticWorkspaceDirectory).toBe("agentic-workspace");
	});

	it("converts the shared Git counter when explicitly invoked from a linked worktree", async () => {
		const fs = await filesystem();
		initGitRepo(fs.rootDir);
		const git = (args: string[]) => Bun.spawnSync(["git", ...args], { cwd: fs.rootDir });
		expect(
			git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "fixture"])
				.exitCode,
		).toBe(0);
		const linked = join(fs.rootDir, "linked");
		expect(git(["worktree", "add", "-b", "linked", linked]).exitCode).toBe(0);
		const path = join(fs.rootDir, ".git", "agentic-workspace", "task-counter.json");
		await mkdir(join(fs.rootDir, ".git", "agentic-workspace"));
		await writeFile(path, '{"TASK":{"next":3}}');
		const script = fileURLToPath(new URL("../../scripts/migrate-task-counter.ts", import.meta.url));
		const result = Bun.spawnSync([process.execPath, script, linked], { timeout: 10_000 });
		expect(result.exitCode).toBe(0);
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ TASK: { lastAllocated: 2 } });
		const fromLinked = new FileSystem(linked);
		expect(await fromLinked.withCreateLock(() => fromLinked.allocateTaskId("TASK", undefined, async () => []))).toBe(
			"TASK-3",
		);
		expect(await Bun.file(join(linked, ".agentic-workspace", "task-counter.json")).exists()).toBe(false);
	});
});

it("warns and skips mismatched identity in collections but fails direct loads and edits", async () => {
	const fs = await filesystem();
	const task = {
		id: "TASK-1",
		title: "kept",
		status: "To Do",
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
	};
	const path = await fs.saveTask(task);
	const raw = serializeTask({ ...task, id: "TASK-2" });
	await writeFile(path, raw);
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	try {
		expect(await fs.listTasks()).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0]?.[0])).toContain(path);
		expect(String(warn.mock.calls[0]?.[0])).toContain("identity");
		await expect(fs.loadTask("TASK-1")).rejects.toThrow(path);
		await expect(fs.saveTask(task)).rejects.toThrow(path);
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
	await selected.ensureAgenticWorkspaceStructure();
	const task = {
		id: "TASK-1",
		title: "external",
		status: "To Do",
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
	};
	const path = await selected.saveTask(task);
	const bytes = new TextEncoder().encode("artifact");
	await selected.taskArtifacts.write(task.id, "task.md", bytes);
	await expect(selected.taskArtifacts.read(task.id, "task.md")).resolves.toEqual(bytes);
	await expect(selected.loadTask(task.id)).resolves.toMatchObject({ id: task.id, filePath: path });
	expect(path).toBe(join(selected.agenticWorkspaceDir, "tasks", "task-1", "task.md"));
	expect(await fs.listTasks()).toEqual([]);
});
