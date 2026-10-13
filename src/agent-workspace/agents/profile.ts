import { createHash } from "node:crypto";
import { isAbsolute, resolve, sep } from "node:path";
import type { AgentPreset, ModeProfile, RuntimeAgentBootstrap } from "../types.ts";
import type { AgentModel } from "./agent.ts";

const modelCache = new Map<string, AgentModel[]>();
const MODEL_CACHE_LIMIT = 32;
const MODEL_DISCOVERY_TIMEOUT_LIMIT_MS = 10_000;
const MODEL_ID = /^[\p{L}\p{N}][\p{L}\p{N}._:/+@-]{0,255}$/u;

/** Called by a model-picker refresh or after preset/environment configuration changes. */
export function clearModelDiscoveryCache(): void {
	modelCache.clear();
}

/** Tokenize the simple executable/arguments form supported by AgentPreset, never shell syntax. */
export function commandArguments(command: string): string[] {
	if (/[|;&`$<>\n\r]/.test(command)) {
		throw new Error("Harness profile commands must be a single executable with arguments, not shell syntax.");
	}
	const args: string[] = [];
	let value = "";
	let quote: "'" | '"' | undefined;
	let escaped = false;
	let started = false;
	for (const character of command) {
		if (escaped) {
			value += character;
			escaped = false;
			started = true;
		} else if (character === "\\" && quote !== "'") {
			escaped = true;
			started = true;
		} else if (quote) {
			if (character === quote) quote = undefined;
			else value += character;
			started = true;
		} else if (character === "'" || character === '"') {
			quote = character;
			started = true;
		} else if (/\s/.test(character)) {
			if (started) args.push(value);
			value = "";
			started = false;
		} else {
			value += character;
			started = true;
		}
	}
	if (escaped || quote) throw new Error("Harness command contains an unterminated quote or escape.");
	if (started) args.push(value);
	return args;
}

export function withExplicitModel(preset: AgentPreset, modelId: string): AgentPreset {
	if (!MODEL_ID.test(modelId)) throw new Error("Model ID contains unsupported characters.");
	const args = commandArguments(preset.command);
	const executable = args.shift();
	if (!executable) throw new Error("Harness command is empty.");
	const filtered: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;
		if (arg === "--model" || arg === "-m") {
			if (i + 1 >= args.length) throw new Error("Preset model option is missing its model ID.");
			i++;
			continue;
		}
		if (arg.startsWith("--model=")) continue;
		filtered.push(arg);
	}
	return { ...preset, command: [executable, ...filtered, "--model", modelId].map(quoteArg).join(" ") };
}

/** Pi has no path-scoped write switch; this verified allowlist is safe only for fully read-only modes. */
export function withPiReadOnlyTools(preset: AgentPreset): AgentPreset {
	const args = commandArguments(preset.command);
	const executable = args.shift();
	if (!executable) throw new Error("Harness command is empty.");
	const filtered: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg) continue;
		if (arg === "--tools" || arg === "-t") {
			if (index + 1 >= args.length) throw new Error("Preset tools option is missing its tool list.");
			index++;
			continue;
		}
		if (arg.startsWith("--tools=")) continue;
		filtered.push(arg);
	}
	return {
		...preset,
		command: [executable, ...filtered, "--tools", "read,grep,find,ls"].map(quoteArg).join(" "),
	};
}

/** Claude's verified tool allowlist gives fully read-only profiles a useful native baseline. */
export function withClaudeReadOnlyTools(preset: AgentPreset): AgentPreset {
	const args = commandArguments(preset.command);
	const executable = args.shift();
	if (!executable) throw new Error("Harness command is empty.");
	const filtered: string[] = [];
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (!arg) continue;
		if (arg === "--tools") {
			if (index + 1 >= args.length) throw new Error("Preset tools option is missing its tool list.");
			index++;
			continue;
		}
		filtered.push(arg);
	}
	return {
		...preset,
		command: [executable, ...filtered, "--tools", "Read,Glob,Grep,LS,AskUserQuestion"].map(quoteArg).join(" "),
	};
}

function quoteArg(value: string): string {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function canonicalModelId(id: string): string {
	return id.trim().toLocaleLowerCase("en-US");
}

function deduplicateModels(models: AgentModel[]): AgentModel[] {
	const byCanonicalId = new Map<string, AgentModel>();
	for (const model of models) {
		const id = model.id.trim();
		if (!id) continue;
		const key = canonicalModelId(id);
		const existing = byCanonicalId.get(key);
		const names = [existing?.name, model.name].filter((name): name is string => Boolean(name?.trim()));
		const name = names.sort((left, right) => right.trim().length - left.trim().length || left.localeCompare(right))[0];
		byCanonicalId.set(key, { id: existing?.id ?? id, ...(name ? { name: name.trim() } : {}) });
	}
	return [...byCanonicalId.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, model]) => model);
}

/** Drop preset auto-approval modes that conflict with an explicit Backlog profile. */
export function sanitizeProfilePreset(preset: AgentPreset): AgentPreset {
	const args = commandArguments(preset.command);
	const executable = args[0];
	if (!executable) throw new Error("Harness command is empty.");
	const filtered: string[] = [executable];
	let changed = false;
	for (let index = 1; index < args.length; index++) {
		const arg = args[index];
		if (!arg) continue;
		if (
			["opencode", "opencode-v1", "opencode-v2"].includes(preset.bootstrap) &&
			(arg === "--auto" || arg.startsWith("--auto="))
		) {
			changed = true;
			continue;
		}
		if (
			preset.bootstrap === "claude" &&
			["--dangerously-skip-permissions", "--allow-dangerously-skip-permissions"].some(
				(flag) => arg === flag || arg.startsWith(`${flag}=`),
			)
		) {
			changed = true;
			continue;
		}
		if (preset.bootstrap === "claude" && arg === "--permission-mode") {
			const mode = args[index + 1];
			if (mode === "acceptEdits" || mode === "auto" || mode === "bypassPermissions") {
				index++;
				changed = true;
				continue;
			}
		}
		if (
			preset.bootstrap === "claude" &&
			["--permission-mode=acceptEdits", "--permission-mode=auto", "--permission-mode=bypassPermissions"].includes(arg)
		) {
			changed = true;
			continue;
		}
		filtered.push(arg);
	}
	return changed ? { ...preset, command: filtered.map(quoteArg).join(" ") } : preset;
}

export function profileInstructions(
	profile: ModeProfile,
	repositoryRoot: string,
	taskRoot: string,
	existingArtifactPaths: readonly string[] = [],
): string {
	const permissions = profile.permissions;
	const lines = [
		"Backlog profile scope (instructions, not an OS sandbox):",
		`- Repository access: ${permissions.repository}; allowed root: ${repositoryRoot}. ${permissions.repository === "none" ? "Do not inspect repository or repository-context files." : ""}`,
		...(permissions.repository === "read-write"
			? []
			: ["- Do not edit repository source files; this is prompt guidance, not native filesystem enforcement."]),
		`- Current task metadata at ${taskRoot}: ${permissions.task}.`,
		`- Task artifacts under ${taskRoot}: ${permissions.artifacts}; artifact declarations describe suggested purposes, not an allowlist or creation requirement.`,
		`- Subagents: ${permissions.subagents}.`,
		"- Never approve artifacts or modify .artifacts.json; approval is user-only.",
		"- Shell, MCP, plugins and other harness extensions may have capabilities beyond these instructions.",
	];
	lines.push(
		"Existing task artifacts (current discovery; paths are informational, and agents may create other valid artifacts):",
	);
	const canonicalTaskRoot = resolve(taskRoot);
	for (const path of existingArtifactPaths.slice(0, 100)) {
		const absolutePath = resolve(canonicalTaskRoot, path);
		if (absolutePath !== canonicalTaskRoot && !absolutePath.startsWith(`${canonicalTaskRoot}${sep}`)) continue;
		lines.push(`- ${absolutePath}`);
	}
	if (profile.artifacts.length > 0) {
		lines.push(
			"Declared artifact paths and purposes (suggested purpose only; declarations are not an allowlist; files are optional and never pre-created):",
		);
		for (const artifact of profile.artifacts) {
			const absolutePath = resolve(canonicalTaskRoot, artifact.path);
			if (absolutePath !== canonicalTaskRoot && !absolutePath.startsWith(`${canonicalTaskRoot}${sep}`)) {
				lines.push(`- Invalid artifact path '${artifact.path}' is excluded from context.`);
				continue;
			}
			lines.push(`- ${absolutePath} — ${artifact.purpose}`);
		}
	}
	if (permissions.repository === "none") {
		lines.push(
			"- Repository None is instruction-based for context already supplied at startup; the harness may expose cwd, repository status, or instruction-file context before these instructions are applied.",
		);
	}
	if (profile.prompt.trim()) lines.push("Profile instructions:", profile.prompt.trim());
	if (!isAbsolute(repositoryRoot) || !isAbsolute(taskRoot)) {
		throw new Error("Profile permission roots must be absolute canonical paths.");
	}
	return lines.join("\n");
}

export async function discoverModels(
	harness: RuntimeAgentBootstrap,
	command: string,
	env: Record<string, string>,
	timeoutMs = 5_000,
): Promise<AgentModel[]> {
	if (harness === "claude") return [];
	let args: string[];
	try {
		args = commandArguments(command);
	} catch {
		return [];
	}
	const key = createHash("sha256")
		.update(JSON.stringify([harness, args, Object.entries(env).sort()]))
		.digest("hex");
	const cached = modelCache.get(key);
	if (cached) {
		modelCache.delete(key);
		modelCache.set(key, cached);
		return cached.map((item) => ({ ...item }));
	}
	const executable = args.shift();
	if (!executable) return [];
	let child: {
		stdout: ReadableStream<Uint8Array<ArrayBufferLike>>;
		exited: Promise<number>;
		kill(exitCode?: number | NodeJS.Signals): void;
	};
	try {
		child = Bun.spawn(
			[
				executable,
				...args,
				...(["opencode", "opencode-v1", "opencode-v2"].includes(harness) ? ["models"] : ["--list-models"]),
			],
			{
				env,
				stdin: "ignore",
				stdout: "pipe",
				stderr: "ignore",
			},
		);
	} catch {
		return [];
	}
	const boundedTimeout = Number.isFinite(timeoutMs)
		? Math.max(100, Math.min(timeoutMs, MODEL_DISCOVERY_TIMEOUT_LIMIT_MS))
		: 5_000;
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill("SIGKILL");
	}, boundedTimeout);
	try {
		const output = await new Response(child.stdout).text();
		const exitCode = await child.exited;
		if (timedOut || exitCode !== 0) return [];
		const parsed =
			harness === "pi"
				? output
						.split(/\r?\n/)
						.slice(1)
						.flatMap((line) => {
							const [provider, model] = line.trim().split(/\s+/);
							return provider && model && MODEL_ID.test(provider) && MODEL_ID.test(model)
								? [{ id: `${provider}/${model}` }]
								: [];
						})
				: output
						.split(/\r?\n/)
						.map((line) => line.trim())
						.filter((id) => MODEL_ID.test(id))
						.map((id) => ({ id }));
		const unique = deduplicateModels(parsed);
		if (exitCode === 0) {
			modelCache.set(key, unique);
			while (modelCache.size > MODEL_CACHE_LIMIT) {
				const oldest = modelCache.keys().next().value;
				if (oldest === undefined) break;
				modelCache.delete(oldest);
			}
		}
		return unique.map((item) => ({ ...item }));
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

/** Describes enforced native controls separately from instruction-only scope. */
export function profilePermissionSupport(
	harness: RuntimeAgentBootstrap,
	profile: ModeProfile,
): { native: string[]; instructionBased: string[] } {
	if (["opencode", "opencode-v1", "opencode-v2"].includes(harness)) {
		return {
			native: [],
			instructionBased: [
				"repository/task read/edit scope, subagent policy and shell access are prompt-only guidance",
				"MCP, plugins, startup context and extension capabilities may exceed that guidance",
			],
		};
	}
	const readOnly =
		profile.permissions.repository !== "read-write" &&
		profile.permissions.task === "read" &&
		profile.permissions.artifacts === "read" &&
		profile.permissions.subagents === "disabled";
	if (harness === "claude") {
		return {
			native: [
				"session-only Read/Edit path permission rules where roots do not overlap",
				...(profile.permissions.subagents === "disabled" ? ["Agent(*) denial"] : []),
				...(readOnly ? ["read-only built-in tool allowlist"] : []),
			],
			instructionBased: [
				"path-scope differences when repository and task roots overlap",
				"shell, MCP and extension capabilities beyond native rules",
			],
		};
	}
	if (readOnly && harness === "pi") {
		return {
			native: ["Pi read-only built-in tool allowlist"],
			instructionBased: ["path-specific scope"],
		};
	}
	return {
		native: [],
		instructionBased: ["repository/task/artifact path scope", "subagent policy"],
	};
}

/** Preserve explicit choices across harness changes and report validation without substituting. */
export function validateExplicitModel(
	modelId: string | undefined,
	discovered: AgentModel[] | undefined,
): { compatible: boolean | undefined; message?: string } {
	if (!modelId) return { compatible: true };
	if (!discovered)
		return { compatible: undefined, message: "Model compatibility could not be checked by this harness." };
	if (discovered.length === 0)
		return {
			compatible: undefined,
			message: "This harness returned no model catalog; the explicit model ID is retained.",
		};
	if (discovered.some((model) => model.id === modelId)) return { compatible: true };
	return {
		compatible: false,
		message: `Model '${modelId}' was not found for the selected harness; edit or confirm it before launch.`,
	};
}
