import { describe, expect, it } from "bun:test";
import type { AgentConfiguration } from "../model/session/types.ts";
import { parseConfig } from "../storage/config-codec.ts";
import { type AgentConfigurationController, updateAgentConfiguration } from "./agent-configuration.ts";

function fixture(failSave = false) {
	let project: AgentConfiguration = { sessions: { yoloMode: false } };
	let reloads = 0;
	const core: AgentConfigurationController = {
		storage: {
			loadConfig: async () => ({ ...parseConfig("", "config.yml"), agentConfiguration: project }),
			withTaskLock: async () => {
				throw new Error("Unexpected task lock");
			},
		},
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
		tasks: {
			getTask: async () => {
				throw new Error("Unexpected task read");
			},
			edit: async () => {
				throw new Error("Unexpected task write");
			},
		},
	};
	return { core, project: () => project, reloads: () => reloads };
}

describe("configuration orchestration", () => {
	it("does not reload or mutate the snapshot when persistence fails", async () => {
		const state = fixture(true);
		await expect(updateAgentConfiguration(state.core, "project", () => ({ selectedPreset: "pi" }))).rejects.toThrow(
			"save failed",
		);
		expect(state.project()).toEqual({ sessions: { yoloMode: false } });
		expect(state.reloads()).toBe(0);
	});
});
