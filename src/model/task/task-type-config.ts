import { DEFAULT_TASK_TYPES } from "../constants.ts";
import type { AgenticWorkspaceConfig } from "../types.ts";
import {
	matchesConfiguredFilter,
	normalizeConfiguredValues,
	resolveConfiguredValue,
	resolveConfiguredValues,
} from "./config-values.ts";

type TaskTypeConfig = Pick<AgenticWorkspaceConfig, "types"> | readonly string[] | null | undefined;

export function getTaskTypeValues(configOrTypes?: TaskTypeConfig): string[] {
	const configuredTypes: readonly string[] = Array.isArray(configOrTypes)
		? configOrTypes
		: ((configOrTypes as Pick<AgenticWorkspaceConfig, "types"> | null | undefined)?.types ?? []);
	const values = normalizeConfiguredValues(configuredTypes);

	return values.length > 0 ? values : [...DEFAULT_TASK_TYPES];
}

export function resolveTaskTypeValue(
	value: string | null | undefined,
	configOrTypes?: TaskTypeConfig,
): string | undefined {
	return resolveConfiguredValue(value, getTaskTypeValues(configOrTypes));
}

export function resolveTaskTypeValues(
	inputs: readonly string[],
	configOrTypes?: TaskTypeConfig,
): { values: string[]; invalid: string[] } {
	return resolveConfiguredValues(inputs, getTaskTypeValues(configOrTypes));
}

export function matchesTaskTypeFilter(
	taskType: string | null | undefined,
	filter: string | readonly string[] | null | undefined,
): boolean {
	return matchesConfiguredFilter(taskType, filter);
}

export function formatValidTaskTypeValues(configOrTypes?: TaskTypeConfig): string {
	return getTaskTypeValues(configOrTypes).join(", ");
}
