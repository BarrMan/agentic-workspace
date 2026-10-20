import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
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
	type SessionIntent,
	type StatusHookInstallOptions,
	shellQuote,
} from "../core/agent.ts";
import { CLAUDE_CHROME_RULES } from "../core/chrome-rules.ts";
import { buildHookCommand, buildReadinessReceiptCommand, type HookStatus } from "../core/hook-script.ts";
import { sanitizeProfilePreset, withExplicitModel } from "../core/profile.ts";

/** The Claude Code event → status map, expressed as a settings-shaped hooks object. */
export function claudeHooksConfig(
	statusDir: string,
	sessionId?: string,
	launchDirectory = statusDir,
): Record<string, unknown> {
	const command = (status: HookStatus): { hooks: Array<{ type: "command"; command: string }> } => ({
		hooks: [{ type: "command", command: buildHookCommand(statusDir, status) }],
	});
	const matcher = (
		pattern: string,
		status: HookStatus,
	): { matcher: string; hooks: Array<{ type: "command"; command: string }> } => ({
		matcher: pattern,
		...command(status),
	});
	return {
		hooks: {
			SessionStart: [
				command("idle"),
				{
					hooks: [
						{
							type: "command",
							command: buildReadinessReceiptCommand(launchDirectory, join(launchDirectory, "initialized")),
						},
					],
				},
			],
			UserPromptSubmit: [
				command("running"),
				...(sessionId
					? [
							{
								hooks: [
									{
										type: "command" as const,
										command: buildReadinessReceiptCommand(launchDirectory, join(launchDirectory, "prompt-accepted")),
									},
								],
							},
						]
					: []),
			],
			PreToolUse: [matcher("AskUserQuestion", "waiting")],
			PostToolUse: [matcher("AskUserQuestion", "running")],
			Stop: [command("idle")],
			Notification: [
				matcher("permission_prompt|elicitation_dialog|agent_needs_input", "waiting"),
				matcher("idle_prompt|agent_completed", "idle"),
			],
			ElicitationResult: [command("running")],
		},
	};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hookSessionId(contents: string | undefined): string | undefined {
	if (!contents) return;
	try {
		const value: unknown = JSON.parse(contents);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return;
		const id = (value as { session_id?: unknown }).session_id;
		return typeof id === "string" && UUID.test(id) ? id : undefined;
	} catch {
		return;
	}
}

async function readHookId(path: string): Promise<string | undefined> {
	try {
		return hookSessionId(await readFile(path, "utf8"));
	} catch {
		return;
	}
}

function encodeClaudeCwd(cwd: string): string {
	return cwd.replace(/[^A-Za-z0-9-]/g, "-");
}

export class ClaudeAgent implements HarnessInterface {
	readonly name = "claude";
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
	readonly chromeRules = CLAUDE_CHROME_RULES;
	readonly nativeNamespace = "claude" as const;
	readonly prepareBeforeAsk = false;

	// Claude has no verified model-list command; explicit IDs remain manually configurable.
	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
	discoverModels() {
		return Promise.resolve([]);
	}

	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
	prepareProfile(profile: ModeProfile, preset: import("../../../model/session/types.ts").AgentPreset) {
		return profile.model.kind === "explicit" ? withExplicitModel(preset, profile.model.id) : preset;
	}

	yoloFlag(): string | undefined {
		return "--dangerously-skip-permissions";
	}

	sanitizeLaunchPreset(preset: import("../../../model/session/types.ts").AgentPreset) {
		return sanitizeProfilePreset(preset);
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
		const resumeFlag = preset.resumeFlag ?? "--resume";
		if (!resumeFlag.trim() || resumeFlag.includes("\0")) {
			throw new Error("Agent resumeFlag must be a non-empty string without NUL bytes.");
		}
		return appendArguments(preset.command, `${shellQuote(resumeFlag)} ${shellQuote(nativeSessionId)}`);
	}

	askCommand({ preset, nativeSessionId, question }: AskCommandRequest): string {
		return appendArguments(preset.command, `-p --resume ${quotedAskArguments(nativeSessionId, question)}`);
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const { preset, directory, statusDir, sessionId, env, bootstrapPath, intent } = request;
		// https://code.claude.com/docs/en/plugins/create: --plugin-dir is session-only.
		await mkdir(join(directory, ".claude-plugin"), { mode: 0o700 });
		await writeFile(
			join(directory, ".claude-plugin", "plugin.json"),
			JSON.stringify({ name: "agentic-workspace", version: "1.0.0" }),
			{ mode: 0o600 },
		);
		// The plugin's own hooks/hooks.json is discovered from --plugin-dir, session-only.
		const identity: NativeIdentity =
			intent.kind === "resume"
				? { id: intent.nativeSessionId, basis: "client-established" }
				: { id: randomUUID(), basis: "client-established" };
		if (statusDir) await this.installStatusHooks({ pluginDir: directory, statusDir, sessionId }, identity.id);
		const withIdentity = { ...preset, command: [...preset.command, "--plugin-dir", directory] };
		const command =
			intent.kind === "resume"
				? this.resumeCommand({ preset: withIdentity, nativeSessionId: identity.id })
				: this.launchCommand({ preset: withIdentity, bootstrapPath, nativeSessionId: identity.id });
		return { command, env, identity };
	}

	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
	readiness(intent: SessionIntent, launchDirectory: string, identity?: NativeIdentity) {
		const id = identity?.id ?? (intent.kind === "resume" ? intent.nativeSessionId : undefined);
		return {
			initialized: {
				path: join(launchDirectory, "initialized"),
				...(id ? { expected: { session_id: id, source: intent.kind === "resume" ? "resume" : "startup" } } : {}),
			},
			...(intent.kind === "new"
				? {
						promptAccepted: {
							path: join(launchDirectory, "prompt-accepted"),
							...(id ? { expected: { session_id: id } } : {}),
						},
					}
				: {}),
		};
	}

	async reconcileIdentity({
		intent,
		preparedIdentity,
		cwd,
		env,
		launchDirectory,
		signal,
	}: IdentityCaptureRequest): Promise<NativeIdentity> {
		const expected = preparedIdentity?.id ?? (intent.kind === "resume" ? intent.nativeSessionId : undefined);
		if (!expected || !UUID.test(expected))
			throw new Error("Claude launch did not provide a valid pinned native identity.");
		const directory = await realpath(cwd).catch(() => resolve(cwd));
		const configRoot = env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
		const transcript = join(configRoot, "projects", encodeClaudeCwd(directory), `${expected}.jsonl`);
		const deadline = Date.now() + 2_000;
		while (true) {
			if (signal.aborted) throw signal.reason ?? new Error("Claude identity capture aborted.");
			const [startup, prompt] = await Promise.all([
				readHookId(join(launchDirectory, "initialized")),
				readHookId(join(launchDirectory, "prompt-accepted")),
			]);
			if (startup && prompt && startup !== prompt)
				throw new Error("Claude hook events reported conflicting session IDs.");
			const observed = startup ?? prompt;
			if (observed) {
				if (observed !== expected)
					throw new Error(`Claude reported session '${observed}' instead of pinned session '${expected}'.`);
				return { id: observed, basis: "provider-confirmed" };
			}
			try {
				const metadata = await lstat(transcript);
				if (metadata.isFile()) return { id: expected, basis: "provider-confirmed" };
			} catch {}
			if (Date.now() >= deadline) throw new Error("Claude did not provide provider-owned session identity evidence.");
			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => {
					signal.removeEventListener("abort", abort);
					resolve();
				}, 50);
				const abort = (): void => {
					clearTimeout(timer);
					reject(signal.reason ?? new Error("Claude identity capture aborted."));
				};
				signal.addEventListener("abort", abort, { once: true });
			});
		}
	}

	// Called through the optional Agent interface.
	// fallow-ignore-next-line unused-class-member -- called through the optional Agent interface
	async preflightLaunch(request: import("../core/agent.ts").AgentPreflightRequest): Promise<void> {
		if (request.resume) this.resumeCommand(request);
		else this.launchCommand({ ...request, bootstrapPath: request.bootstrapPath });
	}

	async installStatusHooks(
		{ pluginDir, statusDir, sessionId }: StatusHookInstallOptions,
		_nativeSessionId?: string,
	): Promise<InstalledStatusHook> {
		// The sidecar is the deterministic per-session directory; the hook file lives in the temp dir.
		await mkdir(statusDir, { recursive: true, mode: 0o700 });
		const hooksDir = join(pluginDir, "hooks");
		await mkdir(hooksDir, { recursive: true, mode: 0o700 });
		const path = join(hooksDir, "hooks.json");
		await writeFile(path, `${JSON.stringify(claudeHooksConfig(statusDir, sessionId, pluginDir), null, 2)}\n`, {
			mode: 0o600,
		});
		return { provider: "claude", paths: [path], env: {}, args: [] };
	}
}
