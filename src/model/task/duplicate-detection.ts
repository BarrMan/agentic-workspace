import type { Task } from "../types.ts";
import { taskIdKey } from "./task-id.ts";

export type DuplicateGroup = {
	id: string;
	tasks: Task[];
};

/** Duplicate, drifted, and unreadable findings for draft files. */
export type DraftIdentityFindings = {
	duplicates: Array<{ id: string; paths: string[] }>;
	unreadable: string[];
	drifted: Array<{ path: string; frontmatterId: string; filenameId: string }>;
};

export function detectDuplicateTaskIds(tasks: Task[]): DuplicateGroup[] {
	const byId = new Map<string, Task[]>();
	for (const task of tasks) {
		const key = taskIdKey(task.id);
		const group = byId.get(key) ?? [];
		group.push(task);
		byId.set(key, group);
	}
	return Array.from(byId.entries())
		.filter(([, group]) => group.length > 1)
		.map(([, group]) => ({
			id: group[0]?.id ?? "",
			tasks: [...group].sort((left, right) =>
				(left.filePath ?? left.title).localeCompare(right.filePath ?? right.title),
			),
		}))
		.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
}

export function formatDuplicateTaskIdWarning(groups: DuplicateGroup[]): string {
	const duplicateCount = groups.reduce((total, group) => total + group.tasks.length, 0);
	const lines = [
		`WARNING: ${groups.length} duplicate task ID ${groups.length === 1 ? "group affects" : "groups affect"} ${duplicateCount} files.`,
		"Some task views may hide files and ID-based commands are blocked until the collision is repaired.",
	];
	for (const group of groups) {
		lines.push(`  ${group.id}:`);
		for (const task of group.tasks) {
			lines.push(`    - ${task.filePath ?? task.title}`);
		}
	}
	lines.push("Remove the conflicting files, then retry.");
	return lines.join("\n");
}
