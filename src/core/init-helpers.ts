import {
	type AgentInstructionFile,
	type AgentInstructionWriteResult,
	addAgentInstructions,
	ensureMcpGuidelines,
} from "../agent-instructions.ts";
import {
	DEFAULT_FRESH_INIT_POLICY,
	DEFAULT_INIT_CONFIG,
	DEFAULT_STATUSES,
	FALLBACK_STATUS,
} from "../constants/index.ts";
import { FileSystem } from "../file-system/operations.ts";
import type { BacklogConfig } from "../types/index.ts";
import {
	BACKLOG_CONFIG_SOURCE,
	BACKLOG_DIRECTORY_SOURCE,
	normalizeProjectBacklogDirectory,
} from "../utils/backlog-directory.ts";
import {
	formatMcpClientSetupCommand,
	getMcpClientInstructionFile,
	getMcpClientSetupCommand,
	isMcpClientSetupKey,
	type McpClientSetupKey,
	runMcpClientSetupCommand,
} from "../utils/mcp-client-setup.ts";
import { getTaskPrefixError } from "../utils/prefix-config.ts";
import type { Core } from "./backlog.ts";

const MCP_SERVER_NAME = "agenticworkspace";
const MCP_GUIDE_URL = "https://github.com/BarrMan/agentic-workspace";

export type IntegrationMode = "mcp" | "cli" | "none";
export type McpClient = "claude" | "codex" | "gemini" | "kiro" | "guide";

export interface InitializeProjectOptions {
	projectName: string;
	backlogDirectory?: string;
	backlogDirectorySource?: "backlog" | ".backlog" | "custom";
	configLocation?: "folder" | "root";
	integrationMode: IntegrationMode;
	mcpClients?: McpClient[];
	agentInstructions?: AgentInstructionFile[];
	filesystemOnly?: boolean;
	advancedConfig?: {
		checkActiveBranches?: boolean;
		remoteOperations?: boolean;
		activeBranchDays?: number;
		bypassGitHooks?: boolean;
		zeroPaddedIds?: number;
		defaultEditor?: string;
		defaultPort?: number;
		autoOpenBrowser?: boolean;
		/** Custom task prefix (e.g., "JIRA"). Only set during first init, read-only after. */
		taskPrefix?: string;
	};
	/** Existing config for re-initialization */
	existingConfig?: BacklogConfig | null;
}

function formatAgentInstructionResults(results: AgentInstructionWriteResult[]): string {
	const labels: Array<[AgentInstructionWriteResult["action"], string]> = [
		["created", "Created"],
		["updated", "Updated"],
		["unchanged", "Unchanged"],
	];

	return labels
		.map(([action, label]) => {
			const fileNames = results.filter((result) => result.action === action).map((result) => result.fileName);
			return fileNames.length > 0 ? `${label}: ${fileNames.join(", ")}` : null;
		})
		.filter((line): line is string => line !== null)
		.join("\n");
}

function validateInitialization(options: InitializeProjectOptions): void {
	const taskPrefixError = getTaskPrefixError(options.advancedConfig?.taskPrefix ?? "");
	if (taskPrefixError) throw new Error(taskPrefixError);
}

function resolveFreshConfig(projectName: string, taskPrefix?: string): BacklogConfig {
	const defaults = DEFAULT_INIT_CONFIG;
	return {
		projectName,
		statuses: [...DEFAULT_STATUSES],
		labels: [],
		defaultStatus: FALLBACK_STATUS,
		dateFormat: DEFAULT_FRESH_INIT_POLICY.dateFormat,
		maxColumnWidth: DEFAULT_FRESH_INIT_POLICY.maxColumnWidth,
		filesystemOnly: defaults.filesystemOnly,
		remoteOperations: defaults.remoteOperations,
		bypassGitHooks: defaults.bypassGitHooks,
		checkActiveBranches: defaults.checkActiveBranches,
		activeBranchDays: defaults.activeBranchDays,
		defaultPort: defaults.defaultPort,
		autoOpenBrowser: defaults.autoOpenBrowser,
		taskResolutionStrategy: DEFAULT_FRESH_INIT_POLICY.taskResolutionStrategy,
		prefixes: { task: taskPrefix || "task" },
	};
}

function applyOptionalOverrides(
	config: BacklogConfig,
	advancedConfig: NonNullable<InitializeProjectOptions["advancedConfig"]>,
): void {
	if (Object.hasOwn(advancedConfig, "defaultEditor")) {
		if (advancedConfig.defaultEditor) config.defaultEditor = advancedConfig.defaultEditor;
		else delete config.defaultEditor;
	}
	if (Object.hasOwn(advancedConfig, "zeroPaddedIds")) {
		if (typeof advancedConfig.zeroPaddedIds === "number" && advancedConfig.zeroPaddedIds > 0) {
			config.zeroPaddedIds = advancedConfig.zeroPaddedIds;
		} else delete config.zeroPaddedIds;
	}
}

function resolveConfigValue<T>(override: T | undefined, existing: T | undefined, fallback: T): T {
	return override ?? existing ?? fallback;
}

export function resolveInitializationConfig(options: InitializeProjectOptions): {
	config: BacklogConfig;
	isReInitialization: boolean;
} {
	validateInitialization(options);
	const existingConfig = options.existingConfig;
	const isReInitialization = !!existingConfig;
	const effectiveFilesystemOnly = options.filesystemOnly || existingConfig?.filesystemOnly === true;
	const advancedConfig = effectiveFilesystemOnly
		? {
				...options.advancedConfig,
				checkActiveBranches: false,
				remoteOperations: false,
				bypassGitHooks: false,
			}
		: (options.advancedConfig ?? {});
	const defaults = DEFAULT_INIT_CONFIG;
	const freshConfig = resolveFreshConfig(options.projectName, advancedConfig.taskPrefix);
	const config: BacklogConfig = {
		...freshConfig,
		...(existingConfig ?? {}),
		projectName: options.projectName,
		filesystemOnly: effectiveFilesystemOnly || defaults.filesystemOnly,
		remoteOperations: resolveConfigValue(
			advancedConfig.remoteOperations,
			existingConfig?.remoteOperations,
			defaults.remoteOperations,
		),
		bypassGitHooks: resolveConfigValue(
			advancedConfig.bypassGitHooks,
			existingConfig?.bypassGitHooks,
			defaults.bypassGitHooks,
		),
		checkActiveBranches: resolveConfigValue(
			advancedConfig.checkActiveBranches,
			existingConfig?.checkActiveBranches,
			defaults.checkActiveBranches,
		),
		activeBranchDays: resolveConfigValue(
			advancedConfig.activeBranchDays,
			existingConfig?.activeBranchDays,
			defaults.activeBranchDays,
		),
		defaultPort: resolveConfigValue(advancedConfig.defaultPort, existingConfig?.defaultPort, defaults.defaultPort),
		autoOpenBrowser: resolveConfigValue(
			advancedConfig.autoOpenBrowser,
			existingConfig?.autoOpenBrowser,
			defaults.autoOpenBrowser,
		),
		prefixes: existingConfig?.prefixes ?? freshConfig.prefixes,
	};
	applyOptionalOverrides(config, advancedConfig);
	return { config, isReInitialization };
}

function inferBacklogDirectorySource(
	backlogDirectory: string | null,
): InitializeProjectOptions["backlogDirectorySource"] | undefined {
	if (!backlogDirectory) return undefined;
	if (backlogDirectory === BACKLOG_DIRECTORY_SOURCE.HIDDEN) return BACKLOG_DIRECTORY_SOURCE.HIDDEN;
	if (backlogDirectory === BACKLOG_DIRECTORY_SOURCE.DEFAULT) return BACKLOG_DIRECTORY_SOURCE.DEFAULT;
	return BACKLOG_DIRECTORY_SOURCE.CUSTOM;
}

function resolveBacklogDirectorySource(
	options: InitializeProjectOptions,
	backlogDirectory: string | null,
): InitializeProjectOptions["backlogDirectorySource"] | undefined {
	const inferredSource = inferBacklogDirectorySource(backlogDirectory);
	if (options.backlogDirectorySource && inferredSource && options.backlogDirectorySource !== inferredSource) {
		throw new Error("Backlog directory source and backlog directory value must agree.");
	}
	const source = options.backlogDirectorySource ?? inferredSource;
	if (source === BACKLOG_DIRECTORY_SOURCE.CUSTOM && !backlogDirectory) {
		throw new Error("Backlog directory must be a valid project-relative path.");
	}
	return source;
}

function resolveConfigLocation(
	source: InitializeProjectOptions["backlogDirectorySource"] | undefined,
	configLocation: InitializeProjectOptions["configLocation"],
): "folder" | "root" {
	const location =
		configLocation ??
		(source === BACKLOG_DIRECTORY_SOURCE.CUSTOM ? BACKLOG_CONFIG_SOURCE.ROOT : BACKLOG_CONFIG_SOURCE.FOLDER);
	if (source === BACKLOG_DIRECTORY_SOURCE.CUSTOM && location !== BACKLOG_CONFIG_SOURCE.ROOT) {
		throw new Error("Custom backlog directories require root config discovery.");
	}
	return location;
}

function resolveProjectDirectories(options: InitializeProjectOptions): {
	backlogDirectory: string;
	configLocation: "folder" | "root";
} {
	const backlogDirectory = normalizeProjectBacklogDirectory(options.backlogDirectory);
	const source = resolveBacklogDirectorySource(options, backlogDirectory);
	return {
		backlogDirectory:
			backlogDirectory ??
			(source === BACKLOG_DIRECTORY_SOURCE.HIDDEN ? BACKLOG_DIRECTORY_SOURCE.HIDDEN : BACKLOG_DIRECTORY_SOURCE.DEFAULT),
		configLocation: resolveConfigLocation(source, options.configLocation),
	};
}

export async function initializeProjectFiles(
	core: Core,
	options: InitializeProjectOptions,
	config: BacklogConfig,
	isReInitialization: boolean,
): Promise<void> {
	if (isReInitialization) {
		await core.filesystem.saveConfig(config);
		return;
	}
	const directories = resolveProjectDirectories(options);
	const filesystem = new FileSystem(core.filesystem.rootDir, directories);
	await filesystem.ensureBacklogStructure();
	await filesystem.saveConfig(config);
}

async function runMcpClientCommand(client: McpClientSetupKey): Promise<string> {
	const { label, command, args } = getMcpClientSetupCommand(client, MCP_SERVER_NAME);
	try {
		await runMcpClientSetupCommand(command, args);
		return `Added Backlog MCP server to ${label}`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Unable to configure ${label} automatically (${message}). Run manually: ${formatMcpClientSetupCommand(command, args)}`,
		);
	}
}

export async function initializeProjectRuntime(
	core: Core,
	options: InitializeProjectOptions,
): Promise<Record<string, string> | undefined> {
	const results: Record<string, string> = {};
	const projectRoot = core.filesystem.rootDir;
	if (options.integrationMode === "mcp") await configureMcpClients(results, options.mcpClients ?? [], projectRoot);
	if (options.integrationMode === "cli") await configureCliIntegration(results, options, projectRoot);
	return Object.keys(results).length > 0 ? results : undefined;
}

async function configureMcpClients(
	results: Record<string, string>,
	clients: McpClient[],
	projectRoot: string,
): Promise<void> {
	for (const client of clients) {
		try {
			if (client === "guide") {
				results.guide = `Setup guide: ${MCP_GUIDE_URL}`;
				continue;
			}
			if (!isMcpClientSetupKey(client)) continue;
			results[client] = await runMcpClientCommand(client);
			await ensureMcpGuidelines(projectRoot, getMcpClientInstructionFile(client));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			results[client] = `Failed: ${message}`;
		}
	}
}

async function configureCliIntegration(
	results: Record<string, string>,
	options: InitializeProjectOptions,
	projectRoot: string,
): Promise<void> {
	if (options.agentInstructions?.length) {
		try {
			const writes = await addAgentInstructions(projectRoot, options.agentInstructions);
			results.agentFiles = formatAgentInstructionResults(writes);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			results.agentFiles = `Failed: ${message}`;
		}
	}
}
