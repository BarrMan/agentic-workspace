import type { AgenticWorkspaceConfig } from "../model/types.ts";
import type { Core } from "./agentic-workspace.ts";
import { type InitializeProjectOptions, initializeProjectFiles, resolveInitializationConfig } from "./init-helpers.ts";

export type { InitializeProjectOptions } from "./init-helpers.ts";

export interface InitializeProjectResult {
	success: boolean;
	projectName: string;
	isReInitialization: boolean;
	config: AgenticWorkspaceConfig;
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

	return {
		success: true,
		projectName: options.projectName,
		isReInitialization,
		config,
	};
}
