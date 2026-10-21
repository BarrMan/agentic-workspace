import type { Task, TaskUpdateInput } from "../../types.ts";
import { applyCollectionTaskUpdates, type CollectionUpdateContext } from "./collections.ts";
import { applyScalarTaskUpdates, type ScalarUpdateContext } from "./scalars.ts";

export type { ValidatedDependencyUpdate } from "./collections.ts";

/** Inputs resolved by the operation boundary before synchronous model mutation. */
export interface TaskUpdateContext extends ScalarUpdateContext, CollectionUpdateContext {}

export function applyTaskUpdate(task: Task, input: TaskUpdateInput, context: TaskUpdateContext): boolean {
	const scalarMutated = applyScalarTaskUpdates(task, input, context);
	return applyCollectionTaskUpdates(task, input, context) || scalarMutated;
}
