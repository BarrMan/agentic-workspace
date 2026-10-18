import { describe, expect, it } from "bun:test";
import type { Core } from "../core/agentic-workspace.ts";
import { resolveCallingMode } from "./mode-model.ts";

const core = { filesystem: { rootDir: "/project" } } as unknown as Core;

describe("calling mode", () => {
	it("returns the owner mode of the calling session", async () => {
		const modeId = await resolveCallingMode(core, {
			context: async () => ({
				v: 2 as const,
				paneId: "%42",
				rootDir: "/project",
				conversation: { taskId: "TASK-1", modeId: "plan", sessionId: "session-1" },
			}),
			readSessions: async () => ({
				version: 2,
				taskId: "TASK-1",
				legacyModeId: "build",
				sessions: [],
				modes: { build: { sessions: [{ id: "session-1" }] } },
			}),
		});
		expect(modeId).toBe("build");
	});

	it("rejects missing or ambiguous calling session identity", async () => {
		await expect(resolveCallingMode(core, { context: async () => undefined })).rejects.toThrow(/conversation context/i);
		await expect(
			resolveCallingMode(core, {
				context: async () => ({
					v: 2 as const,
					paneId: "%42",
					rootDir: "/project",
					conversation: { taskId: "TASK-1", modeId: "plan", sessionId: "missing" },
				}),
				readSessions: async () => ({
					version: 2 as const,
					taskId: "TASK-1",
					legacyModeId: "build",
					sessions: [],
					modes: {},
				}),
			}),
		).rejects.toThrow(/uniquely identify/i);
	});
});
