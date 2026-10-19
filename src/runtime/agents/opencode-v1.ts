import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentPreset } from "../../model/session/types.ts";
import type { InstalledStatusHook } from "../status-hooks.ts";
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
import { OPENCODE_CHROME_RULES } from "./chrome-rules.ts";
import { openCodeBootstrapForVersion } from "./opencode-version.ts";
import { discoverModels, sanitizeProfilePreset, withExplicitModel } from "./profile.ts";

function appendArguments(command: string, arguments_: string): string {
	if (/[|;&\n]/.test(command)) {
		throw new Error(
			"Built-in agent commands must be an executable with flags, not a shell pipeline or compound command.",
		);
	}
	return `${command} ${arguments_}`;
}

function filePrompt(bootstrapPath: string): string {
	return `"$(cat -- ${shellQuote(bootstrapPath)})"`;
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

/** OpenCode 1.19 TUI adapter: launch normally and let the plugin observe session creation. */
export class OpencodeV1Agent implements Agent {
	readonly name = "opencode-v1";
	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
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

	sanitizeLaunchPreset(preset: AgentPreset): AgentPreset {
		return sanitizeProfilePreset(preset);
	}

	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
	discoverModels(request: import("./agent.ts").ModelDiscoveryRequest) {
		return discoverModels("opencode", request.command, request.env, request.timeoutMs);
	}

	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
	prepareProfile(profile: import("../../model/session/types.ts").ModeProfile, preset: AgentPreset): AgentPreset {
		const prepared = sanitizeProfilePreset(preset);
		return profile.model.kind === "explicit" ? withExplicitModel(prepared, profile.model.id) : prepared;
	}

	yoloFlag(): string | undefined {
		return "--auto";
	}

	launchCommand({ preset, bootstrapPath, nativeSessionId }: LaunchCommandRequest): string {
		return appendArguments(
			preset.command,
			nativeSessionId ? `--session ${shellQuote(nativeSessionId)}` : `--prompt ${filePrompt(bootstrapPath)}`,
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
		return appendArguments(preset.command, `run --session ${quotedAskArguments(nativeSessionId, question)}`);
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const { env, skillRoot, directory, statusDir, sessionId, preset, bootstrapPath, intent } = request;
		const parsed = request.preflightResult as ReturnType<typeof parseOpenCodeConfig> | undefined;
		env.OPENCODE_CONFIG_CONTENT = openCodeSkillConfig(
			parsed ?? parseOpenCodeConfig(env.OPENCODE_CONFIG_CONTENT),
			skillRoot,
		);
		if (statusDir) {
			const installed = await this.installStatusHooks({
				pluginDir: directory,
				statusDir,
				sessionId,
				expectedNativeSessionId: intent.kind === "resume" ? intent.nativeSessionId : undefined,
			});
			Object.assign(env, installed.env);
		}
		if (intent.kind === "resume")
			return {
				command: this.resumeCommand({ preset, nativeSessionId: intent.nativeSessionId }),
				env,
				identity: { id: intent.nativeSessionId, basis: "client-established" },
			};
		// v1 observes its created conversation from a provider event, so prepare returns no identity.
		return { command: this.launchCommand({ preset, bootstrapPath }), env };
	}

	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
	readiness(intent: SessionIntent, launchDirectory: string, identity?: NativeIdentity) {
		return readinessReceipts(intent, launchDirectory, identity);
	}

	async reconcileIdentity(origin: LaunchOrigin, publish: (identity: NativeIdentity) => Promise<void>): Promise<void> {
		// The provider plugin writes its receipt beside the launch's bootstrap sidecar.
		let raw: string;
		try {
			raw = await readFile(join(dirname(origin.record.bootstrapPath), `${origin.record.id}.native-session-id`), "utf8");
		} catch {
			return;
		}
		const id = raw.endsWith("\n") ? raw.slice(0, -1) : raw;
		if (id) await publish({ id, basis: "provider-confirmed" });
	}

	async preflightLaunch(request: import("./agent.ts").AgentPreflightRequest): Promise<unknown> {
		if (request.resume) this.resumeCommand(request);
		else this.launchCommand(request);
		await assertOpenCodeV1(request.preset.command, request.cwd, request.env);
		return parseOpenCodeConfig(request.env.OPENCODE_CONFIG_CONTENT);
	}

	async installStatusHooks({
		pluginDir,
		statusDir,
		sessionId,
		expectedNativeSessionId,
	}: StatusHookInstallOptions & { expectedNativeSessionId?: string }): Promise<InstalledStatusHook> {
		if (!sessionId) throw new Error("OpenCode 1.19 status hooks require a AgenticWorkspace session ID.");
		await mkdir(statusDir, { recursive: true, mode: 0o700 });
		const pluginsDir = join(pluginDir, "plugins");
		await mkdir(pluginsDir, { recursive: true, mode: 0o700 });
		const path = join(pluginsDir, "agentic-workspace-status.ts");
		await writeFile(
			path,
			openCodeV1PluginSource(statusDir, dirname(statusDir), sessionId, pluginDir, expectedNativeSessionId),
			{ mode: 0o600 },
		);
		return { provider: "opencode-v1", paths: [path], env: { OPENCODE_CONFIG_DIR: pluginDir }, args: [] };
	}
}

/** OpenCode 1.19 plugin source for the TUI launch path. */
export function openCodeV1PluginSource(
	statusDir: string,
	taskRoot: string,
	agenticWorkspaceSessionId: string,
	launchDirectory: string,
	expectedNativeSessionId?: string,
): string {
	return `// agentic-workspace-hooks
// Process-scoped status and native-session emitter for OpenCode 1.19.
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const STATUS_DIR = ${JSON.stringify(statusDir)};
const TASK_ROOT = ${JSON.stringify(taskRoot)};
const AGENTIC_WORKSPACE_SESSION_ID = ${JSON.stringify(agenticWorkspaceSessionId)};
const LAUNCH_DIRECTORY = ${JSON.stringify(launchDirectory)};
const EXPECTED_NATIVE_SESSION_ID = ${JSON.stringify(expectedNativeSessionId)};
const NATIVE_SESSION_ID_PATH = join(TASK_ROOT, AGENTIC_WORKSPACE_SESSION_ID + ".native-session-id");
const INITIALIZED_PATH = join(LAUNCH_DIRECTORY, "initialized");
const PROMPT_ACCEPTED_PATH = join(LAUNCH_DIRECTORY, "prompt-accepted");
const topLevelSessionIDs = new Set();
const childSessionIDs = new Set();
let activeTopLevelSessionID;

function emit(status, sessionID) {
  try {
    if (sessionID && sessionID !== activeTopLevelSessionID) return;
    if (!STATUS_DIR || !existsSync(join(STATUS_DIR, ".agentic-workspace-launch-owner"))) return;
    writeFileSync(join(STATUS_DIR, "status"), status, { mode: 0o600 });
  } catch {
    // A throwing plugin can block the agent's tool calls; never propagate.
  }
}

function recordNativeSessionId(sessionID) {
  try {
    if (!topLevelSessionIDs.has(sessionID) || childSessionIDs.has(sessionID)) return;
    mkdirSync(TASK_ROOT, { recursive: true, mode: 0o700 });
    const temporaryPath = NATIVE_SESSION_ID_PATH + "." + process.pid + ".tmp";
    writeFileSync(temporaryPath, sessionID + "\\n", { mode: 0o600 });
    renameSync(temporaryPath, NATIVE_SESSION_ID_PATH);
    activeTopLevelSessionID = sessionID;
    writeReceipt(INITIALIZED_PATH, sessionID);
  } catch {
    // Never throw from an event handler.
  }
}

function recordPromptAccepted(sessionID) {
  try {
    if (sessionID !== activeTopLevelSessionID) return;
    writeReceipt(PROMPT_ACCEPTED_PATH, sessionID);
  } catch {
    // Never throw from an event handler.
  }
}

function writeReceipt(path, sessionID) {
  try {
    const temporaryPath = path + "." + process.pid + ".tmp";
    writeFileSync(temporaryPath, sessionID + "\\n", { mode: 0o600 });
    renameSync(temporaryPath, path);
  } catch {
    // Never throw from an event handler.
  }
}

export const AgenticWorkspaceStatus = async ({ client }) => {
  if (EXPECTED_NATIVE_SESSION_ID) {
    try {
      const response = await client.session.get({ sessionID: EXPECTED_NATIVE_SESSION_ID });
      const session = response && response.data;
      if (session && session.id === EXPECTED_NATIVE_SESSION_ID && !session.parentID) {
        topLevelSessionIDs.add(session.id);
        recordNativeSessionId(session.id);
      }
    } catch {
      // A failed read-only lookup must not block plugin initialization.
    }
  }
  return {
  event: async ({ event }) => {
    try {
      const type = event && event.type;
      if (type === "session.created") {
        const sessionID = event.properties && event.properties.sessionID;
        const info = event.properties && event.properties.info;
        if (info && !info.parentID && typeof sessionID === "string") {
          topLevelSessionIDs.add(sessionID);
          recordNativeSessionId(sessionID);
        } else if (info && info.parentID && typeof sessionID === "string") {
          childSessionIDs.add(sessionID);
        }
      } else if (type === "session.idle") {
        emit("idle", event.properties && event.properties.sessionID);
      } else if (type === "session.error") {
        emit("error", event.properties && event.properties.sessionID);
      } else if (type === "session.status") {
        const status = event.properties && event.properties.status;
        const sessionID = event.properties && event.properties.sessionID;
        if (status && status.type === "busy") emit("running", sessionID);
        else if (status && status.type === "idle") emit("idle", sessionID);
      } else if (type === "permission.updated") {
        emit("waiting", event.properties && event.properties.sessionID);
      }
    } catch {
      // Never throw from an event handler.
    }
  },
  "chat.message": async (input) => {
    try {
      const sessionID = input && input.sessionID;
      if (topLevelSessionIDs.has(sessionID) && !childSessionIDs.has(sessionID)) {
        recordNativeSessionId(sessionID);
      } else if (typeof sessionID === "string" && sessionID.startsWith("ses_") && !childSessionIDs.has(sessionID)) {
        const response = await client.session.get({ sessionID });
        const session = response && response.data;
        if (session && session.id === sessionID && !session.parentID) {
          topLevelSessionIDs.add(sessionID);
          recordNativeSessionId(sessionID);
        } else if (session && session.id === sessionID && session.parentID) {
          childSessionIDs.add(sessionID);
        }
      }
      if (typeof sessionID === "string" && topLevelSessionIDs.has(sessionID) && !childSessionIDs.has(sessionID)) recordPromptAccepted(sessionID);
      emit("running", sessionID);
    } catch {
      // A failed read-only lookup must not block a user message.
    }
  },
  "permission.ask": async (input) => emit("waiting", input && input.sessionID),
  "tool.execute.before": async (input) => emit("running", input && input.sessionID),
  };
};
`;
}

async function assertOpenCodeV1(command: string, cwd: string, env: Record<string, string>): Promise<void> {
	const versionCommand = appendArguments(command, "--version");
	const child = Bun.spawn(["/bin/sh", "-c", `exec ${versionCommand}`], {
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
