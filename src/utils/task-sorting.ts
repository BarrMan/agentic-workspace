import { getPriorityRank } from "./priority-config.ts";

/**
 * Parse a task ID into its numeric components for proper sorting.
 * Handles both simple IDs (task-5) and decimal IDs (task-5.2.1).
 * Works with any prefix pattern (task-, draft-, JIRA-, etc.)
 */
export function parseTaskId(taskId: string): number[] {
	// Remove any prefix pattern (letters followed by dash) - handles task-, draft-, JIRA-, etc.
	const numericPart = taskId.replace(/^[a-zA-Z]+-/i, "");

	// Try to extract numeric parts from the ID
	// First check if it's a standard numeric ID (e.g., "1", "1.2", etc.)
	const dotParts = numericPart.split(".");
	const numericParts = dotParts.map((part) => {
		const num = Number.parseInt(part, 10);
		return Number.isNaN(num) ? null : num;
	});

	// If all parts are numeric, return them
	if (numericParts.every((n) => n !== null)) {
		return numericParts as number[];
	}

	// Otherwise, try to extract trailing number (e.g., "draft2" -> 2)
	const trailingNumberMatch = numericPart.match(/(\d+)$/);
	if (trailingNumberMatch) {
		const [, num] = trailingNumberMatch;
		return [Number.parseInt(num ?? "0", 10)];
	}

	// No numeric parts found, return 0 for consistent sorting
	return [0];
}

/**
 * Compare two task IDs numerically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 *
 * Examples:
 * - task-2 comes before task-10
 * - task-2 comes before task-2.1
 * - task-2.1 comes before task-2.2
 * - task-2.2 comes before task-2.10
 */
export function compareTaskIds(a: string, b: string): number {
	const aParts = parseTaskId(a);
	const bParts = parseTaskId(b);

	// Compare each numeric part
	const maxLength = Math.max(aParts.length, bParts.length);

	for (let i = 0; i < maxLength; i++) {
		const aNum = aParts[i] ?? 0;
		const bNum = bParts[i] ?? 0;

		if (aNum !== bNum) {
			return aNum - bNum;
		}
	}

	// All numeric parts are equal; use the original ID as a deterministic fallback.
	return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function isAncestorTaskId(parentId: string, childId: string): boolean {
	const parentParts = parseTaskId(parentId);
	const childParts = parseTaskId(childId);

	if (parentParts.length >= childParts.length) {
		return false;
	}

	return parentParts.every((part, index) => part === childParts[index]);
}

/**
 * Compare two task IDs in descending order while keeping parents before children.
 */
export function compareTaskIdsDescending(a: string, b: string): number {
	if (isAncestorTaskId(a, b)) {
		return -1;
	}
	if (isAncestorTaskId(b, a)) {
		return 1;
	}
	return compareTaskIds(b, a);
}

/**
 * Sort an array of objects by their task ID property numerically.
 * Returns a new sorted array without mutating the original.
 */
export function sortByTaskId<T extends { id: string }>(items: T[]): T[] {
	return [...items].sort((a, b) => compareTaskIds(a.id, b.id));
}

/**
 * Sort an array of tasks by their priority property.
 * Priority order defaults to high > medium > low > undefined.
 * Tasks with the same priority are sorted by task ID.
 */
export function sortByPriority<T extends { id: string; priority?: string }>(
	items: T[],
	priorityOrder?: readonly string[],
): T[] {
	return [...items].sort((a, b) => comparePriorityThenTaskId(a, b, priorityOrder));
}

/**
 * Sort an array of tasks by their ordinal property, then by task ID.
 * Tasks with ordinal values come before tasks without.
 * Tasks with the same ordinal (or both undefined) are sorted by task ID.
 */
export function sortByOrdinal<T extends { id: string; ordinal?: number }>(items: T[]): T[] {
	return [...items].sort((a, b) => compareOrdinals(a, b) || compareTaskIds(a.id, b.id));
}

export function compareOrdinals<T extends { ordinal?: number }>(a: T, b: T): number {
	if (a.ordinal !== undefined && b.ordinal === undefined) return -1;
	if (a.ordinal === undefined && b.ordinal !== undefined) return 1;
	if (a.ordinal !== undefined && b.ordinal !== undefined && a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
	return 0;
}

/**
 * Sort an array of tasks considering ordinal first, then priority, then ID.
 * This is the default sorting for the board view.
 */
export function sortByOrdinalAndPriority<T extends { id: string; ordinal?: number; priority?: string }>(
	items: T[],
	priorityOrder?: readonly string[],
): T[] {
	return [...items].sort((a, b) => {
		const ordinalComparison = compareOrdinals(a, b);
		if (ordinalComparison !== 0) return ordinalComparison;

		return comparePriorityThenTaskId(a, b, priorityOrder);
	});
}

/**
 * Sort an array of tasks newest-first: highest ordinal first, tasks without an
 * ordinal last, and descending task ID as the tie-break (parents before children).
 * This is the default ordering for task lists and the board.
 */
export function sortByNewestFirst<T extends { id: string; ordinal?: number }>(items: T[]): T[] {
	return [...items].sort((a, b) => {
		if (typeof a.ordinal === "number" && typeof b.ordinal === "number") {
			if (a.ordinal !== b.ordinal) return b.ordinal - a.ordinal;
		} else if (typeof a.ordinal === "number") {
			return -1;
		} else if (typeof b.ordinal === "number") {
			return 1;
		}
		return compareTaskIdsDescending(a.id, b.id);
	});
}

function comparePriorityThenTaskId<T extends { id: string; priority?: string }>(
	a: T,
	b: T,
	priorityOrder?: readonly string[],
): number {
	const priorityDifference = getPriorityRank(b.priority, priorityOrder) - getPriorityRank(a.priority, priorityOrder);
	return priorityDifference || compareTaskIds(a.id, b.id);
}

/**
 * Sort tasks by a specified field with fallback to task ID sorting.
 * Supported fields: 'newest', 'priority', 'id', 'ordinal'
 */
export function sortTasks<T extends { id: string; priority?: string; ordinal?: number }>(
	items: T[],
	sortField: string,
	priorityOrder?: readonly string[],
): T[] {
	switch (sortField?.toLowerCase()) {
		case "newest":
			return sortByNewestFirst(items);
		case "priority":
			return sortByPriority(items, priorityOrder);
		case "id":
			return sortByTaskId(items);
		case "ordinal":
			return sortByOrdinal(items);
		default:
			// Default to ordinal + priority sorting for board view
			return sortByOrdinalAndPriority(items, priorityOrder);
	}
}
