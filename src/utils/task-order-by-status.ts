/**
 * Orders tasks into status groups: configured statuses first, in their configured order, each group
 * preserving the input order. Tasks whose status is not configured are appended after every known
 * status, grouped in first-seen order. Status matching is case-insensitive.
 *
 * The workspace flat list uses this ordering so the view and the controller agree on which task is
 * the first of any status group.
 */
export function orderTasksByStatus<T extends { readonly status: string }>(
	tasks: readonly T[],
	statuses: readonly string[],
): T[] {
	const buckets = new Map<string, T[]>();
	for (const status of statuses) {
		const key = status.toLowerCase();
		if (!buckets.has(key)) buckets.set(key, []);
	}
	for (const task of tasks) {
		const key = task.status.toLowerCase();
		const bucket = buckets.get(key);
		if (bucket) bucket.push(task);
		else buckets.set(key, [task]);
	}
	const ordered: T[] = [];
	for (const bucket of buckets.values()) ordered.push(...bucket);
	return ordered;
}
