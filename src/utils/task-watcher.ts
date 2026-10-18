import { type FSWatcher, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { Storage } from "../core/storage.ts";
import { resolveMainWorktreeRoot } from "../git/main-worktree.ts";
import type { Task } from "../types/index.ts";
import { isValidTaskId, taskIdsEqual } from "./task-id.ts";

export interface TaskWatcherCallbacks {
	/** Called when a new task file is created */
	onTaskAdded?: (task: Task) => void | Promise<void>;
	/** Called when an existing task file is modified */
	onTaskChanged?: (task: Task) => void | Promise<void>;
	/** Called when a task file is removed */
	onTaskRemoved?: (taskId: string) => void | Promise<void>;
	/** Artifact mutations are separate from task-record changes; consumers should invalidate content/status projections. */
	onArtifactChanged?: (event: { taskId: string; path: string }) => void | Promise<void>;
	onReconciliationIdle?: () => void | Promise<void>;
}

interface TaskReconciliation {
	generation: number;
	processing: boolean;
	pending: boolean;
	hasPublishedState: boolean;
	lastPublishedSignature: string | null;
}

type TaskReadResult = { kind: "retry" } | { kind: "absent" } | { kind: "candidate"; task: Task; signature: string };

type TaskFileSnapshot = { state: "complete"; taskIds: Set<string> } | { state: "incomplete" };

type TaskWatchDecision =
	| { kind: "record"; taskId: string }
	| { kind: "artifact"; taskId: string; path: string }
	| { kind: "directory" }
	| { kind: "ignore" };

const TASK_SETTLE_DELAY_MS = 50;
const TASK_RETRY_DELAY_MS = 35;
const TASK_READ_ATTEMPTS = 8;

function classifyTaskWatchEvent(eventType: string, filename: string | Buffer | null): TaskWatchDecision {
	if (eventType !== "change" && eventType !== "rename") return { kind: "ignore" };
	const fileName = filename?.toString();
	if (!fileName) return { kind: "directory" };
	const segments = fileName.split(/[\\/]/);
	if (segments.length > 1) {
		const [taskId, ...containerSegments] = segments;
		if (containerSegments.join("/") === "task.md" && taskId && isValidTaskId(taskId)) return { kind: "record", taskId };
		const artifactSegments = containerSegments[0] === "artifacts" ? containerSegments.slice(1) : containerSegments;
		const path = artifactSegments.join("/");
		if (
			!taskId ||
			!path ||
			path === "task.md" ||
			path === ".artifacts.json.lock" ||
			artifactSegments.some(
				(part) =>
					part.startsWith(".agentic-workspace-artifact-") ||
					part.startsWith(".agentic-workspace-artifacts-") ||
					part.startsWith(".task-"),
			)
		)
			return { kind: "ignore" };
		if (path === ".artifacts.json" || /\.(?:md|markdown|txt|text)$/i.test(path))
			return { kind: "artifact", taskId, path };
		return { kind: "ignore" };
	}
	// Top-level rename names can identify container changes or be omitted by the platform.
	return { kind: "directory" };
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUsableTask(task: Task | null, taskId: string): task is Task {
	return Boolean(task && taskIdsEqual(task.id, taskId) && task.title.trim() && task.status.trim());
}

function canonicalTask(task: Task): Task {
	return task.id === task.id.toUpperCase() ? task : { ...task, id: task.id.toUpperCase() };
}

/**
 * Identity of a task's content, ignoring where it was read from and when.
 * Re-reading the same task after a write yields the same signature, so consumers can
 * tell a real edit from a watcher echo.
 */
export function taskContentSignature(task: Task): string {
	const { branch: _branch, filePath: _filePath, lastModified: _lastModified, source: _source, ...content } = task;
	return JSON.stringify({ ...content, id: task.id.toUpperCase() });
}

function createReconciliation(initialTask?: Task): TaskReconciliation {
	return {
		generation: 0,
		processing: false,
		pending: false,
		hasPublishedState: initialTask !== undefined,
		lastPublishedSignature: initialTask ? taskContentSignature(initialTask) : null,
	};
}

async function readTaskFileSnapshot(tasksDir: string): Promise<TaskFileSnapshot> {
	try {
		const directory = await stat(tasksDir);
		if (!directory.isDirectory()) return { state: "incomplete" };
		const canonicalFiles = await Array.fromAsync(
			new Bun.Glob("**/task.md").scan({ cwd: tasksDir, followSymlinks: true }),
		);
		await stat(tasksDir);
		const taskIds = new Set<string>();
		for (const file of canonicalFiles) {
			const taskId = basename(dirname(file));
			if (isValidTaskId(taskId)) taskIds.add(taskId.toUpperCase());
		}
		return { state: "complete", taskIds };
	} catch {
		return { state: "incomplete" };
	}
}

async function classifyTaskRead(storage: Storage, taskId: string, tasksDir: string): Promise<TaskReadResult> {
	let task: Task | null;
	try {
		task = await storage.loadTask(taskId);
	} catch {
		return { kind: "retry" };
	}
	if (isUsableTask(task, taskId)) return { kind: "candidate", task, signature: taskContentSignature(task) };
	if (task !== null) return { kind: "retry" };
	const snapshot = await readTaskFileSnapshot(tasksDir);
	return snapshot.state === "complete" && !snapshot.taskIds.has(taskId) ? { kind: "absent" } : { kind: "retry" };
}

async function publishTaskRemoval(
	taskId: string,
	state: TaskReconciliation,
	callbacks: TaskWatcherCallbacks,
): Promise<void> {
	if (state.hasPublishedState && state.lastPublishedSignature === null) return;
	try {
		await callbacks.onTaskRemoved?.(taskId.toUpperCase());
		state.hasPublishedState = true;
		state.lastPublishedSignature = null;
	} catch {
		// Callback failures are bounded by the same finite reconciliation budget.
	}
}

async function publishTaskCandidate(
	task: Task,
	signature: string,
	state: TaskReconciliation,
	callbacks: TaskWatcherCallbacks,
): Promise<boolean> {
	if (state.hasPublishedState && state.lastPublishedSignature === signature) return true;
	try {
		const presentationTask = canonicalTask(task);
		if (!state.hasPublishedState || state.lastPublishedSignature === null)
			await callbacks.onTaskAdded?.(presentationTask);
		else await callbacks.onTaskChanged?.(presentationTask);
		state.hasPublishedState = true;
		state.lastPublishedSignature = signature;
		return true;
	} catch {
		return false;
	}
}

async function reconcileReadResult(
	result: TaskReadResult,
	attempt: number,
	taskId: string,
	state: TaskReconciliation,
	callbacks: TaskWatcherCallbacks,
	previousSignature: string | null | undefined,
): Promise<{ done: boolean; signature: string | null | undefined }> {
	if (result.kind === "retry") return { done: false, signature: previousSignature };
	if (result.kind === "absent") {
		if (attempt === TASK_READ_ATTEMPTS - 1) await publishTaskRemoval(taskId, state, callbacks);
		return { done: attempt === TASK_READ_ATTEMPTS - 1, signature: previousSignature };
	}
	if (result.signature !== previousSignature) return { done: false, signature: result.signature };
	return {
		done: await publishTaskCandidate(result.task, result.signature, state, callbacks),
		signature: previousSignature,
	};
}

async function readDirectoryTasks(
	storage: Storage,
	tasksDir: string,
): Promise<{ taskFileIds: Set<string>; tasks: Task[] } | null> {
	const snapshot = await readTaskFileSnapshot(tasksDir);
	if (snapshot.state === "incomplete") return null;
	try {
		return { taskFileIds: snapshot.taskIds, tasks: await storage.loadTasks() };
	} catch {
		return null;
	}
}

function scheduleVisibleTasks(
	tasks: Task[],
	reconciliations: ReadonlyMap<string, TaskReconciliation>,
	visibleTaskIds: Set<string>,
	schedule: (taskId: string) => void,
): void {
	for (const task of tasks) {
		if (!isUsableTask(task, task.id)) continue;
		const taskId = task.id.toUpperCase();
		visibleTaskIds.add(taskId);
		const state = reconciliations.get(taskId);
		if (!state?.hasPublishedState || state.lastPublishedSignature !== taskContentSignature(task)) schedule(taskId);
	}
}

function scheduleMissingTasks(
	reconciliations: ReadonlyMap<string, TaskReconciliation>,
	visibleTaskIds: ReadonlySet<string>,
	taskFileIds: ReadonlySet<string>,
	schedule: (taskId: string) => void,
): void {
	for (const taskId of reconciliations.keys())
		if (!visibleTaskIds.has(taskId) && !taskFileIds.has(taskId)) schedule(taskId);
}

/**
 * Watch task records and container artifacts separately. Artifact events invalidate projections;
 * task content remains authoritative and is always re-read rather than inferred from timestamps.
 * A single filesystem event is reconciled until task content is stable or absence is
 * confirmed, because atomic writes can make the event visible before the file is.
 */
export function watchTaskRecords(
	storage: Storage,
	callbacks: TaskWatcherCallbacks,
	initialTasks: readonly Task[] = [],
): { stop: () => void } {
	const tasksDir = storage.taskRecordsDirectory;
	const reconciliations = new Map(
		initialTasks.filter((task) => !task.branch).map((task) => [task.id.toUpperCase(), createReconciliation(task)]),
	);
	let stopped = false;
	let directoryGeneration = 0;
	let pendingReconciliations = 0;

	const runReconciliation = async (work: () => Promise<void>): Promise<void> => {
		pendingReconciliations += 1;
		try {
			await work();
		} catch {
			// Reconciliation is best-effort; watcher events may retry failed work.
		} finally {
			pendingReconciliations -= 1;
			if (pendingReconciliations === 0) {
				try {
					await callbacks.onReconciliationIdle?.();
				} catch {}
			}
		}
	};

	const reconcile = async (taskId: string, state: TaskReconciliation, eventGeneration: number): Promise<void> => {
		let previousCandidateSignature: string | null | undefined;

		for (let attempt = 0; attempt < TASK_READ_ATTEMPTS; attempt++) {
			await delay(attempt === 0 ? TASK_SETTLE_DELAY_MS : TASK_RETRY_DELAY_MS);
			if (stopped || eventGeneration !== state.generation) return;

			const result = await classifyTaskRead(storage, taskId, tasksDir);
			const resolution = await reconcileReadResult(
				result,
				attempt,
				taskId,
				state,
				callbacks,
				previousCandidateSignature,
			);
			previousCandidateSignature = resolution.signature;
			if (resolution.done) return;
		}
	};

	const drain = async (taskId: string, state: TaskReconciliation): Promise<void> => {
		if (state.processing) return;
		state.processing = true;
		try {
			do {
				state.pending = false;
				await reconcile(taskId, state, state.generation);
			} while (!stopped && state.pending);
		} finally {
			state.processing = false;
			if (!stopped && state.pending) void runReconciliation(() => drain(taskId, state));
		}
	};

	const schedule = (taskId: string) => {
		const normalizedTaskId = taskId.toUpperCase();
		const state = reconciliations.get(normalizedTaskId) ?? createReconciliation();
		reconciliations.set(normalizedTaskId, state);
		state.generation += 1;
		state.pending = true;
		void runReconciliation(() => drain(normalizedTaskId, state));
	};
	const scheduleDirectoryReconciliation = () => {
		const eventGeneration = ++directoryGeneration;
		const reconcileDirectory = async () => {
			const visibleTaskIds = new Set<string>();
			let taskFileIds: Set<string> | null = null;
			for (let attempt = 0; attempt < TASK_READ_ATTEMPTS; attempt++) {
				await delay(attempt === 0 ? TASK_SETTLE_DELAY_MS : TASK_RETRY_DELAY_MS);
				if (stopped || eventGeneration !== directoryGeneration) return;

				const directoryTasks = await readDirectoryTasks(storage, tasksDir);
				if (!directoryTasks) continue;
				taskFileIds = directoryTasks.taskFileIds;
				visibleTaskIds.clear();
				scheduleVisibleTasks(directoryTasks.tasks, reconciliations, visibleTaskIds, schedule);
			}

			if (stopped || eventGeneration !== directoryGeneration || !taskFileIds) return;
			scheduleMissingTasks(reconciliations, visibleTaskIds, taskFileIds, schedule);
		};
		void runReconciliation(reconcileDirectory);
	};

	const handleWatchEvent = (eventType: string, filename: string | Buffer | null) => {
		const decision = classifyTaskWatchEvent(eventType, filename);
		if (decision.kind === "record") schedule(decision.taskId);
		else if (decision.kind === "artifact")
			void Promise.resolve(callbacks.onArtifactChanged?.({ taskId: decision.taskId, path: decision.path })).catch(
				() => {},
			);
		else if (decision.kind === "directory") scheduleDirectoryReconciliation();
	};
	const watcher: FSWatcher = watch(tasksDir, { recursive: true }, handleWatchEvent);
	let canonicalWatcher: FSWatcher | undefined;
	void resolveMainWorktreeRoot(storage.projectRoot)
		.then((mainRoot) => {
			if (stopped || !mainRoot) return;
			const relativeAgenticWorkspace = tasksDir.slice(storage.projectRoot.length).replace(/^[/\\]+/, "");
			const canonicalTasksDir = `${mainRoot}/${relativeAgenticWorkspace}`;
			if (canonicalTasksDir === tasksDir) return;
			try {
				canonicalWatcher = watch(canonicalTasksDir, { recursive: true }, handleWatchEvent);
				canonicalWatcher.on("error", () => {});
			} catch {}
		})
		.catch(() => {});
	watcher.on("error", (error) => {
		if (process.env.DEBUG) console.warn("Task watcher error", error);
	});

	return {
		stop() {
			stopped = true;
			directoryGeneration += 1;
			for (const state of reconciliations.values()) {
				state.generation += 1;
				state.pending = false;
			}
			try {
				watcher.close();
			} catch {}
			try {
				canonicalWatcher?.close();
			} catch {}
		},
	};
}

/** Controller-owned subscription, kept for callers that already hold a Core. */
export function watchTasks(
	core: import("../core/agentic-workspace.ts").Core,
	callbacks: TaskWatcherCallbacks,
	initialTasks: readonly Task[] = [],
): { stop: () => void } {
	return core.watchTasks(callbacks, initialTasks);
}
