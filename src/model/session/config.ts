import { assertAgentConfiguration } from "./agent-config-schema.ts";
import {
	type AgentConfigScope,
	type AgentConfiguration,
	type EffectiveAgentConfiguration,
	resolveSessionSettings,
	type SessionSettings,
} from "./types.ts";

/** Mutation input only. `null` explicitly clears a persisted session override to inherit. */
export interface AgentConfigurationPatch extends Omit<AgentConfiguration, "sessions"> {
	sessions?: {
		worktreePerTask?: boolean | null;
		yoloMode?: boolean | null;
		autoResumeOnRestart?: boolean | null;
	};
}

type ConfigurationSource = AgentConfiguration | null | undefined;

function clone<T>(value: T): T {
	return structuredClone(value);
}

function mergeSessions(base: SessionSettings | undefined, override: AgentConfiguration["sessions"]): SessionSettings {
	return { ...base, ...override } as SessionSettings;
}

/** Returns a fresh effective value. Presets replace by name; their command and env fields are atomic. */
export function mergeAgentConfigurations(
	builtIn: EffectiveAgentConfiguration,
	...overrides: ConfigurationSource[]
): EffectiveAgentConfiguration {
	let result = clone(builtIn);
	for (const override of overrides) {
		if (!override) continue;
		result = {
			...result,
			...(override.selectedPreset !== undefined && { selectedPreset: override.selectedPreset }),
			presets: { ...result.presets, ...(override.presets ?? {}) },
			sessions: mergeSessions(result.sessions, override.sessions),
			...(override.modes !== undefined && { modes: clone(override.modes) }),
		};
	}
	return clone(result);
}

/** Applies a sparse exact-scope patch; null clears a persisted session field to inherit. */
export function applyAgentConfigurationPatch(
	current: AgentConfiguration | null,
	patch: AgentConfigurationPatch,
	scope: AgentConfigScope,
): AgentConfiguration {
	const { sessions: sessionPatch, ...configurationPatch } = patch;
	const sessionValues = {
		...(sessionPatch?.worktreePerTask !== null &&
			sessionPatch?.worktreePerTask !== undefined && {
				worktreePerTask: sessionPatch.worktreePerTask,
			}),
		...(sessionPatch?.yoloMode !== null && sessionPatch?.yoloMode !== undefined && { yoloMode: sessionPatch.yoloMode }),
		...(sessionPatch?.autoResumeOnRestart !== null &&
			sessionPatch?.autoResumeOnRestart !== undefined && {
				autoResumeOnRestart: sessionPatch.autoResumeOnRestart,
			}),
	};
	const persistedSessions = sessionPatch && {
		...sessionValues,
	};
	assertAgentConfiguration(
		{ ...configurationPatch, ...(persistedSessions && { sessions: persistedSessions }) },
		scope,
		"Agent configuration patch",
	);
	const next: AgentConfiguration = {
		...(current ? clone(current) : {}),
		...(configurationPatch.selectedPreset !== undefined && { selectedPreset: configurationPatch.selectedPreset }),
		...(configurationPatch.presets !== undefined && {
			presets: { ...(current?.presets ?? {}), ...configurationPatch.presets },
		}),
	};
	if (sessionPatch !== undefined) {
		next.sessions = {
			...current?.sessions,
			...sessionValues,
		};
		if (sessionPatch.worktreePerTask === null) delete next.sessions.worktreePerTask;
		if (sessionPatch.yoloMode === null) delete next.sessions.yoloMode;
		if (sessionPatch.autoResumeOnRestart === null) delete next.sessions.autoResumeOnRestart;
	}
	if (scope === "project" && configurationPatch.modes !== undefined) next.modes = clone(configurationPatch.modes);
	assertAgentConfiguration(next, scope, "Agent configuration patch");
	return clone(next);
}

/** Removes one exact-scope preset without reconstructing inherited configuration. */
export function removeAgentPreset(
	current: AgentConfiguration,
	name: string,
	scope: AgentConfigScope,
): AgentConfiguration {
	if (!current.presets || !Object.hasOwn(current.presets, name)) throw new Error(`Agent preset not found: ${name}`);
	if (current.selectedPreset === name) throw new Error(`Choose another preset before removing ${name}.`);
	const { [name]: _removed, ...presets } = current.presets;
	const next = { ...clone(current), presets };
	assertAgentConfiguration(next, scope, "Agent configuration");
	return clone(next);
}

/** Removes one project-owned mode and selects the first remaining mode when its default was removed. */
export function removeMode(current: AgentConfiguration, modeId: string): AgentConfiguration {
	const catalog = current.modes;
	if (!catalog?.profiles[modeId]) throw new Error(`Unknown mode '${modeId}'.`);
	if (catalog.order.length <= 1) throw new Error("Cannot delete the last configured mode.");
	const order = catalog.order.filter((id) => id !== modeId);
	const { [modeId]: _removed, ...profiles } = catalog.profiles;
	const defaultModeId = catalog.defaultModeId === modeId ? order[0] : catalog.defaultModeId;
	const next = { ...clone(current), modes: { ...catalog, order, profiles, defaultModeId } };
	assertAgentConfiguration(next, "project", "Agent configuration");
	return clone(next);
}

export interface SessionConfigurationReader {
	loadUserAgentConfiguration(): Promise<AgentConfiguration | null>;
	loadProjectAgentConfiguration(): Promise<AgentConfiguration | null>;
}

/** Task-independent snapshot. Task callers pass their sparse override to getConfig. */
export class Config {
	private userConfiguration: AgentConfiguration | null = null;
	private projectConfiguration: AgentConfiguration | null = null;
	private loaded = false;

	constructor(
		private readonly storage: SessionConfigurationReader,
		private readonly builtIn: EffectiveAgentConfiguration,
	) {}

	static async load(storage: SessionConfigurationReader, builtIn: EffectiveAgentConfiguration): Promise<Config> {
		const config = new Config(storage, builtIn);
		await config.reload();
		return config;
	}

	async reload(): Promise<void> {
		const [user, project] = await Promise.all([
			this.storage.loadUserAgentConfiguration(),
			this.storage.loadProjectAgentConfiguration(),
		]);
		assertAgentConfiguration(user ?? {}, "root", "Invalid user agent configuration");
		assertAgentConfiguration(project ?? {}, "project", "Invalid project agent configuration");
		this.userConfiguration = user && clone(user);
		this.projectConfiguration = project && clone(project);
		this.loaded = true;
	}

	getConfig(...overrides: Array<AgentConfiguration | undefined>): EffectiveAgentConfiguration {
		if (!this.loaded) throw new Error("Agent configuration has not been loaded; call reload() first.");
		return {
			...mergeAgentConfigurations(
				this.builtIn,
				this.userConfiguration,
				this.projectConfiguration,
				...overrides.map((override) => (override ? { ...override, modes: undefined } : undefined)),
			),
			modes: this.projectConfiguration?.modes && clone(this.projectConfiguration.modes),
		};
	}

	get sessionSettings(): SessionSettings {
		return resolveSessionSettings(this.getConfig());
	}

	get modes() {
		return this.getConfig().modes;
	}
}
