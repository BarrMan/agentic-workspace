import { normalizeStringList, stringArraysEqual } from "../../../lib/string-list.ts";
import type { Task, TaskUpdateInput } from "../../types.ts";
import { labelComparisonKey } from "../label-filter.ts";
import { taskIdsEqual } from "../task-id.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../task-path.ts";

export interface ValidatedDependencyUpdate {
	readonly input: readonly string[];
	readonly valid: readonly string[];
	readonly invalid: readonly string[];
}

export interface CollectionUpdateContext {
	readonly dependencies?: {
		readonly replacement?: ValidatedDependencyUpdate;
		readonly additions?: ValidatedDependencyUpdate;
	};
}

export function applyCollectionTaskUpdates(
	task: Task,
	input: TaskUpdateInput,
	context: CollectionUpdateContext,
): boolean {
	let mutated = false;
	mutated = applyList(task, "labels", input.labels, input.addLabels, input.removeLabels, labelComparisonKey) || mutated;
	mutated = applyDependencies(task, input, context) || mutated;
	mutated = applyList(task, "references", input.references, input.addReferences, input.removeReferences) || mutated;
	mutated =
		applyList(task, "documentation", input.documentation, input.addDocumentation, input.removeDocumentation) || mutated;

	if (input.modifiedFiles !== undefined) {
		const modifiedFiles = normalizeStringList(input.modifiedFiles) ?? [];
		if (!stringArraysEqual(modifiedFiles, task.modifiedFiles ?? [])) {
			task.modifiedFiles = modifiedFiles;
			mutated = true;
		}
	}
	return mutated;
}

function applyList(
	task: Task,
	field: "labels" | "references" | "documentation",
	replacement: string[] | undefined,
	additions: string[] | undefined,
	removals: string[] | undefined,
	key = (value: string) => value,
): boolean {
	let current = [...(task[field] ?? [])];
	let mutated = false;
	if (replacement !== undefined) {
		const normalized = normalizeStringList(replacement) ?? [];
		const next = field === "labels" ? uniqueByKey(normalized, key) : normalized;
		if (!stringArraysEqual(next, current)) {
			task[field] = next;
			mutated = true;
		}
		current = next;
	}
	const additionsList = normalizeStringList(additions) ?? [];
	const seen = new Set(current.map(key));
	const added = additionsList.filter((value) => {
		const valueKey = key(value);
		if (seen.has(valueKey)) return false;
		seen.add(valueKey);
		return true;
	});
	if (added.length) {
		current = [...current, ...added];
		task[field] = current;
		mutated = true;
	}
	const removed = new Set((normalizeStringList(removals) ?? []).map(key));
	const next = removed.size ? current.filter((value) => !removed.has(key(value))) : current;
	if (!stringArraysEqual(next, current)) {
		task[field] = next;
		mutated = true;
	}
	return mutated;
}

function uniqueByKey(values: string[], key: (value: string) => string): string[] {
	const seen = new Set<string>();
	return values.filter((value) => {
		const valueKey = key(value);
		if (seen.has(valueKey)) return false;
		seen.add(valueKey);
		return true;
	});
}

function applyDependencies(task: Task, input: TaskUpdateInput, context: CollectionUpdateContext): boolean {
	let current = [...(task.dependencies ?? [])];
	let mutated = false;
	if (input.dependencies !== undefined) {
		const valid = validatedDependencies(input.dependencies, context.dependencies?.replacement);
		if (!stringArraysEqual(valid, current)) {
			current = valid;
			mutated = true;
		}
	}
	if (input.addDependencies && input.addDependencies.length > 0) {
		const valid = validatedDependencies(input.addDependencies, context.dependencies?.additions);
		const next = appendDependencies(current, valid);
		mutated = !stringArraysEqual(next, current) || mutated;
		current = next;
	}
	if (input.removeDependencies && input.removeDependencies.length > 0) {
		const removals = normalizeStringList(input.removeDependencies) ?? [];
		const next = current.filter((dependency) => !removals.some((removal) => taskIdsEqual(removal, dependency)));
		if (!stringArraysEqual(next, current)) {
			current = next;
			mutated = true;
		}
	}
	task.dependencies = current;
	return mutated;
}

function validatedDependencies(input: string[], resolved: ValidatedDependencyUpdate | undefined): string[] {
	const normalized = normalizeStringList(input) ?? [];
	if (!resolved) throw new Error("Dependencies must be validated before updating a task.");
	if (!stringArraysEqual(normalized, [...resolved.input]))
		throw new Error("Dependency validation does not match the requested update.");
	if (resolved.invalid.length > 0)
		throw new Error(
			`The following dependencies do not exist: ${resolved.invalid.join(", ")}. Please create these tasks first or verify the IDs. ${LOCAL_TASK_LOOKUP_HINT}`,
		);
	return [...resolved.valid];
}

function appendDependencies(current: string[], additions: string[]): string[] {
	const seen = new Set(current);
	const added = additions.filter((dependency) => {
		if (seen.has(dependency)) return false;
		seen.add(dependency);
		return true;
	});
	return added.length === 0 ? current : [...current, ...added];
}
