import { removeMode } from "../model/session/config.ts";
import type { ModeId } from "../model/session/types.ts";
import type { Storage } from "../storage/storage.ts";
import { type AgentConfigurationController, updateAgentConfiguration } from "./agent-configuration.ts";
import type { Core } from "./agentic-workspace.ts";
import type { SessionApplication } from "./session-application.ts";

type ModeDeletionController = AgentConfigurationController &
	Pick<Core, "getExactAgentConfiguration" | "getProjectModeCatalog">;

export class ModeDeletionWorkflow {
	constructor(
		private readonly storage: Storage,
		private readonly sessionApplication: SessionApplication,
		private readonly controller: ModeDeletionController,
	) {}

	async deleteMode(
		modeId: ModeId,
		options: { confirmed: true; moveToModeId?: ModeId },
	): Promise<{ deletedModeId: ModeId; taskIds: string[] }> {
		if (!options.confirmed) throw new Error("Mode deletion requires explicit confirmation.");
		return await this.controller.withTaskChanges(async (changes) => {
			const releaseMode = await this.storage.claimModeAdmission(modeId);
			let releaseDestination: (() => Promise<void>) | undefined;
			const taskReleases: Array<() => Promise<void>> = [];
			const prepared: Array<{
				taskId: string;
				record: { id: string };
				stop: () => Promise<void>;
				release: () => Promise<void>;
			}> = [];
			const completed: string[] = [];
			const stopped: Array<{ taskId: string; sessionId: string }> = [];
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
						releaseDestination = await this.storage.claimModeAdmission(destination);
					}
					const taskIds = (await this.storage.loadProjectTaskIds()).sort((left, right) => left.localeCompare(right));
					for (const taskId of taskIds) taskReleases.push(await this.storage.claimTaskAdmission(taskId));
					for (const taskId of destination === undefined ? taskIds : []) {
						for (const entry of await this.sessionApplication.prepareTaskStop(taskId, modeId))
							prepared.push({ taskId, record: entry.record, stop: entry.stop, release: entry.release });
					}
					const journal = {
						version: 2,
						operationId: crypto.randomUUID(),
						source: modeId,
						...(destination === undefined ? {} : { destination }),
						phase: "prepared",
						tasks: taskIds,
					} as const;
					await this.storage.modeDeletionJournal.write(journal);
					for (const entry of prepared) {
						await entry.stop();
						stopped.push({ taskId: entry.taskId, sessionId: entry.record.id });
					}
					for (const taskId of taskIds) {
						if (destination !== undefined) {
							await this.sessionApplication.moveModeSessions(taskId, modeId, destination);
						} else {
							await this.sessionApplication.discardModeSessions(taskId, modeId);
							await this.sessionApplication.forgetModeSessions(taskId, modeId);
						}
						changes.push({ task: taskId });
						completed.push(taskId);
					}
					const exact = await this.controller.getExactAgentConfiguration("project");
					if (!exact) throw new Error("Project agent configuration is unavailable.");
					await updateAgentConfiguration(this.controller, "project", (current) => removeMode(current, modeId));
					await this.storage.modeDeletionJournal.remove();
				});
			} catch (error) {
				primary = error instanceof Error ? error : new Error(String(error));
				primary = new AggregateError([primary], partialEffectsMessage(), { cause: primary });
			} finally {
				const releases = [
					...prepared.map((entry) => entry.release),
					...taskReleases.reverse(),
					...(releaseDestination ? [releaseDestination] : []),
					releaseMode,
				];
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
			if (primary) throw primary;
			return { deletedModeId: modeId, taskIds: completed };
		});
	}
}
