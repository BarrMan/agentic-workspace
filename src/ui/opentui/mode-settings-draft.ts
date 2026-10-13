import { isModeTextColor, type ModeTextColor } from "../../agent-workspace/mode-colors.ts";
import type { AgentConfiguration, ModeCatalog, ModeId, ModeProfile } from "../../agent-workspace/types.ts";

const SAFE_MODE_ID = /^(?!__proto__$|prototype$|constructor$)[a-z][a-z0-9-]*$/;

/** A source mode and its intended replacement. This is only a draft until Save. */
export interface ModeSessionMove {
	readonly fromModeId: ModeId;
	readonly toModeId: ModeId;
}

export interface ModeSettingsDraft {
	readonly baseline: AgentConfiguration;
	configuration: AgentConfiguration;
	moves: ModeSessionMove[];
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

/** Clone the complete source so unrelated settings are retained and edits cannot leak through. */
export function createModeSettingsDraft(configuration: AgentConfiguration): ModeSettingsDraft {
	const baseline = copy(configuration);
	const editable = copy(configuration);
	if (!editable.modes) {
		throw new Error("Initialize the project mode catalog before editing mode settings.");
	}
	return { baseline, configuration: editable, moves: [] };
}

export function discardModeSettingsDraft(draft: ModeSettingsDraft): AgentConfiguration {
	return copy(draft.baseline);
}

function catalogOf(draft: ModeSettingsDraft): ModeCatalog {
	if (!draft.configuration.modes) throw new Error("Mode catalog is unavailable.");
	return draft.configuration.modes;
}

function requireProfile(catalog: ModeCatalog, id: ModeId): ModeProfile {
	const profile = catalog.profiles[id];
	if (!profile) throw new Error(`Unknown mode: ${id}`);
	return profile;
}

export function validateModeSettingsDraft(draft: ModeSettingsDraft): void {
	const catalog = catalogOf(draft);
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
		if (profile.approvalArtifact !== undefined) {
			validateArtifact(profile.approvalArtifact, `Mode ${id} approval indicator`);
		}
	}
	for (const move of draft.moves) {
		if (Object.hasOwn(catalog.profiles, move.fromModeId))
			throw new Error(`Queued source mode ${move.fromModeId} still exists.`);
		if (!Object.hasOwn(catalog.profiles, move.toModeId))
			throw new Error(`Queued destination mode ${move.toModeId} does not exist.`);
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

export function addMode(draft: ModeSettingsDraft, id: ModeId, name = id): void {
	const catalog = catalogOf(draft);
	if (!SAFE_MODE_ID.test(id)) throw new Error(`Invalid mode id: ${id}`);
	if (Object.hasOwn(catalog.profiles, id)) throw new Error(`Mode id already exists: ${id}`);
	catalog.profiles[id] = emptyProfile(name);
	catalog.order.push(id);
}

/** Rename labels without changing stable identity; changing id is intentionally a separate migration. */
export function renameMode(draft: ModeSettingsDraft, id: ModeId, name: string): void {
	if (!name.trim()) throw new Error("Mode name cannot be empty.");
	requireProfile(catalogOf(draft), id).name = name;
}

/** Default is represented by omission, rather than a persisted sentinel color. */
export function setModeTextColor(draft: ModeSettingsDraft, id: ModeId, color: ModeTextColor | undefined): void {
	const profile = requireProfile(catalogOf(draft), id);
	if (color !== undefined && !isModeTextColor(color))
		throw new Error(`Mode ${id} text color must be a supported lowercase named color.`);
	if (color === undefined) delete profile.textColor;
	else profile.textColor = color;
}

export function setModeDefault(draft: ModeSettingsDraft, id: ModeId): void {
	const catalog = catalogOf(draft);
	requireProfile(catalog, id);
	catalog.defaultModeId = id;
}

export function moveMode(draft: ModeSettingsDraft, id: ModeId, index: number): void {
	const order = catalogOf(draft).order;
	const current = order.indexOf(id);
	if (current < 0) throw new Error(`Unknown mode: ${id}`);
	if (!Number.isInteger(index) || index < 0 || index >= order.length) throw new Error("Mode position is out of range.");
	order.splice(current, 1);
	order.splice(index, 0, id);
}

/** Deletion schedules a session migration and does not touch any session storage. */
export function deleteMode(draft: ModeSettingsDraft, id: ModeId, destinationModeId: ModeId): void {
	const catalog = catalogOf(draft);
	requireProfile(catalog, id);
	if (id === destinationModeId) throw new Error("Choose a different destination mode.");
	requireProfile(catalog, destinationModeId);
	if (catalog.order.length <= 1) throw new Error("At least one mode is required.");
	delete catalog.profiles[id];
	catalog.order.splice(catalog.order.indexOf(id), 1);
	if (catalog.defaultModeId === id) catalog.defaultModeId = destinationModeId;
	draft.moves = draft.moves.map((move) => (move.toModeId === id ? { ...move, toModeId: destinationModeId } : move));
	draft.moves.push({ fromModeId: id, toModeId: destinationModeId });
}

/** Revert a deletion and its migration request while preserving other pending edits. */
export function restoreDeletedMode(draft: ModeSettingsDraft, id: ModeId): void {
	const source = draft.baseline.modes;
	if (!source || !source.profiles[id] || Object.hasOwn(catalogOf(draft).profiles, id)) return;
	const catalog = catalogOf(draft);
	catalog.profiles[id] = copy(source.profiles[id]!);
	const baselineIndex = source.order.indexOf(id);
	catalog.order.splice(Math.min(baselineIndex, catalog.order.length), 0, id);
	draft.moves = draft.moves.filter((move) => move.fromModeId !== id);
}

/** Save is the sole side-effect boundary; failures leave the draft available for retry. */
export async function saveModeSettingsDraft(draft: ModeSettingsDraft, save: ModeSettingsSave): Promise<void> {
	validateModeSettingsDraft(draft);
	await save({ configuration: copy(draft.configuration), moves: copy(draft.moves) });
}
