import type { BacklogConfig } from "../types/index.ts";
import type { Core } from "./backlog.ts";
import {
	type InitializeProjectOptions,
	initializeProjectFiles,
	initializeProjectRuntime,
	resolveInitializationConfig,
} from "./init-helpers.ts";

export type { InitializeProjectOptions, IntegrationMode } from "./init-helpers.ts";

export interface InitializeProjectResult {
	success: boolean;
	projectName: string;
	isReInitialization: boolean;
	config: BacklogConfig;
	mcpResults?: Record<string, string>;
}

/**
 * Core initialization logic shared between CLI and browser.
 * Both CLI and browser validate input before calling this function.
 */
export async function initializeProject(
	core: Core,
	options: InitializeProjectOptions,
): Promise<InitializeProjectResult> {
	const { config, isReInitialization } = resolveInitializationConfig(options);
	await initializeProjectFiles(core, options, config, isReInitialization);
	const mcpResults = await initializeProjectRuntime(core, options);

	return {
		success: true,
		projectName: options.projectName,
		isReInitialization,
		config,
		mcpResults,
	};
}
