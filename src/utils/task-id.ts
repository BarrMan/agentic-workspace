const TASK_ID_BODY_PATTERN = String.raw`\d+(?:\.\d+)*`;
const TASK_ID_PATTERN = new RegExp(`^([A-Za-z]+)-(${TASK_ID_BODY_PATTERN})$`);

export interface ParsedTaskId {
	prefix: string;
	segments: string[];
}

export function parseTaskId(value: string, prefix?: string): ParsedTaskId | null {
	const match = TASK_ID_PATTERN.exec(value);
	if (!match?.[1] || !match[2] || (prefix && match[1].toLowerCase() !== prefix.toLowerCase())) return null;
	return { prefix: match[1], segments: match[2].split(".") };
}

export function taskIdBody(value: string, prefix?: string): string | null {
	const separator = value.indexOf("-");
	if (separator < 1) return null;
	const idPrefix = value.slice(0, separator);
	if (!/^[A-Za-z]+$/.test(idPrefix) || (prefix && idPrefix.toLowerCase() !== prefix.toLowerCase())) return null;
	return value.slice(separator + 1);
}

export function taskIdRegex(prefix: string): RegExp {
	return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(${TASK_ID_BODY_PATTERN})`, "i");
}

export function isNumericTaskIdSegment(value: string): boolean {
	return /^\d+$/.test(value);
}

export function isValidTaskId(value: string): boolean {
	return parseTaskId(value) !== null;
}

export function isValidDraftId(value: string): boolean {
	return /^DRAFT-[A-Z0-9]+$/i.test(value);
}

/**
 * The one comparison key for task identity: surrounding whitespace is ignored and case is
 * folded. Numeric segments keep their exact spelling, so TASK-01 and TASK-1 stay distinct.
 * Stored and displayed IDs are left untouched.
 */
export function taskIdKey(value: string): string {
	return value.trim().toUpperCase();
}

export function taskIdsEqual(left: string, right: string): boolean {
	return taskIdKey(left) === taskIdKey(right);
}
