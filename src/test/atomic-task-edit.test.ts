import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { $ } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { isTaskLockError, taskLockErrorMessage } from "../file-system/operations.ts";
import { McpServer } from "../mcp/server.ts";
import { TaskHandlers } from "../mcp/tools/tasks/handlers.ts";
import type { Task } from "../types/index.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup, withTimeout } from "./test-utils.ts";

const CLI_COMMAND = getTestCliCommand();
const CONTENDED_ID = "TASK-1";
const CONTENTION_MESSAGE = taskLockErrorMessage(CONTENDED_ID);

async function invokeCli(cwd: string, args: string[]) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const out = new Writable({
		write: (chunk, _encoding, done) => {
			stdout.push(chunk.toString());
			done();
		},
	});
	const err = new Writable({
		write: (chunk, _encoding, done) => {
			stderr.push(chunk.toString());
			done();
		},
	});
	const exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	return { exitCode, stdout: { toString: () => stdout.join("") }, stderr: { toString: () => stderr.join("") } };
}

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
	let originalGlobalLockEnv: string | undefined;

	beforeEach(async () => {
		originalGlobalLockEnv = process.env.USE_GLOBAL_TASK_ID_LOCK;
		delete process.env.USE_GLOBAL_TASK_ID_LOCK;

		testDir = createUniqueTestDir("atomic-task-edit");
		await mkdir(testDir, { recursive: true });
		setup = new Core(testDir);
		await initializeFilesystemTestProject(setup, "Atomic Edit Test");
	});

	afterEach(async () => {
		if (originalGlobalLockEnv === undefined) {
			delete process.env.USE_GLOBAL_TASK_ID_LOCK;
		} else {
			process.env.USE_GLOBAL_TASK_ID_LOCK = originalGlobalLockEnv;
		}
		await safeCleanup(testDir);
	});

	async function createContendedTask(): Promise<Task> {
		await setup.createTaskFromInput({ title: "Shared Task" });
		const task = await setup.filesystem.loadTask(CONTENDED_ID);
		if (!task) throw new Error(`${CONTENDED_ID} missing during test setup`);
		return task;
	}

	async function finalLabels(): Promise<string[]> {
		const task = await setup.filesystem.loadTask(CONTENDED_ID);
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

	it("never silently loses an edit that races a demotion to Draft", async () => {
		await createContendedTask();

		// Demotion is reachable with status "Draft" from the web PUT and MCP task_edit. Holding
		// the create lock parks the demote inside its draft-id allocation, the window where an
		// unprotected demote used to apply its own pre-lock snapshot over a concurrent edit.
		const createLockEntered = createDeferred<void>();
		const releaseCreateLock = createDeferred<void>();
		const heldCreateLock = setup.filesystem.withCreateLock(async () => {
			createLockEntered.resolve();
			await releaseCreateLock.promise;
		});
		await withTimeout(createLockEntered.promise, "the create lock to be held", 5_000);

		const demoter = new Core(testDir);
		const editor = new Core(testDir);
		const demoteReachedCreateLock = createDeferred<void>();
		const originalWithCreateLock = demoter.filesystem.withCreateLock.bind(demoter.filesystem);
		demoter.filesystem.withCreateLock = (async <T>(fn: () => Promise<T>): Promise<T> => {
			demoteReachedCreateLock.resolve();
			return await originalWithCreateLock(fn);
		}) as typeof demoter.filesystem.withCreateLock;

		try {
			const demotion = demoter.updateTaskFromInput(CONTENDED_ID, { status: "Draft" });
			await withTimeout(demoteReachedCreateLock.promise, "the demote to reach the create lock", 5_000);

			const editOutcome = await editor.updateTaskFromInput(CONTENDED_ID, { addLabels: ["racer"] }).then(
				() => null,
				(error: unknown) => error,
			);
			releaseCreateLock.resolve();
			await heldCreateLock;
			await demotion;

			const draft = await setup.filesystem.loadDraft("DRAFT-1");
			expect(draft?.status).toBe("Draft");
			if (editOutcome === null) {
				// If the edit was told it succeeded, the demoted draft must carry it.
				expect(draft?.labels ?? []).toContain("racer");
			} else {
				// Otherwise it must have failed loudly rather than being silently dropped.
				expect(isTaskLockError(editOutcome)).toBe(true);
				expect((editOutcome as Error).message).toBe(CONTENTION_MESSAGE);
				expect(draft?.labels ?? []).not.toContain("racer");
			}
		} finally {
			releaseCreateLock.resolve();
			await heldCreateLock;
		}
	});

	it("blocks a demotion to Draft that reaches the funnel through editTaskOrDraft", async () => {
		const task = await createContendedTask();
		const lockEntered = createDeferred<void>();
		const releaseLock = createDeferred<void>();
		const heldLock = setup.filesystem.withTaskLock(task, async () => {
			lockEntered.resolve();
			await releaseLock.promise;
		});
		await withTimeout(lockEntered.promise, "the lock to be held", 5_000);

		// MCP task_edit with status "Draft" calls demoteTaskWithUpdates directly, skipping
		// updateTaskFromInput, so the lock has to live in the demote itself.
		const other = new Core(testDir);
		try {
			await expect(other.editTaskOrDraft(CONTENDED_ID, { status: "Draft" })).rejects.toThrow(CONTENTION_MESSAGE);
			expect(await setup.filesystem.loadTask(CONTENDED_ID)).not.toBeNull();
			expect(await setup.filesystem.listDrafts()).toEqual([]);
		} finally {
			releaseLock.resolve();
			await heldLock;
		}
	});

	it("blocks direct demotion while another task mutation holds the lock", async () => {
		const task = await createContendedTask();
		const lockEntered = createDeferred<void>();
		const releaseLock = createDeferred<void>();
		const heldLock = setup.filesystem.withTaskLock(task, async () => {
			lockEntered.resolve();
			await releaseLock.promise;
		});
		await withTimeout(lockEntered.promise, "the lock to be held", 5_000);

		const other = new Core(testDir);
		try {
			await expect(other.demoteTask(CONTENDED_ID)).rejects.toThrow(CONTENTION_MESSAGE);
			expect(await setup.filesystem.loadTask(CONTENDED_ID)).not.toBeNull();
			expect(await setup.filesystem.listDrafts()).toEqual([]);
		} finally {
			releaseLock.resolve();
			await heldLock;
		}
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

		expect((await setup.filesystem.loadTask("TASK-1"))?.labels ?? []).toEqual(["alpha"]);
		expect((await setup.filesystem.loadTask("TASK-2"))?.labels ?? []).toEqual(["beta"]);
	});

	it("blocks a second process while the first holds the lock", async () => {
		const task = await createContendedTask();
		const lockEntered = createDeferred<void>();
		const releaseLock = createDeferred<void>();

		// The lock lives on the filesystem, so a completely separate backlog process sees it.
		const heldLock = setup.filesystem.withTaskLock(task, async () => {
			lockEntered.resolve();
			await releaseLock.promise;
		});
		let blockedOperation: ReturnType<typeof $> | undefined;
		try {
			await withTimeout(lockEntered.promise, "the lock to be held", 5_000);
			blockedOperation = $`${CLI_COMMAND} task edit ${CONTENDED_ID} --add-label blocked`.cwd(testDir).quiet().nothrow();
			const blocked = await blockedOperation;
			expect(blocked.exitCode).not.toBe(0);
			expect(`${blocked.stderr.toString()}${blocked.stdout.toString()}`).toContain(CONTENTION_MESSAGE);
			expect(await finalLabels()).toEqual([]);
		} finally {
			releaseLock.resolve();
			await heldLock;
			if (blockedOperation) await blockedOperation;
		}

		// Once the holder is done the same command succeeds, so nothing is left wedged.
		const retried = await $`${CLI_COMMAND} task edit ${CONTENDED_ID} --add-label retried`
			.cwd(testDir)
			.quiet()
			.nothrow();
		expect(retried.exitCode).toBe(0);
		expect(await finalLabels()).toEqual(["retried"]);
	});

	it("survives parallel CLI processes editing the same task", async () => {
		const sharedId = CONTENDED_ID;
		await createContendedTask();

		const jobCount = 6;
		const labels = Array.from({ length: jobCount }, (_, index) => `cli-${index + 1}`);
		const results = await Promise.all(
			labels.map((label) =>
				$`${CLI_COMMAND} task edit ${sharedId} --add-label ${label}`.cwd(testDir).quiet().nothrow(),
			),
		);

		const succeeded = labels.filter((_, index) => results[index]?.exitCode === 0);
		expect(succeeded.length).toBeGreaterThanOrEqual(1);

		for (const result of results) {
			if (result.exitCode === 0) continue;
			expect(`${result.stderr.toString()}${result.stdout.toString()}`).toContain(taskLockErrorMessage(sharedId));
		}

		const shared = await setup.filesystem.loadTask(sharedId);
		expect([...(shared?.labels ?? [])].sort()).toEqual([...succeeded].sort());
	}, 60_000);

	it("reports an MCP operation error on contention", async () => {
		const task = await createContendedTask();
		const mcpServer = new McpServer(testDir, "Test instructions");
		const handlers = new TaskHandlers(mcpServer.application);

		const lockEntered = createDeferred<void>();
		const releaseLock = createDeferred<void>();
		const heldLock = setup.filesystem.withTaskLock(task, async () => {
			lockEntered.resolve();
			await releaseLock.promise;
		});
		await withTimeout(lockEntered.promise, "the lock to be held", 5_000);

		try {
			await handlers.editTask({ id: CONTENDED_ID, addLabels: ["from-mcp"] });
			throw new Error("editTask should have failed while the task lock was held");
		} catch (error) {
			expect((error as Error).message).toBe(CONTENTION_MESSAGE);
			expect((error as { code?: string }).code).toBe("OPERATION_FAILED");
		} finally {
			releaseLock.resolve();
			await heldLock;
			await mcpServer.stop();
		}
	});

	it("bypasses the task lock when the legacy escape hatch is set", async () => {
		const task = await createContendedTask();
		process.env.USE_GLOBAL_TASK_ID_LOCK = "false";

		const bothEntered = createDeferred<void>();
		const releaseBoth = createDeferred<void>();
		let entries = 0;
		const enter = async (value: string): Promise<string> => {
			entries += 1;
			if (entries === 2) bothEntered.resolve();
			await releaseBoth.promise;
			return value;
		};

		const operations = Promise.all([
			setup.filesystem.withTaskLock(task, () => enter("first")),
			setup.filesystem.withTaskLock(task, () => enter("second")),
		]);
		try {
			await withTimeout(bothEntered.promise, "both operations to enter without serialization", 250);
		} finally {
			releaseBoth.resolve();
		}
		expect(await operations).toEqual(["first", "second"]);
	});
});
