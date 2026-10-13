import type { Milestone, Task } from "../types/index.ts";
import { normalizeDueDate } from "../utils/due-date.ts";
import type { Core } from "./backlog.ts";
import { buildMilestoneMatchKeys, findActiveMilestoneByAlias, keySetsIntersect } from "./milestone-resolution.ts";
import { milestoneKey, normalizeMilestoneName } from "./milestones.ts";

export type MilestoneRenameInput = { from: string; to: string; updateTasks?: boolean; dueDate?: string | null };
export type MilestoneRemoveInput = { name: string; taskHandling?: "clear" | "keep" | "reassign"; reassignTo?: string };

export class MilestoneWorkflowError extends Error {
	constructor(
		message: string,
		readonly code: "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR",
	) {
		super(message);
		this.name = "MilestoneWorkflowError";
	}
}

export type MilestoneRenameResult = {
	source: Milestone;
	milestone: Milestone;
	titleChanged: boolean;
	dueDateChanged: boolean;
	updatedTaskIds: string[];
	skippedTaskUpdate: boolean;
	sourcePath?: string;
	targetPath?: string;
};

export type MilestoneRemoveResult = {
	milestone: Milestone;
	taskHandling: "clear" | "keep" | "reassign";
	reassignedMilestone?: Milestone;
	updatedTaskIds: string[];
};

type MilestoneTaskUpdate = {
	previousMilestones: Map<string, string | undefined>;
	updatedTaskIds: string[];
};

type MilestoneRenamePreparation = {
	source: Milestone;
	active: Milestone[];
	archived: Milestone[];
	to: string;
	dueDate: string | undefined;
	titleChanged: boolean;
	dueDateChanged: boolean;
	shouldUpdateTasks: boolean;
};

type MilestoneRemovalPreparation = {
	source: Milestone;
	active: Milestone[];
	archived: Milestone[];
	taskHandling: "clear" | "keep" | "reassign";
	reassignedMilestone?: Milestone;
};

async function updateTaskMilestones(core: Core, tasks: Task[], milestone: string | null): Promise<MilestoneTaskUpdate> {
	const previousMilestones = new Map<string, string | undefined>();
	const updatedTaskIds: string[] = [];
	for (const task of tasks) {
		previousMilestones.set(task.id, task.milestone);
		await core.editTask(task.id, { milestone });
		updatedTaskIds.push(task.id);
	}
	return {
		previousMilestones,
		updatedTaskIds: updatedTaskIds.sort((a, b) => a.localeCompare(b)),
	};
}

async function rollbackTaskMilestones(
	core: Core,
	previousMilestones: Map<string, string | undefined>,
): Promise<string[]> {
	const failedTaskIds: string[] = [];
	for (const [taskId, milestone] of previousMilestones) {
		try {
			await core.editTask(taskId, { milestone: milestone ?? null });
		} catch {
			failedTaskIds.push(taskId);
		}
	}
	return failedTaskIds.sort((a, b) => a.localeCompare(b));
}

function recordMatchKeys(milestone: Milestone): Set<string> {
	const keys = buildMilestoneMatchKeys(milestone.id, [milestone]);
	const titleKey = milestoneKey(milestone.title);
	if (titleKey) keys.add(titleKey);
	return keys;
}

function titleAliasCollides(source: Milestone, candidates: Milestone[]): boolean {
	const titleKey = milestoneKey(source.title);
	return (
		Boolean(titleKey) &&
		candidates.some(
			(candidate) => milestoneKey(candidate.id) !== milestoneKey(source.id) && recordMatchKeys(candidate).has(titleKey),
		)
	);
}

function taskMatchKeys(input: string, milestone: Milestone, includeTitle: boolean): Set<string> {
	const keys = buildMilestoneMatchKeys(includeTitle ? input : milestone.id, [milestone]);
	for (const key of buildMilestoneMatchKeys(milestone.id, [milestone])) keys.add(key);
	const titleKey = milestoneKey(milestone.title);
	if (titleKey && includeTitle) keys.add(titleKey);
	if (titleKey && !includeTitle) keys.delete(titleKey);
	return keys;
}

export class MilestoneWorkflow {
	constructor(private readonly core: Core) {}

	private async prepareRename(input: MilestoneRenameInput): Promise<MilestoneRenamePreparation> {
		const from = normalizeMilestoneName(input.from);
		const to = normalizeMilestoneName(input.to);
		if (!from || !to)
			throw new MilestoneWorkflowError("Both 'from' and 'to' milestone names are required.", "VALIDATION_ERROR");
		const [active, archived] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
		]);
		const source = findActiveMilestoneByAlias(from, active);
		if (!source) throw new MilestoneWorkflowError(`Milestone not found: "${from}"`, "NOT_FOUND");
		let dueDate: string | undefined;
		try {
			dueDate =
				input.dueDate === undefined
					? source.dueDate
					: input.dueDate === null
						? undefined
						: normalizeDueDate(input.dueDate, "Due date");
		} catch (error) {
			throw new MilestoneWorkflowError(error instanceof Error ? error.message : String(error), "VALIDATION_ERROR");
		}
		const titleChanged = to !== source.title.trim();
		const dueDateChanged = dueDate !== source.dueDate;
		if (titleChanged) this.ensureRenameDoesNotConflict(source, to, active);
		return {
			source,
			active,
			archived,
			to,
			dueDate,
			titleChanged,
			dueDateChanged,
			shouldUpdateTasks: titleChanged && (input.updateTasks ?? true),
		};
	}

	private ensureRenameDoesNotConflict(source: Milestone, to: string, active: Milestone[]): void {
		const conflict = active.find(
			(milestone) =>
				milestoneKey(milestone.id) !== milestoneKey(source.id) &&
				keySetsIntersect(buildMilestoneMatchKeys(to, active), recordMatchKeys(milestone)),
		);
		if (conflict)
			throw new MilestoneWorkflowError(
				`Milestone alias conflict: "${to}" matches existing milestone "${conflict.title}" (${conflict.id}).`,
				"VALIDATION_ERROR",
			);
	}

	private async updateMatchingTasks(
		source: Milestone,
		input: string,
		milestones: Milestone[],
		replacement: string | null,
	): Promise<MilestoneTaskUpdate> {
		const tasks = await this.core.filesystem.listTasks();
		const keys = taskMatchKeys(input, source, !titleAliasCollides(source, milestones));
		return updateTaskMilestones(
			this.core,
			tasks.filter((task) => keys.has(milestoneKey(task.milestone ?? ""))),
			replacement,
		);
	}

	private async rollbackRename(source: Milestone, updates: MilestoneTaskUpdate): Promise<string> {
		const taskFailures = await rollbackTaskMilestones(this.core, updates.previousMilestones);
		const renameResult = await this.core.renameMilestone(source.id, source.title, source.dueDate ?? null);
		const details = [
			!renameResult.success ? "failed to rollback milestone file rename" : "",
			taskFailures.length ? `failed to rollback task milestones for: ${taskFailures.join(", ")}` : "",
		].filter(Boolean);
		return details.length ? ` (${details.join("; ")})` : "";
	}

	private async prepareRemoval(input: MilestoneRemoveInput): Promise<MilestoneRemovalPreparation> {
		const name = normalizeMilestoneName(input.name);
		if (!name) throw new MilestoneWorkflowError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		const [active, archived] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
		]);
		const source = findActiveMilestoneByAlias(name, active);
		if (!source) throw new MilestoneWorkflowError(`Milestone not found: "${name}"`, "NOT_FOUND");
		const taskHandling = input.taskHandling ?? "clear";
		if (taskHandling !== "reassign") return { source, active, archived, taskHandling };
		if (!input.reassignTo?.trim())
			throw new MilestoneWorkflowError("reassignTo is required when taskHandling is reassign.", "VALIDATION_ERROR");
		const reassignedMilestone = findActiveMilestoneByAlias(normalizeMilestoneName(input.reassignTo), active);
		if (!reassignedMilestone)
			throw new MilestoneWorkflowError(`Target milestone not found: "${input.reassignTo}"`, "VALIDATION_ERROR");
		if (milestoneKey(reassignedMilestone.id) === milestoneKey(source.id))
			throw new MilestoneWorkflowError("reassignTo must be different from the removed milestone.", "VALIDATION_ERROR");
		return { source, active, archived, taskHandling, reassignedMilestone };
	}

	async rename(input: MilestoneRenameInput): Promise<MilestoneRenameResult> {
		const preparation = await this.prepareRename(input);
		const { source, active, archived, to, titleChanged, dueDateChanged, shouldUpdateTasks } = preparation;
		if (!titleChanged && !dueDateChanged)
			return { source, milestone: source, titleChanged, dueDateChanged, updatedTaskIds: [], skippedTaskUpdate: false };
		const renamed = await this.core.renameMilestone(source.id, to, input.dueDate);
		if (!renamed.success || !renamed.milestone)
			throw new MilestoneWorkflowError(`Failed to rename milestone "${source.title}".`, "INTERNAL_ERROR");
		let updates: MilestoneTaskUpdate = {
			previousMilestones: new Map(),
			updatedTaskIds: [],
		};
		try {
			if (shouldUpdateTasks)
				updates = await this.updateMatchingTasks(source, input.from, [...active, ...archived], source.id);
		} catch {
			throw new MilestoneWorkflowError(
				`Failed while finalizing milestone rename "${source.title}"${await this.rollbackRename(source, updates)}.`,
				"INTERNAL_ERROR",
			);
		}
		return {
			source,
			milestone: renamed.milestone,
			titleChanged,
			dueDateChanged,
			updatedTaskIds: updates.updatedTaskIds,
			skippedTaskUpdate: titleChanged && !shouldUpdateTasks,
			sourcePath: renamed.sourcePath,
			targetPath: renamed.targetPath,
		};
	}

	async remove(input: MilestoneRemoveInput): Promise<MilestoneRemoveResult> {
		const { source, active, archived, taskHandling, reassignedMilestone } = await this.prepareRemoval(input);
		let updates: MilestoneTaskUpdate = {
			previousMilestones: new Map(),
			updatedTaskIds: [],
		};
		try {
			if (taskHandling !== "keep")
				updates = await this.updateMatchingTasks(
					source,
					input.name,
					[...active, ...archived],
					reassignedMilestone?.id ?? null,
				);
		} catch {
			const failures = await rollbackTaskMilestones(this.core, updates.previousMilestones);
			throw new MilestoneWorkflowError(
				`Failed while updating tasks for milestone removal "${source.title}"${failures.length ? ` (failed rollback for: ${failures.join(", ")})` : ""}.`,
				"INTERNAL_ERROR",
			);
		}
		const archivedResult = await this.core.archiveMilestone(source.id);
		if (!archivedResult.success) {
			const failures = await rollbackTaskMilestones(this.core, updates.previousMilestones);
			throw new MilestoneWorkflowError(
				`Failed to archive milestone "${source.title}" before removal.${failures.length ? ` (failed rollback for: ${failures.join(", ")})` : ""}`,
				"INTERNAL_ERROR",
			);
		}
		return { milestone: source, taskHandling, reassignedMilestone, updatedTaskIds: updates.updatedTaskIds };
	}
}
