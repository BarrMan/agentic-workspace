import { resolveCallingMode } from "../model/session/mode-model.ts";

export interface CallingSessionIdentity {
	taskId?: string;
	sessionId?: string;
}

/** Constructed inside Controller with its private session store and shared operations. */
export class CallingSessionOperations {
	constructor(
		private readonly readState: (taskId: string) => Promise<{ modes: Parameters<typeof resolveCallingMode>[1] }>,
		private readonly askPrevious: (taskId: string, modeId: string, question: string) => Promise<{ answer: string }>,
		private readonly setModeModel: (modeId: string, modelId: string) => Promise<void>,
	) {}

	async ask(taskId: string, question: string, caller: CallingSessionIdentity): Promise<{ answer: string }> {
		const modeId = await this.mode(taskId, caller);
		return await this.askPrevious(taskId, modeId, question);
	}

	async setModel(modelId: string, caller: CallingSessionIdentity): Promise<void> {
		if (!caller.taskId) throw new Error("A valid calling workspace conversation context is required.");
		await this.setModeModel(await this.mode(caller.taskId, caller), modelId);
	}

	private async mode(taskId: string, caller: CallingSessionIdentity): Promise<string> {
		return resolveCallingMode(
			caller.sessionId ? { sessionId: caller.sessionId } : undefined,
			(await this.readState(taskId)).modes,
		);
	}
}
