import { isAbsolute } from "node:path";
import * as clack from "@clack/prompts";
import type { Command, OptionValues } from "commander";
import { DRAFT_STATUS } from "../../../constants/index.ts";
import { loadTaskDetail } from "../../../core/task-detail.ts";
import { formatTaskPlainText } from "../../../formatters/task-plain-text.ts";
import type { Core } from "../../../index.ts";
import type { Task, TaskUpdateInput } from "../../../types/index.ts";
import { AmbiguousIdError } from "../../../utils/entity-id.ts";
import { DRAFT_PREFIX, normalizeId } from "../../../utils/prefix-config.ts";
import { getValidStatuses } from "../../../utils/status.ts";
import { canonicalTaskId, LOCAL_TASK_LOOKUP_HINT } from "../../../utils/task-path.ts";
import { addEditFieldOptions, hasEditFieldFlags } from "../task/edit-fields.ts";
import { parseTaskEditOptions } from "./edit-options.ts";
import { pickTaskForEditWizard, runTaskEditWizard } from "./wizard.ts";

type EditCommandTarget = {
	label: string;
	pluralLabel: string;
	statuses: (core: Core) => Promise<string[]>;
	resolve: (core: Core, idOrSelectedPath: string) => Promise<Task | null>;
	listCandidates: (core: Core) => Promise<Task[]>;
	selectionValue: (candidate: Task) => string;
	update: (core: Core, existing: Task, input: TaskUpdateInput) => Promise<Task>;
	notFoundMessage: (id: string) => string;
};

export type EditRuntime = {
	createCore: () => Promise<Core>;
	hasInteractiveTTY: boolean;
	isPlainRequested: (options: { plain?: boolean }) => boolean;
	printMissingRequiredArgument: (argumentName: string) => void;
	formatError: (error: unknown, taskId: string, commandKind?: string) => string;
	resolveMilestone: (core: Core, value: string) => Promise<string>;
};

const PER_TASK_ONLY_EDIT_FLAGS: ReadonlyArray<{ option: string; flag: string }> = [
	{ option: "title", flag: "--title" },
	{ option: "description", flag: "--description" },
	{ option: "desc", flag: "--desc" },
	{ option: "ordinal", flag: "--ordinal" },
	{ option: "modifiedFile", flag: "--modified-file" },
];

function findPerTaskOnlyFlag(options: Record<string, unknown>): string | null {
	for (const { option, flag } of PER_TASK_ONLY_EDIT_FLAGS) {
		if (options[option] !== undefined)
			return `Cannot use ${flag} with more than one task ID. ${flag} applies to one task only. Run agenticworkspace task edit once per task.`;
	}
	return null;
}

const taskEditTarget: EditCommandTarget = {
	label: "Task",
	pluralLabel: "tasks",
	statuses: (core) => getValidStatuses(core),
	resolve: (core, id) => core.loadTaskById(id, { includeCrossBranch: false }),
	listCandidates: (core) => core.queryTasks({ includeCrossBranch: false }),
	selectionValue: (candidate) => candidate.id,
	update: (core, existing, input) => core.editTask(existing.id, input, { includeCrossBranch: false }),
	notFoundMessage: (id) => `Task ${id} not found. ${LOCAL_TASK_LOOKUP_HINT}`,
};

const draftEditTarget: EditCommandTarget = {
	label: DRAFT_STATUS,
	pluralLabel: "drafts",
	statuses: async () => [DRAFT_STATUS],
	async resolve(core, idOrSelectedPath) {
		if (isAbsolute(idOrSelectedPath)) {
			const direct = await core.filesystem.draftReferenceFromPath(idOrSelectedPath);
			const resolved = await core.filesystem.resolveDraftReference(direct.canonicalId);
			if (!resolved || resolved.filePath !== idOrSelectedPath)
				throw new AmbiguousIdError(
					"Draft",
					normalizeId(direct.canonicalId, DRAFT_PREFIX),
					[idOrSelectedPath],
					"Rename one file to a distinct numeric id, then make its frontmatter agree.",
				);
			return { ...resolved.task, id: resolved.canonicalId, filePath: resolved.filePath };
		}
		const reference = await core.filesystem.resolveDraftReference(idOrSelectedPath);
		return reference ? { ...reference.task, id: reference.canonicalId, filePath: reference.filePath } : null;
	},
	listCandidates: (core) => core.filesystem.listHealthyDrafts(),
	selectionValue: (candidate) => candidate.filePath ?? candidate.id,
	update: (core, existing, input) => {
		if (!existing.filePath) throw new Error(`Cannot update draft ${existing.id} without its file path.`);
		return core.updateDraftFromInput({ filePath: existing.filePath, canonicalId: existing.id }, input);
	},
	notFoundMessage: (id) => `Draft ${id} not found.`,
};

function normalizeEditRequestIds(requestedIds: string[] | undefined): string[] {
	const taskIds: string[] = [];
	for (const value of requestedIds ?? []) {
		const trimmed = String(value).trim();
		if (!trimmed || taskIds.some((seen) => canonicalTaskId(seen) === canonicalTaskId(trimmed))) continue;
		taskIds.push(trimmed);
	}
	return taskIds;
}

async function runEditWizard(
	target: EditCommandTarget,
	core: Core,
	requestedId: string | undefined,
	runtime: EditRuntime,
): Promise<void> {
	let selectedTaskId = requestedId?.trim() || undefined;
	if (!selectedTaskId) {
		const candidates = await target.listCandidates(core);
		const taskOptions = candidates.map((candidate) => ({
			id: candidate.id,
			title: candidate.title,
			value: target.selectionValue(candidate),
		}));
		if (taskOptions.length === 0) return void console.log(`No ${target.pluralLabel} found.`);
		selectedTaskId = await pickTaskForEditWizard({ tasks: taskOptions });
		if (!selectedTaskId) return void clack.cancel(`${target.label} edit cancelled.`);
	}
	const existingTask = await target.resolve(core, selectedTaskId);
	if (!existingTask) {
		console.error(target.notFoundMessage(selectedTaskId));
		process.exitCode = 1;
		return;
	}
	const config = await core.filesystem.loadConfig();
	const wizardInput = await runTaskEditWizard({
		task: existingTask,
		statuses: await target.statuses(core),
		priorities: config?.priorities,
		types: config?.types,
		projects: config?.projects,
	});
	if (!wizardInput) return void clack.cancel(`${target.label} edit cancelled.`);
	try {
		console.log(`Updated ${target.label.toLowerCase()} ${(await target.update(core, existingTask, wizardInput)).id}`);
	} catch (error) {
		console.error(runtime.formatError(error, existingTask.id, target.label.toLowerCase()));
		process.exitCode = 1;
	}
}

async function resolveEditTasks(target: EditCommandTarget, core: Core, taskIds: string[], runtime: EditRuntime) {
	const resolvedTasks: Task[] = [];
	const editFailures: Array<{ taskId: string; message: string }> = [];
	for (const requestedId of taskIds)
		try {
			const loaded = await target.resolve(core, requestedId);
			if (loaded && resolvedTasks.some((seen) => seen.id === loaded.id)) continue;
			if (loaded) resolvedTasks.push(loaded);
			else editFailures.push({ taskId: requestedId, message: target.notFoundMessage(requestedId) });
		} catch (error) {
			editFailures.push({
				taskId: requestedId,
				message: runtime.formatError(error, requestedId, target.label.toLowerCase()),
			});
		}
	return { resolvedTasks, editFailures };
}

function validateBatchEdit(target: EditCommandTarget, taskIds: string[], options: OptionValues): boolean {
	if (!hasEditFieldFlags({ ...options, plain: undefined })) {
		console.error(
			`Cannot edit ${taskIds.length} ${target.pluralLabel} without any field flag. Pass the change to apply to every ${target.label.toLowerCase()}, for example --status "In Progress", or edit one ${target.label.toLowerCase()} at a time to use the interactive editor.`,
		);
		process.exitCode = 1;
		return false;
	}
	const error = findPerTaskOnlyFlag(options);
	if (!error) return true;
	console.error(error);
	process.exitCode = 1;
	return false;
}

async function runEdits(
	target: EditCommandTarget,
	requestedIds: string[] | undefined,
	options: OptionValues,
	runtime: EditRuntime,
): Promise<void> {
	const taskIds = normalizeEditRequestIds(requestedIds);
	const taskId = taskIds[0];
	const shouldUseWizard = runtime.hasInteractiveTTY && !hasEditFieldFlags(options);
	if (!shouldUseWizard && !taskId) return runtime.printMissingRequiredArgument("taskId");
	if (taskIds.length > 1 && !validateBatchEdit(target, taskIds, options)) return;
	const core = await runtime.createCore();
	if (shouldUseWizard) return runEditWizard(target, core, taskId, runtime);
	const { resolvedTasks, editFailures } = await resolveEditTasks(target, core, taskIds, runtime);
	const existingTask = resolvedTasks[0];
	if (!existingTask) {
		for (const failure of editFailures) console.error(failure.message);
		process.exitCode = 1;
		return;
	}
	const parsed = await parseTaskEditOptions(options, {
		core,
		statuses: () => target.statuses(core),
		resolveMilestone: (value) => runtime.resolveMilestone(core, value),
	});
	if ("error" in parsed) {
		console.error(
			parsed.formatForTask
				? runtime.formatError(parsed.error, existingTask.id, target.label.toLowerCase())
				: parsed.error,
		);
		process.exitCode = 1;
		return;
	}
	if (taskIds.length === 1) {
		try {
			const updated = await target.update(core, existingTask, parsed.input);
			if (runtime.isPlainRequested(options)) console.log(formatTaskPlainText(await loadTaskDetail(core, updated)));
			else console.log(`Updated ${target.label.toLowerCase()} ${updated.id}`);
		} catch (error) {
			console.error(runtime.formatError(error, existingTask.id, target.label.toLowerCase()));
			process.exitCode = 1;
		}
		return;
	}
	for (const task of resolvedTasks)
		try {
			console.log(`Updated ${target.label.toLowerCase()} ${(await target.update(core, task, parsed.input)).id}`);
		} catch (error) {
			editFailures.push({ taskId: task.id, message: runtime.formatError(error, task.id, target.label.toLowerCase()) });
		}
	for (const failure of editFailures) console.error(`Failed to update ${failure.taskId}: ${failure.message}`);
	if (editFailures.length > 0) process.exitCode = 1;
}

export function addTaskEditOptions(command: Command): Command {
	return addEditFieldOptions(command);
}
export function runTaskEdit(
	requestedIds: string[] | undefined,
	options: OptionValues,
	runtime: EditRuntime,
): Promise<void> {
	return runEdits(taskEditTarget, requestedIds, options, runtime);
}
export function runDraftEdit(
	requestedIds: string[] | undefined,
	options: OptionValues,
	runtime: EditRuntime,
): Promise<void> {
	return runEdits(draftEditTarget, requestedIds, options, runtime);
}
