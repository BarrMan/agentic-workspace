import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
	AgentPreparation,
	AskCommandRequest,
	HarnessInterface,
	LaunchCommandRequest,
	NativeIdentity,
	PreparationResources,
	ResumeCommandRequest,
	SessionIntent,
	StatusHookInstallOptions,
} from "../runtime/agents/core/agent.ts";
import { filePrompt, shellQuote } from "../runtime/agents/core/agent.ts";
import { harnessRegistry } from "../runtime/agents/startup.ts";
import type { InstalledStatusHook } from "../runtime/status-hooks.ts";
import { expandPromptPresetCommand } from "./prompt-preset-command.ts";

/** Write Pi's launch-scoped capture file from a fake process command. */
export async function writePiCapture(skillPath: string, command: string, nativeId: string): Promise<void> {
	const source = /AOE_SESSION_SOURCE=([0-9a-f-]+)/.exec(command)?.[1];
	if (source) await writeFile(join(skillPath, `session_id.${source}`), nativeId);
}

/** Contract tests use a fake process that cannot emit provider receipts. */
export function disableHarnessReadiness(): () => void {
	const originals = harnessRegistry.all();
	for (const agent of originals) {
		const fake = Object.create(agent) as HarnessInterface;
		fake.readiness = undefined;
		harnessRegistry.replace(fake);
	}
	return () => {
		for (const agent of originals) harnessRegistry.replace(agent);
	};
}

/**
 * Test-only stand-in for the retired generic `prompt` bootstrap.
 *
 * It reproduces the old generic behavior: `{prompt}`/`{instructions}` expand to the session
 * bootstrap file, `{skill}` expands to the session-local SKILL.md, the agent is deliberately not
 * hook-backed (no status sidecar), and it exposes no native resume identity. Registered under a
 * built-in name because `AgentBootstrap` is now a closed set; every test file runs in its own
 * process, so overwriting a built-in there never leaks into another file.
 */
class PromptAgent implements HarnessInterface {
	readonly supported = true;
	readonly hookBacked = false;
	readonly prepareBeforeAsk = false;
	readonly chromeRules = [];
	readonly nativeNamespace = "pi" as const;

	constructor(readonly name: string) {}

	yoloFlag(): string | undefined {
		return undefined;
	}

	sanitizeLaunchPreset(preset: import("../model/session/types.ts").AgentPreset) {
		return preset;
	}

	launchCommand({ preset, bootstrapPath }: LaunchCommandRequest): string {
		const prompt = filePrompt(bootstrapPath);
		if (!preset.command.includes("{prompt}") && !preset.command.includes("{instructions}")) {
			throw new Error("Custom agent commands must include {prompt} or {instructions} to receive session instructions.");
		}
		return expandPromptPresetCommand(preset.command, prompt);
	}

	resumeCommand(request: ResumeCommandRequest): string {
		if (!request.nativeSessionId) throw new Error("Cannot resume without a native session id.");
		return `exec ${request.preset.command.map(shellQuote).join(" ")} --resume ${shellQuote(request.nativeSessionId)}`;
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const withSkill = {
			...request.preset,
			command: request.preset.command.map((arg) => arg.replaceAll("{skill}", request.skillPath)),
		};
		const command =
			request.intent.kind === "resume"
				? this.resumeCommand({ preset: withSkill, nativeSessionId: request.intent.nativeSessionId })
				: this.launchCommand({ preset: withSkill, bootstrapPath: request.bootstrapPath });
		// A generic prompt agent has no provider-native receipt; it establishes the client-chosen
		// conversation name at prepare time so the session is immediate, not deferred.
		const id = request.intent.kind === "resume" ? request.intent.nativeSessionId : (request.sessionId ?? randomUUID());
		return { command, env: request.env, identity: { id, basis: "client-established" } };
	}

	async reconcileIdentity({
		intent,
		preparedIdentity,
	}: import("../runtime/agents/core/agent.ts").IdentityCaptureRequest): Promise<NativeIdentity> {
		const identity =
			preparedIdentity ??
			(intent.kind === "resume" ? { id: intent.nativeSessionId, basis: "client-established" as const } : undefined);
		if (!identity) throw new Error("Test agent launch did not provide a prepared native identity.");
		return identity;
	}

	askCommand(request: AskCommandRequest): string {
		return `exec ${request.preset.command.map(shellQuote).join(" ")} -p --resume ${shellQuote(request.nativeSessionId)} ${shellQuote(request.question)}`;
	}

	async installStatusHooks(_options: StatusHookInstallOptions): Promise<InstalledStatusHook> {
		return { provider: "pi", paths: [], env: {}, args: [] };
	}
}

/** Register the generic prompt agent under one built-in bootstrap name for this test process. */
export function registerPromptAgent(name = "pi"): () => void {
	const original = harnessRegistry.forPreset(name);
	harnessRegistry.replace(new PromptAgent(name));
	return () => harnessRegistry.replace(original);
}
