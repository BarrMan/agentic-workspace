import type { Dirent } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseMarkdown, parseTask, TaskDependenciesParseError } from "../markdown/parser.ts";
import type { Task } from "../types/index.ts";
import { AmbiguousIdError } from "./entity-id.ts";
import { buildFilenameIdRegex, DRAFT_PREFIX, escapeRegex, normalizeId } from "./prefix-config.ts";
import { canonicalTaskId, normalizeTaskId, taskIdsEqual } from "./task-id.ts";

export { canonicalTaskId, normalizeTaskId, taskIdsEqual } from "./task-id.ts";

// Interface for task path resolution context
interface TaskPathContext {
	filesystem: {
		tasksDir: string;
		completedDir?: string;
	};
}

const TASK_FILENAME_ID_PATTERN = /^([a-zA-Z]+)-([a-zA-Z0-9]+(?:[._-][a-zA-Z0-9]+)*) -/;

export function normalizeTaskIdentity(task: Task): Task {
	const normalizedId = normalizeTaskId(task.id);
	const normalizedParent = task.parentTaskId ? normalizeTaskId(task.parentTaskId) : undefined;

	if (normalizedId === task.id && normalizedParent === task.parentTaskId) {
		return task;
	}

	return {
		...task,
		id: normalizedId,
		parentTaskId: normalizedParent,
	};
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
		super(
			"Task",
			canonicalTaskId(taskId),
			candidates,
			"Run 'agentic-workspace doctor' to review the duplicate task IDs.",
		);
		this.name = "AmbiguousTaskIdError";
		this.taskId = taskId;
	}
}

export function isAmbiguousTaskIdError(error: unknown): error is AmbiguousTaskIdError {
	return error instanceof AmbiguousTaskIdError;
}

/**
 * Extracts the task ID from a filename.
 *
 * @param filename - The filename to extract from (e.g., "task-123 - Some Title.md")
 * @returns The normalized task ID, or null if not found
 *
 * @example
 * extractTaskIdFromFilename("task-123 - Title.md") // => "task-123"
 * extractTaskIdFromFilename("JIRA-456 - Title.md") // => "JIRA-456"
 */
export function extractTaskIdFromFilename(filename: string): string | null {
	const match = filename.match(TASK_FILENAME_ID_PATTERN);
	const prefix = match?.[1];
	const body = match?.[2];
	if (!prefix || !body) return null;
	return normalizeTaskId(`${prefix}-${body}`, prefix);
}

/**
 * Get the file path for a task by ID.
 * For numeric-only IDs, automatically detects the prefix from existing files.
 */
export async function getTaskPath(taskId: string, context: TaskPathContext): Promise<string | null> {
	const activeMatches = await findMatchingTaskPaths(context.filesystem.tasksDir, taskId);
	const completedMatches = context.filesystem.completedDir
		? await findMatchingTaskPaths(context.filesystem.completedDir, taskId)
		: [];
	const allMatches = [...activeMatches, ...completedMatches];
	if (allMatches.length > 1) {
		throw new AmbiguousTaskIdError(taskId, allMatches);
	}
	return activeMatches[0] ?? null;
}

async function findMatchingTaskPaths(directory: string, taskId: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
	const flatMatch = entries.find((entry) => {
		const fileTaskId = entry.isFile()
			? (extractTaskIdFromFilename(entry.name) ??
				entry.name.match(/^([a-z]+-[a-z0-9]+(?:[._-][a-z0-9]+)*)\.md$/i)?.[1] ??
				null)
			: null;
		return fileTaskId !== null && taskIdsEqual(taskId, fileTaskId);
	});
	if (flatMatch)
		throw new Error(
			`Task ${taskId} is stored in an unsupported flat layout (${join(directory, flatMatch.name)}). Manually convert <name>.md to <lowercase-id>/task.md, set frontmatter id to match the directory name, and set task_schema_version to 3.`,
		);
	const containerMatches: string[] = [];
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const { name } = entry;
		const record = join(directory, name, "task.md");
		try {
			await access(record);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		const content = await Bun.file(record).text();
		let id: string;
		try {
			id = parseTask(content).id;
		} catch (error) {
			if (!(error instanceof TaskDependenciesParseError)) throw error;
			id = String(parseMarkdown(content).frontmatter.id ?? "");
		}
		if (normalizeTaskId(id).toLowerCase() === name && taskIdsEqual(taskId, id)) containerMatches.push(record);
	}
	return containerMatches.sort((a, b) => a.localeCompare(b));
}
/**
 * Normalize a draft ID by ensuring the draft prefix is present (uppercase).
 */
function normalizeDraftId(draftId: string): string {
	return normalizeId(draftId, DRAFT_PREFIX);
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
 * leading zeros within every numeric segment, including dotted subtask segments. "draft-1",
 * "DRAFT-01", and "draft-1" collapse together; "draft-1.1" and "draft-1.01" collapse together.
 * Every consumer that groups, matches, or compares draft identities must go through this.
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
 * Groups draft filenames by their canonical numeric identity (see {@link draftIdentityKey}) and
 * returns every group that claims more than one file (e.g. "draft-1 - A.md" alongside
 * "draft-01 - B.md", or "draft-1.1 - A.md" alongside "draft-1.01 - B.md"). Such sets must never
 * be offered as separate selectable choices.
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

/**
 * Compares two draft IDs for equality through {@link draftIdentityKey}.
 */
function draftIdsEqual(left: string, right: string): boolean {
	return draftIdentityKey(left) === draftIdentityKey(right);
}

/**
 * Get the filename (without directory) for a task by ID.
 * For numeric-only IDs, automatically detects the prefix from existing files.
 */
export async function getTaskFilename(taskId: string, context: TaskPathContext): Promise<string | null> {
	const path = await getTaskPath(taskId, context);
	return path ? basename(path) : null;
}

/**
 * Check if a task file exists
 */
export async function taskFileExists(taskId: string, context: TaskPathContext): Promise<boolean> {
	const path = await getTaskPath(taskId, context);
	return path !== null;
}
