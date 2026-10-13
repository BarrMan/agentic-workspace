import type { Milestone } from "../types/index.ts";
import { collectMilestoneAliasKeys, milestoneKey, normalizeMilestoneName } from "./milestones.ts";

function lookupKeys(value: string): string[] {
	return [...collectMilestoneAliasKeys(value)];
}

function hasMatchingId(id: string, keys: Set<string>): boolean {
	return lookupKeys(id).some((key) => keys.has(key));
}

function findMatchingId(value: string, milestones: Milestone[]): Milestone | undefined {
	const normalized = normalizeMilestoneName(value);
	const exact = milestones.find((milestone) => milestoneKey(milestone.id) === milestoneKey(normalized));
	if (exact) return exact;
	const match = normalized.match(/^(?:m-)?(\d+)$/i);
	if (match?.[1]) {
		const canonical = `m-${String(Number.parseInt(match[1], 10))}`;
		const canonicalMatch = milestones.find((milestone) => milestoneKey(milestone.id) === canonical);
		if (canonicalMatch) return canonicalMatch;
	}
	const keys = new Set(lookupKeys(value));
	return milestones.find((milestone) => hasMatchingId(milestone.id, keys));
}

export function findActiveMilestoneByAlias(value: string, milestones: Milestone[]): Milestone | undefined {
	const normalized = normalizeMilestoneName(value);
	const key = milestoneKey(normalized);
	if (!key) return undefined;
	const idMatch = findMatchingId(normalized, milestones);
	const titleMatches = milestones.filter((milestone) => milestoneKey(milestone.title) === key);
	return /^m-\d+$/i.test(normalized) || /^\d+$/.test(normalized)
		? (idMatch ?? (titleMatches.length === 1 ? titleMatches[0] : undefined))
		: ((titleMatches.length === 1 ? titleMatches[0] : undefined) ?? idMatch);
}

export function buildMilestoneMatchKeys(value: string, milestones: Milestone[]): Set<string> {
	const keys = new Set(lookupKeys(value));
	const idMatch = findMatchingId(value, milestones);
	if (idMatch) return keys;
	const titleMatches = milestones.filter((milestone) => milestoneKey(milestone.title) === milestoneKey(value));
	const titleMatch = titleMatches.length === 1 ? titleMatches[0] : undefined;
	if (titleMatch) {
		for (const key of lookupKeys(titleMatch.id)) keys.add(key);
	}
	return keys;
}

export function keySetsIntersect(left: Set<string>, right: Set<string>): boolean {
	return [...left].some((key) => right.has(key));
}
