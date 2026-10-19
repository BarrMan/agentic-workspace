import { describe, expect, it } from "bun:test";
import { formatAssignee, normalizeAssignees } from "../model/task/assignee-filter.ts";

describe("assignee identity", () => {
	it("deduplicates by case-insensitive trimmed identity, preserving first display spelling", () => {
		expect(normalizeAssignees([" Alice ", "alice", "ALICE"])).toEqual(["Alice"]);
	});

	it("preserves leading @ and internal whitespace as identity differences", () => {
		expect(normalizeAssignees([" @Alice  Smith ", "@alice  smith", "@Alice Smith", "Alice  Smith", "Bob"])).toEqual([
			"@Alice  Smith",
			"@Alice Smith",
			"Alice  Smith",
			"Bob",
		]);
		expect(normalizeAssignees(["", "   "])).toEqual([]);
	});

	it("formats only non-blank names with one leading @", () => {
		expect(formatAssignee(" Alice ")).toBe("@Alice");
		expect(formatAssignee("@Alice")).toBe("@Alice");
		expect(formatAssignee(" ")).toBeNull();
	});
});
