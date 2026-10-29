import type { ModeId, TaskSessions } from "../model/session/types.ts";
import type { Core } from "./agentic-workspace.ts";

/** Workspace query assembly over Core-owned session state. */
export class WorkspaceStateService {
	constructor(private readonly core: Core) {}

	get stateRoot(): Promise<string> {
		return this.core.store.stateRoot;
	}

	async listSessions(taskId: string, modeId?: ModeId): Promise<TaskSessions> {
		const state = await this.core.store.read(taskId);
		const selectedModeId = modeId ?? Object.keys(state.modes)[0];
		const history = selectedModeId ? state.modes[selectedModeId] : undefined;
		return {
			taskId,
			sessions: history?.sessions ?? [],
			...(history?.activeSessionId === undefined ? {} : { activeSessionId: history.activeSessionId }),
		};
	}

	async listAllSessions(): Promise<Map<string, TaskSessions>> {
		const inventory = await this.core.projectInventory();
		return new Map<string, TaskSessions>(
			inventory.map(
				({ taskId, sessions }) => [taskId, { taskId, sessions: sessions.map(({ record }) => record) }] as const,
			),
		);
	}
}
