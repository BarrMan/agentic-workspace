import type { Task } from "../types/index.ts";
import { AmbiguousTaskIdError, canonicalTaskId } from "../utils/task-path.ts";
import { calculateBlockOrdinals } from "./reorder.ts";
import type { TaskIdentityResolution } from "./task-identity-index.ts";

interface OrderedTaskRow {
	task: Task;
	moved: boolean;
}

type OrderedTaskResolver = {
	resolveTaskForMutation(taskId: string): TaskIdentityResolution;
};

function validateOrderedTaskIds(orderedTaskIds: string[], tasksToMove: Task[]): void {
	const orderedKeys = new Set<string>();
	for (const id of orderedTaskIds) {
		const key = canonicalTaskId(id);
		if (orderedKeys.has(key)) throw new Error(`Duplicate task ID in orderedTaskIds: ${id}`);
		orderedKeys.add(key);
	}
	for (const task of tasksToMove) {
		if (!orderedKeys.has(canonicalTaskId(task.id))) {
			throw new Error("orderedTaskIds must include every task being moved");
		}
	}
}

function resolveOrderedTaskRows(
	resolver: OrderedTaskResolver,
	orderedTaskIds: string[],
	tasksToMove: Task[],
	failures: Array<{ taskId: string; reason: string }>,
): OrderedTaskRow[] {
	const movedByKey = new Map(tasksToMove.map((task) => [canonicalTaskId(task.id), task]));
	const failedKeys = new Set(failures.map((failure) => canonicalTaskId(failure.taskId)));
	return orderedTaskIds.flatMap<OrderedTaskRow>((id): OrderedTaskRow[] => {
		const key = canonicalTaskId(id);
		if (failedKeys.has(key)) return [];
		const movedTask = movedByKey.get(key);
		if (movedTask) return [{ task: movedTask, moved: true }];
		const resolution = resolver.resolveTaskForMutation(key);
		if (resolution.status === "ambiguous") throw new AmbiguousTaskIdError(id, resolution.candidates);
		return resolution.status === "found" ? [{ task: resolution.task, moved: false }] : [];
	});
}

function assignOrderedTaskOrdinals(
	rows: OrderedTaskRow[],
	applyMove: (task: Task) => Task,
	defaultStep: number,
): { tasksInOrder: Task[]; requiresRebalance: boolean } {
	let requiresRebalance = false;
	const tasksInOrder: Task[] = [];
	for (let index = 0; index < rows.length; ) {
		const row = rows[index];
		if (!row) break;
		if (!row.moved) {
			tasksInOrder.push(row.task);
			index += 1;
			continue;
		}
		let runEnd = index;
		while (runEnd < rows.length && rows[runEnd]?.moved) runEnd += 1;
		const block = calculateBlockOrdinals({
			previous: index > 0 ? (rows[index - 1]?.task ?? null) : null,
			next: rows[runEnd]?.task ?? null,
			count: runEnd - index,
			defaultStep,
		});
		requiresRebalance ||= block.requiresRebalance;
		tasksInOrder.push(
			...rows
				.slice(index, runEnd)
				.map((movedRow, offset) => ({ ...applyMove(movedRow.task), ordinal: block.ordinals[offset] })),
		);
		index = runEnd;
	}
	return { tasksInOrder, requiresRebalance };
}

/** Plans ordered board placement without mutating task objects. */
export function planOrderedTaskPlacement({
	resolver,
	orderedTaskIds,
	tasksToMove,
	failures,
	applyMove,
	defaultStep,
}: {
	resolver: OrderedTaskResolver;
	orderedTaskIds: string[];
	tasksToMove: Task[];
	failures: Array<{ taskId: string; reason: string }>;
	applyMove: (task: Task) => Task;
	defaultStep: number;
}): { tasksInOrder: Task[]; originalTasks: Task[]; requiresRebalance: boolean } {
	validateOrderedTaskIds(orderedTaskIds, tasksToMove);
	const rows = resolveOrderedTaskRows(resolver, orderedTaskIds, tasksToMove, failures);
	const { tasksInOrder, requiresRebalance } = assignOrderedTaskOrdinals(rows, applyMove, defaultStep);
	return { tasksInOrder, originalTasks: rows.map(({ task }) => task), requiresRebalance };
}
