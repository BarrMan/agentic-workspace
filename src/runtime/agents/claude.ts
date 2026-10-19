import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentPreset, ModeProfile } from "../../model/session/types.ts";
import { appendArguments, filePrompt } from "../bootstrap.ts";
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
	type SessionIntent,
	type StatusHookInstallOptions,
	shellQuote,
} from "./agent.ts";
import { CLAUDE_CHROME_RULES } from "./chrome-rules.ts";
import { buildHookCommand, buildReadinessReceiptCommand, type HookStatus } from "./hook-script.ts";
import { sanitizeProfilePreset, withExplicitModel } from "./profile.ts";

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

export class ClaudeAgent implements Agent {
	readonly name = "claude";
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

	sanitizeLaunchPreset(preset: AgentPreset): AgentPreset {
		return sanitizeProfilePreset(preset);
	}

	// Claude has no verified model-list command; explicit IDs remain manually configurable.
	discoverModels() {
		return Promise.resolve([]);
	}

	prepareProfile(profile: ModeProfile, preset: import("../../model/session/types.ts").AgentPreset) {
		return profile.model.kind === "explicit" ? withExplicitModel(preset, profile.model.id) : preset;
	}

	yoloFlag(): string | undefined {
		return "--dangerously-skip-permissions";
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
		const base = `${preset.command} --plugin-dir ${shellQuote(directory)}`;
		const withIdentity = { ...preset, command: base };
		const command =
			intent.kind === "resume"
				? this.resumeCommand({ preset: withIdentity, nativeSessionId: identity.id })
				: this.launchCommand({ preset: withIdentity, bootstrapPath, nativeSessionId: identity.id });
		return { command, env, identity };
	}

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

	async reconcileIdentity(
		_origin: LaunchOrigin,
		_publish: (identity: NativeIdentity) => Promise<void>,
	): Promise<void> {}

	async preflightLaunch(request: import("./agent.ts").AgentPreflightRequest): Promise<void> {
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
