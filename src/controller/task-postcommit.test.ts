import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Task } from "../model/types.ts";
import { Storage } from "../storage/storage.ts";
import { createUniqueTestDir, initializeFilesystemTestProject } from "../test/test-utils.ts";
import { Core } from "./agentic-workspace.ts";

let root: string;
let core: Core;
let storage: Storage;
const restore: Array<() => void> = [];

beforeEach(async () => {
	root = createUniqueTestDir("task-postcommit");
	await mkdir(root, { recursive: true });
	storage = Storage.open(root);
	core = new Core(root, { storage });
	await initializeFilesystemTestProject(core, "Task changes");
});

afterEach(async () => {
	for (const cleanup of restore.splice(0).reverse()) cleanup();
	await rm(root, { recursive: true, force: true });
});

function task(id: string, ordinal = 1000): Task {
	return {
		id,
		title: "Search needle",
		status: "To Do",
		done: false,
		ordinal,
		createdDate: "2026-10-10",
		labels: [],
		dependencies: [],
	};
}

describe("task post-commit operations", () => {
	it("delivers card configuration changes under lock and retains the commit on subscriber failure", async () => {
		await storage.createTask(task("TASK-1"));
		const originalLock = storage.withTaskLock.bind(storage);
		let locked = false;
		const lock = spyOn(storage, "withTaskLock").mockImplementation(async (target, operation) => {
			locked = true;
			try {
				return await originalLock(target, operation);
			} finally {
				locked = false;
			}
		});
		restore.push(() => lock.mockRestore());
		const lockStates: boolean[] = [];
		core.signals.subscribe("TasksChanged", () => {
			lockStates.push(locked);
			throw new Error("subscriber failed");
		});
		await expect(core.patchAgentConfiguration("card", { selectedPreset: "pi" }, "TASK-1")).rejects.toThrow(
			"Task TASK-1 was saved, but post-commit work failed",
		);
		expect(lockStates).toEqual([true]);
		expect(await core.getExactAgentConfiguration("card", "TASK-1")).toEqual({ selectedPreset: "pi" });
	});

	it("retains a move journal after partial failure and refuses replay through a fresh deletion", async () => {
		await storage.createTask(task("TASK-1"));
		await storage.createTask(task("TASK-2"));
		await storage.sessionStore().mutate("TASK-1", async (state) => {
			state.modes.plan = { sessions: [] };
		});
		const originalMove = core.moveModeSessions.bind(core);
		const move = spyOn(core, "moveModeSessions").mockImplementation(async (id, source, destination, record) => {
			if (id === "TASK-2") throw new Error("transfer failed");
			await originalMove(id, source, destination, record);
		});
		restore.push(() => move.mockRestore());
		await expect(core.modeDeletion.deleteMode("plan", { confirmed: true, moveToModeId: "build" })).rejects.toThrow(
			"transferred sessions from: TASK-1",
		);
		expect(await storage.modeDeletionJournal.read()).toMatchObject({
			source: "plan",
			destination: "build",
			tasks: ["TASK-1", "TASK-2"],
		});
		const bytes = await Bun.file(storage.modeDeletionJournal.path).text();
		expect((await core.getProjectModeCatalog()).profiles.plan).toBeDefined();
		await expect(core.modeDeletion.deleteMode("plan", { confirmed: true, moveToModeId: "build" })).rejects.toThrow();
		expect(move).toHaveBeenCalledTimes(2);
		expect(await Bun.file(storage.modeDeletionJournal.path).text()).toBe(bytes);
	});
	it("discards one mode without forgetting the task's other sessions", async () => {
		await storage.createTask(task("TASK-1"));
		const forgetMode = spyOn(core, "forgetModeSessions");
		const forgetTask = spyOn(core, "forgetTaskSessions");
		restore.push(
			() => forgetMode.mockRestore(),
			() => forgetTask.mockRestore(),
		);
		await core.modeDeletion.deleteMode("plan", { confirmed: true });
		expect(forgetMode).toHaveBeenCalledWith("TASK-1", "plan");
		expect(forgetTask).not.toHaveBeenCalled();
	});

	it("moves mode membership through the session owner without stopping or forgetting executions", async () => {
		await storage.createTask(task("TASK-1"));
		await storage.sessionStore().mutate("TASK-1", async (state) => {
			state.modes.plan = { sessions: [] };
		});
		const move = spyOn(core, "moveModeSessions");
		const stop = spyOn(core, "prepareTaskStop");
		const discard = spyOn(core, "discardModeSessions");
		const forget = spyOn(core, "forgetModeSessions");
		restore.push(
			() => move.mockRestore(),
			() => stop.mockRestore(),
			() => discard.mockRestore(),
			() => forget.mockRestore(),
		);
		await core.modeDeletion.deleteMode("plan", { confirmed: true, moveToModeId: "build" });
		expect(move).toHaveBeenCalledWith("TASK-1", "plan", "build", expect.objectContaining({ id: "TASK-1" }));
		expect(stop).not.toHaveBeenCalled();
		expect(discard).not.toHaveBeenCalled();
		expect(forget).not.toHaveBeenCalled();
		expect((await core.getProjectModeCatalog()).order).toEqual(["build"]);
	});

	it("rejects an invalid move destination before session or journal effects", async () => {
		await storage.createTask(task("TASK-1"));
		const move = spyOn(core, "moveModeSessions");
		const stop = spyOn(core, "prepareTaskStop");
		restore.push(
			() => move.mockRestore(),
			() => stop.mockRestore(),
		);
		for (const moveToModeId of ["plan", "missing"])
			await expect(core.modeDeletion.deleteMode("plan", { confirmed: true, moveToModeId })).rejects.toThrow();
		expect(move).not.toHaveBeenCalled();
		expect(stop).not.toHaveBeenCalled();
		expect(await storage.modeDeletionJournal.read()).toBeUndefined();
	});

	it("retains creation when a subscriber throws and delivers to later subscribers", async () => {
		const delivered: unknown[] = [];
		core.signals.subscribe("TasksChanged", () => {
			throw new Error("delivery failed");
		});
		core.signals.subscribe("TasksChanged", (changed) => delivered.push(changed));
		await expect(core.tasks.create({ title: "Retained" })).rejects.toThrow(
			"Task TASK-1 was saved, but post-commit notification failed",
		);
		expect((await core.tasks.getTask("TASK-1"))?.title).toBe("Retained");
		expect(delivered).toHaveLength(1);
	});

	it("retains creation when recovery receipt preparation fails", async () => {
		const receipt = spyOn(storage, "prepareCreatedTaskWrite").mockRejectedValue(new Error("receipt failed"));
		restore.push(() => receipt.mockRestore());
		const delivered: unknown[] = [];
		core.signals.subscribe("TasksChanged", (changed) => delivered.push(changed));
		await expect(core.tasks.create({ title: "Retained" })).rejects.toThrow("receipt failed");
		expect(delivered).toEqual([]);
		expect((await core.tasks.getTask("TASK-1"))?.title).toBe("Retained");
	});

	it("retains the first board write and stops the batch when its status hook fails", async () => {
		await storage.createTask(task("TASK-1"));
		await storage.createTask(task("TASK-2"));
		const marker = join(root, "batch-locked");
		const output = join(root, "hooks");
		const originalLock = storage.withTaskLocks.bind(storage);
		const lock = spyOn(storage, "withTaskLocks").mockImplementation(async (targets, operation) => {
			await writeFile(marker, "locked");
			try {
				return await originalLock(targets, operation);
			} finally {
				await rm(marker);
			}
		});
		restore.push(() => lock.mockRestore());
		const previous = process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
		process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
		restore.push(() => {
			if (previous === undefined) delete process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
			else process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = previous;
		});
		const config = await storage.loadConfig();
		if (!config) throw new Error("Expected project configuration");
		await storage.saveConfig({
			...config,
			onStatusChange: `test -e '${marker}' || exit 8; printf '%s\\n' "$TASK_ID" >> '${output}'; exit 7`,
		});
		await expect(
			core.moveTasksToStatus({ taskIds: ["TASK-1", "TASK-2"], targetStatus: "In Progress" }),
		).rejects.toThrow("Task TASK-1 was saved, but post-commit work failed");
		expect((await Bun.file(output).text()).trim().split("\n").sort()).toEqual(["TASK-1"]);
		expect((await storage.loadTasks()).map((entry) => entry.status)).toEqual(["In Progress", "To Do"]);
	});

	it("runs hooks and notifications under a single-task lock and reports committed hook failure", async () => {
		await storage.createTask(task("TASK-1"));
		const marker = join(root, "locked");
		const original = storage.withTaskLock.bind(storage);
		let locked = false;
		const lock = spyOn(storage, "withTaskLock").mockImplementation(async (target, operation) => {
			await writeFile(marker, "locked");
			locked = true;
			try {
				return await original(target, operation);
			} finally {
				locked = false;
				await rm(marker);
			}
		});
		restore.push(() => lock.mockRestore());
		core.signals.subscribe("TasksChanged", () => expect(locked).toBe(true));
		const previous = process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
		process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
		restore.push(() => {
			if (previous === undefined) delete process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
			else process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = previous;
		});
		const config = await storage.loadConfig();
		if (!config) throw new Error("Expected project configuration");
		await storage.saveConfig({ ...config, onStatusChange: `test -e '${marker}'` });
		await core.storage.withTaskLock("TASK-1", async (current) => {
			await core.tasks.edit({ ...current, status: "In Progress" });
		});
		await storage.saveConfig({ ...config, onStatusChange: "exit 7" });
		await expect(
			core.storage.withTaskLock("TASK-1", async (current) => {
				await core.tasks.edit({ ...current, status: "Done" });
			}),
		).rejects.toThrow("post-commit work failed");
		expect((await core.tasks.getTask("TASK-1"))?.status).toBe("Done");
	});

	it("rejects stale board placement before any batch writes", async () => {
		await storage.createTask(task("TASK-1", 1));
		await storage.createTask(task("TASK-2", 1));
		await storage.createTask({ ...task("TASK-3"), status: "In Progress" });
		const original = storage.withTaskLocks.bind(storage);
		const locks = spyOn(storage, "withTaskLocks").mockImplementation(async (targets, operation) => {
			const neighbor = await storage.loadTask("TASK-2");
			if (!neighbor) throw new Error("Missing neighbor");
			await storage.saveTask({ ...neighbor, status: "Done", milestone: "concurrent" });
			return await original(targets, operation);
		});
		restore.push(() => locks.mockRestore());
		await expect(
			core.moveTasksToStatus({
				taskIds: ["TASK-3"],
				targetStatus: "To Do",
				orderedTaskIds: ["TASK-1", "TASK-3", "TASK-2"],
			}),
		).rejects.toThrow("placement changed");
		expect(await storage.loadTask("TASK-2")).toMatchObject({ status: "Done", milestone: "concurrent" });
		expect(await storage.loadTask("TASK-1")).toMatchObject({ ordinal: 1 });
		expect(await storage.loadTask("TASK-3")).toMatchObject({ status: "In Progress" });
	});
});
