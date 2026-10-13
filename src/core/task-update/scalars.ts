import type { Task, TaskUpdateInput } from "../../types/index.ts";
import { normalizeDueDate } from "../../utils/due-date.ts";

export interface ScalarUpdateContext {
	resolveStatus(status: string): Promise<string>;
	normalizePriority(priority: string): Promise<string | undefined>;
	normalizeType(type: string): Promise<string | undefined>;
	normalizeProject(project: string): Promise<string | undefined>;
}

type ScalarRule = (task: Task, input: TaskUpdateInput, context: ScalarUpdateContext) => Promise<boolean>;

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
	async (task, input) => {
		if (input.title === undefined) return false;
		const title = input.title.trim();
		if (title.length === 0) throw new Error("Title cannot be empty.");
		return replaceString(title, task.title, (value) => {
			task.title = value;
		});
	},
	async (task, input) =>
		replaceString(input.description, task.description, (value) => {
			task.description = value;
		}),
	async (task, input) => {
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
	async (task, input, context) => {
		if (input.status === undefined) return false;
		return replaceString(await context.resolveStatus(input.status), task.status, (value) => {
			task.status = value;
		});
	},
	async (task, input, context) => {
		if (input.priority === undefined) return false;
		const priority = await context.normalizePriority(String(input.priority));
		if (task.priority === priority) return false;
		task.priority = priority;
		return true;
	},
	async (task, input, context) => {
		if (input.type === undefined) return false;
		const type = await context.normalizeType(String(input.type));
		if (task.type === type) return false;
		task.type = type;
		return true;
	},
	async (task, input, context) => {
		if (input.project === undefined) return false;
		const project = input.project === null ? undefined : await context.normalizeProject(input.project);
		return replaceOptional(
			task.project,
			project,
			(value) => {
				task.project = value;
			},
			() => delete task.project,
		);
	},
	async (task, input) => {
		if (input.milestone === undefined) return false;
		const milestone = input.milestone === null ? undefined : input.milestone.trim() || undefined;
		return replaceOptional(
			task.milestone,
			milestone,
			(value) => {
				task.milestone = value;
			},
			() => delete task.milestone,
		);
	},
	async (task, input) => {
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
	async (task, input) => {
		if (input.agentConfiguration === undefined) return false;
		const configuration = input.agentConfiguration ?? undefined;
		if (JSON.stringify(task.agentConfiguration) === JSON.stringify(configuration)) return false;
		if (configuration) task.agentConfiguration = structuredClone(configuration);
		else delete task.agentConfiguration;
		return true;
	},
];

export async function applyScalarTaskUpdates(
	task: Task,
	input: TaskUpdateInput,
	context: ScalarUpdateContext,
): Promise<boolean> {
	let mutated = false;
	for (const rule of scalarRules) mutated = (await rule(task, input, context)) || mutated;
	return mutated;
}
