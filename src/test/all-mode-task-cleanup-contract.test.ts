import { describe, expect, it } from "bun:test";
import { withoutSelectedModeForTask } from "../filesystem/git/task-worktree-cleanup.ts";

describe("all-mode task cleanup contract", () => {
	it("removes only the selected task mode", async () => {
		const task = "TASK-1";
		const state = { selectedModeByTask: { [task]: "plan", other: "build" } as Record<string, string> };
		expect(withoutSelectedModeForTask(state, task)).toEqual({ selectedModeByTask: { other: "build" } });
		expect(withoutSelectedModeForTask(state, "missing")).toBe(state);
	});
});
