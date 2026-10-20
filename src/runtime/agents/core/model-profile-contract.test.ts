import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentPreset, ModeProfile } from "../../../model/session/types.ts";
import { discoverModels, validateExplicitModel, withExplicitModel } from "./profile.ts";

const defaultProfile: ModeProfile = {
	name: "Default",
	model: { kind: "default" },
	prompt: "",
	permissions: { repository: "read", task: "read", artifacts: "read", subagents: "disabled" },
	artifacts: [],
};

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

	test("OpenCode and Pi discovery use isolated executables, selected environment, and environment-sensitive cache identity", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-model-contract-"));
		try {
			const fixture = join(directory, "model-fixture");
			const observations = join(directory, "observations");
			await writeFile(
				fixture,
				`#!/bin/sh\nprintf '%s\\n' "$PROFILE_FIXTURE" >> '${observations}'\n` +
					`if [ "$2" = models ]; then printf 'openai/fast\\nopenai/fast\\ninvalid model\\nopenai/slow\\n'; ` +
					`else printf 'provider model context\\nopenai fast 128K\\nopenai fast 128K\\nopenai slow 64K\\n'; fi\n`,
				{ mode: 0o700 },
			);
			for (const harness of ["opencode", "pi"] as const) {
				const command = [fixture, "--preset-arg"];
				const env = { PATH: process.env.PATH ?? "", PROFILE_FIXTURE: `${harness}-secret-a` };
				const first = await discoverModels(harness, command, env, 1_000);
				const cached = await discoverModels(harness, command, env, 1_000);
				const changedEnv = await discoverModels(
					harness,
					command,
					{ ...env, PROFILE_FIXTURE: `${harness}-secret-b` },
					1_000,
				);
				expect(first.map(({ id }) => id)).toEqual(
					harness === "opencode" ? ["invalid model", "openai/fast", "openai/slow"] : ["openai/fast", "openai/slow"],
				);
				expect(cached).toEqual(first);
				expect(changedEnv).toEqual(first);
			}
			const observed = await readFile(observations, "utf8");
			expect(observed).toContain("opencode-secret-a");
			expect(observed).toContain("opencode-secret-b");
			expect(observed).toContain("pi-secret-a");
			expect(observed).toContain("pi-secret-b");
			expect(observed.match(/opencode-secret-a/g)).toHaveLength(1);
			expect(observed.match(/pi-secret-a/g)).toHaveLength(1);
			expect(JSON.stringify(await Bun.file(observations).text())).not.toContain("stored-model");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("discovery timeout, nonzero exit, empty and partial catalogs fail closed without removing Default", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-model-failure-"));
		try {
			const timeout = join(directory, "timeout");
			const failing = join(directory, "failing");
			const partial = join(directory, "partial");
			await writeFile(timeout, "#!/bin/sh\nsleep 2\n", { mode: 0o700 });
			await writeFile(failing, "#!/bin/sh\nprintf 'partial/model\\n'; exit 2\n", { mode: 0o700 });
			await writeFile(partial, "#!/bin/sh\nprintf 'good/model\\nbad model\\nsecond/model\\n'\n", { mode: 0o700 });
			expect(await discoverModels("opencode", [timeout], {}, 20)).toEqual([]);
			expect(await discoverModels("opencode", [failing], {}, 1_000)).toEqual([]);
			expect(await discoverModels("opencode", [], {}, 1_000)).toEqual([]);
			expect(await discoverModels("opencode", [partial], {}, 1_000)).toEqual([
				{ id: "bad model" },
				{ id: "good/model" },
				{ id: "second/model" },
			]);
			expect(defaultProfile.model).toEqual({ kind: "default" });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("Claude remains manual-only and explicit IDs survive empty discovery as editable configuration", async () => {
		const configured = preset("claude", ["claude", "--model", "preset/model"]);
		const choices = await discoverModels("claude", configured.command, configured.env);
		expect(choices).toEqual([]);
		expect(validateExplicitModel("manual/model", undefined)).toMatchObject({ compatible: undefined });
		expect(withExplicitModel(configured, "manual/model").command).toContain("manual/model");
	});
});
