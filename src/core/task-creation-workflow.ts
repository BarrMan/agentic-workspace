import { FALLBACK_STATUS } from "../constants/index.ts";
import { EntityType, type Task, type TaskCreateInput } from "../types/index.ts";
import { formatStoredDate } from "../utils/date.ts";
import type { Core } from "./agentic-workspace.ts";
import { buildCreatedTask, generatedTaskTitle, prepareTaskCreationInput } from "./task-creation-input.ts";

/** Owns one allocation and write transaction against a Core project session. */
export class TaskCreationService {
	constructor(private readonly core: Core) {}

	async create(input: TaskCreateInput): Promise<{ task: Task; filePath?: string }> {
		const prepared = prepareTaskCreationInput(input);
		const requestedStatus = input.status?.trim();
		const status = requestedStatus
			? prepared.isDraft
				? "Draft"
				: await this.core.requireCanonicalStatus(requestedStatus)
			: "";
		const priority = await this.core.normalizePriority(input.priority);
		const type = await this.core.normalizeTaskType(input.type);
		const project = await this.core.normalizeProject(input.project);
		const createdDate = formatStoredDate();
		const config = await this.core.getStoredConfig();
		const configSnapshot = await this.core.getConfig();
		const worktreePolicy = configSnapshot.sessionSettings.worktreePerTask ? "enabled" : "disabled";

		const { task, write } = await this.core.withCreateLock(async () => {
			const parentTaskId = prepared.requestedParentTaskId
				? await this.core.resolveParentTaskIdForCreate(prepared.requestedParentTaskId)
				: undefined;
			const id = await this.core.generateNextId(prepared.isDraft ? EntityType.Draft : EntityType.Task, parentTaskId);
			const titledInput = prepared.title ? prepared : { ...prepared, title: generatedTaskTitle(id) };
			const { valid, invalid } = await this.core.validateTaskDependencies(prepared.dependencies, {
				id,
				title: titledInput.title,
				status: prepared.isDraft ? "Draft" : status || config?.defaultStatus || FALLBACK_STATUS,
				assignee: [],
				createdDate,
				labels: [],
				dependencies: [],
			});
			if (invalid.length > 0) throw this.core.formatMissingDependenciesError(invalid);
			const task = buildCreatedTask(input, titledInput, config, {
				id,
				parentTaskId,
				dependencies: valid,
				status,
				priority,
				type,
				project,
				ordinal: await this.core.resolveCreateOrdinal(input.ordinal, prepared.isDraft),
				createdDate,
			});
			if (!prepared.isDraft) task.worktreePolicy = worktreePolicy;
			const filePath = await this.core.writePreparedTask(task, prepared.isDraft);
			return { task, write: await this.core.prepareCreatedTaskWrite(filePath) };
		});

		try {
			const savedTask = await this.core.finalizeCreatedTask(task, prepared.isDraft);
			const result = savedTask ?? task;
			return { task: result, filePath: write.filePath };
		} catch (error) {
			const rollback = await this.core.rollbackCreatedTask(write).catch((rollbackError) => {
				const message = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
				throw new Error(`Task creation failed and cleanup also failed: ${message}`, { cause: error });
			});
			if (!rollback.workingPathRestored) {
				throw new Error(
					`Task creation failed, and cleanup could not safely remove the changed file at ${write.filePath}. Your changes were preserved. Review or remove the preserved file before retrying because ${task.id} remains in use.`,
					{ cause: error },
				);
			}
			throw error;
		}
	}
}
