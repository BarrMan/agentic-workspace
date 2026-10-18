import { AmbiguousIdError } from "./entity-id.ts";
import { buildFilenameIdRegex, DRAFT_PREFIX, escapeRegex } from "./prefix-config.ts";
import { taskIdKey } from "./task-id.ts";

interface TaskPathContext {
	findTaskRecordPath(taskId: string): Promise<string | null>;
}

/**
 * Appended to a task not-found message produced by a working-copy lookup.
 *
 * Task lookups deliberately stay local, so a miss is not proof the ID is unused. The hint is a
 * fixed sentence rather than a branch scan, because scanning branches is the cost local lookups
 * exist to avoid.
 */
export const LOCAL_TASK_LOOKUP_HINT =
	"Task lookups read only the local working copy; use 'agentic-workspace board' to see tasks from other branches.";

export class AmbiguousTaskIdError extends AmbiguousIdError {
	readonly taskId: string;

	constructor(taskId: string, candidates: string[]) {
		super("Task", taskId, candidates, "Remove the conflicting files, then retry.");
		this.name = "AmbiguousTaskIdError";
		this.taskId = taskId;
	}
}

export function isAmbiguousTaskIdError(error: unknown): error is AmbiguousTaskIdError {
	return error instanceof AmbiguousTaskIdError;
}

/** Resolve the canonical active record path for an exact task ID through Storage. */
export async function getTaskPath(taskId: string, context: TaskPathContext): Promise<string | null> {
	return await context.findTaskRecordPath(taskId);
}

/**
 * Normalize a draft ID by ensuring the draft prefix is present (uppercase).
 */
export function normalizeDraftId(draftId: string): string {
	const key = taskIdKey(draftId);
	const prefix = `${DRAFT_PREFIX.toUpperCase()}-`;
	return key.startsWith(prefix) ? key : `${prefix}${key}`;
}

/**
 * Checks if an input ID matches a filename loosely for drafts.
 * Loose means case-insensitive with leading zeros ignored, the same rule
 * used to collect filename-derived draft identity candidates.
 */
export function draftIdsMatchLoosely(inputId: string, filename: string): boolean {
	const candidate = extractDraftIdFromFilename(filename);
	if (!candidate) return false;
	return draftIdsEqual(inputId, candidate);
}

/**
 * Extracts the draft ID from a filename.
 */
export function extractDraftIdFromFilename(filename: string): string | null {
	const regex = buildFilenameIdRegex(DRAFT_PREFIX);
	const match = filename.match(regex);
	if (!match?.[1]) return null;
	return normalizeDraftId(`${DRAFT_PREFIX}-${match[1]}`);
}

/**
 * The one canonicalization authority for draft identity keys: lowercases the prefix and strips
 * leading zeros within every numeric segment, including dotted subtask segments.
 */
function draftIdentityKey(id: string): string {
	const trimmed = id.trim().toLowerCase();
	const match = trimmed.match(new RegExp(`^(?:${escapeRegex(DRAFT_PREFIX)}-)?(\\d+(?:\\.\\d+)*)$`));
	if (!match?.[1]) return trimmed;
	const body = match[1]
		.split(".")
		.map((segment) => segment.replace(/^0+(?=\d)/, "") || "0")
		.join(".");
	return `${DRAFT_PREFIX}-${body}`;
}

/**
 * Groups draft filenames by their canonical numeric identity and returns every group that
 * claims more than one file.
 */
export function findDuplicateDraftFilenameGroups(filenames: readonly string[]): string[][] {
	const groups = new Map<string, string[]>();
	for (const filename of filenames) {
		const declared = extractDraftIdFromFilename(filename);
		if (!declared) continue;
		const key = draftIdentityKey(declared);
		const group = groups.get(key) ?? [];
		group.push(filename);
		groups.set(key, group);
	}
	return [...groups.values()].filter((group) => group.length > 1).map((group) => group.sort());
}

function draftIdsEqual(left: string, right: string): boolean {
	return draftIdentityKey(left) === draftIdentityKey(right);
}
