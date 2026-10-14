import type {
	Harness,
	LifecycleCheckpoint,
	LifecycleCheckpointSink,
	RunningExecution,
	RunningExecutionEvent,
	Session as SessionContract,
	SessionEvent,
	SessionLaunchContext,
	Unsubscribe,
} from "./session-contracts.ts";
import { AGENT_SESSION_STATUS, type AgentSession } from "./types.ts";

export class Session implements SessionContract {
	readonly id: string;
	private currentRecord: Readonly<AgentSession>;
	private currentExecution?: RunningExecution;
	private stopObserving?: Unsubscribe;
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private disposed = false;

	constructor(
		record: Readonly<AgentSession>,
		private readonly harness: Harness,
		private readonly context: SessionLaunchContext,
		private readonly checkpoint: LifecycleCheckpointSink,
	) {
		this.id = record.id;
		this.currentRecord = record;
	}

	get record(): Readonly<AgentSession> {
		return this.currentRecord;
	}

	get execution(): RunningExecution | undefined {
		return this.currentExecution;
	}

	async start(): Promise<void> {
		await this.emitCheckpoint("reservation");
		const execution = await this.harness.launch(this.context);
		await this.installExecution(execution);
		await this.emitCheckpoint("identity");
		await this.emitCheckpoint("ready", AGENT_SESSION_STATUS.RUNNING);
	}

	async resume(nativeId: string): Promise<void> {
		const execution = await this.harness.resume(nativeId, this.context);
		await this.installExecution(execution);
		await this.emitCheckpoint("identity");
		await this.emitCheckpoint("ready", AGENT_SESSION_STATUS.RUNNING);
	}

	async stop(): Promise<void> {
		if (!this.currentExecution) return;
		await this.currentExecution.stop();
		await this.emitCheckpoint("ready", AGENT_SESSION_STATUS.STOPPED);
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

	private async installExecution(execution: RunningExecution): Promise<void> {
		const previous = this.currentExecution;
		const previousUnsubscribe = this.stopObserving;
		this.currentExecution = execution;
		this.stopObserving = undefined;
		previousUnsubscribe?.();
		if (previous && previous !== execution) previous.teardownListeners();
		if (this.disposed) return;
		this.stopObserving = execution.observe((event) => {
			if (this.currentExecution !== execution || this.disposed) return;
			this.publish(event);
		});
	}

	private async emitCheckpoint(
		phase: LifecycleCheckpoint["phase"],
		status: AgentSession["status"] = this.record.status,
	): Promise<void> {
		const record: AgentSession = { ...this.record, status };
		const nativeId = this.currentExecution?.providerConversationId ?? this.currentExecution?.identity.nativeSessionId;
		if (phase === "identity" && nativeId) {
			record.nativeSessionId = nativeId;
		}
		await this.checkpoint({
			phase,
			origin: {
				kind: "session",
				taskId: this.context.taskId,
				modeId: this.context.modeId,
				sessionId: this.id,
			},
			expectedMembership: {
				kind: "present",
				taskId: this.context.taskId,
				modeId: this.context.modeId,
				sessionId: this.id,
			},
			record,
		});
		this.currentRecord = record;
	}

	private publish(event: RunningExecutionEvent): void {
		const supported = this.currentExecution?.events;
		const capability = {
			"turn-completed": supported?.turnCompleted,
			"permission-wait": supported?.permissionWait,
			"execution-exit": supported?.executionExit,
			activity: supported?.activity,
		}[event.kind];
		if (capability !== "supported") return;
		const status = event.kind === "execution-exit" ? AGENT_SESSION_STATUS.STOPPED : this.record.status;
		for (const listener of this.listeners) listener({ ...event, status });
	}
}
