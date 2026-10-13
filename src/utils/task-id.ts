import type { Task } from "../types/index.ts";
import { DEFAULT_TASK_PREFIX, extractAnyPrefix, normalizeId } from "./prefix-config.ts";

const NUMERIC_TASK_ID_PATTERN = /^(?:[a-zA-Z]+-)?[0-9]+(?:\.[0-9]+)*$/;
const LEGACY_TASK_ID_PATTERN = /^[a-zA-Z]+-[a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*$/;

export type TaskIdResolution =
	| { status: "found"; task: Task }
	| { status: "ambiguous"; tasks: Task[] }
	| { status: "invalid" }
	| { status: "not-found" };

/**
 * Normalize a task ID by ensuring the prefix is present and uppercase.
 * An existing prefix is preserved when the caller does not provide one.
 */
export function normalizeTaskId(taskId: string, prefix: string = DEFAULT_TASK_PREFIX): string {
	const inferredPrefix = extractAnyPrefix(taskId);
	const effectivePrefix = inferredPrefix && prefix === DEFAULT_TASK_PREFIX ? inferredPrefix : prefix;
	return normalizeId(taskId, effectivePrefix);
}

/** Return the stable identity used to group task IDs without numeric coercion. */
export function canonicalTaskId(taskId: string, prefix: string = DEFAULT_TASK_PREFIX): string {
	const trimmed = taskId.trim();
	const inferredPrefix = extractAnyPrefix(trimmed);
	const effectivePrefix = inferredPrefix ?? prefix;
	return normalizeTaskId(trimmed, effectivePrefix);
}

/**
 * Compare task IDs by their normalized prefix and exact body.
 */
export function taskIdsEqual(left: string, right: string, prefix: string = DEFAULT_TASK_PREFIX): boolean {
	const leftPrefix = extractAnyPrefix(left);
	const rightPrefix = extractAnyPrefix(right);
	const effectivePrefix = leftPrefix ?? rightPrefix ?? prefix;
	return canonicalTaskId(left, effectivePrefix) === canonicalTaskId(right, effectivePrefix);
}

export function isNumericTaskId(value: string): boolean {
	return NUMERIC_TASK_ID_PATTERN.test(value.trim());
}

export function isValidTaskId(value: string): boolean {
	const trimmed = value.trim();
	return isNumericTaskId(trimmed) || LEGACY_TASK_ID_PATTERN.test(trimmed);
}

/**
 * Resolve a human-facing route ID without guessing when canonical IDs collide.
 */
export function resolveTaskById(tasks: Task[], inputId: string): TaskIdResolution {
	const normalizedInput = inputId.trim();
	if (!isValidTaskId(normalizedInput)) {
		return { status: "invalid" };
	}

	const inputPrefix = extractAnyPrefix(normalizedInput);
	const matches = tasks.filter((task) => {
		if (inputPrefix || !isNumericTaskId(normalizedInput)) return taskIdsEqual(normalizedInput, task.id);
		const candidate = task.id.trim();
		const candidatePrefix = extractAnyPrefix(candidate);
		return (candidatePrefix ? candidate.slice(candidatePrefix.length + 1) : candidate) === normalizedInput;
	});
	if (matches.length === 0) {
		return { status: "not-found" };
	}
	if (matches.length > 1) {
		return { status: "ambiguous", tasks: matches };
	}

	const task = matches[0];
	return task ? { status: "found", task } : { status: "not-found" };
}
