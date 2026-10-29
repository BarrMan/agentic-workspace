export function formatTaskEditError(error: unknown, taskId: string, commandKind = "task"): string {
	const message = error instanceof Error ? error.message : String(error);
	if (message.startsWith("Invalid index:"))
		return `${message} Try 'agentic-workspace ${commandKind} edit ${taskId} --help' for index options.`;
	if (
		message.includes(" not found") &&
		(message.startsWith("Acceptance criterion ") || message.startsWith("Definition of Done item "))
	) {
		return `${message}\nRun 'agentic-workspace ${commandKind} view ${taskId} --plain' to inspect indexes, or 'agentic-workspace ${commandKind} edit ${taskId} --help' for edit options.`;
	}
	return message;
}
