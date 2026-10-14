import type { Task as TaskRecord } from "../types/index.ts";
import { isLocalEditableTask } from "../types/index.ts";
import type {
	Session,
	SessionCreationFactory,
	SessionCreationIdentity,
	Task as TaskContract,
	TaskHydrationInput,
	TaskSessionCreation,
} from "./session-contracts.ts";
import type { ModeId, ModeProfile, ModeSessionHistory, ResolvedAgentConfiguration } from "./types.ts";

export class Task implements TaskContract {
	readonly id: string;
	readonly modes: Record<ModeId, ModeSessionHistory>;
	readonly profiles: Record<ModeId, ModeProfile>;
	readonly task: TaskRecord;
	readonly configuration: ResolvedAgentConfiguration;
	readonly createSession: SessionCreationFactory;
	#selectedModeId: ModeId;

	constructor(input: TaskHydrationInput) {
		this.task = structuredClone(input.task);
		this.id = input.task.id;
		this.configuration = structuredClone(input.configuration);
		this.createSession = input.createSession;
		this.profiles = structuredClone(input.modes);
		this.modes = Object.fromEntries(
			Object.keys(input.modes).map((modeId) => {
				const sessions = structuredClone(input.sessionRecords[modeId]?.sessions ?? []);
				const persistedActiveId = input.sessionRecords[modeId]?.activeSessionId;
				return [
					modeId,
					{
						sessions,
						activeSessionId: sessions.some(({ id }) => id === persistedActiveId) ? persistedActiveId : sessions[0]?.id,
					},
				];
			}),
		);
		this.#selectedModeId =
			input.selectedModeId in this.modes ? input.selectedModeId : (Object.keys(this.modes)[0] ?? "");
	}

	get selectedModeId(): ModeId {
		return this.#selectedModeId;
	}

	get activeSession(): ModeSessionHistory["sessions"][number] | undefined {
		const history = this.modes[this.#selectedModeId];
		return history?.sessions.find(({ id }) => id === history.activeSessionId);
	}

	get editable(): boolean {
		return isLocalEditableTask(this.task);
	}

	cycleMode(direction = 1): ModeId {
		const ids = Object.keys(this.modes);
		if (ids.length === 0) return this.#selectedModeId;
		const current = ids.indexOf(this.#selectedModeId);
		this.#selectedModeId = ids[(Math.max(0, current) + direction + ids.length) % ids.length] ?? ids[0] ?? "";
		return this.#selectedModeId;
	}

	async newSession(modeId: ModeId, capture: (creation: TaskSessionCreation) => void): Promise<Session> {
		const history = this.modes[modeId];
		if (!history) throw new Error(`Unknown mode: ${modeId}`);
		const session = this.createSession.provision({ taskId: this.id, modeId });
		const previousActiveSessionId = history.activeSessionId;
		const creation: SessionCreationIdentity = {
			taskId: this.id,
			modeId,
			provisionalSessionId: session.id,
			...(previousActiveSessionId === undefined ? {} : { previousActiveSessionId }),
		};
		history.sessions.unshift(session.record as ModeSessionHistory["sessions"][number]);
		history.activeSessionId = session.id;
		capture({ session, creation });
		await session.start();
		return session;
	}

	rollbackSession(creation: SessionCreationIdentity): void {
		const history = this.modes[creation.modeId];
		if (!history) return;
		history.sessions = history.sessions.filter(({ id }) => id !== creation.provisionalSessionId);
		if (history.activeSessionId === creation.provisionalSessionId) {
			history.activeSessionId = history.sessions.some(({ id }) => id === creation.previousActiveSessionId)
				? creation.previousActiveSessionId
				: history.sessions[0]?.id;
		}
	}

	edit(changes: Partial<TaskRecord>): void {
		if (!this.editable) throw new Error(`Task is not editable: ${this.id}`);
		Object.assign(this.task, changes);
	}

	delete(): void {
		// Forgetting a task does not own runtime cleanup.
	}

	serialize(): TaskRecord {
		return structuredClone(this.task);
	}
}

export function createTask(input: {
	id: string;
	title: string;
	modes: Record<ModeId, ModeProfile>;
	configuration: ResolvedAgentConfiguration;
	createSession: SessionCreationFactory;
}): Task {
	const now = new Date().toISOString();
	const task: TaskRecord = {
		id: input.id,
		title: input.title,
		status: "To Do",
		assignee: [],
		createdDate: now,
		labels: [],
		dependencies: [],
	};
	return new Task({
		task,
		modes: input.modes,
		configuration: input.configuration,
		sessionRecords: {},
		selectedModeId: Object.keys(input.modes)[0] ?? "",
		createSession: input.createSession,
	});
}
