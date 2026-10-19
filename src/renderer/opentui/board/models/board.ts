import type { Task } from "../../../../model/types.ts";
import type { BoardSharedFilters } from "../configuration.ts";
import { moveTargetToAdjacentColumn } from "../interaction.ts";
import {
	type BoardMoveOperation,
	getMoveInsertionBase,
	getMoveSetIds,
	getPreviewMovingIds,
	mapMoveInsertionIndex,
	projectBoardMove,
} from "../policies/move-policy.ts";
import { Filter } from "./filter.ts";
import { Lane } from "./lane.ts";

export type BoardMoveCommit = {
	taskIds: string[];
	targetStatus: string;
	orderedTaskIds: string[];
	kind: "move" | "reorder";
};

/** Pure owner of board data, selection and move/recruit transitions. */
export class Board {
	private tasks: Task[];
	private statuses: string[];
	private selectedStatus: string | null = null;
	private selectedTaskId: string | null = null;
	private hideEmpty: boolean;
	private moveOperation: BoardMoveOperation | null = null;
	private writePending = false;
	readonly filter: Filter;

	constructor(options: {
		tasks: readonly Task[];
		statuses: readonly string[];
		filters?: Partial<BoardSharedFilters>;
		taskTypes?: string[];
		projects?: string[];
		resolveMilestoneLabel?: (milestone: string) => string;
		hideEmptyColumns?: boolean;
	}) {
		this.tasks = [...options.tasks];
		this.statuses = [...options.statuses];
		this.hideEmpty = options.hideEmptyColumns ?? false;
		this.filter = new Filter(options.filters, options);
		this.restoreSelection();
	}

	/** A defensive snapshot for renderers; Board retains the only mutable move state. */
	get move(): BoardMoveOperation | null {
		const operation = this.moveOperation;
		return operation ? { ...operation, selectedIds: [...operation.selectedIds] } : null;
	}

	/** A pending persistence action freezes move interactions until its result is reconciled. */
	get isWritePending(): boolean {
		return this.writePending;
	}

	get hideEmptyColumns(): boolean {
		return this.hideEmpty;
	}

	get tasksSnapshot(): Task[] {
		return [...this.tasks];
	}

	get statusesSnapshot(): string[] {
		return [...this.statuses];
	}

	get lanes(): Lane[] {
		const projected = projectBoardMove(this.filter.apply(this.tasks), this.statuses, this.moveOperation);
		const visible =
			this.hideEmpty && !this.moveOperation ? projected.filter((lane) => lane.tasks.length > 0) : projected;
		const data = visible.length > 0 ? visible : projected;
		return data.map(
			(lane) => new Lane(lane.status, lane.tasks, lane.status === this.selectedStatus ? this.selectedTaskId : null),
		);
	}

	get selectedLane(): Lane | undefined {
		return this.lanes.find((lane) => lane.status === this.selectedStatus);
	}

	get selectedTask(): Task | undefined {
		return this.selectedLane?.selected;
	}

	select(status: string, taskId: string | null = null): boolean {
		const lane = this.lanes.find((candidate) => candidate.status === status);
		if (!lane || (taskId !== null && !lane.tasks.some((task) => task.id === taskId))) return false;
		this.selectedStatus = status;
		this.selectedTaskId = taskId ?? lane.selected?.id ?? null;
		return true;
	}

	update(tasks: readonly Task[], statuses: readonly string[] = this.statuses): void {
		this.tasks = [...tasks];
		this.statuses = [...statuses];
		const movingTaskId = this.moveOperation?.taskId;
		if (movingTaskId && !this.tasks.some((task) => task.id === movingTaskId)) {
			this.moveOperation = null;
		}
		this.restoreSelection();
	}

	/** Merge persisted task snapshots into the latest unfiltered corpus, preserving its order. */
	upsert(tasks: readonly Task[]): void {
		const changed = new Map(tasks.map((task) => [task.id, task]));
		const known = new Set(this.tasks.map((task) => task.id));
		this.tasks = [
			...this.tasks.map((task) => changed.get(task.id) ?? task),
			...tasks.filter((task) => !known.has(task.id)),
		];
		this.restoreSelection();
	}

	beginWrite(): (() => void) | null {
		if (this.writePending) return null;
		this.writePending = true;
		return () => {
			this.writePending = false;
		};
	}

	setHideEmptyColumns(value: boolean): void {
		this.hideEmpty = value;
		this.restoreSelection();
	}

	setFilters(filters: Partial<BoardSharedFilters>): void {
		this.filter.update(filters);
		this.restoreSelection();
	}

	beginMove(): "entered" | "blocked" | "branched" | "active" | "empty" {
		if (this.writePending || this.filter.blocksMoves()) return "blocked";
		if (this.moveOperation) return "active";
		const lane = this.selectedLane;
		const task = lane?.selected;
		if (!lane || !task) return "empty";
		if (task.branch) return "branched";
		this.moveOperation = {
			taskId: task.id,
			originalStatus: lane.status,
			originalIndex: lane.selectedIndex,
			targetStatus: lane.status,
			targetIndex: lane.selectedIndex,
			selectedIds: [],
			highlightTaskId: null,
		};
		return "entered";
	}

	cancelMove(): boolean {
		if (!this.moveOperation) return false;
		this.moveOperation = null;
		return true;
	}

	moveToAdjacentLane(direction: "previous" | "next"): boolean {
		const operation = this.moveOperation;
		if (!operation || this.writePending) return false;
		if (this.collapseHighlight()) return true;
		const target = moveTargetToAdjacentColumn(
			this.statuses,
			operation.targetStatus,
			operation.targetIndex,
			direction,
			(status) => this.lanes.find((lane) => lane.status === status)?.tasks.length ?? 0,
		);
		if (!target) return false;
		operation.targetStatus = target.status;
		operation.targetIndex = target.index;
		return true;
	}

	moveInsertion(direction: "up" | "down"): boolean {
		const operation = this.moveOperation;
		if (!operation || this.writePending) return false;
		if (this.collapseHighlight()) return true;
		const lane = this.lanes.find((candidate) => candidate.status === operation.targetStatus);
		const maximum = Math.max(0, (lane?.tasks.length ?? 0) - getPreviewMovingIds(operation).length);
		const next = Math.max(0, Math.min(maximum, operation.targetIndex + (direction === "up" ? -1 : 1)));
		if (next === operation.targetIndex) return false;
		operation.targetIndex = next;
		return true;
	}

	walkRecruitHighlight(direction: "up" | "down"): boolean {
		const operation = this.moveOperation;
		if (!operation || this.writePending) return false;
		const recruitIndex =
			!operation.highlightTaskId && operation.selectedIds.length > 0
				? mapMoveInsertionIndex(
						this.insertionBase(operation.targetStatus, getMoveSetIds(operation)),
						this.insertionBase(operation.targetStatus, [operation.taskId]),
						operation.targetIndex,
					)
				: operation.targetIndex;
		const rows = this.insertionBase(operation.targetStatus, [operation.taskId]);
		const ghostIndex = Math.max(0, Math.min(recruitIndex, rows.length));
		rows.splice(ghostIndex, 0, operation.taskId);
		const from = operation.highlightTaskId ? rows.indexOf(operation.highlightTaskId) : ghostIndex;
		const step = direction === "down" ? 1 : -1;
		let next = (from === -1 ? ghostIndex : from) + step;
		while (rows[next] === operation.taskId) next += step;
		if (!rows[next]) return false;
		operation.highlightTaskId = rows[next] ?? null;
		operation.targetIndex = recruitIndex;
		return true;
	}

	toggleRecruit(): "selected" | "deselected" | "unavailable" | "branched" | "inactive" {
		const operation = this.moveOperation;
		if (!operation || this.writePending) return "inactive";
		let candidate = operation.highlightTaskId;
		if (!candidate) {
			const lane = this.lanes.find((item) => item.status === operation.targetStatus);
			const index = lane?.tasks.findIndex((task) => task.id === operation.taskId) ?? -1;
			const selected = new Set(operation.selectedIds);
			const nearest = (from: number, step: number) => {
				for (let position = from; lane && position >= 0 && position < lane.tasks.length; position += step) {
					const task = lane.tasks[position];
					if (task && task.id !== operation.taskId && !selected.has(task.id) && !task.branch) return task.id;
				}
			};
			candidate = nearest(index + 1, 1) ?? nearest(index - 1, -1) ?? null;
		}
		if (!candidate || candidate === operation.taskId) return "unavailable";
		if (this.tasks.find((task) => task.id === candidate)?.branch) return "branched";
		const selected = operation.selectedIds.includes(candidate);
		this.updateMoveSelection(() => {
			operation.selectedIds = selected
				? operation.selectedIds.filter((id) => id !== candidate)
				: [...operation.selectedIds, candidate as string];
		});
		return selected ? "deselected" : "selected";
	}

	completeMove(): BoardMoveCommit | null {
		const operation = this.moveOperation;
		if (!operation || this.writePending) return null;
		if (operation.selectedIds.length > 0 && operation.highlightTaskId) {
			this.collapseHighlight();
			return null;
		}
		const target = projectBoardMove(this.tasks, this.statuses, operation).find(
			(lane) => lane.status === operation.targetStatus,
		);
		if (!target) {
			this.moveOperation = null;
			return null;
		}
		const unchanged =
			operation.targetStatus === operation.originalStatus &&
			operation.targetIndex === operation.originalIndex &&
			operation.selectedIds.length === 0;
		this.moveOperation = null;
		return unchanged
			? null
			: {
					taskIds: getMoveSetIds(operation),
					targetStatus: operation.targetStatus,
					orderedTaskIds: target.tasks.map((task) => task.id),
					kind: operation.selectedIds.length > 0 ? "move" : "reorder",
				};
	}

	private collapseHighlight(): boolean {
		if (!this.moveOperation?.highlightTaskId) return false;
		this.updateMoveSelection(() => {
			if (this.moveOperation) this.moveOperation.highlightTaskId = null;
		});
		return true;
	}

	private insertionBase(status: string, excludeIds: string[]): string[] {
		return getMoveInsertionBase(this.filter.apply(this.tasks), this.statuses, status, excludeIds);
	}

	private updateMoveSelection(mutate: () => void): void {
		const operation = this.moveOperation;
		if (!operation) return;
		const before = this.insertionBase(operation.targetStatus, getPreviewMovingIds(operation));
		mutate();
		const after = this.insertionBase(operation.targetStatus, getPreviewMovingIds(operation));
		operation.targetIndex = mapMoveInsertionIndex(before, after, operation.targetIndex);
	}

	private restoreSelection(): void {
		const lanes = this.lanes;
		const selectedLane = lanes.find((lane) => lane.status === this.selectedStatus) ?? lanes[0];
		this.selectedStatus = selectedLane?.status ?? null;
		this.selectedTaskId = selectedLane?.tasks.some((task) => task.id === this.selectedTaskId)
			? this.selectedTaskId
			: (selectedLane?.selected?.id ?? null);
	}
}
