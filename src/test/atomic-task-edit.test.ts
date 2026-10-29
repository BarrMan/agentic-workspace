import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { getTestCliCommand } from "./test-cli.ts";
import {
	coreFileSystem,
	createUniqueTestDir,
	initializeFilesystemTestProject,
	safeCleanup,
	withTimeout,
} from "./test-utils.ts";

const CLI_COMMAND = getTestCliCommand();
const CONTENDED_ID = "TASK-1";

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

describe("atomic task editing", () => {
	let testDir: string;
	let setup: Core;

	beforeEach(async () => {
		testDir = createUniqueTestDir("atomic-task-edit");
		await mkdir(testDir, { recursive: true });
		setup = new Core(testDir);
		await initializeFilesystemTestProject(setup, "Atomic Edit Test");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	async function createContendedTask(): Promise<Task> {
		await setup.tasks.create({ title: "Shared Task" });
		const task = await coreFileSystem(setup).loadTask(CONTENDED_ID);
		if (!task) throw new Error(`${CONTENDED_ID} missing during test setup`);
		return task;
	}

	async function finalLabels(): Promise<string[]> {
		const task = await coreFileSystem(setup).loadTask(CONTENDED_ID);
		return [...(task?.labels ?? [])].sort();
	}

	it("never silently loses a concurrent edit: all writers wait and land", async () => {
		await createContendedTask();

		// Every Core has its own ContentStore, so these race like separate processes: without
		// serialization each one mutates the same pre-write snapshot, every caller is told the
		// edit succeeded, and all but one label disappear from the file.
		const writerCount = 6;
		const labels = Array.from({ length: writerCount }, (_, index) => `label-${index + 1}`);
		const writers = labels.map((label) => ({ label, core: new Core(testDir) }));
		const outcomes = await Promise.allSettled(
			writers.map(({ label, core }) =>
				core.storage.withTaskLock(CONTENDED_ID, (current) =>
					core.tasks.edit({ ...current, labels: [...current.labels, label] }),
				),
			),
		);

		const succeeded = labels.filter((_, index) => outcomes[index]?.status === "fulfilled");
		expect(succeeded.length).toBe(writerCount);

		// The file matches exactly the writers that were told they succeeded — no more, no less.
		expect(await finalLabels()).toEqual([...succeeded].sort());
	});

	it("keeps concurrent edits of different tasks independent", async () => {
		await setup.tasks.create({ title: "Task A" });
		await setup.tasks.create({ title: "Task B" });

		const first = new Core(testDir);
		const second = new Core(testDir);
		try {
			await Promise.all([
				first.storage.withTaskLock("TASK-1", (current) =>
					first.tasks.edit({ ...current, labels: [...current.labels, "alpha"] }),
				),
				second.storage.withTaskLock("TASK-2", (current) =>
					second.tasks.edit({ ...current, labels: [...current.labels, "beta"] }),
				),
			]);
		} finally {
		}

		expect((await coreFileSystem(setup).loadTask("TASK-1"))?.labels ?? []).toEqual(["alpha"]);
		expect((await coreFileSystem(setup).loadTask("TASK-2"))?.labels ?? []).toEqual(["beta"]);
	});

	it("blocks a second process while the first holds the lock", async () => {
		const task = await createContendedTask();
		const lockEntered = createDeferred<void>();
		const releaseLock = createDeferred<void>();

		// The lock lives on the filesystem, so a completely separate agentic-workspace process sees it.
		const heldLock = setup.storage.withTaskLock(task.id, async () => {
			lockEntered.resolve();
			await releaseLock.promise;
		});
		let blockedOperation: ReturnType<typeof Bun.spawn> | undefined;
		try {
			await withTimeout(lockEntered.promise, "the lock to be held", 5_000);
			blockedOperation = Bun.spawn([...CLI_COMMAND, "task", "edit", CONTENDED_ID, "--title", "blocked"], {
				cwd: testDir,
				stdout: "ignore",
				stderr: "ignore",
			});
			expect((await coreFileSystem(setup).loadTask(CONTENDED_ID))?.title).toBe("Shared Task");
			releaseLock.resolve();
			await heldLock;
			expect(await withTimeout(blockedOperation.exited, "the waiting edit to finish", 5_000)).toBe(0);
			expect((await coreFileSystem(setup).loadTask(CONTENDED_ID))?.title).toBe("blocked");
		} finally {
			releaseLock.resolve();
			if (blockedOperation) {
				blockedOperation.kill();
				await blockedOperation.exited;
			}
			await heldLock;
		}
	});

	it("survives parallel CLI processes editing the same task", async () => {
		const sharedId = CONTENDED_ID;
		await createContendedTask();

		const jobCount = 6;
		const titles = Array.from({ length: jobCount }, (_, index) => `cli-${index + 1}`);
		const results = await Promise.all(
			titles.map((title) => $`${CLI_COMMAND} task edit ${sharedId} --title ${title}`.cwd(testDir).quiet().nothrow()),
		);

		const succeeded = titles.filter((_, index) => results[index]?.exitCode === 0);
		expect(succeeded.length).toBe(jobCount);

		const shared = await coreFileSystem(setup).loadTask(sharedId);
		expect(shared).toBeDefined();
		expect(succeeded).toContain(shared?.title ?? "");
	}, 60_000);
});
