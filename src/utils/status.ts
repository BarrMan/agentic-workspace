import { DEFAULT_IN_PROGRESS_STATUS, DEFAULT_STATUSES } from "../constants/index.ts";

type StatusConfigReader = { getStoredConfig(): Promise<{ statuses?: string[] } | null> };

/**
 * The one status comparison key: trims and lowercases, preserving internal whitespace.
 * Use it for equality, filtering, and lane matching so every surface compares statuses alike.
 */
export function statusComparisonKey(status: string | null | undefined): string {
	return (status ?? "").trim().toLowerCase();
}

/**
 * Whitespace-collapsing key for canonical status lookup only. `"In Progress"` and `"InProgress"`
 * resolve to the same configured label, while comparison keeps them distinct (see terminal status).
 */
export function statusLookupKey(status: string | null | undefined): string {
	return statusComparisonKey(status).replace(/\s+/g, "");
}

/**
 * Resolve the configured active-work status: the canonical `In Progress` by name when it is
 * configured, otherwise the second configured status. Returns undefined when no such slot exists.
 * Used to move a task into active work when it gains a live agent session.
 */
export function resolveInProgressStatus(statuses: readonly string[] | undefined): string | undefined {
	const list = statuses && statuses.length > 0 ? statuses : [...DEFAULT_STATUSES];
	const normalizedTarget = statusLookupKey(DEFAULT_IN_PROGRESS_STATUS);
	const byName = list.find((status) => statusLookupKey(status) === normalizedTarget);
	if (byName) return byName;
	return list.length > 1 ? list[1] : undefined;
}

/**
 * Load valid statuses from project configuration.
 */
export async function getValidStatuses(core: StatusConfigReader): Promise<string[]> {
	const config = await core.getStoredConfig();
	return config?.statuses && config.statuses.length > 0 ? config.statuses : [...DEFAULT_STATUSES];
}

/**
 * Find the canonical status (matching config casing) for a given input.
 * Loads configured statuses and matches case-insensitively and space-insensitively.
 * `allowedStatuses` narrows the match set (e.g. drafts, which only accept Draft).
 * Returns the canonical value or null if no match is found.
 *
 * Examples:
 * - "todo" matches "To Do"
 * - "in progress" matches "In Progress"
 * - "DONE" matches "Done"
 */
export async function getCanonicalStatus(
	input: string | undefined,
	core: StatusConfigReader,
	allowedStatuses?: string[],
): Promise<string | null> {
	if (!input) return null;
	const statuses = allowedStatuses ?? (await getValidStatuses(core));
	const normalized = statusLookupKey(input);
	if (!normalized) return null;
	for (const s of statuses) {
		if (statusLookupKey(s) === normalized) return s; // preserve configured casing
	}
	return null;
}

export async function getCanonicalStatuses(
	inputs: readonly string[],
	core: StatusConfigReader,
	options: { extraStatuses?: readonly string[] } = {},
): Promise<{ values: string[]; invalid: string[]; validStatuses: string[] }> {
	const configuredStatuses = await getValidStatuses(core);
	const statuses: string[] = [];
	const seenValidStatuses = new Set<string>();
	for (const status of [...(options.extraStatuses ?? []), ...configuredStatuses]) {
		const key = statusLookupKey(status);
		if (seenValidStatuses.has(key)) {
			continue;
		}
		seenValidStatuses.add(key);
		statuses.push(status);
	}
	const canonicalByNormalized = new Map(statuses.map((status) => [statusLookupKey(status), status] as const));
	const values: string[] = [];
	const invalid: string[] = [];
	const seen = new Set<string>();

	for (const input of inputs) {
		const raw = String(input ?? "").trim();
		if (!raw) {
			continue;
		}
		const canonical = canonicalByNormalized.get(statusLookupKey(raw));
		if (!canonical) {
			invalid.push(raw);
			continue;
		}
		const key = statusComparisonKey(canonical);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		values.push(canonical);
	}

	return { values, invalid, validStatuses: statuses };
}

/**
 * Format a list of valid statuses for display.
 */
export function formatValidStatuses(configuredStatuses: string[]): string {
	return configuredStatuses.join(", ");
}
