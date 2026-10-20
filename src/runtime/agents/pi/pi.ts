import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { ModeProfile } from "../../../model/session/types.ts";
import type { InstalledStatusHook } from "../../status-hooks.ts";
import {
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
import { PI_CHROME_RULES } from "../core/chrome-rules.ts";
import { discoverModels, withExplicitModel } from "../core/profile.ts";

/** Pi extension source. Non-throwing, same contract as the OpenCode plugin. */
export function piExtensionSource(statusDir: string, launchDirectory = ""): string {
	return `// agentic-workspace-hooks
// Process-scoped status emitter. Installed inside AgenticWorkspace's owned temp dir and removed with it.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { mkdirSync, renameSync, unlinkSync } from "node:fs";

const STATUS_DIR = ${JSON.stringify(statusDir)};
const LAUNCH_DIRECTORY = ${JSON.stringify(launchDirectory)};
const ID_TARGET = process.env.AOE_SESSION_ID_FILE;
const SOURCE = process.env.AOE_SESSION_SOURCE;
const SUFFIX = SOURCE ? "." + SOURCE : "";

function publish(target, value) {
  let temporary;
  try {
    mkdirSync(dirname(target), { recursive: true });
    temporary = join(dirname(target), "." + target.split("/").pop() + "." + process.pid + "." + Math.random().toString(16).slice(2) + ".tmp");
    writeFileSync(temporary, value + "\\n", { mode: 0o600 });
    renameSync(temporary, target);
    temporary = undefined;
  } catch {
    if (temporary) try { unlinkSync(temporary); } catch {}
  }
}

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
        const sessionFile = ctx.sessionManager.getSessionFile?.();
        if (ID_TARGET && sessionId && SOURCE && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(SOURCE)) {
          publish(ID_TARGET + SUFFIX, sessionId);
          if (sessionFile) publish(join(dirname(ID_TARGET), "session_path" + SUFFIX), sessionFile);
        }
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

const PI_CAPTURE_TIMEOUT_MS = 30_000;

async function readPiHeader(path: string): Promise<{ id?: string; cwd?: string } | undefined> {
	try {
		if (!(await lstat(path)).isFile()) return undefined;
		const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			if (!(await handle.stat()).isFile()) return undefined;
			const bytes = Buffer.alloc(64 * 1024);
			const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
			const content = bytes.subarray(0, bytesRead).toString("utf8");
			let consumed = 0;
			for (const line of content.split("\n").slice(0, 8)) {
				consumed += Buffer.byteLength(line) + 1;
				if (consumed > 64 * 1024) return undefined;
				try {
					const value: unknown = JSON.parse(line);
					if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "session") continue;
					const header = value as { id?: unknown; cwd?: unknown };
					if (header.id !== undefined && typeof header.id !== "string") return undefined;
					if (header.cwd !== undefined && (typeof header.cwd !== "string" || !header.cwd)) return undefined;
					return {
						...(typeof header.id === "string" ? { id: header.id } : {}),
						...(typeof header.cwd === "string" ? { cwd: header.cwd } : {}),
					};
				} catch {
					/* inspect subsequent JSONL records */
				}
			}
			return undefined;
		} finally {
			await handle.close();
		}
	} catch {
		return undefined;
	}
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export class PiAgent implements HarnessInterface {
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

	discoverModels(request: import("../core/agent.ts").ModelDiscoveryRequest) {
		return discoverModels("pi", request.command, request.env, request.timeoutMs);
	}

	prepareProfile(profile: ModeProfile, preset: import("../../../model/session/types.ts").AgentPreset) {
		return profile.model.kind === "explicit" ? withExplicitModel(preset, profile.model.id) : preset;
	}

	sanitizeLaunchPreset(preset: import("../../../model/session/types.ts").AgentPreset) {
		return preset;
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
		return resumeCommandWithFlag(preset, nativeSessionId, "--session");
	}

	askCommand({ preset, nativeSessionId, question }: AskCommandRequest): string {
		return appendArguments(preset.command, `-p --session ${quotedAskArguments(nativeSessionId, question)}`);
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const { preset, directory, skillPath, statusDir, sessionId, env, bootstrapPath, intent } = request;
		const captureSource = randomUUID();
		env.AOE_SESSION_ID_FILE = join(directory, "session_id");
		env.AOE_SESSION_SOURCE = captureSource;
		// pi --skill loads this session-local SKILL.md without writing user or project settings.
		const commandArgs = [...preset.command, "--skill", skillPath];
		const identity: NativeIdentity =
			intent.kind === "resume"
				? { id: intent.nativeSessionId, basis: "client-established" }
				: { id: randomUUID(), basis: "client-established" };
		if (statusDir) {
			// https://pi.dev/docs/latest/extensions: --extension loads one file for the session.
			const installed = await this.installStatusHooks({ pluginDir: directory, statusDir, sessionId }, identity.id);
			commandArgs.push(...installed.args);
		}
		const withIdentity = { ...preset, command: commandArgs };
		const command =
			intent.kind === "resume"
				? this.resumeCommand({ preset: withIdentity, nativeSessionId: identity.id })
				: this.launchCommand({ preset: withIdentity, bootstrapPath, nativeSessionId: identity.id });
		return { command, env, identity };
	}

	readiness(intent: SessionIntent, launchDirectory: string, identity?: NativeIdentity) {
		return readinessReceipts(intent, launchDirectory, identity);
	}

	async reconcileIdentity({ intent, preparedIdentity, env, signal }: IdentityCaptureRequest): Promise<NativeIdentity> {
		const target = env.AOE_SESSION_ID_FILE;
		if (!target) throw new Error("Pi session capture requires AOE_SESSION_ID_FILE.");
		const source = env.AOE_SESSION_SOURCE;
		if (!source) throw new Error("Pi session capture requires AOE_SESSION_SOURCE.");
		if (!isUuid(source)) throw new Error("Pi session capture received an invalid AOE_SESSION_SOURCE.");
		const suffix = `.${source}`;
		const started = Date.now();
		while (Date.now() - started < PI_CAPTURE_TIMEOUT_MS) {
			if (signal.aborted) throw signal.reason ?? new Error("Pi session capture aborted.");
			const dir = dirname(target);
			const launchId = await readFile(join(dir, `session_id${suffix}`), "utf8").catch(() => undefined);
			const published = launchId;
			if (published) {
				const id = published.trim();
				if (!isUuid(id)) throw new Error("Pi published an invalid session ID.");
				if (preparedIdentity && id !== preparedIdentity.id)
					throw new Error("Pi published a session ID different from the launch-pinned ID.");
				if (intent.kind === "resume" && id !== intent.nativeSessionId)
					throw new Error("Pi published a session ID different from the requested resume ID.");
				const launchPath = await readFile(join(dir, `session_path${suffix}`), "utf8").catch(() => undefined);
				const publishedPath = launchPath;
				if (publishedPath) {
					const path = publishedPath.trim();
					let exists = true;
					try {
						const metadata = await lstat(path);
						if (metadata.isSymbolicLink() || !metadata.isFile())
							throw new Error("Pi transcript is not a regular file.");
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false;
						else throw error;
					}
					if (exists) {
						const header = await readPiHeader(path);
						if (!header || header.id !== id)
							throw new Error("Pi transcript header does not match its published session ID.");
					} else {
						const leaf = path.split(/[\\/]/).pop() ?? "";
						if (!leaf.endsWith(".jsonl") || leaf.slice(0, -6).split("_").at(-1) !== id)
							throw new Error("Pi transcript is unavailable and its filename does not match the published session ID.");
					}
					return { id, basis: "provider-confirmed" };
				}
				return { id, basis: "provider-confirmed" };
			}
			try {
				await delay(50, undefined, { signal });
			} catch (error) {
				if (signal.aborted) throw signal.reason ?? error;
				throw error;
			}
		}
		throw new Error("Timed out waiting for Pi to publish its session ID.");
	}

	async preflightLaunch(request: import("../core/agent.ts").AgentPreflightRequest): Promise<void> {
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
