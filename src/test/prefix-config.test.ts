import { describe, expect, test } from "bun:test";
import {
	buildIdRegex,
	extractAnyPrefix,
	extractIdBody,
	generateNextId,
	generateNextSubtaskId,
	getPrefixForType,
	getTaskPrefixError,
	hasPrefix,
	isReservedTaskPrefix,
} from "../model/task/prefix-config.ts";
import { canonicalTaskIdKey, canonicalTaskIdSegments } from "../model/task/task-id.ts";
import { type AgenticWorkspaceConfig, EntityType } from "../model/types.ts";

describe("prefix-config", () => {
	describe("extractIdBody", () => {
		test("extracts body from prefixed ID", () => {
			expect(extractIdBody("task-123", "task")).toBe("123");
			expect(extractIdBody("draft-456", "draft")).toBe("456");
		});

		test("handles hierarchical IDs", () => {
			expect(extractIdBody("task-5.2.1", "task")).toBe("5.2.1");
		});

		test("returns original if no prefix match", () => {
			expect(extractIdBody("123", "task")).toBe("123");
			expect(extractIdBody("draft-123", "task")).toBe("draft-123");
		});

		test("is case-insensitive for prefix", () => {
			expect(extractIdBody("TASK-123", "task")).toBe("123");
			expect(extractIdBody("Task-123", "task")).toBe("123");
		});

		test("works with custom prefixes", () => {
			expect(extractIdBody("JIRA-789", "JIRA")).toBe("789");
			expect(extractIdBody("issue-42", "issue")).toBe("42");
		});
	});

	describe("buildIdRegex", () => {
		test("matches simple IDs", () => {
			const regex = buildIdRegex("task");
			expect("task-123".match(regex)).toBeTruthy();
			expect("task-123".match(regex)?.[1]).toBe("123");
		});

		test("matches hierarchical IDs", () => {
			const regex = buildIdRegex("task");
			expect("task-5.2.1".match(regex)?.[1]).toBe("5.2.1");
		});

		test("is case-insensitive", () => {
			const regex = buildIdRegex("task");
			expect("TASK-123".match(regex)).toBeTruthy();
			expect("Task-456".match(regex)).toBeTruthy();
		});

		test("does not match wrong prefix", () => {
			const regex = buildIdRegex("task");
			expect("draft-123".match(regex)).toBeFalsy();
		});

		test("works with custom prefixes", () => {
			const regex = buildIdRegex("JIRA");
			expect("JIRA-789".match(regex)?.[1]).toBe("789");
			expect("jira-789".match(regex)?.[1]).toBe("789");
		});

		test("only matches at start of string", () => {
			const regex = buildIdRegex("task");
			expect("prefix-task-123".match(regex)).toBeFalsy();
		});
	});

	describe("hasPrefix", () => {
		test("returns true for matching prefix", () => {
			expect(hasPrefix("task-123", "task")).toBe(true);
			expect(hasPrefix("draft-456", "draft")).toBe(true);
		});

		test("is case-insensitive", () => {
			expect(hasPrefix("TASK-123", "task")).toBe(true);
			expect(hasPrefix("Task-456", "task")).toBe(true);
		});

		test("returns false for non-matching prefix", () => {
			expect(hasPrefix("draft-123", "task")).toBe(false);
			expect(hasPrefix("123", "task")).toBe(false);
		});

		test("trims whitespace", () => {
			expect(hasPrefix("  task-123  ", "task")).toBe(true);
		});
	});

	describe("generateNextId", () => {
		test("generates next ID in sequence (uppercase)", () => {
			expect(generateNextId(["task-1", "task-2", "task-3"], "task")).toBe("TASK-4");
		});

		test("handles gaps in sequence", () => {
			expect(generateNextId(["task-1", "task-5", "task-10"], "task")).toBe("TASK-11");
		});

		test("returns TASK-1 for empty list", () => {
			expect(generateNextId([], "task")).toBe("TASK-1");
		});

		test("ignores subtasks when finding max", () => {
			expect(generateNextId(["task-1", "task-1.1", "task-1.2", "task-2"], "task")).toBe("TASK-3");
		});

		test("handles zero padding", () => {
			expect(generateNextId(["task-001", "task-002"], "task", 3)).toBe("TASK-003");
		});

		test("works with custom prefixes (uppercase)", () => {
			expect(generateNextId(["JIRA-100", "JIRA-101"], "JIRA")).toBe("JIRA-102");
		});

		test("ignores IDs with wrong prefix", () => {
			expect(generateNextId(["task-5", "draft-10", "task-3"], "task")).toBe("TASK-6");
		});

		test("increments arbitrarily large IDs without scientific notation", () => {
			expect(generateNextId(["task-999999999999999999999999999999999999999"], "task")).toBe(
				"TASK-1000000000000000000000000000000000000000",
			);
		});
	});

	describe("generateNextSubtaskId", () => {
		test("generates next subtask ID (uppercase)", () => {
			expect(generateNextSubtaskId(["task-5", "task-5.1", "task-5.2"], "task-5", "task")).toBe("TASK-5.3");
		});

		test("returns .1 for first subtask", () => {
			expect(generateNextSubtaskId(["task-5"], "task-5", "task")).toBe("TASK-5.1");
		});

		test("handles gaps in subtask sequence", () => {
			expect(generateNextSubtaskId(["task-5", "task-5.1", "task-5.5"], "task-5", "task")).toBe("TASK-5.6");
		});

		test("handles zero padding", () => {
			expect(generateNextSubtaskId(["task-5", "task-5.01"], "task-5", "task", 2)).toBe("TASK-5.02");
		});

		test("works with custom prefixes", () => {
			expect(generateNextSubtaskId(["JIRA-100", "JIRA-100.1"], "JIRA-100", "JIRA")).toBe("JIRA-100.2");
		});

		test("handles unnormalized parent ID", () => {
			expect(generateNextSubtaskId(["task-5", "task-5.1"], "5", "task")).toBe("TASK-5.2");
		});

		test("increments huge subtasks and matches padded parent segments exactly", () => {
			expect(
				generateNextSubtaskId(
					["task-09007199254740992.999999999999999999999999999999999999999"],
					"TASK-9007199254740992",
					"task",
				),
			).toBe("TASK-9007199254740992.1000000000000000000000000000000000000000");
		});
	});

	describe("canonical task ID keys", () => {
		test("canonicalizes numeric segments without losing arbitrary precision", () => {
			expect(canonicalTaskIdSegments(["000", "09007199254740992"])).toEqual(["0", "9007199254740992"]);
			expect(canonicalTaskIdSegments(["1", "x"])).toBeNull();
		});

		test("folds case and leading zeros only for numeric task IDs", () => {
			expect(canonicalTaskIdKey(" Draft-0005.02 ")).toBe("draft-5.2");
			expect(canonicalTaskIdKey("Not-An-ID")).toBe("not-an-id");
		});
	});

	describe("getPrefixForType", () => {
		test("returns default task prefix without config", () => {
			expect(getPrefixForType(EntityType.Task)).toBe("task");
		});

		test("returns configured task prefix", () => {
			const config = { prefixes: { task: "JIRA" } } as AgenticWorkspaceConfig;
			expect(getPrefixForType(EntityType.Task, config)).toBe("JIRA");
		});

		test("returns default task prefix when config has no prefixes", () => {
			const config = {} as AgenticWorkspaceConfig;
			expect(getPrefixForType(EntityType.Task, config)).toBe("task");
		});

		test("returns hardcoded draft prefix (not configurable)", () => {
			expect(getPrefixForType(EntityType.Draft)).toBe("draft");
		});

		test("draft prefix is always hardcoded regardless of config", () => {
			const config = { prefixes: { task: "JIRA" } } as AgenticWorkspaceConfig;
			// Draft prefix is hardcoded, not part of config
			expect(getPrefixForType(EntityType.Draft, config)).toBe("draft");
		});
	});

	describe("isReservedTaskPrefix", () => {
		test("rejects prefixes matching the draft system prefix", () => {
			expect(isReservedTaskPrefix("draft")).toBe(true);
			expect(isReservedTaskPrefix("doc")).toBe(false);
		});

		test("is case-insensitive", () => {
			expect(isReservedTaskPrefix("DRAFT")).toBe(true);
			expect(isReservedTaskPrefix("Doc")).toBe(false);
		});

		test("allows non-reserved prefixes", () => {
			expect(isReservedTaskPrefix("task")).toBe(false);
			expect(isReservedTaskPrefix("JIRA")).toBe(false);
			expect(isReservedTaskPrefix("documents")).toBe(false);
		});
	});

	describe("getTaskPrefixError", () => {
		test("rejects reserved prefixes with the init error used by the wizard and flag", () => {
			expect(getTaskPrefixError("draft")).toBe(
				'Task prefix "draft" is reserved for drafts. Choose a different prefix.',
			);
			expect(getTaskPrefixError("DOC")).toBeUndefined();
		});

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

		test("still rejects a reserved prefix that is padded", () => {
			expect(getTaskPrefixError(" draft ")).toBe("Task prefix must contain only letters (a-z, A-Z).");
		});
	});

	describe("extractAnyPrefix", () => {
		test("extracts task prefix", () => {
			expect(extractAnyPrefix("task-123")).toBe("task");
		});

		test("extracts uppercase prefix", () => {
			expect(extractAnyPrefix("TASK-123")).toBe("task");
		});

		test("extracts custom prefix", () => {
			expect(extractAnyPrefix("JIRA-456")).toBe("jira");
		});

		test("extracts draft prefix", () => {
			expect(extractAnyPrefix("draft-1")).toBe("draft");
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
