import { describe, expect, it } from "bun:test";
import { AGENT_BOOTSTRAP_TYPES } from "../../model/session/types.ts";
import { getBuiltInAgentConfiguration } from "../../storage/config.ts";

describe("versioned OpenCode presets", () => {
	it("exposes one OpenCode preset while keeping versioned adapters internal", () => {
		const configuration = getBuiltInAgentConfiguration();
		expect(configuration.selectedPreset).toBe("opencode");
		expect(configuration.presets.opencode?.bootstrap).toBe("opencode");
		expect(configuration.presets["opencode-v1"]).toBeUndefined();
		expect(configuration.presets["opencode-v2"]).toBeUndefined();
		expect(AGENT_BOOTSTRAP_TYPES).toContain("opencode");
		expect(AGENT_BOOTSTRAP_TYPES).not.toContain("opencode-v1");
		expect(AGENT_BOOTSTRAP_TYPES).not.toContain("opencode-v2");
	});
});
