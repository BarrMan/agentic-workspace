export function assigneeComparisonKey(value: string): string {
	return value.trim().replace(/^@/, "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeAssignees(values: string[] | undefined): string[] {
	if (!values) return [];
	const seen = new Set<string>();
	return values.reduce<string[]>((normalized, value) => {
		const display = value.trim();
		const key = assigneeComparisonKey(display);
		if (key && !seen.has(key)) {
			seen.add(key);
			normalized.push(display);
		}
		return normalized;
	}, []);
}

export function formatAssignee(value: string): string | null {
	const display = value.trim();
	return display ? (display.startsWith("@") ? display : `@${display}`) : null;
}
