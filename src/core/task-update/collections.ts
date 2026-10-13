import type { Task, TaskUpdateInput } from "../../types/index.ts";
import { normalizeStringList, parseDelimitedStringList, stringArraysEqual } from "../../utils/task-builders.ts";

export interface CollectionUpdateContext {
	validateDependencies(dependencies: string[], task: Task): Promise<{ valid: string[]; invalid: string[] }>;
	taskIdsEqual(first: string, second: string): boolean;
	formatMissingDependenciesError(invalid: string[]): Error;
}

export async function applyCollectionTaskUpdates(
	task: Task,
	input: TaskUpdateInput,
	context: CollectionUpdateContext,
): Promise<boolean> {
	let mutated = false;
	if (input.assignee !== undefined) {
		const assignee = normalizeStringList(input.assignee) ?? [];
		if (!stringArraysEqual(assignee, task.assignee ?? [])) {
			task.assignee = assignee;
			mutated = true;
		}
	}

	mutated =
		applyList(task, "labels", input.labels, input.addLabels, input.removeLabels, (value) => value.toLowerCase()) ||
		mutated;
	mutated = (await applyDependencies(task, input, context)) || mutated;
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
		const next = normalizeStringList(replacement) ?? [];
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

async function applyDependencies(
	task: Task,
	input: TaskUpdateInput,
	context: CollectionUpdateContext,
): Promise<boolean> {
	let current = [...(task.dependencies ?? [])];
	let mutated = false;
	if (input.dependencies !== undefined) {
		const valid = await validatedDependencies(input.dependencies, task, context);
		if (!stringArraysEqual(valid, current)) {
			current = valid;
			mutated = true;
		}
	}
	if (input.addDependencies && input.addDependencies.length > 0) {
		const valid = await validatedDependencies(input.addDependencies, task, context);
		const next = appendDependencies(current, valid);
		mutated = !stringArraysEqual(next, current) || mutated;
		current = next;
	}
	if (input.removeDependencies && input.removeDependencies.length > 0) {
		const removals = parseDelimitedStringList(input.removeDependencies) ?? [];
		const next = current.filter((dependency) => !removals.some((removal) => context.taskIdsEqual(removal, dependency)));
		if (!stringArraysEqual(next, current)) {
			current = next;
			mutated = true;
		}
	}
	task.dependencies = current;
	return mutated;
}

async function validatedDependencies(input: string[], task: Task, context: CollectionUpdateContext): Promise<string[]> {
	const { valid, invalid } = await context.validateDependencies(parseDelimitedStringList(input) ?? [], task);
	if (invalid.length > 0) throw context.formatMissingDependenciesError(invalid);
	return valid;
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
