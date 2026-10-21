import { isLocalEditableTask, type Task } from "../model/types.ts";
import type { TaskArtifactRepository } from "./task-artifact-repository.ts";

const MAX_SEARCHABLE_ARTIFACTS = 32;
const MAX_SEARCHABLE_ARTIFACT_BYTES = 128 * 1024;

/** Attach bounded, canonical task-container text for the shared task-search projection. */
export async function addSearchableArtifactText<T extends Task>(
	tasks: T[],
	artifacts: TaskArtifactRepository,
): Promise<Array<T & { searchableArtifactText?: string }>> {
	return await Promise.all(
		tasks.map(async (task) => {
			if (!isLocalEditableTask(task)) return task;
			const entries = (await artifacts.list(task.id))
				.filter((entry) => entry.type === "text")
				.slice(0, MAX_SEARCHABLE_ARTIFACTS);
			const contents: string[] = [];
			let remainingBytes = MAX_SEARCHABLE_ARTIFACT_BYTES;
			for (const entry of entries) {
				if (remainingBytes <= 0) break;
				const bytes = await artifacts.read(task.id, entry.path);
				const bounded = bytes.subarray(0, remainingBytes);
				contents.push(new TextDecoder("utf-8").decode(bounded));
				remainingBytes -= bounded.byteLength;
			}
			const searchableArtifactText = contents.filter(Boolean).join("\n\n");
			return searchableArtifactText ? { ...task, searchableArtifactText } : task;
		}),
	);
}
