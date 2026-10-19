import { comparisonKey } from "../../lib/comparison-key.ts";
import type { AgenticWorkspaceConfig } from "../types.ts";

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
	const values: string[] = [];
	const seen = new Set<string>();

	for (const entry of configuredProjects) {
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

export function resolveProjectValue(
	value: string | null | undefined,
	configOrProjects?: ProjectConfig,
): string | undefined {
	const normalized = comparisonKey(value);
	if (!normalized) {
		return undefined;
	}
	return getProjectValues(configOrProjects).find((project) => comparisonKey(project) === normalized);
}

export function resolveProjectValues(
	inputs: readonly string[],
	configOrProjects?: ProjectConfig,
): { values: string[]; invalid: string[] } {
	const values: string[] = [];
	const invalid: string[] = [];
	const seen = new Set<string>();

	for (const input of inputs) {
		const canonical = resolveProjectValue(input, configOrProjects);
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

export function matchesProjectFilter(
	taskProject: string | null | undefined,
	filter: string | readonly string[] | null | undefined,
): boolean {
	const filters = typeof filter === "string" ? [filter] : (filter ?? []);
	const allowed = new Set(filters.map(comparisonKey).filter((value): value is string => Boolean(value)));
	if (allowed.size === 0) {
		return true;
	}
	const normalizedTaskProject = comparisonKey(taskProject);
	return normalizedTaskProject ? allowed.has(normalizedTaskProject) : false;
}

export function formatValidProjectValues(configOrProjects?: ProjectConfig): string {
	return getProjectValues(configOrProjects).join(", ");
}

export function noProjectsConfiguredMessage(configFilePath?: string): string {
	return `No projects are configured. Add a 'projects:' list to ${configFilePath ?? "the project config file"}.`;
}
