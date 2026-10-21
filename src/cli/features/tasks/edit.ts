import type { OptionValues } from "commander";
import { loadTaskDetail } from "../../../controller/task-detail.ts";
import type { Core } from "../../../index.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../../../model/task/task-path.ts";
import type { TaskUpdateInput } from "../../../model/types.ts";
import { formatTaskPlainText } from "../../../renderer/formatters/task-plain-text.ts";

export type EditRuntime = {
	createCore: () => Promise<Core>;
	isPlainRequested: (options: { plain?: boolean }) => boolean;
	formatError: (error: unknown, taskId: string, commandKind?: string) => string;
};

export function runTaskEdit(taskId: string, options: OptionValues, runtime: EditRuntime): Promise<void> {
	return runTaskEditOne(taskId, options, runtime);
}

async function runTaskEditOne(taskId: string, options: OptionValues, runtime: EditRuntime): Promise<void> {
	if (options.title === undefined && options.description === undefined) {
		console.error("Specify --title or --description to edit a task.");
		process.exitCode = 1;
		return;
	}
	const core = await runtime.createCore();
	const existingTask = await core.loadTaskById(taskId.toUpperCase());
	if (!existingTask) {
		console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		process.exitCode = 1;
		return;
	}
	const input: TaskUpdateInput = {};
	if (options.title) input.title = String(options.title);
	if (options.description !== undefined) input.description = String(options.description);
	try {
		const updated = await core.editTask(existingTask.id, input, {});
		if (runtime.isPlainRequested(options)) console.log(formatTaskPlainText(await loadTaskDetail(core, updated)));
		else console.log(`Updated task ${updated.id}`);
	} catch (error) {
		console.error(runtime.formatError(error, existingTask.id, "task"));
		process.exitCode = 1;
	}
}
