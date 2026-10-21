import { DEFAULT_PRIORITIES } from "../constants.ts";
import type { AgenticWorkspaceConfig } from "../types.ts";

type PrioritySource = Pick<AgenticWorkspaceConfig, "priorities"> | readonly string[] | null | undefined;

function labels(source?: PrioritySource): readonly string[] {
	const configured = Array.isArray(source) ? source : source && "priorities" in source ? source.priorities : undefined;
	return configured?.length ? configured : DEFAULT_PRIORITIES;
}

export function getPriorityLabels(source?: PrioritySource): string[] {
	return [...labels(source)];
}

export function resolvePriorityLabel(value: string | null | undefined, source?: PrioritySource): string | undefined {
	const wanted = value ?? "";
	if (!wanted) return undefined;
	const matches = labels(source).filter((label) => label === wanted);
	return matches.length === 1 ? matches[0] : undefined;
}

export function prioritiesEqual(first: string | null | undefined, second: string | null | undefined): boolean {
	return (first ?? "") === (second ?? "");
}

export function getPriorityRank(value: string | null | undefined, source?: PrioritySource): number {
	const index = labels(source).findIndex((label) => prioritiesEqual(label, value));
	return index < 0 ? 0 : labels(source).length - index;
}

export function formatValidPriorityValues(source?: PrioritySource): string {
	return getPriorityLabels(source).join(", ");
}
