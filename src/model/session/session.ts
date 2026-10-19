import type { RunningExecution, RunningExecutionEvent, SessionLaunchContext } from "../../runtime/harness.ts";
import { AGENT_SESSION_STATUS, type AgentActivity, type AgentSession, type ModeId } from "./types.ts";

export type SessionStartupCheckpointPhase = "identity" | "ready";
export type SessionCheckpointOrigin = {
	readonly kind: "session";
	readonly taskId: string;
	readonly modeId: ModeId;
	readonly sessionId: string;
};
export type ExpectedSessionMembership = {
	readonly kind: "present";
	readonly taskId: string;
	readonly modeId: ModeId;
	readonly sessionId: string;
};

export type Immutable<T> = T extends (...args: never[]) => unknown
	? T
	: T extends readonly (infer Item)[]
		? readonly Immutable<Item>[]
		: T extends object
			? { readonly [Key in keyof T]: Immutable<T[Key]> }
			: T;

/** Startup transitions apply only to an already registered session. */
export interface SessionStartupCheckpoint {
	readonly phase: SessionStartupCheckpointPhase;
	readonly origin: SessionCheckpointOrigin;
	readonly expectedMembership: ExpectedSessionMembership;
	readonly record: Immutable<AgentSession>;
	readonly applyTo: (current: AgentSession) => AgentSession;
}

export interface SessionUpdateCheckpoint {
	readonly phase: "update";
	readonly reason: "activate" | "stop" | "park" | "finish" | "observation";
	readonly origin: Extract<SessionCheckpointOrigin, { kind: "session" }>;
	readonly expectedMembership: Extract<ExpectedSessionMembership, { kind: "present" }>;
	readonly previous: Immutable<AgentSession>;
	readonly record: Immutable<AgentSession>;
	readonly applyTo: (current: AgentSession) => AgentSession;
}

export type LifecycleCheckpoint = SessionStartupCheckpoint | SessionUpdateCheckpoint;
export type LifecycleCheckpointSink = (checkpoint: LifecycleCheckpoint) => Promise<void>;
export interface SessionPublication {
	readonly checkpoint: LifecycleCheckpointSink;
}
export interface SessionLaunchOperation extends SessionPublication {
	readonly context: SessionLaunchContext;
}
/** Provider and execution-host operations are kept behind this SessionRuntime boundary. */
export interface SessionRuntime {
	start(context: SessionLaunchContext): Promise<RunningExecution>;
	resume(providerSessionId: string, context: SessionLaunchContext): Promise<RunningExecution>;
	stop(execution: RunningExecution): Promise<void>;
	observe(execution: RunningExecution, listener: (event: RunningExecutionEvent) => void): Unsubscribe;
}
export interface SessionEvent {
	readonly kind: "turn-completed" | "permission-wait" | "execution-exit" | "activity";
	readonly activity?: AgentActivity;
	readonly status: AgentSession["status"];
	readonly executionIdentity: RunningExecution["identity"];
	readonly record: Immutable<AgentSession>;
}

type Unsubscribe = () => void;

export class Session {
	readonly id: string;
	private currentRecord: Readonly<AgentSession>;
	private currentExecution?: RunningExecution;
	private providerSessionId?: string;
	private executionExitObserved = false;
	private readonly modeId: ModeId;
	private readonly runtime: SessionRuntime;
	private stopObserving?: Unsubscribe;
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private disposed = false;

	constructor(record: Readonly<AgentSession>, modeId: ModeId, runtime: SessionRuntime) {
		this.id = record.id;
		this.currentRecord = record;
		this.providerSessionId = record.nativeSessionId;
		this.modeId = modeId;
		this.runtime = runtime;
	}

	get record(): Readonly<AgentSession> {
		return this.currentRecord;
	}

	get execution(): RunningExecution | undefined {
		return this.currentExecution;
	}

	async start(operation: SessionLaunchOperation): Promise<void> {
		if (this.modeId !== operation.context.modeId) throw new Error(`Session ${this.id} belongs to another mode`);
		const execution = await this.runtime.start(operation.context);
		await this.installExecution(execution);
		await this.emitCheckpoint(operation, "identity");
		await this.emitCheckpoint(operation, "ready", AGENT_SESSION_STATUS.RUNNING);
	}

	async resume(operation: SessionLaunchOperation): Promise<void> {
		if (this.modeId !== operation.context.modeId) throw new Error(`Session ${this.id} belongs to another mode`);
		if (!this.providerSessionId) throw new Error(`Session ${this.id} has no retained provider conversation`);
		const execution = await this.runtime.resume(this.providerSessionId, operation.context);
		await this.installExecution(execution);
		const resumed = { ...this.currentRecord, endedAt: undefined, error: undefined };
		delete resumed.endedAt;
		delete resumed.error;
		this.currentRecord = resumed;
		await this.emitCheckpoint(operation, "identity", undefined, true);
		await this.emitCheckpoint(operation, "ready", AGENT_SESSION_STATUS.RUNNING, true);
	}

	async stop(publication: SessionPublication): Promise<void> {
		const execution = this.currentExecution;
		const previous = this.currentRecord;
		if (execution) {
			await this.runtime.stop(execution);
			this.executionExitObserved = true;
			this.releaseExecution(execution);
		} else if (!this.executionExitObserved) {
			throw new Error(`Cannot confirm session ${this.id} stopped without a current execution or observed exit.`);
		}
		const record = {
			...previous,
			status: AGENT_SESSION_STATUS.STOPPED,
			endedAt: new Date().toISOString(),
		} as AgentSession;
		delete record.ownerPid;
		await this.emitUpdate(publication, "stop", record);
	}

	async park(publication: SessionPublication): Promise<void> {
		const previous = this.currentRecord;
		const record = {
			...previous,
			status: AGENT_SESSION_STATUS.PARKED,
			ownerPid: undefined,
		} as AgentSession;
		delete record.ownerPid;
		delete record.error;
		delete record.endedAt;
		await this.emitUpdate(publication, "park", record);
	}

	async finish(publication: SessionPublication, error?: string): Promise<void> {
		const previous = this.currentRecord;
		const record = {
			...previous,
			status: error ? AGENT_SESSION_STATUS.FAILED : AGENT_SESSION_STATUS.STOPPED,
			error,
			endedAt: new Date().toISOString(),
			ownerPid: undefined,
		} as AgentSession;
		delete record.ownerPid;
		if (error === undefined) delete record.error;
		await this.emitUpdate(publication, "finish", record);
	}

	subscribe(listener: (event: SessionEvent) => void): Unsubscribe {
		if (this.disposed) return () => {};
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	serialize(): AgentSession {
		return { ...this.currentRecord };
	}

	private installExecution(execution: RunningExecution): void {
		const previous = this.currentExecution;
		this.releaseExecution(previous);
		this.currentExecution = execution;
		this.executionExitObserved = false;
		if (this.disposed) return;
		this.stopObserving = this.runtime.observe(execution, (event) => {
			if (this.currentExecution !== execution || this.disposed) return;
			this.publish(event, execution);
		});
	}

	private releaseExecution(execution: RunningExecution | undefined): void {
		if (!execution) return;
		this.stopObserving?.();
		this.stopObserving = undefined;
		execution.teardownListeners();
		if (this.currentExecution === execution) this.currentExecution = undefined;
	}

	private async emitCheckpoint(
		publication: SessionPublication,
		phase: SessionStartupCheckpointPhase,
		status: AgentSession["status"] = this.record.status,
		clearTerminal = false,
	): Promise<void> {
		const record: AgentSession = { ...this.record, status };
		const providerSessionId =
			this.currentExecution?.providerConversationId ?? this.currentExecution?.identity.nativeSessionId;
		if (phase === "identity" && providerSessionId) {
			this.providerSessionId = providerSessionId;
			record.nativeSessionId = providerSessionId;
		}
		const fields: Partial<AgentSession> = {};
		const clear: (keyof AgentSession)[] = [];
		if (phase === "identity" && providerSessionId) fields.nativeSessionId = providerSessionId;
		if (phase === "ready") fields.status = status;
		if (clearTerminal) clear.push("error", "endedAt");
		await publication.checkpoint({
			phase,
			origin: { kind: "session", taskId: record.taskId, modeId: this.modeId, sessionId: this.id },
			expectedMembership: {
				kind: "present",
				taskId: record.taskId,
				modeId: this.modeId,
				sessionId: this.id,
			},
			record,
			applyTo: (current) => this.applyLifecycleFields(current, fields, clear),
		});
		this.currentRecord = record;
	}

	private async emitUpdate(
		publication: SessionPublication,
		reason: "activate" | "stop" | "park" | "finish" | "observation",
		record: AgentSession,
	): Promise<void> {
		const previous = this.currentRecord;
		const fields: Partial<AgentSession> = {};
		const clear: (keyof AgentSession)[] = [];
		switch (reason) {
			case "activate":
				fields.status = record.status;
				clear.push("error", "endedAt");
				break;
			case "stop":
				fields.status = record.status;
				fields.endedAt = record.endedAt;
				clear.push("ownerPid");
				break;
			case "park":
				fields.status = record.status;
				clear.push("ownerPid", "error", "endedAt");
				break;
			case "finish":
				fields.status = record.status;
				fields.endedAt = record.endedAt;
				if (record.error === undefined) clear.push("error");
				else fields.error = record.error;
				clear.push("ownerPid");
				break;
			case "observation":
				fields.status = record.status;
				if (record.endedAt !== undefined) fields.endedAt = record.endedAt;
				if (record.error === undefined) clear.push("error");
				else fields.error = record.error;
				break;
		}
		await publication.checkpoint({
			phase: "update",
			reason,
			origin: { kind: "session", taskId: record.taskId, modeId: this.modeId, sessionId: this.id },
			expectedMembership: { kind: "present", taskId: record.taskId, modeId: this.modeId, sessionId: this.id },
			previous,
			record,
			applyTo: (current) => this.applyLifecycleFields(current, fields, clear),
		});
		this.currentRecord = record;
	}

	private applyLifecycleFields(
		current: AgentSession,
		fields: Partial<AgentSession>,
		clear: (keyof AgentSession)[],
	): AgentSession {
		const result = { ...current, ...fields };
		for (const key of clear) delete result[key];
		return result;
	}

	private publish(event: RunningExecutionEvent, execution: RunningExecution): void {
		const capability = {
			"turn-completed": execution.events.turnCompleted,
			"permission-wait": execution.events.permissionWait,
			"execution-exit": execution.events.executionExit,
			activity: execution.events.activity,
		}[event.kind];
		if (capability !== "supported") return;
		if (event.kind === "execution-exit") {
			this.executionExitObserved = true;
			const failed = event.exitCode !== undefined && event.exitCode !== 0;
			this.currentRecord = {
				...this.currentRecord,
				status: failed ? AGENT_SESSION_STATUS.FAILED : AGENT_SESSION_STATUS.STOPPED,
				endedAt: new Date().toISOString(),
				...(failed ? { error: `Execution exited with code ${event.exitCode}` } : { error: undefined }),
			};
			this.releaseExecution(execution);
		}
		const snapshot = { ...this.currentRecord };
		const executionIdentity = execution.identity;
		for (const listener of this.listeners)
			listener({ ...event, status: snapshot.status, executionIdentity, record: snapshot });
	}
}
