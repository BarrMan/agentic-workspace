import {
	AGENTIC_WORKSPACE_CONFIG_SOURCE,
	AGENTIC_WORKSPACE_DIRECTORY_SOURCE,
	normalizeProjectAgenticWorkspaceDirectory,
} from "../filesystem/paths/agentic-workspace-directory.ts";
import {
	DEFAULT_FRESH_INIT_POLICY,
	DEFAULT_INIT_CONFIG,
	DEFAULT_STATUSES,
	FALLBACK_STATUS,
} from "../model/constants.ts";
import { getTaskPrefixError } from "../model/task/prefix-config.ts";
import type { AgenticWorkspaceConfig } from "../model/types.ts";
import type { Core } from "./agentic-workspace.ts";

export interface InitializeProjectOptions {
	projectName: string;
	agenticWorkspaceDirectory?: string;
	agenticWorkspaceDirectorySource?: "agentic-workspace" | ".agentic-workspace" | "custom";
	configLocation?: "folder" | "root";
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
		await core.saveWorkspaceConfig(config);
		return;
	}
	const directories = resolveProjectDirectories(options);
	await core.initializeWorkspaceFiles(config, directories);
}
