import type { AgenticWorkspaceConfig } from "../types.ts";
import { normalizeConfiguredValues, resolveConfiguredValue, resolveConfiguredValues } from "./config-values.ts";

type ProjectConfig = Pick<AgenticWorkspaceConfig, "projects"> | readonly string[] | null | undefined;

/**
 * Unlike task types, projects have no sensible default set. When `projects` is
 * unconfigured this returns an empty array rather than falling back to a constant,
 * so the feature stays inert until a project is deliberately configured.
 */
export function getProjectValues(configOrProjects?: ProjectConfig): string[] {
	const configuredProjects: readonly string[] = Array.isArray(configOrProjects)
		? configOrProjects
		: ((configOrProjects as Pick<AgenticWorkspaceConfig, "projects"> | null | undefined)?.projects ?? []);
	return normalizeConfiguredValues(configuredProjects);
}

export function resolveProjectValue(
	value: string | null | undefined,
	configOrProjects?: ProjectConfig,
): string | undefined {
	return resolveConfiguredValue(value, getProjectValues(configOrProjects));
}

export function resolveProjectValues(
	inputs: readonly string[],
	configOrProjects?: ProjectConfig,
): { values: string[]; invalid: string[] } {
	return resolveConfiguredValues(inputs, getProjectValues(configOrProjects));
}

export function formatValidProjectValues(configOrProjects?: ProjectConfig): string {
	return getProjectValues(configOrProjects).join(", ");
}

export function noProjectsConfiguredMessage(configFilePath?: string): string {
	return `No projects are configured. Add a 'projects:' list to ${configFilePath ?? "the project config file"}.`;
}
