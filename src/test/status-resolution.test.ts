import { describe, expect, it } from "bun:test";
import { resolveInProgressStatus, statusComparisonKey, statusLookupKey } from "../utils/status.ts";

describe("status comparison keys", () => {
	it("trims and lowercases while preserving internal whitespace", () => {
		expect(statusComparisonKey("  In Progress ")).toBe("in progress");
		expect(statusComparisonKey("InProgress")).toBe("inprogress");
		expect(statusComparisonKey(undefined)).toBe("");
	});

	it("collapses internal whitespace only for canonical lookup", () => {
		expect(statusLookupKey("  In Progress ")).toBe("inprogress");
		expect(statusLookupKey("InProgress")).toBe("inprogress");
	});
});

describe("resolveInProgressStatus", () => {
	it("returns the canonical In Progress status by name, preserving configured casing", () => {
		expect(resolveInProgressStatus(["Todo", "in progress", "Done"])).toBe("in progress");
	});

	it("falls back to the second configured status when In Progress is renamed", () => {
		expect(resolveInProgressStatus(["AgenticWorkspace", "Doing", "Shipped"])).toBe("Doing");
	});

	it("uses the default statuses when none are configured", () => {
		expect(resolveInProgressStatus(undefined)).toBe("In Progress");
		expect(resolveInProgressStatus([])).toBe("In Progress");
	});

	it("returns undefined when there is no active-work slot", () => {
		expect(resolveInProgressStatus(["To Do"])).toBe(undefined);
	});
});
