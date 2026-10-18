import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import type { Core } from "../core/agentic-workspace.ts";
import type { Storage } from "../core/storage.ts";
import { parseConfig, serializeConfig } from "../file-system/config.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { isModeTextColor } from "./mode-colors.ts";
import {
	AGENT_BOOTSTRAP_TYPES,
	type AgentBootstrap,
	type AgentConfigScope,
	type AgentConfiguration,
	type AgentPreset,
	type ModeCatalog,
	type ModeProfile,
	type ResolvedAgentConfiguration,
	type RuntimeAgentBootstrap,
	resolveSessionSettings,
	type SessionSettings,
} from "./types.ts";

const BOOTSTRAP_TYPES = new Set<AgentBootstrap>(AGENT_BOOTSTRAP_TYPES);
const SAFE_PRESET_NAME = /^(?!__proto__$|prototype$|constructor$)[A-Za-z_][A-Za-z0-9_-]*$/;
const POSIX_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ROOT_CONFIGURATION_FILE_NAME = "agentic-workspace.config.yml";
const SAFE_MODE_ID = /^(?!__proto__$|prototype$|constructor$)[a-z][a-z0-9-]*$/;

/** Task-container relative names only; internal files and task records are not artifacts. */
export function validateArtifactPath(path: string): string {
	if (
		!path ||
		path.includes("\0") ||
		path.includes("\\") ||
		path.startsWith("/") ||
		/^[A-Za-z]:/.test(path) ||
		path.split("/").some((part) => !part || part === "." || part === "..") ||
		path === "task.md" ||
		path === ".artifacts.json"
	)
		throw new Error(`Invalid task artifact path: ${path}`);
	return path;
}

const PLAN_PROFILE: ModeProfile = {
	name: "PLAN",
	textColor: "green",
	model: { kind: "default" },
	prompt:
		"Clarify the task and plan work without implementing it. Ask the user about unresolved decisions. Create or update artifacts only when useful. Never approve artifacts or modify .artifacts.json; only the user approves.",
	permissions: { repository: "read", task: "read-write", artifacts: "read-write", subagents: "allowed" },
	artifacts: [
		{
			path: "spec.md",
			purpose: "WHAT: requirements, behavior, constraints, acceptance criteria, and durable decisions.",
		},
		{ path: "plan.md", purpose: "HOW: approach, affected areas, steps, and validation." },
	],
	approvalArtifact: "plan.md",
};

const BUILD_PROFILE: ModeProfile = {
	name: "BUILD",
	textColor: "blue",
	model: { kind: "default" },
	prompt:
		"Carry out the approved task, follow repository guidance, and verify your changes. Never approve artifacts or modify .artifacts.json; only the user approves.",
	permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "allowed" },
	artifacts: [],
};

export function getDefaultModeCatalog(): ModeCatalog {
	return {
		version: 1,
		defaultModeId: "plan",
		order: ["plan", "build"],
		profiles: { plan: clone(PLAN_PROFILE), build: clone(BUILD_PROFILE) },
	};
}

/** Resolve absent/invalid local selections without creating a history entry. */
export function resolveSelectedMode(catalog: ModeCatalog, selected?: string): string {
	return selected && catalog.profiles[selected] ? selected : catalog.defaultModeId;
}

const BUILT_IN_CONFIGURATION: AgentConfiguration = {
	selectedPreset: "opencode",
	presets: {
		opencode: {
			command: "opencode",
			env: {},
			prepare: "",
			bootstrap: "opencode",
			resumeFlag: "--session",
		},
		claude: {
			command: "claude",
			env: {},
			prepare: "",
			bootstrap: "claude",
			resumeFlag: "--resume",
		},
		pi: { command: "pi", env: {}, prepare: "", bootstrap: "pi", resumeFlag: "--session" },
	},
};

/** Static settings presentation capabilities for public adapter IDs; never performs adapter discovery. */
export const AGENT_PRESENTATION_METADATA: Record<
	RuntimeAgentBootstrap,
	{ resumeFlag?: string; allowManualModel: boolean }
> = {
	opencode: { resumeFlag: "--session", allowManualModel: false },
	"opencode-v1": { resumeFlag: "--session", allowManualModel: false },
	"opencode-v2": { resumeFlag: "--session", allowManualModel: false },
	claude: { resumeFlag: "--resume", allowManualModel: true },
	pi: { resumeFlag: "--session", allowManualModel: false },
};

export const YOLO_PRESENTATION_EXPLANATION =
	"OpenCode uses --auto; Claude uses full bypass (--dangerously-skip-permissions), even in read-only PLAN. Pi has no verified flag. Permission auto-acceptance never approves artifacts; only you may approve them or change .artifacts.json. Profile path rules are not a security boundary under YOLO; shell/MCP can bypass them.";

function clone<T>(value: T): T {
	return structuredClone(value);
}

/** Returns a mutable copy of AgenticWorkspace's canonical agent presets. */
export function getBuiltInAgentConfiguration(): AgentConfiguration {
	return clone(BUILT_IN_CONFIGURATION);
}

export function rootConfigFilePath(): string {
	const configHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), ".config");
	return join(configHome, "agentic-workspace", ROOT_CONFIGURATION_FILE_NAME);
}

function requireTaskId(scope: AgentConfigScope, taskId: string | undefined): string {
	if (scope === "card" && !taskId) throw new Error("A task ID is required for card agent configuration.");
	return taskId ?? "";
}

function hasNul(value: string): boolean {
	return value.includes("\0");
}

function assertPreset(value: unknown, name: string, label: string): void {
	if (!SAFE_PRESET_NAME.test(name) || !value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label}.presets entries must be named objects.`);
	}
	const preset = value as Partial<AgentPreset>;
	if (Object.hasOwn(value, "worktree")) {
		throw new Error(`${label}.presets.${name}.worktree is retired; remove this unsupported field from the preset.`);
	}
	if (typeof preset.command !== "string" || !preset.command.trim() || hasNul(preset.command)) {
		throw new Error(`${label}.presets.${name}.command must be a non-empty string.`);
	}
	if (typeof preset.prepare !== "string" || hasNul(preset.prepare)) {
		throw new Error(`${label}.presets.${name}.prepare must be a string.`);
	}
	if (!BOOTSTRAP_TYPES.has(preset.bootstrap as AgentBootstrap)) {
		throw new Error(`${label}.presets.${name}.bootstrap is invalid; set it to a supported bootstrap value.`);
	}
	if (preset.resumeFlag !== undefined) {
		if (typeof preset.resumeFlag !== "string" || !preset.resumeFlag.trim() || hasNul(preset.resumeFlag)) {
			throw new Error(`${label}.presets.${name}.resumeFlag must be a non-empty string without NUL bytes.`);
		}
	}
	assertPresetEnvironment(preset.env, name, label);
}

function assertPresetEnvironment(value: unknown, name: string, label: string): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label}.presets.${name}.env must be an object of strings.`);
	}
	for (const [key, envValue] of Object.entries(value)) {
		if (!POSIX_ENV_NAME.test(key) || typeof envValue !== "string" || hasNul(envValue)) {
			throw new Error(`${label}.presets.${name}.env must be an object of strings.`);
		}
	}
}

function assertAgentConfiguration(value: unknown, label = "Agent configuration"): asserts value is AgentConfiguration {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
	const config = value as Partial<AgentConfiguration>;
	if (typeof config.selectedPreset !== "string" || !SAFE_PRESET_NAME.test(config.selectedPreset)) {
		throw new Error(`${label}.selectedPreset must be a non-empty string.`);
	}
	if (!config.presets || typeof config.presets !== "object" || Array.isArray(config.presets)) {
		throw new Error(`${label}.presets must be an object.`);
	}
	if (!Object.hasOwn(config.presets, config.selectedPreset)) {
		throw new Error(`${label}.selectedPreset must name a configured preset.`);
	}

	for (const [name, preset] of Object.entries(config.presets)) assertPreset(preset, name, label);

	if (config.sessions !== undefined) assertSessionSettings(config.sessions, label);
	if (config.modes !== undefined) assertModeCatalog(config.modes, `${label}.modes`);
}

function assertModeCatalog(value: unknown, label: string): asserts value is ModeCatalog {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
	const catalog = value as Partial<ModeCatalog>;
	if (
		catalog.version !== 1 ||
		typeof catalog.defaultModeId !== "string" ||
		!catalog.profiles ||
		typeof catalog.profiles !== "object" ||
		Array.isArray(catalog.profiles)
	)
		throw new Error(`${label} has an invalid version or profiles.`);
	const ids = Object.keys(catalog.profiles);
	if (
		!ids.length ||
		!Array.isArray(catalog.order) ||
		catalog.order.length !== ids.length ||
		new Set(catalog.order).size !== ids.length ||
		ids.some((id) => !SAFE_MODE_ID.test(id) || !catalog.order?.includes(id)) ||
		!catalog.profiles[catalog.defaultModeId]
	)
		throw new Error(`${label} must have unique ordered profiles and a valid defaultModeId.`);
	for (const [id, raw] of Object.entries(catalog.profiles)) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw))
			throw new Error(`${label}.profiles.${id} must be an object.`);
		const profile = raw as ModeProfile;
		if (profile.textColor !== undefined && !isModeTextColor(profile.textColor))
			throw new Error(`${label}.profiles.${id}.textColor must be a supported lowercase named color.`);
		if (
			typeof profile.name !== "string" ||
			!profile.name.trim() ||
			typeof profile.prompt !== "string" ||
			!profile.model ||
			!["default", "explicit"].includes(profile.model.kind) ||
			(profile.model.kind === "explicit" && (!profile.model.id.trim() || /[\0\r\n]/.test(profile.model.id)))
		)
			throw new Error(`${label}.profiles.${id} has invalid name, prompt, or model.`);
		const p = profile.permissions;
		if (
			!p ||
			!["none", "read", "read-write"].includes(p.repository) ||
			!["read", "read-write"].includes(p.task) ||
			!["read", "read-write"].includes(p.artifacts) ||
			!["allowed", "disabled"].includes(p.subagents) ||
			!Array.isArray(profile.artifacts)
		)
			throw new Error(`${label}.profiles.${id} has invalid permissions or artifacts.`);
		for (const artifact of profile.artifacts) {
			if (!artifact || typeof artifact.purpose !== "string")
				throw new Error(`${label}.profiles.${id} has an invalid artifact declaration.`);
			validateArtifactPath(artifact.path);
		}
		if (profile.approvalArtifact !== undefined) validateArtifactPath(profile.approvalArtifact);
	}
}

function assertSessionSettings(value: unknown, label: string): void {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label}.sessions must be an object.`);
	}
	const sessions = value as Partial<SessionSettings>;
	if (typeof sessions.worktreePerTask !== "boolean") {
		throw new Error(`${label}.sessions.worktreePerTask must be a boolean.`);
	}
	if (typeof sessions.yoloMode !== "boolean") {
		throw new Error(`${label}.sessions.yoloMode must be a boolean.`);
	}
	if (Object.hasOwn(value, "autoResumeOnRestart") && typeof sessions.autoResumeOnRestart !== "boolean") {
		throw new Error(`${label}.sessions.autoResumeOnRestart must be a boolean.`);
	}
}

export async function readRootConfiguration(path: string): Promise<AgentConfiguration | null> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = parseConfig(content, path).agentConfiguration;
	} catch (error) {
		throw new Error(`Invalid agent configuration at ${path}: ${(error as Error).message}`);
	}
	if (parsed === undefined) return null;
	assertAgentConfiguration(parsed, `Invalid agent configuration at ${path}`);
	return clone(parsed);
}

function mergeAgentConfiguration(base: AgentConfiguration, override: Partial<AgentConfiguration>): AgentConfiguration {
	return {
		...base,
		...override,
		presets: { ...base.presets, ...override.presets },
		...(override.sessions !== undefined && { sessions: { ...base.sessions, ...override.sessions } }),
	};
}

/** A task-independent startup snapshot of user and project agent configuration. */
export class Config {
	private userConfiguration: AgentConfiguration | null = null;
	private projectConfiguration: AgentConfiguration | null = null;
	private loaded = false;

	constructor(private readonly storage: Storage) {}

	static async load(storage: Storage): Promise<Config> {
		const config = new Config(storage);
		await config.reload();
		return config;
	}

	async reload(): Promise<void> {
		const [user, project] = await Promise.all([
			this.storage.loadUserAgentConfiguration(),
			this.storage.loadProjectAgentConfiguration(),
		]);
		if (user) assertAgentConfiguration(user, "Invalid user agent configuration");
		if (project) assertAgentConfiguration(project, "Invalid project agent configuration");
		this.userConfiguration = user ? clone(user) : null;
		this.projectConfiguration = project ? clone(project) : null;
		this.loaded = true;
	}

	getConfig(...overrides: Array<Partial<AgentConfiguration> | undefined>): AgentConfiguration {
		if (!this.loaded) throw new Error("Agent configuration has not been loaded; call reload() first.");
		let config = getBuiltInAgentConfiguration();
		if (this.userConfiguration) config = mergeAgentConfiguration(config, this.userConfiguration);
		if (this.projectConfiguration) config = mergeAgentConfiguration(config, this.projectConfiguration);
		for (const override of overrides) if (override) config = mergeAgentConfiguration(config, override);
		return clone(config);
	}

	get sessionSettings(): SessionSettings {
		return resolveSessionSettings(this.getConfig());
	}

	get modes(): ModeCatalog | undefined {
		return this.getConfig().modes;
	}
}

async function withConfigurationLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
	await mkdir(dirname(path), { recursive: true });
	const release = await lockfile.lock(path, {
		realpath: false,
		retries: { retries: 4, minTimeout: 25, maxTimeout: 200 },
	});
	try {
		return await operation();
	} finally {
		await release();
	}
}

async function writeRootConfiguration(path: string, config: AgentConfiguration): Promise<void> {
	let temporaryPath: string | undefined;
	try {
		temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
		const existing = await readFile(path, "utf8").catch(() => "");
		const workspaceConfig = parseConfig(existing, path);
		workspaceConfig.agentConfiguration = config;
		await writeFile(temporaryPath, serializeConfig(workspaceConfig), "utf8");
		await rename(temporaryPath, path);
	} finally {
		if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
	}
}

async function rootOrBuiltIn(core: Core): Promise<ResolvedAgentConfiguration> {
	const config = await loadAgentConfiguration(core, "root");
	return { scope: "root", config: config ?? clone(BUILT_IN_CONFIGURATION) };
}

async function projectOrParent(core: Core): Promise<ResolvedAgentConfiguration> {
	const config = await loadAgentConfiguration(core, "project");
	return config ? { scope: "project", config } : await rootOrBuiltIn(core);
}

export async function loadAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration | null> {
	if (scope === "root") return await readRootConfiguration(rootConfigFilePath());
	if (scope === "project") {
		const configuration = await core.filesystem.loadConfig();
		if (!configuration?.agentConfiguration) return null;
		assertAgentConfiguration(configuration.agentConfiguration, "Invalid project agent configuration");
		return clone(configuration.agentConfiguration);
	}

	const task = await core.filesystem.loadTask(requireTaskId(scope, taskId));
	if (!task) throw new Error(`Task not found: ${taskId}`);
	if (task.agentConfiguration === undefined) return null;
	assertAgentConfiguration(task.agentConfiguration, `Invalid agent configuration on task ${task.id}`);
	return clone(task.agentConfiguration);
}

/** Validate the project-owned catalog without inheriting or seeding initialization defaults. */
export function requireProjectModeCatalog(configuration: AgentConfiguration | null): ModeCatalog {
	if (!configuration?.modes) {
		throw new Error(
			"Project modes are not initialized. Run `agentic-workspace workspace` and configure project modes in the TUI.",
		);
	}
	assertModeCatalog(configuration.modes, "Project mode catalog");
	return configuration.modes;
}

/** Read only the exact project scope; root/card configuration cannot supply workspace modes. */
export async function loadProjectModeCatalog(core: Core): Promise<ModeCatalog> {
	return requireProjectModeCatalog(await loadAgentConfiguration(core, "project"));
}

export async function resolveAgentConfiguration(core: Core, taskId?: string): Promise<ResolvedAgentConfiguration> {
	const parent = await projectOrParent(core);
	if (!taskId) return parent;
	const card = await loadAgentConfiguration(core, "card", taskId);
	if (!card) return parent;
	return {
		scope: "card",
		config: {
			...parent.config,
			...card,
			presets: { ...parent.config.presets, ...card.presets },
			sessions: card.sessions ? { ...parent.config.sessions, ...card.sessions } : parent.config.sessions,
			// Modes are project-owned; task/root configuration cannot replace the catalogue.
			modes: parent.config.modes,
		},
	};
}

/** Resolve a saved preset name using current task, project, then user configuration. */
export async function resolveSessionPreset(
	core: Core,
	session: { taskId: string; preset: string },
): Promise<AgentPreset> {
	const resolved = await resolveAgentConfiguration(core, session.taskId);
	const preset = resolved.config.presets[session.preset];
	if (!preset) throw new Error(`Agent preset not found for existing session: ${session.preset}`);
	return preset;
}

export async function initializeAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration> {
	return await updateAgentConfigurationInternal(
		core,
		scope,
		(config) =>
			scope === "project" && config.modes === undefined ? { ...config, modes: getDefaultModeCatalog() } : config,
		taskId,
		true,
	);
}

/** Returns the exact scoped configuration, or a parent copy without persisting it. */
export async function getEditableAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration> {
	const existing = await loadAgentConfiguration(core, scope, taskId);
	if (existing) return existing;
	const parent =
		scope === "root"
			? { scope: "root" as const, config: clone(BUILT_IN_CONFIGURATION) }
			: scope === "project"
				? await rootOrBuiltIn(core)
				: await projectOrParent(core);
	return clone(parent.config);
}

async function updateAgentConfigurationInternal(
	core: Core,
	scope: AgentConfigScope,
	updater: (config: AgentConfiguration) => AgentConfiguration,
	taskId: string | undefined,
	onlyIfAbsent: boolean,
): Promise<AgentConfiguration> {
	if (scope !== "card") {
		const path = scope === "root" ? rootConfigFilePath() : core.filesystem.configFilePath;
		return await withConfigurationLock(path, async () => {
			const existing =
				scope === "root"
					? await readRootConfiguration(path)
					: ((await core.filesystem.loadConfig())?.agentConfiguration ?? null);
			if (existing) assertAgentConfiguration(existing, `Invalid ${scope} agent configuration`);
			if (existing && onlyIfAbsent) {
				if (scope !== "project" || existing.modes !== undefined) return existing;
				const initialized = clone(updater(clone(existing)));
				assertAgentConfiguration(initialized);
				const workspaceConfig = (await core.filesystem.loadConfig()) ?? parseConfig("", path);
				await core.filesystem.saveConfig({ ...workspaceConfig, agentConfiguration: initialized });
				await core.reloadConfiguration();
				return initialized;
			}
			const base = existing ?? (await getEditableAgentConfiguration(core, scope, taskId));
			const next = clone(updater(clone(base)));
			assertAgentConfiguration(next);
			if (scope === "root") await writeRootConfiguration(path, next);
			else {
				const workspaceConfig = (await core.filesystem.loadConfig()) ?? parseConfig("", path);
				await core.filesystem.saveConfig({ ...workspaceConfig, agentConfiguration: next } as AgenticWorkspaceConfig);
			}
			await core.reloadConfiguration();
			return next;
		});
	}

	const id = requireTaskId(scope, taskId);
	const task = await core.filesystem.loadTask(id);
	if (!task) throw new Error(`Task not found: ${id}`);
	return await core.filesystem.withTaskLock(task, async () => {
		const current = await core.filesystem.loadTask(id);
		if (!current) throw new Error(`Task not found: ${id}`);
		const stored = current.agentConfiguration;
		const existing = stored === undefined ? undefined : clone(stored);
		if (existing !== undefined) assertAgentConfiguration(existing, `Invalid agent configuration on task ${current.id}`);
		if (existing && onlyIfAbsent) return clone(existing);
		const base = existing ?? (await getEditableAgentConfiguration(core, scope, id));
		const next = clone(updater(clone(base)));
		assertAgentConfiguration(next);
		current.agentConfiguration = next;
		await core.updateTask(current);
		return next;
	});
}

export async function updateAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	updater: (config: AgentConfiguration) => AgentConfiguration,
	taskId?: string,
): Promise<AgentConfiguration> {
	return await updateAgentConfigurationInternal(core, scope, updater, taskId, false);
}

export async function upsertAgentConfiguration(
	core: Core,
	scope: AgentConfigScope,
	config: AgentConfiguration,
	taskId?: string,
): Promise<void> {
	assertAgentConfiguration(config);
	await updateAgentConfiguration(core, scope, () => clone(config), taskId);
}
