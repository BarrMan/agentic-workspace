import { basename, dirname } from "node:path";
import { DEFAULT_DONE_STATUS, DEFAULT_STATUSES } from "../constants/index.ts";
import type { DraftFileReference } from "../file-system/operations.ts";
import { removeTaskWorktree } from "../git/task-worktree.ts";
import type { TaskWorktreeSessionCleanup } from "../git/task-worktree-cleanup.ts";
import type { Task, TaskUpdateInput } from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import { withoutVacatedTaskLinks } from "../utils/task-links.ts";
import { getTerminalStatus, isTerminalStatus } from "../utils/terminal-status.ts";
import type { VacatedTaskResult } from "./agentic-workspace.ts";
import type { Storage } from "./storage.ts";
import type { ProjectTaskMutations } from "./task-mutation-service.ts";
import type { TaskReadOptions } from "./task-query-workflow.ts";
import { markVacatedTaskMoved, type VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";

export class TaskArchiveStatusError extends Error {
	constructor(taskId: string, terminalStatus: string) {
		super(
			`Task ${taskId} is ${terminalStatus}. Use Complete to move finished work to completed storage and preserve its links. Use: agentic-workspace task complete ${taskId}`,
		);
		this.name = "TaskArchiveStatusError";
	}
}

export interface TaskEditLifecycleResult {
	task: Task;
	cleanedTaskIds: string[];
}

/** Owns task and draft transitions, including vacated-ID cleanup. */
export class TaskLifecycleService {
	constructor(
		private readonly storage: Storage,
		private readonly mutations: ProjectTaskMutations,
		private readonly vacatedTaskReferences: VacatedTaskReferenceService,
		private readonly cleanupTaskSessions?: TaskWorktreeSessionCleanup,
		private readonly remapTaskSessionIdentity?: (oldTaskId: string, newTaskId: string) => Promise<void>,
		private readonly forgetTaskSessions?: (taskId: string) => Promise<void>,
	) {}

	async promoteDraftWithUpdates(reference: DraftFileReference, input: TaskUpdateInput): Promise<Task> {
		const targetStatus = input.status?.trim();
		if (!targetStatus || targetStatus.toLowerCase() === "draft") {
			throw new Error("Promoting a draft requires a non-draft status.");
		}

		const canonicalStatus = await this.mutations.requireCanonicalStatus(targetStatus);
		return await this.storage.withDraftLock(reference, async () => {
			const current = await this.storage.draftReferenceFromPath(reference.filePath);
			const draft = current.task;
			draft.id = reference.canonicalId;
			const { mutated } = await this.mutations.applyTaskUpdateInput(
				draft,
				{ ...input, status: undefined },
				async (status) => {
					if (status.trim().toLowerCase() !== "draft") throw new Error("Drafts must use status Draft.");
					return "Draft";
				},
			);
			draft.status = canonicalStatus;
			if (mutated || current.task.status !== canonicalStatus) draft.updatedDate = formatStoredDate();

			// Persist to the selected draft container before the filesystem transition moves it.
			await this.storage.saveDraft(draft);
			const existingTaskIds = new Set((await this.storage.loadTasks()).map((task) => task.id));
			if (
				!(await this.storage.promoteDraft(
					reference.canonicalId,
					async (promoted) => {
						await this.mutations.applyTaskUpdateInput(
							promoted,
							{ dependencies: promoted.dependencies },
							async () => promoted.status,
						);
					},
					() => this.mutations.generateNextId(),
				))
			) {
				throw new Error(`Could not promote draft ${reference.canonicalId}.`);
			}
			const promoted = (await this.storage.loadTasks()).find((task) => !existingTaskIds.has(task.id));
			if (!promoted) throw new Error(`Promoted task for draft ${reference.canonicalId} could not be loaded.`);
			await this.remapTaskSessionIdentity?.(reference.canonicalId, promoted.id);
			return promoted;
		});
	}

	async demoteTaskWithUpdates(
		task: Task,
		input: TaskUpdateInput,
		options: TaskReadOptions = {},
	): Promise<TaskEditLifecycleResult> {
		return await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (cleanup) => {
			const current = await this.mutations.loadTaskForMutation(task.id, options);
			if (!current) throw new Error(`Task not found: ${task.id}`);
			const { mutated } = await this.mutations.applyTaskUpdateInput(
				current,
				{ ...input, status: undefined },
				async (status) => {
					return status.trim().toLowerCase() === "draft"
						? "Draft"
						: await this.mutations.requireCanonicalStatus(status);
				},
			);
			const vacating = withoutVacatedTaskLinks(current, current.id) ?? current;
			vacating.status = "Draft";
			if (mutated || current.status !== "Draft") vacating.updatedDate = formatStoredDate();

			// Save the edited record in its existing task container; demoteTask moves that
			// complete container, including artifacts and sidecar, and assigns its new ID.
			await this.storage.saveTask(vacating);
			const existingDraftIds = new Set((await this.storage.loadDrafts()).map((draft) => draft.id));
			if (
				!(await this.storage.demoteTask(current.id, undefined, async (demoted) => {
					await this.mutations.applyTaskUpdateInput(
						demoted,
						{ dependencies: demoted.dependencies },
						async () => demoted.status,
					);
				}))
			) {
				throw new Error(`Could not demote task ${current.id}.`);
			}

			let cleanedTaskIds: string[] = [];
			try {
				const written = await this.vacatedTaskReferences.write(cleanup);
				cleanedTaskIds = written.cleanedTaskIds;
			} catch (error) {
				throw markVacatedTaskMoved(error, "demotionState", "cleanup");
			}
			const demotedDraft = (await this.storage.loadDrafts()).find((draft) => !existingDraftIds.has(draft.id));
			if (!demotedDraft) throw new Error(`Demoted draft for task ${current.id} could not be loaded.`);
			await this.remapTaskSessionIdentity?.(current.id, demotedDraft.id);
			return { task: demotedDraft, cleanedTaskIds };
		});
	}

	async archive(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		const taskToArchive = await this.mutations.loadTaskForMutation(taskId, options);
		if (!taskToArchive) return { success: false, cleanedTaskIds: [] };
		return await this.vacatedTaskReferences.withLockedCleanup(taskToArchive, taskToArchive.id, async (cleanup) => {
			const current = await this.mutations.loadTaskForMutation(taskToArchive.id, options);
			if (!current) return { success: false, cleanedTaskIds: [] };
			const config = await this.storage.loadConfig();
			const statuses = config?.statuses ?? [...DEFAULT_STATUSES];
			if (isTerminalStatus(current.status, statuses)) {
				throw new TaskArchiveStatusError(current.id, getTerminalStatus(statuses) ?? DEFAULT_DONE_STATUS);
			}
			if (!current.filePath) return { success: false, cleanedTaskIds: [] };
			await this.storage.moveTaskToArchive(current);
			try {
				const { cleanedTaskIds } = await this.vacatedTaskReferences.write(cleanup);
				return { success: true, cleanedTaskIds };
			} catch (error) {
				throw markVacatedTaskMoved(error, "archiveState");
			}
		});
	}

	async delete(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		const task = await this.mutations.loadTaskForMutation(taskId, options);
		if (!task) return { success: false, cleanedTaskIds: [] };
		return await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (cleanup) => {
			const current = await this.mutations.loadTaskForMutation(task.id, options);
			if (!current) return { success: false, cleanedTaskIds: [] };
			if (!current.filePath) return { success: false, cleanedTaskIds: [] };
			if (current.filePath !== task.filePath)
				throw new Error(`Task ${task.id} record path changed before deletion; retry the operation.`);
			await this.cleanupTaskSessions?.(current.id);
			await removeTaskWorktree(this.storage.projectRoot, current);
			await this.forgetTaskSessions?.(current.id);
			try {
				await this.storage.deleteTaskContainer(current, true);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") return { success: false, cleanedTaskIds: [] };
				throw error;
			}
			try {
				const { cleanedTaskIds } = await this.vacatedTaskReferences.write(cleanup);
				return { success: true, cleanedTaskIds };
			} catch (error) {
				throw markVacatedTaskMoved(error, "archiveState");
			}
		});
	}

	async promoteDraft(draftId: string): Promise<boolean> {
		const existingTaskIds = new Set((await this.storage.loadTasks()).map((task) => task.id));
		const promoted = await this.storage.promoteDraft(draftId, undefined, () => this.mutations.generateNextId());
		if (!promoted) return false;
		const task = (await this.storage.loadTasks()).find((candidate) => !existingTaskIds.has(candidate.id));
		if (task) await this.remapTaskSessionIdentity?.(draftId, task.id);
		return true;
	}

	async demoteTask(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		const task = await this.mutations.loadTaskForMutation(taskId, options);
		if (!task) return { success: false, cleanedTaskIds: [] };
		const demotion = {
			success: false,
			moved: undefined as { previousPath: string; savedPath: string } | undefined,
			cleanedTaskIds: [] as string[],
		};
		let result: typeof demotion;
		try {
			result = await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (cleanup) => {
				const movedPaths: Array<{ previousPath: string; savedPath: string }> = [];
				const success = await this.storage.demoteTask(task.id, (previousPath, savedPath) => {
					movedPaths.push({ previousPath, savedPath });
				});
				demotion.success = success;
				demotion.moved = movedPaths[0];
				if (success && movedPaths[0])
					await this.remapTaskSessionIdentity?.(task.id, basename(dirname(movedPaths[0].savedPath)));
				if (success) {
					try {
						const written = await this.vacatedTaskReferences.write(cleanup);
						demotion.cleanedTaskIds = written.cleanedTaskIds;
					} catch (error) {
						throw markVacatedTaskMoved(error, "demotionState", "cleanup");
					}
				}
				return demotion;
			});
		} catch (error) {
			if (demotion.success && demotion.moved) throw markVacatedTaskMoved(error, "demotionState");
			throw error;
		}
		return { success: result.success, cleanedTaskIds: result.cleanedTaskIds };
	}

	async complete(taskId: string, options: TaskReadOptions = {}): Promise<boolean> {
		const task = await this.mutations.loadTaskForMutation(taskId, options);
		if (!task) return false;
		if (!task.filePath) return false;
		return await this.storage.withTaskLock(task, async () => {
			const current = await this.mutations.loadTaskForMutation(task.id, options);
			if (!current) return false;
			if (!current.filePath) return false;
			if (current.filePath !== task.filePath)
				throw new Error(`Task ${task.id} record path changed before completion; retry the operation.`);
			await this.cleanupTaskSessions?.(current.id);
			await removeTaskWorktree(this.storage.projectRoot, current);
			if (!(await this.storage.completeTask(current.id, true))) return false;
			return true;
		});
	}

	async archiveDraft(draftId: string): Promise<boolean> {
		await this.storage.loadConfig();
		const moved = await this.storage.archiveDraft(draftId);
		return moved !== null;
	}

	async getTerminalStatusTasksByAge(olderThanDays: number): Promise<Task[]> {
		const [tasks, config] = await Promise.all([this.storage.loadTasks(), this.storage.loadConfig()]);
		const cutoff = new Date();
		cutoff.setDate(cutoff.getDate() - olderThanDays);
		const statuses = config?.statuses ?? [...DEFAULT_STATUSES];
		return tasks.filter((task) => {
			if (!isTerminalStatus(task.status, statuses)) return false;
			const storedDate = task.updatedDate || task.createdDate;
			return Boolean(storedDate) && new Date(storedDate) < cutoff;
		});
	}
}
