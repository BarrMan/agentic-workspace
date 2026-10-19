import { comparisonKey } from "../../lib/comparison-key.ts";
import type { Task } from "../types.ts";

export function labelComparisonKey(label: string): string {
	return comparisonKey(label);
}

function compareCodeUnits(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

/**
 * Collect available labels from configuration and tasks, de-duplicated and sorted
 * alphabetically while preserving the first-seen casing so UI surfaces familiar labels.
 */
export function collectAvailableLabels(tasks: Task[], configured: string[] = []): string[] {
	const seen = new Set<string>();
	const ordered: string[] = [];

	const addLabel = (label: string | undefined) => {
		if (!label) return;
		const normalized = labelComparisonKey(label);
		if (normalized.length === 0) return;
		if (seen.has(normalized)) return;
		seen.add(normalized);
		ordered.push(label);
	};

	for (const label of configured) {
		addLabel(label);
	}

	for (const task of tasks) {
		for (const label of task.labels || []) {
			addLabel(label);
		}
	}

	return ordered.sort((left, right) => {
		const leftKey = labelComparisonKey(left).normalize("NFD");
		const rightKey = labelComparisonKey(right).normalize("NFD");
		const result = compareCodeUnits(leftKey, rightKey);
		return result !== 0 ? result : compareCodeUnits(left, right);
	});
}
