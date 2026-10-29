import { assertAgentConfiguration } from "../model/session/agent-config-schema.ts";
import {
	type AgentConfigurationPatch,
	applyAgentConfigurationPatch,
	mergeAgentConfigurations,
} from "../model/session/config.ts";
import type {
	AgentConfigScope,
	AgentConfiguration,
	AgentPreset,
	ModeCatalog,
	ResolvedAgentConfiguration,
} from "../model/session/types.ts";
import { getBuiltInAgentConfiguration, requireProjectModeCatalog } from "../storage/config.ts";
import type { Core } from "./agentic-workspace.ts";

export type AgentConfigurationController = Pick<Core, "reloadConfiguration"> & {
	storage: Pick<Core["storage"], "loadConfig" | "withTaskLock">;
	tasks: Pick<Core["tasks"], "getTask" | "edit">;
	updateStoredAgentConfiguration(
		scope: "root" | "project",
		updater: (configuration: AgentConfiguration | null) => AgentConfiguration,
	): Promise<AgentConfiguration>;
	loadRootAgentConfiguration(): Promise<AgentConfiguration | null>;
};

function requireTaskId(scope: AgentConfigScope, taskId: string | undefined): string {
	if (scope === "card" && !taskId) throw new Error("A task ID is required for card agent configuration.");
	return taskId ?? "";
}

async function projectOrParent(core: AgentConfigurationController): Promise<ResolvedAgentConfiguration> {
	const [root, project] = await Promise.all([
		loadAgentConfiguration(core, "root"),
		loadAgentConfiguration(core, "project"),
	]);
	return {
		scope: project ? "project" : "root",
		config: {
			...mergeAgentConfigurations(getBuiltInAgentConfiguration(), root, project),
			// Catalogues are a project startup requirement, never inherited from root.
			modes: project?.modes,
		},
	};
}

export async function loadAgentConfiguration(
	core: AgentConfigurationController,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration | null> {
	if (scope === "root") return await core.loadRootAgentConfiguration();
	if (scope === "project") {
		const configuration = await core.storage.loadConfig();
		if (!configuration?.agentConfiguration) return null;
		return structuredClone(configuration.agentConfiguration);
	}

	const task = await core.tasks.getTask(requireTaskId(scope, taskId));
	if (!task) throw new Error(`Task not found: ${taskId}`);
	if (task.agentConfiguration === undefined) return null;
	return structuredClone(task.agentConfiguration);
}

/** Read only the exact project scope; root/card configuration cannot supply workspace modes. */
export async function loadProjectModeCatalog(core: AgentConfigurationController): Promise<ModeCatalog> {
	return requireProjectModeCatalog(await loadAgentConfiguration(core, "project"));
}

export async function resolveAgentConfiguration(
	core: AgentConfigurationController,
	taskId?: string,
): Promise<ResolvedAgentConfiguration> {
	const parent = await projectOrParent(core);
	if (!taskId) return parent;
	const card = await loadAgentConfiguration(core, "card", taskId);
	if (!card) return parent;
	return {
		scope: "card",
		config: {
			...mergeAgentConfigurations(parent.config, card),
			// Modes are project-owned; task/root configuration cannot replace the catalogue.
			modes: parent.config.modes,
		},
	};
}

/** Resolve a saved preset name using current task, project, then user configuration. */
export async function resolveSessionPreset(
	core: AgentConfigurationController,
	session: { taskId: string; preset: string },
): Promise<AgentPreset> {
	const resolved = await resolveAgentConfiguration(core, session.taskId);
	const preset = resolved.config.presets[session.preset];
	if (!preset) throw new Error(`Agent preset not found for existing session: ${session.preset}`);
	return preset;
}

/** Returns the exact scoped configuration without persisting inherited values. */
export async function getEditableAgentConfiguration(
	core: AgentConfigurationController,
	scope: AgentConfigScope,
	taskId?: string,
): Promise<AgentConfiguration> {
	const existing = await loadAgentConfiguration(core, scope, taskId);
	if (existing) return existing;
	return {};
}

export async function updateAgentConfiguration(
	core: AgentConfigurationController,
	scope: AgentConfigScope,
	updater: (config: AgentConfiguration) => AgentConfiguration,
	taskId?: string,
): Promise<AgentConfiguration> {
	if (scope !== "card") {
		const next = await core.updateStoredAgentConfiguration(scope, (existing) => updater(existing ?? {}));
		await core.reloadConfiguration();
		return next;
	}

	const id = requireTaskId(scope, taskId);
	return await core.storage.withTaskLock(id, async (current) => {
		const stored = current.agentConfiguration;
		const existing = stored === undefined ? undefined : structuredClone(stored);
		const base = existing ?? {};
		const next = structuredClone(updater(structuredClone(base)));
		current.agentConfiguration = next;
		await core.tasks.edit(current);
		return next;
	});
}

export async function upsertAgentConfiguration(
	core: AgentConfigurationController,
	scope: AgentConfigScope,
	config: AgentConfiguration,
	taskId?: string,
): Promise<void> {
	assertAgentConfiguration(config, scope);
	const parent =
		scope === "root"
			? getBuiltInAgentConfiguration()
			: scope === "project"
				? mergeAgentConfigurations(getBuiltInAgentConfiguration(), await loadAgentConfiguration(core, "root"))
				: (await projectOrParent(core)).config;
	const effective = mergeAgentConfigurations(parent, config);
	if (!Object.hasOwn(effective.presets, effective.selectedPreset))
		throw new Error("selectedPreset must name a configured preset");
	await updateAgentConfiguration(core, scope, () => structuredClone(config), taskId);
}

/** Applies a typed sparse patch to the exact persisted scope while holding its existing lock. */
export async function patchAgentConfiguration(
	core: AgentConfigurationController,
	scope: AgentConfigScope,
	patch: AgentConfigurationPatch,
	taskId?: string,
): Promise<AgentConfigurationPatch> {
	return await updateAgentConfiguration(
		core,
		scope,
		(current) => applyAgentConfigurationPatch(current, patch, scope),
		taskId,
	);
}
