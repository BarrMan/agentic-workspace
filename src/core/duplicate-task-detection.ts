import { basename, dirname, relative, sep } from "node:path";
import { parseTask } from "../markdown/parser.ts";
import type { Task } from "../types/index.ts";
import { type DuplicateGroup, detectDuplicateTaskIds } from "../utils/duplicate-detection.ts";
import type { Core } from "./agentic-workspace.ts";
import type { BranchTaskStateEntry, TaskCorpusSnapshot } from "./task-loader.ts";

export interface CrossBranchDuplicateLocation {
	branch: string;
	path: string;
	state: "active" | "completed";
}

export interface CrossBranchDuplicateFinding {
	id: string;
	locations: CrossBranchDuplicateLocation[];
}

function normalizeRelativePath(rootDir: string, path: string): string {
	return relative(rootDir, path).split(sep).join("/");
}

function withLocation(task: Task, location: "active" | "completed", rootDir: string): Task {
	return {
		...task,
		filePath: task.filePath ? normalizeRelativePath(rootDir, task.filePath) : undefined,
		source: location === "completed" ? "completed" : "local",
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export async function findLocalDuplicateTaskIds(core: Core, snapshot?: TaskCorpusSnapshot): Promise<DuplicateGroup[]> {
	let activeTasks: Task[] = snapshot?.activeTasks ?? [];
	let completedTasks: Task[] = snapshot?.completedTasks ?? [];
	if (!snapshot) {
		try {
			[activeTasks, completedTasks] = await Promise.all([
				core.filesystem.listTasks(),
				core.filesystem.listCompletedTasks(),
			]);
		} catch {
			// The direct record scan below can still diagnose well-formed canonical records individually.
		}
	}
	const tasks = [
		...activeTasks.map((task) => withLocation(task, "active", core.filesystem.rootDir)),
		...completedTasks.map((task) => withLocation(task, "completed", core.filesystem.rootDir)),
	];
	for (const [root, location] of [
		[core.filesystem.tasksDir, "active"],
		[core.filesystem.completedDir, "completed"],
	] as const) {
		for await (const path of new Bun.Glob("*/task.md").scan({ cwd: root, absolute: true })) {
			let task: Task;
			try {
				const content = await Bun.file(path).text();
				task = withLocation(parseTask(content), location, core.filesystem.rootDir);
			} catch (error) {
				console.warn(
					`Skipping unreadable or unparseable task record ${normalizeRelativePath(core.filesystem.rootDir, path)}: ${errorMessage(error)}`,
				);
				continue;
			}
			task.filePath = normalizeRelativePath(core.filesystem.rootDir, path);
			const folderId = basename(dirname(path))
				.split(" - ", 1)[0]
				?.replace(/^task-/i, "");
			if (!folderId || folderId !== task.id) {
				(task as Task & { containerMismatch?: string }).containerMismatch =
					`${task.filePath}: container identity does not match task ID ${task.id}.`;
			}
			if (!tasks.some((candidate) => candidate.filePath === task.filePath)) tasks.push(task);
		}
	}
	return detectDuplicateTaskIds(tasks);
}

function logicalBranchTaskPath(path: string, id: string): string {
	const filename = basename(path).toLowerCase();
	const separatorIndex = filename.indexOf(" - ");
	if (separatorIndex < 0) return path.toLowerCase().split(sep).join("/");
	return `${id.toLowerCase()}${filename.slice(separatorIndex)}`;
}

function appendCurrentBranchEntries(
	entries: BranchTaskStateEntry[],
	tasks: Task[],
	type: "task" | "completed",
	branch: string,
	rootDir: string,
): void {
	for (const task of tasks) {
		if (!task.filePath) continue;
		entries.push({
			id: task.id,
			type,
			branch,
			path: normalizeRelativePath(rootDir, task.filePath),
			lastModified: task.updatedDate ? new Date(task.updatedDate) : new Date(0),
		});
	}
}

function groupBranchEntries(entries: BranchTaskStateEntry[]): Map<string, BranchTaskStateEntry[]> {
	const byId = new Map<string, BranchTaskStateEntry[]>();
	for (const entry of entries) {
		if (entry.type !== "task" && entry.type !== "completed") continue;
		const id = entry.id;
		byId.set(id, [...(byId.get(id) ?? []), entry]);
	}
	return byId;
}

function classifyCrossBranchDuplicate(
	id: string,
	entries: BranchTaskStateEntry[],
): CrossBranchDuplicateFinding | undefined {
	const logicalPaths = new Set(entries.map((entry) => logicalBranchTaskPath(entry.path, entry.id)));
	if (logicalPaths.size < 2 || new Set(entries.map((entry) => entry.branch)).size < 2) return undefined;
	const locations = entries
		.map((entry) => ({
			branch: entry.branch,
			path: entry.path.split(sep).join("/"),
			state: entry.type === "completed" ? ("completed" as const) : ("active" as const),
		}))
		.sort((left, right) => `${left.branch}:${left.path}`.localeCompare(`${right.branch}:${right.path}`));
	return { id, locations };
}

export async function findCrossBranchDuplicateTaskIds(
	core: Core,
	snapshot?: TaskCorpusSnapshot,
): Promise<CrossBranchDuplicateFinding[]> {
	const corpus = snapshot ?? (await core.loadTaskSnapshot());
	const config = corpus.config ?? (await core.filesystem.loadConfig());
	if (config?.checkActiveBranches === false) return [];
	const stateEntries: BranchTaskStateEntry[] = corpus.branchStateEntries?.slice() ?? [];
	const current = (await core.git.getCurrentBranch()) ?? "current";
	appendCurrentBranchEntries(stateEntries, corpus.activeTasks, "task", current, core.filesystem.rootDir);
	appendCurrentBranchEntries(stateEntries, corpus.completedTasks, "completed", current, core.filesystem.rootDir);
	return [...groupBranchEntries(stateEntries)]
		.flatMap(([id, entries]) => {
			const finding = classifyCrossBranchDuplicate(id, entries);
			return finding ? [finding] : [];
		})
		.sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }));
}
