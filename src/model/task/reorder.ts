import type { Task } from "../types.ts";
import { Task as TaskModel } from "./task.ts";
import { TaskOrdering } from "./task-ordering.ts";

export const DEFAULT_ORDINAL_STEP = 1000;
const EPSILON = 1e-6;

export interface CalculateNewOrdinalOptions {
	previous?: Pick<Task, "id" | "ordinal"> | null;
	next?: Pick<Task, "id" | "ordinal"> | null;
	defaultStep?: number;
}

export interface CalculateNewOrdinalResult {
	ordinal: number;
	requiresRebalance: boolean;
}

export function calculateNewOrdinal(options: CalculateNewOrdinalOptions): CalculateNewOrdinalResult {
	const { previous, next, defaultStep = DEFAULT_ORDINAL_STEP } = options;
	const prevOrdinal = previous?.ordinal;
	const nextOrdinal = next?.ordinal;

	if (prevOrdinal === undefined && nextOrdinal === undefined) {
		return { ordinal: defaultStep, requiresRebalance: false };
	}

	if (prevOrdinal === undefined) {
		if (nextOrdinal === undefined) {
			return { ordinal: defaultStep, requiresRebalance: false };
		}
		const candidate = nextOrdinal / 2;
		const requiresRebalance = !Number.isFinite(candidate) || candidate <= 0 || candidate >= nextOrdinal - EPSILON;
		return { ordinal: candidate, requiresRebalance };
	}

	if (nextOrdinal === undefined) {
		const candidate = prevOrdinal + defaultStep;
		const requiresRebalance = !Number.isFinite(candidate);
		return { ordinal: candidate, requiresRebalance };
	}

	const gap = nextOrdinal - prevOrdinal;
	if (gap <= EPSILON) {
		return { ordinal: prevOrdinal + defaultStep, requiresRebalance: true };
	}

	const candidate = prevOrdinal + gap / 2;
	const requiresRebalance = candidate <= prevOrdinal + EPSILON || candidate >= nextOrdinal - EPSILON;
	return { ordinal: candidate, requiresRebalance };
}

export interface CalculateBlockOrdinalsOptions {
	previous?: Pick<Task, "id" | "ordinal"> | null;
	next?: Pick<Task, "id" | "ordinal"> | null;
	count: number;
	defaultStep?: number;
}

export interface CalculateBlockOrdinalsResult {
	ordinals: number[];
	requiresRebalance: boolean;
}

/**
 * Ordinals for a contiguous block of tasks landing between two neighbors. Generalizes
 * {@link calculateNewOrdinal}: a count of 1 yields the same midpoint/step placement, and a gap too
 * tight for the block reports `requiresRebalance` so the caller can renumber the column instead.
 */
export function calculateBlockOrdinals(options: CalculateBlockOrdinalsOptions): CalculateBlockOrdinalsResult {
	const { previous, next, count, defaultStep = DEFAULT_ORDINAL_STEP } = options;
	const prevOrdinal = previous?.ordinal;
	const nextOrdinal = next?.ordinal;
	const positions = Array.from({ length: count }, (_, index) => index + 1);

	if (nextOrdinal === undefined) {
		const base = prevOrdinal ?? 0;
		const ordinals = positions.map((position) => base + defaultStep * position);
		return { ordinals, requiresRebalance: !ordinals.every(Number.isFinite) };
	}

	const base = prevOrdinal ?? 0;
	const gap = nextOrdinal - base;
	if (gap <= EPSILON) {
		return { ordinals: positions.map((position) => base + defaultStep * position), requiresRebalance: true };
	}

	const stepSize = gap / (count + 1);
	const ordinals = positions.map((position) => base + stepSize * position);
	const requiresRebalance = ordinals.some(
		(ordinal) =>
			!Number.isFinite(ordinal) ||
			ordinal <= base + EPSILON ||
			ordinal >= nextOrdinal - EPSILON ||
			(prevOrdinal === undefined && ordinal <= 0),
	);
	return { ordinals, requiresRebalance };
}

export interface ResolveOrdinalConflictsOptions {
	defaultStep?: number;
	startOrdinal?: number;
	forceSequential?: boolean;
}

export function resolveOrdinalConflicts<T extends { id: string; ordinal?: number }>(
	tasks: T[],
	options: ResolveOrdinalConflictsOptions = {},
): T[] {
	const defaultStep = options.defaultStep ?? DEFAULT_ORDINAL_STEP;
	const startOrdinal = options.startOrdinal ?? defaultStep;
	const forceSequential = options.forceSequential ?? false;

	const updates: T[] = [];
	let lastOrdinal: number | undefined;

	for (let index = 0; index < tasks.length; index += 1) {
		const task = tasks[index];
		if (!task) continue;
		const nextOrdinal = index === 0 ? startOrdinal : (lastOrdinal ?? startOrdinal) + defaultStep;
		const assigned =
			forceSequential || task.ordinal === undefined || (lastOrdinal !== undefined && task.ordinal <= lastOrdinal)
				? nextOrdinal
				: task.ordinal;

		if (assigned !== task.ordinal) {
			updates.push({
				...task,
				ordinal: assigned,
			});
		}

		lastOrdinal = assigned;
	}

	return updates;
}

export function reconcileBoardPlacement(
	tasksInOrder: Task[],
	originalTasks: Task[],
	defaultStep: number,
	forceSequential = false,
): { tasks: Task[]; changedTasks: Task[] } {
	const ordinalUpdates = resolveOrdinalConflicts(tasksInOrder, {
		defaultStep,
		startOrdinal: defaultStep,
		forceSequential,
	});
	const updates = new Map(ordinalUpdates.map((task) => [task.id, task]));
	const tasks = tasksInOrder.map((task) => updates.get(task.id) ?? task);
	const originals = new Map(originalTasks.map((task) => [task.id, task]));
	return {
		tasks,
		changedTasks: tasks.filter((task) => {
			const original = originals.get(task.id);
			return (
				!original ||
				(original.status ?? "") !== (task.status ?? "") ||
				(original.ordinal ?? null) !== (task.ordinal ?? null) ||
				(original.milestone ?? "") !== (task.milestone ?? "")
			);
		}),
	};
}

export function planTaskReorder({
	taskId,
	targetStatus,
	orderedTaskIds,
	validTasks,
	targetMilestone,
	hasTargetMilestone,
	defaultStep,
}: {
	taskId: string;
	targetStatus: string;
	orderedTaskIds: string[];
	validTasks: Task[];
	targetMilestone: string | undefined;
	hasTargetMilestone: boolean;
	defaultStep: number;
}): { updatedTask: Task; changedTasks: Task[] } {
	const movedTask = validTasks.find((task) => task.id === taskId);
	if (!movedTask) throw new Error(`Task ${taskId} not found while reordering`);
	const orderedTasks = orderedTaskIds
		.map((id) => validTasks.find((task) => task.id === id))
		.filter((task): task is Task => task !== undefined);
	const movedIndex = orderedTasks.findIndex((task) => task.id === taskId);
	if (movedIndex < 0) throw new Error("Implementation error: Task found in validTasks but index missing");
	const { ordinal, requiresRebalance } = calculateNewOrdinal({
		previous: movedIndex > 0 ? (orderedTasks[movedIndex - 1] ?? null) : null,
		next: movedIndex < orderedTasks.length - 1 ? (orderedTasks[movedIndex + 1] ?? null) : null,
		defaultStep,
	});
	const movedModel = new TaskModel(movedTask);
	movedModel.applyBoardPlacement({
		status: targetStatus,
		ordinal,
		milestone: hasTargetMilestone ? targetMilestone : movedTask.milestone,
	});
	const updatedMoved = structuredClone(movedModel.task);
	const tasksInOrder = orderedTasks.map((task) => (task.id === taskId ? updatedMoved : task));
	const { tasks, changedTasks } = reconcileBoardPlacement(tasksInOrder, validTasks, defaultStep, requiresRebalance);
	return { updatedTask: tasks.find((task) => task.id === taskId) ?? updatedMoved, changedTasks };
}

export interface OrderedTaskPlacementRow {
	task: Task;
	moved: boolean;
}

export interface BoardPlacementOptions {
	targetStatus: string;
	targetMilestone: string | undefined;
	hasTargetMilestone: boolean;
	defaultStep: number;
}

function applyBoardMove(
	task: Task,
	{ targetStatus, targetMilestone, hasTargetMilestone }: BoardPlacementOptions,
): Task {
	const model = new TaskModel(task);
	model.applyBoardPlacement({
		status: targetStatus,
		ordinal: task.ordinal,
		milestone: hasTargetMilestone ? targetMilestone : task.milestone,
	});
	return structuredClone(model.task);
}

export function planOrderedTaskPlacement(
	rows: OrderedTaskPlacementRow[],
	tasksToMove: Task[],
	options: BoardPlacementOptions,
): { movedTasks: Task[]; changedTasks: Task[] } {
	const movedIds = new Set(rows.filter(({ moved }) => moved).map(({ task }) => task.id));
	if (tasksToMove.some((task) => !movedIds.has(task.id))) {
		throw new Error("orderedTaskIds must include every task being moved");
	}
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
			defaultStep: options.defaultStep,
		});
		requiresRebalance ||= block.requiresRebalance;
		for (const [offset, { task }] of rows.slice(index, runEnd).entries()) {
			const moved = applyBoardMove(task, options);
			const model = new TaskModel(moved);
			model.applyBoardPlacement({
				status: moved.status,
				ordinal: block.ordinals[offset],
				milestone: moved.milestone,
			});
			tasksInOrder.push(structuredClone(model.task));
		}
		index = runEnd;
	}
	const originals = new Map(rows.map(({ task }) => [task.id, task]));
	for (const task of tasksToMove) originals.set(task.id, task);
	const placement = reconcileBoardPlacement(
		tasksInOrder,
		[...originals.values()],
		options.defaultStep,
		requiresRebalance,
	);
	return {
		movedTasks: tasksToMove.map(
			(task) => placement.tasks.find((placed) => placed.id === task.id) ?? applyBoardMove(task, options),
		),
		changedTasks: placement.changedTasks,
	};
}

export function planAppendedTaskPlacement(
	targetColumnTasks: Task[],
	tasksToMove: Task[],
	options: BoardPlacementOptions,
): { movedTasks: Task[]; changedTasks: Task[] } {
	const { targetStatus, targetMilestone, hasTargetMilestone, defaultStep } = options;
	const stayingIds = new Set(tasksToMove.filter((task) => task.status === targetStatus).map((task) => task.id));
	const arriving = tasksToMove.filter((task) => !stayingIds.has(task.id));
	if (arriving.length === 0) {
		const movedTasks = tasksToMove.map((task) => applyBoardMove(task, options));
		return {
			movedTasks,
			changedTasks: movedTasks.filter((task, index) => {
				const original = tasksToMove[index];
				return !original || original.status !== task.status || (original.milestone ?? "") !== (task.milestone ?? "");
			}),
		};
	}

	const movedIds = new Set(tasksToMove.map((task) => task.id));
	const inTargetLane = (task: Task): boolean =>
		!hasTargetMilestone || (task.milestone ?? "") === (targetMilestone ?? "");
	const columnTasks = TaskOrdering.byOrdinal(
		targetColumnTasks
			.filter((task) => stayingIds.has(task.id) || (!movedIds.has(task.id) && inTargetLane(task)))
			.map((task) => {
				if (task.ordinal === undefined || Number.isFinite(task.ordinal)) return task;
				const model = new TaskModel(task);
				model.applyBoardPlacement({ status: task.status, ordinal: undefined, milestone: task.milestone });
				return structuredClone(model.task);
			}),
	);
	const tasksInOrder = [
		...columnTasks.map((task) => (stayingIds.has(task.id) ? applyBoardMove(task, options) : task)),
		...arriving.map((task) => {
			const moved = applyBoardMove(task, options);
			const model = new TaskModel(moved);
			model.applyBoardPlacement({ status: targetStatus, ordinal: undefined, milestone: moved.milestone });
			return structuredClone(model.task);
		}),
	];
	const originals = new Map(targetColumnTasks.map((task) => [task.id, task]));
	for (const task of tasksToMove) originals.set(task.id, task);
	const placement = reconcileBoardPlacement(tasksInOrder, [...originals.values()], defaultStep);
	return {
		movedTasks: tasksToMove.map(
			(task) => placement.tasks.find((placed) => placed.id === task.id) ?? applyBoardMove(task, options),
		),
		changedTasks: placement.changedTasks,
	};
}
