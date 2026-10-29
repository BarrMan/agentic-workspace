import { loadTaskListItems } from "../../../controller/task-detail.ts";
import type { Core } from "../../../index.ts";
import { TaskOrdering } from "../../../model/task/task-ordering.ts";
import type { Task } from "../../../model/types.ts";
import type { TaskListRequest } from "./list-parse.ts";

export async function queryTaskList(core: Core, request: TaskListRequest, includeReadiness: boolean) {
	const tasks = await core.tasks.query({});
	const config = await core.storage.loadConfig();
	const narrow = <T extends Task>(rows: T[]): T[] => {
		const sorted = TaskOrdering.sort(rows, "newest", config?.priorities);
		return request.limit === undefined ? sorted : sorted.slice(0, request.limit);
	};
	const readinessRows = includeReadiness && tasks.length > 0 ? await loadTaskListItems(core, tasks) : [];
	return {
		config,
		rows: narrow(tasks),
		jsonRows: includeReadiness ? narrow(readinessRows) : [],
	};
}
