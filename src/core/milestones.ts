import type { Milestone, MilestoneBucket, Task } from "../types/index.ts";

const NO_MILESTONE_KEY = "__none";

/**
 * Normalize a milestone name/ID by trimming whitespace
 */
export function normalizeMilestoneName(name: string): string {
	return name.trim();
}

/**
 * Get a lowercase key for milestone comparison
 */
export function milestoneKey(name?: string | null): string {
	return normalizeMilestoneName(name ?? "").toLowerCase();
}

/** Collect case-insensitive ID aliases for a numeric milestone reference. */
export function collectMilestoneAliasKeys(value: string): Set<string> {
	const normalized = normalizeMilestoneName(value);
	const key = milestoneKey(normalized);
	if (!key) return new Set();
	const keys = new Set([key]);
	const match = normalized.match(/^(?:m-)?(\d+)$/i);
	if (match?.[1]) {
		const numeric = String(Number.parseInt(match[1], 10));
		keys.add(numeric);
		keys.add(`m-${numeric}`);
	}
	return keys;
}

export function canonicalMilestoneId(value: string): string | null {
	const match = normalizeMilestoneName(value).match(/^(?:m-)?(\d+)$/i);
	return match?.[1] ? `m-${String(Number.parseInt(match[1], 10))}` : null;
}

function setMilestoneAlias(
	aliasMap: Map<string, string>,
	aliasKey: string,
	normalizedId: string,
	allowOverwrite: boolean,
): void {
	const existing = aliasMap.get(aliasKey);
	if (!existing) {
		aliasMap.set(aliasKey, normalizedId);
		return;
	}
	if (!allowOverwrite) return;
	const preferredRawId = /^\d+$/.test(aliasKey) ? `m-${aliasKey}` : /^m-\d+$/.test(aliasKey) ? aliasKey : null;
	if (!preferredRawId) {
		aliasMap.set(aliasKey, normalizedId);
		return;
	}
	const existingIsPreferred = existing.toLowerCase() === preferredRawId;
	const nextIsPreferred = normalizedId.toLowerCase() === preferredRawId;
	if (nextIsPreferred && !existingIsPreferred) aliasMap.set(aliasKey, normalizedId);
}

function countTitleKeys(milestones: Milestone[], excludedKeys = new Set<string>()): Map<string, number> {
	const counts = new Map<string, number>();
	for (const milestone of milestones) {
		const titleKey = milestoneKey(milestone.title);
		if (!titleKey || excludedKeys.has(titleKey)) continue;
		counts.set(titleKey, (counts.get(titleKey) ?? 0) + 1);
	}
	return counts;
}

function addMilestoneIdAliases(aliasMap: Map<string, string>, normalizedId: string, allowOverwrite = true): void {
	const idKey = milestoneKey(normalizedId);
	if (idKey) setMilestoneAlias(aliasMap, idKey, normalizedId, allowOverwrite);
	const canonicalId = canonicalMilestoneId(normalizedId);
	if (!canonicalId) return;
	setMilestoneAlias(aliasMap, canonicalId, normalizedId, allowOverwrite);
	setMilestoneAlias(aliasMap, canonicalId.slice(2), normalizedId, allowOverwrite);
}

function addMilestoneTitleAlias(
	aliasMap: Map<string, string>,
	milestone: Milestone,
	titleCounts: Map<string, number>,
	excludedKeys: Set<string>,
): void {
	const normalizedId = normalizeMilestoneName(milestone.id);
	const titleKey = milestoneKey(normalizeMilestoneName(milestone.title));
	if (
		!normalizedId ||
		!titleKey ||
		excludedKeys.has(titleKey) ||
		titleCounts.get(titleKey) !== 1 ||
		aliasMap.has(titleKey)
	)
		return;
	aliasMap.set(titleKey, normalizedId);
}

function registerMilestoneAliases(
	aliasMap: Map<string, string>,
	milestones: Milestone[],
	titleCounts: Map<string, number>,
	excludedKeys: Set<string>,
	allowOverwrite: boolean,
): void {
	for (const milestone of milestones) {
		const normalizedId = normalizeMilestoneName(milestone.id);
		if (!normalizedId) continue;
		addMilestoneIdAliases(aliasMap, normalizedId, allowOverwrite);
		addMilestoneTitleAlias(aliasMap, milestone, titleCounts, excludedKeys);
	}
}

/**
 * Collect archived milestone keys, excluding archived titles that are reused by active milestones.
 */
export function collectArchivedMilestoneKeys(archivedMilestones: Milestone[], activeMilestones: Milestone[]): string[] {
	const keys = new Set<string>();
	const activeTitleKeys = new Set(activeMilestones.map((milestone) => milestoneKey(milestone.title)).filter(Boolean));

	for (const milestone of archivedMilestones) {
		const idKey = milestoneKey(milestone.id);
		if (idKey) {
			keys.add(idKey);
		}
		const titleKey = milestoneKey(milestone.title);
		if (titleKey && !activeTitleKeys.has(titleKey)) {
			keys.add(titleKey);
		}
	}

	return Array.from(keys);
}

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

export function buildMilestoneAliasMap(
	milestoneEntities: Milestone[],
	archivedMilestones: Milestone[] = [],
): Map<string, string> {
	const aliasMap = new Map<string, string>();
	const reservedIdKeys = new Set<string>();
	for (const milestone of [...milestoneEntities, ...archivedMilestones]) {
		for (const key of collectMilestoneAliasKeys(milestone.id)) {
			reservedIdKeys.add(key);
		}
	}
	const activeTitleCounts = countTitleKeys(milestoneEntities);
	const activeTitleKeys = new Set(activeTitleCounts.keys());

	registerMilestoneAliases(aliasMap, milestoneEntities, activeTitleCounts, reservedIdKeys, true);

	const archivedTitleCounts = countTitleKeys(archivedMilestones, activeTitleKeys);

	registerMilestoneAliases(
		aliasMap,
		archivedMilestones,
		archivedTitleCounts,
		new Set([...activeTitleKeys, ...reservedIdKeys]),
		false,
	);

	return aliasMap;
}

/** Build aliases from milestone IDs only, excluding title matches. */
function buildMilestoneIdAliasMap(milestones: Milestone[], archivedMilestones: Milestone[] = []): Map<string, string> {
	const withoutTitle = (milestone: Milestone): Milestone => ({ ...milestone, title: "" });
	return buildMilestoneAliasMap(milestones.map(withoutTitle), archivedMilestones.map(withoutTitle));
}

export function canonicalizeMilestone(value: string | null | undefined, aliasMap?: Map<string, string>): string {
	const normalized = normalizeMilestoneName(value ?? "");
	if (!normalized) return "";
	const normalizedKey = milestoneKey(normalized);
	const direct = aliasMap?.get(normalizedKey);
	if (direct) {
		return direct;
	}
	const canonicalId = canonicalMilestoneId(normalized);
	if (canonicalId) {
		return aliasMap?.get(canonicalId) ?? aliasMap?.get(canonicalId.slice(2)) ?? normalized;
	}
	return normalized;
}

/**
 * Resolve a configured milestone while honoring an exact stored ID before aliases.
 */
export function resolveMilestoneAliasToId(
	value: string | null | undefined,
	milestones: Milestone[],
	archivedMilestones: Milestone[] = [],
): Milestone | undefined {
	const normalized = normalizeMilestoneName(value ?? "");
	if (!normalized) return undefined;
	const exactId = milestones.find((milestone) => milestoneKey(milestone.id) === milestoneKey(normalized));
	if (exactId) return exactId;
	if (!/^(?:m-)?\d+$/i.test(normalized)) return undefined;
	const canonicalId = canonicalizeMilestone(normalized, buildMilestoneIdAliasMap(milestones, archivedMilestones));
	return milestones.find((milestone) => milestoneKey(milestone.id) === milestoneKey(canonicalId));
}

function canonicalizeTaskMilestones(
	tasks: Task[],
	milestoneEntities: Milestone[],
	archivedMilestones: Milestone[] = [],
): Task[] {
	const aliasMap = buildMilestoneAliasMap(milestoneEntities, archivedMilestones);
	return tasks.map((task) => {
		const canonicalMilestone = canonicalizeMilestone(task.milestone, aliasMap);
		if (task.milestone === canonicalMilestone) {
			return task;
		}
		return {
			...task,
			milestone: canonicalMilestone || undefined,
		};
	});
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
	const aliasMap = buildMilestoneAliasMap(milestoneEntities, archivedMilestones);

	const addMilestone = (value: string) => {
		const normalized = normalizeMilestoneName(value);
		if (!normalized) return;
		const key = milestoneKey(normalized);
		if (seen.has(key)) return;
		seen.add(key);
		merged.push(normalized);
	};

	// Add milestone entities first (they have priority for ordering)
	for (const entity of milestoneEntities) {
		addMilestone(entity.id);
	}

	// Then add any milestones from tasks that aren't in entities
	for (const task of tasks) {
		addMilestone(canonicalizeMilestone(task.milestone, aliasMap));
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
	tasks: Task[],
	statuses: string[],
	milestoneEntities: Milestone[],
	isNoMilestone: boolean,
): MilestoneBucket {
	const bucketMilestoneKey = milestoneKey(milestoneId);
	const bucketTasks = tasks.filter((task) => {
		const taskMilestoneKey = milestoneKey(task.milestone);
		return bucketMilestoneKey ? taskMilestoneKey === bucketMilestoneKey : !taskMilestoneKey;
	});

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
	const archivedKeys = new Set((options?.archivedMilestoneIds ?? []).map((id) => milestoneKey(id)));
	const canonicalTasks = canonicalizeTaskMilestones(tasks, milestoneEntities, options?.archivedMilestones ?? []);
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

	const allMilestoneIds = collectMilestoneIds(normalizedTasks, filteredMilestones);

	const buckets: MilestoneBucket[] = [
		createBucket(undefined, normalizedTasks, statuses, filteredMilestones, true),
		...allMilestoneIds.map((m) => createBucket(m, normalizedTasks, statuses, filteredMilestones, false)),
	];

	return buckets;
}
