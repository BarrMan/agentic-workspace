import { describe, expect, test } from "bun:test";
import type { TaskGroup } from "../agent-workspace/group-store.ts";
import { buildGroupRows, collectDescendantGroupIds, findGroup, setCollapsed } from "../ui/opentui/groups.ts";

const group = (id: string, name: string, parentId: string | null, order: number, collapsed = false): TaskGroup => ({
	id,
	name,
	parentId,
	order,
	collapsed,
});

describe("buildGroupRows", () => {
	test("renders ungrouped tasks at depth 0 in the given order", () => {
		const rows = buildGroupRows([], {}, ["A", "B", "C"]);
		expect(rows).toEqual([
			{ kind: "task", id: "A", depth: 0, groupId: null },
			{ kind: "task", id: "B", depth: 0, groupId: null },
			{ kind: "task", id: "C", depth: 0, groupId: null },
		]);
	});

	test("renders a group row before its tasks, with ungrouped tasks last", () => {
		const work = group("g1", "Work", null, 0);
		const rows = buildGroupRows([work], { A: "g1", B: "g1" }, ["A", "X", "B"]);
		expect(rows).toEqual([
			{ kind: "group", id: "g1", name: "Work", depth: 0, collapsed: false, taskCount: 2, parentId: null },
			{ kind: "task", id: "A", depth: 1, groupId: "g1" },
			{ kind: "task", id: "B", depth: 1, groupId: "g1" },
			{ kind: "task", id: "X", depth: 0, groupId: null },
		]);
	});

	test("nests groups with child groups before their tasks and correct depths", () => {
		const root = group("r", "Root", null, 0);
		const child = group("c", "Child", "r", 0);
		const grandchild = group("gc", "Grandchild", "c", 0);
		const rows = buildGroupRows([root, child, grandchild], { T: "r", A: "c", G: "gc" }, ["T", "A", "G"]);
		expect(rows).toEqual([
			{ kind: "group", id: "r", name: "Root", depth: 0, collapsed: false, taskCount: 3, parentId: null },
			{ kind: "group", id: "c", name: "Child", depth: 1, collapsed: false, taskCount: 2, parentId: "r" },
			{ kind: "group", id: "gc", name: "Grandchild", depth: 2, collapsed: false, taskCount: 1, parentId: "c" },
			{ kind: "task", id: "G", depth: 3, groupId: "gc" },
			{ kind: "task", id: "A", depth: 2, groupId: "c" },
			{ kind: "task", id: "T", depth: 1, groupId: "r" },
		]);
	});

	test("keeps the taskCount of a collapsed group but hides its subtree", () => {
		const parent = group("g1", "Parent", null, 0, true);
		const child = group("g2", "Child", "g1", 0);
		const rows = buildGroupRows([parent, child], { A: "g2", T: "g1" }, ["A", "T"]);
		expect(rows).toEqual([
			{ kind: "group", id: "g1", name: "Parent", depth: 0, collapsed: true, taskCount: 2, parentId: null },
		]);
	});

	test("collapsing a nested group hides only its own subtree", () => {
		const root = group("r", "Root", null, 0);
		const collapsed = group("c", "Collapsed", "r", 0, true);
		const sibling = group("s", "Sibling", "r", 1);
		const rows = buildGroupRows([root, collapsed, sibling], { A: "c", B: "s", T: "r" }, ["A", "B", "T"]);
		expect(rows).toEqual([
			{ kind: "group", id: "r", name: "Root", depth: 0, collapsed: false, taskCount: 3, parentId: null },
			{ kind: "group", id: "c", name: "Collapsed", depth: 1, collapsed: true, taskCount: 1, parentId: "r" },
			{ kind: "group", id: "s", name: "Sibling", depth: 1, collapsed: false, taskCount: 1, parentId: "r" },
			{ kind: "task", id: "B", depth: 2, groupId: "s" },
			{ kind: "task", id: "T", depth: 1, groupId: "r" },
		]);
	});

	test("treats a membership pointing at an unknown group as ungrouped", () => {
		const solo = group("g1", "Solo", null, 0);
		const rows = buildGroupRows([solo], { A: "ghost", B: "", C: "g1" }, ["A", "B", "C"]);
		expect(rows).toEqual([
			{ kind: "group", id: "g1", name: "Solo", depth: 0, collapsed: false, taskCount: 1, parentId: null },
			{ kind: "task", id: "C", depth: 1, groupId: "g1" },
			{ kind: "task", id: "A", depth: 0, groupId: null },
			{ kind: "task", id: "B", depth: 0, groupId: null },
		]);
	});

	test("orders sibling groups by order, then name, then id", () => {
		const rows = buildGroupRows(
			[
				group("z", "Zeta", null, 1),
				group("b", "Beta", null, 0),
				group("a", "Alpha", null, 0),
				group("id-b", "Same", null, 0),
				group("id-a", "Same", null, 0),
			],
			{},
			[],
		);
		expect(rows.map((row) => row.id)).toEqual(["a", "b", "id-a", "id-b", "z"]);
	});

	test("treats a group with a missing parent as root-level and never emits a group twice", () => {
		const orphan = group("orphan", "Orphan", "missing", 0);
		const child = group("child", "Child", "orphan", 0);
		const rows = buildGroupRows([orphan, child, orphan], { A: "child" }, ["A"]);
		expect(rows).toEqual([
			{ kind: "group", id: "orphan", name: "Orphan", depth: 0, collapsed: false, taskCount: 1, parentId: "missing" },
			{ kind: "group", id: "child", name: "Child", depth: 1, collapsed: false, taskCount: 1, parentId: "orphan" },
			{ kind: "task", id: "A", depth: 2, groupId: "child" },
		]);
	});
});

describe("findGroup", () => {
	test("finds a group by id", () => {
		const target = group("g1", "One", null, 0);
		expect(findGroup([group("g2", "Two", null, 0), target], "g1")).toBe(target);
		expect(findGroup([target], "nope")).toBeUndefined();
	});
});

describe("collectDescendantGroupIds", () => {
	test("returns the full subtree in sibling order, excluding the root", () => {
		const groups = [
			group("r", "Root", null, 0),
			group("c1", "First", "r", 0),
			group("c2", "Nested", "c1", 0),
			group("c3", "Second", "r", 1),
		];
		expect(collectDescendantGroupIds(groups, "r")).toEqual(["c1", "c2", "c3"]);
		expect(collectDescendantGroupIds(groups, "c2")).toEqual([]);
	});

	test("is cycle-safe", () => {
		const groups = [group("x", "X", "y", 0), group("y", "Y", "x", 0)];
		expect(collectDescendantGroupIds(groups, "x")).toEqual(["y"]);
		expect(collectDescendantGroupIds(groups, "y")).toEqual(["x"]);
	});
});

describe("setCollapsed", () => {
	test("sets the flag only for the given ids and preserves other fields", () => {
		const root = group("r", "Root", null, 0);
		const first = group("c1", "First", "r", 0);
		const second = group("c2", "Second", "r", 1);
		const groups = [root, first, second];
		const updated = setCollapsed(groups, ["c1", "c2"], true);
		expect(updated).not.toBe(groups);
		expect(updated.map((item) => item.collapsed)).toEqual([false, true, true]);
		expect(updated[0]).toBe(root);
		expect(updated[1]).toEqual({ ...first, collapsed: true });
		const expanded = setCollapsed(updated, ["c1"], false);
		expect(expanded.map((item) => item.collapsed)).toEqual([false, false, true]);
	});
});
