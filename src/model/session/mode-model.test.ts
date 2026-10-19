import { describe, expect, it } from "bun:test";
import type { Core } from "../../controller/agentic-workspace.ts";
import { resolveCallingMode } from "./mode-model.ts";
import type { AgentSession } from "./types.ts";

const core = { filesystem: { rootDir: "/project" } } as unknown as Core;
const session = (id: string): AgentSession => ({
	id,
	taskId: "TASK-1",
	preset: "agent",
	tmuxName: `session-${id}`,
	cwd: "/project",
	createdAt: "2026-01-01T00:00:00.000Z",
	status: "running",
	outputPath: `/project/${id}.log`,
	bootstrapPath: `/project/${id}.md`,
});

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
				modes: {
					plan: { sessions: [] },
					build: { activeSessionId: "session-1", sessions: [session("session-1")] },
				},
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
		await expect(
			resolveCallingMode(core, {
				context: async () => ({
					v: 2 as const,
					paneId: "%42",
					rootDir: "/project",
					conversation: { taskId: "TASK-1", modeId: "plan", sessionId: "duplicate" },
				}),
				readSessions: async () => ({
					version: 2 as const,
					taskId: "TASK-1",
					legacyModeId: "build",
					sessions: [],
					modes: {
						plan: { sessions: [session("duplicate")] },
						build: { sessions: [session("duplicate")] },
					},
				}),
			}),
		).rejects.toThrow(/uniquely identify/i);
	});
});
