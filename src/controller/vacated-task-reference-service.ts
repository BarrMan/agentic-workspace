import { DateTime } from "luxon";
import { taskIdsEqual } from "../model/task/task-id.ts";
import { withoutVacatedTaskLinks } from "../model/task/task-links.ts";
import type { Task } from "../model/types.ts";
import type { Storage } from "../storage/storage.ts";

type VacatedIdCleanup = { active: Task[]; completed: Task[] };

const LOCK_ATTEMPTS = 5;

function cleanupTargets(cleanup: VacatedIdCleanup): Task[] {
	return [...cleanup.active, ...cleanup.completed];
}

function removeVacatedLinks(tasks: Task[], taskId: string): Task[] {
	return tasks.map((task) => withoutVacatedTaskLinks(task, taskId)).filter((task): task is Task => task !== null);
}

/** Owns the locked scan and rewrite required before a task ID can be reused. */
export class VacatedTaskReferenceService {
	constructor(private readonly storage: Storage) {}

	private async collect(taskId: string): Promise<VacatedIdCleanup> {
		const [activeTasks, completedTasks] = await Promise.all([
			this.storage.loadTasks(),
			this.storage.loadCompletedTasks(),
		]);
		const others = (tasks: Task[]) => tasks.filter((task) => !taskIdsEqual(task.id, taskId));
		return {
			active: removeVacatedLinks(others(activeTasks), taskId),
			completed: removeVacatedLinks(others(completedTasks), taskId),
		};
	}

	async withLockedCleanup<T>(
		target: Pick<Task, "id" | "filePath">,
		vacatedTaskId: string,
		run: (cleanup: VacatedIdCleanup) => Promise<T>,
	): Promise<T> {
		let candidates = cleanupTargets(await this.collect(vacatedTaskId));
		for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
			const coversLock = (task: Task) => candidates.some((candidate) => taskIdsEqual(candidate.id, task.id));
			const outcome = await this.storage.withTaskLocks(
				[target, ...candidates],
				async (): Promise<{ value: T } | { widened: Task[] }> => {
					const cleanup = await this.collect(vacatedTaskId);
					const targets = cleanupTargets(cleanup);
					return targets.some((task) => !coversLock(task)) ? { widened: targets } : { value: await run(cleanup) };
				},
			);
			if ("value" in outcome) return outcome.value;
			candidates = outcome.widened;
		}
		throw new Error(
			`Could not take a stable set of task locks to clean references to ${vacatedTaskId}. Retry once the tasks referencing it stop changing.`,
		);
	}

	async write(cleanup: VacatedIdCleanup): Promise<{ cleanedTaskIds: string[]; filePaths: string[] }> {
		const filePaths: string[] = [];
		const updatedDate = DateTime.utc().toFormat("yyyy-MM-dd HH:mm");
		for (const task of cleanup.active) {
			const updated = { ...task, updatedDate };
			filePaths.push(await this.storage.saveTask(updated));
		}
		for (const task of cleanup.completed) {
			const updated = { ...task, updatedDate };
			filePaths.push(await this.storage.saveTask(updated));
		}
		return { cleanedTaskIds: cleanupTargets(cleanup).map((task) => task.id), filePaths };
	}
}

export function markVacatedTaskMoved(error: unknown, state: "archiveState"): Error {
	const failure = error instanceof Error ? error : new Error(String(error));
	(failure as Error & Record<string, unknown>)[state] = "moved";
	return failure;
}
