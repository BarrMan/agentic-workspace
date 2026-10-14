import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveLaunchPreset } from "./opencode-resolution.ts";

const directories: string[] = [];
const preset = { command: "opencode", env: {}, prepare: "", bootstrap: "opencode" as const };

async function versionCommand(version: string): Promise<{ cwd: string; command: string }> {
	const cwd = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-resolution-"));
	directories.push(cwd);
	const command = join(cwd, "opencode");
	await writeFile(command, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`);
	await chmod(command, 0o700);
	return { cwd, command };
}

afterEach(async () => {
	await Promise.all(
		directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })),
	);
});

describe("resolveLaunchPreset", () => {
	it("resolves supported OpenCode versions to their concrete session harness", async () => {
		for (const [version, bootstrap] of [
			["1.19.0", "opencode-v1"],
			["opencode 1.19.0", "opencode-v1"],
			["v2.4.0", "opencode-v2"],
			["opencode v2.0.26", "opencode-v2"],
		] as const) {
			const { cwd, command } = await versionCommand(version);
			const resolved = await resolveLaunchPreset({ ...preset, command }, { cwd, env: {} });
			expect(resolved).toEqual({ ...preset, command, bootstrap });
		}
	});

	it("does not guess unsupported OpenCode versions", async () => {
		for (const version of ["1.20.0", "2.0.26", "OpenCode v2.0.26", "opencode v2.0.26 extra"]) {
			const { cwd, command } = await versionCommand(version);
			await expect(resolveLaunchPreset({ ...preset, command }, { cwd, env: {} })).rejects.toThrow(
				"Unsupported OpenCode version",
			);
		}
	});
});
