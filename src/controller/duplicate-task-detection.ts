import { basename, dirname } from "node:path";
import { type DuplicateGroup, detectDuplicateTaskIds } from "../model/task/duplicate-detection.ts";
import { taskIdsEqual } from "../model/task/task-id.ts";
import type { Task } from "../model/types.ts";
import type { Core } from "./agentic-workspace.ts";
import type { TaskCorpusSnapshot } from "./task-loader.ts";

function withLocation(task: Task, location: "active" | "completed", relativePath: (path: string) => string): Task {
	return {
		...task,
		filePath: task.filePath ? relativePath(task.filePath) : undefined,
		source: location === "completed" ? "completed" : "local",
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function findLocalDuplicateTaskIds(core: Core, snapshot?: TaskCorpusSnapshot): Promise<DuplicateGroup[]> {
	let activeTasks: Task[] = snapshot?.activeTasks ?? [];
	let completedTasks: Task[] = snapshot?.completedTasks ?? [];
	if (!snapshot) {
		try {
			const corpus = await core.loadTaskSnapshot();
			activeTasks = corpus.activeTasks;
			completedTasks = corpus.completedTasks;
		} catch {
			// The direct record scan below can still diagnose well-formed canonical records individually.
		}
	}
	const relativePath = (path: string) => core.projectRelativePath(path);
	const tasks = [
		...activeTasks.map((task) => withLocation(task, "active", relativePath)),
		...completedTasks.map((task) => withLocation(task, "completed", relativePath)),
	];
	for (const record of await core.scanStoredTaskRecords()) {
		if (!record.task) {
			console.warn(
				`Skipping unreadable or unparseable task record ${relativePath(record.path)}: ${errorMessage(record.error)}`,
			);
			continue;
		}
		const task = withLocation(record.task, record.location, relativePath);
		task.filePath = relativePath(record.path);
		const folderId = basename(dirname(record.path));
		if (!taskIdsEqual(folderId, task.id)) {
			(task as Task & { containerMismatch?: string }).containerMismatch =
				`${task.filePath}: container identity does not match task ID ${task.id}.`;
		}
		if (!tasks.some((candidate) => candidate.filePath === task.filePath)) tasks.push(task);
	}
	return detectDuplicateTaskIds(tasks);
}
