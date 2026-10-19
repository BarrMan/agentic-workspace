import type { Task, TaskUpdateInput } from "../../types.ts";
import { applyCollectionTaskUpdates, type CollectionUpdateContext } from "./collections.ts";
import { applyScalarTaskUpdates, type ScalarUpdateContext } from "./scalars.ts";

export interface TaskUpdateContext extends ScalarUpdateContext, CollectionUpdateContext {}

export async function applyTaskUpdate(
	task: Task,
	input: TaskUpdateInput,
	context: TaskUpdateContext,
): Promise<boolean> {
	let mutated = await applyScalarTaskUpdates(task, input, context);
	mutated = (await applyCollectionTaskUpdates(task, input, context)) || mutated;
	return mutated;
}
