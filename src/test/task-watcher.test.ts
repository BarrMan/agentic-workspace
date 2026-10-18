import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { EventEmitter } from "node:events";
import * as nodeFs from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import * as mainWorktree from "../git/main-worktree.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { watchTasks } from "../utils/task-watcher.ts";
import {
	createUniqueTestDir,
	getPlatformTimeout,
	initializeTestProject,
	safeCleanup,
	withTimeout,
} from "./test-utils.ts";

const cliCommand = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; nothrow?: boolean } = {};
	const result = async () => {
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
		const exitCode = await runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err });
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		nothrow() {
			config.nothrow = true;
			return chain;
		},
		quiet() {
			return result();
		},
		async text() {
			return (await result()).stdout;
		},
	};
	return chain;
}

type WatchCallback = (eventType: string, filename: string | Buffer | null) => void;

function sampleTask(id: string, title: string, status = "To Do"): Task {
	return {
		id,
		title,
		status,
		assignee: [],
		createdDate: "2026-07-14 00:00",
		labels: [],
		dependencies: [],
		rawContent: "## Description\n\nWatcher fixture",
	};
}

async function taskFilePath(core: Core, id: string): Promise<string> {
	const taskDir = join(core.filesystem.tasksDir, id.toLowerCase());
	await mkdir(taskDir, { recursive: true });
	return join(taskDir, "task.md");
}

function gateFirstTaskRead(core: Core): { captured: Promise<void>; release: () => void; restore: () => void } {
	const loadTask = core.filesystem.loadTask.bind(core.filesystem);
	let resolveCaptured: () => void = () => {};
	const captured = new Promise<void>((resolve) => {
		resolveCaptured = resolve;
	});
	let releaseRead: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		releaseRead = resolve;
	});
	let first = true;
	core.filesystem.loadTask = async (...args) => {
		if (!first) return await loadTask(...args);
		first = false;
		try {
			const result = await loadTask(...args);
			resolveCaptured();
			await held;
			return result;
		} catch (error) {
			resolveCaptured();
			await held;
			throw error;
		}
	};
	return { captured, release: releaseRead, restore: () => (core.filesystem.loadTask = loadTask) };
}

function gateFirstTaskDirectoryRead(core: Core): { captured: Promise<void>; release: () => void; restore: () => void } {
	const listTasks = core.filesystem.listTasks.bind(core.filesystem);
	let resolveCaptured: () => void = () => {};
	const captured = new Promise<void>((resolve) => {
		resolveCaptured = resolve;
	});
	let releaseRead: () => void = () => {};
	const held = new Promise<void>((resolve) => {
		releaseRead = resolve;
	});
	let first = true;
	core.filesystem.listTasks = async (...args) => {
		if (!first) return await listTasks(...args);
		first = false;
		try {
			const result = await listTasks(...args);
			resolveCaptured();
			await held;
			return result;
		} catch (error) {
			resolveCaptured();
			await held;
			throw error;
		}
	};
	return { captured, release: releaseRead, restore: () => (core.filesystem.listTasks = listTasks) };
}

describe("task watcher reconciliation", () => {
	let testDir: string;
	let core: Core;
	let watcherCallback: WatchCallback;
	let watcherCallbacks: WatchCallback[];
	let watchSpy: ReturnType<typeof spyOn>;
	let stopWatcher: (() => void) | undefined;
	let armedIdle: Promise<void> | undefined;
	let resolveIdle: (() => void) | undefined;
	const armIdle = () => {
		armedIdle = new Promise<void>((resolve) => {
			resolveIdle = resolve;
		});
		return armedIdle;
	};
	const signalIdle = () => {
		resolveIdle?.();
		resolveIdle = undefined;
	};

	beforeEach(async () => {
		testDir = createUniqueTestDir("task-watcher");
		stopWatcher = undefined;
		watcherCallbacks = [];
		armedIdle = undefined;
		resolveIdle = undefined;
		core = new Core(testDir);
		await core.filesystem.ensureAgenticWorkspaceStructure();
		watchSpy = spyOn(nodeFs, "watch").mockImplementation(((
			_path: Parameters<typeof nodeFs.watch>[0],
			...args: unknown[]
		) => {
			const callback = args.findLast((argument) => typeof argument === "function");
			if (typeof callback !== "function") throw new Error("Expected task watcher callback");
			watcherCallback = callback as WatchCallback;
			watcherCallbacks.push(watcherCallback);
			const watcher = new EventEmitter() as EventEmitter & { close(): void };
			watcher.close = () => {};
			return watcher as unknown as nodeFs.FSWatcher;
		}) as typeof nodeFs.watch);
	});

	it("classifies equivalent events identically on checkout and canonical roots", async () => {
		const mainRoot = join(testDir, "main-worktree");
		const resolveMainRoot = spyOn(mainWorktree, "resolveMainWorktreeRoot").mockResolvedValue(mainRoot);
		const filePath = await taskFilePath(core, "TASK-199");
		await Bun.write(filePath, serializeTask(sampleTask("TASK-199", "Parity")));
		const initial = await core.filesystem.loadTask("TASK-199");
		if (!initial) throw new Error("Expected parity fixture task");
		const artifacts: string[] = [];
		let idleCount = 0;
		const idle = () => {
			idleCount += 1;
		};
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: idle,
				onArtifactChanged(event) {
					artifacts.push(event.path);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;
		await Promise.resolve();
		await Promise.resolve();
		expect(watcherCallbacks).toHaveLength(2);

		const cases: { event: string | null; kind: "directory" | "record" | "artifact" | "ignore"; path?: string }[] = [
			{ event: null, kind: "directory" },
			{ event: "TASK-199", kind: "directory" },
			{ event: "TASK-199/task.md", kind: "record" },
			{ event: "TASK-199/.artifacts.json", kind: "artifact", path: ".artifacts.json" },
			{ event: "TASK-199/.task-atomic-write", kind: "ignore" },
			{ event: "TASK-199/notes/nested.txt", kind: "artifact", path: "notes/nested.txt" },
		];
		for (const testCase of cases) {
			for (const callback of watcherCallbacks) {
				const rootIdleCount = idleCount;
				const rootArtifactCount = artifacts.length;
				callback("rename", testCase.event);
				if (testCase.kind === "directory" || testCase.kind === "record") {
					const deadline = Date.now() + getPlatformTimeout(1200);
					while (idleCount < rootIdleCount + 1 && Date.now() < deadline)
						await new Promise((resolve) => setTimeout(resolve, 5));
					expect(idleCount).toBe(rootIdleCount + 1);
				} else if (testCase.kind === "artifact") {
					expect(artifacts.slice(rootArtifactCount)).toEqual(testCase.path ? [testCase.path] : []);
				} else {
					await new Promise((resolve) => setTimeout(resolve, 20));
					expect(idleCount).toBe(rootIdleCount);
					expect(artifacts).toHaveLength(rootArtifactCount);
				}
			}
		}
		handle.stop();
		resolveMainRoot.mockRestore();
	});

	afterEach(async () => {
		stopWatcher?.();
		if (armedIdle)
			await withTimeout(armedIdle, "watcher idle during teardown", getPlatformTimeout(2000)).catch(() => {});
		watchSpy.mockRestore();
		await safeCleanup(testDir);
	});

	it("recovers a partial create after one filesystem event and publishes it once", async () => {
		const fileName = "task-1/task.md";
		const filePath = await taskFilePath(core, "task-1");
		const added: Task[] = [];
		const handle = watchTasks(core, {
			onReconciliationIdle: signalIdle,
			onTaskAdded(task) {
				added.push(task);
			},
		});
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-1\n");
		const firstRead = gateFirstTaskRead(core);
		const idle = armIdle();
		watcherCallback("rename", fileName);
		await withTimeout(firstRead.captured, "partial task create first read", getPlatformTimeout(1200));
		firstRead.restore();
		await Bun.write(filePath, serializeTask(sampleTask("task-1", "Recovered create")));
		firstRead.release();

		await withTimeout(idle, "partial task create reconciliation", getPlatformTimeout(1200));
		expect(added.map((task) => task.title)).toEqual(["Recovered create"]);

		const duplicateIdle = armIdle();
		watcherCallback("change", fileName);
		await withTimeout(duplicateIdle, "duplicate task create reconciliation", getPlatformTimeout(1200));
		expect(added).toHaveLength(1);
	});

	it("discovers a partial atomic create from one temporary-file event", async () => {
		const filePath = await taskFilePath(core, "task-7");
		let resolveAdded: ((task: Task) => void) | undefined;
		const added = new Promise<Task>((resolve) => {
			resolveAdded = resolve;
		});
		const handle = watchTasks(core, {
			onReconciliationIdle: signalIdle,
			onTaskAdded(task) {
				resolveAdded?.(task);
			},
		});
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-7\n");
		const firstRead = gateFirstTaskDirectoryRead(core);
		const idle = armIdle();
		watcherCallback("rename", ".task-7.atomic-write");
		await withTimeout(firstRead.captured, "partial atomic task first read", getPlatformTimeout(1200));
		firstRead.restore();
		await Bun.write(filePath, serializeTask(sampleTask("task-7", "Atomic create")));
		firstRead.release();

		await withTimeout(idle, "partial atomic task reconciliation", getPlatformTimeout(1200));
		const task = await added;
		expect(task.title).toBe("Atomic create");
	});

	it("recovers a partial edit after one filesystem event", async () => {
		const original = sampleTask("task-2", "Original title");
		const fileName = "task-2/task.md";
		const filePath = await taskFilePath(core, "task-2");
		await Bun.write(filePath, serializeTask(original));
		const initial = await core.filesystem.loadTask(original.id);
		if (!initial) throw new Error("Expected initial task");

		let resolveChanged: ((task: Task) => void) | undefined;
		const changed = new Promise<Task>((resolve) => {
			resolveChanged = resolve;
		});
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: signalIdle,
				onTaskChanged(task) {
					resolveChanged?.(task);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-2\ntitle: Original title\n");
		const firstRead = gateFirstTaskRead(core);
		const idle = armIdle();
		watcherCallback("change", fileName);
		await withTimeout(firstRead.captured, "partial task edit first read", getPlatformTimeout(1200));
		firstRead.restore();
		await Bun.write(filePath, serializeTask(sampleTask("task-2", "Edited title", "In Progress")));
		firstRead.release();

		await withTimeout(idle, "partial task edit reconciliation", getPlatformTimeout(1200));
		const task = await changed;
		expect(task.title).toBe("Edited title");
		expect(task.status).toBe("In Progress");
	});

	it("confirms archive and delete absence from one event without duplicate removals", async () => {
		const archiveDir = join(testDir, "agentic-workspace", "archive", "tasks");
		await mkdir(archiveDir, { recursive: true });
		const tasks = [sampleTask("task-3", "Archived"), sampleTask("task-4", "Deleted")];
		const paths = await Promise.all(tasks.map((task) => taskFilePath(core, task.id)));
		await Promise.all(paths.map((path, index) => Bun.write(path, serializeTask(tasks[index] as Task))));
		const initialTasks = await core.filesystem.listTasks();
		const removed: string[] = [];
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: signalIdle,
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			initialTasks,
		);
		stopWatcher = handle.stop;

		const removalIdle = armIdle();
		await rename(paths[0] as string, join(archiveDir, "task-3"));
		watcherCallback("rename", "task-3/task.md");
		await unlink(paths[1] as string);
		watcherCallback("rename", "task-4/task.md");

		await withTimeout(removalIdle, "archive and delete reconciliation", getPlatformTimeout(1500));
		const duplicateIdle = armIdle();
		watcherCallback("rename", "task-3/task.md");
		watcherCallback("rename", "task-4/task.md");
		await withTimeout(duplicateIdle, "duplicate removal reconciliation", getPlatformTimeout(1200));
		expect(removed.sort()).toEqual(["TASK-3", "TASK-4"]);
	});

	it("bounds retries for permanently incomplete content and stops pending work", async () => {
		const fileName = "task-5/task.md";
		const filePath = await taskFilePath(core, "task-5");
		await Bun.write(filePath, "---\nid: task-5\n");
		const publications: string[] = [];
		const handle = watchTasks(core, {
			onReconciliationIdle: signalIdle,
			onTaskAdded: (task) => {
				publications.push(task.id);
			},
			onTaskChanged: (task) => {
				publications.push(task.id);
			},
			onTaskRemoved: (taskId) => {
				publications.push(taskId);
			},
		});
		stopWatcher = handle.stop;

		const retryIdle = armIdle();
		watcherCallback("rename", fileName);
		await withTimeout(retryIdle, "incomplete task reconciliation retries", getPlatformTimeout(1200));
		expect(publications).toEqual([]);

		const stoppedIdle = armIdle();
		watcherCallback("change", fileName);
		handle.stop();
		await withTimeout(stoppedIdle, "stopped incomplete task reconciliation", getPlatformTimeout(1200));
		expect(publications).toEqual([]);
		await Bun.write(filePath, serializeTask(sampleTask("task-5", "Too late")));
		expect(publications).toEqual([]);
	});

	it("does not remove an existing task when its content is malformed", async () => {
		const task = sampleTask("task-9", "Malformed content");
		const fileName = "task-9/task.md";
		const filePath = await taskFilePath(core, "task-9");
		await Bun.write(filePath, serializeTask(task));
		const initial = await core.filesystem.loadTask(task.id);
		if (!initial) throw new Error("Expected initial task");

		const removed: string[] = [];
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: signalIdle,
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-9\ntitle: [unterminated\n---\n");
		const idle = armIdle();
		watcherCallback("change", fileName);
		await withTimeout(idle, "malformed task reconciliation", getPlatformTimeout(1200));

		expect(removed).toEqual([]);
	});

	it("does not remove an existing task after persistent read failures", async () => {
		const task = sampleTask("task-10", "Unreadable content");
		const filePath = await taskFilePath(core, task.id);
		await Bun.write(filePath, serializeTask(task));
		const initial = await core.filesystem.loadTask(task.id);
		if (!initial) throw new Error("Expected initial task");
		const loadTaskSpy = spyOn(core.filesystem, "loadTask").mockImplementation(async () => {
			return null;
		});
		const removed: string[] = [];
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: signalIdle,
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		const idle = armIdle();
		watcherCallback("change", "task-10/task.md");
		await withTimeout(idle, "persistent task read failure reconciliation", getPlatformTimeout(1200));
		loadTaskSpy.mockRestore();

		expect(removed).toEqual([]);
	});

	it("preserves malformed files during directory reconciliation and removes true absence", async () => {
		const task = sampleTask("task-11", "Directory reconciliation");
		const filePath = await taskFilePath(core, "task-11");
		await Bun.write(filePath, serializeTask(task));
		const initial = await core.filesystem.loadTask(task.id);
		if (!initial) throw new Error("Expected initial task");
		const removed: string[] = [];
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: signalIdle,
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		await Bun.write(filePath, "---\nid: task-11\ntitle: [unterminated\n---\n");
		const malformedIdle = armIdle();
		watcherCallback("rename", ".atomic-write");
		await withTimeout(malformedIdle, "malformed directory reconciliation", getPlatformTimeout(1200));
		expect(removed).toEqual([]);

		await unlink(filePath);
		const removalIdle = armIdle();
		watcherCallback("rename", ".atomic-write");
		await withTimeout(removalIdle, "directory reconciliation removal", getPlatformTimeout(1500));
		expect(removed).toEqual(["TASK-11"]);
	});

	it("does not reconcile branch-only tasks from the current checkout watcher", async () => {
		const removed: string[] = [];
		const branchTask = { ...sampleTask("task-8", "Other branch"), branch: "feature/other-worktree" };
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: signalIdle,
				onTaskRemoved(taskId) {
					removed.push(taskId);
				},
			},
			[branchTask],
		);
		stopWatcher = handle.stop;

		const idle = armIdle();
		watcherCallback("rename", ".unrelated-atomic-write");
		await withTimeout(idle, "branch-only directory reconciliation", getPlatformTimeout(1200));
		expect(removed).toEqual([]);
	});

	it("continues reconciling when the idle observer throws", async () => {
		const filePath = await taskFilePath(core, "task-13");
		await Bun.write(filePath, serializeTask(sampleTask("task-13", "Observer failure")));
		const added: Task[] = [];
		const handle = watchTasks(core, {
			onReconciliationIdle() {
				signalIdle();
				throw new Error("observer failure");
			},
			onTaskAdded(task) {
				added.push(task);
			},
		});
		stopWatcher = handle.stop;

		const idle = armIdle();
		watcherCallback("rename", "task-13/task.md");
		await withTimeout(idle, "throwing idle observer reconciliation", getPlatformTimeout(1200));
		expect(added.map((task) => task.id)).toEqual(["TASK-13"]);
		const duplicateIdle = armIdle();
		watcherCallback("change", "task-13/task.md");
		await withTimeout(duplicateIdle, "reconciliation after throwing idle observer", getPlatformTimeout(1200));
		expect(added).toHaveLength(1);
	});

	it("reconciles an atomic CLI edit through a real filesystem watcher", async () => {
		watchSpy.mockRestore();
		await initializeTestProject(core, "Real task watcher");
		const original = sampleTask("task-6", "Real watcher");
		const filePath = await taskFilePath(core, "task-6");
		await Bun.write(filePath, serializeTask(original));
		const initial = await core.filesystem.loadTask(original.id);
		if (!initial) throw new Error("Expected real watcher task");

		let resolveChanged: ((task: Task) => void) | undefined;
		const changed = new Promise<Task>((resolve) => {
			resolveChanged = resolve;
		});
		const handle = watchTasks(
			core,
			{
				onReconciliationIdle: signalIdle,
				onTaskChanged(task) {
					resolveChanged?.(task);
				},
			},
			[initial],
		);
		stopWatcher = handle.stop;

		const idle = armIdle();
		await $`${cliCommand} task edit task-6 --title ${"Updated by watcher"}`.cwd(testDir).quiet();
		await withTimeout(idle, "real atomic CLI edit reconciliation", getPlatformTimeout(2000));
		const task = await changed;
		expect(task.title).toBe("Updated by watcher");
	});
});
