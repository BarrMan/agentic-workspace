import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentPreset } from "../../../model/session/types.ts";
import type { InstalledStatusHook } from "../../status-hooks.ts";
import {
	type AgentModel,
	type AgentPreparation,
	type AskCommandRequest,
	appendArguments,
	filePrompt,
	type HarnessInterface,
	type IdentityCaptureRequest,
	type LaunchCommandRequest,
	type NativeIdentity,
	type PreparationResources,
	quotedAskArguments,
	type ResumeCommandRequest,
	readinessReceipts,
	resumeCommandWithFlag,
	type SessionIntent,
	type StatusHookInstallOptions,
	shellQuote,
} from "../core/agent.ts";
import { OPENCODE_CHROME_RULES } from "../core/chrome-rules.ts";
import { discoverModels, withExplicitModel } from "../core/profile.ts";
import { OpenCodeSessionCapture } from "./opencode-session-capture.ts";
import { openCodeBootstrapForVersion } from "./opencode-version.ts";

const NATIVE_SESSION_ID = /^ses_[A-Za-z0-9_-]+$/;

function parseOpenCodeModels(output: string): AgentModel[] {
	return output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((id) => ({ id }));
}

function parseOpenCodeConfig(content: string | undefined) {
	const config: unknown = content ? Bun.JSONC.parse(content) : {};
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		throw new Error("OPENCODE_CONFIG_CONTENT must contain a configuration object.");
	}
	const settings = config as Record<string, unknown>;
	const existing = settings.skills;
	if (existing !== undefined && (!existing || typeof existing !== "object" || Array.isArray(existing))) {
		throw new Error("OPENCODE_CONFIG_CONTENT.skills must be an object.");
	}
	const skills = (existing ?? {}) as Record<string, unknown>;
	const paths = skills.paths ?? [];
	if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
		throw new Error("OPENCODE_CONFIG_CONTENT.skills.paths must be an array of paths.");
	}
	return { settings, skills, paths: paths as string[] };
}

function openCodeSkillConfig(parsed: ReturnType<typeof parseOpenCodeConfig>, skillRoot: string): string {
	return JSON.stringify({ ...parsed.settings, skills: { ...parsed.skills, paths: [...parsed.paths, skillRoot] } });
}

/** OpenCode 1.x adapter. */
export class OpencodeV1Agent implements HarnessInterface {
	constructor(private readonly capture = new OpenCodeSessionCapture()) {}
	readonly name = "opencode-v1";
	readonly events = {
		turnCompleted: "supported",
		permissionWait: "supported",
		executionExit: "supported",
		activity: "supported",
	} as const;
	readonly supported = true;
	readonly hookBacked = true;
	readonly chromeRules = OPENCODE_CHROME_RULES;
	readonly nativeNamespace = "opencode" as const;
	readonly prepareBeforeAsk = true;

	discoverModels(request: import("../core/agent.ts").ModelDiscoveryRequest) {
		return discoverModels([...request.command, "models"], request.env, request.timeoutMs, parseOpenCodeModels);
	}

	prepareProfile(profile: import("../../../model/session/types.ts").ModeProfile, preset: AgentPreset): AgentPreset {
		return profile.model.kind === "explicit" ? withExplicitModel(preset, profile.model.id) : preset;
	}

	yoloFlag(): string | undefined {
		return "--auto";
	}

	launchCommand({ preset, bootstrapPath, nativeSessionId }: LaunchCommandRequest): string {
		return appendArguments(
			preset.command,
			nativeSessionId
				? `--session ${shellQuote(nativeSessionId)} --prompt ${filePrompt(bootstrapPath)}`
				: `--prompt ${filePrompt(bootstrapPath)}`,
		);
	}

	resumeCommand({ preset, nativeSessionId }: ResumeCommandRequest): string {
		return resumeCommandWithFlag(preset, nativeSessionId, "--session");
	}

	askCommand({ preset, nativeSessionId, question }: AskCommandRequest): string {
		return appendArguments(preset.command, `run --session ${quotedAskArguments(nativeSessionId, question)}`);
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const { env, skillRoot, directory, statusDir, sessionId, preset, intent } = request;
		const parsed = request.preflightResult as ReturnType<typeof parseOpenCodeConfig> | undefined;
		env.OPENCODE_CONFIG_CONTENT = openCodeSkillConfig(
			parsed ?? parseOpenCodeConfig(env.OPENCODE_CONFIG_CONTENT),
			skillRoot,
		);
		const identity: NativeIdentity =
			intent.kind === "resume"
				? { id: intent.nativeSessionId, basis: "client-established" }
				: { id: await this.capture.preassignSession(preset, request.cwd, env), basis: "client-established" };
		if (statusDir) {
			const installed = await this.installStatusHooks({ pluginDir: directory, statusDir, sessionId }, identity.id);
			Object.assign(env, installed.env);
		}
		return {
			command:
				intent.kind === "resume"
					? this.resumeCommand({ preset, nativeSessionId: identity.id })
					: this.launchCommand({ preset, bootstrapPath: request.bootstrapPath, nativeSessionId: identity.id }),
			env,
			identity,
		};
	}

	readiness(intent: SessionIntent, launchDirectory: string, identity?: NativeIdentity) {
		return readinessReceipts(intent, launchDirectory, identity);
	}

	async reconcileIdentity({ intent, preparedIdentity }: IdentityCaptureRequest): Promise<NativeIdentity> {
		const identity =
			preparedIdentity ??
			(intent.kind === "resume" ? { id: intent.nativeSessionId, basis: "client-established" as const } : undefined);
		if (!identity) throw new Error("OpenCode v1 launch did not provide a prepared native identity.");
		if (!NATIVE_SESSION_ID.test(identity.id))
			throw new Error("OpenCode v1 launch provided an invalid native session ID.");
		if (intent.kind === "resume" && identity.id !== intent.nativeSessionId)
			throw new Error("OpenCode v1 resume identity did not match the requested native session ID.");
		return identity;
	}

	async preflightLaunch(request: import("../core/agent.ts").AgentPreflightRequest): Promise<unknown> {
		if (request.resume) this.resumeCommand(request);
		else this.launchCommand(request);
		await assertOpenCodeV1(request.preset.command, request.cwd, request.env);
		return parseOpenCodeConfig(request.env.OPENCODE_CONFIG_CONTENT);
	}

	async installStatusHooks(
		{ pluginDir, statusDir, sessionId }: StatusHookInstallOptions,
		nativeSessionId?: string,
	): Promise<InstalledStatusHook> {
		if (!sessionId) throw new Error("OpenCode 1.19 status hooks require a AgenticWorkspace session ID.");
		await mkdir(statusDir, { recursive: true, mode: 0o700 });
		const pluginsDir = join(pluginDir, "plugins");
		await mkdir(pluginsDir, { recursive: true, mode: 0o700 });
		const path = join(pluginsDir, "agentic-workspace-status.ts");
		await writeFile(path, openCodeV1PluginSource(statusDir, sessionId, nativeSessionId, pluginDir), { mode: 0o600 });
		return { provider: "opencode-v1", paths: [path], env: { OPENCODE_CONFIG_DIR: pluginDir }, args: [] };
	}
}

/** OpenCode 1.19 plugin source for the TUI launch path. */
export function openCodeV1PluginSource(
	statusDir: string,
	agenticWorkspaceSessionId: string,
	nativeSessionId?: string,
	launchDirectory = statusDir,
): string {
	return `// agentic-workspace-hooks
// Process-scoped status plugin for OpenCode 1.19.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATUS_DIR = ${JSON.stringify(statusDir)};
const SESSION_ID = ${JSON.stringify(agenticWorkspaceSessionId)};
const NATIVE_SESSION_ID = ${JSON.stringify(nativeSessionId)};
const INITIALIZED = ${JSON.stringify(join(launchDirectory, "initialized"))};
const PROMPT_ACCEPTED = ${JSON.stringify(join(launchDirectory, "prompt-accepted"))};

function emit(status, sessionID) {
  try {
    if (!SESSION_ID || !STATUS_DIR || sessionID !== NATIVE_SESSION_ID || !existsSync(join(STATUS_DIR, ".agentic-workspace-launch-owner"))) return;
    const path = join(STATUS_DIR, "status");
    let alreadyIdle = false;
    if (status === "idle") try { alreadyIdle = readFileSync(path, "utf8") === "idle"; } catch {}
    if (!alreadyIdle) writeFileSync(path, status, { mode: 0o600 });
  } catch {
    // A throwing plugin can block the agent's tool calls; never propagate.
  }
}

function initialize(sessionID) {
  if (SESSION_ID && STATUS_DIR && sessionID === NATIVE_SESSION_ID && existsSync(join(STATUS_DIR, ".agentic-workspace-launch-owner"))) writeFileSync(INITIALIZED, sessionID, { mode: 0o600 });
}

export const AgenticWorkspaceStatus = async () => {
  return {
  event: async ({ event }) => {
    try {
      const type = event && event.type;
      if (type === "session.idle") {
        const sessionID = event.properties && event.properties.sessionID;
        initialize(sessionID);
        emit("idle", sessionID);
      } else if (type === "session.created") {
        const sessionID = event.properties && event.properties.sessionID;
        initialize(sessionID);
      } else if (type === "session.error") {
        emit("error", event.properties && event.properties.sessionID);
      } else if (type === "session.status") {
        const status = event.properties && event.properties.status;
        const sessionID = event.properties && event.properties.sessionID;
        if (status && (status.type === "busy" || status.type === "idle")) initialize(sessionID);
        if (status && status.type === "busy") emit("running", sessionID);
        else if (status && status.type === "idle") emit("idle", sessionID);
      } else if (type === "permission.updated") {
        emit("waiting", event.properties && event.properties.sessionID);
      }
    } catch {
      // Never throw from an event handler.
    }
  },
  "permission.ask": async (input) => emit("waiting", input && input.sessionID),
  "tool.execute.before": async (input) => emit("running", input && input.sessionID),
  "chat.message": async (input) => {
    try {
      const sessionID = input && input.sessionID;
      initialize(sessionID);
      if (sessionID === NATIVE_SESSION_ID && existsSync(join(STATUS_DIR, ".agentic-workspace-launch-owner"))) writeFileSync(PROMPT_ACCEPTED, sessionID, { mode: 0o600 });
      emit("running", sessionID);
    } catch {
      // Never throw from an event handler.
    }
  },
  };
};
`;
}

async function assertOpenCodeV1(command: string[], cwd: string, env: Record<string, string>): Promise<void> {
	const child = Bun.spawn([...command, "--version"], {
		cwd,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		child.kill("SIGKILL");
	}, 2_000);
	const output = new Response(child.stdout).text();
	const errors = new Response(child.stderr).text();
	try {
		const [exitCode, version] = await Promise.all([child.exited, output]);
		if (timedOut || exitCode !== 0 || openCodeBootstrapForVersion(version) !== "opencode-v1") {
			throw new Error(
				`OpenCode v1 adapter requires an OpenCode v1 binary; ${timedOut ? "version check timed out" : `found ${JSON.stringify(version.trim())}`}.`,
			);
		}
	} finally {
		clearTimeout(timeout);
		await errors;
	}
}
