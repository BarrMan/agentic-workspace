import type { Core } from "../core/agentic-workspace.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";

export async function loadInitializedProject(
	createCore: () => Promise<Core>,
): Promise<{ core: Core; config: AgenticWorkspaceConfig } | null> {
	const core = await createCore();
	const config = await core.filesystem.loadConfig();
	if (config) return { core, config };
	console.error("No AgenticWorkspace project found. Initialize one first with: agentic-workspace init");
	process.exitCode = 1;
	return null;
}
