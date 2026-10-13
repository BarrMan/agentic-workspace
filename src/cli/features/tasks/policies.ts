import type { Core } from "../../../index.ts";
import { resolveMilestoneInputForStorage } from "../../../utils/milestone-storage.ts";

export const TASK_SORT_FIELDS = ["priority", "id", "ordinal", "newest"];
export const TASK_SORT_FIELD_LIST = TASK_SORT_FIELDS.join(", ");

export function printMissingRequiredArgument(argumentName: string): void {
	console.error(`error: missing required argument '${argumentName}'`);
	process.exitCode = 1;
}

export function formatTaskEditError(error: unknown, taskId: string, commandKind = "task"): string {
	const message = error instanceof Error ? error.message : String(error);
	if (message.startsWith("Invalid index:"))
		return `${message} Try 'backlog ${commandKind} edit ${taskId} --help' for index options.`;
	if (
		message.includes(" not found") &&
		(message.startsWith("Acceptance criterion ") || message.startsWith("Definition of Done item "))
	) {
		return `${message}\nRun 'backlog ${commandKind} view ${taskId} --plain' to inspect indexes, or 'backlog ${commandKind} edit ${taskId} --help' for edit options.`;
	}
	return message;
}

export async function resolveCliMilestoneInput(core: Core, milestone: string): Promise<string> {
	const [activeMilestones, archivedMilestones] = await Promise.all([
		core.filesystem.listMilestones(),
		core.filesystem.listArchivedMilestones(),
	]);
	return resolveMilestoneInputForStorage(milestone, activeMilestones, archivedMilestones);
}
