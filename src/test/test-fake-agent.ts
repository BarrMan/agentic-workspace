import { randomUUID } from "node:crypto";
import type { AgentBootstrap } from "../model/session/types.ts";
import {
	type Agent,
	type AgentPreparation,
	type AskCommandRequest,
	appendArguments,
	filePrompt,
	type LaunchCommandRequest,
	type LaunchOrigin,
	type NativeIdentity,
	type PreparationResources,
	type ResumeCommandRequest,
	type SessionIntent,
	type StatusHookInstallOptions,
	shellQuote,
} from "../runtime/agents/agent.ts";
import { builtInAgents, registerAgent } from "../runtime/agents/agents.ts";
import type { InstalledStatusHook } from "../runtime/status-hooks.ts";

/**
 * Test-only stand-in for the retired generic `prompt` bootstrap. It reproduces the old prompt
 * preset's exact placeholder handling and refusal messages so the affected unit tests keep their
 * original intent after the agent registry replaced the per-provider switch statements.
 */
class PromptInjectionAgent implements Agent {
	readonly supported = true;
	readonly hookBacked = false;
	readonly prepareBeforeAsk = false;
	readonly chromeRules = [];
	readonly nativeNamespace = "claude" as const;

	sanitizeLaunchPreset(
		preset: import("../model/session/types.ts").AgentPreset,
	): import("../model/session/types.ts").AgentPreset {
		return preset;
	}

	constructor(readonly name: AgentBootstrap) {}

	yoloFlag(): string | undefined {
		return undefined;
	}

	launchCommand({ preset, bootstrapPath }: LaunchCommandRequest): string {
		if (!preset.command.includes("{prompt}") && !preset.command.includes("{instructions}")) {
			throw new Error("Custom agent commands must include {prompt} or {instructions} to receive session instructions.");
		}
		const prompt = filePrompt(bootstrapPath);
		return preset.command.replaceAll("{prompt}", prompt).replaceAll("{instructions}", prompt);
	}

	resumeCommand({ preset, nativeSessionId }: ResumeCommandRequest): string {
		if (!nativeSessionId) {
			throw new Error("Cannot resume this agent without its exact native session ID; start a new session instead.");
		}
		const resumeFlag = preset.resumeFlag;
		if (resumeFlag === undefined) {
			throw new Error("Custom prompt agent commands do not define a native resume command.");
		}
		if (!resumeFlag.trim() || resumeFlag.includes("\0")) {
			throw new Error("Agent resumeFlag must be a non-empty string without NUL bytes.");
		}
		return appendArguments(preset.command, `${shellQuote(resumeFlag)} ${shellQuote(nativeSessionId)}`);
	}

	async prepare({
		preset,
		skillPath,
		env,
		bootstrapPath,
		intent,
		sessionId,
	}: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		if (!preset.command.includes("{skill}")) {
			throw new Error(
				"Custom agent commands must include {skill} for their native skill-loader option (the temporary SKILL.md path), plus {prompt} or {instructions}. Prompt injection is not a skill.",
			);
		}
		const withSkill = { ...preset, command: preset.command.replaceAll("{skill}", shellQuote(skillPath)) };
		const command =
			intent.kind === "resume"
				? this.resumeCommand({ preset: withSkill, nativeSessionId: intent.nativeSessionId })
				: this.launchCommand({ preset: withSkill, bootstrapPath });
		const id = intent.kind === "resume" ? intent.nativeSessionId : (sessionId ?? randomUUID());
		return { command, env, identity: { id, basis: "client-established" } };
	}

	async reconcileIdentity(
		_origin: LaunchOrigin,
		_publish: (identity: NativeIdentity) => Promise<void>,
	): Promise<void> {}

	askCommand(_request: AskCommandRequest): string {
		throw new Error("Custom prompt agent commands do not define a native resume command.");
	}

	async installStatusHooks(_options: StatusHookInstallOptions): Promise<InstalledStatusHook> {
		throw new Error(
			`Provider ${this.name} has no process-scoped status-hook loader; AgenticWorkspace must not install it globally.`,
		);
	}
}

/**
 * Register the fake under a built-in bootstrap name and return a restore callback. The suite runs
 * one process per file, so replacing a built-in name is race-free; always call the returned restore
 * in a `finally` so the file's real provider tests keep working.
 */
export function usePromptInjectionAgent(name: AgentBootstrap): () => void {
	registerAgent(new PromptInjectionAgent(name));
	return () => {
		for (const agent of builtInAgents()) registerAgent(agent);
	};
}
