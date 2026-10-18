import { basename } from "node:path";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { parseTaskId } from "./task-id.ts";

function numericIdBody(value: string, prefix: string): string | null {
	const parsed = parseTaskId(value, prefix);
	return parsed?.segments.length === 1 ? (parsed.segments[0] ?? null) : null;
}

export function numericIdFromFilename(file: string, prefix: string): string | null {
	const filename = basename(file);
	if (!filename.endsWith(".md")) return null;
	const stem = filename.substring(0, filename.length - ".md".length);
	const separator = stem.indexOf(" - ");
	return numericIdBody(separator === -1 ? stem : stem.substring(0, separator), prefix);
}

export function nextId(ids: readonly string[], prefix: string, padding: unknown): string {
	let max = 0;
	for (const id of ids) {
		const body = numericIdBody(id, prefix);
		if (body !== null) max = Math.max(max, Number.parseInt(body, 10));
	}
	const next = max + 1;
	return `${prefix}-${typeof padding === "number" && padding > 0 ? String(next).padStart(padding, "0") : next}`;
}

export function nextDecisionId(
	config: AgenticWorkspaceConfig | null,
	localDecisionIds: readonly string[],
	branchDecisionIds: readonly string[],
): string {
	return nextId([...branchDecisionIds, ...localDecisionIds], "decision", config?.zeroPaddedIds);
}
