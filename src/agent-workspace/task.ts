import type { Task as TaskRecord } from "../types/index.ts";
import { isLocalEditableTask } from "../types/index.ts";
import type { Session } from "./session.ts";
import type { AgentSession, ModeId, ModeProfile, ModeSessionHistory, ResolvedAgentConfiguration } from "./types.ts";

export interface SessionCreationIdentity {
	readonly taskId: TaskRecord["id"];
	readonly modeId: ModeId;
	readonly provisionalSessionId: AgentSession["id"];
	readonly createdAt: AgentSession["createdAt"];
	readonly previousActiveSessionId?: AgentSession["id"];
}

export interface TaskHydrationInput {
	readonly task: TaskRecord;
	readonly modes: Readonly<Record<ModeId, ModeProfile>>;
	readonly configuration: ResolvedAgentConfiguration;
	readonly sessionRecords: Readonly<Record<ModeId, ModeSessionHistory>>;
	readonly selectedModeId: ModeId;
	readonly createSession: (input: { readonly taskId: string; readonly modeId: ModeId }) => Session;
}

export interface TaskSessionCreation {
	readonly session: Session;
	readonly creation: SessionCreationIdentity;
}

export class Task {
	readonly id: string;
	readonly modes: Record<ModeId, ModeSessionHistory>;
	readonly profiles: Record<ModeId, ModeProfile>;
	readonly task: TaskRecord;
	readonly configuration: ResolvedAgentConfiguration;
	readonly createSession: TaskHydrationInput["createSession"];
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

	get activeSession(): AgentSession | undefined {
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

	reserveSession(modeId: ModeId): TaskSessionCreation {
		const history = this.#requireMode(modeId);
		const previousActiveSessionId = history.activeSessionId;
		const session = this.createSession({ taskId: this.id, modeId });
		const creation: SessionCreationIdentity = {
			taskId: this.id,
			modeId,
			provisionalSessionId: session.id,
			createdAt: session.record.createdAt,
			...(previousActiveSessionId === undefined ? {} : { previousActiveSessionId }),
		};
		history.sessions.unshift(structuredClone(session.record) as AgentSession);
		history.activeSessionId = session.id;
		return { session, creation };
	}

	rollbackSession(creation: SessionCreationIdentity): void {
		if (creation.taskId !== this.id) throw new Error(`Creation belongs to another task: ${creation.taskId}`);
		const history = this.#requireMode(creation.modeId);
		const matches = history.sessions.filter(({ id }) => id === creation.provisionalSessionId);
		if (matches.length !== 1) throw new Error(`Expected one provisional session: ${creation.provisionalSessionId}`);
		const provisional = matches[0];
		if (!provisional) throw new Error(`Missing provisional session: ${creation.provisionalSessionId}`);
		if (creation.createdAt !== provisional.createdAt)
			throw new Error(`Reservation incarnation changed: ${creation.provisionalSessionId}`);
		history.sessions = history.sessions.filter(({ id }) => id !== creation.provisionalSessionId);
		if (history.activeSessionId === creation.provisionalSessionId) {
			history.activeSessionId = history.sessions.some(({ id }) => id === creation.previousActiveSessionId)
				? creation.previousActiveSessionId
				: history.sessions[0]?.id;
		}
	}

	updateSessionRecord(modeId: ModeId, record: Readonly<AgentSession>): void {
		if (record.taskId !== this.id) throw new Error(`Session belongs to another task: ${record.taskId}`);
		const history = this.#requireMode(modeId);
		const indexes = history.sessions.flatMap((session, index) => (session.id === record.id ? [index] : []));
		if (indexes.length !== 1) throw new Error(`Expected one session membership: ${record.id}`);
		const index = indexes[0];
		if (index === undefined) throw new Error(`Expected one session membership: ${record.id}`);
		const current = history.sessions[index];
		if (!current || !sameIncarnation(current, record)) throw new Error(`Session incarnation changed: ${record.id}`);
		history.sessions[index] = structuredClone(record) as AgentSession;
	}

	selectSession(modeId: ModeId, sessionId: string): void {
		const history = this.#requireMode(modeId);
		if (!history.sessions.some(({ id }) => id === sessionId)) throw new Error(`Unknown session: ${sessionId}`);
		history.activeSessionId = sessionId;
	}

	selectSurvivorAfterStop(modeId: ModeId, stoppedSessionId: string): void {
		const history = this.#requireMode(modeId);
		if (!history.sessions.some(({ id }) => id === stoppedSessionId))
			throw new Error(`Unknown session: ${stoppedSessionId}`);
		history.activeSessionId = history.sessions.find(({ id }) => id !== stoppedSessionId)?.id ?? stoppedSessionId;
	}

	registerSession(modeId: ModeId, record: Readonly<AgentSession>): void {
		if (record.taskId !== this.id) throw new Error(`Session belongs to another task: ${record.taskId}`);
		const history = this.#requireMode(modeId);
		if (history.sessions.some(({ id }) => id === record.id))
			throw new Error(`Session already registered: ${record.id}`);
		history.sessions.unshift(structuredClone(record) as AgentSession);
		if (!history.sessions.some(({ id }) => id === history.activeSessionId)) history.activeSessionId = record.id;
	}

	removeSession(modeId: ModeId, sessionId: string): void {
		const history = this.#requireMode(modeId);
		history.sessions = history.sessions.filter(({ id }) => id !== sessionId);
		if (history.activeSessionId === sessionId || !history.sessions.some(({ id }) => id === history.activeSessionId)) {
			history.activeSessionId = history.sessions[0]?.id;
		}
	}

	removeMode(modeId: ModeId): void {
		if (this.modes[modeId]?.sessions.length) throw new Error(`Cannot remove mode with sessions: ${modeId}`);
		delete this.modes[modeId];
		delete this.profiles[modeId];
		if (this.#selectedModeId === modeId) this.#selectedModeId = Object.keys(this.modes)[0] ?? "";
	}

	edit(changes: Partial<TaskRecord>): void {
		if (!this.editable) throw new Error(`Task is not editable: ${this.id}`);
		Object.assign(this.task, changes);
	}

	delete(): void {
		/* Forgetting a task does not own runtime cleanup. */
	}

	serialize(): TaskRecord {
		return structuredClone(this.task);
	}

	serializeSessions(): Record<ModeId, ModeSessionHistory> {
		return structuredClone(this.modes);
	}

	#requireMode(modeId: ModeId): ModeSessionHistory {
		const history = this.modes[modeId];
		if (!history) throw new Error(`Unknown mode: ${modeId}`);
		return history;
	}
}

/** Incarnation key: only fields fixed at reservation. Native/tmux provenance is mutable progress, not identity. */
function sameIncarnation(left: AgentSession, right: Readonly<AgentSession>): boolean {
	return left.id === right.id && left.taskId === right.taskId && left.createdAt === right.createdAt;
}

export function createTask(input: {
	id: string;
	title: string;
	modes: Record<ModeId, ModeProfile>;
	configuration: ResolvedAgentConfiguration;
	createSession: TaskHydrationInput["createSession"];
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
