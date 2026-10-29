import type { Core } from "../../controller/agentic-workspace.ts";
import { formatDependencyCleanupMessage } from "../../model/task/dependency-graph.ts";
import type { Task } from "../../model/types.ts";

/**
 * Transient TUI line for a finished archive: the confirmation, plus the shared cleanup report
 * when other records lost a reference to the archived ID.
 */
function formatTaskArchivedMessage(taskId: string, cleanedTaskIds: readonly string[]): string {
	const cleanup = formatDependencyCleanupMessage(taskId, cleanedTaskIds);
	return `Archived ${taskId}${cleanup ? `. ${cleanup}` : ""}`;
}

export type TaskLifecycleOutcome = { kind: "completed"; message: string } | { kind: "failed"; message: string };

export async function runTaskLifecycleAction(core: Core, task: Task, action: "archive"): Promise<TaskLifecycleOutcome> {
	try {
		const archived = await core.tasks.archive(task.id);
		if (archived.success)
			return {
				kind: "completed",
				message: formatTaskArchivedMessage(task.id, archived.cleanedTaskIds),
			};
		return { kind: "failed", message: `Failed to ${action} ${task.id}` };
	} catch (error) {
		return {
			kind: "failed",
			message: `Error archiving task: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}
