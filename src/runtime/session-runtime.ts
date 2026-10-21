import type { SessionRuntime } from "../model/session/session.ts";
import type {
	AgentSession,
	HarnessProvider,
	PreparedSessionStop,
	RetainedSessionObservation,
	RunningExecution,
	RunningExecutionEvent,
	SessionAskContext,
	SessionLaunchContext,
	TerminalAttachment,
	Unsubscribe,
} from "../model/session/types.ts";
import { askSavedConversation } from "./session-ask.ts";
import type { ProcessRunner, SessionProcess } from "./session-process.ts";

/** Adapts the provider boundary to the model-owned Session runtime port. */
export class HarnessSessionRuntime implements SessionRuntime {
	constructor(
		private readonly harness: HarnessProvider,
		private readonly process: SessionProcess,
		private readonly runner: ProcessRunner,
	) {}

	start(context: SessionLaunchContext): Promise<RunningExecution> {
		return this.harness.launch(context);
	}

	resume(providerSessionId: string, context: SessionLaunchContext): Promise<RunningExecution> {
		return this.harness.resume(providerSessionId, context);
	}

	stop(execution: RunningExecution): Promise<void> {
		return execution.stop();
	}

	observe(execution: RunningExecution, listener: (event: RunningExecutionEvent) => void): Unsubscribe {
		return execution.observe(listener);
	}

	async observeRetained(record: Readonly<AgentSession>): Promise<RetainedSessionObservation> {
		try {
			const observed = await this.process.nativeRuntimeClassification(record);
			return observed.status === "live"
				? "live"
				: observed.status === "missing" || observed.status === "dead"
					? "absent"
					: "unknown";
		} catch {
			return "unknown";
		}
	}

	async prepareStop(record: Readonly<AgentSession>): Promise<PreparedSessionStop> {
		return await this.process.prepareStop(record);
	}

	async attach(record: Readonly<AgentSession>): Promise<TerminalAttachment> {
		const target = await this.process.terminalTarget(record);
		return {
			record,
			...target,
			outputPath: record.outputPath,
			bootstrap: (await Bun.file(record.bootstrapPath).exists()) ? await Bun.file(record.bootstrapPath).text() : "",
		};
	}

	async detach(_attachment: TerminalAttachment): Promise<void> {
		// The renderer owns the terminal host. Detaching it must not affect execution.
	}

	ask(providerSessionId: string, context: SessionAskContext): Promise<{ readonly answer: string }> {
		return askSavedConversation(this.runner, { ...context, providerSessionId });
	}
}
