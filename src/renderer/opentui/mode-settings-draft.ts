import { assertAgentConfiguration } from "../../model/session/agent-config-schema.ts";
import { isModeTextColor, type ModeTextColor } from "../../model/session/mode-colors.ts";
import type { AgentConfiguration, ModeCatalog, ModeId, ModeProfile } from "../../model/session/types.ts";

export interface ModeSettingsSavePlan {
	readonly configuration: AgentConfiguration;
	readonly deletedModeIds: readonly ModeId[];
}

export type ModeSettingsSave = (plan: ModeSettingsSavePlan) => Promise<void>;

function copy<T>(value: T): T {
	return structuredClone(value);
}

function emptyProfile(name: string): ModeProfile {
	return {
		name,
		model: { kind: "default" },
		prompt: "",
		permissions: { repository: "read", task: "read-write", artifacts: "read-write", subagents: "allowed" },
		artifacts: [],
	};
}

function requireProfile(catalog: ModeCatalog, id: ModeId): ModeProfile {
	const profile = catalog.profiles[id];
	if (!profile) throw new Error(`Unknown mode: ${id}`);
	return profile;
}

/** Editable mode settings. This is only a draft until Save. */
export class ModeSettingsDraft {
	readonly baseline: AgentConfiguration;
	configuration: AgentConfiguration;
	deletedModeIds: ModeId[] = [];

	/** Clone the source so unrelated settings are retained and edits cannot leak through. */
	constructor(configuration: AgentConfiguration) {
		this.baseline = copy(configuration);
		this.configuration = copy(configuration);
		if (!this.configuration.modes) throw new Error("Initialize the project mode catalog before editing mode settings.");
	}

	discard(): AgentConfiguration {
		return copy(this.baseline);
	}

	validate(): void {
		assertAgentConfiguration(this.configuration, "project", "Invalid mode settings");
	}

	addMode(id: ModeId, name = id): void {
		const catalog = this.catalog();
		if (!/^(?!__proto__$|prototype$|constructor$)[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Invalid mode id: ${id}`);
		if (Object.hasOwn(catalog.profiles, id)) throw new Error(`Mode id already exists: ${id}`);
		catalog.profiles[id] = emptyProfile(name);
		catalog.order.push(id);
	}

	/** Rename labels without changing stable identity; changing id is intentionally a separate migration. */
	renameMode(id: ModeId, name: string): void {
		requireProfile(this.catalog(), id).name = name;
	}

	/** Default is represented by omission, rather than a persisted sentinel color. */
	setModeTextColor(id: ModeId, color: ModeTextColor | undefined): void {
		const profile = requireProfile(this.catalog(), id);
		if (color === undefined) delete profile.textColor;
		else {
			if (!isModeTextColor(color)) throw new Error(`Unsupported mode text color: ${color}`);
			profile.textColor = color;
		}
	}

	setModeDefault(id: ModeId): void {
		const catalog = this.catalog();
		requireProfile(catalog, id);
		catalog.defaultModeId = id;
	}

	moveMode(id: ModeId, index: number): void {
		const order = this.catalog().order;
		const current = order.indexOf(id);
		if (current < 0) throw new Error(`Unknown mode: ${id}`);
		if (!Number.isInteger(index) || index < 0 || index >= order.length)
			throw new Error("Mode position is out of range.");
		order.splice(current, 1);
		order.splice(index, 0, id);
	}

	/** Deletion intent is source-only; Controller owns session cleanup and catalogue mutation. */
	deleteMode(id: ModeId): void {
		if (!this.baseline.modes?.profiles[id]) throw new Error(`Unknown mode: ${id}`);
		if (!this.deletedModeIds.includes(id)) this.deletedModeIds.push(id);
	}

	/** Revert a staged source deletion while preserving other pending edits. */
	restoreDeletedMode(id: ModeId): void {
		this.deletedModeIds = this.deletedModeIds.filter((deletedModeId) => deletedModeId !== id);
	}

	/** Save is the sole side-effect boundary; failures leave the draft available for retry. */
	async save(save: ModeSettingsSave): Promise<void> {
		this.validate();
		await save({ configuration: copy(this.configuration), deletedModeIds: copy(this.deletedModeIds) });
	}

	private catalog(): ModeCatalog {
		if (!this.configuration.modes) throw new Error("Mode catalog is unavailable.");
		return this.configuration.modes;
	}
}
