import { type FSWatcher, watch } from "node:fs";
import { join, matchesGlob } from "node:path";
import type { Task } from "../../model/types.ts";
import { TASK_RECORD_FILENAME, TASK_STORAGE_GLOBS } from "../task-layout.ts";

const TASK_WATCHER_MESSAGES = {
	MISSING_FILENAME: "Task watcher notification omitted a filename:",
	NOTIFICATION_FAILED: "Task watcher notification failed:",
	WATCH_FAILED: "Task watcher failed:",
} as const;

export type TaskLifecycle = "active" | "completed" | "archived";
export type TaskRecordChange = { filePath: string; lifecycle: TaskLifecycle; read: () => Promise<Task | null> };

export interface TaskWatcherCallbacks {
	onTaskAdded?: (task: Task) => void | Promise<void>;
	onTaskChanged?: (task: Task) => void | Promise<void>;
	onTaskRemoved?: (taskId: string) => void | Promise<void>;
	onArtifactChanged?: (event: { taskId: string; path: string }) => void | Promise<void>;
}

export interface TaskStorageWatcherCallbacks {
	onRecordChanged: (event: TaskRecordChange) => void | Promise<void>;
	onArtifactChanged: (event: { filePath: string }) => void | Promise<void>;
}

export type TaskRecordLocation = Pick<TaskRecordChange, "filePath" | "lifecycle">;
export type TaskDirectoryWatcherCallbacks = Omit<TaskStorageWatcherCallbacks, "onRecordChanged"> & {
	onRecordChanged: (event: TaskRecordLocation) => void | Promise<void>;
};

/** Filesystem notifications only; TasksService owns record reconciliation. */
export function watchTaskDirectories(
	directories: Array<{ path: string; lifecycle: TaskLifecycle }>,
	callbacks: TaskDirectoryWatcherCallbacks,
): { stop(): void } {
	const watchers: FSWatcher[] = [];
	try {
		for (const { path: directory, lifecycle } of directories) {
			const watcher = watch(directory, { recursive: true }, async (_event, filename) => {
				if (filename === null) {
					console.error(`${TASK_WATCHER_MESSAGES.MISSING_FILENAME} ${directory}`);
					return;
				}
				const changedPath = filename.toString();
				try {
					if (matchesGlob(changedPath, TASK_STORAGE_GLOBS.RECORDS)) {
						await callbacks.onRecordChanged({ filePath: join(directory, changedPath), lifecycle });
						return;
					}
					if (matchesGlob(changedPath, TASK_STORAGE_GLOBS.CONTAINERS)) {
						await callbacks.onRecordChanged({
							filePath: join(directory, changedPath, TASK_RECORD_FILENAME),
							lifecycle,
						});
						return;
					}
					if (matchesGlob(changedPath, TASK_STORAGE_GLOBS.ARTIFACTS))
						await callbacks.onArtifactChanged({ filePath: join(directory, changedPath) });
				} catch (error) {
					console.error(TASK_WATCHER_MESSAGES.NOTIFICATION_FAILED, error);
				}
			});
			watcher.on("error", (error) => console.error(TASK_WATCHER_MESSAGES.WATCH_FAILED, error));
			watchers.push(watcher);
		}
	} catch (error) {
		for (const watcher of watchers) watcher.close();
		throw error;
	}
	return {
		stop: () => {
			for (const watcher of watchers) watcher.close();
		},
	};
}
