export class TaskArchiveStatusError extends Error {
	constructor(taskId: string, terminalStatus: string) {
		super(
			`Task ${taskId} is ${terminalStatus}. Use Complete to move finished work to completed storage and preserve its links. Use: agentic-workspace task complete ${taskId}`,
		);
		this.name = "TaskArchiveStatusError";
	}
}
