import type {
	AgentSession,
	ExecutionIdentity,
	ModeId,
	PreparedSessionStop,
	RetainedSessionObservation,
	RunningExecution,
	RunningExecutionEvent,
	SessionActivity,
	SessionAskContext,
	SessionLaunchContext,
	SessionSnapshot,
	TerminalAttachment,
	Unsubscribe,
} from "./types.ts";
/** Provider and execution-host operations are kept behind this SessionRuntime boundary. */
export interface SessionRuntime {
	start(context: SessionLaunchContext): Promise<RunningExecution>;
	resume(providerSessionId: string, context: SessionLaunchContext): Promise<RunningExecution>;
	stop(execution: RunningExecution): Promise<void>;
	observe(execution: RunningExecution, listener: (event: RunningExecutionEvent) => void): Unsubscribe;
	observeRetained(record: Readonly<AgentSession>): Promise<RetainedSessionObservation>;
	observeRetainedActivity?(record: Readonly<AgentSession>): Promise<SessionSnapshot>;
	prepareStop(record: Readonly<AgentSession>): Promise<PreparedSessionStop>;
	attach(record: Readonly<AgentSession>): Promise<TerminalAttachment>;
	detach(attachment: TerminalAttachment): Promise<void>;
	ask(providerSessionId: string, context: SessionAskContext): Promise<{ readonly answer: string }>;
}
export interface RecoverableExecutionFailure extends Error {
	readonly execution?: RunningExecution;
	readonly identity?: ExecutionIdentity;
}
export class Session {
	readonly id: string;
	private currentRecord: Readonly<AgentSession>;
	private currentExecution?: RunningExecution;
	private providerSessionId?: string;
	private snapshot: SessionSnapshot = { state: "stopped", activity: "unknown", idleSince: null };
	private currentModeId: ModeId;
	private readonly runtime: SessionRuntime;
	private stopObserving?: Unsubscribe;
	private disposed = false;
	private retainedObservation: RetainedSessionObservation = "absent";

	constructor(record: Readonly<AgentSession>, modeId: ModeId, runtime: SessionRuntime) {
		this.id = record.id;
		this.currentRecord = record;
		this.providerSessionId = record.nativeSessionId;
		this.currentModeId = modeId;
		this.runtime = runtime;
	}

	get record(): Readonly<AgentSession> {
		return this.currentRecord;
	}

	get modeId(): ModeId {
		return this.currentModeId;
	}

	replaceLoadedRecord(record: Readonly<AgentSession>, modeId: ModeId): void {
		this.currentRecord = record;
		this.providerSessionId = record.nativeSessionId;
		this.currentModeId = modeId;
	}

	/** Membership changes do not replace the execution or its launch identity. */
	moveToMode(modeId: ModeId): void {
		this.currentModeId = modeId;
	}

	get execution(): RunningExecution | undefined {
		return this.currentExecution;
	}

	get view(): SessionSnapshot {
		return this.snapshot;
	}

	get executionOwnership(): "current" | "external" | "none" | "unknown" {
		if (this.currentExecution) return "current";
		if (this.retainedObservation === "live") return "external";
		return this.retainedObservation === "absent" ? "none" : "unknown";
	}

	async start(context: SessionLaunchContext): Promise<void> {
		this.assertMode(context);
		try {
			const execution = await this.runtime.start(context);
			this.installExecution(execution, { state: "running", activity: "working", idleSince: null });
		} catch (error) {
			this.retainFailedExecution(error);
			throw error;
		}
	}

	async resume(context: SessionLaunchContext): Promise<void> {
		this.assertMode(context);
		if (!this.providerSessionId) throw new Error(`Session ${this.id} has no retained provider conversation`);
		if ((await this.observeRetained()).state !== "stopped")
			throw new Error(`Session ${this.id} is not positively stopped; refusing resume.`);
		this.snapshot = { state: "starting", activity: "unknown", idleSince: null };
		try {
			const execution = await this.runtime.resume(this.providerSessionId, context);
			this.installExecution(execution, { state: "parked", activity: "unknown", idleSince: null });
		} catch (error) {
			this.snapshot = { state: "unknown", activity: "unknown", idleSince: null };
			this.retainFailedExecution(error);
			throw error;
		}
	}

	async stop(): Promise<void> {
		const execution = this.currentExecution;
		if (!execution) throw new Error(`Session ${this.id} requires prepared stop without a current execution.`);
		await this.stopCurrent(execution);
	}

	async observeRetained(): Promise<SessionSnapshot> {
		if (this.currentExecution) return this.snapshot;
		this.retainedObservation = await this.runtime.observeRetained(this.currentRecord);
		this.snapshot =
			this.retainedObservation === "absent"
				? { state: "stopped", activity: "unknown", idleSince: null }
				: this.retainedObservation === "live"
					? { state: "parked", activity: "unknown", idleSince: null }
					: { state: "unknown", activity: "unknown", idleSince: null };
		if (this.retainedObservation === "live" && this.runtime.observeRetainedActivity)
			this.snapshot = await this.runtime.observeRetainedActivity(this.currentRecord);
		return this.snapshot;
	}

	async prepareStop(): Promise<PreparedSessionStop> {
		if (this.currentExecution) {
			const execution = this.currentExecution;
			return { stop: async () => await this.stopCurrent(execution) };
		}
		const prepared = await this.runtime.prepareStop(this.currentRecord);
		return { stop: async () => await this.stopPrepared(prepared) };
	}

	async ask(context: SessionAskContext): Promise<{ readonly answer: string }> {
		if (!this.providerSessionId) throw new Error(`Session ${this.id} has no retained provider conversation`);
		return await this.runtime.ask(this.providerSessionId, context);
	}

	private retainFailedExecution(error: unknown): void {
		const execution = error instanceof Error ? (error as RecoverableExecutionFailure).execution : undefined;
		if (!execution) return;
		this.installExecution(execution, { state: "unknown", activity: "unknown", idleSince: null }, false);
	}

	private installExecution(execution: RunningExecution, snapshot: SessionSnapshot, observe = true): void {
		const previous = this.currentExecution;
		this.releaseExecution(previous);
		this.currentExecution = execution;
		this.snapshot = snapshot;
		const providerSessionId = execution.providerConversationId ?? execution.identity.nativeSessionId;
		if (providerSessionId) {
			this.providerSessionId = providerSessionId;
			this.currentRecord = { ...this.currentRecord, nativeSessionId: providerSessionId };
		}
		if (this.disposed || !observe) return;
		this.stopObserving = this.runtime.observe(execution, (event) => {
			if (this.currentExecution !== execution || this.disposed) return;
			this.handleExecutionEvent(event, execution);
		});
	}

	private releaseExecution(execution: RunningExecution | undefined): void {
		if (!execution) return;
		this.stopObserving?.();
		this.stopObserving = undefined;
		execution.teardownListeners();
		if (this.currentExecution === execution) this.currentExecution = undefined;
	}

	private async stopCurrent(execution: RunningExecution): Promise<void> {
		if (!this.currentExecution && this.snapshot.state === "stopped") return;
		if (this.currentExecution !== execution) throw new Error(`Session ${this.id} execution changed before stop.`);
		await this.runtime.stop(execution);
		this.releaseExecution(execution);
		this.snapshot = { state: "stopped", activity: "unknown", idleSince: null };
		this.retainedObservation = "absent";
	}

	private async stopPrepared(prepared: PreparedSessionStop): Promise<void> {
		await prepared.stop();
		this.snapshot = { state: "stopped", activity: "unknown", idleSince: null };
		this.retainedObservation = "absent";
	}

	private handleExecutionEvent(event: RunningExecutionEvent, execution: RunningExecution): void {
		const capability = {
			"turn-completed": execution.events.turnCompleted,
			"permission-wait": execution.events.permissionWait,
			"execution-exit": execution.events.executionExit,
			activity: execution.events.activity,
		}[event.kind];
		if (capability !== "supported") return;
		if (event.kind === "execution-exit") {
			this.snapshot = { state: "stopped", activity: "unknown", idleSince: null };
			this.releaseExecution(execution);
		} else {
			const activity = this.normalizedActivity(event);
			this.snapshot = {
				state: this.snapshot.state === "unknown" ? "unknown" : "running",
				activity,
				idleSince:
					activity === "idle" ? (this.snapshot.activity === "idle" ? this.snapshot.idleSince : event.observedAt) : null,
			};
		}
	}

	private assertMode(context: SessionLaunchContext): void {
		if (this.modeId !== context.modeId) throw new Error(`Session ${this.id} belongs to another mode`);
	}

	private normalizedActivity(event: RunningExecutionEvent): SessionActivity {
		if (event.kind === "turn-completed") return "idle";
		if (event.kind === "permission-wait") return "waiting";
		switch (event.activity) {
			case "running":
				return "working";
			case "waiting":
				return "waiting";
			case "idle":
				return "idle";
			default:
				return "unknown";
		}
	}
}
