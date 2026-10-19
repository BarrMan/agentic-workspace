import { describe, expect, it } from "bun:test";
import { hasMoveBlockingBoardFilters } from "../renderer/opentui/board/policies/filter-policy.ts";

describe("Board TUI Logic", () => {
	describe("hasMoveBlockingBoardFilters", () => {
		const baseFilters = {
			searchQuery: "",
			excludeStatus: [],
			priorityFilter: "",
			typeFilter: [],
			labelFilter: [],
			milestoneFilter: "",
		};

		it("does not block moves when only hidden excluded statuses are active", () => {
			expect(hasMoveBlockingBoardFilters({ ...baseFilters, excludeStatus: ["Done"] })).toBe(false);
		});

		it("blocks moves when visible board filters are active", () => {
			expect(hasMoveBlockingBoardFilters({ ...baseFilters, searchQuery: "auth" })).toBe(true);
			expect(hasMoveBlockingBoardFilters({ ...baseFilters, typeFilter: ["bug"] })).toBe(true);
			expect(hasMoveBlockingBoardFilters({ ...baseFilters, projectFilter: ["web"] })).toBe(true);
			expect(hasMoveBlockingBoardFilters({ ...baseFilters, labelFilter: ["bug"] })).toBe(true);
		});
	});
});
