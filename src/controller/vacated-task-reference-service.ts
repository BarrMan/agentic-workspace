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

/** Discovers changed reference records under a stable set of task locks. */
export class VacatedTaskReferenceService {
	constructor(private readonly storage: Storage) {}

	private async collect(taskId: string): Promise<VacatedIdCleanup> {
		const [activeTasks, completedTasks] = await Promise.all([
			this.storage.loadTasks(),
			this.storage.loadCompletedTasks(),
		]);
		const others = (tasks: Task[]) => tasks.filter((task) => task.id !== taskId);
		return {
			active: removeVacatedLinks(others(activeTasks), taskId),
			completed: removeVacatedLinks(others(completedTasks), taskId),
		};
	}

	async withLockedCleanup<T>(
		target: Pick<Task, "id" | "filePath">,
		vacatedTaskId: string,
		run: (target: Task, cleanup: VacatedIdCleanup) => Promise<T>,
	): Promise<T> {
		let candidates = cleanupTargets(await this.collect(vacatedTaskId));
		for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt++) {
			const coversLock = (task: Task) => candidates.some((candidate) => candidate.id === task.id);
			const outcome = await this.storage.withTaskLocks(
				[target, ...candidates],
				async (lockedTasks): Promise<{ value: T } | { widened: Task[] }> => {
					const cleanup = await this.collect(vacatedTaskId);
					const targets = cleanupTargets(cleanup);
					if (targets.some((task) => !coversLock(task))) return { widened: targets };
					const current = lockedTasks.find((task) => task.id === target.id);
					if (!current) throw new Error(`Task not found: ${target.id}`);
					return { value: await run(current, cleanup) };
				},
				{ includeArchived: true },
			);
			if ("value" in outcome) return outcome.value;
			candidates = outcome.widened;
		}
		throw new Error(
			`Could not take a stable set of task locks to clean references to ${vacatedTaskId}. Retry once the tasks referencing it stop changing.`,
		);
	}
}

export function markVacatedTaskMoved(error: unknown, state: "archiveState"): Error {
	const failure = error instanceof Error ? error : new Error(String(error));
	(failure as Error & Record<string, unknown>)[state] = "moved";
	return failure;
}
