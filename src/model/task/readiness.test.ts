import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReadinessReceipt, waitForReceipts } from "../../runtime/harness.ts";
import type { AgentSession } from "../session/types.ts";

const session = { id: "session-readiness-test" } as AgentSession;
const liveProcess = { alive: async () => ({ exitCode: 0, stdout: "0", stderr: "" }) };

describe("launch readiness plumbing", () => {
	it("parses non-empty receipts and optionally requires an exact native id", () => {
		expect(parseReadinessReceipt(" native-1\n")).toBe(true);
		expect(parseReadinessReceipt(" native-1\n", "native-1")).toBe(true);
		expect(parseReadinessReceipt(" native-1\n", "native-2")).toBe(false);
		expect(parseReadinessReceipt(" \n")).toBe(false);
		expect(parseReadinessReceipt('{"session_id":"native-1","source":"resume"}', { session_id: "native-1" })).toBe(true);
		expect(
			parseReadinessReceipt('{"session_id":"native-1","source":"startup"}', {
				session_id: "native-1",
				source: "resume",
			}),
		).toBe(false);
		expect(parseReadinessReceipt("not-json", { session_id: "native-1" })).toBe(false);
	});

	it("expires against the independently configurable provider-readiness deadline", async () => {
		const directory = await mkdtemp(join(tmpdir(), "readiness-deadline-test-"));
		try {
			await expect(
				waitForReceipts(join(directory, "initialized"), undefined, session, liveProcess as never, 5),
			).rejects.toThrow("Provider readiness timed out");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("does not let an earlier launch receipt satisfy a later launch with the same native id", async () => {
		const earlier = await mkdtemp(join(tmpdir(), "readiness-launch-old-"));
		const later = await mkdtemp(join(tmpdir(), "readiness-launch-new-"));
		try {
			await writeFile(join(earlier, "prompt-accepted"), "same-native-id");
			expect(join(earlier, "initialized")).not.toBe(join(later, "initialized"));
			expect(join(earlier, "prompt-accepted")).not.toBe(join(later, "prompt-accepted"));
			await expect(
				waitForReceipts(join(later, "prompt-accepted"), "same-native-id", session, liveProcess as never, 5),
			).rejects.toThrow("Provider readiness timed out");
		} finally {
			await Promise.all([rm(earlier, { recursive: true, force: true }), rm(later, { recursive: true, force: true })]);
		}
	});

	it("reports a present but invalid stage receipt as mismatched", async () => {
		const directory = await mkdtemp(join(tmpdir(), "readiness-mismatch-test-"));
		const path = join(directory, "initialized");
		try {
			await writeFile(path, '{"session_id":"other","source":"startup"}');
			await expect(
				waitForReceipts(path, { session_id: "expected", source: "resume" }, session, liveProcess as never, 5),
			).rejects.toThrow("mismatched initialized receipt");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
