import { comparisonKey } from "../../lib/comparison-key.ts";
import { DEFAULT_TASK_TYPES } from "../constants.ts";
import type { AgenticWorkspaceConfig } from "../types.ts";

type TaskTypeConfig = Pick<AgenticWorkspaceConfig, "types"> | readonly string[] | null | undefined;

export function getTaskTypeValues(configOrTypes?: TaskTypeConfig): string[] {
	const configuredTypes: readonly string[] = Array.isArray(configOrTypes)
		? configOrTypes
		: ((configOrTypes as Pick<AgenticWorkspaceConfig, "types"> | null | undefined)?.types ?? []);
	const values: string[] = [];
	const seen = new Set<string>();

	for (const entry of configuredTypes) {
		const value = String(entry ?? "").trim();
		const normalized = comparisonKey(value);
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		values.push(value);
	}

	return values.length > 0 ? values : [...DEFAULT_TASK_TYPES];
}

export function resolveTaskTypeValue(
	value: string | null | undefined,
	configOrTypes?: TaskTypeConfig,
): string | undefined {
	const normalized = comparisonKey(value);
	if (!normalized) {
		return undefined;
	}
	return getTaskTypeValues(configOrTypes).find((type) => comparisonKey(type) === normalized);
}

export function resolveTaskTypeValues(
	inputs: readonly string[],
	configOrTypes?: TaskTypeConfig,
): { values: string[]; invalid: string[] } {
	const values: string[] = [];
	const invalid: string[] = [];
	const seen = new Set<string>();

	for (const input of inputs) {
		const canonical = resolveTaskTypeValue(input, configOrTypes);
		if (!canonical) {
			invalid.push(input);
			continue;
		}
		const normalized = comparisonKey(canonical);
		if (!normalized || seen.has(normalized)) {
			continue;
		}
		seen.add(normalized);
		values.push(canonical);
	}

	return { values, invalid };
}

export function matchesTaskTypeFilter(
	taskType: string | null | undefined,
	filter: string | readonly string[] | null | undefined,
): boolean {
	const filters = typeof filter === "string" ? [filter] : (filter ?? []);
	const allowed = new Set(filters.map(comparisonKey).filter((value): value is string => Boolean(value)));
	if (allowed.size === 0) {
		return true;
	}
	const normalizedTaskType = comparisonKey(taskType);
	return normalizedTaskType ? allowed.has(normalizedTaskType) : false;
}

export function formatValidTaskTypeValues(configOrTypes?: TaskTypeConfig): string {
	return getTaskTypeValues(configOrTypes).join(", ");
}
