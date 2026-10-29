import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { normalizeStringList, stringArraysEqual } from "../../lib/string-list.ts";
import type { Session } from "../session/session.ts";
import { nativeSessionName } from "../session/session-utils.ts";
import type { AgentSession, ModeId, ModeProfile, ModeSessionHistory, SessionFactory } from "../session/types.ts";
import type { Task as TaskRecord } from "../types.ts";
import { DependencyValidator } from "./dependency-validator.ts";
import type { TaskReadiness } from "./readiness.ts";
import { getTaskReadiness } from "./readiness.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "./task-path.ts";

export interface SessionCreationIdentity {
	readonly taskId: TaskRecord["id"];
	readonly modeId: ModeId;
	readonly provisionalSessionId: AgentSession["id"];
	readonly createdAt: AgentSession["createdAt"];
	readonly previousActiveSessionId?: AgentSession["id"];
	readonly previousSelectedModeId?: ModeId;
}

export interface TaskSessionCreation {
	readonly session: Session;
	readonly creation: SessionCreationIdentity;
}

export interface SessionCreationInputs {
	readonly preset: string;
	readonly taskDir: string;
	readonly pathContext: NonNullable<AgentSession["pathContext"]>;
}

export type TaskSessionHistory = Omit<ModeSessionHistory, "sessions"> & { sessions: Session[] };

/** Actual in-memory relationships; unsaved tasks may have no modes or histories. */
export interface TaskRelationships {
	readonly modes?: Readonly<Record<ModeId, TaskSessionHistory>>;
	readonly profiles?: Readonly<Record<ModeId, ModeProfile>>;
	readonly selectedModeId?: ModeId;
}

/** Loaded relationship records supplied by Storage; runtime objects are created at the boundary. */
export interface TaskLoadedStateInput extends TaskRecord {
	readonly profiles: Readonly<Record<ModeId, ModeProfile>>;
	readonly sessionRecords: Readonly<Record<ModeId, ModeSessionHistory>>;
	readonly selectedModeId: ModeId;
}

export type TaskInput = TaskRecord & TaskRelationships;

/** A board operation has already resolved its configured status and target lane. */
export interface BoardTaskPlacement {
	readonly status: string;
	readonly ordinal: number | undefined;
	readonly milestone: string | undefined;
}

export class Task {
	readonly id: string;
	modes: Record<ModeId, TaskSessionHistory>;
	profiles: Record<ModeId, ModeProfile>;
	task: TaskRecord;
	#selectedModeId: ModeId;

	constructor(input: TaskInput) {
		const { modes = {}, profiles = {}, selectedModeId = "", ...task } = input;
		this.task = structuredClone(task);
		this.task.done ??= false;
		this.id = task.id;
		this.profiles = { ...profiles };
		this.modes = Object.fromEntries(
			Object.entries(modes).map(([modeId, history]) => [modeId, { ...history, sessions: [...history.sessions] }]),
		);
		this.#selectedModeId = selectedModeId;
	}

	replaceLoadedState(input: TaskLoadedStateInput, sessionFactory: SessionFactory): void {
		const { profiles, sessionRecords, selectedModeId, ...task } = input;
		this.task = structuredClone(task);
		this.task.done ??= false;
		this.profiles = structuredClone(profiles);
		const existingSessions = new Map<string, Session>();
		for (const history of Object.values(this.modes)) {
			for (const session of history.sessions) existingSessions.set(session.id, session);
		}
		this.modes = Object.fromEntries(
			[...new Set([...Object.keys(profiles), ...Object.keys(sessionRecords)])].map((modeId) => {
				const sessions = (sessionRecords[modeId]?.sessions ?? []).map((record) => {
					const session = existingSessions.get(record.id) ?? sessionFactory(this.id, modeId, record);
					session.replaceLoadedRecord(record, modeId);
					return session;
				});
				const activeSessionId = sessionRecords[modeId]?.activeSessionId;
				return [
					modeId,
					{
						sessions,
						activeSessionId,
					},
				];
			}),
		);
		this.#selectedModeId = selectedModeId;
	}

	get selectedModeId(): ModeId {
		return this.#selectedModeId;
	}

	get activeSession(): Session | undefined {
		const history = this.modes[this.#selectedModeId];
		return history?.sessions.find(({ id }) => id === history.activeSessionId);
	}

	findSession(sessionId: string): Session | undefined {
		for (const history of Object.values(this.modes)) {
			const session = history.sessions.find(({ id }) => id === sessionId);
			if (session) return session;
		}
		return undefined;
	}

	/** Exact stored-ID comparison. */
	equals(other: string | { readonly id: string }): boolean {
		return this.id === (typeof other === "string" ? other : other.id);
	}

	/** Record equality, including fields that have no identity meaning. */
	equalsDeep(record: TaskRecord): boolean {
		return isDeepStrictEqual(this.task, record);
	}

	/** Corpus-wide readiness, evaluated against the graph supplied by the caller. */
	ready(graph: ReadonlyMap<string, TaskRecord>): TaskReadiness {
		return getTaskReadiness(this.task, graph);
	}

	replaceDependencies(input: string[], corpus: readonly TaskRecord[]): boolean {
		return this.assignDependencies(input, corpus, true);
	}

	addDependencies(input: string[], corpus: readonly TaskRecord[]): boolean {
		return this.assignDependencies(input, corpus, false);
	}

	private assignDependencies(input: string[], corpus: readonly TaskRecord[], replace: boolean): boolean {
		const normalized = normalizeStringList(input) ?? [];
		const { valid, invalid } = new DependencyValidator(corpus).validate(normalized, this.task);
		if (invalid.length > 0)
			throw new Error(
				`The following dependencies do not exist: ${invalid.join(", ")}. Please create these tasks first or verify the IDs. ${LOCAL_TASK_LOOKUP_HINT}`,
			);
		const next = replace
			? valid
			: [...this.task.dependencies, ...valid.filter((dependency) => !this.task.dependencies.includes(dependency))];
		if (stringArraysEqual(next, this.task.dependencies)) return false;
		this.task.dependencies = next;
		return true;
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

	createSession(
		modeId: ModeId,
		inputs: SessionCreationInputs,
		sessionFactory: SessionFactory,
		activate = true,
	): TaskSessionCreation {
		const history = this.#requireMode(modeId);
		const previousActiveSessionId = history.activeSessionId;
		const id = randomUUID();
		const record: AgentSession = {
			id,
			taskId: this.id,
			preset: inputs.preset,
			tmuxName: nativeSessionName(this.id, id),
			pathContext: inputs.pathContext,
			createdAt: new Date().toISOString(),
			ownerPid: process.pid,
			outputPath: join(inputs.taskDir, `${id}.log`),
			bootstrapPath: join(inputs.taskDir, `${id}.md`),
		};
		const session = sessionFactory(this.id, modeId, record);
		const creation: SessionCreationIdentity = {
			taskId: this.id,
			modeId,
			provisionalSessionId: session.id,
			createdAt: session.record.createdAt,
			...(previousActiveSessionId === undefined ? {} : { previousActiveSessionId }),
			...(this.#selectedModeId === "" ? {} : { previousSelectedModeId: this.#selectedModeId }),
		};
		history.sessions.unshift(session);
		if (activate) {
			history.activeSessionId = session.id;
			this.#selectedModeId = modeId;
		}
		return { session, creation };
	}

	rollbackSession(creation: SessionCreationIdentity): string | undefined {
		if (creation.taskId !== this.id) throw new Error(`Creation belongs to another task: ${creation.taskId}`);
		const history = this.#requireMode(creation.modeId);
		const matches = history.sessions.filter(({ id }) => id === creation.provisionalSessionId);
		if (matches.length === 0) return history.activeSessionId;
		if (matches.length !== 1) throw new Error(`Expected one provisional session: ${creation.provisionalSessionId}`);
		const provisional = matches[0]?.record;
		if (!provisional) throw new Error(`Missing provisional session: ${creation.provisionalSessionId}`);
		if (creation.createdAt !== provisional.createdAt)
			throw new Error(`Reservation incarnation changed: ${creation.provisionalSessionId}`);
		history.sessions = history.sessions.filter(({ id }) => id !== creation.provisionalSessionId);
		if (history.activeSessionId === creation.provisionalSessionId) {
			history.activeSessionId = history.sessions.some(({ id }) => id === creation.previousActiveSessionId)
				? creation.previousActiveSessionId
				: history.sessions[0]?.id;
		}
		if (this.#selectedModeId === creation.modeId && creation.previousSelectedModeId !== undefined)
			this.#selectedModeId = creation.previousSelectedModeId;
		return history.activeSessionId;
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

	registerSession(modeId: ModeId, record: Readonly<AgentSession>, sessionFactory: SessionFactory): void {
		if (record.taskId !== this.id) throw new Error(`Session belongs to another task: ${record.taskId}`);
		const history = this.#requireMode(modeId);
		if (history.sessions.some(({ id }) => id === record.id))
			throw new Error(`Session already registered: ${record.id}`);
		history.sessions.unshift(sessionFactory(this.id, modeId, record));
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

	#requireMode(modeId: ModeId): TaskSessionHistory {
		const history = this.modes[modeId];
		if (!history) throw new Error(`Unknown mode: ${modeId}`);
		return history;
	}
}
