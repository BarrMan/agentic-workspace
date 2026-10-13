import { describe, expect, it } from "bun:test";
import { runTestCli } from "./test-cli.ts";

describe("BUN_OPTIONS environment variable handling", () => {
	it("parses CLI arguments without treating inherited Bun options as Commander flags", async () => {
		const result = await runTestCli(["--version"], {
			cwd: process.cwd(),
			env: { ...process.env, BUN_OPTIONS: "--bun --silent" },
		});

		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/);
		expect(result.stderr).toBe("");
	});
});
