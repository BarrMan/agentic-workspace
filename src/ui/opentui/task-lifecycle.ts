import { DEFAULT_STATUSES } from "../../constants/index.ts";
import type { Core } from "../../core/backlog.ts";
import type { Task } from "../../types/index.ts";
import { formatDependencyCleanupMessage } from "../../utils/dependency-graph.ts";
import { getTerminalStatus, isTerminalStatus } from "../../utils/terminal-status.ts";

export type CompleteTaskFromTuiResult =
	| { success: true }
	| { success: false; reason: "not-terminal"; terminalStatus: string }
	| { success: false; reason: "failed" };

/**
 * Transient TUI line for a finished archive: the confirmation, plus the shared cleanup report
 * when other records lost a reference to the archived ID.
 */
export function formatTaskArchivedMessage(taskId: string, cleanedTaskIds: readonly string[]): string {
	const cleanup = formatDependencyCleanupMessage(taskId, cleanedTaskIds);
	return `Archived ${taskId}${cleanup ? `. ${cleanup}` : ""}`;
}

export function formatTaskCompletionBlockedMessage(taskId: string, terminalStatus: string): string {
	return `Task ${taskId} is not ${terminalStatus}. Set status to "${terminalStatus}" before completing it.`;
}

export async function completeTaskFromTui(core: Core, task: Task): Promise<CompleteTaskFromTuiResult> {
	const config = await core.filesystem.loadConfig();
	const statuses = config?.statuses ?? [...DEFAULT_STATUSES];
	const terminalStatus = getTerminalStatus(statuses) ?? "Done";

	if (!isTerminalStatus(task.status, statuses)) {
		return { success: false, reason: "not-terminal", terminalStatus };
	}

	const success = await core.completeTask(task.id);
	return success ? { success: true } : { success: false, reason: "failed" };
}

export type TaskLifecycleOutcome =
	| { kind: "blocked"; message: string }
	| { kind: "completed"; message: string }
	| { kind: "failed"; message: string };

export async function runTaskLifecycleAction(
	core: Core,
	task: Task,
	action: "complete" | "archive",
): Promise<TaskLifecycleOutcome> {
	if (task.branch) return { kind: "blocked", message: `Cannot ${action} task from branch "${task.branch}".` };
	try {
		const archived = action === "archive" ? await archiveTask(core, task) : undefined;
		const result = archived ? { ...archived, reason: "failed" as const } : await completeTaskFromTui(core, task);
		if (result.success)
			return {
				kind: "completed",
				message: archived
					? formatTaskArchivedMessage(task.id, archived.cleanedTaskIds)
					: `Moved ${task.id} to completed`,
			};
		if (action === "complete" && result.reason === "not-terminal") {
			return { kind: "blocked", message: formatTaskCompletionBlockedMessage(task.id, result.terminalStatus) };
		}
		return { kind: "failed", message: `Failed to ${action} ${task.id}` };
	} catch (error) {
		return {
			kind: "failed",
			message: `Error ${action === "complete" ? "completing" : "archiving"} task: ${error instanceof Error ? error.message : "Unknown error"}`,
		};
	}
}

async function archiveTask(core: Core, task: Task) {
	return core.archiveTask(task.id);
}
