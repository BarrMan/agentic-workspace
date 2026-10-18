import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { $ } from "bun";
import { getTestCliCommand } from "./test-cli.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

describe("model CLI operation", () => {
	it("requires a caller-supplied provider/model and no discovery flag", async () => {
		const cwd = createUniqueTestDir("cli-agent-config-model");
		try {
			await mkdir(cwd, { recursive: true });
			const cli = getTestCliCommand();
			const help = await $`${cli} agent-config --help`.cwd(cwd).text();
			expect(help).toContain("model");
			const modelHelp = await $`${cli} agent-config model --help`.cwd(cwd).text();
			expect(modelHelp).toContain("set");
			const setHelp = await $`${cli} agent-config model set --help`.cwd(cwd).text();
			expect(setHelp).toContain("<provider/model>");
			expect(setHelp).not.toContain("--current");
			const removedCommand = await $`${cli} agent-config init`.cwd(cwd).quiet().nothrow();
			expect(removedCommand.exitCode).not.toBe(0);
		} finally {
			safeCleanup(cwd);
		}
	});
});
