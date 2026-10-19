import { AmbiguousIdError } from "./entity-id.ts";

export class AmbiguousTaskIdError extends AmbiguousIdError {
	readonly taskId: string;

	constructor(taskId: string, candidates: string[]) {
		super("Task", taskId, candidates, "Remove the conflicting files, then retry.");
		this.name = "AmbiguousTaskIdError";
		this.taskId = taskId;
	}
}

export function isAmbiguousTaskIdError(error: unknown): error is AmbiguousTaskIdError {
	return error instanceof AmbiguousTaskIdError;
}
