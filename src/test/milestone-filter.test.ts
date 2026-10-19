import { describe, expect, it } from "bun:test";
import {
	createMilestoneFilterMatcher,
	normalizeMilestoneFilterValue,
	resolveClosestMilestoneFilterValue,
} from "../model/task/milestone-filter.ts";
import { TaskSearchIndex } from "../model/task/task-search.ts";
import type { Task } from "../model/types.ts";

describe("milestone filter matching", () => {
	it("normalizes punctuation and case", () => {
		expect(normalizeMilestoneFilterValue("  Release-1 / Alpha ")).toBe("release 1 alpha");
	});

	it("matches only the supplied exact stored milestone ID", () => {
		const values = ["m-1", "m-01", ""];
		expect(values.filter(createMilestoneFilterMatcher("m-1"))).toEqual(["m-1"]);
		expect(values.filter(createMilestoneFilterMatcher("1"))).toEqual([]);
		expect(values.filter(createMilestoneFilterMatcher("Release"))).toEqual([]);
	});

	it("returns exact normalized milestone when available", () => {
		const resolved = resolveClosestMilestoneFilterValue("RELEASE-1", ["Release-1", "Roadmap Alpha"]);
		expect(resolved).toBe("release 1");
	});

	it("keeps independent fuzzy-value normalization", () => {
		const resolved = resolveClosestMilestoneFilterValue("releas-1", ["Release-1", "Release-2", "Roadmap Alpha"]);
		expect(resolved).toBe("release 1");
	});

	it("returns closest normalized value for independent fuzzy search", () => {
		const resolved = resolveClosestMilestoneFilterValue("roadmp", ["Release-1", "Roadmap Alpha"]);
		expect(resolved).toBe("roadmap alpha");
	});
});

it("filters tasks by exact milestone IDs only", () => {
	const tasks = [
		{ id: "task-1", title: "One", status: "To Do", milestone: "m-1" },
		{ id: "task-2", title: "Two", status: "To Do", milestone: "m-2" },
	] as unknown as Task[];
	expect(TaskSearchIndex.apply(tasks, { milestone: "m-1" }).map((task) => task.id)).toEqual(["task-1"]);
	expect(TaskSearchIndex.apply(tasks, { milestone: "Release 1" }).map((task) => task.id)).toEqual([]);
});
