import { describe, expect, it } from "bun:test";
import { settleWorkspaceClose } from "./workspace-close.ts";

describe("workspace close", () => {
	it("keeps executions alive when the user declines force close", async () => {
		const calls: string[] = [];
		const result = await settleWorkspaceClose({
			hasWorkingSessions: true,
			confirm: async () => false,
			settlePending: async () => void calls.push("settle"),
			shutdown: async () => void calls.push("shutdown"),
			close: async (mode) => void calls.push(`close:${mode}`),
		});

		expect(result).toBe("keep");
		expect(calls).toEqual(["close:keep"]);
	});

	it("waits for pending launches before force shutdown", async () => {
		const calls: string[] = [];
		const result = await settleWorkspaceClose({
			hasWorkingSessions: true,
			confirm: async () => true,
			settlePending: async () => void calls.push("settle"),
			shutdown: async () => void calls.push("shutdown"),
			close: async (mode) => void calls.push(`close:${mode}`),
		});

		expect(result).toBe("force");
		expect(calls).toEqual(["settle", "shutdown", "close:force"]);
	});

	it("does not proceed to close when shutdown fails", async () => {
		const failure = new Error("shutdown failed");
		const calls: string[] = [];
		await expect(
			settleWorkspaceClose({
				hasWorkingSessions: true,
				confirm: async () => true,
				settlePending: async () => undefined,
				shutdown: async () => {
					throw failure;
				},
				close: async () => void calls.push("close"),
			}),
		).rejects.toBe(failure);
		expect(calls).toEqual([]);
	});

	it("preserves non-working sessions without asking to force close", async () => {
		let prompted = false;
		const result = await settleWorkspaceClose({
			hasWorkingSessions: false,
			confirm: async () => {
				prompted = true;
				return true;
			},
			settlePending: async () => undefined,
			shutdown: async () => undefined,
			close: async () => undefined,
		});

		expect(result).toBe("keep");
		expect(prompted).toBe(false);
	});
});
