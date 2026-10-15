import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentPreset } from "../types.ts";
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
} from "./agent.ts";
import { shellQuote } from "./agent.ts";
import { OPENCODE_CHROME_RULES } from "./chrome-rules.ts";
import { createOpencodeV2CliPlugin } from "./opencode-v2-cli-plugin.ts";
import { commandArguments, discoverModels, sanitizeProfilePreset, withExplicitModel } from "./profile.ts";

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

function parseCliConfig(content: string | undefined) {
	let config: unknown;
	try {
		config = content ? Bun.JSONC.parse(content) : {};
	} catch {
		throw new Error("OPENCODE_CLI_CONFIG_CONTENT must be valid OpenCode v2 JSON/JSONC.");
	}
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		throw new Error("Unsupported OpenCode v2 CLI config schema: expected an object.");
	}
	const settings = config as Record<string, unknown>;
	const plugins = settings.plugins ?? [];
	if (!Array.isArray(plugins) || plugins.some((item) => typeof item !== "string")) {
		throw new Error("Unsupported OpenCode v2 CLI config schema: plugins must be an array of package paths.");
	}
	return { settings, plugins: plugins as string[] };
}

function cliConfig(parsed: ReturnType<typeof parseCliConfig>, packagePath: string): string {
	return JSON.stringify({ ...parsed.settings, plugins: [...parsed.plugins, packagePath] });
}

function parseOpenCodeConfig(content: string | undefined) {
	let config: unknown;
	try {
		config = content ? Bun.JSONC.parse(content) : {};
	} catch {
		throw new Error("OPENCODE_CONFIG_CONTENT must be valid OpenCode v2 JSON/JSONC.");
	}
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		throw new Error("Unsupported OpenCode v2 config schema: expected an object.");
	}
	const settings = config as Record<string, unknown>;
	const skills = settings.skills ?? [];
	if (!Array.isArray(skills) || skills.some((path) => typeof path !== "string")) {
		throw new Error("Unsupported OpenCode v2 config schema: skills must be an array of directory paths.");
	}
	return { settings, skills: skills as string[] };
}

async function runCli(args: string[], cwd: string, env: Record<string, string>, timeoutMs: number) {
	const child = Bun.spawn(args, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
	const output = new Response(child.stdout).text();
	const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
	try {
		await child.exited;
		return { exitCode: child.exitCode, output: await output };
	} finally {
		clearTimeout(timeout);
	}
}

async function assertOpenCodeV2(preset: AgentPreset, cwd: string, env: Record<string, string>) {
	const result = await runCli([...commandArguments(preset.command), "--version"], cwd, env, 5_000);
	if (result.exitCode !== 0 || !/\bv?2\.\d+\.\d+\b/i.test(result.output)) {
		throw new Error("The opencode-v2 harness requires an OpenCode v2 CLI binary.");
	}
}

async function lookupNativeSession(
	preset: AgentPreset,
	cwd: string,
	env: Record<string, string>,
	sessionId: string,
): Promise<string | undefined> {
	if (!/^ses_[A-Za-z0-9_-]+$/.test(sessionId)) {
		throw new Error("Cannot resume OpenCode v2: saved native session ID is invalid.");
	}
	const { exitCode, output } = await runCli(
		[...commandArguments(preset.command), "api", "--standalone", "get", `/api/session/${sessionId}`],
		cwd,
		env,
		8_000,
	);
	if (exitCode !== 0) return undefined;
	let result: unknown;
	try {
		result = JSON.parse(output.trim());
	} catch {
		return undefined;
	}
	// Report the observed ID rather than a bare boolean so a lookup that answers with a different
	// session stays distinguishable from one that finds nothing.
	const observed = (result as { data?: { id?: unknown } } | null)?.data?.id;
	return typeof observed === "string" ? observed : undefined;
}

export class OpencodeV2Agent implements Agent {
	readonly name = "opencode-v2";
	readonly supported = true;
	readonly hookBacked = true;
	readonly chromeRules = OPENCODE_CHROME_RULES;
	readonly nativeNamespace = "opencode" as const;
	readonly prepareBeforeAsk = true;

	sanitizeLaunchPreset(preset: AgentPreset): AgentPreset {
		return sanitizeProfilePreset(preset);
	}

	discoverModels(request: import("./agent.ts").ModelDiscoveryRequest) {
		return discoverModels("opencode", request.command, request.env, request.timeoutMs);
	}

	prepareProfile(_profile: import("../types.ts").ModeProfile, preset: AgentPreset): AgentPreset {
		return sanitizeProfilePreset(preset);
	}

	private allocateNativeSessionId(): string {
		return `ses_${randomUUID().replaceAll("-", "")}`;
	}

	yoloFlag(): string | undefined {
		return "--auto";
	}

	launchCommand({ preset, bootstrapPath, nativeSessionId }: LaunchCommandRequest): string {
		if (!nativeSessionId) throw new Error("OpenCode v2 launch requires a native session ID.");
		return appendArguments(
			preset.command,
			`--standalone --session ${shellQuote(nativeSessionId)} --prompt ${filePrompt(bootstrapPath)}`,
		);
	}

	resumeCommand({ preset, nativeSessionId }: ResumeCommandRequest): string {
		if (!nativeSessionId) throw new Error("Cannot resume OpenCode v2 without its exact native session ID.");
		return appendArguments(preset.command, `--standalone --session ${shellQuote(nativeSessionId)}`);
	}

	askCommand({ preset, nativeSessionId, question }: AskCommandRequest): string {
		if (!nativeSessionId.trim()) throw new Error("Cannot ask OpenCode v2 without its exact native session ID.");
		if (!/^ses_[A-Za-z0-9_-]+$/.test(nativeSessionId))
			throw new Error("Cannot ask OpenCode v2 with an invalid native session ID.");
		const lookup = appendArguments(
			preset.command,
			`api --standalone get ${shellQuote(`/api/session/${nativeSessionId}`)}`,
		);
		const ask = appendArguments(
			preset.command,
			`run --standalone --session ${shellQuote(nativeSessionId)} ${shellQuote(question)}`,
		);
		return `/bin/sh -c ${shellQuote(`${lookup} >/dev/null 2>&1 && ${ask}`)}`;
	}

	async prepare(request: PreparationResources & { intent: SessionIntent }): Promise<AgentPreparation> {
		const { preset, directory, skillRoot, statusDir, sessionId, env, bootstrapPath, intent } = request;
		const preflight = request.preflightResult as
			| { opencode: ReturnType<typeof parseOpenCodeConfig>; cli?: ReturnType<typeof parseCliConfig> }
			| undefined;
		const { settings, skills } = preflight?.opencode ?? parseOpenCodeConfig(env.OPENCODE_CONFIG_CONTENT);
		const explicitModel = request.profile?.model.kind === "explicit" ? request.profile.model.id : undefined;
		if (explicitModel && !preflight) withExplicitModel(preset, explicitModel);
		env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
			...settings,
			skills: [...skills, skillRoot],
			...(explicitModel ? { model: explicitModel } : {}),
		});
		const identity: NativeIdentity =
			intent.kind === "resume"
				? { id: intent.nativeSessionId, basis: "client-established" }
				: { id: this.allocateNativeSessionId(), basis: "client-established" };
		if (sessionId) {
			if (!statusDir) throw new Error("OpenCode v2 session launch requires its durable status directory.");
			await this.installStatusHooks({ pluginDir: directory, statusDir, sessionId });
			const cliPlugin = join(directory, "agentic-workspace-opencode-cli-plugin");
			await mkdir(cliPlugin, { recursive: true, mode: 0o700 });
			await writeFile(
				join(cliPlugin, "package.json"),
				JSON.stringify({
					name: "agentic-workspace-opencode-cli-plugin",
					private: true,
					type: "module",
					exports: { "./tui": "./tui.js" },
				}),
				{ mode: 0o600 },
			);
			await writeFile(
				join(cliPlugin, "tui.js"),
				createOpencodeV2CliPlugin({
					launchDirectory: directory,
					statusDir,
					expectedNativeSessionId: identity.id,
				}),
				{ mode: 0o600 },
			);
			const cli = preflight?.cli ?? parseCliConfig(env.OPENCODE_CLI_CONFIG_CONTENT);
			env.OPENCODE_CLI_CONFIG_CONTENT = cliConfig(cli, cliPlugin);
		}
		const command =
			intent.kind === "resume"
				? this.resumeCommand({ preset, nativeSessionId: identity.id })
				: this.launchCommand({ preset, bootstrapPath, nativeSessionId: identity.id });
		return {
			command,
			env,
			identity,
			...(sessionId
				? {
						confirmSession: async (expectedNativeSessionId: string) => {
							if (expectedNativeSessionId !== identity.id) return false;
							try {
								const observed = await lookupNativeSession(preset, request.cwd, env, expectedNativeSessionId);
								return observed === expectedNativeSessionId;
							} catch {
								return false;
							}
						},
					}
				: {}),
		};
	}

	async reconcileIdentity(
		_origin: LaunchOrigin,
		_publish: (identity: NativeIdentity) => Promise<void>,
	): Promise<void> {}

	async preflightLaunch(request: import("./agent.ts").AgentPreflightRequest): Promise<unknown> {
		if (request.resume) this.resumeCommand(request);
		// A fresh launch validates the interactive command shape against a throwaway client ID; the
		// real ID is privately allocated during prepare.
		else this.launchCommand({ ...request, nativeSessionId: request.nativeSessionId ?? this.allocateNativeSessionId() });
		await assertOpenCodeV2(request.preset, request.cwd, request.env);
		if (request.resume && request.nativeSessionId) {
			const observed = await lookupNativeSession(request.preset, request.cwd, request.env, request.nativeSessionId);
			if (observed !== request.nativeSessionId)
				throw new Error(
					observed === undefined
						? `Cannot resume OpenCode v2: saved native session '${request.nativeSessionId}' was not found or is unavailable.`
						: `Cannot resume OpenCode v2: session lookup did not confirm '${request.nativeSessionId}'.`,
				);
		}
		const explicitModel = request.profile?.model.kind === "explicit" ? request.profile.model.id : undefined;
		if (explicitModel) withExplicitModel(request.preset, explicitModel);
		const opencode = parseOpenCodeConfig(request.env.OPENCODE_CONFIG_CONTENT);
		const cli = request.sessionId ? parseCliConfig(request.env.OPENCODE_CLI_CONFIG_CONTENT) : undefined;
		return { opencode, ...(cli ? { cli } : {}) };
	}

	async installStatusHooks({ statusDir }: StatusHookInstallOptions) {
		await mkdir(statusDir, { recursive: true, mode: 0o700 });
		return { provider: "opencode" as const, paths: [], env: {}, args: [] };
	}
}
