import { DEFAULT_STATUSES } from "../../constants.ts";
import type { AgenticWorkspaceConfig, Milestone, Task, TaskUpdateInput } from "../../types.ts";
import { normalizeDueDate } from "../due-date.ts";
import { requireMilestoneId } from "../milestones.ts";
import { formatValidPriorityValues, resolvePriorityLabel } from "../priority-config.ts";
import {
	formatValidProjectValues,
	getProjectValues,
	noProjectsConfiguredMessage,
	resolveProjectValue,
} from "../project-config.ts";
import { findCanonicalStatus, formatValidStatuses } from "../status.ts";
import { formatValidTaskTypeValues, resolveTaskTypeValue } from "../task-type-config.ts";

export interface ScalarUpdateContext {
	readonly configuration?: Pick<AgenticWorkspaceConfig, "statuses" | "priorities" | "types" | "projects"> | null;
	readonly projectConfigPath?: string;
	readonly milestones?: readonly Milestone[];
}

type ScalarRule = (task: Task, input: TaskUpdateInput, context: ScalarUpdateContext) => boolean;

function replaceString(
	value: string | undefined,
	current: string | undefined,
	assign: (next: string) => void,
): boolean {
	if (typeof value !== "string" || (current ?? "") === value) return false;
	assign(value);
	return true;
}

function replaceOptional<T>(
	current: T | undefined,
	next: T | undefined,
	assign: (value: T) => void,
	remove: () => void,
): boolean {
	if (current === next) return false;
	if (next === undefined) remove();
	else assign(next);
	return true;
}

const scalarRules: readonly ScalarRule[] = [
	(task, input) => {
		if (input.title === undefined) return false;
		const title = input.title.trim();
		if (title.length === 0) throw new Error("Title cannot be empty.");
		return replaceString(title, task.title, (value) => {
			task.title = value;
		});
	},
	(task, input) =>
		replaceString(input.description, task.description, (value) => {
			task.description = value;
		}),
	(task, input) => {
		if (input.dueDate === undefined) return false;
		const dueDate = input.dueDate === null ? undefined : normalizeDueDate(input.dueDate, "Due date");
		return replaceOptional(
			task.dueDate,
			dueDate,
			(value) => {
				task.dueDate = value;
			},
			() => delete task.dueDate,
		);
	},
	(task, input, context) => {
		if (input.status === undefined) return false;
		const statuses = context.configuration?.statuses?.length ? context.configuration.statuses : DEFAULT_STATUSES;
		const status = findCanonicalStatus(input.status, statuses);
		if (!status)
			throw new Error(`Invalid status: ${input.status}. Valid statuses are: ${formatValidStatuses([...statuses])}`);
		return replaceString(status, task.status, (value) => {
			task.status = value;
		});
	},
	(task, input, context) => {
		if (input.priority === undefined) return false;
		const value = String(input.priority);
		const priority = value === "" ? undefined : resolvePriorityLabel(value, context.configuration);
		if (value !== "" && !priority)
			throw new Error(
				`Invalid priority: ${value}. Valid values are: ${formatValidPriorityValues(context.configuration)}`,
			);
		if (task.priority === priority) return false;
		task.priority = priority;
		return true;
	},
	(task, input, context) => {
		if (input.type === undefined) return false;
		const value = String(input.type);
		const type = value === "" ? undefined : resolveTaskTypeValue(value, context.configuration);
		if (value !== "" && !type)
			throw new Error(`Invalid type: ${value}. Valid types are: ${formatValidTaskTypeValues(context.configuration)}`);
		if (task.type === type) return false;
		task.type = type;
		return true;
	},
	(task, input, context) => {
		if (input.project === undefined) return false;
		const value = input.project;
		if (value !== null && value !== "" && getProjectValues(context.configuration).length === 0) {
			throw new Error(noProjectsConfiguredMessage(context.projectConfigPath));
		}
		const project = value === null || value === "" ? undefined : resolveProjectValue(value, context.configuration);
		if (value !== null && value !== "" && !project)
			throw new Error(
				`Invalid project: ${value}. Valid projects are: ${formatValidProjectValues(context.configuration)}`,
			);
		return replaceOptional(
			task.project,
			project,
			(value) => {
				task.project = value;
			},
			() => delete task.project,
		);
	},
	(task, input, context) => {
		if (input.milestone === undefined) return false;
		const requested = input.milestone;
		const milestone = requested === null || requested.trim() === "" ? undefined : requested;
		if (milestone) {
			if (!context.milestones) throw new Error("Milestones must be loaded before assigning one to a task.");
			requireMilestoneId(milestone, context.milestones);
		}
		return replaceOptional(
			task.milestone,
			milestone,
			(value) => {
				task.milestone = value;
			},
			() => delete task.milestone,
		);
	},
	(task, input) => {
		if (input.ordinal === undefined) return false;
		if (typeof input.ordinal !== "number" || !Number.isFinite(input.ordinal) || input.ordinal < 0) {
			throw new Error("Ordinal must be a non-negative number.");
		}
		return replaceOptional(
			task.ordinal,
			input.ordinal,
			(value) => {
				task.ordinal = value;
			},
			() => delete task.ordinal,
		);
	},
	(task, input) => {
		if (input.agentConfiguration === undefined) return false;
		const configuration = input.agentConfiguration ?? undefined;
		if (JSON.stringify(task.agentConfiguration) === JSON.stringify(configuration)) return false;
		if (configuration) task.agentConfiguration = structuredClone(configuration);
		else delete task.agentConfiguration;
		return true;
	},
];

export function applyScalarTaskUpdates(task: Task, input: TaskUpdateInput, context: ScalarUpdateContext): boolean {
	let mutated = false;
	for (const rule of scalarRules) mutated = rule(task, input, context) || mutated;
	return mutated;
}
