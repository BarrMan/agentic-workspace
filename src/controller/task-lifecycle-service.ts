import { removeTaskWorktree } from "../filesystem/git/task-worktree.ts";
import type { TaskWorktreeSessionCleanup } from "../filesystem/git/task-worktree-cleanup.ts";
import { DEFAULT_DONE_STATUS, DEFAULT_STATUSES } from "../model/constants.ts";
import { getTerminalStatus, isTerminalStatus } from "../model/task/terminal-status.ts";
import type { Task } from "../model/types.ts";
import type { Storage } from "../storage/storage.ts";
import type { VacatedTaskResult } from "./agentic-workspace.ts";
import { TaskArchiveStatusError } from "./errors/tasks.ts";
import type { CommittedTaskChange, ProjectTaskMutations } from "./task-mutation-service.ts";
import type { TaskReadOptions } from "./task-query-workflow.ts";
import { markVacatedTaskMoved, type VacatedTaskReferenceService } from "./vacated-task-reference-service.ts";

/** Owns task lifecycle transitions, including vacated-ID cleanup. */
export class TaskLifecycleService {
	constructor(
		private readonly storage: Storage,
		private readonly mutations: ProjectTaskMutations,
		private readonly vacatedTaskReferences: VacatedTaskReferenceService,
		private readonly cleanupTaskSessions: TaskWorktreeSessionCleanup,
		private readonly forgetTaskSessions: (taskId: string) => Promise<void>,
		private readonly assertTaskSessionsStopped: (taskId: string) => Promise<void>,
	) {}

	private async withRelease<T>(release: () => Promise<void>, operation: () => Promise<T>): Promise<T> {
		let result: T | undefined;
		let primary: unknown;
		let releaseError: unknown;
		try {
			result = await operation();
		} catch (error) {
			primary = error;
		}
		try {
			await release();
		} catch (error) {
			releaseError = error;
		}
		if (releaseError !== undefined)
			throw new AggregateError(
				[...(primary === undefined ? [] : [primary]), releaseError],
				"Task admission release failed.",
				{
					cause: primary,
				},
			);
		if (primary !== undefined) throw primary;
		return result as T;
	}

	async archive(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.mutations.withPostCommit(async (changes) => {
			const release = await this.storage.claimTaskAdmission(taskId);
			return this.withRelease(release, async () => {
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
					await this.assertTaskSessionsStopped(current.id);
					await this.storage.moveTaskToArchive(current);
					changes.push({ task: current.id });
					try {
						const cleanedTaskIds = await this.writeReferenceCleanup(cleanup, changes);
						return { success: true, cleanedTaskIds };
					} catch (error) {
						throw markVacatedTaskMoved(error, "archiveState");
					}
				});
			});
		});
	}

	async delete(taskId: string, options: TaskReadOptions = {}): Promise<VacatedTaskResult> {
		return await this.mutations.withPostCommit(async (changes) => {
			const release = await this.storage.claimTaskAdmission(taskId);
			return this.withRelease(release, async () => {
				const task = await this.mutations.loadTaskForMutation(taskId, options);
				if (!task) return { success: false, cleanedTaskIds: [] };
				return await this.vacatedTaskReferences.withLockedCleanup(task, task.id, async (cleanup) => {
					const current = await this.mutations.loadTaskForMutation(task.id, options);
					if (!current) return { success: false, cleanedTaskIds: [] };
					if (!current.filePath) return { success: false, cleanedTaskIds: [] };
					if (current.filePath !== task.filePath)
						throw new Error(`Task ${task.id} record path changed before deletion; retry the operation.`);
					await this.cleanupTaskSessions(current.id);
					await removeTaskWorktree(this.storage.projectRoot, current);
					await this.forgetTaskSessions(current.id);
					try {
						await this.storage.deleteTaskContainer(current, true);
						changes.push({ task: current.id });
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code === "ENOENT") return { success: false, cleanedTaskIds: [] };
						throw error;
					}
					try {
						const cleanedTaskIds = await this.writeReferenceCleanup(cleanup, changes);
						return { success: true, cleanedTaskIds };
					} catch (error) {
						throw markVacatedTaskMoved(error, "archiveState");
					}
				});
			});
		});
	}

	async complete(taskId: string, options: TaskReadOptions = {}): Promise<boolean> {
		return await this.mutations.withPostCommit(async (changes) => {
			const release = await this.storage.claimTaskAdmission(taskId);
			return this.withRelease(release, async () => {
				const task = await this.mutations.loadTaskForMutation(taskId, options);
				if (!task) return false;
				if (!task.filePath) return false;
				return await this.storage.withTaskLock(task, async () => {
					const current = await this.mutations.loadTaskForMutation(task.id, options);
					if (!current) return false;
					if (!current.filePath) return false;
					if (current.filePath !== task.filePath)
						throw new Error(`Task ${task.id} record path changed before completion; retry the operation.`);
					await this.cleanupTaskSessions(current.id);
					await removeTaskWorktree(this.storage.projectRoot, current);
					if (!(await this.storage.completeTask(current.id, true))) return false;
					changes.push({ task: current.id });
					return true;
				});
			});
		});
	}

	private async writeReferenceCleanup(
		cleanup: Parameters<VacatedTaskReferenceService["write"]>[0],
		changes: CommittedTaskChange[],
	): Promise<string[]> {
		const cleanedTaskIds: string[] = [];
		for (const kind of ["active", "completed"] as const) {
			for (const task of cleanup[kind]) {
				await this.vacatedTaskReferences.write({ active: [], completed: [], [kind]: [task] });
				changes.push({ task: task.id });
				cleanedTaskIds.push(task.id);
			}
		}
		return cleanedTaskIds;
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
