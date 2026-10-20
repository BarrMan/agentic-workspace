import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareHarnessEnvironment } from "./harness-environment.ts";
import type { ProcessRunner } from "./session-process.ts";

const paths = (directory: string) => ({
	projectDir: join(directory, "project"),
	worktreeDir: directory,
	taskDir: join(directory, "task"),
});

describe("prepareHarnessEnvironment", () => {
	it("continues sequential expansion when an earlier preset PATH hides cat", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-harness-env-path-"));
		try {
			const warnings: string[] = [];
			const result = await prepareHarnessEnvironment(
				{ PATH: "/not/a/path", SECOND: "$AGENTIC_WORKSPACE_TASK_DIR" },
				paths(directory),
				{ inherited: { PATH: "/bin:/usr/bin" }, onWarning: (warning) => warnings.push(warning) },
			);
			expect(result.PATH).toBe("/not/a/path");
			expect(result.SECOND).toBe(join(directory, "task"));
			expect(warnings).toEqual([]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("uses sequential shell expansion, preserves values and trailing newlines, and protects AgenticWorkspace paths", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-harness-env-"));
		const marker = join(directory, `not-executed-${randomUUID()}`);
		const inherited = {
			PATH: process.env.PATH ?? "/bin:/usr/bin",
			BASE: "base value",
			AGENTIC_WORKSPACE_CWD: "/spaced root",
			AGENTIC_WORKSPACE_TASK_ID: "parent-task",
			AGENTIC_WORKSPACE_SESSION_ID: "old-session",
			AGENTIC_WORKSPACE_PROJECT_ROOT: "/old-project",
			TASK_ID: "stale-task",
			SESSION_ID: "stale-session",
			AGENTIC_WORKSPACE_TMUX_SOCKET: "parent-socket",
			AGENTIC_WORKSPACE_PROJECT_DIR: "/untrusted-project",
		};
		const preset = {
			PATH: "$PATH:/custom-bin",
			FIRST: "$BASE:$AGENTIC_WORKSPACE_WORKTREE_DIR",
			SECOND: "$FIRST:$UNDEFINED_VARIABLE",
			DOLLAR: "\\$BASE",
			COMPLEX: " spaces 'single' \"double\"\nsecond line\n",
			BACKSLASH: "ends-with\\",
			COMMAND_TEXT: `; touch ${marker}`,
			AGENTIC_WORKSPACE_PROJECT_DIR: "/preset-project",
			AGENTIC_WORKSPACE_WORKTREE_DIR: "/preset-worktree",
			AGENTIC_WORKSPACE_TASK_DIR: "/preset-task",
		};
		const originalInherited = { ...inherited };
		const originalPreset = { ...preset };
		const warnings: string[] = [];
		try {
			const result = await prepareHarnessEnvironment(preset, paths(directory), {
				inherited,
				onWarning: (warning) => warnings.push(warning),
			});
			expect(result.PATH).toBe(`${inherited.PATH}:/custom-bin`);
			expect(result.FIRST).toBe(`base value:${directory}`);
			expect(result.SECOND).toBe(`base value:${directory}:`);
			expect(result.DOLLAR).toBe("$BASE");
			expect(result.COMPLEX).toBe(" spaces 'single' \"double\"\nsecond line\n");
			expect(result.BACKSLASH).toBe("ends-with\\");
			expect(result.COMMAND_TEXT).toBe(`; touch ${marker}`);
			expect(await Bun.file(marker).exists()).toBe(false);
			expect(result).toMatchObject({
				AGENTIC_WORKSPACE_PROJECT_DIR: join(directory, "project"),
				AGENTIC_WORKSPACE_WORKTREE_DIR: directory,
				AGENTIC_WORKSPACE_TASK_DIR: join(directory, "task"),
			});
			expect(result.AGENTIC_WORKSPACE_CWD).toBeUndefined();
			expect(result.AGENTIC_WORKSPACE_TASK_ID).toBeUndefined();
			expect(result.AGENTIC_WORKSPACE_SESSION_ID).toBe("old-session");
			expect(result.AGENTIC_WORKSPACE_PROJECT_ROOT).toBe("/old-project");
			expect(result.TASK_ID).toBe("stale-task");
			expect(result.SESSION_ID).toBe("stale-session");
			expect(result.AGENTIC_WORKSPACE_TMUX_SOCKET).toBe("parent-socket");
			expect(warnings).toHaveLength(3);
			expect(warnings.join(" ")).toContain("AGENTIC_WORKSPACE_PROJECT_DIR");
			expect(warnings.join(" ")).toContain("AGENTIC_WORKSPACE_WORKTREE_DIR");
			expect(warnings.join(" ")).toContain("AGENTIC_WORKSPACE_TASK_DIR");
			expect(inherited).toEqual(originalInherited);
			expect(preset).toEqual(originalPreset);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("keeps the previous value after expansion timeout or runner failure without logging values", async () => {
		const directory = await mkdtemp(join(tmpdir(), "agentic-workspace-harness-env-failure-"));
		const calls: Array<{ args: string[]; cwd?: string }> = [];
		const runner: ProcessRunner = {
			run: async (args, options) => {
				calls.push({ args, cwd: options?.cwd });
				if (calls.length === 1)
					return { exitCode: 124, stdout: "secret-output", stderr: "secret-diagnostic", timedOut: true };
				if (calls.length === 2) throw new Error("secret failure detail");
				const marker = args[2]?.match(/:(AGENTIC_WORKSPACE_VALUE_[A-Za-z0-9]+)\n/)?.[1];
				return { exitCode: 0, stdout: `\0:${marker}\n`, stderr: "" };
			},
		};
		const warnings: string[] = [];
		try {
			const result = await prepareHarnessEnvironment(
				{ TIMEOUT_VALUE: "new-secret", FAILED_VALUE: "another-secret", NUL_VALUE: "nul-secret" },
				paths(directory),
				{
					runner,
					inherited: { TIMEOUT_VALUE: "old-timeout", FAILED_VALUE: "old-failure", NUL_VALUE: "old-nul" },
					onWarning: (warning) => warnings.push(warning),
				},
			);
			expect(result.TIMEOUT_VALUE).toBe("old-timeout");
			expect(result.FAILED_VALUE).toBe("old-failure");
			expect(result.NUL_VALUE).toBe("old-nul");
			expect(warnings).toHaveLength(3);
			expect(warnings.join(" ")).toContain("TIMEOUT_VALUE");
			expect(warnings.join(" ")).toContain("FAILED_VALUE");
			expect(warnings.join(" ")).toContain("NUL_VALUE");
			for (const secret of [
				"new-secret",
				"another-secret",
				"nul-secret",
				"secret-output",
				"secret-diagnostic",
				"secret failure detail",
			])
				expect(warnings.join(" ")).not.toContain(secret);
			expect(calls.every((call) => call.args[0] === "/bin/sh" && call.cwd === directory)).toBe(true);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
