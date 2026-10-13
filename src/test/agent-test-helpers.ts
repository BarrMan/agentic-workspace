import { randomUUID } from "node:crypto";
import type {
	Agent,
	AgentPreparation,
	AskCommandRequest,
	LaunchCommandRequest,
	LaunchOrigin,
	NativeIdentity,
	PreparationResources,
	ResumeCommandRequest,
	SessionIntent,
	StatusHookInstallOptions,
} from "../agent-workspace/agents/agent.ts";
import { shellQuote } from "../agent-workspace/agents/agent.ts";
import { registerAgent } from "../agent-workspace/agents/agents.ts";
import { filePrompt } from "../agent-workspace/bootstrap.ts";
import type { InstalledStatusHook } from "../agent-workspace/status-hooks.ts";

/**
 * Test-only stand-in for the retired generic `prompt` bootstrap.
 *
 * It reproduces the old generic behavior: `{prompt}`/`{instructions}` expand to the session
 * bootstrap file, `{skill}` expands to the session-local SKILL.md, the agent is deliberately not
 * hook-backed (no status sidecar), and it exposes no native resume identity. Registered under a
 * built-in name because `AgentBootstrap` is now a closed set; every test file runs in its own
 * process, so overwriting a built-in there never leaks into another file.
 */
export class PromptAgent implements Agent {
	readonly supported = true;
	readonly hookBacked = false;
	readonly prepareBeforeAsk = false;
	readonly chromeRules = [];
	readonly nativeNamespace = "pi" as const;

	sanitizeLaunchPreset(
		preset: import("../agent-workspace/types.ts").AgentPreset,
	): import("../agent-workspace/types.ts").AgentPreset {
		return preset;
	}

	constructor(readonly name: string) {}

	yoloFlag(): string | undefined {
		return undefined;
	}

	launchCommand({ preset, bootstrapPath }: LaunchCommandRequest): string {
		const prompt = filePrompt(bootstrapPath);
		if (!preset.command.includes("{prompt}") && !preset.command.includes("{instructions}")) {
			throw new Error("Custom agent commands must include {prompt} or {instructions} to receive session instructions.");
		}
		return preset.command.replaceAll("{prompt}", prompt).replaceAll("{instructions}", prompt);
	}

	resumeCommand(_request: ResumeCommandRequest): string {
		throw new Error("Custom prompt agent commands do not define a native resume command.");
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const withSkill = {
			...request.preset,
			command: request.preset.command.replaceAll("{skill}", shellQuote(request.skillPath)),
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

	async reconcileIdentity(
		_origin: LaunchOrigin,
		_publish: (identity: NativeIdentity) => Promise<void>,
	): Promise<void> {}

	askCommand(_request: AskCommandRequest): string {
		throw new Error("Custom prompt agent commands do not define a native resume command.");
	}

	async installStatusHooks(_options: StatusHookInstallOptions): Promise<InstalledStatusHook> {
		return { provider: "pi", paths: [], env: {}, args: [] };
	}
}

/** Register the generic prompt agent under one built-in bootstrap name for this test process. */
export function registerPromptAgent(name = "pi"): void {
	registerAgent(new PromptAgent(name));
}
