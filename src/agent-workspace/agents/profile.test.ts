import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentPreset, ModeProfile } from "../types.ts";
import {
	commandArguments,
	discoverModels,
	profileInstructions,
	validateExplicitModel,
	withExplicitModel,
} from "./profile.ts";

const preset: AgentPreset = {
	bootstrap: "pi",
	command: `pi --model 'old/model' --model=duplicate`,
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
	test("parses quoted command data and rejects shell composition", () => {
		expect(commandArguments(`pi --name 'two words'`)).toEqual(["pi", "--name", "two words"]);
		expect(() => commandArguments("pi; rm -rf /")).toThrow(/shell syntax/);
	});

	test("explicit model replaces existing preset model switches exactly once", () => {
		const modeled = withExplicitModel(preset, "provider/new-model");
		expect(modeled.command.match(/--model/g)).toHaveLength(1);
		expect(modeled.command).toContain("provider/new-model");
		expect(() => withExplicitModel(preset, "bad; command")).toThrow(/unsupported/);
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

	test("Pi discovery runs selected executable with preset environment and caches canonical IDs", async () => {
		const directory = await mkdtemp(join(tmpdir(), "backlog-profile-test-"));
		try {
			const executable = join(directory, "pi-fixture");
			await writeFile(executable, "#!/bin/sh\nprintf 'provider model context\\nexample model-one 128K\\n'\n", {
				mode: 0o700,
			});
			const first = await discoverModels("pi", executable, { PROFILE_TEST: "isolated" }, 1_000);
			const second = await discoverModels("pi", executable, { PROFILE_TEST: "isolated" }, 1_000);
			expect(first).toEqual([{ id: "example/model-one" }]);
			expect(second).toEqual(first);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
