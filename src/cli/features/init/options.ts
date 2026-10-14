import { DEFAULT_INIT_CONFIG } from "../../../constants/index.ts";
import type { IntegrationMode } from "../../../core/init.ts";
import type { AgenticWorkspaceConfig } from "../../../types/index.ts";

export interface InitCommandOptions {
	agentInstructions?: string;
	checkBranches?: string;
	includeRemote?: string;
	branchDays?: string;
	bypassGitHooks?: string;
	zeroPaddedIds?: string;
	defaultEditor?: string;
	webPort?: string;
	autoOpenBrowser?: string;
	integrationMode?: string;
	agenticWorkspaceDir?: string;
	configLocation?: string;
	taskPrefix?: string;
	git?: boolean;
	defaults?: boolean;
}

export function normalizeInitIntegrationOption(value: string): IntegrationMode | null {
	const normalized = value.trim().toLowerCase();
	if (["mcp", "connector", "model-context-protocol", "model_context_protocol"].includes(normalized)) return "mcp";
	if (["cli", "legacy", "commands", "command", "instructions", "instruction", "agent", "agents"].includes(normalized))
		return "cli";
	if (["none", "skip", "manual", "later", "no", "off"].includes(normalized)) return "none";
	return null;
}

export function isNonInteractiveInit(options: InitCommandOptions): boolean {
	return Boolean(
		options.agentInstructions ||
			options.defaults ||
			options.checkBranches ||
			options.includeRemote ||
			options.branchDays ||
			options.bypassGitHooks ||
			options.zeroPaddedIds ||
			options.defaultEditor !== undefined ||
			options.webPort ||
			options.autoOpenBrowser ||
			options.integrationMode ||
			options.agenticWorkspaceDir ||
			options.configLocation ||
			options.taskPrefix ||
			options.git === false,
	);
}

export function getInitAdvancedConfigDefaults(
	existingConfig?: AgenticWorkspaceConfig | null,
): Partial<AgenticWorkspaceConfig> {
	return {
		checkActiveBranches: existingConfig?.checkActiveBranches ?? DEFAULT_INIT_CONFIG.checkActiveBranches,
		remoteOperations: existingConfig?.remoteOperations ?? DEFAULT_INIT_CONFIG.remoteOperations,
		activeBranchDays: existingConfig?.activeBranchDays ?? DEFAULT_INIT_CONFIG.activeBranchDays,
		bypassGitHooks: existingConfig?.bypassGitHooks ?? DEFAULT_INIT_CONFIG.bypassGitHooks,
		zeroPaddedIds: existingConfig?.zeroPaddedIds,
		defaultEditor: existingConfig?.defaultEditor,
		defaultPort: existingConfig?.defaultPort ?? DEFAULT_INIT_CONFIG.defaultPort,
		autoOpenBrowser: existingConfig?.autoOpenBrowser ?? DEFAULT_INIT_CONFIG.autoOpenBrowser,
	};
}

export function applyInitAdvancedOptionOverrides(
	options: InitCommandOptions,
	defaults: Partial<AgenticWorkspaceConfig>,
	defaultEditor: string | undefined,
): Partial<AgenticWorkspaceConfig> {
	const config = { ...defaults };
	config.checkActiveBranches = parseBoolean(
		options.checkBranches,
		config.checkActiveBranches ?? DEFAULT_INIT_CONFIG.checkActiveBranches,
	);
	config.remoteOperations = config.checkActiveBranches
		? parseBoolean(options.includeRemote, config.remoteOperations ?? DEFAULT_INIT_CONFIG.remoteOperations)
		: false;
	config.activeBranchDays = parseNumber(
		options.branchDays,
		config.activeBranchDays ?? DEFAULT_INIT_CONFIG.activeBranchDays,
	);
	config.bypassGitHooks = parseBoolean(
		options.bypassGitHooks,
		config.bypassGitHooks ?? DEFAULT_INIT_CONFIG.bypassGitHooks,
	);
	const padding = parseNumber(options.zeroPaddedIds, config.zeroPaddedIds ?? 0);
	config.zeroPaddedIds = padding > 0 ? padding : undefined;
	config.defaultEditor = options.defaultEditor ?? defaultEditor;
	config.defaultPort = parseNumber(options.webPort, config.defaultPort ?? DEFAULT_INIT_CONFIG.defaultPort);
	config.autoOpenBrowser = parseBoolean(
		options.autoOpenBrowser,
		config.autoOpenBrowser ?? DEFAULT_INIT_CONFIG.autoOpenBrowser,
	);
	return config;
}

export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
	return value === undefined ? defaultValue : value.toLowerCase() === "true" || value === "1";
}

function parseNumber(value: string | undefined, defaultValue: number): number {
	if (value === undefined) return defaultValue;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? defaultValue : parsed;
}
