import { MILLISECONDS_PER_DAY } from "../../lib/time.ts";
import { DEFAULT_DONE_STATUS } from "../constants.ts";
import type { Task } from "../types.ts";
import { getPriorityValues, normalizePriorityValue } from "./priority-config.ts";
import { statusComparisonKey } from "./status.ts";
import { taskIdKey } from "./task-id.ts";

const RECENT_ACTIVITY_DAYS = 7;
const STALE_TASK_DAYS = 30;
const HEALTH_TASK_LIMIT = 5;
const DONE_STATUS_KEY = statusComparisonKey(DEFAULT_DONE_STATUS);

function isDoneStatus(status: string | null | undefined): boolean {
	return statusComparisonKey(status) === DONE_STATUS_KEY;
}

function taskAgeInDays(task: Task, now: Date): number | null {
	if (!task.createdDate) return null;
	const created = new Date(task.createdDate);
	const end = isDoneStatus(task.status) && task.updatedDate ? new Date(task.updatedDate) : now;
	return Math.floor((end.getTime() - created.getTime()) / MILLISECONDS_PER_DAY);
}

function hasBlockingDependency(task: Task, tasksById: Map<string, Task>): boolean {
	return Boolean(
		task.dependencies?.some((dependencyId) => {
			const dependency = tasksById.get(taskIdKey(dependencyId));
			return !isDoneStatus(dependency?.status);
		}),
	);
}

type StatisticsAccumulator = {
	completedTasks: number;
	noPriorityCount: number;
	totalAge: number;
	taskCount: number;
	recentlyCreated: Task[];
	recentlyUpdated: Task[];
	staleTasks: Task[];
	blockedTasks: Task[];
};

function createStatisticsAccumulator(): StatisticsAccumulator {
	return {
		completedTasks: 0,
		noPriorityCount: 0,
		totalAge: 0,
		taskCount: 0,
		recentlyCreated: [],
		recentlyUpdated: [],
		staleTasks: [],
		blockedTasks: [],
	};
}

function countTask(
	task: Task,
	statusCounts: Map<string, number>,
	statusLabelByKey: Map<string, string>,
	priorityCounts: Map<string, number>,
	state: StatisticsAccumulator,
): void {
	const raw = task.status ?? "";
	const key = statusComparisonKey(raw);
	let label = statusLabelByKey.get(key);
	if (!label) {
		label = raw;
		statusLabelByKey.set(key, label);
	}
	statusCounts.set(label, (statusCounts.get(label) ?? 0) + 1);
	if (isDoneStatus(task.status)) state.completedTasks++;
	const priority = normalizePriorityValue(task.priority);
	if (priority) priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);
	else state.noPriorityCount++;
}

function collectTaskAge(task: Task, now: Date, state: StatisticsAccumulator): void {
	const ageInDays = taskAgeInDays(task, now);
	if (ageInDays === null) return;
	state.totalAge += ageInDays;
	state.taskCount++;
}

function collectRecentTaskActivity(task: Task, cutoff: Date, state: StatisticsAccumulator): void {
	if (task.createdDate && new Date(task.createdDate) >= cutoff) state.recentlyCreated.push(task);
	if (task.updatedDate && new Date(task.updatedDate) >= cutoff) state.recentlyUpdated.push(task);
}

function collectStaleTask(task: Task, cutoff: Date, state: StatisticsAccumulator): void {
	const lastDate = task.updatedDate || task.createdDate;
	if (!isDoneStatus(task.status) && lastDate && new Date(lastDate) < cutoff) state.staleTasks.push(task);
}

function collectBlockedTask(task: Task, tasksById: Map<string, Task>, state: StatisticsAccumulator): void {
	if (!isDoneStatus(task.status) && task.dependencies?.length && hasBlockingDependency(task, tasksById)) {
		state.blockedTasks.push(task);
	}
}

function sortNewest(tasks: Task[], date: (task: Task) => string | undefined): Task[] {
	return tasks.sort((left, right) => new Date(date(right) || 0).getTime() - new Date(date(left) || 0).getTime());
}

export interface TaskStatistics {
	statusCounts: Map<string, number>;
	priorityCounts: Map<string, number>;
	noPriorityCount: number;
	totalTasks: number;
	completedTasks: number;
	completionPercentage: number;
	draftCount: number;
	recentActivity: {
		created: Task[];
		updated: Task[];
	};
	projectHealth: {
		averageTaskAge: number;
		staleTasks: Task[];
		blockedTasks: Task[];
	};
}

/**
 * Calculate comprehensive task statistics for the overview
 */
export function getTaskStatistics(
	tasks: Task[],
	drafts: Task[],
	statuses: string[],
	priorityOrder?: readonly string[],
): TaskStatistics {
	const statusCounts = new Map<string, number>();
	const statusLabelByKey = new Map<string, string>();
	const priorityCounts = new Map<string, number>();

	// Initialize status counts, keeping the first configured spelling per comparison key
	for (const status of statuses) {
		const key = statusComparisonKey(status);
		if (statusLabelByKey.has(key)) continue;
		statusLabelByKey.set(key, status);
		statusCounts.set(status, 0);
	}

	// Initialize priority counts
	for (const priority of getPriorityValues(priorityOrder)) {
		priorityCounts.set(priority, 0);
	}

	const now = new Date();
	const recentActivityCutoff = new Date(now.getTime() - RECENT_ACTIVITY_DAYS * MILLISECONDS_PER_DAY);
	const staleTaskCutoff = new Date(now.getTime() - STALE_TASK_DAYS * MILLISECONDS_PER_DAY);

	const state = createStatisticsAccumulator();
	const tasksById = new Map(tasks.map((task) => [taskIdKey(task.id), task]));

	// Process each task
	for (const task of tasks) {
		// Skip tasks with empty or undefined status
		if (!task.status || task.status === "") {
			continue;
		}

		countTask(task, statusCounts, statusLabelByKey, priorityCounts, state);
		collectTaskAge(task, now, state);
		collectRecentTaskActivity(task, recentActivityCutoff, state);
		collectStaleTask(task, staleTaskCutoff, state);
		collectBlockedTask(task, tasksById, state);
	}

	sortNewest(state.recentlyCreated, (task) => task.createdDate);
	sortNewest(state.recentlyUpdated, (task) => task.updatedDate);
	const averageTaskAge = state.taskCount > 0 ? Math.round(state.totalAge / state.taskCount) : 0;

	// Calculate completion percentage (only count tasks with valid status)
	const totalTasks = Array.from(statusCounts.values()).reduce((sum, count) => sum + count, 0);
	const completionPercentage = totalTasks > 0 ? Math.round((state.completedTasks / totalTasks) * 100) : 0;

	return {
		statusCounts,
		priorityCounts,
		noPriorityCount: state.noPriorityCount,
		totalTasks,
		completedTasks: state.completedTasks,
		completionPercentage,
		draftCount: drafts.length,
		recentActivity: {
			created: state.recentlyCreated.slice(0, HEALTH_TASK_LIMIT),
			updated: state.recentlyUpdated.slice(0, HEALTH_TASK_LIMIT),
		},
		projectHealth: {
			averageTaskAge,
			staleTasks: state.staleTasks.slice(0, HEALTH_TASK_LIMIT),
			blockedTasks: state.blockedTasks.slice(0, HEALTH_TASK_LIMIT),
		},
	};
}
