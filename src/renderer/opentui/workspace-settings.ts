import { getEditableAgentConfiguration } from "../../controller/agent-configuration.ts";
import type { Core } from "../../controller/agentic-workspace.ts";
import { removeMode } from "../../model/session/config.ts";
import { profilePermissionSupport } from "../../runtime/agents/core/profile.ts";
import { resolveLaunchPreset } from "../../runtime/agents/opencode/opencode-resolution.ts";
import { harnessRegistry } from "../../runtime/agents/startup.ts";
import { mountOpenTuiAgentSettings } from "./agent-settings.ts";
import type { OpenTuiHost } from "./host.ts";
import { deleteModeFromChoice, type ModeDeletionPickerMount, mountModeDeletionPicker } from "./mode-deletion-picker.ts";

export function modeDeletionDestinations(
	persistedOrder: readonly string[],
	desiredOrder: readonly string[],
	deletedModeIds: readonly string[],
): string[] {
	const existing = new Set(persistedOrder.filter((id) => !deletedModeIds.includes(id)));
	return desiredOrder.filter((id) => existing.has(id));
}

/** Owns project settings, including the complete confirmed mode-deletion workflow. */
export class WorkspaceSettings {
	#closed = false;
	#loading = false;
	#settings: { dispose(): void } | undefined;
	#destination: ModeDeletionPickerMount | undefined;

	constructor(
		private readonly core: Core,
		private readonly host: OpenTuiHost,
		private readonly operations: {
			blocked(): boolean;
			refresh(): Promise<void>;
			notice(message: string): void;
			confirm(title: string, message: string): Promise<boolean>;
		},
	) {}

	get visible(): boolean {
		return this.#settings !== undefined;
	}

	busy(exceptSettings = false): boolean {
		return this.#loading || !!this.#destination || (!exceptSettings && !!this.#settings);
	}

	async open(): Promise<void> {
		if (this.#closed || this.operations.blocked()) return;
		this.#loading = true;
		try {
			const configuration = await getEditableAgentConfiguration(this.core, "project");
			if (this.#closed) return;
			const availablePresets = { ...configuration.presets };
			const saveConfiguration = async (next: typeof configuration): Promise<void> => {
				await this.core.patchAgentConfiguration("project", next);
				this.operations.notice("Saved project agent settings");
			};
			const settings = mountOpenTuiAgentSettings(this.host.renderer, this.host.root, {
				configuration: { ...configuration, presets: availablePresets },
				profilePermissionSupport: (profile) => {
					const selectedPreset = configuration.selectedPreset
						? availablePresets[configuration.selectedPreset]
						: undefined;
					return selectedPreset
						? profilePermissionSupport(selectedPreset.bootstrap, profile)
						: { native: [], instructionBased: ["repository/task/artifact path scope", "subagent policy"] };
				},
				onSave: saveConfiguration,
				discoverModeModels: async ({ preset: presetName }) => {
					const preset = availablePresets[presetName];
					if (!preset) throw new Error(`Unknown project preset: ${presetName}`);
					const effectiveEnv: Record<string, string> = {};
					for (const [name, value] of Object.entries(process.env)) {
						if (value !== undefined) effectiveEnv[name] = value;
					}
					Object.assign(effectiveEnv, preset.env);
					const discoveryPreset = await resolveLaunchPreset(preset, { cwd: this.core.projectRoot, env: effectiveEnv });
					const adapter = harnessRegistry.forPreset(discoveryPreset.bootstrap);
					if (!adapter.discoverModels) return [];
					const found = await adapter.discoverModels({
						command: discoveryPreset.command,
						env: { ...effectiveEnv, ...discoveryPreset.env },
						timeoutMs: 5_000,
					});
					return found.map((model) => ({ id: model.id, label: model.name }));
				},
				onSaveModeSettings: async ({ configuration: next, deletedModeIds }) => {
					const confirmedDeletions: string[] = [];
					for (const modeId of deletedModeIds) {
						const confirmed = await this.operations.confirm(
							"Delete mode",
							`Delete ${modeId}? Discarding stops agents and removes their session history. Moving keeps sessions and execution alive in the chosen mode.`,
						);
						if (!confirmed) throw new Error("Mode deletion cancelled.");
						confirmedDeletions.push(modeId);
					}
					if (confirmedDeletions.length === 0) return await saveConfiguration(next);
					let editedConfiguration = next;
					for (const modeId of confirmedDeletions) editedConfiguration = removeMode(editedConfiguration, modeId);
					const desiredOrder = editedConfiguration.modes?.order;
					if (!desiredOrder) throw new Error("Mode catalog is unavailable.");
					const completedDeletions: string[] = [];
					try {
						for (const modeId of confirmedDeletions) {
							const persistedCatalog = await this.core.getProjectModeCatalog();
							const destinations = modeDeletionDestinations(persistedCatalog.order, desiredOrder, confirmedDeletions);
							const deletedMode = await deleteModeFromChoice(
								modeId,
								() => this.#chooseDestination(modeId, destinations),
								(id, options) => this.core.deleteMode(id, options),
							);
							if (!deletedMode) throw new Error("Mode deletion cancelled.");
							completedDeletions.push(modeId);
						}
					} catch (cause) {
						if (completedDeletions.length === 0) throw cause;
						throw new AggregateError(
							[cause],
							`Mode settings save failed after deleting modes: ${completedDeletions.join(", ")}.`,
							{ cause },
						);
					}
					try {
						await saveConfiguration(editedConfiguration);
					} catch (cause) {
						throw new AggregateError(
							[cause],
							`Mode settings save failed after deleting modes: ${completedDeletions.join(", ")}.`,
							{ cause },
						);
					}
				},
				modeSessionCounts: {},
				onClose: () => {
					if (this.#settings === settings) this.#settings = undefined;
					if (!this.#closed) void this.operations.refresh();
				},
			});
			this.#settings = settings;
		} catch (error) {
			this.operations.notice(`Could not open settings: ${String(error)}`);
		} finally {
			this.#loading = false;
			if (!this.#closed && !this.#settings) void this.operations.refresh();
		}
	}

	async #chooseDestination(modeId: string, remainingModeIds: readonly string[]): Promise<string | null> {
		if (this.#closed || !this.#settings) return null;
		const picker = mountModeDeletionPicker(this.host.renderer, this.host.root, { modeId, remainingModeIds });
		this.#destination = picker;
		try {
			return await picker.result;
		} finally {
			if (this.#destination === picker) this.#destination = undefined;
		}
	}

	dispose(): void {
		this.#closed = true;
		this.#destination?.dispose();
		this.#destination = undefined;
		this.#settings?.dispose();
		this.#settings = undefined;
	}
}
