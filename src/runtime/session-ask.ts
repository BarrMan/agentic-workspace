import type { AgentPreset, ModeProfile } from "../model/session/types.ts";
import { prepareAgentAsk } from "./session-launch.ts";
import type { ProcessRunner } from "./session-process.ts";

export interface SavedConversationAskRequest {
	readonly preset: AgentPreset;
	readonly providerSessionId: string;
	readonly question: string;
	readonly profile: ModeProfile;
	readonly roots: {
		readonly repositoryRoot: string;
		readonly taskRoot: string;
		readonly cwd: string;
		readonly taskId?: string;
		readonly modeId?: string;
		readonly sessionId?: string;
	};
}

export interface SavedConversationAskResult {
	readonly answer: string;
}

/** Send one question to an exact provider conversation and return only its completed answer. */
export async function askSavedConversation(
	runner: ProcessRunner,
	request: SavedConversationAskRequest,
): Promise<SavedConversationAskResult> {
	if (!request.providerSessionId.trim())
		throw new Error("Saved conversation ask requires an exact provider session ID.");
	const prepared = await prepareAgentAsk(
		request.preset,
		request.providerSessionId,
		request.question,
		request.profile,
		request.roots,
	);
	let primary: unknown;
	let failed = false;
	let answer: string | undefined;
	try {
		const result = await runner.run(["/bin/sh", "-lc", prepared.command], {
			cwd: request.roots.cwd,
			env: prepared.env,
		});
		if (result.timedOut) throw new Error("Saved conversation did not return a completed answer before interruption.");
		if (result.exitCode !== 0) {
			const detail = (result.stderr || result.stdout).trim();
			throw new Error(
				detail ? `Saved conversation could not answer: ${detail}` : "Saved conversation could not answer.",
			);
		}
		answer = result.stdout.trim();
		if (!answer) throw new Error("Saved conversation returned no completed answer.");
	} catch (error) {
		primary = error;
		failed = true;
	}
	try {
		await prepared.cleanup();
	} catch (cleanupError) {
		if (failed)
			throw new AggregateError([primary, cleanupError], "Saved conversation failed and ask cleanup failed.", {
				cause: primary,
			});
		throw cleanupError;
	}
	if (failed) throw primary;
	if (answer === undefined) throw new Error("Saved conversation returned no completed answer.");
	return { answer };
}
