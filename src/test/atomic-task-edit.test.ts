import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { isTaskLockError, taskLockErrorMessage } from "../storage/file-system.ts";
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
const CONTENTION_MESSAGE = taskLockErrorMessage(CONTENDED_ID);

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
		await setup.createTaskFromInput({ title: "Shared Task" });
		const task = await coreFileSystem(setup).loadTask(CONTENDED_ID);
		if (!task) throw new Error(`${CONTENDED_ID} missing during test setup`);
		return task;
	}

	async function finalLabels(): Promise<string[]> {
		const task = await coreFileSystem(setup).loadTask(CONTENDED_ID);
		return [...(task?.labels ?? [])].sort();
	}

	it("never silently loses a concurrent edit: winners land, losers fail loudly", async () => {
		await createContendedTask();

		// Every Core has its own ContentStore, so these race like separate processes: without
		// serialization each one mutates the same pre-write snapshot, every caller is told the
		// edit succeeded, and all but one label disappear from the file.
		const writerCount = 6;
		const labels = Array.from({ length: writerCount }, (_, index) => `label-${index + 1}`);
		const writers = labels.map((label) => ({ label, core: new Core(testDir) }));
		const outcomes = await Promise.allSettled(
			writers.map(({ label, core }) => core.updateTaskFromInput(CONTENDED_ID, { addLabels: [label] })),
		);

		const succeeded = labels.filter((_, index) => outcomes[index]?.status === "fulfilled");
		expect(succeeded.length).toBeGreaterThanOrEqual(1);

		// Nothing waits, merges, or retries: a loser fails immediately with an actionable message.
		for (const outcome of outcomes) {
			if (outcome.status === "fulfilled") continue;
			expect(isTaskLockError(outcome.reason)).toBe(true);
			expect((outcome.reason as Error).message).toBe(CONTENTION_MESSAGE);
		}

		// The file matches exactly the writers that were told they succeeded — no more, no less.
		expect(await finalLabels()).toEqual([...succeeded].sort());
	});

	it("keeps concurrent edits of different tasks independent", async () => {
		await setup.createTaskFromInput({ title: "Task A" });
		await setup.createTaskFromInput({ title: "Task B" });

		const first = new Core(testDir);
		const second = new Core(testDir);
		try {
			await Promise.all([
				first.updateTaskFromInput("TASK-1", { addLabels: ["alpha"] }),
				second.updateTaskFromInput("TASK-2", { addLabels: ["beta"] }),
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
		const heldLock = coreFileSystem(setup).withTaskLock(task, async () => {
			lockEntered.resolve();
			await releaseLock.promise;
		});
		let blockedOperation: ReturnType<typeof $> | undefined;
		try {
			await withTimeout(lockEntered.promise, "the lock to be held", 5_000);
			blockedOperation = $`${CLI_COMMAND} task edit ${CONTENDED_ID} --title blocked`.cwd(testDir).quiet().nothrow();
			const blocked = await blockedOperation;
			expect(blocked.exitCode).not.toBe(0);
			expect(`${blocked.stderr.toString()}${blocked.stdout.toString()}`).toContain(CONTENTION_MESSAGE);
			expect((await coreFileSystem(setup).loadTask(CONTENDED_ID))?.title).toBe("Shared Task");
		} finally {
			releaseLock.resolve();
			await heldLock;
			if (blockedOperation) await blockedOperation;
		}

		// Once the holder is done the same command succeeds, so nothing is left wedged.
		const retried = await $`${CLI_COMMAND} task edit ${CONTENDED_ID} --title retried`.cwd(testDir).quiet().nothrow();
		expect(retried.exitCode).toBe(0);
		expect((await coreFileSystem(setup).loadTask(CONTENDED_ID))?.title).toBe("retried");
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
		expect(succeeded.length).toBeGreaterThanOrEqual(1);

		for (const result of results) {
			if (result.exitCode === 0) continue;
			expect(`${result.stderr.toString()}${result.stdout.toString()}`).toContain(taskLockErrorMessage(sharedId));
		}

		const shared = await coreFileSystem(setup).loadTask(sharedId);
		expect(shared).toBeDefined();
		expect(succeeded).toContain(shared?.title ?? "");
	}, 60_000);
});
