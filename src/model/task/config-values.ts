import { comparisonKey } from "../../lib/comparison-key.ts";

export function normalizeConfiguredValues(configured: readonly string[]): string[] {
	const values: string[] = [];
	const seen = new Set<string>();

	for (const entry of configured) {
		const value = String(entry ?? "").trim();
		const normalized = comparisonKey(value);
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		values.push(value);
	}

	return values;
}

export function resolveConfiguredValue(
	value: string | null | undefined,
	values: readonly string[],
): string | undefined {
	const normalized = comparisonKey(value);
	return normalized ? values.find((candidate) => comparisonKey(candidate) === normalized) : undefined;
}

export function resolveConfiguredValues(
	inputs: readonly string[],
	values: readonly string[],
): { values: string[]; invalid: string[] } {
	const resolved: string[] = [];
	const invalid: string[] = [];
	const seen = new Set<string>();

	for (const input of inputs) {
		const canonical = resolveConfiguredValue(input, values);
		if (!canonical) {
			invalid.push(input);
			continue;
		}
		const normalized = comparisonKey(canonical);
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		resolved.push(canonical);
	}

	return { values: resolved, invalid };
}

export function matchesConfiguredFilter(
	value: string | null | undefined,
	filter: string | readonly string[] | null | undefined,
): boolean {
	const filters = typeof filter === "string" ? [filter] : (filter ?? []);
	const allowed = new Set(filters.map(comparisonKey).filter((key): key is string => Boolean(key)));
	if (allowed.size === 0) {
		return true;
	}
	const normalized = comparisonKey(value);
	return normalized ? allowed.has(normalized) : false;
}
