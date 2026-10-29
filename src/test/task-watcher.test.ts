import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import * as nodeFs from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import {
	coreFileSystem,
	createUniqueTestDir,
	getPlatformTimeout,
	initializeFilesystemTestWorkspace,
	initializeTestProject,
	safeCleanup,
	withTimeout,
} from "./test-utils.ts";

type WatchCallback = (eventType: string, filename: string | Buffer | null) => Promise<void>;

function sampleTask(id: string, title: string): Task {
	return {
		id,
		title,
		status: "To Do",
		done: false,
		createdDate: "2026-07-14 00:00",
		labels: [],
		dependencies: [],
		rawContent: "## Description\n\nWatcher fixture",
	};
}

async function taskFilePath(core: Core, id: string): Promise<string> {
	const taskDir = join(coreFileSystem(core).tasksDir, id.toLowerCase());
	await mkdir(taskDir, { recursive: true });
	return join(taskDir, "task.md");
}

describe("task watcher reconciliation", () => {
	let testDir: string;
	let core: Core;
	let watcherCallback: WatchCallback;
	let watchSpy: ReturnType<typeof spyOn>;
	let unsubscribe: (() => void) | undefined;

	beforeEach(async () => {
		testDir = createUniqueTestDir("task-watcher");
		unsubscribe = undefined;
		core = new Core(testDir);
		await initializeFilesystemTestWorkspace(coreFileSystem(core));
		watchSpy = spyOn(nodeFs, "watch").mockImplementation(((
			path: Parameters<typeof nodeFs.watch>[0],
			...args: unknown[]
		) => {
			const callback = args.findLast((argument) => typeof argument === "function");
			if (path === core.storage.taskRecordsDirectory) {
				if (typeof callback !== "function") throw new Error("Expected task watcher callback");
				watcherCallback = callback as WatchCallback;
			}
			const watcher = new EventEmitter() as EventEmitter & { close(): void };
			watcher.close = () => {};
			return watcher as unknown as nodeFs.FSWatcher;
		}) as typeof nodeFs.watch);
	});

	afterEach(async () => {
		unsubscribe?.();
		core.tasks.dispose();
		watchSpy.mockRestore();
		await safeCleanup(testDir);
	});

	it("confirms archive and delete absence from one event without duplicate removals", async () => {
		const archiveDir = join(testDir, "agentic-workspace", "archive", "tasks");
		await mkdir(archiveDir, { recursive: true });
		const tasks = [sampleTask("TASK-3", "Archived"), sampleTask("TASK-4", "Deleted")];
		const paths = await Promise.all(tasks.map((task) => taskFilePath(core, task.id)));
		await Promise.all(paths.map((path, index) => Bun.write(path, serializeTask(tasks[index] as Task))));
		const removed: string[] = [];
		unsubscribe = core.tasks.subscribe({
			onTaskRemoved: (taskId) => {
				removed.push(taskId);
			},
		});
		await core.tasks.init();

		await rename(paths[0] as string, join(archiveDir, "task-3"));
		await watcherCallback("rename", "task-3/task.md");
		await unlink(paths[1] as string);
		await watcherCallback("rename", "task-4/task.md");
		await watcherCallback("rename", "task-3/task.md");
		await watcherCallback("rename", "task-4/task.md");
		expect(removed.sort()).toEqual(["TASK-3", "TASK-4"]);
	});

	it("reconciles an atomic CLI edit through a real filesystem watcher", async () => {
		watchSpy.mockRestore();
		await initializeTestProject(core, "Real task watcher");
		const original = sampleTask("TASK-6", "Real watcher");
		const filePath = await taskFilePath(core, original.id);
		await Bun.write(filePath, serializeTask(original));
		let resolveChanged: ((task: Task) => void) | undefined;
		const changed = new Promise<Task>((resolve) => {
			resolveChanged = resolve;
		});
		unsubscribe = core.tasks.subscribe({ onTaskChanged: (task) => resolveChanged?.(task) });
		await core.tasks.init();

		expect(
			(await runInProcessCli(["task", "edit", original.id, "--title", "Updated by watcher"], { cwd: testDir }))
				.exitCode,
		).toBe(0);
		const task = await withTimeout(changed, "real atomic CLI edit reconciliation", getPlatformTimeout(2000));
		expect(task.title).toBe("Updated by watcher");
	});
});
