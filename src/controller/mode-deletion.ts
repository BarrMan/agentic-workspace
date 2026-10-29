import { removeMode } from "../model/session/config.ts";
import type { ModeId } from "../model/session/types.ts";
import type { Storage } from "../storage/storage.ts";
import { type AgentConfigurationController, updateAgentConfiguration } from "./agent-configuration.ts";
import type { Core } from "./agentic-workspace.ts";

type ModeDeletionController = AgentConfigurationController &
	Pick<
		Core,
		| "getExactAgentConfiguration"
		| "getProjectModeCatalog"
		| "signals"
		| "prepareTaskStop"
		| "moveModeSessions"
		| "discardModeSessions"
		| "forgetModeSessions"
	>;

export class ModeDeletionWorkflow {
	constructor(
		private readonly storage: Storage,
		private readonly controller: ModeDeletionController,
	) {}

	async deleteMode(
		modeId: ModeId,
		options: { confirmed: true; moveToModeId?: ModeId },
	): Promise<{ deletedModeId: ModeId; taskIds: string[] }> {
		if (!options.confirmed) throw new Error("Mode deletion requires explicit confirmation.");
		const prepared: Array<{
			taskId: string;
			record: { id: string };
			stop: () => Promise<void>;
			release: () => Promise<void>;
		}> = [];
		const completed: string[] = [];
		const stopped: Array<{ taskId: string; sessionId: string }> = [];
		const notificationFailures: unknown[] = [];
		let primary: Error | undefined;
		const partialEffectsMessage = () =>
			`Mode deletion failed after stopping sessions: ${stopped.map(({ taskId, sessionId }) => `${taskId}/${sessionId}`).join(", ") || "none"}; ${options.moveToModeId ? "transferred" : "removed"} sessions from: ${completed.join(", ") || "none"}.`;
		try {
			await this.storage.modeDeletionJournal.withLock(async () => {
				if (await this.storage.modeDeletionJournal.read())
					throw new Error("A mode deletion is pending; preserve its journal and recover it before another deletion.");
				const modeCatalog = await this.controller.getProjectModeCatalog();
				if (!modeCatalog.profiles[modeId]) throw new Error(`Unknown mode '${modeId}'.`);
				if (modeCatalog.order.length <= 1) throw new Error("Cannot delete the last configured mode.");
				const destination = options.moveToModeId;
				if (destination !== undefined) {
					if (destination === modeId || !modeCatalog.profiles[destination])
						throw new Error("Choose a different existing destination mode.");
				}
				const taskRecords = (
					await Promise.all([
						this.storage.loadTasks(),
						this.storage.loadCompletedTasks(),
						this.storage.loadArchivedTasks(),
					])
				)
					.flat()
					.sort((left, right) => left.id.localeCompare(right.id));
				const taskIds = taskRecords.map(({ id }) => id);
				const journal = {
					version: 2,
					operationId: crypto.randomUUID(),
					source: modeId,
					...(destination === undefined ? {} : { destination }),
					phase: "prepared",
					tasks: taskIds,
				} as const;
				await this.storage.modeDeletionJournal.write(journal);
				await this.storage.withTaskLocks(
					taskRecords,
					async (tasks) => {
						const taskById = new Map(tasks.map((task) => [task.id, task]));
						for (const taskId of destination === undefined ? taskIds : []) {
							for (const entry of await this.controller.prepareTaskStop(taskId, modeId))
								prepared.push({ taskId, record: entry.record, stop: entry.stop, release: entry.release });
						}
						for (const entry of prepared) {
							await entry.stop();
							stopped.push({ taskId: entry.taskId, sessionId: entry.record.id });
						}
						for (const taskId of taskIds) {
							const task = taskById.get(taskId);
							if (!task) throw new Error(`Task not found: ${taskId}`);
							if (destination !== undefined) {
								await this.controller.moveModeSessions(taskId, modeId, destination, task);
							} else {
								await this.controller.discardModeSessions(taskId, modeId, task);
								await this.controller.forgetModeSessions(taskId, modeId);
							}
							completed.push(taskId);
							try {
								this.controller.signals.publish("TasksChanged", taskId);
							} catch (error) {
								notificationFailures.push(error);
							}
						}
						const exact = await this.controller.getExactAgentConfiguration("project");
						if (!exact) throw new Error("Project agent configuration is unavailable.");
						await updateAgentConfiguration(this.controller, "project", (current) => removeMode(current, modeId));
						await this.storage.modeDeletionJournal.remove();
					},
					{ includeArchived: true },
				);
			});
		} catch (error) {
			primary = error instanceof Error ? error : new Error(String(error));
			primary = new AggregateError([primary], partialEffectsMessage(), { cause: primary });
		} finally {
			const releases = prepared.map((entry) => entry.release);
			const failures: Error[] = [];
			for (const release of releases) {
				try {
					await release();
				} catch (error) {
					failures.push(error instanceof Error ? error : new Error(String(error)));
				}
			}
			if (failures.length)
				primary = new AggregateError(
					[...(primary ? [primary] : []), ...failures],
					primary?.message ?? "Mode deletion claim release failed.",
					{ cause: primary },
				);
		}
		if (primary && notificationFailures.length)
			primary = new AggregateError([primary, ...notificationFailures], primary.message, { cause: primary });
		if (primary) throw primary;
		if (notificationFailures.length)
			throw new AggregateError(
				notificationFailures,
				`Mode ${modeId} was deleted, but post-commit notification failed.`,
			);
		return { deletedModeId: modeId, taskIds: completed };
	}
}
