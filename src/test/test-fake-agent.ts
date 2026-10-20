import { randomUUID } from "node:crypto";
import type { AgentBootstrap } from "../model/session/types.ts";
import {
	type AgentPreparation,
	type AskCommandRequest,
	appendArguments,
	filePrompt,
	type HarnessInterface,
	type LaunchCommandRequest,
	type NativeIdentity,
	type PreparationResources,
	type ResumeCommandRequest,
	type SessionIntent,
	type StatusHookInstallOptions,
	shellQuote,
} from "../runtime/agents/core/agent.ts";
import { harnessRegistry } from "../runtime/agents/startup.ts";
import type { InstalledStatusHook } from "../runtime/status-hooks.ts";
import { expandPromptPresetCommand } from "./prompt-preset-command.ts";

/**
 * Test-only stand-in for the retired generic `prompt` bootstrap. It reproduces the old prompt
 * preset's exact placeholder handling and refusal messages so the affected unit tests keep their
 * original intent after the agent registry replaced the per-provider switch statements.
 */
class PromptInjectionAgent implements HarnessInterface {
	readonly supported = true;
	readonly hookBacked = false;
	readonly prepareBeforeAsk = false;
	readonly chromeRules = [];
	readonly nativeNamespace = "claude" as const;

	constructor(readonly name: AgentBootstrap) {}

	yoloFlag(): string | undefined {
		return undefined;
	}

	sanitizeLaunchPreset(preset: import("../model/session/types.ts").AgentPreset) {
		return preset;
	}

	launchCommand({ preset, bootstrapPath }: LaunchCommandRequest): string {
		if (!preset.command.includes("{prompt}") && !preset.command.includes("{instructions}")) {
			throw new Error("Custom agent commands must include {prompt} or {instructions} to receive session instructions.");
		}
		const prompt = filePrompt(bootstrapPath);
		return expandPromptPresetCommand(preset.command, prompt);
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
		const withSkill = { ...preset, command: preset.command.map((arg) => arg.replaceAll("{skill}", skillPath)) };
		const command =
			intent.kind === "resume"
				? this.resumeCommand({ preset: withSkill, nativeSessionId: intent.nativeSessionId })
				: this.launchCommand({ preset: withSkill, bootstrapPath });
		const id = intent.kind === "resume" ? intent.nativeSessionId : (sessionId ?? randomUUID());
		return { command, env, identity: { id, basis: "client-established" } };
	}

	async reconcileIdentity({
		intent,
		preparedIdentity,
	}: import("../runtime/agents/core/agent.ts").IdentityCaptureRequest): Promise<NativeIdentity> {
		const identity =
			preparedIdentity ??
			(intent.kind === "resume" ? { id: intent.nativeSessionId, basis: "client-established" as const } : undefined);
		if (!identity) throw new Error("Fake agent launch did not provide a prepared native identity.");
		return identity;
	}

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
	const original = harnessRegistry.forPreset(name);
	harnessRegistry.replace(new PromptInjectionAgent(name));
	return () => harnessRegistry.replace(original);
}
