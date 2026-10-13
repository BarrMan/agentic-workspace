import type { Core } from "../core/backlog.ts";
import type { BacklogConfig } from "../types/index.ts";

export async function loadInitializedProject(
	createCore: () => Promise<Core>,
): Promise<{ core: Core; config: BacklogConfig } | null> {
	const core = await createCore();
	const config = await core.filesystem.loadConfig();
	if (config) return { core, config };
	console.error("No AgenticWorkspace project found. Initialize one first with: agenticworkspace init");
	process.exitCode = 1;
	return null;
}
