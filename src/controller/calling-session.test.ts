import { describe, expect, it } from "bun:test";
import type { AgentSession } from "../model/session/types.ts";
import { CallingSessionOperations } from "./calling-session.ts";

describe("calling session operations", () => {
	const record: AgentSession = {
		id: "saved-1",
		taskId: "TASK-1",
		preset: "opencode",
		createdAt: "2026-10-21T00:00:00Z",
		tmuxName: "saved-1",
		cwd: "/project",
		outputPath: "/runtime/output",
		bootstrapPath: "/runtime/bootstrap",
	};
	const caller = { taskId: "TASK-1", sessionId: "saved-1" };

	it("resolves ask and opaque model input through the same retained history", async () => {
		const effects: unknown[] = [];
		const operations = new CallingSessionOperations(
			async (taskId) => {
				effects.push(taskId);
				return { modes: { build: { sessions: [record] } } };
			},
			async (...args) => {
				effects.push(args);
				return { answer: "answer" };
			},
			async (...args) => {
				effects.push(args);
			},
		);
		expect(await operations.ask("TASK-1", "question", caller)).toEqual({ answer: "answer" });
		await operations.setModel("provider/model:opaque value", caller);
		expect(effects).toEqual([
			"TASK-1",
			["TASK-1", "build", "question"],
			"TASK-1",
			["build", "provider/model:opaque value"],
		]);
	});

	it("fails before executing when calling identity is absent or ambiguous", async () => {
		let effects = 0;
		const operations = new CallingSessionOperations(
			async () => ({ modes: { plan: { sessions: [record] }, build: { sessions: [record] } } }),
			async () => {
				effects++;
				return { answer: "" };
			},
			async () => {
				effects++;
			},
		);
		await expect(operations.ask("TASK-1", "question", {})).rejects.toThrow("calling workspace conversation");
		await expect(operations.ask("TASK-1", "question", caller)).rejects.toThrow("uniquely identify");
		await expect(operations.setModel("model", { sessionId: "saved-1" })).rejects.toThrow(
			"calling workspace conversation",
		);
		expect(effects).toBe(0);
	});
});
