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
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import {
	AGENTIC_WORKSPACE_CONFIG_SOURCE,
	AGENTIC_WORKSPACE_DIRECTORY_SOURCE,
	normalizeProjectAgenticWorkspaceDirectory,
} from "../utils/agentic-workspace-directory.ts";
import {
	formatMcpClientSetupCommand,
	getMcpClientInstructionFile,
	getMcpClientSetupCommand,
	isMcpClientSetupKey,
	type McpClientSetupKey,
	runMcpClientSetupCommand,
} from "../utils/mcp-client-setup.ts";
import { getTaskPrefixError } from "../utils/prefix-config.ts";
import type { Core } from "./agentic-workspace.ts";

const MCP_SERVER_NAME = "agentic-workspace";
const MCP_GUIDE_URL = "https://github.com/BarrMan/agentic-workspace";

export type IntegrationMode = "mcp" | "cli" | "none";
export type McpClient = "claude" | "codex" | "gemini" | "kiro" | "guide";

export interface InitializeProjectOptions {
	projectName: string;
	agenticWorkspaceDirectory?: string;
	agenticWorkspaceDirectorySource?: "agentic-workspace" | ".agentic-workspace" | "custom";
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
	existingConfig?: AgenticWorkspaceConfig | null;
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

function resolveFreshConfig(projectName: string, taskPrefix?: string): AgenticWorkspaceConfig {
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
	config: AgenticWorkspaceConfig,
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
	config: AgenticWorkspaceConfig;
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
	const config: AgenticWorkspaceConfig = {
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

function inferAgenticWorkspaceDirectorySource(
	agenticWorkspaceDirectory: string | null,
): InitializeProjectOptions["agenticWorkspaceDirectorySource"] | undefined {
	if (!agenticWorkspaceDirectory) return undefined;
	if (agenticWorkspaceDirectory === AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN)
		return AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN;
	if (agenticWorkspaceDirectory === AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT)
		return AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT;
	return AGENTIC_WORKSPACE_DIRECTORY_SOURCE.CUSTOM;
}

function resolveAgenticWorkspaceDirectorySource(
	options: InitializeProjectOptions,
	agenticWorkspaceDirectory: string | null,
): InitializeProjectOptions["agenticWorkspaceDirectorySource"] | undefined {
	const inferredSource = inferAgenticWorkspaceDirectorySource(agenticWorkspaceDirectory);
	if (
		options.agenticWorkspaceDirectorySource &&
		inferredSource &&
		options.agenticWorkspaceDirectorySource !== inferredSource
	) {
		throw new Error("AgenticWorkspace directory source and directory value must agree.");
	}
	const source = options.agenticWorkspaceDirectorySource ?? inferredSource;
	if (source === AGENTIC_WORKSPACE_DIRECTORY_SOURCE.CUSTOM && !agenticWorkspaceDirectory) {
		throw new Error("AgenticWorkspace directory must be a valid project-relative path.");
	}
	return source;
}

function resolveConfigLocation(
	source: InitializeProjectOptions["agenticWorkspaceDirectorySource"] | undefined,
	configLocation: InitializeProjectOptions["configLocation"],
): "folder" | "root" {
	const location =
		configLocation ??
		(source === AGENTIC_WORKSPACE_DIRECTORY_SOURCE.CUSTOM
			? AGENTIC_WORKSPACE_CONFIG_SOURCE.ROOT
			: AGENTIC_WORKSPACE_CONFIG_SOURCE.FOLDER);
	if (source === AGENTIC_WORKSPACE_DIRECTORY_SOURCE.CUSTOM && location !== AGENTIC_WORKSPACE_CONFIG_SOURCE.ROOT) {
		throw new Error("Custom AgenticWorkspace directories require root config discovery.");
	}
	return location;
}

function resolveProjectDirectories(options: InitializeProjectOptions): {
	agenticWorkspaceDirectory: string;
	configLocation: "folder" | "root";
} {
	const agenticWorkspaceDirectory = normalizeProjectAgenticWorkspaceDirectory(options.agenticWorkspaceDirectory);
	const source = resolveAgenticWorkspaceDirectorySource(options, agenticWorkspaceDirectory);
	return {
		agenticWorkspaceDirectory:
			agenticWorkspaceDirectory ??
			(source === AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN
				? AGENTIC_WORKSPACE_DIRECTORY_SOURCE.HIDDEN
				: AGENTIC_WORKSPACE_DIRECTORY_SOURCE.DEFAULT),
		configLocation: resolveConfigLocation(source, options.configLocation),
	};
}

export async function initializeProjectFiles(
	core: Core,
	options: InitializeProjectOptions,
	config: AgenticWorkspaceConfig,
	isReInitialization: boolean,
): Promise<void> {
	if (isReInitialization) {
		await core.filesystem.saveConfig(config);
		return;
	}
	const directories = resolveProjectDirectories(options);
	const filesystem = new FileSystem(core.filesystem.rootDir, directories);
	await filesystem.ensureAgenticWorkspaceStructure();
	await filesystem.saveConfig(config);
}

async function runMcpClientCommand(client: McpClientSetupKey): Promise<string> {
	const { label, command, args } = getMcpClientSetupCommand(client, MCP_SERVER_NAME);
	try {
		await runMcpClientSetupCommand(command, args);
		return `Added AgenticWorkspace MCP server to ${label}`;
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
