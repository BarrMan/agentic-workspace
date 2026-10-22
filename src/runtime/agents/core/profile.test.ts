import { describe, expect, test } from "bun:test";
import type { AgentPreset, ModeProfile } from "../../../model/session/types.ts";
import { discoverModels, profileInstructions, validateExplicitModel, withExplicitModel } from "./profile.ts";

const preset: AgentPreset = {
	bootstrap: "pi",
	command: ["pi", "--model", "old/model", "--model=duplicate"],
	prepare: "",
	env: { PROFILE_TEST: "value" },
};

const profile: ModeProfile = {
	name: "Read-only",
	model: { kind: "default" },
	prompt: "Stay focused.",
	permissions: { repository: "none", task: "read", artifacts: "read", subagents: "disabled" },
	artifacts: [],
};

describe("harness profile helpers", () => {
	test("model discovery distinguishes failed commands from a successful empty catalogue", async () => {
		await expect(discoverModels(["/missing/model-discovery-command"], {}, 1_000, () => [])).rejects.toThrow(
			"Model discovery could not start",
		);
		await expect(discoverModels([process.execPath, "-e", "process.exit(7)"], {}, 1_000, () => [])).rejects.toThrow(
			"exited with code 7",
		);
		await expect(
			discoverModels([process.execPath, "-e", "process.stdout.write('')"], {}, 1_000, () => []),
		).resolves.toEqual([]);
	});

	test("explicit model replaces existing preset model switches exactly once", () => {
		const modeled = withExplicitModel(preset, "provider/new-model");
		expect(modeled.command.filter((arg) => arg === "--model" || arg.startsWith("--model="))).toHaveLength(1);
		expect(modeled.command).toContain("provider/new-model");
		expect(withExplicitModel(preset, "bad; command").command).toContain("bad; command");
	});

	test("compatibility validation reports mismatches without replacing IDs", () => {
		expect(validateExplicitModel("provider/retained", [{ id: "provider/other" }])).toMatchObject({
			compatible: false,
		});
		expect(validateExplicitModel("provider/retained", undefined).compatible).toBeUndefined();
	});

	test("instructions state absolute scope and user-only artifact approval", () => {
		const text = profileInstructions(profile, "/repo", "/repo/tasks/demo");
		expect(text).toContain("Do not inspect repository");
		expect(text).toContain("/repo/tasks/demo");
		expect(text).toContain("approval is user-only");
	});
});
