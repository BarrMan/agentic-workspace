import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { AgentConfiguration } from "../model/session/types.ts";
import type { Task } from "../model/types.ts";
import { resolveAgentConfiguration, upsertAgentConfiguration } from "../storage/config.ts";
import { CREATE_LOCK_ERROR_MESSAGE } from "../storage/file-system.ts";
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

	it("assigns unique ids when two milestone creations race", async () => {
		const first = new Core(testDir);
		const second = new Core(testDir);
		const firstEnteredWrite = createDeferred<void>();
		const releaseFirstWrite = createDeferred<void>();
		let writeEntries = 0;
		const originalWrite = fsPromises.writeFile;
		const milestonePathPrefix = `${testDir}/agentic-workspace/milestones/`.replace(/\\/g, "/");

		const writeSpy = spyOn(fsPromises, "writeFile").mockImplementation(async (...args) => {
			const targetPath = String(args[0]).replace(/\\/g, "/");
			if (targetPath.includes(milestonePathPrefix)) {
				writeEntries += 1;
				if (targetPath.includes("alpha-milestone")) {
					firstEnteredWrite.resolve();
					await releaseFirstWrite.promise;
				}
			}
			return await originalWrite(...args);
		});

		try {
			const firstCreate = coreFileSystem(first).createMilestone("Alpha Milestone");
			await expectResolvesWithin(
				firstEnteredWrite.promise,
				250,
				"first milestone create should reach temporary-file write",
			);

			const secondCreate = coreFileSystem(second).createMilestone("Beta Milestone");
			await Promise.resolve();
			await Promise.resolve();
			expect(writeEntries).toBe(1);

			releaseFirstWrite.resolve();
			const [createdA, createdB] = await Promise.all([firstCreate, secondCreate]);

			expect(new Set([createdA.id, createdB.id]).size).toBe(2);
			expect([createdA.id, createdB.id].sort()).toEqual(["m-0", "m-1"]);
		} finally {
			writeSpy.mockRestore();
		}
	});

	it("serializes milestone rename and archive with milestone creation and refuses archive collisions", async () => {
		const creator = new Core(testDir);
		const mutator = new Core(testDir);
		const milestone = await coreFileSystem(creator).createMilestone("Locked milestone");
		const lockEntered = createDeferred<void>();
		const releaseLock = createDeferred<void>();
		const heldLock = coreFileSystem(creator).withCreateLock(async () => {
			lockEntered.resolve();
			await releaseLock.promise;
		});
		await lockEntered.promise;

		const requestEnteredLock = createDeferred<void>();
		const fs = coreFileSystem(mutator);
		const originalWithCreateLock = fs.withCreateLock.bind(fs);
		fs.withCreateLock = (async <T>(operation: () => Promise<T>): Promise<T> => {
			requestEnteredLock.resolve();
			return await originalWithCreateLock(operation);
		}) as ReturnType<typeof coreFileSystem>["withCreateLock"];
		let renameFinished = false;
		const rename = fs.renameMilestone(milestone.id, "Renamed while locked").then((result) => {
			renameFinished = true;
			return result;
		});
		await requestEnteredLock.promise;
		await Promise.resolve();
		await Promise.resolve();
		expect(renameFinished).toBe(false);
		releaseLock.resolve();
		await heldLock;
		expect((await rename).success).toBe(true);

		const renamedPath = await fs.getMilestoneFilePath(milestone.id);
		if (!renamedPath) throw new Error("Renamed milestone missing");
		const archive = join(testDir, "agentic-workspace", "archive", "milestones", basename(renamedPath));
		await Bun.write(archive, "existing archive must survive");
		const archiveResult = await fs.archiveMilestone(milestone.id);
		expect(archiveResult.success).toBe(false);
		expect(await Bun.file(renamedPath).exists()).toBe(true);
		expect(await Bun.file(archive).text()).toBe("existing archive must survive");
		await rm(archive);

		const archiveLockEntered = createDeferred<void>();
		const releaseArchiveLock = createDeferred<void>();
		const heldArchiveLock = coreFileSystem(creator).withCreateLock(async () => {
			archiveLockEntered.resolve();
			await releaseArchiveLock.promise;
		});
		await archiveLockEntered.promise;
		const archiveRequestEntered = createDeferred<void>();
		fs.withCreateLock = (async <T>(operation: () => Promise<T>): Promise<T> => {
			archiveRequestEntered.resolve();
			return await originalWithCreateLock(operation);
		}) as ReturnType<typeof coreFileSystem>["withCreateLock"];
		let archiveFinished = false;
		const archiveMilestone = fs.archiveMilestone(milestone.id).then((result) => {
			archiveFinished = true;
			return result;
		});
		await archiveRequestEntered.promise;
		await Promise.resolve();
		await Promise.resolve();
		expect(archiveFinished).toBe(false);
		releaseArchiveLock.resolve();
		await heldArchiveLock;
		expect((await archiveMilestone).success).toBe(true);
	});

	it("preserves the original milestone when an atomic rename write fails", async () => {
		const core = new Core(testDir);
		const fs = coreFileSystem(core);
		const milestone = await fs.createMilestone("Rename failure source");
		const sourcePath = await fs.getMilestoneFilePath(milestone.id);
		if (!sourcePath) throw new Error("Created milestone missing");
		const originalContent = await Bun.file(sourcePath).text();
		const realWriteFile = fsPromises.writeFile;
		const writeSpy = spyOn(fsPromises, "writeFile").mockImplementation(async (path, ...args) => {
			if (String(path).endsWith(".tmp")) throw new Error("injected atomic write failure");
			return await realWriteFile(path, ...args);
		});
		try {
			expect((await fs.renameMilestone(milestone.id, "Rename failure target")).success).toBe(false);
		} finally {
			writeSpy.mockRestore();
		}
		expect(await Bun.file(sourcePath).text()).toBe(originalContent);
		expect(await fs.getMilestoneFilePath(milestone.id)).toBe(sourcePath);
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
