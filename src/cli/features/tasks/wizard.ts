import { TextPrompt } from "@clack/core";
import * as clack from "@clack/prompts";
import picocolors from "picocolors";
import { normalizeStringList } from "../../../lib/string-list.ts";
import { DEFAULT_STATUSES, DRAFT_STATUS, FALLBACK_STATUS } from "../../../model/constants.ts";
import { normalizeDueDate } from "../../../model/task/due-date.ts";
import { getPriorityOptions, normalizePriorityValue } from "../../../model/task/priority-config.ts";
import { getProjectValues, resolveProjectValue } from "../../../model/task/project-config.ts";
import { findCanonicalStatus, statusComparisonKey } from "../../../model/task/status.ts";
import { getTaskTypeValues, resolveTaskTypeValue } from "../../../model/task/task-type-config.ts";
import type { Task, TaskCreateInput, TaskUpdateInput } from "../../../model/types.ts";
import { TASK_FIELD_LABELS } from "../../../renderer/formatters/task-labels.ts";
import { TaskWizardCancelledError } from "../../errors/wizard.ts";

interface TaskWizardValues {
	title: string;
	description: string;
	status: string;
	priority: string;
	type: string;
	project: string;
	dueDate: string;
	assignee: string;
	labels: string;
	references: string;
	documentation: string;
	dependencies: string;
}

export interface TaskWizardTaskOption {
	id: string;
	title: string;
	/** Opaque value returned on selection; defaults to the id when a caller binds rows to other handles. */
	value?: string;
}

interface PromptChoice {
	label: string;
	value: string;
	hint?: string;
}

interface TaskWizardQuestion {
	type: "text" | "select";
	name: string;
	message: string;
	initial?: string;
	options?: PromptChoice[];
	validate?: (value: string | undefined) => string | undefined;
	allowBackspaceNavigation?: boolean;
}

interface TaskWizardValueQuestion extends Omit<TaskWizardQuestion, "name"> {
	name: keyof TaskWizardValues;
}

export type TaskWizardPromptRunner = (question: TaskWizardQuestion) => Promise<Record<string, unknown>>;

interface WizardOptions {
	statuses: string[];
	priorities?: string[];
	types?: string[];
	projects?: string[];
	promptImpl?: TaskWizardPromptRunner;
}

const SINGLE_LINE_PROMPT_GUIDANCE = "single-line prompt; Shift+Enter not supported";
const WIZARD_NAVIGATION_KEY = "__wizardNavigation";
const WIZARD_NAVIGATION_PREVIOUS = "previous";
const WIZARD_BACKSPACE_NAVIGATION = Symbol("task-wizard-backspace-navigation");

function parseListInput(value: string): string[] {
	return normalizeStringList(value.split(/,|\r?\n/g)) ?? [];
}

function getDefaultCreateStatus(statuses: string[]): string {
	const canonicalTodo = findCanonicalStatus(FALLBACK_STATUS, statuses);
	if (canonicalTodo) {
		return canonicalTodo;
	}
	const firstStatus = statuses.find((status) => status.trim().length > 0);
	return firstStatus ?? FALLBACK_STATUS;
}

function buildStatusPromptValues(params: { statuses: string[]; mode: "create" | "edit"; initialStatus: string }): {
	options: PromptChoice[];
	initial: string;
} {
	const configuredStatuses = normalizeStringList(params.statuses) ?? [];
	const baseStatuses = configuredStatuses.length > 0 ? configuredStatuses : [...DEFAULT_STATUSES];
	const hasDraftStatus = baseStatuses.some(
		(status) => statusComparisonKey(status) === statusComparisonKey(DRAFT_STATUS),
	);
	const selectableStatuses = hasDraftStatus ? baseStatuses : [DRAFT_STATUS, ...baseStatuses];
	const options: PromptChoice[] = selectableStatuses.map((status) => ({
		label: status,
		value: status,
	}));

	if (params.mode === "create") {
		const createDefault = getDefaultCreateStatus(baseStatuses);
		return {
			options,
			initial: createDefault,
		};
	}

	const initialStatus = params.initialStatus.trim();
	if (!initialStatus) {
		return {
			options,
			initial: getDefaultCreateStatus(baseStatuses),
		};
	}

	const canonicalInitial = findCanonicalStatus(initialStatus, selectableStatuses);
	if (canonicalInitial) {
		return {
			options,
			initial: canonicalInitial,
		};
	}

	return {
		options: [{ label: `${params.initialStatus} (current)`, value: params.initialStatus }, ...options],
		initial: params.initialStatus,
	};
}

function buildPriorityPromptValues(
	initialPriority: string,
	priorities?: string[],
): {
	options: PromptChoice[];
	initial: string;
} {
	const normalizedInitial = normalizePriorityValue(initialPriority) ?? "";
	const options: PromptChoice[] = [
		{ label: "None", value: "", hint: "No priority" },
		...getPriorityOptions(priorities).map((priority) => ({
			label: priority.label,
			value: priority.value,
		})),
	];
	if (!normalizedInitial) {
		return { options, initial: "" };
	}
	if (options.some((option) => option.value === normalizedInitial)) {
		return { options, initial: normalizedInitial };
	}
	return {
		options: [{ label: `${initialPriority} (current)`, value: normalizedInitial }, ...options],
		initial: normalizedInitial,
	};
}

function buildConfiguredChoicePromptValues(
	initialValue: string,
	configuredValues: string[] | undefined,
	resolveValue: (value: string, values?: string[]) => string | undefined,
	getValues: (values?: string[]) => string[],
	noneHint: string,
): {
	options: PromptChoice[];
	initial: string;
} {
	const canonicalInitial = resolveValue(initialValue, configuredValues) ?? initialValue.trim();
	const options: PromptChoice[] = [
		{ label: "None", value: "", hint: noneHint },
		...getValues(configuredValues).map((value) => ({ label: value, value })),
	];
	if (!canonicalInitial) {
		return { options, initial: "" };
	}
	if (options.some((option) => option.value === canonicalInitial)) {
		return { options, initial: canonicalInitial };
	}
	return {
		options: [{ label: `${initialValue} (current)`, value: initialValue }, ...options],
		initial: initialValue,
	};
}

function buildTaskTypePromptValues(initialType: string, types?: string[]) {
	return buildConfiguredChoicePromptValues(initialType, types, resolveTaskTypeValue, getTaskTypeValues, "No task type");
}

function buildProjectPromptValues(initialProject: string, projects?: string[]) {
	return buildConfiguredChoicePromptValues(
		initialProject,
		projects,
		resolveProjectValue,
		getProjectValues,
		"No project",
	);
}

function formatListInput(values?: string[]): string {
	return values && values.length > 0 ? values.join(", ") : "";
}

function areStringArraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((value, index) => value === b[index]);
}

function applyChangedList(initialValue: string, nextValue: string, apply: (values: string[]) => void): void {
	const initial = parseListInput(initialValue);
	const next = parseListInput(nextValue);
	if (!areStringArraysEqual(initial, next)) apply(next);
}

const clackPromptRunner: TaskWizardPromptRunner = async (question) => {
	if (question.type === "text") {
		const textPrompt = new TextPrompt({
			initialValue: question.initial,
			validate: question.validate,
			render() {
				return renderTextPrompt(question, this);
			},
		});
		let previousInput = question.initial ?? "";
		textPrompt.on("key", (_key, keyInfo) => {
			if (keyInfo.name !== "backspace") {
				previousInput = textPrompt.userInput;
				return;
			}
			const wasEmptyBeforeKeypress = previousInput.length === 0;
			const isEmptyAfterKeypress = textPrompt.userInput.length === 0;
			if (question.allowBackspaceNavigation && wasEmptyBeforeKeypress && isEmptyAfterKeypress) {
				textPrompt.state = "submit";
				textPrompt.value = WIZARD_BACKSPACE_NAVIGATION as unknown as string;
				return;
			}
			previousInput = textPrompt.userInput;
		});
		const result = await textPrompt.prompt();
		if (result === WIZARD_BACKSPACE_NAVIGATION) {
			return { [WIZARD_NAVIGATION_KEY]: WIZARD_NAVIGATION_PREVIOUS };
		}
		if (clack.isCancel(result)) {
			throw new TaskWizardCancelledError();
		}
		return { [question.name]: String(result ?? "") };
	}

	const options = question.options ?? [];
	if (options.length === 0) {
		throw new Error(`No options provided for select prompt '${question.name}'.`);
	}
	const result = await clack.select({
		message: question.message,
		initialValue: question.initial,
		options: options.map((option) => ({
			label: option.label,
			value: option.value,
			hint: option.hint,
		})),
	});
	if (clack.isCancel(result)) {
		throw new TaskWizardCancelledError();
	}
	return { [question.name]: String(result ?? "") };
};

function renderTextPrompt(
	question: TaskWizardQuestion,
	prompt: Pick<TextPrompt, "state" | "userInput" | "userInputWithCursor" | "value" | "error">,
): string {
	const withGuide = clack.settings.withGuide;
	const header = `${withGuide ? `${picocolors.gray(clack.S_BAR)}\n` : ""}${clack.symbol(prompt.state)}  ${question.message}\n`;
	const input = prompt.userInput.length > 0 ? prompt.userInputWithCursor : picocolors.inverse(picocolors.hidden("_"));
	const value = String(prompt.value ?? "");
	if (prompt.state === "error") return renderTextPromptError(header, input, prompt.error, withGuide);
	if (prompt.state === "submit") return renderTextPromptSubmit(header, value, withGuide);
	if (prompt.state === "cancel") return renderTextPromptCancel(header, value, withGuide);
	return renderTextPromptActive(header, input, withGuide);
}

function renderTextPromptError(header: string, input: string, error: string, withGuide: boolean): string {
	const linePrefix = withGuide ? `${picocolors.yellow(clack.S_BAR)}  ` : "";
	const footer = withGuide ? picocolors.yellow(clack.S_BAR_END) : "";
	const errorMessage = error.length > 0 ? `  ${picocolors.yellow(error)}` : "";
	return `${header.trimEnd()}\n${linePrefix}${input}\n${footer}${errorMessage}\n`;
}

function renderTextPromptSubmit(header: string, value: string, withGuide: boolean): string {
	const linePrefix = withGuide ? picocolors.gray(clack.S_BAR) : "";
	return `${header}${linePrefix}${value.length > 0 ? `  ${picocolors.dim(value)}` : ""}`;
}

function renderTextPromptCancel(header: string, value: string, withGuide: boolean): string {
	const linePrefix = withGuide ? picocolors.gray(clack.S_BAR) : "";
	const displayed = value.length > 0 ? `  ${picocolors.strikethrough(picocolors.dim(value))}` : "";
	return `${header}${linePrefix}${displayed}${value.trim().length > 0 ? `\n${linePrefix}` : ""}`;
}

function renderTextPromptActive(header: string, input: string, withGuide: boolean): string {
	const linePrefix = withGuide ? `${picocolors.cyan(clack.S_BAR)}  ` : "";
	const footer = withGuide ? picocolors.cyan(clack.S_BAR_END) : "";
	return `${header}${linePrefix}${input}\n${footer}\n`;
}

async function promptText(
	prompt: TaskWizardPromptRunner,
	options: {
		name: keyof TaskWizardValues;
		message: string;
		initial?: string;
		validate?: (value: string | undefined) => string | undefined;
		allowBackspaceNavigation?: boolean;
	},
): Promise<string | typeof WIZARD_BACKSPACE_NAVIGATION> {
	const response = await prompt({
		type: "text",
		name: options.name,
		message: options.message,
		initial: options.initial,
		validate: options.validate,
		allowBackspaceNavigation: options.allowBackspaceNavigation,
	});
	if (response[WIZARD_NAVIGATION_KEY] === WIZARD_NAVIGATION_PREVIOUS) {
		return WIZARD_BACKSPACE_NAVIGATION;
	}
	return String(response[options.name] ?? "");
}

async function promptSelect(
	prompt: TaskWizardPromptRunner,
	options: {
		name: keyof TaskWizardValues;
		message: string;
		initial?: string;
		choices: PromptChoice[];
	},
): Promise<string> {
	const response = await prompt({
		type: "select",
		name: options.name,
		message: options.message,
		initial: options.initial,
		options: options.choices,
	});
	return String(response[options.name] ?? "");
}

async function runTaskWizardValues(params: {
	mode: "create" | "edit";
	statuses: string[];
	priorities?: string[];
	types?: string[];
	projects?: string[];
	initialValues: TaskWizardValues;
	promptImpl?: TaskWizardPromptRunner;
}): Promise<TaskWizardValues | null> {
	try {
		const form = buildWizardForm(params);
		await answerWizardQuestions(form.values, form.questions, params.promptImpl ?? clackPromptRunner);
		return normalizeWizardValues(form.values, params);
	} catch (error) {
		if (error instanceof TaskWizardCancelledError) {
			return null;
		}
		throw error;
	}
}

function buildWizardForm(params: Parameters<typeof runTaskWizardValues>[0]) {
	const status = buildStatusPromptValues({
		statuses: params.statuses,
		mode: params.mode,
		initialStatus: params.initialValues.status,
	});
	const priority = buildPriorityPromptValues(params.initialValues.priority, params.priorities);
	const type = buildTaskTypePromptValues(params.initialValues.type, params.types);
	const project = buildProjectPromptValues(params.initialValues.project, params.projects);
	const field = (
		name: keyof TaskWizardValues,
		message: string,
		validate?: TaskWizardQuestion["validate"],
	): TaskWizardValueQuestion => ({ type: "text", name, message, validate });
	const unchanged = (label: string) =>
		params.mode === "create" ? `${label} (comma-separated)` : `${label} (comma-separated; blank keeps current value)`;
	return {
		values: {
			...params.initialValues,
			status: status.initial,
			priority: priority.initial,
			type: type.initial,
			project: project.initial,
		},
		questions: [
			field("title", TASK_FIELD_LABELS.TITLE, (value) =>
				String(value ?? "").trim() ? undefined : `${TASK_FIELD_LABELS.TITLE} is required.`,
			),
			field("description", `Description (${SINGLE_LINE_PROMPT_GUIDANCE})`),
			{ type: "select", name: "status", message: TASK_FIELD_LABELS.STATUS, options: status.options },
			{ type: "select", name: "priority", message: TASK_FIELD_LABELS.PRIORITY, options: priority.options },
			{ type: "select", name: "type", message: "Type", options: type.options },
			...(getProjectValues(params.projects).length
				? [
						{
							type: "select" as const,
							name: "project" as const,
							message: TASK_FIELD_LABELS.PROJECT,
							options: project.options,
						},
					]
				: []),
			field("dueDate", "Due date (YYYY-MM-DD; blank for none)", validateWizardDueDate),
			field("assignee", unchanged(TASK_FIELD_LABELS.ASSIGNEE)),
			field("labels", unchanged(TASK_FIELD_LABELS.LABELS)),
			field("references", unchanged(TASK_FIELD_LABELS.REFERENCES)),
			field("documentation", unchanged("Documentation")),
			field(
				"dependencies",
				params.mode === "create"
					? "Dependencies (comma-separated task IDs)"
					: "Dependencies (comma-separated task IDs; blank keeps current value)",
			),
		] as TaskWizardValueQuestion[],
	};
}

function validateWizardDueDate(value: string | undefined): string | undefined {
	try {
		normalizeDueDate(value, "Due date");
	} catch (error) {
		return error instanceof Error ? error.message : "Invalid due date.";
	}
}

async function answerWizardQuestions(
	values: TaskWizardValues,
	questions: TaskWizardValueQuestion[],
	prompt: TaskWizardPromptRunner,
): Promise<void> {
	for (let index = 0; index < questions.length; ) {
		const question = questions[index];
		if (!question) break;
		const answer =
			question.type === "text"
				? await promptText(prompt, {
						name: question.name,
						message: question.message,
						initial: values[question.name],
						validate: question.validate,
						allowBackspaceNavigation: index > 0,
					})
				: await promptSelect(prompt, {
						name: question.name,
						message: question.message,
						initial: values[question.name],
						choices: question.options ?? [],
					});
		if (answer === WIZARD_BACKSPACE_NAVIGATION) index = Math.max(0, index - 1);
		else {
			values[question.name] = answer;
			index += 1;
		}
	}
}

function normalizeWizardValues(
	values: TaskWizardValues,
	params: Parameters<typeof runTaskWizardValues>[0],
): TaskWizardValues {
	return {
		...values,
		title: values.title.trim(),
		status: values.status.trim().length
			? (findCanonicalStatus(values.status, params.statuses) ?? values.status.trim())
			: "",
		priority: normalizePriorityValue(values.priority) ?? "",
		type: resolveTaskTypeValue(values.type, params.types) ?? values.type.trim(),
		project: resolveProjectValue(values.project, params.projects) ?? values.project.trim(),
		dueDate: normalizeDueDate(values.dueDate, "Due date") ?? "",
	};
}

export async function pickTaskForEditWizard(params: {
	tasks: TaskWizardTaskOption[];
	promptImpl?: TaskWizardPromptRunner;
}): Promise<string | undefined> {
	const prompt = params.promptImpl ?? clackPromptRunner;
	const tasks = [...params.tasks].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
	if (tasks.length === 0) {
		return undefined;
	}

	try {
		const response = await prompt({
			type: "select",
			name: "taskId",
			message: "Select task to edit",
			options: tasks.map((task) => ({
				label: `${task.id} - ${task.title}`,
				value: task.value ?? task.id,
			})),
		});
		const selected = response.taskId;
		return typeof selected === "string" ? selected : undefined;
	} catch (error) {
		if (error instanceof TaskWizardCancelledError) {
			return undefined;
		}
		throw error;
	}
}

function toInitialWizardValues(input: { title?: string } & Partial<Task>): TaskWizardValues {
	return {
		title: input.title ?? "",
		description: input.description ?? "",
		status: input.status ?? "",
		priority: input.priority ?? "",
		type: input.type ?? "",
		project: input.project ?? "",
		dueDate: input.dueDate ?? "",
		assignee: formatListInput(input.assignee),
		labels: formatListInput(input.labels),
		references: formatListInput(input.references),
		documentation: formatListInput(input.documentation),
		dependencies: formatListInput(input.dependencies),
	};
}

export async function runTaskCreateWizard(
	options: {
		initialTitle?: string;
	} & WizardOptions,
): Promise<TaskCreateInput | null> {
	const initialValues = toInitialWizardValues({ title: options.initialTitle ?? "" });
	const values = await runTaskWizardValues({
		mode: "create",
		statuses: options.statuses,
		priorities: options.priorities,
		types: options.types,
		projects: options.projects,
		initialValues,
		promptImpl: options.promptImpl,
	});
	if (!values) {
		return null;
	}

	return buildTaskCreateInput(values);
}

function buildTaskCreateInput(values: TaskWizardValues): TaskCreateInput {
	const input: TaskCreateInput = { title: values.title };
	setCreateText(input, "description", values.description);
	setCreateText(input, "status", values.status);
	setCreateText(input, "priority", values.priority);
	setCreateText(input, "type", values.type);
	setCreateText(input, "project", values.project);
	setCreateValue(input, "dueDate", normalizeDueDate(values.dueDate, "Due date"));
	setCreateList(input, "assignee", values.assignee);
	setCreateList(input, "labels", values.labels);
	setCreateList(input, "dependencies", values.dependencies);
	setCreateList(input, "references", values.references);
	setCreateList(input, "documentation", values.documentation);
	return input;
}

function setCreateText(input: TaskCreateInput, key: string, value: string): void {
	if (value.trim().length > 0) Object.assign(input, { [key]: value });
}

function setCreateList(input: TaskCreateInput, key: string, value: string): void {
	setCreateValue(input, key, parseListInput(value));
}

function setCreateValue(input: TaskCreateInput, key: string, value: unknown): void {
	if (Array.isArray(value) ? value.length > 0 : value) Object.assign(input, { [key]: value });
}

export async function runTaskEditWizard(
	options: {
		task: Task;
	} & WizardOptions,
): Promise<TaskUpdateInput | null> {
	const initial = toInitialWizardValues(options.task);
	const values = await runTaskWizardValues({
		mode: "edit",
		statuses: options.statuses,
		priorities: options.priorities,
		types: options.types,
		projects: options.projects,
		initialValues: initial,
		promptImpl: options.promptImpl,
	});
	if (!values) {
		return null;
	}

	return buildTaskUpdateInput(initial, values);
}

function buildTaskUpdateInput(initial: TaskWizardValues, values: TaskWizardValues): TaskUpdateInput {
	const input: TaskUpdateInput = {};
	applyChangedValue(input, "title", initial.title, values.title);
	applyChangedValue(input, "description", initial.description, values.description);
	applyChangedNonBlankValue(input, "status", initial.status, values.status);
	applyChangedNonBlankValue(input, "priority", initial.priority, values.priority);
	applyChangedValue(input, "type", initial.type, values.type);
	applyChangedValue(input, "project", initial.project, values.project);
	if (values.dueDate !== initial.dueDate) input.dueDate = values.dueDate || null;
	applyChangedListValues(input, initial, values);
	return input;
}

function applyChangedValue(input: TaskUpdateInput, key: string, initial: string, next: string): void {
	if (next !== initial) Object.assign(input, { [key]: next });
}

function applyChangedNonBlankValue(input: TaskUpdateInput, key: string, initial: string, next: string): void {
	if (next !== initial && next.trim().length > 0) Object.assign(input, { [key]: next });
}

function applyChangedListValues(input: TaskUpdateInput, initial: TaskWizardValues, values: TaskWizardValues): void {
	for (const key of ["assignee", "labels", "dependencies", "references", "documentation"] as const)
		applyChangedList(initial[key], values[key], (items) => Object.assign(input, { [key]: items }));
}
