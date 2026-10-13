import type { FileSystem } from "../file-system/operations.ts";
import type { Task } from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { withoutVacatedTaskLinks } from "../utils/task-links.ts";
import { taskIdsEqual } from "../utils/task-path.ts";

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
	constructor(private readonly filesystem: FileSystem) {}

	private async collect(taskId: string): Promise<VacatedIdCleanup> {
		const [activeTasks, completedTasks] = await Promise.all([
			this.filesystem.listTasks(),
			this.filesystem.listCompletedTasks(),
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
			const outcome = await this.filesystem.withTaskLocks(
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
		const updatedDate = formatStoredDate();
		for (const task of cleanup.active) {
			const updated = { ...task, updatedDate };
			filePaths.push(await this.filesystem.saveTask(updated));
		}
		for (const task of cleanup.completed) {
			const updated = { ...task, updatedDate };
			filePaths.push(await this.filesystem.saveTask(updated));
		}
		return { cleanedTaskIds: cleanupTargets(cleanup).map((task) => task.id), filePaths };
	}
}

export function markVacatedTaskMoved(
	error: unknown,
	state: "archiveState" | "demotionState",
	demotionFailureCause?: "cleanup" | "commit",
): Error {
	const failure = error instanceof Error ? error : new Error(String(error));
	(failure as Error & Record<string, unknown>)[state] = "moved";
	if (state === "demotionState" && demotionFailureCause) {
		(failure as Error & Record<string, unknown>).demotionFailureCause = demotionFailureCause;
	}
	return failure;
}
