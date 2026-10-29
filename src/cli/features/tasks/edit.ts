import type { OptionValues } from "commander";
import { loadTaskDetail } from "../../../controller/task-detail.ts";
import type { Core } from "../../../index.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../../../model/task/task-path.ts";
import { formatTaskPlainText } from "../../../renderer/formatters/task-plain-text.ts";

export type EditRuntime = {
	createCore: () => Promise<Core>;
	isPlainRequested: (options: { plain?: boolean }) => boolean;
	formatError: (error: unknown, taskId: string, commandKind?: string) => string;
};

export async function runTaskEdit(taskId: string, options: OptionValues, runtime: EditRuntime): Promise<void> {
	const core = await runtime.createCore();
	try {
		const updated = await core.storage.withTaskLock(taskId, async (current) => {
			const task = { ...current };
			if (options.title !== undefined) task.title = options.title;
			if (options.description !== undefined) task.description = options.description;
			return await core.tasks.edit(task);
		});
		if (runtime.isPlainRequested(options)) console.log(formatTaskPlainText(await loadTaskDetail(core, updated)));
		else console.log(`Updated task ${updated.id}`);
	} catch (error) {
		if (error instanceof Error && error.message === `Task not found: ${taskId}`) {
			console.error(`Task ${taskId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		} else {
			console.error(runtime.formatError(error, taskId, "task"));
		}
		process.exitCode = 1;
	}
}
