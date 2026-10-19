import { describe, expect, it } from "bun:test";
import { assigneeComparisonKey, formatAssignee, normalizeAssignees } from "../model/task/assignee-filter.ts";

describe("assignee identity", () => {
	it("compares optional @, casing, and surrounding whitespace equally", () => {
		expect(assigneeComparisonKey("@Alice")).toBe(assigneeComparisonKey("alice"));
		expect(assigneeComparisonKey("@Alice")).toBe(assigneeComparisonKey(" @ALICE "));
	});

	it("collapses internal whitespace and deduplicates while preserving first spelling", () => {
		expect(assigneeComparisonKey("  @Alice   Smith  ")).toBe("alice smith");
		expect(normalizeAssignees([" @Alice  Smith ", "alice smith", "", "   ", "Bob"])).toEqual(["@Alice  Smith", "Bob"]);
	});

	it("formats only non-blank names with one leading @", () => {
		expect(formatAssignee(" Alice ")).toBe("@Alice");
		expect(formatAssignee("@Alice")).toBe("@Alice");
		expect(formatAssignee(" ")).toBeNull();
	});
});
