import type { Milestone } from "../types/index.ts";

/** The fields milestone identity is derived from. */
export type MilestoneIdentity = Pick<Milestone, "id" | "title">;

export type MilestoneIdentityScope = "active" | "archived" | "all";

type MatchBucket = "rawId" | "canonicalId" | "aliasId" | "title" | "variantId" | "variantTitle";

export function parseMilestoneId(value: string): string | null {
	return /^(?:m-)?(\d+)$/i.exec(value)?.[1] ?? null;
}

export function isMilestoneId(value: string): boolean {
	return parseMilestoneId(value) !== null;
}

export function normalizeMilestoneName(name: string): string {
	return name.trim();
}

export function milestoneKey(name?: string | null): string {
	return normalizeMilestoneName(name ?? "").toLowerCase();
}

/** Collect case-insensitive ID aliases for a numeric milestone reference. */
export function collectMilestoneAliasKeys(value: string): Set<string> {
	const normalized = normalizeMilestoneName(value);
	const key = milestoneKey(normalized);
	if (!key) return new Set();
	const keys = new Set([key]);
	const numericPart = parseMilestoneId(normalized);
	if (numericPart) {
		const numeric = String(Number.parseInt(numericPart, 10));
		keys.add(numeric);
		keys.add(`m-${numeric}`);
	}
	return keys;
}

export function canonicalMilestoneId(value: string): string | null {
	const numericPart = parseMilestoneId(normalizeMilestoneName(value));
	return numericPart ? `m-${String(Number.parseInt(numericPart, 10))}` : null;
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
	const numericPart = parseMilestoneId(aliasKey);
	const preferredRawId = numericPart ? (aliasKey.toLowerCase().startsWith("m-") ? aliasKey : `m-${aliasKey}`) : null;
	if (!preferredRawId) {
		aliasMap.set(aliasKey, normalizedId);
		return;
	}
	const existingIsPreferred = existing.toLowerCase() === preferredRawId;
	const nextIsPreferred = normalizedId.toLowerCase() === preferredRawId;
	if (nextIsPreferred && !existingIsPreferred) aliasMap.set(aliasKey, normalizedId);
}

function countTitleKeys(
	milestones: readonly MilestoneIdentity[],
	excludedKeys = new Set<string>(),
): Map<string, number> {
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
	milestone: MilestoneIdentity,
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
	milestones: readonly MilestoneIdentity[],
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

function buildMilestoneAliasMap(
	milestoneEntities: readonly MilestoneIdentity[],
	archivedMilestones: readonly MilestoneIdentity[] = [],
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

function canonicalizeMilestone(value: string | null | undefined, aliasMap: Map<string, string>): string {
	const normalized = normalizeMilestoneName(value ?? "");
	if (!normalized) return "";
	const normalizedKey = milestoneKey(normalized);
	const direct = aliasMap.get(normalizedKey);
	if (direct) {
		return direct;
	}
	const canonicalId = canonicalMilestoneId(normalized);
	if (canonicalId) {
		return aliasMap.get(canonicalId) ?? aliasMap.get(canonicalId.slice(2)) ?? normalized;
	}
	return normalized;
}

function findExactIdIn<T extends MilestoneIdentity>(value: string, milestones: readonly T[]): T | undefined {
	const key = milestoneKey(value);
	if (!key) return undefined;
	return milestones.find((milestone) => milestoneKey(milestone.id) === key);
}

function findCanonicalIdIn<T extends MilestoneIdentity>(value: string, milestones: readonly T[]): T | undefined {
	const canonicalId = canonicalMilestoneId(value);
	if (!canonicalId) return undefined;
	return milestones.find((milestone) => milestoneKey(milestone.id) === canonicalId);
}

function findAliasIdIn<T extends MilestoneIdentity>(value: string, milestones: readonly T[]): T | undefined {
	const aliasKeys = collectMilestoneAliasKeys(value);
	if (!aliasKeys.size) return undefined;
	return milestones.find((milestone) => [...collectMilestoneAliasKeys(milestone.id)].some((key) => aliasKeys.has(key)));
}

/** Exact raw ID, then canonical ID, then numeric aliases. */
function findIdIn<T extends MilestoneIdentity>(value: string, milestones: readonly T[]): T | undefined {
	return findExactIdIn(value, milestones) ?? findCanonicalIdIn(value, milestones) ?? findAliasIdIn(value, milestones);
}

function findTitleMatchesIn<T extends MilestoneIdentity>(value: string, milestones: readonly T[]): T[] {
	const key = milestoneKey(value);
	if (!key) return [];
	return milestones.filter((milestone) => milestoneKey(milestone.title) === key);
}

function findUniqueTitleIn<T extends MilestoneIdentity>(value: string, milestones: readonly T[]): T | undefined {
	const matches = findTitleMatchesIn(value, milestones);
	return matches.length === 1 ? matches[0] : undefined;
}

function collectArchivedMilestoneKeys(
	archivedMilestones: readonly MilestoneIdentity[],
	activeMilestones: readonly MilestoneIdentity[],
): string[] {
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
 * One resolver for milestone identity. Parsing, canonical IDs, aliases, and title precedence live
 * here; callers should not rebuild these rules.
 */
export class MilestoneIdentityResolver<T extends MilestoneIdentity = Milestone> {
	readonly activeMilestones: readonly T[];
	readonly archivedMilestones: readonly T[];
	private readonly allMilestones: readonly T[];
	private readonly aliasMap: Map<string, string>;

	constructor(activeMilestones: readonly T[], archivedMilestones: readonly T[] = []) {
		this.activeMilestones = activeMilestones;
		this.archivedMilestones = archivedMilestones;
		this.allMilestones = [...activeMilestones, ...archivedMilestones];
		this.aliasMap = buildMilestoneAliasMap(activeMilestones, archivedMilestones);
	}

	private milestonesFor(scope: MilestoneIdentityScope): readonly T[] {
		if (scope === "active") return this.activeMilestones;
		if (scope === "archived") return this.archivedMilestones;
		return this.allMilestones;
	}

	/** Canonicalize a stored milestone value through the active/archived alias map. */
	canonicalize(value: string | null | undefined): string {
		return canonicalizeMilestone(value, this.aliasMap);
	}

	findExactId(value: string, scope: MilestoneIdentityScope = "all"): T | undefined {
		return findExactIdIn(value, this.milestonesFor(scope));
	}

	findCanonicalId(value: string, scope: MilestoneIdentityScope = "all"): T | undefined {
		return findCanonicalIdIn(value, this.milestonesFor(scope));
	}

	findUniqueActiveTitle(value: string): T | undefined {
		return findUniqueTitleIn(value, this.activeMilestones);
	}

	findUniqueArchivedTitle(value: string): T | undefined {
		return findUniqueTitleIn(value, this.archivedMilestones);
	}

	findUniqueTitle(value: string, scope: MilestoneIdentityScope = "all"): T | undefined {
		return findUniqueTitleIn(value, this.milestonesFor(scope));
	}

	findFirstTitle(value: string, scope: MilestoneIdentityScope = "all"): T | undefined {
		return findTitleMatchesIn(value, this.milestonesFor(scope))[0];
	}

	findTitleMatches(value: string, scope: MilestoneIdentityScope = "all"): T[] {
		return findTitleMatchesIn(value, this.milestonesFor(scope));
	}

	/** ID lookup for a collection: exact ID, then canonical ID, then numeric aliases. */
	findId(value: string, scope: MilestoneIdentityScope = "all"): T | undefined {
		return findIdIn(value, this.milestonesFor(scope));
	}

	/** Resolve an active milestone by ID alias first for ID-shaped input, title first otherwise. */
	findActiveByAlias(value: string): T | undefined {
		const normalized = normalizeMilestoneName(value);
		const key = milestoneKey(normalized);
		if (!key) return undefined;
		const idMatch = findIdIn(normalized, this.activeMilestones);
		const titleMatches = findTitleMatchesIn(normalized, this.activeMilestones);
		const titleMatch = titleMatches.length === 1 ? titleMatches[0] : undefined;
		return isMilestoneId(normalized) ? (idMatch ?? titleMatch) : (titleMatch ?? idMatch);
	}

	/** Match keys used by milestone rename/remove workflows. */
	buildMatchKeys(value: string, milestones: readonly T[] = this.activeMilestones): Set<string> {
		const keys = collectMilestoneAliasKeys(value);
		if (findIdIn(value, milestones)) return keys;
		const titleMatch = findUniqueTitleIn(value, milestones);
		if (titleMatch) {
			for (const key of collectMilestoneAliasKeys(titleMatch.id)) keys.add(key);
		}
		return keys;
	}

	/**
	 * Storage resolution: active IDs outrank archived IDs, which outrank titles; an ambiguous
	 * active title is preserved as-is rather than guessing.
	 */
	resolveStorageInput(value: string): string {
		const normalized = normalizeMilestoneName(value);
		if (!normalized) return normalized;

		if (isMilestoneId(normalized)) {
			const activeIdMatch = findIdIn(normalized, this.activeMilestones);
			if (activeIdMatch) return activeIdMatch.id;
			const archivedIdMatch = findIdIn(normalized, this.archivedMilestones);
			if (archivedIdMatch) return archivedIdMatch.id;
			const activeTitleMatch = findUniqueTitleIn(normalized, this.activeMilestones);
			if (activeTitleMatch) return activeTitleMatch.id;
			if (findTitleMatchesIn(normalized, this.activeMilestones).length > 1) return normalized;
			return findUniqueTitleIn(normalized, this.archivedMilestones)?.id ?? normalized;
		}

		const activeMatch =
			findUniqueTitleIn(normalized, this.activeMilestones)?.id ?? findIdIn(normalized, this.activeMilestones)?.id;
		if (activeMatch) return activeMatch;
		if (findTitleMatchesIn(normalized, this.activeMilestones).length > 1) return normalized;

		return (
			findIdIn(normalized, this.archivedMilestones)?.id ??
			findUniqueTitleIn(normalized, this.archivedMilestones)?.id ??
			normalized
		);
	}

	/**
	 * Filesystem lookup over one scope: an ID-shaped input prefers exact/canonical/unique alias IDs,
	 * a title-shaped input prefers an exact raw ID then a unique title, and numeric alias variants
	 * remain exact matches. Ambiguous matches stay unresolved.
	 */
	resolveStoredIdentifier(value: string): T | undefined {
		const input = normalizeMilestoneName(value).toLowerCase();
		const keys = collectMilestoneAliasKeys(value);
		if (!keys.size) return undefined;
		const variants = new Set(keys);
		variants.delete(input);
		const canonical = canonicalMilestoneId(input);
		const matches: Record<MatchBucket, T[]> = {
			rawId: [],
			canonicalId: [],
			aliasId: [],
			title: [],
			variantId: [],
			variantTitle: [],
		};
		for (const milestone of this.activeMilestones) {
			const id = normalizeMilestoneName(milestone.id).toLowerCase();
			const title = normalizeMilestoneName(milestone.title).toLowerCase();
			if (id === input) matches.rawId.push(milestone);
			else if (canonical && id === canonical) matches.canonicalId.push(milestone);
			else if (collectMilestoneAliasKeys(milestone.id).has(input)) matches.aliasId.push(milestone);
			else if (title === input) matches.title.push(milestone);
			else if ([...collectMilestoneAliasKeys(milestone.id)].some((key) => variants.has(key)))
				matches.variantId.push(milestone);
			else if (variants.has(title)) matches.variantTitle.push(milestone);
		}

		const one = (items: T[]): T | undefined => (items.length === 1 ? items[0] : undefined);
		if (isMilestoneId(input)) {
			return (
				matches.rawId[0] ??
				matches.canonicalId[0] ??
				one(matches.aliasId) ??
				one(matches.variantId) ??
				one(matches.title) ??
				one(matches.variantTitle)
			);
		}
		return (
			matches.rawId[0] ??
			one(matches.title) ??
			matches.canonicalId[0] ??
			one(matches.variantId) ??
			one(matches.variantTitle)
		);
	}

	collectArchivedKeys(): string[] {
		return collectArchivedMilestoneKeys(this.archivedMilestones, this.activeMilestones);
	}
}

export function createMilestoneIdentityResolver<T extends MilestoneIdentity = Milestone>(
	activeMilestones: readonly T[],
	archivedMilestones: readonly T[] = [],
): MilestoneIdentityResolver<T> {
	return new MilestoneIdentityResolver(activeMilestones, archivedMilestones);
}

export function findActiveMilestoneByAlias<T extends MilestoneIdentity>(
	value: string,
	milestones: readonly T[],
): T | undefined {
	return createMilestoneIdentityResolver(milestones).findActiveByAlias(value);
}

export function buildMilestoneMatchKeys<T extends MilestoneIdentity>(
	value: string,
	milestones: readonly T[],
): Set<string> {
	return createMilestoneIdentityResolver(milestones).buildMatchKeys(value, milestones);
}

export function keySetsIntersect(left: Set<string>, right: Set<string>): boolean {
	return [...left].some((key) => right.has(key));
}
