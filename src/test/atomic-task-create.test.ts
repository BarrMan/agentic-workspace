import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgentConfiguration, upsertAgentConfiguration } from "../agent-workspace/config.ts";
import type { AgentConfiguration } from "../agent-workspace/types.ts";
import { Core } from "../core/agentic-workspace.ts";
import { CREATE_LOCK_ERROR_MESSAGE } from "../file-system/operations.ts";
import type { Task } from "../types";
import { coreFileSystem, initializeTestProject, withTimeout } from "./test-utils.ts";

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

async function expectResolvesWithin(promise: Promise<unknown>, timeoutMs: number, label: string): Promise<void> {
	await withTimeout(promise, label, timeoutMs);
}

describe("atomic task creation", () => {
	let testDir: string;
	let configHome: string;
	let originalXdgConfigHome: string | undefined;

	beforeEach(async () => {
		// User-level configuration must not leak into the project's parent lookup; pin it to an empty
		// directory (mirrors `config.test.ts`).
		originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
		configHome = await mkdtemp(join(tmpdir(), "agentic-workspace-atomic-config-"));
		process.env.XDG_CONFIG_HOME = configHome;

		testDir = await mkdtemp(join(tmpdir(), "agentic-workspace-atomic-create-"));
		const core = new Core(testDir);
		await initializeTestProject(core, "Atomic Create Test", false);

		const config = await coreFileSystem(core).loadConfig();
		if (config) {
			config.checkActiveBranches = false;
			await coreFileSystem(core).saveConfig(config);
		}
	});

	afterEach(async () => {
		if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
		await rm(configHome, { recursive: true, force: true });
		await rm(testDir, { recursive: true, force: true });
	});

	it("creates a task preset override while unconfigured tasks keep inheriting project changes", async () => {
		const core = new Core(testDir);
		const configuration: AgentConfiguration = {
			selectedPreset: "first",
			presets: {
				first: { command: "first {skill} {prompt}", bootstrap: "opencode", env: {}, prepare: "" },
				second: { command: "second {skill} {prompt}", bootstrap: "opencode", env: {}, prepare: "" },
			},
		};
		await upsertAgentConfiguration(core, "project", configuration);
		const inherited = await core.createTaskFromInput({ title: "Inherited preset" });
		const overridden = await core.createTaskFromInput({
			title: "Task preset",
			agentConfiguration: { ...configuration, selectedPreset: "second" },
		});
		expect((await coreFileSystem(core).loadTask(inherited.task.id))?.agentConfiguration).toBeUndefined();
		expect((await resolveAgentConfiguration(core, overridden.task.id)).config.selectedPreset).toBe("second");
		await upsertAgentConfiguration(core, "project", { ...configuration, selectedPreset: "second" });
		expect((await resolveAgentConfiguration(core, inherited.task.id)).config.selectedPreset).toBe("second");
		await upsertAgentConfiguration(core, "project", configuration);
		expect((await resolveAgentConfiguration(core, inherited.task.id)).config.selectedPreset).toBe("first");
		expect((await resolveAgentConfiguration(core, overridden.task.id)).config.selectedPreset).toBe("second");
	});

	it("serializes create-time writes and assigns unique ids by default", async () => {
		const first = new Core(testDir);
		const second = new Core(testDir);
		const firstEnteredSave = createDeferred<void>();
		const releaseFirstSave = createDeferred<void>();
		const secondEnteredSave = createDeferred<void>();
		let saveEntries = 0;

		const patchSaveTask = (core: Core) => {
			const original = coreFileSystem(core).saveTask.bind(coreFileSystem(core));
			coreFileSystem(core).saveTask = (async (task: Task): Promise<string> => {
				saveEntries += 1;
				if (task.title === "Alpha") {
					firstEnteredSave.resolve();
					await releaseFirstSave.promise;
				}
				if (task.title === "Beta") {
					secondEnteredSave.resolve();
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
		await secondEnteredSave.promise;

		expect(new Set([createdA.task.id, createdB.task.id]).size).toBe(2);
		expect([createdA.task.id, createdB.task.id].sort()).toEqual(["TASK-1", "TASK-2"]);
	});

	it("assigns unique ids when two draft promotions race", async () => {
		const setup = new Core(testDir);
		await setup.createTaskFromInput({ title: "Draft A", status: "Draft" });
		await setup.createTaskFromInput({ title: "Draft B", status: "Draft" });

		const first = new Core(testDir);
		const second = new Core(testDir);
		const firstEnteredWrite = createDeferred<void>();
		const releaseFirstWrite = createDeferred<void>();
		let writeEntries = 0;
		const originalWrite = Bun.write;
		const tasksPathPrefix = `${testDir}/agentic-workspace/tasks/`.replace(/\\/g, "/");

		Bun.write = (async (...args: Parameters<typeof Bun.write>) => {
			const targetPath = String(args[0]).replace(/\\/g, "/");
			if (targetPath.includes(tasksPathPrefix)) {
				writeEntries += 1;
				if (String(args[1]).includes("Draft A")) {
					firstEnteredWrite.resolve();
					await releaseFirstWrite.promise;
				}
			}
			return await originalWrite(...args);
		}) as typeof Bun.write;

		try {
			const promoteA = first.promoteDraft("draft-1");
			await expectResolvesWithin(firstEnteredWrite.promise, 250, "first draft promotion should reach Bun.write");

			const promoteB = second.promoteDraft("draft-2");
			await Promise.resolve();
			await Promise.resolve();
			expect(writeEntries).toBe(1);

			releaseFirstWrite.resolve();
			await expectResolvesWithin(Promise.all([promoteA, promoteB]), 3_000, "both draft promotions should finish");

			const tasks = await coreFileSystem(setup).listTasks();
			expect(tasks.map((task) => task.id)).toEqual(["TASK-1", "TASK-2"]);
			expect(tasks.map((task) => task.title)).toEqual(["Draft A", "Draft B"]);
		} finally {
			Bun.write = originalWrite;
		}
	});

	it("assigns unique ids when two task demotions race", async () => {
		const setup = new Core(testDir);
		await setup.createTaskFromInput({ title: "Task A" });
		await setup.createTaskFromInput({ title: "Task B" });

		const first = new Core(testDir);
		const second = new Core(testDir);
		const firstEnteredWrite = createDeferred<void>();
		const releaseFirstWrite = createDeferred<void>();
		let writeEntries = 0;
		const originalWrite = Bun.write;
		const draftsPathPrefix = `${testDir}/agentic-workspace/drafts/`.replace(/\\/g, "/");

		Bun.write = (async (...args: Parameters<typeof Bun.write>) => {
			const targetPath = String(args[0]).replace(/\\/g, "/");
			if (targetPath.includes(draftsPathPrefix)) {
				writeEntries += 1;
				if (String(args[1]).includes("Task A")) {
					firstEnteredWrite.resolve();
					await releaseFirstWrite.promise;
				}
			}
			return await originalWrite(...args);
		}) as typeof Bun.write;

		try {
			const demoteA = first.demoteTask("task-1");
			await expectResolvesWithin(firstEnteredWrite.promise, 250, "first task demotion should reach Bun.write");

			const demoteB = second.demoteTask("task-2");
			await Promise.resolve();
			await Promise.resolve();
			expect(writeEntries).toBe(1);

			releaseFirstWrite.resolve();
			await expectResolvesWithin(Promise.all([demoteA, demoteB]), 3_000, "both task demotions should finish");

			const drafts = await coreFileSystem(setup).listDrafts();
			expect(drafts.map((draft) => draft.id)).toEqual(["DRAFT-1", "DRAFT-2"]);
			expect(drafts.map((draft) => draft.title)).toEqual(["Task A", "Task B"]);
		} finally {
			Bun.write = originalWrite;
		}
	});

	it("assigns unique ids when two milestone creations race", async () => {
		const first = new Core(testDir);
		const second = new Core(testDir);
		const firstEnteredWrite = createDeferred<void>();
		const releaseFirstWrite = createDeferred<void>();
		let writeEntries = 0;
		const originalWrite = Bun.write;
		const milestonePathPrefix = `${testDir}/agentic-workspace/milestones/`.replace(/\\/g, "/");

		Bun.write = (async (...args: Parameters<typeof Bun.write>) => {
			const targetPath = String(args[0]).replace(/\\/g, "/");
			if (targetPath.includes(milestonePathPrefix)) {
				writeEntries += 1;
				if (targetPath.includes("alpha-milestone")) {
					firstEnteredWrite.resolve();
					await releaseFirstWrite.promise;
				}
			}
			return await originalWrite(...args);
		}) as typeof Bun.write;

		try {
			const firstCreate = coreFileSystem(first).createMilestone("Alpha Milestone");
			await expectResolvesWithin(firstEnteredWrite.promise, 250, "first milestone create should reach Bun.write");

			const secondCreate = coreFileSystem(second).createMilestone("Beta Milestone");
			await Promise.resolve();
			await Promise.resolve();
			expect(writeEntries).toBe(1);

			releaseFirstWrite.resolve();
			const [createdA, createdB] = await Promise.all([firstCreate, secondCreate]);

			expect(new Set([createdA.id, createdB.id]).size).toBe(2);
			expect([createdA.id, createdB.id].sort()).toEqual(["m-0", "m-1"]);
		} finally {
			Bun.write = originalWrite;
		}
	});

	it("returns a user-facing error when the create lock times out", async () => {
		const core = new Core(testDir);
		const lockEntered = createDeferred<void>();
		const releaseLock = createDeferred<void>();

		const heldLock = coreFileSystem(core).withCreateLock(
			async () => {
				lockEntered.resolve();
				await releaseLock.promise;
			},
			{ timeoutMs: 5_000, retryDelayMs: 25, staleMs: 5_000 },
		);
		await lockEntered.promise;

		await expect(
			coreFileSystem(core).withCreateLock(async () => undefined, {
				timeoutMs: 100,
				retryDelayMs: 25,
				staleMs: 5_000,
			}),
		).rejects.toThrow(CREATE_LOCK_ERROR_MESSAGE);

		releaseLock.resolve();
		await heldLock;
	});
});
