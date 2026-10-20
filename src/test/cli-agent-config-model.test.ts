import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import { getTestCliCommand, runTestCli } from "./test-cli.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

describe("model CLI operation", () => {
	it("requires a caller-supplied model ID and no discovery flag", async () => {
		const cwd = createUniqueTestDir("cli-agent-config-model");
		try {
			await mkdir(cwd, { recursive: true });
			const cli = getTestCliCommand();
			const help = await $`${cli} agent-config --help`.cwd(cwd).text();
			expect(help).toContain("model");
			const modelHelp = await $`${cli} agent-config model --help`.cwd(cwd).text();
			expect(modelHelp).toContain("set");
			const setHelp = await $`${cli} agent-config model set --help`.cwd(cwd).text();
			expect(setHelp).toContain("<id>");
			expect(setHelp).not.toContain("--current");
			const removedCommand = await $`${cli} agent-config init`.cwd(cwd).quiet().nothrow();
			expect(removedCommand.exitCode).not.toBe(0);
		} finally {
			safeCleanup(cwd);
		}
	});

	it("passes opaque model IDs through to calling-context validation", async () => {
		const cwd = createUniqueTestDir("cli-agent-config-model-opaque");
		try {
			await mkdir(cwd, { recursive: true });
			await initializeTestProject(new Core(cwd), "Opaque model ID fixture");
			for (const id of ["slashfree", "one/two/three", "!@#$: model?=x"]) {
				const result = await runTestCli(["agent-config", "model", "set", id], { cwd });
				expect(result.exitCode).not.toBe(0);
				expect(result.stderr).toContain("valid calling workspace conversation context");
				expect(result.stderr).not.toContain("Model ID must");
			}
		} finally {
			safeCleanup(cwd);
		}
	});
});
