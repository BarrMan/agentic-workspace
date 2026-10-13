import { loadTaskListItems } from "../../../core/task-detail.ts";
import type { Core } from "../../../index.ts";
import type { Task } from "../../../types/index.ts";
import {
	AmbiguousTaskIdError,
	isAmbiguousTaskIdError,
	LOCAL_TASK_LOOKUP_HINT,
	taskIdsEqual,
} from "../../../utils/task-path.ts";
import { sortTasks } from "../../../utils/task-sorting.ts";
import type { TaskListRequest } from "./list-parse.ts";

export async function resolveTaskListParent(core: Core, parentId: string, parentDisplayId: string): Promise<string> {
	try {
		const parent = await core.loadTaskById(parentId, { includeCrossBranch: false });
		if (!parent) throw new Error(`Parent task ${parentDisplayId} not found. ${LOCAL_TASK_LOOKUP_HINT}`);
		return parent.id;
	} catch (error) {
		if (isAmbiguousTaskIdError(error)) throw new AmbiguousTaskIdError(parentDisplayId, error.candidates);
		throw error;
	}
}

export async function queryTaskList(core: Core, request: TaskListRequest, includeReadiness: boolean) {
	const parentId = request.parentId
		? await resolveTaskListParent(core, request.parentId, request.parentDisplayId ?? request.parentId)
		: undefined;
	const tasks = await core.queryTasks({
		query: request.searchQuery || undefined,
		filters: Object.keys(request.filters).length > 0 ? { ...request.filters, parentTaskId: parentId } : undefined,
		includeCrossBranch: false,
	});
	const config = await core.filesystem.loadConfig();
	const narrow = <T extends Task>(rows: T[]): T[] => {
		const sorted = sortTasks(rows, request.sortField, config?.priorities);
		const children = parentId
			? sorted.filter((task) => task.parentTaskId && taskIdsEqual(parentId, task.parentTaskId))
			: sorted;
		return request.limit === undefined ? children : children.slice(0, request.limit);
	};
	const readinessRows = includeReadiness && tasks.length > 0 ? await loadTaskListItems(core, tasks) : [];
	return {
		config,
		parentId,
		rows: narrow(request.ready ? readinessRows.filter((row) => row.isReady) : tasks),
		jsonRows: includeReadiness
			? narrow(request.ready ? readinessRows.filter((row) => row.isReady) : readinessRows)
			: [],
	};
}
