import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isProcessAlive,
	parseWorkspaceContext,
	readWorkspaceContext,
	serializeWorkspaceContext,
	WORKSPACE_CONTEXT_ENV,
	workspaceContextInto,
} from "./workspace-context.ts";

const ROOT = process.cwd();
const base = { v: 2 as const, paneId: "%42", rootDir: ROOT };

describe("shared workspace context", () => {
	it("validates the shared pane and canonical root without consulting a frontend PID", async () => {
		const candidate = {
			...base,
			conversation: { taskId: "Task-EXACT.1", modeId: "implementation", sessionId: "Saved.Session_01" },
			nativeSessionId: "Provider.Exact:01",
		};
		let queried: string | undefined;
		expect(
			await readWorkspaceContext({
				env: { [WORKSPACE_CONTEXT_ENV]: serializeWorkspaceContext(candidate) },
				rootDir: join(ROOT, "."),
				paneMatches: async (paneId, context) => {
					queried = paneId;
					return paneId === "%42" && context.rootDir === ROOT && context.conversation?.sessionId === "Saved.Session_01";
				},
			}),
		).toEqual(candidate);
		expect(queried).toBe("%42");
	});

	it("rejects stale pane identity and a replacement with a different pane ID", async () => {
		const raw = serializeWorkspaceContext(base);
		await expect(
			readWorkspaceContext({ env: { [WORKSPACE_CONTEXT_ENV]: raw }, rootDir: ROOT, paneMatches: async () => false }),
		).rejects.toThrow("pane identity");
		await expect(
			readWorkspaceContext({
				env: { [WORKSPACE_CONTEXT_ENV]: raw },
				rootDir: ROOT,
				paneMatches: async (pane) => pane === "%99",
			}),
		).rejects.toThrow("pane identity");
		const withConversation = serializeWorkspaceContext({
			...base,
			conversation: { taskId: "TASK-1", modeId: "implementation", sessionId: "same-id" },
		});
		expect(
			await readWorkspaceContext({
				env: { [WORKSPACE_CONTEXT_ENV]: withConversation },
				rootDir: ROOT,
				paneMatches: async () => true,
			}),
		).toEqual(JSON.parse(withConversation));
	});

	it("rejects mismatched roots, malformed pane IDs, and private PID protocols", async () => {
		await expect(
			readWorkspaceContext({
				env: { [WORKSPACE_CONTEXT_ENV]: serializeWorkspaceContext(base) },
				rootDir: tmpdir(),
				paneMatches: async () => true,
			}),
		).rejects.toThrow("root");
		for (const value of [
			{ ...base, paneId: "42" },
			{ v: 2, pid: 1, session: "agentic-workspace-task-4242abcd", rootDir: ROOT },
			{ v: 3, paneId: "%42", rootDir: ROOT },
		])
			expect(() => parseWorkspaceContext(JSON.stringify(value))).toThrow();
	});

	it("writes the authoritative pane/root and preserves exact conversation identity", () => {
		const env = { KEEP: "1" };
		const next = workspaceContextInto(env, {
			paneId: "%42",
			rootDir: ROOT,
			conversation: { taskId: "Task-EXACT.1", modeId: "implementation", sessionId: "Native.ID_01" },
			nativeSessionId: "Provider.Exact:01",
		});
		expect(env).toEqual({ KEEP: "1" });
		const serialized = next[WORKSPACE_CONTEXT_ENV];
		if (!serialized) throw new Error("Workspace context was not written.");
		expect(JSON.parse(serialized)).toEqual({
			...base,
			conversation: { taskId: "Task-EXACT.1", modeId: "implementation", sessionId: "Native.ID_01" },
			nativeSessionId: "Provider.Exact:01",
		});
	});
});

describe("isProcessAlive", () => {
	it("retains process liveness safety independently of workspace authority", () => {
		expect(isProcessAlive(process.pid)).toBeTrue();
		expect(isProcessAlive(undefined)).toBeFalse();
		expect(isProcessAlive(0)).toBeFalse();
		expect(isProcessAlive(2 ** 30)).toBeFalse();
	});
});
