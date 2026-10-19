import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	deleteWorkspaceRequest,
	isProcessAlive,
	parseWorkspaceContext,
	readWorkspaceContext,
	readWorkspaceRequests,
	serializeWorkspaceContext,
	WORKSPACE_CONTEXT_ENV,
	workspaceContextInto,
	workspaceRequestDir,
	writeWorkspaceRequest,
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

describe("workspace request markers", () => {
	function fixture(): { root: string; cleanup: () => void } {
		const root = mkdtempSync(join(tmpdir(), "workspace-request-"));
		return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
	}

	it("round-trips a request and removes the directory with its last marker", async () => {
		const { root, cleanup } = fixture();
		try {
			const request = { taskId: "TASK-1", sessionId: "session-1", pid: 1234 };
			await writeWorkspaceRequest(root, request);
			expect(await readWorkspaceRequests(root)).toEqual([request]);
			await deleteWorkspaceRequest(root, "session-1");
			expect(await readWorkspaceRequests(root)).toEqual([]);
			expect(existsSync(workspaceRequestDir(root))).toBeFalse();
		} finally {
			cleanup();
		}
	});

	it("ignores malformed markers and refuses path traversal", async () => {
		const { root, cleanup } = fixture();
		try {
			const directory = workspaceRequestDir(root);
			await mkdir(directory, { recursive: true });
			await Bun.write(join(directory, "broken.json"), "{not json");
			const valid = { taskId: "TASK-2", sessionId: "valid-1", pid: 1 };
			await writeWorkspaceRequest(root, valid);
			expect(await readWorkspaceRequests(root)).toEqual([valid]);
			await expect(writeWorkspaceRequest(root, { ...valid, sessionId: "../escape" })).rejects.toThrow(
				"Invalid workspace request",
			);
		} finally {
			cleanup();
		}
	});
});
