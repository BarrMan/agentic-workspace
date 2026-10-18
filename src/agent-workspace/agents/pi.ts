import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { appendArguments, filePrompt } from "../bootstrap.ts";
import type { InstalledStatusHook } from "../status-hooks.ts";
import type { ModeProfile } from "../types.ts";
import {
	type Agent,
	type AgentPreparation,
	type AskCommandRequest,
	type LaunchCommandRequest,
	type LaunchOrigin,
	type NativeIdentity,
	type PreparationResources,
	quotedAskArguments,
	type ResumeCommandRequest,
	readinessReceipts,
	type SessionIntent,
	type StatusHookInstallOptions,
	shellQuote,
} from "./agent.ts";
import { PI_CHROME_RULES } from "./chrome-rules.ts";
import { discoverModels, withExplicitModel } from "./profile.ts";

/** Pi extension source. Non-throwing, same contract as the OpenCode plugin. */
export function piExtensionSource(statusDir: string, launchDirectory = ""): string {
	return `// agentic-workspace-hooks
// Process-scoped status emitter. Installed inside AgenticWorkspace's owned temp dir and removed with it.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATUS_DIR = ${JSON.stringify(statusDir)};
const LAUNCH_DIRECTORY = ${JSON.stringify(launchDirectory)};

function emit(status) {
  try {
    if (!STATUS_DIR || !existsSync(join(STATUS_DIR, ".agentic-workspace-launch-owner"))) return;
    writeFileSync(join(STATUS_DIR, "status"), status, { mode: 0o600 });
  } catch {
    // A throwing extension can block the agent's tool calls; never propagate.
  }
}

export default function agenticWorkspaceStatus(pi) {
  try {
    pi.on("session_start", (_event, ctx) => {
      emit("idle");
      try {
        const sessionId = ctx.sessionManager.getSessionId();
        if (LAUNCH_DIRECTORY && sessionId) writeFileSync(join(LAUNCH_DIRECTORY, "initialized"), sessionId, { mode: 0o600 });
      } catch {}
    });
    pi.on("before_agent_start", (event, ctx) => {
      try {
        if (typeof event?.prompt !== "string") return;
        const sessionId = ctx.sessionManager.getSessionId();
        if (LAUNCH_DIRECTORY && sessionId) writeFileSync(join(LAUNCH_DIRECTORY, "prompt-accepted"), sessionId, { mode: 0o600 });
      } catch {}
    });
    pi.on("tool_call", () => emit("running"));
    pi.on("turn_end", () => emit("idle"));
    pi.on("agent_end", () => emit("idle"));
    pi.on("session_shutdown", () => emit("idle"));
  } catch {
    // Never throw while wiring lifecycle handlers.
  }
}
`;
}

export class PiAgent implements Agent {
	readonly name = "pi";
	readonly events = {
		turnCompleted: "supported",
		permissionWait: "unsupported",
		executionExit: "supported",
		activity: "supported",
	} as const;
	readonly supported = true;
	readonly hookBacked = true;
	readonly chromeRules = PI_CHROME_RULES;
	readonly nativeNamespace = "pi" as const;
	readonly prepareBeforeAsk = false;

	sanitizeLaunchPreset(preset: import("../types.ts").AgentPreset): import("../types.ts").AgentPreset {
		return preset;
	}

	discoverModels(request: import("./agent.ts").ModelDiscoveryRequest) {
		return discoverModels("pi", request.command, request.env, request.timeoutMs);
	}

	prepareProfile(profile: ModeProfile, preset: import("../types.ts").AgentPreset) {
		return profile.model.kind === "explicit" ? withExplicitModel(preset, profile.model.id) : preset;
	}

	yoloFlag(): string | undefined {
		return undefined;
	}

	launchCommand({ preset, bootstrapPath, nativeSessionId }: LaunchCommandRequest): string {
		const prompt = filePrompt(bootstrapPath);
		return appendArguments(
			preset.command,
			nativeSessionId ? `--session-id ${shellQuote(nativeSessionId)} ${prompt}` : prompt,
		);
	}

	resumeCommand({ preset, nativeSessionId }: ResumeCommandRequest): string {
		if (!nativeSessionId) {
			throw new Error("Cannot resume this agent without its exact native session ID; start a new session instead.");
		}
		const resumeFlag = preset.resumeFlag ?? "--session";
		if (!resumeFlag.trim() || resumeFlag.includes("\0")) {
			throw new Error("Agent resumeFlag must be a non-empty string without NUL bytes.");
		}
		return appendArguments(preset.command, `${shellQuote(resumeFlag)} ${shellQuote(nativeSessionId)}`);
	}

	askCommand({ preset, nativeSessionId, question }: AskCommandRequest): string {
		return appendArguments(preset.command, `-p --session ${quotedAskArguments(nativeSessionId, question)}`);
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const { preset, directory, skillPath, statusDir, sessionId, env, bootstrapPath, intent } = request;
		// pi --skill loads this session-local SKILL.md without writing user or project settings.
		let base = `${preset.command} --skill ${shellQuote(skillPath)}`;
		const identity: NativeIdentity =
			intent.kind === "resume"
				? { id: intent.nativeSessionId, basis: "client-established" }
				: { id: randomUUID(), basis: "client-established" };
		if (statusDir) {
			// https://pi.dev/docs/latest/extensions: --extension loads one file for the session.
			const installed = await this.installStatusHooks({ pluginDir: directory, statusDir, sessionId }, identity.id);
			base += installed.args.map((argument) => ` ${shellQuote(argument)}`).join("");
		}
		const withIdentity = { ...preset, command: base };
		const command =
			intent.kind === "resume"
				? this.resumeCommand({ preset: withIdentity, nativeSessionId: identity.id })
				: this.launchCommand({ preset: withIdentity, bootstrapPath, nativeSessionId: identity.id });
		return { command, env, identity };
	}

	readiness(intent: SessionIntent, launchDirectory: string, identity?: NativeIdentity) {
		return readinessReceipts(intent, launchDirectory, identity);
	}

	async reconcileIdentity(
		_origin: LaunchOrigin,
		_publish: (identity: NativeIdentity) => Promise<void>,
	): Promise<void> {}

	async preflightLaunch(request: import("./agent.ts").AgentPreflightRequest): Promise<void> {
		if (request.resume) this.resumeCommand(request);
		else this.launchCommand(request);
	}

	async installStatusHooks(
		{ pluginDir, statusDir }: StatusHookInstallOptions,
		_nativeSessionId?: string,
	): Promise<InstalledStatusHook> {
		// The sidecar is the deterministic per-session directory; the hook file lives in the temp dir.
		await mkdir(statusDir, { recursive: true, mode: 0o700 });
		const path = join(pluginDir, "agentic-workspace-status-extension.ts");
		await writeFile(path, piExtensionSource(statusDir, pluginDir), { mode: 0o600 });
		return { provider: "pi", paths: [path], env: {}, args: ["--extension", path] };
	}
}
