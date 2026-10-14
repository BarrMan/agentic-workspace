import { describe, expect, it } from "bun:test";
import { resolveInProgressStatus } from "../utils/status.ts";

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
