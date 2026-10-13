import type { Task } from "../../../types/index.ts";
import { formatUtcDateForDisplay } from "../../../utils/utc-date-display.ts";

export function formatTaskListRow(task: Task, includeStatus = false): string {
	const priority = task.priority ? `[${task.priority.toUpperCase()}] ` : "";
	const type = task.type ? `[${task.type}] ` : "";
	const status = includeStatus && task.status ? ` (${task.status})` : "";
	const dueDate = task.dueDate ? ` (due ${formatUtcDateForDisplay(task.dueDate)})` : "";
	return `  ${priority}${type}${task.id} - ${task.title}${status}${dueDate}`;
}

export function groupTaskListByStatus(tasks: Task[], statuses: string[]): Array<{ status: string; tasks: Task[] }> {
	const canonical = new Map(statuses.map((status) => [status.toLowerCase(), status]));
	const groups = new Map<string, Task[]>();
	for (const task of tasks) {
		const status = (task.status || "").trim();
		const key = canonical.get(status.toLowerCase()) || status;
		groups.set(key, [...(groups.get(key) ?? []), task]);
	}
	const ordered = [
		...statuses.filter((status) => groups.has(status)),
		...[...groups.keys()].filter((status) => !statuses.includes(status)),
	];
	return ordered.map((status) => ({ status, tasks: groups.get(status) ?? [] }));
}

export function printTaskListGroupedByStatus(tasks: Task[], statuses: string[]): void {
	for (const group of groupTaskListByStatus(tasks, statuses)) {
		process.stdout.write(`${group.status || "No Status"}:\n`);
		for (const task of group.tasks) process.stdout.write(`${formatTaskListRow(task)}\n`);
		process.stdout.write("\n");
	}
}
