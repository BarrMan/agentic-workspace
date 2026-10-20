import { chmod, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import type { Core } from "../controller/agentic-workspace.ts";
import {
	assertAgentConfiguration,
	assertModeCatalog,
	validateArtifactPath,
} from "../model/session/agent-config-schema.ts";
import {
	type AgentConfigScope,
	type AgentConfiguration,
	type AgentPreset,
	type ModeCatalog,
	type ModeProfile,
	type ResolvedAgentConfiguration,
	type RuntimeAgentBootstrap,
	resolveSessionSettings,
	type SessionSettings,
} from "../model/session/types.ts";
import type { AgenticWorkspaceConfig } from "../model/types.ts";
import { parseConfig, serializeConfig } from "./config-codec.ts";
import type { Storage } from "./storage.ts";

const ROOT_CONFIGURATION_FILE_NAME = "agentic-workspace.config.yml";

export { validateArtifactPath };

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
			command: ["opencode"],
			env: {},
			prepare: "",
			bootstrap: "opencode",
			resumeFlag: "--session",
		},
		claude: {
			command: ["claude"],
			env: {},
			prepare: "",
			bootstrap: "claude",
			resumeFlag: "--resume",
		},
		pi: { command: ["pi"], env: {}, prepare: "", bootstrap: "pi", resumeFlag: "--session" },
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
		const existingMode = await stat(path)
			.then((info) => info.mode & 0o777)
			.catch(() => undefined);
		const existing = await readFile(path, "utf8").catch(() => "");
		const workspaceConfig = parseConfig(existing, path);
		workspaceConfig.agentConfiguration = config;
		await writeFile(temporaryPath, serializeConfig(workspaceConfig), { encoding: "utf8", mode: 0o600 });
		if (existingMode !== undefined) await chmod(temporaryPath, existingMode);
		await rename(temporaryPath, path);
	} finally {
		if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
	}
}

async function writeProjectConfiguration(core: Core, config: AgenticWorkspaceConfig): Promise<void> {
	await core.saveWorkspaceConfig(config);
	await core.reloadConfiguration();
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
		const configuration = await core.getStoredConfig();
		if (!configuration?.agentConfiguration) return null;
		assertAgentConfiguration(configuration.agentConfiguration, "Invalid project agent configuration");
		return clone(configuration.agentConfiguration);
	}

	const task = await core.getTask(requireTaskId(scope, taskId));
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
		const path = scope === "root" ? rootConfigFilePath() : core.projectConfigPath;
		return await withConfigurationLock(path, async () => {
			const existing =
				scope === "root"
					? await readRootConfiguration(path)
					: ((await core.getStoredConfig())?.agentConfiguration ?? null);
			if (existing) assertAgentConfiguration(existing, `Invalid ${scope} agent configuration`);
			if (existing && onlyIfAbsent) {
				if (scope !== "project" || existing.modes !== undefined) return existing;
				const initialized = clone(updater(clone(existing)));
				assertAgentConfiguration(initialized);
				const workspaceConfig = (await core.getStoredConfig()) ?? parseConfig("", path);
				await writeProjectConfiguration(core, { ...workspaceConfig, agentConfiguration: initialized });
				return initialized;
			}
			const base = existing ?? (await getEditableAgentConfiguration(core, scope, taskId));
			const next = clone(updater(clone(base)));
			assertAgentConfiguration(next);
			if (scope === "root") await writeRootConfiguration(path, next);
			else {
				const workspaceConfig = (await core.getStoredConfig()) ?? parseConfig("", path);
				await writeProjectConfiguration(core, {
					...workspaceConfig,
					agentConfiguration: next,
				} as AgenticWorkspaceConfig);
			}
			if (scope === "root") await core.reloadConfiguration();
			return next;
		});
	}

	const id = requireTaskId(scope, taskId);
	const task = await core.getTask(id);
	if (!task) throw new Error(`Task not found: ${id}`);
	return await core.withTaskLock(task, async () => {
		const current = await core.getTask(id);
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
