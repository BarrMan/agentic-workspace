import type { GroupMembership, TaskGroup } from "../../agent-workspace/group-store.ts";

export type GroupRow =
	| {
			readonly kind: "group";
			readonly id: string;
			readonly name: string;
			readonly depth: number;
			readonly collapsed: boolean;
			readonly taskCount: number;
			readonly parentId: string | null;
	  }
	| { readonly kind: "task"; readonly id: string; readonly depth: number; readonly groupId: string | null };

function compareGroups(a: TaskGroup, b: TaskGroup): number {
	if (a.order !== b.order) return a.order - b.order;
	const byName = a.name.localeCompare(b.name);
	if (byName !== 0) return byName;
	return a.id.localeCompare(b.id);
}

function indexChildGroups(
	groups: readonly TaskGroup[],
	groupsById: ReadonlyMap<string, TaskGroup>,
): Map<string, TaskGroup[]> {
	const childGroups = new Map<string, TaskGroup[]>();
	for (const group of groups) {
		const { parentId } = group;
		if (parentId === null || !groupsById.has(parentId)) continue;
		const siblings = childGroups.get(parentId);
		if (siblings) siblings.push(group);
		else childGroups.set(parentId, [group]);
	}
	return childGroups;
}

/** Flatten groups + membership + ordered task ids into the visible row list. */
export function buildGroupRows(
	groups: readonly TaskGroup[],
	membership: GroupMembership,
	orderedTaskIds: readonly string[],
): GroupRow[] {
	const groupsById = new Map<string, TaskGroup>();
	for (const group of groups) groupsById.set(group.id, group);

	const childGroups = indexChildGroups(groups, groupsById);
	const rootGroups = groups
		.filter((group) => group.parentId === null || !groupsById.has(group.parentId))
		.sort(compareGroups);

	const tasksByGroup = new Map<string, string[]>();
	const ungroupedTaskIds: string[] = [];
	for (const taskId of orderedTaskIds) {
		const groupId = membership[taskId];
		if (groupId && groupsById.has(groupId)) {
			const members = tasksByGroup.get(groupId);
			if (members) members.push(taskId);
			else tasksByGroup.set(groupId, [taskId]);
		} else {
			ungroupedTaskIds.push(taskId);
		}
	}

	const taskCounts = new Map<string, number>();
	const countTasks = (groupId: string, seen: Set<string>): number => {
		const cached = taskCounts.get(groupId);
		if (cached !== undefined) return cached;
		if (seen.has(groupId)) return 0;
		seen.add(groupId);
		let total = tasksByGroup.get(groupId)?.length ?? 0;
		for (const child of childGroups.get(groupId) ?? []) total += countTasks(child.id, seen);
		seen.delete(groupId);
		taskCounts.set(groupId, total);
		return total;
	};

	const rows: GroupRow[] = [];
	const emitted = new Set<string>();
	const emitGroup = (group: TaskGroup, depth: number): void => {
		if (emitted.has(group.id)) return;
		emitted.add(group.id);
		rows.push({
			kind: "group",
			id: group.id,
			name: group.name,
			depth,
			collapsed: group.collapsed,
			taskCount: countTasks(group.id, new Set()),
			parentId: group.parentId,
		});
		if (group.collapsed) return;
		for (const child of [...(childGroups.get(group.id) ?? [])].sort(compareGroups)) emitGroup(child, depth + 1);
		for (const taskId of tasksByGroup.get(group.id) ?? [])
			rows.push({ kind: "task", id: taskId, depth: depth + 1, groupId: group.id });
	};

	for (const group of rootGroups) emitGroup(group, 0);
	for (const taskId of ungroupedTaskIds) rows.push({ kind: "task", id: taskId, depth: 0, groupId: null });
	return rows;
}

export function findGroup(groups: readonly TaskGroup[], id: string): TaskGroup | undefined {
	return groups.find((group) => group.id === id);
}

/** All descendant group ids of rootId, recursively (excludes rootId), cycle-safe. */
export function collectDescendantGroupIds(groups: readonly TaskGroup[], rootId: string): string[] {
	const groupsById = new Map<string, TaskGroup>();
	for (const group of groups) groupsById.set(group.id, group);

	const childGroups = indexChildGroups(groups, groupsById);
	const descendants: string[] = [];
	const seen = new Set<string>([rootId]);
	const visit = (parentId: string): void => {
		for (const child of [...(childGroups.get(parentId) ?? [])].sort(compareGroups)) {
			if (seen.has(child.id)) continue;
			seen.add(child.id);
			descendants.push(child.id);
			visit(child.id);
		}
	};
	visit(rootId);
	return descendants;
}

/** Return a new groups array with `collapsed` set for the given ids. */
export function setCollapsed(groups: readonly TaskGroup[], ids: readonly string[], collapsed: boolean): TaskGroup[] {
	const targets = new Set(ids);
	return groups.map((group) => (targets.has(group.id) ? { ...group, collapsed } : group));
}
