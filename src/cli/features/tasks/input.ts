import type { Core } from "../../../controller/agentic-workspace.ts";
import { loadTaskDetail } from "../../../controller/task-detail.ts";
import { parseClearableStringList, parseDelimitedStringList, toStringArray } from "../../../lib/string-list.ts";
import { formatTaskPlainText } from "../../../renderer/formatters/task-plain-text.ts";
import { validateTaskListFlags } from "./edit-list-options.ts";

type CreateInput = Parameters<Core["createTaskFromInput"]>[0];
type CreateOptions = Record<string, unknown>;

export function buildTaskCreateInput(
	title: string,
	options: CreateOptions,
	resolveMilestone: (value: string) => Promise<string>,
): Promise<CreateInput | null> {
	let ordinal: number | undefined;
	if (options.ordinal !== undefined) {
		const parsed = Number(options.ordinal);
		if (!Number.isFinite(parsed) || parsed < 0) {
			console.error(`Invalid ordinal: ${options.ordinal}. Must be a non-negative number.`);
			process.exitCode = 1;
			return Promise.resolve(null);
		}
		ordinal = parsed;
	}

	const listFlagError = validateTaskListFlags(options, { supportsClearFlags: false });
	if (listFlagError) {
		console.error(listFlagError);
		process.exitCode = 1;
		return Promise.resolve(null);
	}
	return Promise.resolve(typeof options.milestone === "string" ? resolveMilestone(options.milestone) : undefined).then(
		(milestone) => ({
			title,
			description: options.description || options.desc ? String(options.description || options.desc) : undefined,
			status: options.status ? String(options.status) : undefined,
			dueDate: typeof options.dueDate === "string" ? options.dueDate : undefined,
			assignee: parseClearableStringList(options.assignee),
			labels: parseDelimitedStringList(options.labels),
			dependencies: parseDelimitedStringList([...toStringArray(options.dependsOn), ...toStringArray(options.dep)]),
			references: parseDelimitedStringList(options.ref),
			documentation: parseDelimitedStringList(options.doc),
			modifiedFiles: parseDelimitedStringList(options.modifiedFile),
			parentTaskId: options.parent ? String(options.parent) : undefined,
			priority: options.priority ? String(options.priority) : undefined,
			type: options.type !== undefined ? String(options.type) : undefined,
			project: options.project !== undefined ? String(options.project) : undefined,
			...(ordinal === undefined ? {} : { ordinal }),
			milestone,
		}),
	);
}

export async function createAndReportTask(
	core: Core,
	input: CreateInput,
	options: { plain?: boolean; filePathOptional?: boolean },
): Promise<void> {
	try {
		const { task, filePath } = await core.createTaskFromInput(input);
		if (options.plain) {
			console.log(formatTaskPlainText(await loadTaskDetail(core, task), { filePathOverride: filePath }));
			return;
		}
		console.log(`Created task ${task.id}`);
		if (!options.filePathOptional || filePath) console.log(`File: ${filePath}`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	}
}
