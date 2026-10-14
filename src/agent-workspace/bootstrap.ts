import { shellQuote } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import type { AgentBootstrap, AgentPreset } from "./types.ts";

export interface SessionBootstrapInput {
	taskId: string;
}

export function filePrompt(bootstrapPath: string): string {
	return `"$(cat -- ${shellQuote(bootstrapPath)})"`;
}

export function appendArguments(command: string, arguments_: string): string {
	if (/[|;&\n]/.test(command)) {
		throw new Error(
			"Built-in agent commands must be an executable with flags, not a shell pipeline or compound command.",
		);
	}
	return `${command} ${arguments_}`;
}

/**
 * The provider's verified auto-approval flag, or `undefined` when the provider has no documented
 * flag. Returning `undefined` is deliberate: AgenticWorkspace never invents a flag for a provider whose
 * auto-approval option is not confirmed.
 */
export function yoloFlagFor(bootstrap: AgentBootstrap): string | undefined {
	return agentFor(bootstrap)?.yoloFlag();
}

/** Startup supplies identity only; task work begins after an explicit user request. */
export function renderSessionBootstrap(input: SessionBootstrapInput): string {
	return `Active task: ${input.taskId}.\nWait for user instructions.`;
}

/**
 * Returns a shell command that starts an agent conversation.
 * Versioned OpenCode adapters start interactively; the startup brief is read at launch time.
 * File contents never become shell source.
 */
export function buildAgentLaunchCommand(preset: AgentPreset, bootstrapPath: string, nativeSessionId?: string): string {
	const agent = agentFor(preset.bootstrap);
	if (!agent) throw new Error(`No agent registered for bootstrap type ${preset.bootstrap}.`);
	return agent.launchCommand({ preset, bootstrapPath, nativeSessionId });
}

export function buildAgentResumeCommand(preset: AgentPreset, nativeSessionId?: string): string {
	const agent = agentFor(preset.bootstrap);
	if (!agent) throw new Error(`No agent registered for bootstrap type ${preset.bootstrap}.`);
	return agent.resumeCommand({ preset, nativeSessionId });
}
