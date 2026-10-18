import type { Milestone, MilestoneBucket, Task } from "../types/index.ts";
import { createMilestoneIdentityResolver, milestoneKey, normalizeMilestoneName } from "./milestone-identity.ts";

const NO_MILESTONE_KEY = "__none";

/**
 * Validate a milestone name for creation
 */
export function validateMilestoneName(name: string, existingMilestones: string[]): string | null {
	const normalizedName = normalizeMilestoneName(name);
	if (!normalizedName) {
		return "Milestone name cannot be empty.";
	}

	const normalizedExisting = existingMilestones.map((milestone) => milestoneKey(milestone)).filter(Boolean);

	if (normalizedExisting.includes(milestoneKey(normalizedName))) {
		return "Milestone already exists.";
	}

	return null;
}

/**
 * Collect all unique milestone IDs from tasks and milestone entities
 */
export function collectMilestoneIds(
	tasks: Task[],
	milestoneEntities: Milestone[],
	archivedMilestones: Milestone[] = [],
): string[] {
	const merged: string[] = [];
	const seen = new Set<string>();
	const resolver = createMilestoneIdentityResolver(milestoneEntities, archivedMilestones);

	const addMilestone = (value: string) => {
		const normalized = normalizeMilestoneName(value);
		if (!normalized) return;
		const key = milestoneKey(normalized);
		if (seen.has(key)) return;
		seen.add(key);
		merged.push(normalized);
	};

	for (const entity of milestoneEntities) {
		addMilestone(entity.id);
	}

	for (const task of tasks) {
		addMilestone(resolver.canonicalize(task.milestone));
	}

	return merged;
}

/**
 * Get the display label for a milestone
 * Uses the milestone entity title if available, otherwise returns the ID
 */
export function getMilestoneLabel(milestoneId: string | undefined, milestoneEntities: Milestone[]): string {
	if (!milestoneId) {
		return "Tasks without milestone";
	}
	const entity = milestoneEntities.find((m) => milestoneKey(m.id) === milestoneKey(milestoneId));
	return entity?.title || milestoneId;
}

/**
 * Check if a status represents a "done" state
 */
export function isDoneStatus(status?: string | null): boolean {
	const normalized = (status ?? "").toLowerCase();
	return normalized.includes("done") || normalized.includes("complete");
}

/**
 * Create a milestone bucket for a given milestone
 */
function createBucket(
	milestoneId: string | undefined,
	bucketTasks: Task[],
	statuses: string[],
	milestoneEntities: Milestone[],
	isNoMilestone: boolean,
): MilestoneBucket {
	const bucketMilestoneKey = milestoneKey(milestoneId);

	const counts: Record<string, number> = {};
	for (const status of statuses) {
		counts[status] = 0;
	}
	for (const task of bucketTasks) {
		const status = task.status ?? "";
		counts[status] = (counts[status] ?? 0) + 1;
	}

	const doneCount = bucketTasks.filter((t) => isDoneStatus(t.status)).length;
	const progress = bucketTasks.length > 0 ? Math.round((doneCount / bucketTasks.length) * 100) : 0;
	const isCompleted = bucketTasks.length > 0 && doneCount === bucketTasks.length;

	const key = bucketMilestoneKey ? bucketMilestoneKey : NO_MILESTONE_KEY;
	const label = getMilestoneLabel(milestoneId, milestoneEntities);

	return {
		key,
		label,
		milestone: milestoneId,
		isNoMilestone,
		isCompleted,
		tasks: bucketTasks,
		statusCounts: counts,
		total: bucketTasks.length,
		doneCount,
		progress,
	};
}

/**
 * Build milestone buckets from tasks and milestone entities
 */
export function buildMilestoneBuckets(
	tasks: Task[],
	milestoneEntities: Milestone[],
	statuses: string[],
	options?: { archivedMilestoneIds?: string[]; archivedMilestones?: Milestone[] },
): MilestoneBucket[] {
	const archivedMilestones = options?.archivedMilestones ?? [];
	const resolver = createMilestoneIdentityResolver(milestoneEntities, archivedMilestones);
	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const canonicalTasks = tasks.map((task) => {
		const canonicalMilestone = resolver.canonicalize(task.milestone);
		if (task.milestone === canonicalMilestone) {
			return task;
		}
		return {
			...task,
			milestone: canonicalMilestone || undefined,
		};
	});
	const normalizedTasks =
		archivedKeys.size > 0
			? canonicalTasks.map((task) => {
					const key = milestoneKey(task.milestone);
					if (!key || !archivedKeys.has(key)) {
						return task;
					}
					return { ...task, milestone: undefined };
				})
			: canonicalTasks;
	const filteredMilestones =
		archivedKeys.size > 0
			? milestoneEntities.filter((milestone) => !archivedKeys.has(milestoneKey(milestone.id)))
			: milestoneEntities;

	const groupedTasks = new Map<string, Task[]>();
	for (const task of normalizedTasks) {
		const key = milestoneKey(task.milestone);
		const bucket = groupedTasks.get(key);
		if (bucket) bucket.push(task);
		else groupedTasks.set(key, [task]);
	}

	const allMilestoneIds = collectMilestoneIds(normalizedTasks, filteredMilestones);

	return [
		createBucket(undefined, groupedTasks.get("") ?? [], statuses, filteredMilestones, true),
		...allMilestoneIds.map((milestone) =>
			createBucket(milestone, groupedTasks.get(milestoneKey(milestone)) ?? [], statuses, filteredMilestones, false),
		),
	];
}
