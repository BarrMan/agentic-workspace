import { stringArraysEqual } from "../../lib/string-list.ts";
import type { Task } from "../types.ts";

/**
 * The task with every dependency and reference naming `vacatedTaskId` removed, or `null` when it
 * named the ID nowhere.
 *
 * When an operation releases an ID, a reference kept anywhere can bind to a later task created
 * with that ID.
 */
export function withoutVacatedTaskLinks(task: Task, vacatedTaskId: string): Task | null {
	const dependencies = task.dependencies ?? [];
	const references = task.references ?? [];

	const sanitizedDependencies = dependencies.filter((dependency) => dependency !== vacatedTaskId);
	const sanitizedReferences = references.filter((reference) => reference !== vacatedTaskId);

	if (stringArraysEqual(dependencies, sanitizedDependencies) && stringArraysEqual(references, sanitizedReferences)) {
		return null;
	}

	return { ...task, dependencies: sanitizedDependencies, references: sanitizedReferences };
}
