import { DEFAULT_IN_PROGRESS_STATUS, DEFAULT_STATUSES } from "../constants.ts";

type StatusConfigReader = { storage: { loadConfig(): Promise<{ statuses?: string[] } | null> } };

/**
 * Statuses are configured labels, so equality and lookup use their exact stored spelling.
 */
export function statusComparisonKey(status: string | null | undefined): string {
	return status ?? "";
}

/**
 * Resolve the configured active-work status: the canonical `In Progress` by name when it is
 * configured, otherwise the second configured status. Returns undefined when no such slot exists.
 * Used to move a task into active work when it gains a live agent session.
 */
export function resolveInProgressStatus(statuses: readonly string[] | undefined): string | undefined {
	const list = statuses && statuses.length > 0 ? statuses : [...DEFAULT_STATUSES];
	const byName = list.find((status) => status === DEFAULT_IN_PROGRESS_STATUS);
	if (byName) return byName;
	return list.length > 1 ? list[1] : undefined;
}

/** Synchronous canonical-status lookup over an already resolved status list. */
export function findCanonicalStatus(input: string, statuses: readonly string[]): string | null {
	return statuses.includes(input) ? input : null;
}

/**
 * Load valid statuses from project configuration.
 */
async function getValidStatuses(core: StatusConfigReader): Promise<string[]> {
	const config = await core.storage.loadConfig();
	return config?.statuses && config.statuses.length > 0 ? config.statuses : [...DEFAULT_STATUSES];
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
		if (seenValidStatuses.has(status)) {
			continue;
		}
		seenValidStatuses.add(status);
		statuses.push(status);
	}
	const configured = new Set(statuses);
	const values: string[] = [];
	const invalid: string[] = [];
	const seen = new Set<string>();

	for (const input of inputs) {
		const raw = String(input ?? "");
		if (!raw) {
			continue;
		}
		if (!configured.has(raw)) {
			invalid.push(raw);
			continue;
		}
		if (seen.has(raw)) {
			continue;
		}
		seen.add(raw);
		values.push(raw);
	}

	return { values, invalid, validStatuses: statuses };
}

/**
 * Format a list of valid statuses for display.
 */
export function formatValidStatuses(configuredStatuses: string[]): string {
	return configuredStatuses.join(", ");
}
