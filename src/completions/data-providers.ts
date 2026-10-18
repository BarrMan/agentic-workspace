import { DEFAULT_STATUSES } from "../constants/index.ts";
import { type Core, createRuntimeCore } from "../core/agentic-workspace.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { assigneeComparisonKey } from "../utils/assignee-filter.ts";
import { labelComparisonKey } from "../utils/label-filter.ts";

type CoreCallback<T> = (core: Core) => Promise<T>;

/**
 * Execute a callback with a Core instance, returning a fallback value if anything fails.
 */
async function withCore<T>(callback: CoreCallback<T>, fallback: T): Promise<T> {
	try {
		const core = await createRuntimeCore();
		return await callback(core);
	} catch {
		return fallback;
	}
}

function getDefaultStatuses(): string[] {
	return [...DEFAULT_STATUSES];
}

/**
 * Get all task IDs from the agentic-workspace
 */
export async function getTaskIds(): Promise<string[]> {
	return await withCore(async (core) => {
		const tasks = await core.loadStoredTasks();
		return tasks.map((task) => task.id).sort();
	}, []);
}

/**
 * Get configured status values
 */
export async function getStatuses(): Promise<string[]> {
	return await withCore(async (core) => {
		const config: AgenticWorkspaceConfig | null = await core.getStoredConfig();
		const statuses = config?.statuses;
		if (Array.isArray(statuses) && statuses.length > 0) {
			return statuses;
		}
		return getDefaultStatuses();
	}, getDefaultStatuses());
}

/**
 * Get unique labels from all tasks
 */
export async function getLabels(): Promise<string[]> {
	return await withCore(async (core) => {
		const tasks = await core.loadStoredTasks();
		const labels = new Map<string, string>();
		for (const task of tasks) {
			for (const label of task.labels) {
				const key = labelComparisonKey(label);
				if (key && !labels.has(key)) labels.set(key, label);
			}
		}
		return Array.from(labels.values()).sort();
	}, []);
}

/**
 * Get unique assignees from all tasks
 */
export async function getAssignees(): Promise<string[]> {
	return await withCore(async (core) => {
		const tasks = await core.loadStoredTasks();
		const assignees = new Map<string, string>();
		for (const task of tasks) {
			for (const assignee of task.assignee) {
				const key = assigneeComparisonKey(assignee);
				if (key && !assignees.has(key)) assignees.set(key, assignee);
			}
		}
		return Array.from(assignees.values()).sort();
	}, []);
}
