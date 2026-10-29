export interface ParsedTaskId {
	prefix: string;
	segments: string[];
}

export function parseTaskId(value: string, prefix?: string): ParsedTaskId | null {
	const separator = value.indexOf("-");
	if (separator < 1) return null;
	const idPrefix = value.slice(0, separator);
	const body = value.slice(separator + 1);
	if (!/^[A-Za-z]+$/.test(idPrefix) || (prefix && idPrefix !== prefix)) return null;
	if (!/^\d+(?:\.\d+)*$/.test(body)) return null;
	return { prefix: idPrefix, segments: body.split(".") };
}

export function isValidTaskId(value: string): boolean {
	return parseTaskId(value) !== null;
}

export function taskIdBody(value: string, prefix?: string): string | null {
	if (prefix) {
		if (!value.startsWith(`${prefix}-`)) return null;
		return value.slice(prefix.length + 1);
	}
	const separator = value.indexOf("-");
	if (separator < 1 || !/^[A-Za-z]+$/.test(value.slice(0, separator))) return null;
	return value.slice(separator + 1);
}

export function isNumericTaskIdSegment(value: string): boolean {
	return /^\d+$/.test(value);
}
