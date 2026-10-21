import { describe, expect, it } from "bun:test";
import { getTerminalStatus, isTerminalStatus } from "./terminal-status.ts";

describe("terminal status helpers", () => {
	it("uses the final configured status as terminal", () => {
		expect(getTerminalStatus(["To Do", "Review", "Closed"])).toBe("Closed");
	});

	it("compares terminal statuses exactly", () => {
		expect(isTerminalStatus("Closed", ["To Do", "Review", "Closed"])).toBe(true);
		expect(isTerminalStatus("closed", ["To Do", "Review", "Closed"])).toBe(false);
		expect(isTerminalStatus("review", ["To Do", "Review", "Closed"])).toBe(false);
	});

	it("does not alias internal whitespace", () => {
		expect(isTerminalStatus("InProgress", ["To Do", "In Progress", "InProgress"])).toBe(true);
		expect(isTerminalStatus("In Progress", ["To Do", "In Progress", "InProgress"])).toBe(false);
	});
});
