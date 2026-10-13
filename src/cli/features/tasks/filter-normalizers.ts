import type { Core } from "../../../index.ts";
import { formatValidPriorityValues, resolvePriorityValue } from "../../../utils/priority-config.ts";
import {
	formatValidProjectValues,
	getProjectValues,
	noProjectsConfiguredMessage,
	resolveProjectValues,
} from "../../../utils/project-config.ts";
import { formatValidStatuses, getCanonicalStatuses } from "../../../utils/status.ts";
import { formatValidTaskTypeValues, resolveTaskTypeValues } from "../../../utils/task-type-config.ts";

export async function normalizeCliStatusList(
	core: Core,
	values: string[],
	optionName: string,
): Promise<string[] | null> {
	const { values: canonicalStatuses, invalid, validStatuses } = await getCanonicalStatuses(values, core);
	if (invalid.length === 0) return canonicalStatuses;
	console.error(
		`Invalid ${optionName}: ${invalid.join(", ")}. Valid statuses are: ${formatValidStatuses(validStatuses)}`,
	);
	process.exitCode = 1;
	return null;
}

export async function normalizeCliPriority(core: Core, value: string): Promise<string | null> {
	const config = await core.filesystem.loadConfig();
	const normalized = resolvePriorityValue(value, config);
	if (normalized) return normalized;
	console.error(`Invalid priority: ${value}. Valid values are: ${formatValidPriorityValues(config)}`);
	process.exitCode = 1;
	return null;
}

export async function normalizeCliTaskTypes(
	core: Core,
	values: string[],
	optionName: string,
): Promise<string[] | null> {
	const config = await core.filesystem.loadConfig();
	const { values: canonicalTypes, invalid } = resolveTaskTypeValues(values, config);
	if (invalid.length === 0) return canonicalTypes;
	console.error(`Invalid ${optionName}: ${invalid.join(", ")}. Valid types are: ${formatValidTaskTypeValues(config)}`);
	process.exitCode = 1;
	return null;
}

export async function normalizeCliProjects(core: Core, values: string[], optionName: string): Promise<string[] | null> {
	const config = await core.filesystem.loadConfig();
	if (getProjectValues(config).length === 0) {
		console.error(noProjectsConfiguredMessage(core.filesystem.configFilePath));
		process.exitCode = 1;
		return null;
	}
	const { values: canonicalProjects, invalid } = resolveProjectValues(values, config);
	if (invalid.length === 0) return canonicalProjects;
	console.error(
		`Invalid ${optionName}: ${invalid.join(", ")}. Valid projects are: ${formatValidProjectValues(config)}`,
	);
	process.exitCode = 1;
	return null;
}
