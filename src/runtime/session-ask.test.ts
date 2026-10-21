import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentPreset, ModeProfile } from "../model/session/types.ts";
import { getDefaultModeCatalog } from "../storage/config.ts";
import { askSavedConversation } from "./session-ask.ts";
import type { ProcessRunner } from "./session-process.ts";

const profile = getDefaultModeCatalog().profiles.build;
if (!profile) throw new Error("Missing build profile.");

const preset: AgentPreset = { command: ["claude"], bootstrap: "claude", env: {}, prepare: "" };

async function request(root: string) {
	return {
		preset,
		providerSessionId: "exact-provider-session",
		question: "What changed?",
		profile: profile as ModeProfile,
		roots: { repositoryRoot: root, taskRoot: root, cwd: root, taskId: "TASK-1", modeId: "build", sessionId: "local-1" },
	};
}

describe("askSavedConversation", () => {
	test("executes the adapter-normalized command once and returns its completed answer", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-ask-test-"));
		const calls: Array<{ args: string[]; cwd?: string }> = [];
		const runner: ProcessRunner = {
			run: async (args, options) => {
				calls.push({ args, cwd: options?.cwd });
				return { exitCode: 0, stdout: " completed answer \n", stderr: "" };
			},
		};
		try {
			expect(await askSavedConversation(runner, await request(root))).toEqual({ answer: "completed answer" });
			expect(calls).toHaveLength(1);
			expect(calls[0]?.args.slice(0, 2)).toEqual(["/bin/sh", "-lc"]);
			expect(calls[0]?.cwd).toBe(root);
			expect(calls[0]?.args[2]).toContain("exact-provider-session");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test.each([
		["timeout", { exitCode: 124, stdout: "partial", stderr: "", timedOut: true }, "completed answer"],
		["provider failure", { exitCode: 1, stdout: "", stderr: "provider failed" }, "could not answer: provider failed"],
		["empty success", { exitCode: 0, stdout: "  ", stderr: "" }, "no completed answer"],
	] as const)("rejects %s without returning terminal output", async (_label, result, message) => {
		const root = await mkdtemp(join(tmpdir(), "session-ask-test-"));
		const runner: ProcessRunner = { run: async () => result };
		try {
			await expect(askSavedConversation(runner, await request(root))).rejects.toThrow(message);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("rejects a missing provider identity before command preparation", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-ask-test-"));
		let calls = 0;
		const runner: ProcessRunner = {
			run: async () => {
				calls++;
				return { exitCode: 0, stdout: "unused", stderr: "" };
			},
		};
		try {
			await expect(askSavedConversation(runner, { ...(await request(root)), providerSessionId: " " })).rejects.toThrow(
				"exact provider session ID",
			);
			expect(calls).toBe(0);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
