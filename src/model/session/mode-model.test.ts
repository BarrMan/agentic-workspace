import { describe, expect, it } from "bun:test";
import { resolveCallingMode } from "./mode-model.ts";
import type { AgentSession } from "./types.ts";

const session = (id: string): AgentSession => ({
	id,
	taskId: "TASK-1",
	preset: "agent",
	tmuxName: `session-${id}`,
	cwd: "/project",
	createdAt: "2026-01-01T00:00:00.000Z",
	outputPath: `/project/${id}.log`,
	bootstrapPath: `/project/${id}.md`,
});

describe("calling mode", () => {
	it("returns the owner mode of the calling session", async () => {
		const modeId = resolveCallingMode(
			{ sessionId: "session-1" },
			{ plan: { sessions: [] }, build: { sessions: [session("session-1")] } },
		);
		expect(modeId).toBe("build");
	});

	it("rejects missing or ambiguous calling session identity", async () => {
		expect(() => resolveCallingMode(undefined, {})).toThrow(/conversation context/i);
		expect(() => resolveCallingMode({ sessionId: "missing" }, {})).toThrow(/uniquely identify/i);
		expect(() =>
			resolveCallingMode(
				{ sessionId: "duplicate" },
				{ plan: { sessions: [session("duplicate")] }, build: { sessions: [session("duplicate")] } },
			),
		).toThrow(/uniquely identify/i);
	});
});
