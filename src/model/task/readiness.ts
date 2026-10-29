import type { Task } from "../types.ts";

export interface TaskReadiness {
	/** Work can start now: the task is unfinished and every dependency is resolved and completed. */
	isReady: boolean;
	/** Work cannot start: at least one dependency is unfinished or unresolved. */
	isBlocked: boolean;
	/** Dependencies that resolved to a task that has not been completed. */
	blockingDependencies: string[];
	/** Dependency IDs absent from the graph. */
	missingDependencies: string[];
}

/**
 * Build the readiness index over the corpus this read is allowed to see.
 *
 * Readiness and the dependency graph share exact-ID lookup and the record's done flag.
 */
export function createReadinessGraph(options: {
	tasks: Task[];
	completedTasks?: Task[];
	/** Reuse a corpus-wide task map when readiness is part of a prepared task graph. */
	index?: ReadonlyMap<string, Task>;
}): ReadonlyMap<string, Task> {
	return options.index ?? new Map([...options.tasks, ...(options.completedTasks ?? [])].map((task) => [task.id, task]));
}

/**
 * Derive readiness for a single task from its dependencies at read time.
 *
 * Readiness never reorders or mutates anything: it answers "can this task be started now?".
 * Dependencies that resolved to unfinished work and dependency IDs that could not be resolved are
 * reported separately, and both block readiness, so a partial graph is never mistaken for
 * satisfied work.
 */
export function getTaskReadiness(task: Task, graph: ReadonlyMap<string, Task>): TaskReadiness {
	const notActionable: TaskReadiness = {
		isReady: false,
		isBlocked: false,
		blockingDependencies: [],
		missingDependencies: [],
	};

	// A task that is already completed is neither ready to start nor blocked.
	if (task.done) {
		return notActionable;
	}

	const dependencies = task.dependencies ?? [];
	if (dependencies.length === 0) {
		return { isReady: true, isBlocked: false, blockingDependencies: [], missingDependencies: [] };
	}

	const blockingDependencies: string[] = [];
	const missingDependencies: string[] = [];
	for (const dependencyId of dependencies) {
		const dependency = graph.get(dependencyId);
		if (dependency === undefined) {
			missingDependencies.push(dependencyId);
		} else if (!dependency.done) {
			blockingDependencies.push(dependency.id);
		}
	}

	const isBlocked = blockingDependencies.length > 0 || missingDependencies.length > 0;
	return { isReady: !isBlocked, isBlocked, blockingDependencies, missingDependencies };
}

/**
 * Explain why a task is not ready, in one line shared by every surface. Unfinished dependencies
 * and dependency IDs that could not be resolved are named separately so they are not confused.
 */
export function formatReadinessBlockers(readiness: TaskReadiness): string {
	const reasons: string[] = [];
	if (readiness.blockingDependencies.length > 0) {
		reasons.push(`Blocked by ${readiness.blockingDependencies.join(", ")}`);
	}
	if (readiness.missingDependencies.length > 0) {
		const noun = readiness.missingDependencies.length === 1 ? "dependency" : "dependencies";
		reasons.push(`Unknown ${noun} ${readiness.missingDependencies.join(", ")}`);
	}
	return reasons.join("; ");
}
