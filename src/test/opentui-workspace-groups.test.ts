import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mountOpenTuiWorkspace, type OpenTuiWorkspaceGroupEntry } from "../renderer/opentui/workspace.ts";
import type { TaskGroup } from "../storage/group-store.ts";

function attachParent(setup: TestRendererSetup): BoxRenderable {
	const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(parent);
	return parent;
}

function rowOf(setup: TestRendererSetup, text: string): number {
	const rows = setup.captureCharFrame().split("\n");
	const index = rows.findIndex((row) => row.includes(text));
	expect(index).toBeGreaterThanOrEqual(0);
	return index;
}

function spanContaining(setup: TestRendererSetup, text: string) {
	for (const line of setup.captureSpans().lines) {
		for (const span of line.spans) {
			if (span.text.includes(text)) return span;
		}
	}
	throw new Error(`No rendered span containing ${text}`);
}

const tasks = [
	{ id: "BACK-1", title: "Alpha task", status: "Todo" },
	{ id: "BACK-2", title: "Beta task", status: "Todo" },
	{ id: "BACK-3", title: "Gamma task", status: "Todo" },
];

const openGroups: readonly TaskGroup[] = [
	{ id: "group-1", name: "Sprint", parentId: null, order: 0, collapsed: false },
];
const collapsedGroups: readonly TaskGroup[] = [
	{ id: "group-1", name: "Sprint", parentId: null, order: 0, collapsed: true },
];
const membership = { "BACK-1": "group-1", "BACK-2": "group-1" };

describe("workspace task groups", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	test("renders a group row with its descendant count and indents member tasks", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			groups: openGroups,
			groupMembership: membership,
			detailsVisible: false,
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("▾ Sprint (2)");
			const alpha = rowOf(setup, "Alpha task");
			const group = rowOf(setup, "Sprint (2)");
			const rows = setup.captureCharFrame().split("\n");
			expect(alpha).toBeGreaterThan(group);
			expect(rows[alpha]?.indexOf("Alpha task")).toBe(5);
		} finally {
			mount.dispose();
		}
	});

	test("a collapsed group shows the collapsed glyph and hides its members without changing the count", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			groups: collapsedGroups,
			groupMembership: membership,
			detailsVisible: false,
		});
		try {
			await setup.flush();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("▸ Sprint (2)");
			expect(frame).not.toContain("Alpha task");
			expect(frame).not.toContain("Beta task");
			expect(frame).toContain("Gamma task");
		} finally {
			mount.dispose();
		}
	});

	test("right and left on a selected group request expand and collapse", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const toggles: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			groups: openGroups,
			groupMembership: membership,
			selectedGroupId: "group-1",
			detailsVisible: false,
			onGroupToggle: (groupId, direction) => toggles.push(`${groupId}:${direction}`),
		});
		try {
			await setup.flush();
			setup.mockInput.pressArrow("right");
			await setup.flush();
			expect(toggles).toEqual(["group-1:expand"]);
			setup.mockInput.pressArrow("left");
			await setup.flush();
			expect(toggles).toEqual(["group-1:expand", "group-1:collapse"]);
		} finally {
			mount.dispose();
		}
	});

	test("arrowing onto a group row reports the selection and clears the details pane", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const selectedGroups: OpenTuiWorkspaceGroupEntry[] = [];
		const selectedTasks: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			groups: openGroups,
			groupMembership: membership,
			onGroupSelect: (entry) => selectedGroups.push(entry),
			onTaskSelect: (task) => selectedTasks.push(task.id),
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("No task selected.");
			setup.mockInput.pressArrow("up");
			await setup.flush();
			expect(selectedGroups).toEqual([{ id: "group-1", name: "Sprint" }]);
			expect(selectedTasks).toEqual([]);
			expect(setup.captureCharFrame()).toContain("No task selected.");
		} finally {
			mount.dispose();
		}
	});

	test("highlights the requested group row", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			groups: openGroups,
			groupMembership: membership,
			selectedGroupId: "group-1",
			detailsVisible: false,
		});
		try {
			await setup.flush();
			const span = spanContaining(setup, "Sprint (2)");
			expect(span.bg.toInts()).toEqual([203, 213, 225, 255]);
			expect(span.fg.toInts()).toEqual([17, 17, 17, 255]);
		} finally {
			mount.dispose();
		}
	});

	test("option+g requests a new group", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		let newGroups = 0;
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			onNewGroup: () => {
				newGroups += 1;
			},
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Group");
			setup.mockInput.pressKey("g", { meta: true });
			await setup.flush();
			expect(newGroups).toBe(1);
		} finally {
			mount.dispose();
		}
	});

	test("ungrouped tasks stay at depth zero and keep their flat order", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			groups: [],
			detailsVisible: false,
		});
		try {
			await setup.flush();
			const rows = setup.captureCharFrame().split("\n");
			const positions = ["Alpha task", "Beta task", "Gamma task"].map((title) => rowOf(setup, title));
			expect(positions).toEqual([...positions].sort((left, right) => left - right));
			for (const [index, title] of ["Alpha task", "Beta task", "Gamma task"].entries()) {
				expect(rows[positions[index] as number]?.indexOf(title)).toBe(3);
			}
			expect(setup.captureCharFrame()).toContain("Tasks (3)");
		} finally {
			mount.dispose();
		}
	});
});
