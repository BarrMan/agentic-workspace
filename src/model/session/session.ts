import type {
	AgentActivity,
	AgentSession,
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
	prepareStop(record: Readonly<AgentSession>): Promise<PreparedSessionStop>;
	attach(record: Readonly<AgentSession>): Promise<TerminalAttachment>;
	detach(attachment: TerminalAttachment): Promise<void>;
	ask(providerSessionId: string, context: SessionAskContext): Promise<{ readonly answer: string }>;
}
export interface SessionEvent {
	readonly kind: "turn-completed" | "permission-wait" | "execution-exit" | "activity";
	readonly activity?: AgentActivity;
	readonly executionIdentity: RunningExecution["identity"];
	readonly snapshot: SessionSnapshot;
}

export class Session {
	readonly id: string;
	private currentRecord: Readonly<AgentSession>;
	private currentExecution?: RunningExecution;
	private providerSessionId?: string;
	private snapshot: SessionSnapshot = { state: "stopped", activity: "unknown", idleSince: null };
	private readonly modeId: ModeId;
	private readonly runtime: SessionRuntime;
	private stopObserving?: Unsubscribe;
	private readonly listeners = new Set<(event: SessionEvent) => void>();
	private disposed = false;
	private retainedObservation: RetainedSessionObservation = "absent";

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
		const execution = await this.runtime.start(context);
		this.installExecution(execution, { state: "running", activity: "working", idleSince: null });
	}

	async resume(context: SessionLaunchContext): Promise<void> {
		this.assertMode(context);
		if (!this.providerSessionId) throw new Error(`Session ${this.id} has no retained provider conversation`);
		this.snapshot = { state: "starting", activity: "unknown", idleSince: null };
		const execution = await this.runtime.resume(this.providerSessionId, context);
		this.installExecution(execution, { state: "parked", activity: "unknown", idleSince: null });
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

	async attach(): Promise<TerminalAttachment> {
		return await this.runtime.attach(this.currentRecord);
	}

	async detach(attachment: TerminalAttachment): Promise<void> {
		await this.runtime.detach(attachment);
	}

	subscribe(listener: (event: SessionEvent) => void): Unsubscribe {
		if (this.disposed) return () => {};
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	serialize(): AgentSession {
		return { ...this.currentRecord };
	}

	private installExecution(execution: RunningExecution, snapshot: SessionSnapshot): void {
		const previous = this.currentExecution;
		this.releaseExecution(previous);
		this.currentExecution = execution;
		this.snapshot = snapshot;
		const providerSessionId = execution.providerConversationId ?? execution.identity.nativeSessionId;
		if (providerSessionId) {
			this.providerSessionId = providerSessionId;
			this.currentRecord = { ...this.currentRecord, nativeSessionId: providerSessionId };
		}
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

	private async stopCurrent(execution: RunningExecution): Promise<void> {
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

	private publish(event: RunningExecutionEvent, execution: RunningExecution): void {
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
		const executionIdentity = execution.identity;
		for (const listener of this.listeners) listener({ ...event, executionIdentity, snapshot: { ...this.snapshot } });
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
