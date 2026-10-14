import type { Core } from "../../../core/agentic-workspace.ts";
import type { AgenticWorkspaceConfig } from "../../../types/index.ts";
import { type EditorAvailabilityChecker, type PromptRunner, runAdvancedConfigWizard } from "./advanced-wizard.ts";

interface ConfigureAdvancedOptions {
	promptImpl?: PromptRunner;
	isEditorAvailable?: EditorAvailabilityChecker;
	cancelMessage?: string;
}

export async function configureAdvancedSettings(
	core: Core,
	{ promptImpl, isEditorAvailable, cancelMessage = "Aborting configuration." }: ConfigureAdvancedOptions = {},
): Promise<{ mergedConfig: AgenticWorkspaceConfig; installShellCompletions: boolean }> {
	const existingConfig = await core.filesystem.loadConfig();
	if (!existingConfig) {
		throw new Error("No AgenticWorkspace project found. Initialize one first with: agentic-workspace init");
	}

	const wizardResult = await runAdvancedConfigWizard({
		existingConfig,
		cancelMessage,
		promptImpl,
		isEditorAvailable,
	});

	const mergedConfig: AgenticWorkspaceConfig = { ...existingConfig, ...wizardResult.config };
	await core.filesystem.saveConfig(mergedConfig);

	return {
		mergedConfig,
		installShellCompletions: wizardResult.installShellCompletions,
	};
}
