import { describe, expect, test } from "bun:test";
import { collectAvailableLabels, labelComparisonKey } from "../model/task/label-filter.ts";
import type { Task } from "../model/types.ts";

describe("label filter utilities", () => {
	test("collectAvailableLabels merges configured labels and task labels without duplicates sorted alphabetically", () => {
		const tasks: Task[] = [
			{
				id: "task-1",
				title: "One",
				status: "To Do",
				labels: ["bug", "UI"],
				createdDate: "2025-01-01",
				dependencies: [],
			},
			{
				id: "task-2",
				title: "Two",
				status: "To Do",
				labels: ["infra", "bug"],
				createdDate: "2025-01-01",
				dependencies: [],
			},
		];
		const configured = ["backend", "BUG"];

		const labels = collectAvailableLabels(tasks, configured);

		expect(labels).toEqual(["backend", "BUG", "infra", "UI"]);
	});

	test("collectAvailableLabels sorts accented labels with locale-independent normalized keys", () => {
		const labels = collectAvailableLabels([], ["Zulu", "Öl", "Ärger"]);

		expect(labels).toEqual(["Ärger", "Öl", "Zulu"]);
	});

	test("collectAvailableLabels orders equivalent Unicode spellings independently of input order", () => {
		const composed = "café";
		const decomposed = "cafe\u0301";
		const expected = [decomposed, composed];

		expect(collectAvailableLabels([], [composed, decomposed])).toEqual(expected);
		expect(collectAvailableLabels([], [decomposed, composed])).toEqual(expected);
	});

	test("labelComparisonKey trims and lowercases without changing display values", () => {
		expect(labelComparisonKey("  UI ")).toBe("ui");
		expect(collectAvailableLabels([], [" UI ", "ui"])).toEqual([" UI "]);
	});
});
