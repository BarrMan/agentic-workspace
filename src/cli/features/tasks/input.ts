import type { Core } from "../../../controller/agentic-workspace.ts";
import { loadTaskDetail } from "../../../controller/task-detail.ts";
import { normalizeStringList, toStringArray } from "../../../lib/string-list.ts";
import { formatTaskPlainText } from "../../../renderer/formatters/task-plain-text.ts";
import { validateTaskListFlags } from "./edit-list-options.ts";

type CreateInput = Parameters<Core["tasks"]["create"]>[0];
type CreateOptions = Record<string, unknown>;

export function buildTaskCreateInput(title: string, options: CreateOptions): CreateInput | null {
	const listFlagError = validateTaskListFlags(options);
	if (listFlagError) {
		console.error(listFlagError);
		process.exitCode = 1;
		return null;
	}
	return {
		title,
		description: options.description ? String(options.description) : undefined,
		labels: normalizeStringList(toStringArray(options.label)),
		dependencies: normalizeStringList([...toStringArray(options.dependsOn), ...toStringArray(options.dep)]),
		references: normalizeStringList(toStringArray(options.ref)),
		documentation: normalizeStringList(toStringArray(options.doc)),
		modifiedFiles: normalizeStringList(toStringArray(options.modifiedFile)),
		priority: options.priority ? String(options.priority) : undefined,
	};
}

export async function createAndReportTask(
	core: Core,
	input: CreateInput,
	options: { plain?: boolean; filePathOptional?: boolean },
): Promise<void> {
	try {
		const { task, filePath } = await core.tasks.create(input);
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
