import { canonicalMilestoneId, collectMilestoneAliasKeys, milestoneKey } from "../core/milestones.ts";
import type { Milestone } from "../types/index.ts";

type MilestoneRef = Pick<Milestone, "id" | "title">;

function milestoneIdMatchesAlias(milestoneId: string, aliasKeys: Set<string>): boolean {
	for (const key of collectMilestoneAliasKeys(milestoneId)) {
		if (aliasKeys.has(key)) {
			return true;
		}
	}
	return false;
}

function findIdMatch(input: string, milestones: MilestoneRef[], aliasKeys: Set<string>): MilestoneRef | undefined {
	const inputKey = milestoneKey(input);
	const rawExactMatch = milestones.find((item) => milestoneKey(item.id) === inputKey);
	if (rawExactMatch) {
		return rawExactMatch;
	}

	const canonicalInputId = canonicalMilestoneId(input);
	if (canonicalInputId) {
		const canonicalRawMatch = milestones.find((item) => milestoneKey(item.id) === canonicalInputId);
		if (canonicalRawMatch) {
			return canonicalRawMatch;
		}
	}

	return milestones.find((item) => milestoneIdMatchesAlias(item.id, aliasKeys));
}

function findUniqueTitleMatch(input: string, milestones: MilestoneRef[]): MilestoneRef | null {
	const inputKey = milestoneKey(input);
	const titleMatches = milestones.filter((item) => milestoneKey(item.title) === inputKey);
	return titleMatches.length === 1 ? (titleMatches[0] ?? null) : null;
}

function resolveMilestoneInCollection(
	normalized: string,
	aliasKeys: Set<string>,
	looksLikeMilestoneId: boolean,
	milestones: MilestoneRef[],
): string | null {
	const idMatch = findIdMatch(normalized, milestones, aliasKeys);
	if (looksLikeMilestoneId) return idMatch?.id ?? null;
	return findUniqueTitleMatch(normalized, milestones)?.id ?? idMatch?.id ?? null;
}

function activeTitleIsAmbiguous(input: string, milestones: MilestoneRef[]): boolean {
	const inputKey = milestoneKey(input);
	return milestones.filter((item) => milestoneKey(item.title) === inputKey).length > 1;
}

function resolveNumericMilestone(
	normalized: string,
	aliasKeys: Set<string>,
	activeMilestones: MilestoneRef[],
	archivedMilestones: MilestoneRef[],
): string {
	const activeIdMatch = findIdMatch(normalized, activeMilestones, aliasKeys);
	if (activeIdMatch) return activeIdMatch.id;
	const archivedIdMatch = findIdMatch(normalized, archivedMilestones, aliasKeys);
	if (archivedIdMatch) return archivedIdMatch.id;
	const activeTitleMatch = findUniqueTitleMatch(normalized, activeMilestones);
	if (activeTitleMatch) return activeTitleMatch.id;
	if (activeTitleIsAmbiguous(normalized, activeMilestones)) return normalized;
	return findUniqueTitleMatch(normalized, archivedMilestones)?.id ?? normalized;
}

export function resolveMilestoneInputForStorage(
	milestone: string,
	activeMilestones: MilestoneRef[],
	archivedMilestones: MilestoneRef[] = [],
): string {
	const normalized = milestone.trim();
	if (!normalized) {
		return normalized;
	}

	const aliasKeys = collectMilestoneAliasKeys(normalized);
	const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
	const hasAmbiguousActiveTitle = activeTitleIsAmbiguous(normalized, activeMilestones);
	if (looksLikeMilestoneId) return resolveNumericMilestone(normalized, aliasKeys, activeMilestones, archivedMilestones);

	const activeMatch = resolveMilestoneInCollection(normalized, aliasKeys, false, activeMilestones);
	if (activeMatch) {
		return activeMatch;
	}
	if (hasAmbiguousActiveTitle) {
		return normalized;
	}

	return resolveMilestoneInCollection(normalized, aliasKeys, false, archivedMilestones) ?? normalized;
}

type MilestoneStorageFilesystem = {
	listMilestones(): Promise<MilestoneRef[]>;
	listArchivedMilestones(): Promise<MilestoneRef[]>;
};

export async function resolveMilestoneInputFromFilesystem(
	milestone: string,
	filesystem: MilestoneStorageFilesystem,
): Promise<string> {
	const [activeMilestones, archivedMilestones] = await Promise.all([
		filesystem.listMilestones(),
		filesystem.listArchivedMilestones(),
	]);
	return resolveMilestoneInputForStorage(milestone, activeMilestones, archivedMilestones);
}
