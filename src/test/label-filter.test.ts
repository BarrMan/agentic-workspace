import { describe, expect, test } from "bun:test";
import { prepareTaskCreationInput } from "../controller/task-creation-input.ts";
import { collectAvailableLabels, labelComparisonKey } from "../model/task/label-filter.ts";
import type { Task } from "../model/types.ts";

describe("label filter utilities", () => {
	test("collectAvailableLabels merges configured labels and task labels without duplicates sorted alphabetically", () => {
		const tasks: Task[] = [
			{
				id: "task-1",
				title: "One",
				done: false,
				status: "To Do",
				labels: ["bug", "UI"],
				createdDate: "2025-01-01",
				dependencies: [],
			},
			{
				id: "task-2",
				title: "Two",
				done: false,
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

	test("creation deduplicates labels by label comparison key", () => {
		expect(prepareTaskCreationInput({ title: "Labels", labels: [" UI ", "ui", "Docs"] }).labels).toEqual([
			"UI",
			"Docs",
		]);
	});
});
