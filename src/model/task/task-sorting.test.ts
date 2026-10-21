import { describe, expect, test } from "bun:test";
import { TaskOrdering } from "./task-ordering.ts";

describe("parseTaskId", () => {
	test("parses simple task IDs", () => {
		expect(TaskOrdering.parseId("task-1")).toEqual([1]);
		expect(TaskOrdering.parseId("task-10")).toEqual([10]);
		expect(TaskOrdering.parseId("task-100")).toEqual([100]);
	});

	test("parses decimal task IDs", () => {
		expect(TaskOrdering.parseId("task-1.1")).toEqual([1, 1]);
		expect(TaskOrdering.parseId("task-1.2.3")).toEqual([1, 2, 3]);
		expect(TaskOrdering.parseId("task-10.20.30")).toEqual([10, 20, 30]);
	});

	test("handles IDs without task- prefix", () => {
		expect(TaskOrdering.parseId("5")).toEqual([5]);
		expect(TaskOrdering.parseId("5.1")).toEqual([5, 1]);
	});

	test("handles invalid numeric parts", () => {
		expect(TaskOrdering.parseId("task-abc")).toEqual([0]);
		expect(TaskOrdering.parseId("task-1.abc.2")).toEqual([2]); // Mixed numeric/non-numeric extracts trailing number
	});

	test("handles IDs with trailing numbers", () => {
		expect(TaskOrdering.parseId("task-mixed")).toEqual([0]);
		expect(TaskOrdering.parseId("task-mixed2")).toEqual([2]);
		expect(TaskOrdering.parseId("task-mixed10")).toEqual([10]);
		expect(TaskOrdering.parseId("mixed2")).toEqual([2]);
		expect(TaskOrdering.parseId("abc123")).toEqual([123]);
	});
});

describe("compareTaskIds", () => {
	test("sorts simple task IDs numerically", () => {
		expect(TaskOrdering.compareIds("task-2", "task-10")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-10", "task-2")).toBeGreaterThan(0);
		expect(TaskOrdering.compareIds("task-5", "task-5")).toBe(0);
	});

	test("sorts decimal task IDs correctly", () => {
		expect(TaskOrdering.compareIds("task-2.1", "task-2.2")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-2.2", "task-2.10")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-2.10", "task-2.2")).toBeGreaterThan(0);
	});

	test("parent tasks come before subtasks", () => {
		expect(TaskOrdering.compareIds("task-2", "task-2.1")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-2.1", "task-2")).toBeGreaterThan(0);
	});

	test("handles different depth levels", () => {
		expect(TaskOrdering.compareIds("task-1.1.1", "task-1.2")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-1.2", "task-1.1.1")).toBeGreaterThan(0);
	});

	test("sorts IDs with trailing numbers", () => {
		expect(TaskOrdering.compareIds("task-mixed", "task-mixed2")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-mixed2", "task-mixed10")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-mixed10", "task-mixed2")).toBeGreaterThan(0);
	});

	test("sorts distinct nonnumeric IDs deterministically", () => {
		expect(TaskOrdering.compareIds("task-alpha", "task-beta")).toBeLessThan(0);
		expect(TaskOrdering.compareIds("task-beta", "task-alpha")).toBeGreaterThan(0);
		expect(TaskOrdering.compareIds("task-alpha", "task-alpha")).toBe(0);
	});
});

describe("compareTaskIdsDescending", () => {
	test("sorts root task groups descending while keeping parents before subtasks", () => {
		const ids = ["task-1", "task-3.01", "task-2", "task-3.02", "task-3"];

		const sorted = [...ids].sort(TaskOrdering.compareIdsDescending);

		expect(sorted).toEqual(["task-3", "task-3.02", "task-3.01", "task-2", "task-1"]);
	});

	test("sorts distinct nonnumeric IDs deterministically", () => {
		expect(TaskOrdering.compareIdsDescending("task-alpha", "task-beta")).toBeGreaterThan(0);
		expect(TaskOrdering.compareIdsDescending("task-beta", "task-alpha")).toBeLessThan(0);
		expect(TaskOrdering.compareIdsDescending("task-alpha", "task-alpha")).toBe(0);
	});
});

describe("sortByTaskId", () => {
	test("sorts array of tasks by ID numerically", () => {
		const tasks = [
			{ id: "task-10", title: "Task 10" },
			{ id: "task-2", title: "Task 2" },
			{ id: "task-1", title: "Task 1" },
			{ id: "task-20", title: "Task 20" },
			{ id: "task-3", title: "Task 3" },
		];

		const sorted = TaskOrdering.byId(tasks);
		expect(sorted.map((t) => t.id)).toEqual(["task-1", "task-2", "task-3", "task-10", "task-20"]);
	});

	test("sorts tasks with decimal IDs correctly", () => {
		const tasks = [
			{ id: "task-2.10", title: "Subtask 2.10" },
			{ id: "task-2.2", title: "Subtask 2.2" },
			{ id: "task-2", title: "Task 2" },
			{ id: "task-1", title: "Task 1" },
			{ id: "task-2.1", title: "Subtask 2.1" },
		];

		const sorted = TaskOrdering.byId(tasks);
		expect(sorted.map((t) => t.id)).toEqual(["task-1", "task-2", "task-2.1", "task-2.2", "task-2.10"]);
	});

	test("handles mixed simple and decimal IDs", () => {
		const tasks = [
			{ id: "task-10", title: "Task 10" },
			{ id: "task-2.1", title: "Subtask 2.1" },
			{ id: "task-2", title: "Task 2" },
			{ id: "task-1", title: "Task 1" },
			{ id: "task-10.1", title: "Subtask 10.1" },
			{ id: "task-3", title: "Task 3" },
		];

		const sorted = TaskOrdering.byId(tasks);
		expect(sorted.map((t) => t.id)).toEqual(["task-1", "task-2", "task-2.1", "task-3", "task-10", "task-10.1"]);
	});

	test("preserves original array", () => {
		const tasks = [
			{ id: "task-3", title: "Task 3" },
			{ id: "task-1", title: "Task 1" },
			{ id: "task-2", title: "Task 2" },
		];

		const original = [...tasks];
		TaskOrdering.byId(tasks);

		// Original array order should be preserved
		expect(tasks).toEqual(original);
	});
});

describe("sortByPriority", () => {
	test("sorts tasks by priority order: high > medium > low > undefined", () => {
		const tasks = [
			{ id: "task-1", priority: "Low" },
			{ id: "task-2", priority: "High" },
			{ id: "task-3" }, // no priority
			{ id: "task-4", priority: "Medium" },
			{ id: "task-5", priority: "High" },
		];

		const sorted = TaskOrdering.byPriority(tasks);
		expect(sorted.map((t) => ({ id: t.id, priority: t.priority }))).toEqual([
			{ id: "task-2", priority: "High" },
			{ id: "task-5", priority: "High" },
			{ id: "task-4", priority: "Medium" },
			{ id: "task-1", priority: "Low" },
			{ id: "task-3", priority: undefined },
		]);
	});

	test("sorts tasks by configured custom priority order", () => {
		const tasks = [
			{ id: "task-1", priority: "Low" },
			{ id: "task-2", priority: "Very High" },
			{ id: "task-3", priority: "Very Low" },
			{ id: "task-4", priority: "Medium" },
			{ id: "task-6", priority: "high" },
			{ id: "task-5" },
		];

		const sorted = TaskOrdering.byPriority(tasks, ["Very High", "High", "Medium", "Low", "Very Low"]);
		expect(sorted.map((task) => task.id)).toEqual(["task-2", "task-4", "task-1", "task-3", "task-5", "task-6"]);
	});

	test("sorts tasks with same priority by task ID", () => {
		const tasks = [
			{ id: "task-10", priority: "High" },
			{ id: "task-2", priority: "High" },
			{ id: "task-20", priority: "Medium" },
			{ id: "task-1", priority: "Medium" },
		];

		const sorted = TaskOrdering.byPriority(tasks);
		expect(sorted.map((t) => t.id)).toEqual(["task-2", "task-10", "task-1", "task-20"]);
	});

	test("handles all undefined priorities", () => {
		const tasks = [{ id: "task-3" }, { id: "task-1" }, { id: "task-2" }];

		const sorted = TaskOrdering.byPriority(tasks);
		expect(sorted.map((t) => t.id)).toEqual(["task-1", "task-2", "task-3"]);
	});

	test("preserves original array", () => {
		const tasks = [
			{ id: "task-1", priority: "low" as const },
			{ id: "task-2", priority: "high" as const },
		];

		const original = [...tasks];
		TaskOrdering.byPriority(tasks);

		// Original array order should be preserved
		expect(tasks).toEqual(original);
	});
});

describe("sortByNewestFirst", () => {
	test("orders by ordinal descending", () => {
		const sorted = TaskOrdering.newestFirst([
			{ id: "task-1", ordinal: 10 },
			{ id: "task-2", ordinal: 30 },
			{ id: "task-3", ordinal: 20 },
		]);

		expect(sorted.map((t) => t.id)).toEqual(["task-2", "task-3", "task-1"]);
	});

	test("places tasks without an ordinal last", () => {
		const sorted = TaskOrdering.newestFirst([{ id: "task-1" }, { id: "task-2", ordinal: 10 }, { id: "task-3" }]);

		expect(sorted.map((t) => t.id)).toEqual(["task-2", "task-3", "task-1"]);
	});

	test("ties on descending ID, keeping parents before children", () => {
		const sorted = TaskOrdering.newestFirst([
			{ id: "task-1.1", ordinal: 5 },
			{ id: "task-10", ordinal: 5 },
			{ id: "task-1", ordinal: 5 },
		]);

		expect(sorted.map((t) => t.id)).toEqual(["task-10", "task-1", "task-1.1"]);
	});

	test("preserves the original array", () => {
		const tasks = [{ id: "task-1" }, { id: "task-2" }];
		const original = [...tasks];

		TaskOrdering.newestFirst(tasks);

		expect(tasks).toEqual(original);
	});
});

describe("sortTasks", () => {
	test("sorts by priority when field is 'priority'", () => {
		const tasks = [
			{ id: "task-1", priority: "Low" },
			{ id: "task-2", priority: "High" },
			{ id: "task-3", priority: "Medium" },
		];

		const sorted = TaskOrdering.sort(tasks, "priority");
		expect(sorted.map((t) => t.priority)).toEqual(["High", "Medium", "Low"]);
	});

	test("sorts by ID when field is 'id'", () => {
		const tasks = [
			{ id: "task-10", priority: "high" as const },
			{ id: "task-2", priority: "high" as const },
			{ id: "task-1", priority: "high" as const },
		];

		const sorted = TaskOrdering.sort(tasks, "id");
		expect(sorted.map((t) => t.id)).toEqual(["task-1", "task-2", "task-10"]);
	});

	test("handles case-insensitive field names", () => {
		const tasks = [
			{ id: "task-1", priority: "Low" as const },
			{ id: "task-2", priority: "High" as const },
		];

		const sorted = TaskOrdering.sort(tasks, "PRIORITY");
		expect(sorted.map((t) => t.priority)).toEqual(["High", "Low"]);
	});

	test("sorts newest-first when field is 'newest'", () => {
		const tasks = [
			{ id: "task-1", ordinal: 10 },
			{ id: "task-2", ordinal: 30 },
			{ id: "task-3", ordinal: 20 },
		];

		const sorted = TaskOrdering.sort(tasks, "newest");
		expect(sorted.map((t) => t.id)).toEqual(["task-2", "task-3", "task-1"]);
	});

	test("defaults to ID sorting for unknown fields", () => {
		const tasks = [{ id: "task-10" }, { id: "task-2" }, { id: "task-1" }];

		const sorted = TaskOrdering.sort(tasks, "unknown");
		expect(sorted.map((t) => t.id)).toEqual(["task-1", "task-2", "task-10"]);
	});

	test("defaults to ID sorting for empty field", () => {
		const tasks = [{ id: "task-10" }, { id: "task-2" }];

		const sorted = TaskOrdering.sort(tasks, "");
		expect(sorted.map((t) => t.id)).toEqual(["task-2", "task-10"]);
	});
});
