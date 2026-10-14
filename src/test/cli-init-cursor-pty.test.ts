import { describe, expect, it } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

describe("Cursor init PTY behavior", () => {
	it("uses AGENTS.md and completes without opening an editor", async () => {
		const testDir = createUniqueTestDir("cli-init-cursor-pty");
		await mkdir(testDir, { recursive: true });
		const editorMarkerPath = join(testDir, "editor-opened.txt");
		const editorScriptPath = join(testDir, "fail-editor.sh");
		try {
			const init = Bun.spawn(["git", "init", "-b", "main"], { cwd: testDir, stdout: "ignore", stderr: "ignore" });
			expect(await init.exited).toBe(0);
			await writeFile(editorScriptPath, `#!/bin/sh\nprintf 'opened\\n' > '${editorMarkerPath}'\nexit 97\n`);
			await chmod(editorScriptPath, 0o755);
			const stdout: string[] = [];
			const stderr: string[] = [];
			const capture = (chunks: string[]) =>
				new Writable({
					write: (chunk, _encoding, done) => {
						chunks.push(chunk.toString());
						done();
					},
				});
			const exitCode = await runCli(["init", "CursorPty", "--defaults", "--agent-instructions", "cursor"], {
				cwd: testDir,
				stdout: capture(stdout),
				stderr: capture(stderr),
			});
			expect(exitCode).toBe(0);
			expect(stdout.join("") + stderr.join("")).toContain("Initialization Summary");

			expect(await Bun.file(join(testDir, "AGENTS.md")).exists()).toBe(true);
			expect(await Bun.file(editorMarkerPath).exists()).toBe(false);
			expect(await Bun.file(join(testDir, ".cursorrules")).exists()).toBe(false);
			expect(await Bun.file(join(testDir, ".cursor", "rules", "agentic-workspace.mdc")).exists()).toBe(false);
		} finally {
			await safeCleanup(testDir);
		}
	});
});
