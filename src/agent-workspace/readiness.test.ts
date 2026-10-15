import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseReadinessReceipt, waitForReceipts } from "./harness.ts";
import { initializedReceiptPath, promptAcceptedReceiptPath } from "./session-launch.ts";
import type { AgentSession } from "./types.ts";

const session = { id: "session-readiness-test" } as AgentSession;
const liveProcess = { alive: async () => ({ exitCode: 0, stdout: "0", stderr: "" }) };

describe("launch readiness plumbing", () => {
	it("parses non-empty receipts and optionally requires an exact native id", () => {
		expect(parseReadinessReceipt(" native-1\n")).toBe(true);
		expect(parseReadinessReceipt(" native-1\n", "native-1")).toBe(true);
		expect(parseReadinessReceipt(" native-1\n", "native-2")).toBe(false);
		expect(parseReadinessReceipt(" \n")).toBe(false);
	});

	it("expires against the independently configurable provider-readiness deadline", async () => {
		const directory = await mkdtemp(join(tmpdir(), "readiness-deadline-test-"));
		try {
			await expect(
				waitForReceipts([initializedReceiptPath(directory)], undefined, session, liveProcess as never, 5),
			).rejects.toThrow("Provider readiness timed out");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("does not let an earlier launch receipt satisfy a later launch with the same native id", async () => {
		const earlier = await mkdtemp(join(tmpdir(), "readiness-launch-old-"));
		const later = await mkdtemp(join(tmpdir(), "readiness-launch-new-"));
		try {
			await writeFile(promptAcceptedReceiptPath(earlier), "same-native-id");
			expect(initializedReceiptPath(earlier)).not.toBe(initializedReceiptPath(later));
			expect(promptAcceptedReceiptPath(earlier)).not.toBe(promptAcceptedReceiptPath(later));
			await expect(
				waitForReceipts([promptAcceptedReceiptPath(later)], "same-native-id", session, liveProcess as never, 5),
			).rejects.toThrow("Provider readiness timed out");
		} finally {
			await Promise.all([rm(earlier, { recursive: true, force: true }), rm(later, { recursive: true, force: true })]);
		}
	});
});
