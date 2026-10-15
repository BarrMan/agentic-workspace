import type {
	RunningExecution,
	RunningExecutionEvent,
	Session as SessionContract,
	SessionEvent,
	SessionLaunchOperation,
	SessionPublication,
	SessionStartupCheckpointPhase,
	Unsubscribe,
} from "./session-contracts.ts";
import { AGENT_SESSION_STATUS, type AgentSession, type ModeId } from "./types.ts";

export class Session implements SessionContract {
	readonly id: string;
	private currentRecord: Readonly<AgentSession>;
	private currentExecution?: RunningExecution;
	private readonly modeId: ModeId;
	private stopObserving?: Unsubscribe;
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private disposed = false;

	constructor(record: Readonly<AgentSession>, modeId: ModeId) {
		this.id = record.id;
		this.currentRecord = record;
		this.modeId = modeId;
	}

	get record(): Readonly<AgentSession> {
		return this.currentRecord;
	}

	get execution(): RunningExecution | undefined {
		return this.currentExecution;
	}

	async start(operation: SessionLaunchOperation): Promise<void> {
		if (this.modeId !== operation.context.modeId) throw new Error(`Session ${this.id} belongs to another mode`);
		const execution = await operation.harness.launch(operation.context);
		await this.installExecution(execution);
		await this.emitCheckpoint(operation, "identity");
		await this.emitCheckpoint(operation, "ready", AGENT_SESSION_STATUS.RUNNING);
	}

	async resume(nativeId: string, operation: SessionLaunchOperation): Promise<void> {
		if (this.modeId !== operation.context.modeId) throw new Error(`Session ${this.id} belongs to another mode`);
		const execution = await operation.harness.resume(nativeId, operation.context);
		await this.installExecution(execution);
		const resumed = { ...this.currentRecord, endedAt: undefined, error: undefined };
		delete resumed.endedAt;
		delete resumed.error;
		this.currentRecord = resumed;
		await this.emitCheckpoint(operation, "identity");
		await this.emitCheckpoint(operation, "ready", AGENT_SESSION_STATUS.RUNNING);
	}

	async stop(publication: SessionPublication): Promise<void> {
		const execution = this.currentExecution;
		if (!execution) return;
		const previous = this.currentRecord;
		await execution.stop();
		this.releaseExecution(execution);
		await this.emitUpdate(publication, "stop", {
			...previous,
			status: AGENT_SESSION_STATUS.STOPPED,
			endedAt: new Date().toISOString(),
			ownerPid: undefined,
		});
	}

	bindExecution(modeId: ModeId, execution: RunningExecution): void {
		if (modeId !== this.modeId) throw new Error(`Session ${this.id} belongs to another mode`);
		this.installExecution(execution);
	}

	async activate(publication: SessionPublication): Promise<void> {
		const previous = this.currentRecord;
		await this.emitUpdate(publication, "activate", {
			...previous,
			status: AGENT_SESSION_STATUS.RUNNING,
			error: undefined,
			endedAt: undefined,
		});
	}

	async park(publication: SessionPublication): Promise<void> {
		const previous = this.currentRecord;
		await this.emitUpdate(publication, "park", {
			...previous,
			status: AGENT_SESSION_STATUS.PARKED,
			ownerPid: undefined,
			error: undefined,
			endedAt: undefined,
		});
	}

	async finish(publication: SessionPublication, error?: string): Promise<void> {
		const previous = this.currentRecord;
		await this.emitUpdate(publication, "finish", {
			...previous,
			status: error ? AGENT_SESSION_STATUS.FAILED : AGENT_SESSION_STATUS.STOPPED,
			error,
			endedAt: new Date().toISOString(),
			ownerPid: undefined,
		});
	}

	async sendKey(key: string): Promise<void> {
		if (!this.currentExecution) throw new Error(`Session ${this.id} has no running execution`);
		await this.currentExecution.sendKey(key);
	}

	async inject(text: string): Promise<void> {
		if (!this.currentExecution) throw new Error(`Session ${this.id} has no running execution`);
		await this.currentExecution.input(text);
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
		if (this.disposed) return;
		this.stopObserving = execution.observe((event) => {
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
	): Promise<void> {
		const record: AgentSession = { ...this.record, status };
		const nativeId = this.currentExecution?.providerConversationId ?? this.currentExecution?.identity.nativeSessionId;
		if (phase === "identity" && nativeId) record.nativeSessionId = nativeId;
		await publication.checkpoint({
			phase,
			origin: { kind: "session", taskId: record.taskId, modeId: this.modeId, sessionId: this.id },
			expectedMembership: {
				kind: phase === "reservation" ? "absent" : "present",
				taskId: record.taskId,
				modeId: this.modeId,
				sessionId: this.id,
			},
			record,
		});
		this.currentRecord = record;
	}

	private async emitUpdate(
		publication: SessionPublication,
		reason: "activate" | "stop" | "park" | "finish" | "observation",
		record: AgentSession,
	): Promise<void> {
		const previous = this.currentRecord;
		await publication.checkpoint({
			phase: "update",
			reason,
			origin: { kind: "session", taskId: record.taskId, modeId: this.modeId, sessionId: this.id },
			expectedMembership: { kind: "present", taskId: record.taskId, modeId: this.modeId, sessionId: this.id },
			previous,
			record,
		});
		this.currentRecord = record;
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
