import type { BoxRenderable, CliRenderer } from "@opentui/core";
import { type EffectiveAgentConfiguration, resolveSessionSettings } from "../../model/session/types.ts";
import { getPriorityLabels } from "../../model/task/priority-config.ts";
import { getTaskTypeValues } from "../../model/task/task-type-config.ts";
import type { Task, TaskCreateInput } from "../../model/types.ts";
import { TASK_FIELD_LABELS } from "../formatters/task-labels.ts";
import {
	mountTaskForm,
	type TaskFormInputField,
	type TaskFormMount,
	type TaskFormSelectField,
	type TaskFormTextareaField,
	type TaskFormToggleField,
	type TaskFormValues,
} from "./controls.ts";

export type TaskComposerOptions = {
	statuses: readonly string[];
	types?: readonly string[];
	priorities?: readonly string[];
	persist: (input: TaskCreateInput) => Promise<Task>;
};

const FIELD_NAMES = [
	"root",
	"title",
	"description",
	"status",
	"type",
	"priority",
	"agentPreset",
	"worktreePerTask",
	"yoloMode",
] as const;

type TaskComposerFieldName = (typeof FIELD_NAMES)[number];

/** One concrete field per name so a mapped {@link TaskFormValues} can tell the toggle names apart */
type TaskComposerFieldFor<Name extends TaskComposerFieldName> = Name extends "title"
	? TaskFormInputField<"title">
	: Name extends "description"
		? TaskFormTextareaField<"description">
		: Name extends "root"
			? TaskFormToggleField<"root">
			: Name extends "worktreePerTask"
				? TaskFormToggleField<"worktreePerTask">
				: Name extends "yoloMode"
					? TaskFormToggleField<"yoloMode">
					: TaskFormSelectField<Name>;

type TaskComposerField = {
	[Name in TaskComposerFieldName]: TaskComposerFieldFor<Name>;
}[TaskComposerFieldName];

type TaskComposerFields = readonly TaskComposerField[];

export type OpenTuiTaskComposerOptions = Omit<TaskComposerOptions, "screen" | "persist"> & {
	readonly onResult?: (task: Task | null) => void;
	readonly agentConfiguration?: EffectiveAgentConfiguration;
	/** When set, the new task is added to this group unless the user checks Root. */
	readonly defaultGroupId?: string | null;
	/** Name of the default group, shown in the Root toggle label. */
	readonly defaultGroupName?: string;
	readonly persist: (input: TaskCreateInput, context: { groupId: string | null }) => Promise<Task>;
};

export type OpenTuiTaskComposerMount = {
	readonly result: Promise<Task | null>;
	dispose(): void;
};

function uniqueValues(values: readonly string[]): string[] {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const value of values) {
		const trimmed = String(value ?? "").trim();
		const normalized = trimmed.toLowerCase();
		if (!trimmed || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(trimmed);
	}
	return result;
}

function workflowStatuses(statuses: readonly string[]): string[] {
	const values = uniqueValues(statuses);
	return values.length > 0 ? values : ["To Do"];
}

function selectOptions(values: readonly string[], includeNone = false): { label: string; value: string }[] {
	return [...(includeNone ? [{ label: "None", value: "" }] : []), ...values.map((value) => ({ label: value, value }))];
}

function taskComposerFields(options: OpenTuiTaskComposerOptions): TaskComposerFields {
	const statuses = workflowStatuses(options.statuses);
	const sessions = resolveSessionSettings(options.agentConfiguration);
	const fields: TaskComposerField[] = [
		{
			kind: "toggle",
			name: "root",
			label: options.defaultGroupId ? `Root (uncheck to add inside "${options.defaultGroupName ?? "group"}")` : "Root",
			value: !options.defaultGroupId,
		},
		{ kind: "input", name: "title", label: TASK_FIELD_LABELS.TITLE },
		{
			kind: "textarea",
			name: "description",
			label: TASK_FIELD_LABELS.DESCRIPTION,
			placeholder: "Optional task description",
			height: 4,
		},
		{
			kind: "select",
			name: "status",
			label: TASK_FIELD_LABELS.STATUS,
			options: selectOptions(statuses),
			value: statuses[0],
		},
		{
			kind: "select",
			name: "type",
			label: TASK_FIELD_LABELS.TYPE,
			options: selectOptions(getTaskTypeValues(options.types), true),
			value: "",
		},
		{
			kind: "select",
			name: "priority",
			label: TASK_FIELD_LABELS.PRIORITY,
			options: [
				{ label: "None", value: "" },
				...getPriorityLabels(options.priorities).map((priority) => ({ label: priority, value: priority })),
			],
			value: "",
		},
	];
	if (options.agentConfiguration) {
		fields.push({
			kind: "select",
			name: "agentPreset",
			label: "Agent preset",
			options: [
				{ label: `Inherit project (${options.agentConfiguration.selectedPreset})`, value: "" },
				...selectOptions(Object.keys(options.agentConfiguration.presets)),
			],
			value: "",
		});
	}
	fields.push(
		{ kind: "toggle", name: "worktreePerTask", label: "Worktree per task", value: sessions.worktreePerTask },
		{ kind: "toggle", name: "yoloMode", label: "YOLO mode", value: sessions.yoloMode },
	);
	return fields;
}

function toTaskCreateInput(values: TaskFormValues<TaskComposerFields>): TaskCreateInput {
	const title = values.title.trim();
	const description = values.description.trim();
	return {
		title,
		status: values.status,
		...(description && { description }),
		...(values.type && { type: values.type }),
		...(values.priority && { priority: values.priority }),
	};
}

/** Mount a task composer into a caller-owned OpenTUI parent. */
export function mountOpenTuiTaskComposer(
	renderer: CliRenderer,
	parent: BoxRenderable,
	options: OpenTuiTaskComposerOptions,
): OpenTuiTaskComposerMount {
	let settled = false;
	let form: TaskFormMount<TaskComposerFields> | undefined;
	let resolveResult: (task: Task | null) => void = () => undefined;
	const result = new Promise<Task | null>((resolve) => {
		resolveResult = resolve;
	});
	const settle = (task: Task | null): void => {
		if (settled) return;
		settled = true;
		form?.dispose();
		resolveResult(task);
		options.onResult?.(task);
	};
	const submit = async (values: TaskFormValues<TaskComposerFields>): Promise<void> => {
		const input = toTaskCreateInput(values);
		const inherited = resolveSessionSettings(options.agentConfiguration);
		const presetChosen = Boolean(values.agentPreset);
		const worktreePerTask = Boolean(values.worktreePerTask);
		const yoloMode = Boolean(values.yoloMode);
		const sessions = {
			...(worktreePerTask !== inherited.worktreePerTask && { worktreePerTask }),
			...(yoloMode !== inherited.yoloMode && { yoloMode }),
		};
		const sessionsChanged = Object.keys(sessions).length > 0;
		if (options.agentConfiguration && (presetChosen || sessionsChanged)) {
			input.agentConfiguration = {
				...(presetChosen && { selectedPreset: values.agentPreset }),
				...(Object.keys(sessions).length > 0 && { sessions }),
			};
		}
		const groupId = values.root ? null : (options.defaultGroupId ?? null);
		settle(await options.persist(input, { groupId }));
	};
	form = mountTaskForm(renderer, parent, {
		title: "Create Task",
		fields: taskComposerFields(options),
		submitLabel: "create",
		onSubmit: submit,
		onCancel: () => settle(null),
	});
	return {
		result,
		dispose(): void {
			settle(null);
		},
	};
}
