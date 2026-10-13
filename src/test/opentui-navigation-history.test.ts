import { describe, expect, it } from "bun:test";
import { WorkspaceNavigationHistory, type WorkspaceNavigationSnapshot } from "../ui/opentui/navigation-history.ts";
import { createWorkspaceFilters } from "../ui/opentui/workspace/state.ts";

function snapshot(
	selectedTaskId: string,
	overrides: Partial<WorkspaceNavigationSnapshot> = {},
): WorkspaceNavigationSnapshot {
	return { view: "workspace", selectedTaskId, activeStatus: "To Do", filters: createWorkspaceFilters(), ...overrides };
}

describe("workspace navigation history", () => {
	it("restores selection, filters, status tabs, and view together", () => {
		const history = new WorkspaceNavigationHistory();
		const initial = snapshot("TASK-1");
		const filtered = snapshot("TASK-2", { filters: { ...createWorkspaceFilters(), search: "cache" } });
		const tabbed = snapshot("TASK-3", { ...filtered, activeStatus: "In Progress", selectedTaskId: "TASK-3" });
		const board = { ...tabbed, view: "board" as const };
		for (const entry of [initial, filtered, tabbed, board]) history.record(entry);
		expect(history.back()).toEqual(tabbed);
		expect(history.back()).toEqual(filtered);
		expect(history.back()).toEqual(initial);
		expect(history.back()).toBeUndefined();
		expect(history.forward()).toEqual(filtered);
		expect(history.forward()).toEqual(tabbed);
		expect(history.forward()).toEqual(board);
		expect(history.forward()).toBeUndefined();
	});

	it("preserves forward history on duplicate refresh but truncates it after new navigation", () => {
		const history = new WorkspaceNavigationHistory();
		history.record(snapshot("TASK-1"));
		history.record(snapshot("TASK-2"));
		history.record(snapshot("TASK-3"));
		expect(history.back()?.selectedTaskId).toBe("TASK-2");
		history.record(snapshot("TASK-2"));
		expect(history.forward()?.selectedTaskId).toBe("TASK-3");
		history.back();
		history.record(snapshot("TASK-4"));
		expect(history.forward()).toBeUndefined();
		expect(history.back()?.selectedTaskId).toBe("TASK-2");
		expect(history.back()?.selectedTaskId).toBe("TASK-1");
	});

	it("evicts only oldest entries and isolates snapshots from later mutations", () => {
		const history = new WorkspaceNavigationHistory(3);
		const entry = snapshot("TASK-2");
		history.record(snapshot("TASK-1"));
		history.record(entry);
		entry.filters.labels.push("changed");
		history.record(snapshot("TASK-3"));
		history.record(snapshot("TASK-4"));
		expect(history.back()?.selectedTaskId).toBe("TASK-3");
		const restored = history.back();
		expect(restored?.selectedTaskId).toBe("TASK-2");
		expect(restored?.filters.labels).toEqual([]);
		restored?.filters.labels.push("also changed");
		expect(history.back()).toBeUndefined();
		history.forward();
		expect(history.back()?.filters.labels).toEqual([]);
	});

	it("bounds rapid cross-view and filter navigation to one hundred complete snapshots", () => {
		const history = new WorkspaceNavigationHistory();
		for (let index = 1; index <= 101; index += 1) {
			history.record(
				snapshot(`TASK-${index}`, {
					view: index % 2 === 0 ? "board" : "workspace",
					activeStatus: index % 3 === 0 ? "In Progress" : "To Do",
					filters: { ...createWorkspaceFilters(), search: `query-${index}`, labels: [`label-${index}`] },
				}),
			);
		}
		let restored: WorkspaceNavigationSnapshot | undefined;
		for (let index = 0; index < 99; index += 1) restored = history.back();
		expect(restored).toMatchObject({
			view: "board",
			selectedTaskId: "TASK-2",
			activeStatus: "To Do",
			filters: { search: "query-2", labels: ["label-2"] },
		});
		expect(history.back()).toBeUndefined();
		expect(history.forward()).toMatchObject({
			view: "workspace",
			selectedTaskId: "TASK-3",
			activeStatus: "In Progress",
			filters: { search: "query-3", labels: ["label-3"] },
		});
	});
});
