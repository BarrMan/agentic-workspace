import { describe, expect, it } from "bun:test";
import { assertAgentConfiguration } from "./agent-config-schema.ts";
import { applyAgentConfigurationPatch, Config, mergeAgentConfigurations, removeAgentPreset } from "./config.ts";
import type { AgentConfiguration, EffectiveAgentConfiguration } from "./types.ts";

const builtIn: EffectiveAgentConfiguration = {
	selectedPreset: "base",
	presets: { base: { command: ["base"], env: {}, prepare: "", bootstrap: "opencode" } },
	sessions: { worktreePerTask: false, yoloMode: true },
};

describe("agent configuration model", () => {
	it("merges fields without copying unrelated task overrides", () => {
		const task: AgentConfiguration = { sessions: { yoloMode: false } };
		const effective = mergeAgentConfigurations(
			builtIn,
			{ sessions: { worktreePerTask: true } },
			{ presets: { project: { command: ["project"], env: {}, prepare: "", bootstrap: "pi" } } },
			task,
		);

		expect(effective.sessions).toEqual({ worktreePerTask: true, yoloMode: false });
		expect(effective.presets).toHaveProperty("base");
		expect(effective.presets).toHaveProperty("project");
	});

	it("deletes an optional field without discarding concurrent exact-scope fields", () => {
		const updated = applyAgentConfigurationPatch(
			{ ...builtIn, sessions: { ...builtIn.sessions, autoResumeOnRestart: false } },
			{ sessions: { autoResumeOnRestart: null } },
			"card",
		);

		expect(updated.sessions).toEqual({ worktreePerTask: false, yoloMode: true });
	});

	it("uses root false when the project leaves that field unset", async () => {
		const config = await Config.load(
			{
				loadUserAgentConfiguration: async () => ({ sessions: { yoloMode: false } }),
				loadProjectAgentConfiguration: async () => ({ sessions: { worktreePerTask: true } }),
			},
			builtIn,
		);

		expect(config.getConfig().sessions).toEqual({ worktreePerTask: true, yoloMode: false });
	});

	it("uses root false when the project configuration is missing", async () => {
		const config = await Config.load(
			{
				loadUserAgentConfiguration: async () => ({ sessions: { yoloMode: false } }),
				loadProjectAgentConfiguration: async () => null,
			},
			builtIn,
		);

		expect(config.getConfig().sessions?.yoloMode).toBe(false);
	});

	it("keeps a sparse task checkbox patch separate from its presets", () => {
		const current: AgentConfiguration = {
			selectedPreset: "task",
			presets: { task: { command: ["task"], env: {}, prepare: "", bootstrap: "claude" } },
		};
		const updated = applyAgentConfigurationPatch(current, { sessions: { yoloMode: false } }, "card");

		expect(updated.presets).toEqual(current.presets);
		expect(updated.sessions).toEqual({ yoloMode: false });
	});

	it("does not synthesize a catalogue when the project has none", async () => {
		const config = await Config.load(
			{
				loadUserAgentConfiguration: async () => ({}),
				loadProjectAgentConfiguration: async () => null,
			},
			builtIn,
		);

		expect(config.modes).toBeUndefined();
	});

	it("removes only the requested scope's preset and preserves the same-name preset elsewhere", () => {
		const user: AgentConfiguration = {
			presets: { shared: { command: ["user"], env: {}, prepare: "", bootstrap: "opencode" } },
		};
		const project: AgentConfiguration = {
			presets: { shared: { command: ["project"], env: {}, prepare: "", bootstrap: "pi" } },
		};

		const updated = removeAgentPreset(user, "shared", "root");

		expect(updated.presets).toEqual({});
		expect(project.presets?.shared?.command).toEqual(["project"]);
	});

	it("rejects unknown presets without mutating the input", () => {
		const current: AgentConfiguration = {
			presets: { kept: { command: ["kept"], env: {}, prepare: "", bootstrap: "opencode" } },
		};

		expect(() => removeAgentPreset(current, "missing", "root")).toThrow("Agent preset not found: missing");
		expect(current.presets).toHaveProperty("kept");
	});

	it("rejects removing the selected preset", () => {
		const current: AgentConfiguration = {
			selectedPreset: "selected",
			presets: { selected: { command: ["selected"], env: {}, prepare: "", bootstrap: "opencode" } },
		};

		expect(() => removeAgentPreset(current, "selected", "root")).toThrow("Choose another preset");
	});

	it("returns a fresh schema-valid configuration without mutating the input", () => {
		const current: AgentConfiguration = {
			selectedPreset: "kept",
			presets: {
				kept: { command: ["kept"], env: {}, prepare: "", bootstrap: "opencode" },
				removed: { command: ["removed"], env: {}, prepare: "", bootstrap: "pi" },
			},
			sessions: { yoloMode: false },
		};

		const updated = removeAgentPreset(current, "removed", "root");

		expect(updated).not.toBe(current);
		expect(updated.presets).not.toBe(current.presets);
		expect(current.presets).toHaveProperty("removed");
		expect(updated.presets).not.toHaveProperty("removed");
		expect(() => assertAgentConfiguration(updated, "root")).not.toThrow();
	});
});
