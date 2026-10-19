import { isModeTextColor, type ModeTextColor } from "../../model/session/mode-colors.ts";
import type { AgentConfiguration, ModeCatalog, ModeId, ModeProfile } from "../../model/session/types.ts";

const SAFE_MODE_ID = /^(?!__proto__$|prototype$|constructor$)[a-z][a-z0-9-]*$/;

/** A source mode and its intended replacement. This is only a draft until Save. */
export interface ModeSessionMove {
	readonly fromModeId: ModeId;
	readonly toModeId: ModeId;
}

export interface ModeSettingsSavePlan {
	readonly configuration: AgentConfiguration;
	readonly moves: readonly ModeSessionMove[];
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
	moves: ModeSessionMove[] = [];

	/** Clone the complete source so unrelated settings are retained and edits cannot leak through. */
	constructor(configuration: AgentConfiguration) {
		this.baseline = copy(configuration);
		this.configuration = copy(configuration);
		if (!this.configuration.modes) throw new Error("Initialize the project mode catalog before editing mode settings.");
	}

	discard(): AgentConfiguration {
		return copy(this.baseline);
	}

	validate(): void {
		const catalog = this.catalog();
		const ids = Object.keys(catalog.profiles);
		if (ids.length < 1) throw new Error("At least one mode is required.");
		if (
			catalog.order.length !== ids.length ||
			new Set(catalog.order).size !== ids.length ||
			ids.some((id) => !catalog.order.includes(id))
		) {
			throw new Error("Mode order must contain every mode exactly once.");
		}
		if (!Object.hasOwn(catalog.profiles, catalog.defaultModeId)) throw new Error("Choose an existing default mode.");
		for (const [id, profile] of Object.entries(catalog.profiles)) {
			if (!SAFE_MODE_ID.test(id)) throw new Error(`Invalid mode id: ${id}`);
			if (!profile.name.trim()) throw new Error(`Mode ${id} needs a name.`);
			if (profile.textColor !== undefined && !isModeTextColor(profile.textColor))
				throw new Error(`Mode ${id} text color must be a supported lowercase named color.`);
			if (profile.model.kind === "explicit" && (!profile.model.id.trim() || /[\0\r\n]/.test(profile.model.id))) {
				throw new Error(`Mode ${id} has an invalid model id.`);
			}
			if (profile.model.kind !== "default" && profile.model.kind !== "explicit")
				throw new Error(`Mode ${id} has an invalid model selection.`);
			if (typeof profile.prompt !== "string") throw new Error(`Mode ${id} prompt must be text.`);
			const paths = new Set<string>();
			for (const artifact of profile.artifacts) {
				validateArtifact(artifact.path, `Mode ${id}`);
				if (paths.has(artifact.path)) throw new Error(`Mode ${id} declares artifact ${artifact.path} more than once.`);
				paths.add(artifact.path);
				if (typeof artifact.purpose !== "string" || !artifact.purpose.trim())
					throw new Error(`Artifact ${artifact.path} needs a purpose.`);
			}
			if (profile.approvalArtifact !== undefined)
				validateArtifact(profile.approvalArtifact, `Mode ${id} approval indicator`);
		}
		for (const move of this.moves) {
			if (Object.hasOwn(catalog.profiles, move.fromModeId))
				throw new Error(`Queued source mode ${move.fromModeId} still exists.`);
			if (!Object.hasOwn(catalog.profiles, move.toModeId))
				throw new Error(`Queued destination mode ${move.toModeId} does not exist.`);
		}
	}

	addMode(id: ModeId, name = id): void {
		const catalog = this.catalog();
		if (!SAFE_MODE_ID.test(id)) throw new Error(`Invalid mode id: ${id}`);
		if (Object.hasOwn(catalog.profiles, id)) throw new Error(`Mode id already exists: ${id}`);
		catalog.profiles[id] = emptyProfile(name);
		catalog.order.push(id);
	}

	/** Rename labels without changing stable identity; changing id is intentionally a separate migration. */
	renameMode(id: ModeId, name: string): void {
		if (!name.trim()) throw new Error("Mode name cannot be empty.");
		requireProfile(this.catalog(), id).name = name;
	}

	/** Default is represented by omission, rather than a persisted sentinel color. */
	setModeTextColor(id: ModeId, color: ModeTextColor | undefined): void {
		const profile = requireProfile(this.catalog(), id);
		if (color !== undefined && !isModeTextColor(color))
			throw new Error(`Mode ${id} text color must be a supported lowercase named color.`);
		if (color === undefined) delete profile.textColor;
		else profile.textColor = color;
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

	/** Deletion schedules a session migration and does not touch any session storage. */
	deleteMode(id: ModeId, destinationModeId: ModeId): void {
		const catalog = this.catalog();
		requireProfile(catalog, id);
		if (id === destinationModeId) throw new Error("Choose a different destination mode.");
		requireProfile(catalog, destinationModeId);
		if (catalog.order.length <= 1) throw new Error("At least one mode is required.");
		delete catalog.profiles[id];
		catalog.order.splice(catalog.order.indexOf(id), 1);
		if (catalog.defaultModeId === id) catalog.defaultModeId = destinationModeId;
		this.moves = this.moves.map((move) => (move.toModeId === id ? { ...move, toModeId: destinationModeId } : move));
		this.moves.push({ fromModeId: id, toModeId: destinationModeId });
	}

	/** Revert a deletion and its migration request while preserving other pending edits. */
	restoreDeletedMode(id: ModeId): void {
		const source = this.baseline.modes;
		if (!source || !source.profiles[id] || Object.hasOwn(this.catalog().profiles, id)) return;
		const catalog = this.catalog();
		catalog.profiles[id] = copy(source.profiles[id]!);
		const baselineIndex = source.order.indexOf(id);
		catalog.order.splice(Math.min(baselineIndex, catalog.order.length), 0, id);
		this.moves = this.moves.filter((move) => move.fromModeId !== id);
	}

	/** Save is the sole side-effect boundary; failures leave the draft available for retry. */
	async save(save: ModeSettingsSave): Promise<void> {
		this.validate();
		await save({ configuration: copy(this.configuration), moves: copy(this.moves) });
	}

	private catalog(): ModeCatalog {
		if (!this.configuration.modes) throw new Error("Mode catalog is unavailable.");
		return this.configuration.modes;
	}
}

function validateArtifact(path: string, label: string): void {
	if (
		!path ||
		path.includes("\0") ||
		path.includes("\\") ||
		path.startsWith("/") ||
		/^[A-Za-z]:/.test(path) ||
		path.split("/").some((part) => !part || part === "." || part === "..") ||
		path === "task.md" ||
		path === ".artifacts.json"
	)
		throw new Error(`${label} has an invalid task artifact path: ${path}`);
}
