import { isDeepStrictEqual } from "node:util";
import type { Session } from "../session/session.ts";
import type {
	AgentSession,
	ModeId,
	ModeProfile,
	ModeSessionHistory,
	ResolvedAgentConfiguration,
} from "../session/types.ts";
import type { Task as TaskRecord, TaskUpdateInput } from "../types.ts";
import { isLocalEditableTask } from "../types.ts";
import type { ReadinessGraph, TaskReadiness } from "./readiness.ts";
import { getTaskReadiness } from "./readiness.ts";
import { taskIdsEqual } from "./task-id.ts";
import { applyTaskUpdate, type TaskUpdateContext } from "./task-update/index.ts";

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

type TaskMutationInput = Pick<TaskHydrationInput, "task">;

export interface TaskSessionCreation {
	readonly session: Session;
	readonly creation: SessionCreationIdentity;
}

/** A board operation has already resolved its configured status and target lane. */
export interface BoardTaskPlacement {
	readonly status: string;
	readonly ordinal: number | undefined;
	readonly milestone: string | undefined;
}

export class Task {
	readonly id: string;
	readonly modes: Record<ModeId, ModeSessionHistory>;
	readonly profiles: Record<ModeId, ModeProfile>;
	readonly task: TaskRecord;
	readonly configuration: ResolvedAgentConfiguration | undefined;
	readonly createSession: TaskHydrationInput["createSession"] | undefined;
	#selectedModeId: ModeId;

	constructor(input: TaskHydrationInput | TaskMutationInput) {
		this.task = structuredClone(input.task);
		this.id = input.task.id;
		if (!("modes" in input)) {
			this.configuration = undefined;
			this.createSession = undefined;
			this.profiles = {};
			this.modes = {};
			this.#selectedModeId = "";
			return;
		}
		this.configuration = structuredClone(input.configuration);
		this.createSession = input.createSession;
		this.profiles = structuredClone(input.modes);
		this.modes = Object.fromEntries(
			[...new Set([...Object.keys(input.modes), ...Object.keys(input.sessionRecords)])].map((modeId) => {
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
			input.selectedModeId in input.modes ? input.selectedModeId : (Object.keys(input.modes)[0] ?? "");
	}

	/** Hydrates only the record behavior needed for a synchronous task mutation. */
	static forUpdate(task: TaskRecord): Task {
		return new Task({ task });
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

	/** Identity comparison, case-folded and whitespace-insensitive; display spelling is preserved. */
	equals(other: string | { readonly id: string }): boolean {
		return taskIdsEqual(this.id, typeof other === "string" ? other : other.id);
	}

	/** Record equality, including fields that have no identity meaning. */
	equalsDeep(record: TaskRecord): boolean {
		return isDeepStrictEqual(this.serialize(), record);
	}

	/** Corpus-wide readiness, evaluated against the graph supplied by the caller. */
	ready(graph: ReadinessGraph): TaskReadiness {
		return getTaskReadiness(this.task, graph);
	}

	/** Applies a fully resolved edit without I/O. */
	applyUpdate(input: TaskUpdateInput, context: TaskUpdateContext): boolean {
		return applyTaskUpdate(this.task, input, context);
	}

	/** Applies a resolved board position without I/O or record reconstruction in the controller. */
	applyBoardPlacement(placement: BoardTaskPlacement): boolean {
		if (placement.status.trim() === "") throw new Error("Task status must not be empty.");
		if (placement.ordinal !== undefined && (!Number.isFinite(placement.ordinal) || placement.ordinal < 0)) {
			throw new Error("Ordinal must be a non-negative number.");
		}
		const statusChanged = this.task.status !== placement.status;
		const ordinalChanged = this.task.ordinal !== placement.ordinal;
		const milestoneChanged = this.task.milestone !== placement.milestone;
		this.task.status = placement.status;
		if (placement.ordinal === undefined) delete this.task.ordinal;
		else this.task.ordinal = placement.ordinal;
		if (placement.milestone === undefined) delete this.task.milestone;
		else this.task.milestone = placement.milestone;
		return statusChanged || ordinalChanged || milestoneChanged;
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
		if (!this.createSession) throw new Error("Session creation is unavailable during task mutation.");
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
		this.#selectedModeId = modeId;
		return { session, creation };
	}

	rollbackSession(creation: SessionCreationIdentity): void {
		if (!taskIdsEqual(creation.taskId, this.id))
			throw new Error(`Creation belongs to another task: ${creation.taskId}`);
		const history = this.#requireMode(creation.modeId);
		const matches = history.sessions.filter(({ id }) => id === creation.provisionalSessionId);
		if (matches.length === 0) return;
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
		if (!taskIdsEqual(record.taskId, this.id)) throw new Error(`Session belongs to another task: ${record.taskId}`);
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
		this.#selectedModeId = modeId;
	}

	selectSurvivorAfterStop(modeId: ModeId, stoppedSessionId: string): void {
		const history = this.#requireMode(modeId);
		if (!history.sessions.some(({ id }) => id === stoppedSessionId))
			throw new Error(`Unknown session: ${stoppedSessionId}`);
		if (history.activeSessionId !== stoppedSessionId) return;
		history.activeSessionId = history.sessions.find(({ id }) => id !== stoppedSessionId)?.id ?? stoppedSessionId;
	}

	registerSession(modeId: ModeId, record: Readonly<AgentSession>): void {
		if (!taskIdsEqual(record.taskId, this.id)) throw new Error(`Session belongs to another task: ${record.taskId}`);
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

	moveModeSessions(sourceModeId: ModeId, destinationModeId: ModeId): void {
		if (sourceModeId === destinationModeId) throw new Error("Session destination must be another mode.");
		const source = this.#requireMode(sourceModeId);
		const destination = this.#requireMode(destinationModeId);
		if (source.sessions.some(({ id }) => destination.sessions.some((record) => record.id === id)))
			throw new Error("Session already belongs to the destination mode.");
		destination.sessions.push(...source.sessions);
		destination.activeSessionId ??= source.activeSessionId;
		source.sessions = [];
		source.activeSessionId = undefined;
	}

	setModeApproval(modeId: ModeId): void {
		if (typeof modeId !== "string" || modeId.trim() === "") throw new Error("Mode ID must not be empty.");
		this.task.modeApprovals = { ...this.task.modeApprovals, [modeId]: true };
	}

	clearModeApproval(modeId: ModeId): void {
		if (typeof modeId !== "string" || modeId.trim() === "") throw new Error("Mode ID must not be empty.");
		if (!this.task.modeApprovals?.[modeId]) return;
		const approvals = { ...this.task.modeApprovals };
		delete approvals[modeId];
		this.task.modeApprovals = Object.keys(approvals).length ? approvals : undefined;
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
	return left.id === right.id && taskIdsEqual(left.taskId, right.taskId) && left.createdAt === right.createdAt;
}
