import { type AgenticWorkspaceConfig, EntityType, type PrefixConfig } from "../types.ts";
import { isNumericTaskIdSegment, parseTaskId, taskIdBody, taskIdKey } from "./task-id.ts";

/**
 * Default prefix configuration for tasks.
 */
const DEFAULT_PREFIX_CONFIG: PrefixConfig = {
	task: EntityType.Task,
};

/**
 * Init-time task prefix validation. Empty input is allowed (the default prefix is used).
 * The value is judged exactly as given, because init persists it verbatim: padding that
 * passed validation but survived into the config would end up inside task IDs and filenames.
 * Callers that mean to accept surrounding whitespace must trim before calling.
 */
export function getTaskPrefixError(prefix: string): string | undefined {
	if (!prefix) {
		return undefined;
	}
	if (!/^[a-zA-Z]+$/.test(prefix)) {
		return "Task prefix must contain only letters (a-z, A-Z).";
	}
	return undefined;
}

/**
 * Extracts the numeric/body part from an ID, removing the prefix.
 * Returns the body portion that follows the prefix.
 *
 * @param id - The ID to extract from (e.g., "task-123", "JIRA-456.1")
 * @param prefix - The prefix to strip (e.g., "task", "JIRA")
 * @returns The body portion without prefix, or the original if no prefix match
 *
 * @example
 * extractIdBody("task-123", "task") // => "123"
 * extractIdBody("JIRA-456.1", "JIRA") // => "456.1"
 * extractIdBody("123", "task") // => "123"
 */
export function extractIdBody(id: string, prefix: string): string {
	const trimmed = id.trim();
	return taskIdBody(trimmed, prefix) ?? trimmed;
}

/**
 * Checks if an ID matches a given prefix pattern.
 *
 * @param id - The ID to check
 * @param prefix - The prefix to match against
 * @returns true if the ID starts with the prefix pattern
 *
 * @example
 * hasPrefix("task-123", "task") // => true
 * hasPrefix("TASK-123", "task") // => true (case-insensitive)
 * hasPrefix("JIRA-1", "task") // => false
 */
export function hasPrefix(id: string, prefix: string): boolean {
	return id.trim().toLowerCase().startsWith(`${prefix.toLowerCase()}-`);
}

/**
 * Extracts the prefix from an ID (e.g., "task-123" -> "task", "JIRA-456" -> "JIRA").
 * Returns null if the ID has no valid prefix pattern.
 *
 * @param id - The ID to extract from
 * @returns The prefix (lowercase), or null if no prefix
 *
 * @example
 * extractAnyPrefix("task-123") // => "task"
 * extractAnyPrefix("JIRA-456") // => "jira"
 * extractAnyPrefix("123") // => null
 */
export function extractAnyPrefix(id: string): string | null {
	if (!id || typeof id !== "string") return null;
	const match = id.trim().match(/^([a-zA-Z]+)-/);
	return match?.[1] ? match[1].toLowerCase() : null;
}

/**
 * Generates the next ID in sequence given a list of existing IDs.
 *
 * @param existingIds - Array of existing IDs
 * @param prefix - The prefix to use
 * @param zeroPadding - Optional zero padding width (e.g., 3 for "001")
 * @returns Next ID in sequence (e.g., "task-43")
 *
 * @example
 * generateNextId(["task-1", "task-2", "task-5"], "task") // => "task-6"
 * generateNextId(["task-001", "task-002"], "task", 3) // => "task-003"
 */
export function generateNextId(existingIds: string[], prefix: string, zeroPadding?: number): string {
	const upperPrefix = prefix.toUpperCase();
	let max = 0n;

	for (const id of existingIds) {
		const parsed = parseTaskId(id, prefix);
		if (parsed) {
			// Only consider top-level IDs (no dots for subtasks)
			const body = parsed.segments[0];
			if (parsed.segments.length === 1 && body) {
				const num = BigInt(body);
				if (num > max) {
					max = num;
				}
			}
		}
	}

	const nextNum = (max + 1n).toString();

	if (zeroPadding && zeroPadding > 0) {
		return `${upperPrefix}-${nextNum.padStart(zeroPadding, "0")}`;
	}

	return `${upperPrefix}-${nextNum}`;
}

/**
 * Generates the next subtask ID for a parent task.
 *
 * @param existingIds - Array of existing IDs (including subtasks)
 * @param parentId - The parent task ID (e.g., "task-5")
 * @param prefix - The prefix being used
 * @param zeroPadding - Optional zero padding width for subtask number
 * @returns Next subtask ID (e.g., "task-5.3")
 *
 * @example
 * generateNextSubtaskId(["task-5", "task-5.1", "task-5.2"], "task-5", "task") // => "task-5.3"
 */
export function generateNextSubtaskId(
	existingIds: string[],
	parentId: string,
	prefix: string,
	zeroPadding?: number,
): string {
	const parentKey = taskIdKey(parentId);
	const normalizedParent = hasPrefix(parentKey, prefix) ? parentKey : `${prefix.toUpperCase()}-${parentKey}`;
	const parentBody = extractIdBody(normalizedParent, prefix);
	const parentSegments = parentBody.split(".");

	let max = 0n;

	for (const id of existingIds) {
		const candidate = subtaskSequenceNumber(id, prefix, parentSegments, parentBody);
		if (candidate !== null && candidate > max) max = candidate;
	}

	const nextNum = (max + 1n).toString();

	if (zeroPadding && zeroPadding > 0) {
		return `${normalizedParent}.${nextNum.padStart(2, "0")}`;
	}

	return `${normalizedParent}.${nextNum}`;
}

function subtaskSequenceNumber(
	id: string,
	prefix: string,
	parentSegments: string[],
	parentBody: string,
): bigint | null {
	const bodySegments = extractIdBody(id, prefix).split(".");
	if (bodySegments.length <= parentSegments.length) return null;
	const candidateParentSegments = bodySegments.slice(0, parentSegments.length);
	if (!subtaskParentMatches(candidateParentSegments, parentBody)) return null;
	const sequence = bodySegments[parentSegments.length];
	return sequence && isNumericTaskIdSegment(sequence) ? BigInt(sequence) : null;
}

function subtaskParentMatches(candidateSegments: string[], parentBody: string): boolean {
	return candidateSegments.join(".").toLowerCase() === parentBody.toLowerCase();
}

/**
 * Gets the prefix for a given entity type.
 * Tasks use the configured prefix when present, or the built-in task prefix.
 *
 * @param type - The entity type
 * @param config - Optional AgenticWorkspace config (only used for Task type)
 * @returns The prefix string for the entity type
 *
 * @example
 * getPrefixForType(EntityType.Task) // => "task"
 * getPrefixForType(EntityType.Task, { prefixes: { task: "JIRA" } }) // => "JIRA"
 */
export function getPrefixForType(type: EntityType, config?: AgenticWorkspaceConfig): string {
	switch (type) {
		case EntityType.Task:
			return config?.prefixes?.task ?? DEFAULT_PREFIX_CONFIG.task;
		default:
			return type;
	}
}
