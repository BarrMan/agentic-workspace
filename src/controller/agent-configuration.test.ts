import { describe, expect, it } from "bun:test";
import type { AgentConfiguration } from "../model/session/types.ts";
import { getDefaultModeCatalog } from "../storage/config.ts";
import { parseConfig } from "../storage/config-codec.ts";
import {
	type AgentConfigurationController,
	initializeAgentConfiguration,
	resolveAgentConfiguration,
	updateAgentConfiguration,
} from "./agent-configuration.ts";

function fixture(failSave = false) {
	let project: AgentConfiguration = { sessions: { yoloMode: false } };
	let reloads = 0;
	const core: AgentConfigurationController = {
		getStoredConfig: async () => ({ ...parseConfig("", "config.yml"), agentConfiguration: project }),
		loadRootAgentConfiguration: async () => ({ sessions: { yoloMode: true }, selectedPreset: "pi" }),
		updateStoredAgentConfiguration: async (_scope, updater) => {
			const next = updater(structuredClone(project));
			if (failSave) throw new Error("save failed");
			project = structuredClone(next);
			return next;
		},
		reloadConfiguration: async () => {
			reloads++;
		},
		getTask: async () => {
			throw new Error("Unexpected task read");
		},
		withTaskLock: async () => {
			throw new Error("Unexpected task lock");
		},
		withTaskChanges: async () => {
			throw new Error("Unexpected task mutation");
		},
		updateTask: async () => {
			throw new Error("Unexpected task write");
		},
	};
	return { core, project: () => project, reloads: () => reloads };
}

describe("configuration orchestration", () => {
	it("initializes exact project modes without persisting inherited values", async () => {
		const state = fixture();
		await initializeAgentConfiguration(state.core, "project");
		expect(state.project()).toEqual({ sessions: { yoloMode: false }, modes: getDefaultModeCatalog() });
		const resolved = await resolveAgentConfiguration(state.core);
		expect(resolved.config.selectedPreset).toBe("pi");
		expect(resolved.config.sessions.yoloMode).toBe(false);
		expect(resolved.config.modes).toEqual(getDefaultModeCatalog());
		expect(state.reloads()).toBe(1);
	});

	it("does not reload or mutate the snapshot when persistence fails", async () => {
		const state = fixture(true);
		await expect(updateAgentConfiguration(state.core, "project", () => ({ selectedPreset: "pi" }))).rejects.toThrow(
			"save failed",
		);
		expect(state.project()).toEqual({ sessions: { yoloMode: false } });
		expect(state.reloads()).toBe(0);
	});
});
