/**
 * Focused unit tests for the activity probe's Phase-2 contract: an owned VT session supplies its
 * metadata with no fork, and the `skip_capture` gate makes an unchanged window cost zero captures.
 */

import { describe, expect, it } from "bun:test";
import { type ActivityProbeTarget, createActivityProbe } from "./agent-status-probe.ts";
import type { TmuxResult } from "./live/tmux/types.ts";

const result = (stdout: string): TmuxResult => ({ exitCode: 0, stdout, stderr: "", durationMs: 0 });

const count = (calls: readonly (readonly string[])[], verb: string): number =>
	calls.filter((argv) => argv[0] === verb).length;

describe("createActivityProbe", () => {
	it("uses owned VT metadata with no fork and skips an unchanged capture", async () => {
		let nowMs = 1_000_000;
		let windowActivity = 500;
		const calls: string[][] = [];
		const exec = async (argv: readonly string[]): Promise<TmuxResult> => {
			calls.push([...argv]);
			if (argv[0] === "capture-pane") return result("> ");
			return result("0 0");
		};
		const probe = createActivityProbe({ now: () => nowMs });
		const target: ActivityProbeTarget = {
			sessionId: "s1",
			bootstrap: "claude",
			statusDir: undefined,
			exec,
			target: "t:0.0",
			read: () => ({ paneDead: false, windowActivity }),
		};

		await probe.probe([target]);
		expect(count(calls, "display-message")).toBe(0);
		expect(count(calls, "capture-pane")).toBe(1);

		// Past the half-life cache with an unchanged window: no capture.
		calls.length = 0;
		nowMs += 1_001;
		await probe.probe([target]);
		expect(count(calls, "capture-pane")).toBe(0);

		// A new window activity second must capture again.
		nowMs += 1_001;
		windowActivity = 501;
		await probe.probe([target]);
		expect(count(calls, "capture-pane")).toBe(1);
	});

	it("forks a display-message read for an external session with no VT metadata", async () => {
		const calls: string[][] = [];
		const exec = async (argv: readonly string[]): Promise<TmuxResult> => {
			calls.push([...argv]);
			return argv[0] === "display-message" ? result("0 42") : result("");
		};
		const probe = createActivityProbe({ now: () => 1_000_000 });
		await probe.probe([{ sessionId: "e1", bootstrap: "claude", statusDir: undefined, exec, target: "p" }]);
		expect(count(calls, "display-message")).toBe(1);
	});

	it("refuses to skip while a pending idle proposal is outstanding", async () => {
		let nowMs = 1_000_000;
		const calls: string[][] = [];
		const exec = async (argv: readonly string[]): Promise<TmuxResult> => {
			calls.push([...argv]);
			return argv[0] === "capture-pane" ? result("> ") : result("0 0");
		};
		const probe = createActivityProbe({ now: () => nowMs });
		const target: ActivityProbeTarget = {
			sessionId: "s2",
			bootstrap: "claude",
			statusDir: undefined,
			exec,
			target: "t:0.0",
			read: () => ({ paneDead: false, windowActivity: 500 }),
			pendingProposal: true,
		};
		await probe.probe([target]);
		expect(count(calls, "capture-pane")).toBe(1);
		calls.length = 0;
		nowMs += 1_001;
		await probe.probe([target]);
		expect(count(calls, "capture-pane")).toBe(1);
	});

	it("does not capture for an unknown adapter", async () => {
		const calls: string[][] = [];
		const exec = async (argv: readonly string[]): Promise<TmuxResult> => {
			calls.push([...argv]);
			return result("0 42");
		};
		const probe = createActivityProbe({ now: () => 1_000_000 });
		const evidence = await probe.probe([
			{ sessionId: "unknown", bootstrap: "missing-adapter", statusDir: undefined, exec, target: "p" },
		]);
		expect(count(calls, "capture-pane")).toBe(0);
		expect(evidence.get("unknown")?.chrome).toBeUndefined();
	});
});
