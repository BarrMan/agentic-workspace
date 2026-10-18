import { type AgenticWorkspaceConfig, EntityType, type PrefixConfig } from "../types/index.ts";
import { isNumericTaskIdSegment, parseTaskId, taskIdBody, taskIdKey, taskIdRegex } from "./task-id.ts";

/**
 * Default prefix configuration for tasks.
 */
export const DEFAULT_PREFIX_CONFIG: PrefixConfig = {
	task: EntityType.Task,
};

export const DEFAULT_TASK_PREFIX = DEFAULT_PREFIX_CONFIG.task;

/**
 * Hardcoded draft prefix. Not configurable - always "draft".
 */
export const DRAFT_PREFIX = EntityType.Draft;

/**
 * Prefixes owned by system entity types. A configurable task prefix matching one
 * of these collides with drafts and misroutes their IDs.
 */
const RESERVED_TASK_PREFIXES: readonly string[] = [DRAFT_PREFIX];

/**
 * Checks whether a candidate task prefix collides with a reserved system prefix (case-insensitive).
 */
export function isReservedTaskPrefix(prefix: string): boolean {
	return RESERVED_TASK_PREFIXES.includes(prefix.trim().toLowerCase());
}

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
	if (isReservedTaskPrefix(prefix)) {
		return `Task prefix "${prefix}" is reserved for drafts. Choose a different prefix.`;
	}
	return undefined;
}

/**
 * Returns the default prefix configuration.
 * Use this when no custom config is specified.
 */
export function getDefaultPrefixConfig(): PrefixConfig {
	return { ...DEFAULT_PREFIX_CONFIG };
}

/**
 * Merges user-provided prefix config with defaults.
 * Missing fields are filled with default values.
 *
 * @param config - Partial prefix config from user
 * @returns Complete prefix config with defaults applied
 */
export function mergePrefixConfig(config?: Partial<PrefixConfig>): PrefixConfig {
	return {
		task: config?.task ?? DEFAULT_PREFIX_CONFIG.task,
	};
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
 * Extracts the numeric parts from an ID as an array of numbers.
 * Handles both simple IDs (task-5) and hierarchical IDs (task-5.2.1).
 *
 * @param id - The ID to parse (e.g., "task-123", "task-5.2.1")
 * @param prefix - The prefix to strip (e.g., "task")
 * @returns Array of numeric segments, or [0] if unparseable
 *
 * @example
 * extractIdNumbers("task-123", "task") // => [123]
 * extractIdNumbers("task-5.2.1", "task") // => [5, 2, 1]
 * extractIdNumbers("task-abc", "task") // => [0]
 */
export function extractIdNumbers(id: string, prefix: string): number[] {
	const body = extractIdBody(id, prefix);
	const segments = body.split(".").map((seg) => {
		const num = Number.parseInt(seg, 10);
		return Number.isNaN(num) ? 0 : num;
	});
	return segments.length > 0 ? segments : [0];
}

/**
 * Builds a glob pattern for finding files with a specific prefix.
 *
 * @param prefix - The prefix to match (e.g., "task", "draft")
 * @returns Glob pattern (e.g., "task-*.md")
 *
 * @example
 * buildGlobPattern("task") // => "task-*.md"
 * buildGlobPattern("JIRA") // => "JIRA-*.md"
 */
export function buildGlobPattern(prefix: string): string {
	return `${prefix}-*.md`;
}

/**
 * Builds a regex pattern for matching IDs with a specific prefix.
 * Captures the numeric/body portion after the prefix.
 *
 * @param prefix - The prefix to match (e.g., "task", "draft")
 * @returns RegExp that matches IDs and captures the body (e.g., /^task-(\d+(?:\.\d+)*)/)
 *
 * @example
 * const regex = buildIdRegex("task");
 * "task-123".match(regex) // => ["task-123", "123"]
 * "task-5.2.1".match(regex) // => ["task-5.2.1", "5.2.1"]
 */
export function buildIdRegex(prefix: string): RegExp {
	return taskIdRegex(prefix);
}

/**
 * Builds a regex pattern for extracting IDs from filenames.
 * Similar to buildIdRegex but designed for filename parsing.
 *
 * @param prefix - The prefix to match (e.g., "task", "draft")
 * @returns RegExp for filename matching
 *
 * @example
 * const regex = buildFilenameIdRegex("task");
 * "task-123 - Some Title.md".match(regex) // => ["task-123", "123"]
 */
export function buildFilenameIdRegex(prefix: string): RegExp {
	return taskIdRegex(prefix);
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
 * hasPrefix("draft-1", "task") // => false
 */
export function hasPrefix(id: string, prefix: string): boolean {
	const pattern = new RegExp(`^${escapeRegex(prefix)}-`, "i");
	return pattern.test(id.trim());
}

/**
 * Checks if an ID has any valid prefix pattern (letters followed by dash).
 * Use this for filtering/validation when you want to accept any prefix.
 *
 * @param id - The ID to check
 * @returns true if the ID matches the pattern: letters-dash-something
 *
 * @example
 * hasAnyPrefix("task-123") // => true
 * hasAnyPrefix("JIRA-456") // => true
 * hasAnyPrefix("draft-1") // => true
 * hasAnyPrefix("123") // => false
 * hasAnyPrefix("") // => false
 */
export function hasAnyPrefix(id: string): boolean {
	if (!id || typeof id !== "string") return false;
	return /^[a-zA-Z]+-\S/.test(id.trim());
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
	const canonicalParentSegments = canonicalizeNumericSegments(parentSegments);

	let max = 0n;

	for (const id of existingIds) {
		const candidate = subtaskSequenceNumber(id, prefix, parentSegments, canonicalParentSegments, parentBody);
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
	canonicalParentSegments: string[] | null,
	parentBody: string,
): bigint | null {
	const bodySegments = extractIdBody(id, prefix).split(".");
	if (bodySegments.length <= parentSegments.length) return null;
	const candidateParentSegments = bodySegments.slice(0, parentSegments.length);
	if (
		!subtaskParentMatches(
			canonicalParentSegments,
			canonicalizeNumericSegments(candidateParentSegments),
			candidateParentSegments,
			parentBody,
		)
	)
		return null;
	const sequence = bodySegments[parentSegments.length];
	return sequence && isNumericTaskIdSegment(sequence) ? BigInt(sequence) : null;
}

function canonicalizeNumericSegments(segments: string[]): string[] | null {
	if (!segments.every(isNumericTaskIdSegment)) return null;
	return segments.map((segment) => segment.replace(/^0+/, "") || "0");
}

function subtaskParentMatches(
	canonicalParent: string[] | null,
	canonicalCandidate: string[] | null,
	candidateSegments: string[],
	parentBody: string,
): boolean {
	if (canonicalParent && canonicalCandidate)
		return canonicalParent.every((segment, index) => segment === canonicalCandidate[index]);
	return candidateSegments.join(".").toLowerCase() === parentBody.toLowerCase();
}

/**
 * Escapes special regex characters in a string.
 * Used to safely build regex patterns from user-provided prefixes.
 *
 * @param str - The string to escape
 * @returns String with regex special characters escaped
 *
 * @example
 * escapeRegex("task-") // => "task-"
 * escapeRegex("JIRA.") // => "JIRA\\."
 */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Gets the prefix for a given entity type.
 * Only tasks have configurable prefixes (via config); other types use hardcoded prefixes.
 *
 * @param type - The entity type
 * @param config - Optional AgenticWorkspace config (only used for Task type)
 * @returns The prefix string for the entity type
 *
 * @example
 * getPrefixForType(EntityType.Task) // => "task"
 * getPrefixForType(EntityType.Task, { prefixes: { task: "JIRA" } }) // => "JIRA"
 * getPrefixForType(EntityType.Draft) // => "draft"
 */
export function getPrefixForType(type: EntityType, config?: AgenticWorkspaceConfig): string {
	switch (type) {
		case EntityType.Task:
			return config?.prefixes?.task ?? DEFAULT_PREFIX_CONFIG.task;
		case EntityType.Draft:
			return DRAFT_PREFIX;
		default:
			return type;
	}
}
