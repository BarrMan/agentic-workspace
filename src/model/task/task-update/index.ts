import type { Task, TaskUpdateInput } from "../../types.ts";
import { applyCollectionTaskUpdates, type CollectionUpdateContext } from "./collections.ts";
import { applyContentTaskUpdates } from "./content.ts";
import { applyScalarTaskUpdates, type ScalarUpdateContext } from "./scalars.ts";

export interface TaskUpdateContext extends ScalarUpdateContext, CollectionUpdateContext {}

export async function applyTaskUpdate(
	task: Task,
	input: TaskUpdateInput,
	context: TaskUpdateContext,
): Promise<boolean> {
	let mutated = await applyScalarTaskUpdates(task, input, context);
	mutated = (await applyCollectionTaskUpdates(task, input, context)) || mutated;
	mutated = applyContentTaskUpdates(task, input) || mutated;
	return mutated;
}
