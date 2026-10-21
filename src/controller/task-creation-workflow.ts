import { DateTime } from "luxon";
import { DependencyValidator } from "../model/task/dependency-validator.ts";
import { Task as TaskModel } from "../model/task/task.ts";
import type { Task, TaskCreateInput, TaskUpdateInput } from "../model/types.ts";
import type { Core } from "./agentic-workspace.ts";
import { buildCreatedTask, generatedTaskTitle, prepareTaskCreationInput } from "./task-creation-input.ts";

/** Owns one allocation and write transaction against a Core project session. */
export class TaskCreationService {
	constructor(private readonly core: Core) {}

	async create(input: TaskCreateInput): Promise<{ task: Task; filePath?: string }> {
		const prepared = prepareTaskCreationInput(input);
		const createdDate = DateTime.utc().toFormat("yyyy-MM-dd HH:mm");
		const [config, configSnapshot] = await Promise.all([this.core.getStoredConfig(), this.core.getConfig()]);
		const worktreePolicy = configSnapshot.sessionSettings.worktreePerTask ? "enabled" : "disabled";

		let committed:
			| { task: Task; filePath: string; write?: Awaited<ReturnType<Core["prepareCreatedTaskWrite"]>> }
			| undefined;
		try {
			const { task, write } = await this.core.withCreateLock(async () => {
				const parentTaskId = prepared.requestedParentTaskId
					? await this.core.resolveParentTaskIdForCreate(prepared.requestedParentTaskId)
					: undefined;
				const id = await this.core.generateNextId(undefined, parentTaskId);
				const titledInput = prepared.title ? prepared : { ...prepared, title: generatedTaskTitle(id) };
				const draft = buildCreatedTask(input, titledInput, config, {
					id,
					parentTaskId,
					dependencies: [],
					status: "",
					priority: undefined,
					type: undefined,
					project: undefined,
					ordinal: await this.core.resolveCreateOrdinal(input.ordinal),
					createdDate,
				});
				const validated = await new DependencyValidator({
					listTasks: () => this.core.loadTasks(),
					listCompletedTasks: () => this.core.loadCompletedTaskRecords(),
					listArchivedTasks: () => this.core.loadArchivedTaskRecords(),
					loadTask: (taskId) => this.core.getTask(taskId),
				}).validate(prepared.dependencies, draft);
				const model = TaskModel.forUpdate(draft);
				const update: TaskUpdateInput = {
					...(input.status ? { status: input.status } : {}),
					...(input.priority !== undefined ? { priority: input.priority } : {}),
					...(input.type !== undefined ? { type: input.type } : {}),
					...(input.project !== undefined ? { project: input.project } : {}),
					dependencies: prepared.dependencies,
				};
				model.applyUpdate(update, {
					configuration: config,
					projectConfigPath: this.core.projectConfigPath,
					dependencies: { replacement: { input: prepared.dependencies, ...validated } },
				});
				const milestones =
					input.milestone !== undefined && input.milestone.trim() !== "" ? await this.core.loadMilestones() : undefined;
				model.applyUpdate(input.milestone === undefined ? {} : { milestone: input.milestone }, { milestones });
				const task = model.serialize();
				task.worktreePolicy = worktreePolicy;
				const filePath = await this.core.writePreparedTask(task);
				committed = { task, filePath };
				const write = await this.core.prepareCreatedTaskWrite(filePath);
				committed.write = write;
				return { task, write };
			});

			const savedTask = await this.core.finalizeCreatedTask(task);
			const result = savedTask ?? task;
			return { task: result, filePath: write.filePath };
		} catch (error) {
			if (!committed) throw error;
			if (!committed.write) {
				throw new Error(
					`Task ${committed.task.id} was created at ${committed.filePath}, but its recovery receipt could not be prepared. The task was retained; review it before retrying because its ID remains in use.`,
					{ cause: error },
				);
			}
			const rollback = await this.core.rollbackCreatedTask(committed.write).catch((rollbackError) => {
				const message = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
				throw new Error(`Task creation failed and cleanup also failed: ${message}`, { cause: error });
			});
			if (!rollback.workingPathRestored) {
				throw new Error(
					`Task creation failed, and cleanup could not safely remove the changed file at ${committed.filePath}. Your changes were preserved. Review or remove the preserved file before retrying because ${committed.task.id} remains in use.`,
					{ cause: error },
				);
			}
			throw error;
		}
	}
}
