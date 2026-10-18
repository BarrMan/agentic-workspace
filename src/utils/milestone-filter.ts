import Fuse from "fuse.js";

export const NO_MILESTONE_FILTER_VALUE = "\u0000no-milestone";
export const NO_MILESTONE_FILTER_LABEL = "No milestone";

interface MilestoneCandidate {
	value: string;
	compact: string;
}

export function normalizeMilestoneFilterValue(value: string): string {
	const normalizedValue = value.trim().toLowerCase();
	if (!normalizedValue) return normalizedValue;
	const searchableValue = normalizedValue
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.replace(/\s+/g, " ");
	return searchableValue || normalizedValue;
}

function compactMilestoneFilterValue(value: string): string {
	return value.replace(/\s+/g, "");
}

export function createMilestoneFilterMatcher(query: string): (milestoneValue: string) => boolean {
	return (milestoneValue) => milestoneValue === query;
}

export function resolveClosestMilestoneFilterValue(query: string, milestoneValues: string[]): string {
	const normalizedQuery = normalizeMilestoneFilterValue(query);
	if (!normalizedQuery) return normalizedQuery;

	const normalizedCandidates = Array.from(
		new Set(milestoneValues.map((value) => normalizeMilestoneFilterValue(value)).filter(Boolean)),
	).sort((left, right) => left.localeCompare(right));
	if (normalizedCandidates.length === 0 || normalizedCandidates.includes(normalizedQuery)) return normalizedQuery;

	const candidates: MilestoneCandidate[] = normalizedCandidates.map((value) => ({
		value,
		compact: compactMilestoneFilterValue(value),
	}));
	const fuse = new Fuse(candidates, {
		includeScore: true,
		threshold: 0.45,
		ignoreLocation: true,
		minMatchCharLength: 2,
		keys: [
			{ name: "value", weight: 0.7 },
			{ name: "compact", weight: 0.3 },
		],
	});
	const compactQuery = compactMilestoneFilterValue(normalizedQuery);
	return (
		fuse.search(normalizedQuery)[0]?.item.value ??
		(compactQuery ? fuse.search(compactQuery)[0]?.item.value : undefined) ??
		normalizedQuery
	);
}
