import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { stat, unlink, utimes } from "node:fs/promises";
import { join } from "node:path";
import type { Task } from "../model/types.ts";
import { FileSystem } from "../storage/file-system.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { TASK_FILE_READ_CONCURRENCY } from "../storage/task-repository.ts";
import { createUniqueTestDir, initializeFilesystemTestWorkspace, safeCleanup } from "./test-utils.ts";

function task(id: string, title: string): Task {
	return {
		id,
		title,
		status: "To Do",
		done: false,
		createdDate: "2026-08-10",
		labels: ["cache"],
		dependencies: [],
		description: "Cached task",
		references: ["docs/cached.md"],
	};
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolvePromise!: (value: T) => void;
	const promise = new Promise<T>((resolve) => {
		resolvePromise = resolve;
	});
	return { promise, resolve: resolvePromise };
}

describe("FileSystem task parse cache", () => {
	let testDir: string;
	let filesystem: FileSystem;

	beforeEach(async () => {
		testDir = createUniqueTestDir("test-task-file-cache");
		filesystem = new FileSystem(testDir);
		await initializeFilesystemTestWorkspace(filesystem);
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("reuses exact active and completed contents without sharing mutable parse results", async () => {
		await filesystem.saveTask(task("TASK-1", "Active task"), { create: true });
		await Bun.write(
			join(filesystem.completedDir, "task-2", "task.md"),
			serializeTask({ ...task("TASK-2", "Completed task"), status: "Done" }),
		);
		const [firstActive, firstCompleted] = await Promise.all([filesystem.listTasks(), filesystem.listCompletedTasks()]);

		firstActive[0]?.labels.push("mutated");
		if (firstActive[0]?.references?.[0]) {
			firstActive[0].references[0] = "mutated/reference.md";
		}
		firstCompleted[0]?.labels.push("mutated");

		const [secondActive, secondCompleted] = await Promise.all([
			filesystem.listTasks(),
			filesystem.listCompletedTasks(),
		]);
		expect(secondActive[0]).not.toBe(firstActive[0]);
		expect(secondActive[0]?.labels).toEqual(["cache"]);
		expect(secondActive[0]?.references?.[0]).toBe("docs/cached.md");
		expect(secondCompleted[0]?.labels).toEqual(["cache"]);
	});

	it("discovers only task.md records in containers and ignores artifact Markdown", async () => {
		const container = join(filesystem.tasksDir, "task-42");
		await Bun.write(join(container, "task.md"), serializeTask(task("TASK-42", "Container task")));
		await Bun.write(join(container, "plan.md"), "# This is an artifact, not a task record");
		await Bun.write(join(filesystem.tasksDir, "unrelated", "notes.md"), "# Not a task container");

		const tasks = await filesystem.listTasks();
		expect(tasks.map(({ id }) => id)).toContain("TASK-42");
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.filePath).toBe(join(container, "task.md"));
	});

	it("reparses an exact-content change even when size and timestamps are unchanged", async () => {
		const original = serializeTask(task("TASK-1", "Alpha"));
		const replacement = serializeTask(task("TASK-1", "Bravo"));
		expect(Buffer.byteLength(replacement)).toBe(Buffer.byteLength(original));
		const taskPath = join(filesystem.tasksDir, "task-1", "task.md");
		await Bun.write(taskPath, original);
		expect((await filesystem.listTasks())[0]?.title).toBe("Alpha");
		const originalStats = await stat(taskPath);

		await Bun.write(taskPath, replacement);
		await utimes(taskPath, originalStats.atime, originalStats.mtime);

		expect((await filesystem.listTasks())[0]?.title).toBe("Bravo");
		expect((await filesystem.listTasks())[0]?.title).toBe("Bravo");
	});

	it("never serves a stale cached task while the file is malformed", async () => {
		const original = serializeTask(task("TASK-1", "Valid task"));
		const taskPath = join(filesystem.tasksDir, "task-1", "task.md");
		await Bun.write(taskPath, original);
		expect(await filesystem.listTasks()).toHaveLength(1);
		await Bun.write(taskPath, "---\nid: TASK-1\nlabels: [broken\n---\n");

		const warning = spyOn(console, "warn").mockImplementation(() => {});
		const parse = spyOn(Bun.YAML, "parse");
		try {
			expect(await filesystem.listTasks()).toEqual([]);
			expect(await filesystem.listTasks()).toEqual([]);
			expect(warning).toHaveBeenCalledTimes(1);
			expect(warning.mock.calls[0]?.[0]).toContain(`${taskPath}: YAML Parse error:`);
			expect(parse).toHaveBeenCalledTimes(1);
		} finally {
			warning.mockRestore();
			parse.mockRestore();
		}

		await Bun.write(taskPath, original);
		expect((await filesystem.listTasks())[0]?.title).toBe("Valid task");
	});

	it("prunes deleted paths before a later file reuses the same name", async () => {
		const original = serializeTask(task("TASK-1", "Original task"));
		const taskPath = join(filesystem.tasksDir, "task-1", "task.md");
		await Bun.write(taskPath, original);
		expect(await filesystem.listTasks()).toHaveLength(1);
		await unlink(taskPath);
		expect(await filesystem.listTasks()).toEqual([]);

		await Bun.write(taskPath, original);
		expect((await filesystem.listTasks())[0]?.title).toBe("Original task");
	});

	it("keeps parsed tasks scoped to independently selected agentic-workspace roots", async () => {
		await filesystem.saveTask(task("TASK-1", "Primary root"), { create: true });
		const secondary = new FileSystem(testDir, { agenticWorkspaceDirectory: "secondary", configLocation: "folder" });
		await initializeFilesystemTestWorkspace(secondary);
		await secondary.saveTask(task("TASK-1", "Secondary root"), { create: true });
		expect((await filesystem.listTasks())[0]?.title).toBe("Primary root");
		expect((await secondary.listTasks())[0]?.title).toBe("Secondary root");
		expect((await filesystem.listTasks())[0]?.title).toBe("Primary root");
	});

	it("does not let an older in-flight read replace a newer cached value", async () => {
		const original = serializeTask(task("TASK-1", "Older value"));
		const replacement = serializeTask(task("TASK-1", "Newer value"));
		const taskPath = await filesystem.saveTask(task("TASK-1", "Concurrent"), { create: true });
		const olderRead = deferred<string>();
		const newerRead = deferred<string>();
		let readCount = 0;
		const startedReads = [deferred<void>(), deferred<void>()];
		const fileSpy = spyOn(Bun, "file").mockImplementation(((filepath: string | URL) => {
			expect(String(filepath)).toBe(taskPath);
			const index = readCount++;
			startedReads[index]?.resolve();
			const content = index === 0 ? olderRead.promise : index === 1 ? newerRead.promise : Promise.resolve(replacement);
			return { text: async () => await content } as ReturnType<typeof Bun.file>;
		}) as typeof Bun.file);

		try {
			const older = filesystem.listTasks();
			await startedReads[0]?.promise;
			const newer = filesystem.listTasks();
			await startedReads[1]?.promise;

			newerRead.resolve(replacement);
			expect((await newer)[0]?.title).toBe("Newer value");
			olderRead.resolve(original);
			expect((await older)[0]?.title).toBe("Older value");

			expect((await filesystem.listTasks())[0]?.title).toBe("Newer value");
		} finally {
			olderRead.resolve(original);
			newerRead.resolve(replacement);
			fileSpy.mockRestore();
		}
	});

	it("does not return a deleted task from a later listing after an in-flight read", async () => {
		const content = serializeTask(task("TASK-1", "Deleted task"));
		const taskPath = await filesystem.saveTask(task("TASK-1", "Deleted task"), { create: true });
		const inFlightRead = deferred<string>();
		const startedRead = deferred<void>();
		const fileSpy = spyOn(Bun, "file").mockImplementation(((filepath: string | URL) => {
			expect(String(filepath)).toBe(taskPath);
			startedRead.resolve();
			const result = inFlightRead.promise;
			return { text: async () => await result } as ReturnType<typeof Bun.file>;
		}) as typeof Bun.file);

		try {
			const pendingList = filesystem.listTasks();
			await startedRead.promise;
			await unlink(taskPath);
			expect(await filesystem.listTasks()).toEqual([]);
			inFlightRead.resolve(content);
			expect((await pendingList)[0]?.title).toBe("Deleted task");
			expect(await filesystem.listTasks()).toEqual([]);
		} finally {
			inFlightRead.resolve(content);
			fileSpy.mockRestore();
		}
	});

	it("caps task file reads across concurrent scans", async () => {
		const activeFiles = Array.from({ length: TASK_FILE_READ_CONCURRENCY }, (_, index) => ({
			path: join(filesystem.tasksDir, `task-${index}`, "task.md"),
			content: serializeTask(task(`TASK-${index}`, "Concurrent active read")),
		}));
		const completedFiles = Array.from({ length: TASK_FILE_READ_CONCURRENCY }, (_, index) => ({
			path: join(filesystem.completedDir, `task-${index + TASK_FILE_READ_CONCURRENCY}`, "task.md"),
			content: serializeTask(task(`TASK-${index + TASK_FILE_READ_CONCURRENCY}`, "Concurrent completed read")),
		}));
		for (const file of [...activeFiles, ...completedFiles]) await Bun.write(file.path, file.content);
		let nextReadStarted = deferred<void>();
		const pendingReads: Array<{ resolved: boolean; resolve: () => void }> = [];
		let started = 0;
		let active = 0;
		let maximumActive = 0;
		const contents = new Map([...activeFiles, ...completedFiles].map(({ path, content }) => [path, content]));
		const fileSpy = spyOn(Bun, "file").mockImplementation(((filepath: string | URL) => {
			const content = contents.get(String(filepath));
			if (content === undefined) throw new Error(`Unexpected task read: ${String(filepath)}`);
			started++;
			active++;
			maximumActive = Math.max(maximumActive, active);
			const read = deferred<string>();
			const pending = {
				resolved: false,
				resolve: () => {
					if (pending.resolved) return;
					pending.resolved = true;
					active--;
					read.resolve(content);
				},
			};
			pendingReads.push(pending);
			const startedSignal = nextReadStarted;
			nextReadStarted = deferred<void>();
			startedSignal.resolve();
			return { text: async () => await read.promise } as ReturnType<typeof Bun.file>;
		}) as typeof Bun.file);

		try {
			const reads = Promise.all([filesystem.listTasks(), filesystem.listCompletedTasks()]);

			while (started < activeFiles.length + completedFiles.length) {
				const wave = pendingReads.filter((pending) => !pending.resolved);
				if (wave.length === 0) {
					await nextReadStarted.promise;
					continue;
				}

				const startedBeforeRelease = started;
				const nextStart = nextReadStarted.promise;
				for (const pending of wave) pending.resolve();
				if (started === startedBeforeRelease) await nextStart;
			}
			expect(maximumActive).toBeLessThanOrEqual(TASK_FILE_READ_CONCURRENCY);
			for (const pending of pendingReads) pending.resolve();
			const [activeTasks, completedTasks] = await reads;
			expect(activeTasks).toHaveLength(activeFiles.length);
			expect(completedTasks).toHaveLength(completedFiles.length);
		} finally {
			for (const pending of pendingReads) pending.resolve();
			fileSpy.mockRestore();
		}
	});
});
