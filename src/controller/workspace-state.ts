import type { ModeId, TaskSessions } from "../model/session/types.ts";
import type { Task } from "../model/types.ts";
import type { Core } from "./agentic-workspace.ts";
import type { SessionApplication } from "./session-application.ts";

/** Workspace query assembly. Session lifecycle is owned solely by SessionApplication. */
export class WorkspaceStateService {
	readonly sessionApplication: SessionApplication;

	constructor(
		private readonly core: Core,
		options: { sessionApplication: SessionApplication },
	) {
		this.sessionApplication = options.sessionApplication;
	}

	get stateRoot(): Promise<string> {
		return this.sessionApplication.store.stateRoot;
	}

	async listTasks(): Promise<Task[]> {
		return await this.core.loadStoredTasks();
	}

	async listSessions(taskId: string, modeId?: ModeId): Promise<TaskSessions> {
		const state = await this.sessionApplication.store.read(taskId);
		const selectedModeId = modeId ?? Object.keys(state.modes)[0];
		const history = selectedModeId ? state.modes[selectedModeId] : undefined;
		return {
			taskId,
			sessions: history?.sessions ?? [],
			...(history?.activeSessionId === undefined ? {} : { activeSessionId: history.activeSessionId }),
		};
	}

	async listModeSessions(taskId: string, modeId: ModeId): Promise<TaskSessions> {
		return await this.listSessions(taskId, modeId);
	}

	async findSessionMode(taskId: string, sessionId: string): Promise<ModeId | undefined> {
		const state = await this.sessionApplication.store.read(taskId);
		return Object.keys(state.modes).find((modeId) =>
			state.modes[modeId]?.sessions.some((record) => record.id === sessionId),
		);
	}

	async listAllSessions(): Promise<Map<string, TaskSessions>> {
		const inventory = await this.sessionApplication.projectInventory();
		return new Map<string, TaskSessions>(
			inventory.map(
				({ taskId, sessions }) => [taskId, { taskId, sessions: sessions.map(({ record }) => record) }] as const,
			),
		);
	}
}
