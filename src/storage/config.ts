import { chmod, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { LockOwner } from "../filesystem/lock-owner.ts";
import type {
	AgentConfiguration,
	EffectiveAgentConfiguration,
	ModeCatalog,
	RuntimeAgentBootstrap,
} from "../model/session/types.ts";
import type { AgenticWorkspaceConfig } from "../model/types.ts";
import { parseConfig, serializeConfig } from "./config-codec.ts";

const configLock = new LockOwner();

export async function withConfigPathLock<T>(
	path: string,
	scope: "root" | "project",
	operation: () => Promise<T>,
): Promise<T> {
	return await configLock.withTarget(
		path,
		join(dirname(path), ".locks", "agentic-workspace-config"),
		{ staleMs: 2_000, retries: 15, retryDelayMs: 25 },
		(error) =>
			new Error(
				`Could not lock ${scope} agent configuration at ${path}: ${error instanceof Error ? error.message : String(error)}`,
			),
		operation,
	);
}

export function getDefaultModeCatalog(): ModeCatalog {
	return {
		version: 1,
		defaultModeId: "plan",
		order: ["plan", "build"],
		profiles: {
			plan: {
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
			},
			build: {
				name: "BUILD",
				textColor: "blue",
				model: { kind: "default" },
				prompt:
					"Carry out the approved task, follow repository guidance, and verify your changes. Never approve artifacts or modify .artifacts.json; only the user approves.",
				permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "allowed" },
				artifacts: [],
			},
		},
	};
}

/** Resolve absent/invalid local selections without creating a history entry. */
export function resolveSelectedMode(catalog: ModeCatalog, selected?: string): string {
	return selected && catalog.profiles[selected] ? selected : catalog.defaultModeId;
}

/** Returns a mutable copy of AgenticWorkspace's canonical agent presets. */
export function getBuiltInAgentConfiguration(): EffectiveAgentConfiguration {
	return {
		selectedPreset: "opencode",
		sessions: { worktreePerTask: false, yoloMode: false, autoResumeOnRestart: true },
		presets: {
			opencode: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode", resumeFlag: "--session" },
			claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude", resumeFlag: "--resume" },
			pi: { command: ["pi"], env: {}, prepare: "", bootstrap: "pi", resumeFlag: "--session" },
		},
	};
}

/** Static settings presentation capabilities; never performs adapter discovery. */
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

export function requireProjectModeCatalog(configuration: AgentConfiguration | null): ModeCatalog {
	if (!configuration?.modes)
		throw new Error(
			"Project modes are not initialized. Run `agentic-workspace workspace` and configure project modes in the TUI.",
		);
	return configuration.modes;
}

export function rootConfigFilePath(): string {
	const configHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || homedir(), ".config");
	return join(configHome, "agentic-workspace", "agentic-workspace.config.yml");
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
		parsed = parseConfig(content, path, "root").agentConfiguration;
	} catch (error) {
		throw new Error(`Invalid agent configuration at ${path}: ${(error as Error).message}`);
	}
	if (parsed === undefined) return null;
	return structuredClone(parsed);
}

/** The Storage facade supplies its existing project codec and persistence implementation. */
export interface AgentConfigurationStorage {
	readonly configFilePath: string;
	loadConfig(): Promise<AgenticWorkspaceConfig | null>;
	loadConfigFromDisk(): Promise<AgenticWorkspaceConfig | null>;
	saveConfig(config: AgenticWorkspaceConfig): Promise<void>;
	saveConfigUnderConfigLock(config: AgenticWorkspaceConfig): Promise<void>;
}

/** Persist an exact scope atomically under its lock; application policy stays in the updater. */
export async function updateStoredAgentConfiguration(
	storage: AgentConfigurationStorage,
	scope: "root" | "project",
	updater: (configuration: AgentConfiguration | null) => AgentConfiguration,
): Promise<AgentConfiguration> {
	const path = scope === "root" ? rootConfigFilePath() : storage.configFilePath;
	return await withConfigPathLock(path, scope, async () => {
		const workspaceConfig =
			scope === "root"
				? parseConfig(
						await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
							if (error.code === "ENOENT") return "";
							throw error;
						}),
						path,
						"root",
					)
				: ((await storage.loadConfigFromDisk()) ?? parseConfig("", path));
		const current = structuredClone(workspaceConfig.agentConfiguration ?? null);
		const updated = updater(current);
		const next = structuredClone(updated);
		if (updated === current) return next;
		workspaceConfig.agentConfiguration = next;
		if (scope === "project") await storage.saveConfigUnderConfigLock(workspaceConfig);
		else {
			const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
			try {
				const mode = await stat(path)
					.then((info) => info.mode & 0o777)
					.catch((error: NodeJS.ErrnoException) => {
						if (error.code === "ENOENT") return undefined;
						throw error;
					});
				await writeFile(temporary, serializeConfig(workspaceConfig), { encoding: "utf8", mode: 0o600 });
				if (mode !== undefined) await chmod(temporary, mode);
				await rename(temporary, path);
			} finally {
				await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
					if (error.code !== "ENOENT") throw error;
				});
			}
		}
		return next;
	});
}
