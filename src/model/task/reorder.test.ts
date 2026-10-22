import { describe, expect, it } from "bun:test";
import type { Task } from "../types.ts";
import {
	calculateBlockOrdinals,
	calculateNewOrdinal,
	DEFAULT_ORDINAL_STEP,
	planAppendedTaskPlacement,
	planOrderedTaskPlacement,
	planTaskReorder,
	reconcileBoardPlacement,
	resolveOrdinalConflicts,
} from "./reorder.ts";

const item = (id: string, ordinal?: number) => ({ id, ordinal });
const task = (id: string, status: string, ordinal?: number, overrides: Partial<Task> = {}): Task => ({
	id,
	title: `Task ${id}`,
	status,
	createdDate: "2025-01-01 00:00",
	labels: [],
	dependencies: [],
	...(ordinal !== undefined ? { ordinal } : {}),
	...overrides,
});

describe("calculateNewOrdinal", () => {
	it("returns default step when no neighbors exist", () => {
		const result = calculateNewOrdinal({});
		expect(result.ordinal).toBe(DEFAULT_ORDINAL_STEP);
		expect(result.requiresRebalance).toBe(false);
	});

	it("averages ordinals when both neighbors exist", () => {
		const result = calculateNewOrdinal({
			previous: item("a", 1000),
			next: item("b", 3000),
		});
		expect(result.ordinal).toBe(2000);
		expect(result.requiresRebalance).toBe(false);
	});

	it("flags rebalance when there is no gap between neighbors", () => {
		const result = calculateNewOrdinal({
			previous: item("a", 2000),
			next: item("b", 2000),
		});
		expect(result.requiresRebalance).toBe(true);
	});

	it("appends step when dropping after the last task", () => {
		const result = calculateNewOrdinal({ previous: item("a", 4000) });
		expect(result.ordinal).toBe(4000 + DEFAULT_ORDINAL_STEP);
		expect(result.requiresRebalance).toBe(false);
	});
});

describe("resolveOrdinalConflicts", () => {
	it("returns empty array when ordinals are already increasing", () => {
		const updates = resolveOrdinalConflicts([item("a", 1000), item("b", 2000), item("c", 3000)]);
		expect(updates).toHaveLength(0);
	});

	it("reassigns duplicate or descending ordinals", () => {
		const updates = resolveOrdinalConflicts([item("a", 1000), item("b", 1000), item("c", 2000)]);
		expect(updates).toHaveLength(2);
		expect(updates[0]).toEqual({ id: "b", ordinal: 2000 });
		expect(updates[1]).toEqual({ id: "c", ordinal: 3000 });
	});

	it("fills in missing ordinals with default spacing", () => {
		const updates = resolveOrdinalConflicts([item("a"), item("b"), item("c", 1500)]);
		expect(updates).toHaveLength(3);
		expect(updates[0]).toEqual({ id: "a", ordinal: DEFAULT_ORDINAL_STEP });
		expect(updates[1]).toEqual({ id: "b", ordinal: DEFAULT_ORDINAL_STEP * 2 });
		expect(updates[2]).toEqual({ id: "c", ordinal: DEFAULT_ORDINAL_STEP * 3 });
	});

	it("can force sequential reassignment when requested", () => {
		const updates = resolveOrdinalConflicts([item("a", 1000), item("b", 2500), item("c", 4500)], {
			forceSequential: true,
		});
		expect(updates).toHaveLength(2);
		expect(updates[0]).toEqual({ id: "b", ordinal: 2000 });
		expect(updates[1]).toEqual({ id: "c", ordinal: 3000 });
	});
});

describe("task reorder", () => {
	it("calculates single and block ordinals between neighbors", () => {
		expect(calculateNewOrdinal({ previous: item("a", 1000), next: item("b", 3000) })).toEqual({
			ordinal: 2000,
			requiresRebalance: false,
		});
		expect(calculateBlockOrdinals({ previous: item("a", 1000), next: item("b", 4000), count: 2 })).toEqual({
			ordinals: [2000, 3000],
			requiresRebalance: false,
		});
	});

	it("resolves duplicates and missing ordinals without changing other task fields", () => {
		const first = task("TASK-1", "To Do", 1000);
		const second = task("TASK-2", "Doing", 1000, { title: "Keep title", milestone: "M-1" });
		const third = task("TASK-3", "To Do");
		const result = reconcileBoardPlacement([first, second, third], [first, second, third], DEFAULT_ORDINAL_STEP);

		expect(result.tasks.map(({ ordinal }) => ordinal)).toEqual([1000, 2000, 3000]);
		expect(result.tasks[1]).toMatchObject({ title: "Keep title", status: "Doing", milestone: "M-1" });
		expect(result.changedTasks).toEqual([
			{ ...second, ordinal: 2000 },
			{ ...third, ordinal: 3000 },
		]);
		expect(resolveOrdinalConflicts([item("a", 1000), item("b", 1000)])).toEqual([{ id: "b", ordinal: 2000 }]);
	});

	it("plans a single reorder across stale IDs using corpus neighbors", () => {
		const first = task("TASK-1", "To Do", 1000);
		const second = task("TASK-2", "To Do", 2000);
		const moved = task("TASK-3", "To Do", 3000);
		const plan = planTaskReorder({
			taskId: moved.id,
			targetStatus: "To Do",
			orderedTaskIds: [first.id, "TASK-9", moved.id, second.id],
			validTasks: [first, moved, second],
			targetMilestone: undefined,
			hasTargetMilestone: false,
			defaultStep: DEFAULT_ORDINAL_STEP,
		});

		expect(plan.updatedTask.ordinal).toBe(1500);
		expect(plan.changedTasks.map(({ id }) => id)).toEqual([moved.id]);
	});

	it("plans ordered moved blocks while preserving neighbors", () => {
		const before = task("TASK-1", "Doing", 1000);
		const first = task("TASK-2", "To Do", 500);
		const second = task("TASK-3", "To Do", 600);
		const after = task("TASK-4", "Doing", 2000);
		const plan = planOrderedTaskPlacement(
			[
				{ task: before, moved: false },
				{ task: first, moved: true },
				{ task: second, moved: true },
				{ task: after, moved: false },
			],
			[first, second],
			{
				targetStatus: "Doing",
				targetMilestone: undefined,
				hasTargetMilestone: false,
				defaultStep: DEFAULT_ORDINAL_STEP,
			},
		);

		expect(plan.movedTasks[0]?.ordinal).toBeCloseTo(1000 + 1000 / 3);
		expect(plan.movedTasks[1]?.ordinal).toBeCloseTo(1000 + (2 * 1000) / 3);
		expect(plan.changedTasks.map(({ id }) => id)).toEqual([first.id, second.id]);
	});

	it("appends into only the target milestone lane and leaves no-arrival ordinals alone", () => {
		const selected = task("TASK-1", "To Do", 500, { milestone: "M-1" });
		const inLane = task("TASK-2", "Doing", 1000, { milestone: "M-1" });
		const otherLane = task("TASK-3", "Doing", 2000, { milestone: "M-2" });
		const appended = planAppendedTaskPlacement([inLane, otherLane], [selected], {
			targetStatus: "Doing",
			targetMilestone: "M-1",
			hasTargetMilestone: true,
			defaultStep: DEFAULT_ORDINAL_STEP,
		});
		expect(appended.movedTasks[0]?.ordinal).toBe(2000);
		expect(appended.changedTasks.map(({ id }) => id)).toEqual([selected.id]);
		expect(otherLane.ordinal).toBe(2000);

		const duplicate = task("TASK-4", "Doing", 1000);
		const missing = task("TASK-5", "Doing");
		const noArrival = planAppendedTaskPlacement([inLane, duplicate, missing], [duplicate, missing], {
			targetStatus: "Doing",
			targetMilestone: undefined,
			hasTargetMilestone: false,
			defaultStep: DEFAULT_ORDINAL_STEP,
		});
		expect(noArrival.movedTasks.map(({ ordinal }) => ordinal)).toEqual([1000, undefined]);
		expect(inLane.ordinal).toBe(1000);
	});
});
