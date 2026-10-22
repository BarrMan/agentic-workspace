import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSession, SessionState } from "../model/session/types.ts";
import type { Task } from "../model/types.ts";
import { Storage } from "../storage/storage.ts";
import { createUniqueTestDir, initializeFilesystemTestProject } from "../test/test-utils.ts";
import { initializeAgentConfiguration } from "./agent-configuration.ts";
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
		ordinal,
		createdDate: "2026-10-10",
		labels: [],
		dependencies: [],
	};
}

describe("task post-commit operations", () => {
	it("delivers card configuration changes after unlock and retains the commit on subscriber failure", async () => {
		await core.createTask(task("TASK-1"));
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
		await expect(core.patchAgentConfiguration("card", { selectedPreset: "pi" }, "TASK-1")).rejects.toMatchObject({
			committedTaskIds: ["TASK-1"],
			committedResult: { selectedPreset: "pi" },
		});
		expect(lockStates).toEqual([false]);
		expect(await core.getExactAgentConfiguration("card", "TASK-1")).toEqual({ selectedPreset: "pi" });
	});

	it("retains a move journal after partial failure and refuses replay through a fresh deletion", async () => {
		await core.createTask(task("TASK-1"));
		await core.createTask(task("TASK-2"));
		await initializeAgentConfiguration(core, "project");
		const originalMove = core.sessionApplication.moveModeSessions.bind(core.sessionApplication);
		const move = spyOn(core.sessionApplication, "moveModeSessions").mockImplementation(
			async (id, source, destination) => {
				if (id === "TASK-2") throw new Error("transfer failed");
				await originalMove(id, source, destination);
			},
		);
		restore.push(() => move.mockRestore());
		await expect(core.deleteMode("plan", { confirmed: true, moveToModeId: "build" })).rejects.toMatchObject({
			committedTaskIds: ["TASK-1"],
		});
		const releases: Array<() => Promise<void>> = [];
		try {
			releases.push(await storage.claimModeAdmission("plan"));
			releases.push(await storage.claimModeAdmission("build"));
			releases.push(await storage.claimTaskAdmission("TASK-1"));
			releases.push(await storage.claimTaskAdmission("TASK-2"));
		} finally {
			for (const release of releases.reverse()) await release();
		}
		expect(await storage.modeDeletionJournal.read()).toMatchObject({
			source: "plan",
			destination: "build",
			tasks: ["TASK-1", "TASK-2"],
		});
		const bytes = await Bun.file(storage.modeDeletionJournal.path).text();
		expect((await core.getProjectModeCatalog()).profiles.plan).toBeDefined();
		await expect(core.deleteMode("plan", { confirmed: true, moveToModeId: "build" })).rejects.toThrow();
		expect(move).toHaveBeenCalledTimes(2);
		expect(await Bun.file(storage.modeDeletionJournal.path).text()).toBe(bytes);
	});
	it("discards one mode without forgetting the task's other sessions", async () => {
		await core.createTask(task("TASK-1"));
		await initializeAgentConfiguration(core, "project");
		const forgetMode = spyOn(core.sessionApplication, "forgetModeSessions");
		const forgetTask = spyOn(core.sessionApplication, "forgetTaskSessions");
		restore.push(
			() => forgetMode.mockRestore(),
			() => forgetTask.mockRestore(),
		);
		await core.deleteMode("plan", { confirmed: true });
		expect(forgetMode).toHaveBeenCalledWith("TASK-1", "plan");
		expect(forgetTask).not.toHaveBeenCalled();
	});

	it("moves mode membership through the session owner without stopping or forgetting executions", async () => {
		await core.createTask(task("TASK-1"));
		await initializeAgentConfiguration(core, "project");
		const move = spyOn(core.sessionApplication, "moveModeSessions");
		const stop = spyOn(core.sessionApplication, "prepareTaskStop");
		const discard = spyOn(core.sessionApplication, "discardModeSessions");
		const forget = spyOn(core.sessionApplication, "forgetModeSessions");
		restore.push(
			() => move.mockRestore(),
			() => stop.mockRestore(),
			() => discard.mockRestore(),
			() => forget.mockRestore(),
		);
		await core.deleteMode("plan", { confirmed: true, moveToModeId: "build" });
		expect(move).toHaveBeenCalledWith("TASK-1", "plan", "build");
		expect(stop).not.toHaveBeenCalled();
		expect(discard).not.toHaveBeenCalled();
		expect(forget).not.toHaveBeenCalled();
		expect((await core.getProjectModeCatalog()).order).toEqual(["build"]);
	});

	it("rejects an invalid move destination before session or journal effects", async () => {
		await core.createTask(task("TASK-1"));
		await initializeAgentConfiguration(core, "project");
		const move = spyOn(core.sessionApplication, "moveModeSessions");
		const stop = spyOn(core.sessionApplication, "prepareTaskStop");
		restore.push(
			() => move.mockRestore(),
			() => stop.mockRestore(),
		);
		for (const moveToModeId of ["plan", "missing"])
			await expect(core.deleteMode("plan", { confirmed: true, moveToModeId })).rejects.toThrow();
		expect(move).not.toHaveBeenCalled();
		expect(stop).not.toHaveBeenCalled();
		expect(await storage.modeDeletionJournal.read()).toBeUndefined();
	});

	it("notifies only successful partial bulk writes and preserves the primary error", async () => {
		await core.createTask(task("TASK-1"));
		await core.createTask(task("TASK-2"));
		const tasks = await storage.loadTasks();
		const originalSave = storage.saveTask.bind(storage);
		const failure = new Error("write failed");
		const save = spyOn(storage, "saveTask").mockImplementation(async (entry, options) => {
			if (entry.id === "TASK-2") throw failure;
			return await originalSave(entry, options);
		});
		restore.push(() => save.mockRestore());
		const delivered: unknown[] = [];
		core.signals.subscribe("TasksChanged", (changed) => delivered.push(changed));
		await expect(core.updateTasksBulk(tasks.map((entry) => ({ ...entry, title: "Committed" })))).rejects.toBe(failure);
		expect(failure).toMatchObject({ committedTaskIds: ["TASK-1"] });
		expect(delivered).toMatchObject([{ id: "TASK-1" }]);
	});

	it("refuses every non-stopped archive observation without stopping and admits positive stopped evidence", async () => {
		await core.createTask(task("TASK-1"));
		const record: AgentSession = {
			id: "session-1",
			taskId: "TASK-1",
			preset: "test",
			tmuxName: "test-session",
			cwd: root,
			createdAt: "2026-10-10T00:00:00.000Z",
			outputPath: "",
			bootstrapPath: "",
		};
		await core.sessionApplication.store.mutate("TASK-1", async (state) => {
			state.modes.build = { sessions: [record], activeSessionId: record.id };
		});
		let state: SessionState = "running";
		const observed = spyOn(core.sessionApplication, "readObserved").mockImplementation(async () => ({
			record,
			snapshot: { state, activity: "unknown", idleSince: null },
		}));
		const stop = spyOn(core.sessionApplication, "prepareTaskStop");
		restore.push(
			() => observed.mockRestore(),
			() => stop.mockRestore(),
		);
		const delivered: unknown[] = [];
		core.signals.subscribe("TasksChanged", (changed) => delivered.push(changed));
		for (const next of ["running", "parked", "starting", "unknown"] as const) {
			state = next;
			await expect(core.archiveTask("TASK-1")).rejects.toThrow("not positively stopped");
			expect(await storage.loadTask("TASK-1")).not.toBeNull();
		}
		expect(delivered).toEqual([]);
		expect(stop).not.toHaveBeenCalled();
		state = "stopped";
		expect((await core.archiveTask("TASK-1")).success).toBe(true);
		expect(delivered).toEqual(["TASK-1"]);
		expect(stop).not.toHaveBeenCalled();
	});
	it("searches completed by default and archived only on request, without changing active listing", async () => {
		await core.createTask(task("TASK-1"));
		await core.createTask(task("TASK-2"));
		await core.createTask(task("TASK-3"));
		await core.markTaskDone("TASK-2");
		await core.completeTask("TASK-2");
		await core.archiveTask("TASK-3");
		const ids = async (includeArchived?: boolean) =>
			(await core.searchPersistently({ query: "needle", includeArchived }))
				.flatMap((result) => (result.task ? [result.task.id] : []))
				.sort();
		expect(await ids()).toEqual(["TASK-1", "TASK-2"]);
		expect(await ids(true)).toEqual(["TASK-1", "TASK-2", "TASK-3"]);
		expect((await core.loadTasks()).map((entry) => entry.id)).toEqual(["TASK-1"]);
	});

	it("publishes creation, edits, completion, archive and deletion, but no failed/no-op changes", async () => {
		const delivered: string[] = [];
		core.signals.subscribe("TasksChanged", (changed) =>
			delivered.push(typeof changed === "string" ? changed : (changed as Task).id),
		);
		await core.createTaskFromInput({ title: "Created" });
		await core.updateTaskFromInput("TASK-1", { title: "Edited" });
		await core.updateTaskFromInput("TASK-1", { title: "Edited" });
		await expect(core.updateTaskFromInput("TASK-1", { status: "Invalid" })).rejects.toThrow();
		await core.markTaskDone("TASK-1");
		await core.markTaskDone("TASK-1");
		await core.completeTask("TASK-1");
		await core.createTask(task("TASK-2"));
		await core.archiveTask("TASK-2");
		await core.deleteTask("TASK-2");
		expect(delivered).toEqual(["TASK-1", "TASK-1", "TASK-1", "TASK-1", "TASK-2", "TASK-2", "TASK-2"]);
	});

	it("retains creation when a subscriber throws and delivers to later subscribers", async () => {
		const delivered: unknown[] = [];
		core.signals.subscribe("TasksChanged", () => {
			throw new Error("delivery failed");
		});
		core.signals.subscribe("TasksChanged", (changed) => delivered.push(changed));
		await expect(core.createTaskFromInput({ title: "Retained" })).rejects.toMatchObject({
			committedTaskIds: ["TASK-1"],
			committedResult: { task: { id: "TASK-1" } },
		});
		expect((await core.getTask("TASK-1"))?.title).toBe("Retained");
		expect(delivered).toHaveLength(1);
	});

	it("publishes a retained creation when recovery receipt preparation fails", async () => {
		const receipt = spyOn(core, "prepareCreatedTaskWrite").mockRejectedValue(new Error("receipt failed"));
		restore.push(() => receipt.mockRestore());
		const delivered: unknown[] = [];
		core.signals.subscribe("TasksChanged", (changed) => delivered.push(changed));
		await expect(core.createTaskFromInput({ title: "Retained" })).rejects.toMatchObject({
			committedTaskIds: ["TASK-1"],
		});
		expect(delivered).toEqual(["TASK-1"]);
		expect((await core.getTask("TASK-1"))?.title).toBe("Retained");
	});

	it("runs every board status hook after batch unlock even when hooks fail", async () => {
		await core.createTask(task("TASK-1"));
		await core.createTask(task("TASK-2"));
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
			onStatusChange: `test ! -e '${marker}' || exit 8; printf '%s\\n' "$TASK_ID" >> '${output}'; exit 7`,
		});
		await expect(
			core.moveTasksToStatus({ taskIds: ["TASK-1", "TASK-2"], targetStatus: "In Progress" }),
		).rejects.toMatchObject({ committedTaskIds: ["TASK-1", "TASK-2"] });
		expect((await Bun.file(output).text()).trim().split("\n").sort()).toEqual(["TASK-1", "TASK-2"]);
		expect((await storage.loadTasks()).map((entry) => entry.status)).toEqual(["In Progress", "In Progress"]);
	});

	it("runs hooks and notifications after a single-task lock is released and reports committed hook failure", async () => {
		await core.createTask(task("TASK-1"));
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
		core.signals.subscribe("TasksChanged", () => expect(locked).toBe(false));
		const previous = process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
		process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = "1";
		restore.push(() => {
			if (previous === undefined) delete process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK;
			else process.env.AGENTIC_WORKSPACE_ALLOW_STATUS_HOOK = previous;
		});
		const config = await storage.loadConfig();
		if (!config) throw new Error("Expected project configuration");
		await storage.saveConfig({ ...config, onStatusChange: `test ! -e '${marker}'` });
		await core.updateTaskFromInput("TASK-1", { status: "In Progress" });
		await storage.saveConfig({ ...config, onStatusChange: "exit 7" });
		await expect(core.markTaskDone("TASK-1")).rejects.toMatchObject({
			committedTaskIds: ["TASK-1"],
			committedResult: { changed: true, task: { status: "Done" } },
		});
		expect((await core.getTask("TASK-1"))?.status).toBe("Done");
	});

	it("rejects stale board placement before any batch writes", async () => {
		await core.createTask(task("TASK-1", 1));
		await core.createTask(task("TASK-2", 1));
		await core.createTask({ ...task("TASK-3"), status: "In Progress" });
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

	it("publishes bulk commits after locks release and attempts every subscriber", async () => {
		await core.createTask(task("TASK-1"));
		await core.createTask(task("TASK-2"));
		const tasks = await storage.loadTasks();
		const originalLock = storage.withTaskLocks.bind(storage);
		let locked = false;
		const locks = spyOn(storage, "withTaskLocks").mockImplementation(async (targets, operation) => {
			locked = true;
			try {
				return await originalLock(targets, operation);
			} finally {
				locked = false;
			}
		});
		restore.push(() => locks.mockRestore());
		const delivered: string[] = [];
		core.signals.subscribe("TasksChanged", () => {
			throw new Error("first subscriber");
		});
		core.signals.subscribe("TasksChanged", (changed) => {
			expect(locked).toBe(false);
			delivered.push((changed as Task).id);
		});
		await expect(core.updateTasksBulk(tasks.map((entry) => ({ ...entry, title: "Committed" })))).rejects.toMatchObject({
			committedTaskIds: ["TASK-1", "TASK-2"],
		});
		expect(delivered.sort()).toEqual(["TASK-1", "TASK-2"]);
		expect((await storage.loadTasks()).map((entry) => entry.title)).toEqual(["Committed", "Committed"]);
	});
});
