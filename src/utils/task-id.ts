const TASK_ID_PATTERN = /^[A-Za-z]+-\d+(?:\.\d+)*$/;

export function isValidTaskId(value: string): boolean {
	return TASK_ID_PATTERN.test(value);
}

export function isValidDraftId(value: string): boolean {
	return /^DRAFT-[A-Z0-9]+$/i.test(value);
}

export function taskIdsEqual(left: string, right: string): boolean {
	return left.toUpperCase() === right.toUpperCase();
}
