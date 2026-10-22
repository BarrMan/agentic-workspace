import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { coreFileSystem, createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function createRepository(testDir: string, projectName: string): Promise<string> {
	const mainRepo = join(testDir, "repo");
	await mkdir(mainRepo, { recursive: true });
	initGitRepo(mainRepo, "main");

	const core = new Core(mainRepo);
	await initializeTestProject(core, projectName, true);
	return mainRepo;
}

async function addWorktree(mainRepo: string, testDir: string, branch: string): Promise<string> {
	const worktree = join(testDir, "worktrees", branch);
	await $`git worktree add ${worktree} -b ${branch}`.cwd(mainRepo).quiet();
	return worktree;
}

describe("task ID allocation across git worktrees", () => {
	let testDir: string;

	afterEach(async () => {
		if (testDir) {
			await safeCleanup(testDir);
		}
	});

	it("allocates after an uncommitted task in a sibling worktree", async () => {
		testDir = createUniqueTestDir("worktree-task-id");
		const mainRepo = await createRepository(testDir, "Worktree Task ID Test");
		const sibling = await addWorktree(mainRepo, testDir, "feature-task");

		const siblingCore = new Core(sibling);
		const siblingTask = await siblingCore.createTaskFromInput({ title: "Sibling task" });
		expect(siblingTask.task.id).toBe("TASK-1");

		const mainCore = new Core(mainRepo);
		const mainTask = await mainCore.createTaskFromInput({ title: "Main task" });

		expect(mainTask.task.id).toBe("TASK-2");
		expect(await coreFileSystem(mainCore).loadTask("task-2")).not.toBeNull();
	});

	it("uses the same create lock for concurrent task creation in sibling worktrees", async () => {
		testDir = createUniqueTestDir("worktree-create-lock");
		const mainRepo = await createRepository(testDir, "Worktree Create Lock Test");
		const sibling = await addWorktree(mainRepo, testDir, "feature-lock");

		const first = new Core(mainRepo);
		const second = new Core(sibling);
		const firstEnteredSave = createDeferred<void>();
		const releaseFirstSave = createDeferred<void>();
		let saveEntries = 0;

		const patchSaveTask = (core: Core) => {
			const original = coreFileSystem(core).saveTask.bind(coreFileSystem(core));
			coreFileSystem(core).saveTask = (async (task: Task): Promise<string> => {
				saveEntries += 1;
				if (task.title === "Alpha") {
					firstEnteredSave.resolve();
					await releaseFirstSave.promise;
				}
				return await original(task);
			}) as ReturnType<typeof coreFileSystem>["saveTask"];
		};

		patchSaveTask(first);
		patchSaveTask(second);

		const firstCreate = first.createTaskFromInput({ title: "Alpha" });
		await firstEnteredSave.promise;

		const secondCreate = second.createTaskFromInput({ title: "Beta" });
		await Promise.resolve();
		await Promise.resolve();
		expect(saveEntries).toBe(1);

		releaseFirstSave.resolve();
		const [createdA, createdB] = await Promise.all([firstCreate, secondCreate]);

		expect(new Set([createdA.task.id, createdB.task.id]).size).toBe(2);
		expect([createdA.task.id, createdB.task.id].sort()).toEqual(["TASK-1", "TASK-2"]);
	});

	it("preserves custom task prefixes when scanning sibling worktrees", async () => {
		testDir = createUniqueTestDir("worktree-prefix-id");
		const mainRepo = await createRepository(testDir, "Worktree Prefix ID Test");
		const mainCore = new Core(mainRepo);
		const config = await coreFileSystem(mainCore).loadConfig();
		if (!config) throw new Error("Expected initialized config");
		config.prefixes = { task: "OPS" };
		await coreFileSystem(mainCore).saveConfig(config);
		const repoRoot = await mainCore.git.stageAgenticWorkspaceDirectory(
			coreFileSystem(mainCore).agenticWorkspaceDirName,
		);
		await mainCore.git.commitChanges("test: set custom task prefix", repoRoot);

		const sibling = await addWorktree(mainRepo, testDir, "feature-prefix");
		const siblingCore = new Core(sibling);
		const siblingTask = await siblingCore.createTaskFromInput({ title: "Sibling task" });
		expect(siblingTask.task.id).toBe("OPS-1");

		const mainTask = await mainCore.createTaskFromInput({ title: "Main task" });
		expect(mainTask.task.id).toBe("OPS-2");
	});

	it("persists per-prefix counters, bootstraps once, and consumes occupied numbers", async () => {
		testDir = createUniqueTestDir("task-counter");
		const mainRepo = await createRepository(testDir, "Task Counter Test");
		const core = new Core(mainRepo);
		const counterPath = join(mainRepo, ".git", "agentic-workspace", "task-counter.json");
		const allocate = async (prefix: string, ids: string[]) =>
			await core.withCreateLock(() => coreFileSystem(core).allocateTaskId(prefix, undefined, async () => ids));

		expect(await allocate("OPS", ["OPS-7", "OPS-7.1"])).toBe("OPS-8");
		const restartedCore = new Core(mainRepo);
		await expect(
			restartedCore.withCreateLock(() =>
				coreFileSystem(restartedCore).allocateTaskId("OPS", undefined, async () => {
					throw new Error("persisted counter should skip bootstrap");
				}),
			),
		).resolves.toBe("OPS-9");
		const persisted = JSON.parse(await readFile(counterPath, "utf8"));
		expect(persisted).toEqual({ OPS: { lastAllocated: 9 } });

		const occupiedContainer = await coreFileSystem(core).taskArtifacts.containerPath("ops-10", "tasks");
		await mkdir(occupiedContainer, { recursive: true });
		expect(await allocate("OPS", [])).toBe("OPS-11");
		expect(await stat(occupiedContainer).then(() => true)).toBe(true);

		await expect(
			core.withCreateLock(() => coreFileSystem(core).allocateTaskId("PAD", 3, async () => [])),
		).resolves.toBe("PAD-001");
		await expect(
			core.withCreateLock(() => coreFileSystem(core).allocateTaskId("PAD", 3, async () => [])),
		).resolves.toBe("PAD-002");
	});

	it("skips IDs in completed storage and persists the consumed number", async () => {
		testDir = createUniqueTestDir("task-counter-completed-collision");
		const mainRepo = await createRepository(testDir, "Completed Task Counter Test");
		const core = new Core(mainRepo);
		const counterPath = join(mainRepo, ".git", "agentic-workspace", "task-counter.json");
		await mkdir(join(mainRepo, ".git", "agentic-workspace"), { recursive: true });
		await writeFile(counterPath, JSON.stringify({ OPS: { lastAllocated: 0 } }));
		await mkdir(await coreFileSystem(core).taskArtifacts.containerPath("ops-1", "completed"), { recursive: true });

		await expect(
			core.withCreateLock(() => coreFileSystem(core).allocateTaskId("OPS", undefined, async () => [])),
		).resolves.toBe("OPS-2");
		expect(JSON.parse(await readFile(counterPath, "utf8"))).toEqual({ OPS: { lastAllocated: 2 } });
	});

	it("skips IDs in archived task storage", async () => {
		testDir = createUniqueTestDir("task-counter-archived-collision");
		const mainRepo = await createRepository(testDir, "Archived Task Counter Test");
		const core = new Core(mainRepo);
		const counterPath = join(mainRepo, ".git", "agentic-workspace", "task-counter.json");
		await mkdir(join(mainRepo, ".git", "agentic-workspace"), { recursive: true });
		await writeFile(counterPath, JSON.stringify({ OPS: { lastAllocated: 0 } }));
		await mkdir(await coreFileSystem(core).taskArtifacts.containerPath("ops-1", "archive/tasks"), { recursive: true });

		await expect(
			core.withCreateLock(() => coreFileSystem(core).allocateTaskId("OPS", undefined, async () => [])),
		).resolves.toBe("OPS-2");
	});
});
