export interface ParsedTaskId {
	prefix: string;
	segments: string[];
}

export function parseTaskId(value: string, prefix?: string): ParsedTaskId | null {
	const separator = value.indexOf("-");
	if (separator < 1) return null;
	const idPrefix = value.slice(0, separator);
	const body = value.slice(separator + 1);
	if (!/^[A-Za-z]+$/.test(idPrefix) || (prefix && idPrefix.toLowerCase() !== prefix.toLowerCase())) return null;
	if (!/^\d+(?:\.\d+)*$/.test(body)) return null;
	return { prefix: idPrefix, segments: body.split(".") };
}

export function taskIdBody(value: string, prefix?: string): string | null {
	if (prefix) {
		if (!value.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)) return null;
		return value.slice(prefix.length + 1);
	}
	const separator = value.indexOf("-");
	if (separator < 1 || !/^[A-Za-z]+$/.test(value.slice(0, separator))) return null;
	return value.slice(separator + 1);
}

export function isNumericTaskIdSegment(value: string): boolean {
	return /^\d+$/.test(value);
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
