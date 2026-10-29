import { describe, expect, test } from "bun:test";
import {
	extractAnyPrefix,
	extractIdBody,
	generateNextId,
	generateNextSubtaskId,
	getTaskPrefixError,
	hasPrefix,
} from "./prefix-config.ts";

describe("prefix-config", () => {
	describe("extractIdBody", () => {
		test("extracts body from prefixed ID", () => {
			expect(extractIdBody("task-123", "task")).toBe("123");
			expect(extractIdBody("jira-456", "jira")).toBe("456");
		});

		test("handles hierarchical IDs", () => {
			expect(extractIdBody("task-5.2.1", "task")).toBe("5.2.1");
		});

		test("returns original if no prefix match", () => {
			expect(extractIdBody("123", "task")).toBe("123");
			expect(extractIdBody("JIRA-123", "task")).toBe("JIRA-123");
		});

		test("works with custom prefixes", () => {
			expect(extractIdBody("JIRA-789", "JIRA")).toBe("789");
			expect(extractIdBody("issue-42", "issue")).toBe("42");
		});
	});

	describe("hasPrefix", () => {
		test("returns true for matching prefix", () => {
			expect(hasPrefix("task-123", "task")).toBe(true);
			expect(hasPrefix("JIRA-456", "JIRA")).toBe(true);
		});

		test("returns false for non-matching prefix", () => {
			expect(hasPrefix("JIRA-123", "task")).toBe(false);
			expect(hasPrefix("123", "task")).toBe(false);
		});

		test("treats configured prefixes literally", () => {
			expect(hasPrefix("a.b-123", "a.b")).toBe(true);
			expect(hasPrefix("axb-123", "a.b")).toBe(false);
		});
	});

	describe("generateNextId", () => {
		test("generates next ID in sequence (uppercase)", () => {
			expect(generateNextId(["TASK-1", "TASK-2", "TASK-3"], "task")).toBe("TASK-4");
		});

		test("handles gaps in sequence", () => {
			expect(generateNextId(["TASK-1", "TASK-5", "TASK-10"], "task")).toBe("TASK-11");
		});

		test("returns TASK-1 for empty list", () => {
			expect(generateNextId([], "task")).toBe("TASK-1");
		});

		test("ignores subtasks when finding max", () => {
			expect(generateNextId(["TASK-1", "TASK-1.1", "TASK-1.2", "TASK-2"], "task")).toBe("TASK-3");
		});

		test("handles zero padding", () => {
			expect(generateNextId(["TASK-001", "TASK-002"], "task", 3)).toBe("TASK-003");
		});

		test("works with custom prefixes (uppercase)", () => {
			expect(generateNextId(["JIRA-100", "JIRA-101"], "JIRA")).toBe("JIRA-102");
		});

		test("ignores IDs with wrong prefix", () => {
			expect(generateNextId(["TASK-5", "JIRA-10", "TASK-3"], "task")).toBe("TASK-6");
		});

		test("increments arbitrarily large IDs without scientific notation", () => {
			expect(generateNextId(["TASK-999999999999999999999999999999999999999"], "task")).toBe(
				"TASK-1000000000000000000000000000000000000000",
			);
		});
	});

	describe("generateNextSubtaskId", () => {
		test("generates next subtask ID (uppercase)", () => {
			expect(generateNextSubtaskId(["TASK-5", "TASK-5.1", "TASK-5.2"], "TASK-5", "task")).toBe("TASK-5.3");
		});

		test("returns .1 for first subtask", () => {
			expect(generateNextSubtaskId(["TASK-5"], "TASK-5", "task")).toBe("TASK-5.1");
		});

		test("handles gaps in subtask sequence", () => {
			expect(generateNextSubtaskId(["TASK-5", "TASK-5.1", "TASK-5.5"], "TASK-5", "task")).toBe("TASK-5.6");
		});

		test("handles zero padding", () => {
			expect(generateNextSubtaskId(["TASK-5", "TASK-5.01"], "TASK-5", "task", 2)).toBe("TASK-5.02");
		});

		test("works with custom prefixes", () => {
			expect(generateNextSubtaskId(["JIRA-100", "JIRA-100.1"], "JIRA-100", "JIRA")).toBe("JIRA-100.2");
		});

		test("increments huge subtasks and matches parent segments exactly", () => {
			expect(
				generateNextSubtaskId(
					["TASK-9007199254740992.999999999999999999999999999999999999999"],
					"TASK-9007199254740992",
					"task",
				),
			).toBe("TASK-9007199254740992.1000000000000000000000000000000000000000");
			expect(generateNextSubtaskId(["TASK-1.99", "TASK-01.4"], "TASK-01", "task")).toBe("TASK-01.5");
		});
	});

	describe("getTaskPrefixError", () => {
		test("rejects non-letter prefixes", () => {
			expect(getTaskPrefixError("task-1")).toBe("Task prefix must contain only letters (a-z, A-Z).");
		});

		test("allows empty input and non-reserved prefixes", () => {
			expect(getTaskPrefixError("")).toBeUndefined();
			expect(getTaskPrefixError("JIRA")).toBeUndefined();
		});

		test("rejects surrounding whitespace, which init would otherwise persist verbatim", () => {
			// init writes the value straight into task_prefix, so padding would leak into IDs and filenames.
			expect(getTaskPrefixError(" JIRA ")).toBe("Task prefix must contain only letters (a-z, A-Z).");
			expect(getTaskPrefixError("JIRA ")).toBe("Task prefix must contain only letters (a-z, A-Z).");
			expect(getTaskPrefixError("   ")).toBe("Task prefix must contain only letters (a-z, A-Z).");
		});
	});

	describe("extractAnyPrefix", () => {
		test("extracts task prefix", () => {
			expect(extractAnyPrefix("task-123")).toBe("task");
		});

		test("returns null for plain number", () => {
			expect(extractAnyPrefix("123")).toBe(null);
		});

		test("returns null for empty string", () => {
			expect(extractAnyPrefix("")).toBe(null);
		});

		test("returns null for null/undefined", () => {
			expect(extractAnyPrefix(null as unknown as string)).toBe(null);
			expect(extractAnyPrefix(undefined as unknown as string)).toBe(null);
		});

		test("handles subtask IDs", () => {
			expect(extractAnyPrefix("task-5.2.1")).toBe("task");
		});

		test("handles word IDs", () => {
			expect(extractAnyPrefix("bug-fix-login")).toBe("bug");
		});
	});
});
