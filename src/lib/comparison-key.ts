export function comparisonKey(value: string | null | undefined): string {
	return String(value ?? "")
		.trim()
		.toLowerCase();
}
