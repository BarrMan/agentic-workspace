import { describe, expect, test } from "bun:test";
import type { AgentPreset } from "../../../model/session/types.ts";
import { withExplicitModel } from "./profile.ts";

const preset = (bootstrap: AgentPreset["bootstrap"], command: string[]): AgentPreset => ({
	bootstrap,
	command,
	prepare: "",
	env: { PROFILE_FIXTURE: "preset" },
});

describe("approved harness model profile contract", () => {
	test("Default preserves each harness preset command and native model selection", () => {
		const cases = [
			preset("opencode", ["opencode", "--model", "preset/model", "--provider", "openai"]),
			preset("claude", ["claude", "--model", "preset/model"]),
			preset("pi", ["pi", "-m", "preset/model"]),
		] as const;
		expect(cases.map(({ command }) => command)).toEqual([
			["opencode", "--model", "preset/model", "--provider", "openai"],
			["claude", "--model", "preset/model"],
			["pi", "-m", "preset/model"],
		]);
	});

	test("explicit IDs replace split, short, and equals model switches once while retaining provider options", () => {
		const cases = [
			[
				preset("opencode", ["opencode", "--model", "old", "--provider", "openai", "--model=duplicate"]),
				"opencode",
				true,
			],
			[preset("claude", ["claude", "-m", "old", "--model=duplicate"]), "claude", false],
			[preset("pi", ["pi", "--provider", "openai", "-m", "old", "--model", "duplicate"]), "pi", true],
		] as const;
		for (const [configured, harness, hasProvider] of cases) {
			const result = withExplicitModel(configured, "provider/new:model");
			const argv = result.command;
			expect(argv[0]).toBe(harness);
			expect(argv.filter((arg) => arg === "--model" || arg === "-m" || arg.startsWith("--model="))).toEqual([
				"--model",
			]);
			expect(argv).toContain("provider/new:model");
			if (hasProvider) {
				expect(argv).toContain("--provider");
				expect(argv).toContain("openai");
			}
		}
	});

	test("opaque model IDs remain a single argument, including shell syntax and whitespace", () => {
		for (const id of ["model; rm -rf /", "model && other", "model|other", "$(touch /tmp/x)", "model\nother"]) {
			const result = withExplicitModel(preset("pi", ["pi"]), id);
			expect(result.command.slice(-2)).toEqual(["--model", id]);
		}
	});
});
