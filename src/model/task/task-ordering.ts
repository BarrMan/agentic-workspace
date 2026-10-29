import { getPriorityRank } from "./priority-config.ts";
import { statusComparisonKey } from "./status.ts";
import { parseTaskId as parseTaskIdSegments, taskIdBody } from "./task-id.ts";

/** Ordering and comparison over task IDs, ordinals, and priorities. */
export class TaskOrdering {
	/** Parse a task ID into numeric components for proper sorting, including decimal IDs. */
	static parseId(taskId: string): number[] {
		const numericPart = taskIdBody(taskId) ?? taskId;
		const parsed = parseTaskIdSegments(taskId);
		const dotParts = parsed?.segments ?? numericPart.split(".");
		const numericParts = dotParts.map((part) => {
			const num = Number.parseInt(part, 10);
			return Number.isNaN(num) ? null : num;
		});

		if (numericParts.every((n) => n !== null)) return numericParts as number[];

		const trailingNumberMatch = numericPart.match(/(\d+)$/);
		if (trailingNumberMatch) {
			const [, num] = trailingNumberMatch;
			return [Number.parseInt(num ?? "0", 10)];
		}
		return [0];
	}

	/** Compare two task IDs numerically; parents sort before children. */
	static compareIds(a: string, b: string): number {
		const aParts = TaskOrdering.parseId(a);
		const bParts = TaskOrdering.parseId(b);
		const maxLength = Math.max(aParts.length, bParts.length);
		for (let i = 0; i < maxLength; i++) {
			const aNum = aParts[i] ?? 0;
			const bNum = bParts[i] ?? 0;
			if (aNum !== bNum) return aNum - bNum;
		}
		return a.localeCompare(b);
	}

	/** Compare descending while keeping parents before children. */
	static compareIdsDescending(a: string, b: string): number {
		if (TaskOrdering.isAncestorId(a, b)) return -1;
		if (TaskOrdering.isAncestorId(b, a)) return 1;
		return TaskOrdering.compareIds(b, a);
	}

	static byId<T extends { id: string }>(items: T[]): T[] {
		return [...items].sort((a, b) => TaskOrdering.compareIds(a.id, b.id));
	}

	static byPriority<T extends { id: string; priority?: string }>(items: T[], priorityOrder?: readonly string[]): T[] {
		return [...items].sort((a, b) => TaskOrdering.comparePriorityThenId(a, b, priorityOrder));
	}

	static byOrdinal<T extends { id: string; ordinal?: number }>(items: T[]): T[] {
		return [...items].sort((a, b) => TaskOrdering.compareOrdinals(a, b) || TaskOrdering.compareIds(a.id, b.id));
	}

	static compareOrdinals<T extends { ordinal?: number }>(a: T, b: T): number {
		if (a.ordinal !== undefined && b.ordinal === undefined) return -1;
		if (a.ordinal === undefined && b.ordinal !== undefined) return 1;
		if (a.ordinal !== undefined && b.ordinal !== undefined && a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
		return 0;
	}

	static byOrdinalAndPriority<T extends { id: string; ordinal?: number; priority?: string }>(
		items: T[],
		priorityOrder?: readonly string[],
	): T[] {
		return [...items].sort((a, b) => {
			const ordinalComparison = TaskOrdering.compareOrdinals(a, b);
			return ordinalComparison !== 0 ? ordinalComparison : TaskOrdering.comparePriorityThenId(a, b, priorityOrder);
		});
	}

	static newestFirst<T extends { id: string; ordinal?: number }>(items: T[]): T[] {
		return [...items].sort((a, b) => {
			if (typeof a.ordinal === "number" && typeof b.ordinal === "number") {
				if (a.ordinal !== b.ordinal) return b.ordinal - a.ordinal;
			} else if (typeof a.ordinal === "number") return -1;
			else if (typeof b.ordinal === "number") return 1;
			return TaskOrdering.compareIdsDescending(a.id, b.id);
		});
	}

	static sort<T extends { id: string; priority?: string; ordinal?: number }>(
		items: T[],
		sortField: string,
		priorityOrder?: readonly string[],
	): T[] {
		switch (sortField?.toLowerCase()) {
			case "newest":
				return TaskOrdering.newestFirst(items);
			case "priority":
				return TaskOrdering.byPriority(items, priorityOrder);
			case "id":
				return TaskOrdering.byId(items);
			case "ordinal":
				return TaskOrdering.byOrdinal(items);
			default:
				return TaskOrdering.byOrdinalAndPriority(items, priorityOrder);
		}
	}

	/** Projects a corpus into configured status columns with parent/child display order. */
	static boardColumns<T extends { id: string; status?: string; ordinal?: number; parentTaskId?: string }>(
		items: readonly T[],
		statuses: readonly string[],
	): Array<{ status: string; tasks: T[] }> {
		const orderedStatuses: string[] = [];
		const columns = new Map<string, T[]>();
		for (const status of statuses) {
			if (columns.has(statusComparisonKey(status))) continue;
			orderedStatuses.push(status);
			columns.set(statusComparisonKey(status), []);
		}
		for (const task of items) {
			const status = task.status ?? "";
			if (!status) continue;
			const key = statusComparisonKey(status);
			if (!columns.has(key)) {
				orderedStatuses.push(status);
				columns.set(key, []);
			}
			columns.get(key)?.push(task);
		}
		const byId = new Map(items.map((task) => [task.id, task]));
		return orderedStatuses.map((status) => ({
			status,
			tasks: TaskOrdering.orderColumn(columns.get(statusComparisonKey(status)) ?? [], byId),
		}));
	}

	private static orderColumn<T extends { id: string; status?: string; ordinal?: number; parentTaskId?: string }>(
		items: readonly T[],
		byId: ReadonlyMap<string, T>,
	): T[] {
		const topLevel: T[] = [];
		const childrenByParent = new Map<string, T[]>();
		const sorted = [...items].sort((a, b) => {
			const ordinal = TaskOrdering.compareOrdinals(b, a);
			return ordinal || TaskOrdering.compareIds(b.id, a.id);
		});
		for (const task of sorted) {
			const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
			if (parent && parent.status === task.status) {
				const children = childrenByParent.get(parent.id) ?? [];
				children.push(task);
				childrenByParent.set(parent.id, children);
			} else topLevel.push(task);
		}
		const result: T[] = [];
		const seen = new Set<string>();
		const visit = (task: T): void => {
			const key = task.id;
			if (seen.has(key)) return;
			seen.add(key);
			result.push(task);
			for (const child of (childrenByParent.get(key) ?? []).sort((a, b) => TaskOrdering.compareIds(a.id, b.id)))
				visit(child);
		};
		for (const task of topLevel) visit(task);
		// Cycles have no root; still display each task once.
		for (const task of sorted) visit(task);
		return result;
	}

	private static isAncestorId(parentId: string, childId: string): boolean {
		return childId.startsWith(`${parentId}.`);
	}

	private static comparePriorityThenId<T extends { id: string; priority?: string }>(
		a: T,
		b: T,
		priorityOrder?: readonly string[],
	): number {
		const difference = getPriorityRank(b.priority, priorityOrder) - getPriorityRank(a.priority, priorityOrder);
		return difference || TaskOrdering.compareIds(a.id, b.id);
	}
}
