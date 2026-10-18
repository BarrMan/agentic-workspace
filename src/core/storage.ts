import { readRootConfiguration, rootConfigFilePath } from "../agent-workspace/config.ts";
import type { AgentConfiguration } from "../agent-workspace/types.ts";
import type { FileSystem } from "../file-system/operations.ts";
import type { Milestone, Task } from "../types/index.ts";

export class Storage {
	constructor(private readonly filesystem: FileSystem) {}

	async loadMilestones(): Promise<Milestone[]> {
		return await this.filesystem.listMilestones();
	}

	async loadArchivedMilestones(): Promise<Milestone[]> {
		return await this.filesystem.listArchivedMilestones();
	}

	async loadTasks(): Promise<Task[]> {
		return await this.filesystem.listTasks();
	}

	async loadUserAgentConfiguration(): Promise<AgentConfiguration | null> {
		return await readRootConfiguration(rootConfigFilePath());
	}

	async loadProjectAgentConfiguration(): Promise<AgentConfiguration | null> {
		const config = await this.filesystem.loadConfig();
		return config?.agentConfiguration ?? null;
	}
}
