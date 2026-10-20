/** Generic string-list normalization shared by CLI input and task updates. */

export function normalizeStringList(values: readonly string[] | undefined): string[] | undefined {
	if (!values) return undefined;
	const unique = Array.from(new Set(values.map((value) => String(value).trim()).filter((value) => value.length > 0)));
	return unique.length > 0 ? unique : undefined;
}

export function toStringArray(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((item) => String(item));
	if (value === undefined || value === null) return [];
	return [String(value)];
}

export function stringArraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((value, index) => value === b[index]);
}
