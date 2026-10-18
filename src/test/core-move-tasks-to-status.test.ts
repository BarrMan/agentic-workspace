import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let core: Core;

const FIXED_DATE = "2025-01-01 00:00";

const buildTask = (id: string, status: string, ordinal?: number, overrides: Partial<Task> = {}): Task => ({
	id,
	title: `Task ${id}`,
	status,
	assignee: [],
	createdDate: FIXED_DATE,
	labels: [],
	dependencies: [],
	...(ordinal !== undefined ? { ordinal } : {}),
	...overrides,
});

const createTasks = async (tasks: Array<[string, string, number?]>) => {
	for (const [id, status, ordinal] of tasks) {
		await core.createTask(buildTask(id, status, ordinal));
	}
};

beforeEach(async () => {
	TEST_DIR = createUniqueTestDir("move-tasks-to-status");
	await mkdir(TEST_DIR, { recursive: true });
	core = new Core(TEST_DIR);
	await initializeFilesystemTestProject(core, "Batch Move Test Project");
});

afterEach(async () => {
	await safeCleanup(TEST_DIR);
});

describe("Core.moveTasksToStatus", () => {
	it("moves every task to the target status", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "To Do", 2000],
			["task-3", "To Do", 3000],
		]);

		const result = await core.moveTasksToStatus({
			taskIds: ["task-1", "task-3"],
			targetStatus: "In Progress",
		});

		expect(result.failures).toHaveLength(0);
		expect(result.movedTasks.map((task) => task.id)).toEqual(["TASK-1", "TASK-3"]);
		expect((await coreFileSystem(core).loadTask("task-1"))?.status).toBe("In Progress");
		expect((await coreFileSystem(core).loadTask("task-3"))?.status).toBe("In Progress");
		expect((await coreFileSystem(core).loadTask("task-2"))?.status).toBe("To Do");
	});

	it("appends the moved tasks after the tasks already in the target column", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "To Do", 2000],
			["task-3", "In Progress", 5000],
		]);

		await core.moveTasksToStatus({
			taskIds: ["task-2", "task-1"],
			targetStatus: "In Progress",
		});

		const existing = await coreFileSystem(core).loadTask("task-3");
		const first = await coreFileSystem(core).loadTask("task-2");
		const second = await coreFileSystem(core).loadTask("task-1");

		expect(existing?.ordinal).toBe(5000);
		expect(first?.ordinal).toBeGreaterThan(5000);
		expect(second?.ordinal).toBeGreaterThan(first?.ordinal ?? 0);
	});

	it("moves the tasks that resolve and reports the ones that do not", async () => {
		await createTasks([["task-1", "To Do", 1000]]);

		const result = await core.moveTasksToStatus({
			taskIds: ["task-1", "task-404"],
			targetStatus: "Done",
		});

		expect(result.movedTasks.map((task) => task.id)).toEqual(["TASK-1"]);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0]?.taskId).toBe("task-404");
		expect((await coreFileSystem(core).loadTask("task-1"))?.status).toBe("Done");
	});

	it("ignores a repeated task ID", async () => {
		await createTasks([["task-1", "To Do", 1000]]);

		const result = await core.moveTasksToStatus({
			taskIds: ["task-1", "TASK-1"],
			targetStatus: "Done",
		});

		expect(result.movedTasks).toHaveLength(1);
		expect(result.failures).toHaveLength(0);
	});

	it("leaves a task that is already in the target status untouched", async () => {
		await createTasks([["task-1", "Done", 1000]]);

		const result = await core.moveTasksToStatus({
			taskIds: ["task-1"],
			targetStatus: "Done",
		});

		expect(result.failures).toHaveLength(0);
		expect(result.changedTasks).toHaveLength(0);
		expect((await coreFileSystem(core).loadTask("task-1"))?.ordinal).toBe(1000);
	});

	it("keeps an already-in-status task in place in a mixed batch", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-2", "In Progress", 500],
			["task-3", "In Progress", 1500],
		]);

		const result = await core.moveTasksToStatus({
			taskIds: ["task-1", "task-2"],
			targetStatus: "In Progress",
		});

		expect(result.failures).toHaveLength(0);
		// task-2 already lives in the column, so nothing about it moves.
		expect((await coreFileSystem(core).loadTask("task-2"))?.ordinal).toBe(500);
		expect(result.changedTasks.map((task) => task.id)).toEqual(["TASK-1"]);
		expect((await coreFileSystem(core).loadTask("task-1"))?.ordinal ?? 0).toBeGreaterThan(1500);
	});

	it("applies a named lane to an already-in-status task without touching its ordinal", async () => {
		await createTasks([["task-1", "In Progress", 500]]);

		const result = await core.moveTasksToStatus({
			taskIds: ["task-1"],
			targetStatus: "In Progress",
			targetMilestone: "Release 1",
		});

		expect(result.failures).toHaveLength(0);
		const task = await coreFileSystem(core).loadTask("task-1");
		expect(task?.milestone).toBe("Release 1");
		expect(task?.ordinal).toBe(500);
	});

	it("appends after ordinal-less tasks the way the board renders them", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-3", "In Progress", 1000],
			["task-4", "In Progress"],
		]);

		await core.moveTasksToStatus({
			taskIds: ["task-1"],
			targetStatus: "In Progress",
		});

		// task-4 had no ordinal and rendered last, so the appended task lands after it.
		const withoutOrdinal = await coreFileSystem(core).loadTask("task-4");
		const appended = await coreFileSystem(core).loadTask("task-1");
		expect(withoutOrdinal?.ordinal ?? 0).toBeGreaterThan(1000);
		expect(appended?.ordinal ?? 0).toBeGreaterThan(withoutOrdinal?.ordinal ?? 0);
	});

	it("treats a non-finite ordinal as missing instead of poisoning the append", async () => {
		await createTasks([
			["task-1", "To Do", 1000],
			["task-3", "In Progress", 1000],
			["task-4", "In Progress", 2000],
		]);
		const corrupt = await coreFileSystem(core).loadTask("task-4");
		const rawPath = corrupt?.filePath ?? "";
		const raw = await Bun.file(rawPath).text();
		await Bun.write(rawPath, raw.replace(/^ordinal: .*$/m, "ordinal: not-a-number"));

		await core.moveTasksToStatus({
			taskIds: ["task-1"],
			targetStatus: "In Progress",
		});

		const appended = await coreFileSystem(core).loadTask("task-1");
		expect(Number.isFinite(appended?.ordinal)).toBe(true);
		expect(appended?.ordinal ?? 0).toBeGreaterThan(1000);
	});

	it("moves an exact ID and reports a missing padded spelling separately", async () => {
		await createTasks([["task-1", "To Do", 1000]]);

		const result = await core.moveTasksToStatus({
			taskIds: ["task-1", "TASK-01"],
			targetStatus: "Done",
		});

		expect(result.failures.map((failure) => failure.taskId)).toEqual(["TASK-01"]);
		expect(result.movedTasks).toHaveLength(1);
		expect(result.changedTasks).toHaveLength(1);
	});

	it("rejects an empty target status", async () => {
		await createTasks([["task-1", "To Do", 1000]]);

		await expect(core.moveTasksToStatus({ taskIds: ["task-1"], targetStatus: "  " })).rejects.toThrow();
	});

	describe("milestone lanes", () => {
		it("applies the lane milestone the same way a single-task reorder does", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-2", "To Do", 2000],
				["task-3", "To Do", 3000],
			]);

			const batch = await core.moveTasksToStatus({
				taskIds: ["task-1", "task-2"],
				targetStatus: "In Progress",
				targetMilestone: "  Release 1  ",
			});
			expect(batch.failures).toHaveLength(0);

			// The same drop made one card at a time must land on the same milestone.
			await core.reorderTask({
				taskId: "task-3",
				targetStatus: "In Progress",
				orderedTaskIds: ["task-3"],
				targetMilestone: "  Release 1  ",
			});

			for (const id of ["task-1", "task-2", "task-3"]) {
				const task = await coreFileSystem(core).loadTask(id);
				expect(task?.status).toBe("In Progress");
				expect(task?.milestone).toBe("Release 1");
			}
		});

		it("clears the milestone when the batch lands in the no-milestone lane", async () => {
			await createTasks([["task-1", "To Do", 1000]]);
			await core.moveTasksToStatus({
				taskIds: ["task-1"],
				targetStatus: "To Do",
				targetMilestone: "Release 1",
			});
			expect((await coreFileSystem(core).loadTask("task-1"))?.milestone).toBe("Release 1");

			await core.moveTasksToStatus({
				taskIds: ["task-1"],
				targetStatus: "In Progress",
				targetMilestone: null,
			});

			expect((await coreFileSystem(core).loadTask("task-1"))?.milestone).toBeUndefined();
		});

		it("scopes append ordering to the target lane instead of the whole status", async () => {
			await createTasks([["task-1", "To Do", 1000]]);
			await core.createTask(buildTask("task-3", "In Progress", 1000, { milestone: "Release 1" }));
			// Same status, different lane, and no ordinal: a drop into Release 1 must not touch it.
			await core.createTask(buildTask("task-4", "In Progress", undefined, { milestone: "Release 2" }));

			const result = await core.moveTasksToStatus({
				taskIds: ["task-1"],
				targetStatus: "In Progress",
				targetMilestone: "Release 1",
			});

			expect(result.failures).toHaveLength(0);
			expect(result.changedTasks.map((task) => task.id)).toEqual(["TASK-1"]);
			const moved = await coreFileSystem(core).loadTask("task-1");
			expect(moved?.milestone).toBe("Release 1");
			expect(moved?.ordinal ?? 0).toBeGreaterThan(1000);
			// The other lane keeps its ordinal-less card exactly as it was.
			expect((await coreFileSystem(core).loadTask("task-4"))?.ordinal).toBeUndefined();
		});

		it("leaves the milestone alone when the caller names no lane", async () => {
			await createTasks([["task-1", "To Do", 1000]]);
			await core.moveTasksToStatus({
				taskIds: ["task-1"],
				targetStatus: "To Do",
				targetMilestone: "Release 1",
			});

			await core.moveTasksToStatus({ taskIds: ["task-1"], targetStatus: "Done" });

			const task = await coreFileSystem(core).loadTask("task-1");
			expect(task?.status).toBe("Done");
			expect(task?.milestone).toBe("Release 1");
		});
	});

	// Both paths run through Core's shared board-move resolution, so the same requested ID resolves
	// to the same task on either path.
	describe("shared id resolution with reorderTask", () => {
		it("resolves an untrimmed, lower-case ID on both paths", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-2", "To Do", 2000],
			]);

			const batch = await core.moveTasksToStatus({
				taskIds: ["  task-1  "],
				targetStatus: "In Progress",
			});
			expect(batch.failures).toHaveLength(0);
			expect(batch.movedTasks.map((task) => task.id)).toEqual(["TASK-1"]);

			const reordered = await core.reorderTask({
				taskId: "  task-2  ",
				targetStatus: "In Progress",
				orderedTaskIds: ["  task-2  "],
			});
			expect(reordered.updatedTask.id).toBe("TASK-2");
		});

		it("moves both distinct padded identities rather than treating them as ambiguous", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-2", "To Do", 2000],
			]);
			// The zero-padded container is a separate identity and must not block TASK-1.
			await mkdir(join(coreFileSystem(core).tasksDir, "task-01"), { recursive: true });
			await Bun.write(
				join(coreFileSystem(core).tasksDir, "task-01", "task.md"),
				serializeTask(buildTask("TASK-01", "To Do", 1500, { title: "Padded duplicate" })),
			);

			const batch = await core.moveTasksToStatus({
				taskIds: ["task-1", "task-2"],
				targetStatus: "Done",
			});

			expect(batch.movedTasks.map((task) => task.id).sort()).toEqual(["TASK-1", "TASK-2"]);
			expect(batch.failures).toHaveLength(0);
			expect((await coreFileSystem(core).loadTask("task-2"))?.status).toBe("Done");
			expect((await coreFileSystem(core).loadTask("TASK-01"))?.status).toBe("To Do");

			const reordered = await core.reorderTask({
				taskId: "task-1",
				targetStatus: "Done",
				orderedTaskIds: ["task-1"],
			});
			expect(reordered.updatedTask.id).toBe("TASK-1");
		});

		it("still rejects a repeated id in an ordering while the batch collapses it", async () => {
			await createTasks([["task-1", "To Do", 1000]]);

			await expect(
				core.reorderTask({
					taskId: "task-1",
					targetStatus: "Done",
					orderedTaskIds: ["task-1", "TASK-1"],
				}),
			).rejects.toThrow("Duplicate task id");

			const batch = await core.moveTasksToStatus({
				taskIds: ["task-1", "TASK-1"],
				targetStatus: "Done",
			});
			expect(batch.movedTasks).toHaveLength(1);
			expect(batch.failures).toHaveLength(0);
		});
	});

	describe("ordered placement", () => {
		it("lands the block exactly where orderedTaskIds names, between untouched neighbors", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-2", "To Do", 2000],
				["task-3", "In Progress", 1000],
				["task-4", "In Progress", 2000],
			]);

			const result = await core.moveTasksToStatus({
				taskIds: ["task-1", "task-2"],
				targetStatus: "In Progress",
				orderedTaskIds: ["TASK-3", "TASK-1", "TASK-2", "TASK-4"],
			});

			expect(result.failures).toHaveLength(0);
			const first = await coreFileSystem(core).loadTask("task-1");
			const second = await coreFileSystem(core).loadTask("task-2");
			expect(first?.status).toBe("In Progress");
			expect(second?.status).toBe("In Progress");
			expect(first?.ordinal ?? 0).toBeGreaterThan(1000);
			expect(second?.ordinal ?? 0).toBeLessThan(2000);
			expect(first?.ordinal ?? 0).toBeLessThan(second?.ordinal ?? 0);
			// The neighbors keep their ordinals and stay out of the write set.
			expect((await coreFileSystem(core).loadTask("task-3"))?.ordinal).toBe(1000);
			expect((await coreFileSystem(core).loadTask("task-4"))?.ordinal).toBe(2000);
			expect(result.changedTasks.map((task) => task.id).sort()).toEqual(["TASK-1", "TASK-2"]);
		});

		it("places a single task at the reorderTask midpoint", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-3", "In Progress", 1000],
				["task-4", "In Progress", 2000],
			]);

			await core.moveTasksToStatus({
				taskIds: ["task-1"],
				targetStatus: "In Progress",
				orderedTaskIds: ["TASK-3", "TASK-1", "TASK-4"],
			});

			expect((await coreFileSystem(core).loadTask("task-1"))?.ordinal).toBe(1500);
		});

		it("writes nothing when the ordering already matches the column", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-2", "To Do", 2000],
				["task-3", "To Do", 3000],
			]);

			const result = await core.moveTasksToStatus({
				taskIds: ["task-1", "task-2"],
				targetStatus: "To Do",
				orderedTaskIds: ["TASK-1", "TASK-2", "TASK-3"],
			});

			expect(result.failures).toHaveLength(0);
			expect(result.changedTasks).toHaveLength(0);
		});

		it("renumbers the column when the target gap cannot hold the block", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-2", "To Do", 2000],
				["task-3", "In Progress", 1000],
				["task-4", "In Progress", 1000],
			]);

			await core.moveTasksToStatus({
				taskIds: ["task-1", "task-2"],
				targetStatus: "In Progress",
				orderedTaskIds: ["TASK-3", "TASK-1", "TASK-2", "TASK-4"],
			});

			const ordinals = await Promise.all(
				["task-3", "task-1", "task-2", "task-4"].map(
					async (id) => (await coreFileSystem(core).loadTask(id))?.ordinal ?? 0,
				),
			);
			expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
			expect(new Set(ordinals).size).toBe(4);
		});

		it("rejects an ordering that repeats or omits a moved task", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-2", "To Do", 2000],
			]);

			await expect(
				core.moveTasksToStatus({
					taskIds: ["task-1"],
					targetStatus: "Done",
					orderedTaskIds: ["TASK-1", "task-1"],
				}),
			).rejects.toThrow(/duplicate/i);

			await expect(
				core.moveTasksToStatus({
					taskIds: ["task-1", "task-2"],
					targetStatus: "Done",
					orderedTaskIds: ["TASK-1"],
				}),
			).rejects.toThrow(/must include every task/i);
		});

		it("keeps the placement while reporting the tasks that could not move", async () => {
			await createTasks([
				["task-1", "To Do", 1000],
				["task-3", "In Progress", 1000],
				["task-4", "In Progress", 2000],
			]);

			const result = await core.moveTasksToStatus({
				taskIds: ["task-1", "task-9"],
				targetStatus: "In Progress",
				orderedTaskIds: ["TASK-3", "TASK-1", "TASK-9", "TASK-4"],
			});

			expect(result.failures).toEqual([{ taskId: "task-9", reason: "Task task-9 not found." }]);
			expect(result.movedTasks.map((task) => task.id)).toEqual(["TASK-1"]);
			expect((await coreFileSystem(core).loadTask("task-1"))?.ordinal).toBe(1500);
		});
	});
});
