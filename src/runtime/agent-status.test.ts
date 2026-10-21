import { describe, expect, it } from "bun:test";
import {
	ACTIVITY_TIMING,
	type ActivityObservation,
	detectChromeActivity,
	resolveAgentActivity,
	shouldSkipCapture,
} from "./agent-status.ts";

function observation(overrides: Partial<ActivityObservation> = {}): ActivityObservation {
	return {
		hookBacked: true,
		hook: undefined,
		hookSeen: false,
		pane: "alive",
		unreachableMs: 0,
		unreachableConfirmed: false,
		chrome: undefined,
		captureEmpty: true,
		previous: undefined,
		...overrides,
	};
}

describe("resolveAgentActivity precedence", () => {
	it("treats an absent pane as an error and an unreachable pane as a held window", () => {
		expect(resolveAgentActivity(observation({ pane: "absent" }))).toBe("error");
		const held = observation({
			pane: "unreachable",
			unreachableMs: 3_999,
			previous: { activity: "running" },
		});
		expect(resolveAgentActivity(held)).toBe("running");
		expect(resolveAgentActivity({ ...held, unreachableMs: 4_000 })).toBe("unknown");
	});

	it("holds an unreachable pane for 30 s once a live pane was confirmed", () => {
		const base = observation({
			pane: "unreachable",
			unreachableConfirmed: true,
			previous: { activity: "waiting" },
		});
		expect(resolveAgentActivity({ ...base, unreachableMs: 29_999 })).toBe("waiting");
		expect(resolveAgentActivity({ ...base, unreachableMs: 30_000 })).toBe("unknown");
	});

	it("makes a dead pane an error only when a hook was seen", () => {
		expect(resolveAgentActivity(observation({ pane: "dead", hookSeen: true, chrome: "running" }))).toBe("error");
		expect(resolveAgentActivity(observation({ pane: "dead", hookSeen: false, chrome: "running" }))).toBe("running");
	});

	it("does not trust a running hook on a dead pane", () => {
		expect(resolveAgentActivity(observation({ pane: "dead", hook: { status: "running", ageMs: 100 } }))).toBe(
			"unknown",
		);
	});

	it("resolves a fresh running hook but treats a standing one as stale", () => {
		expect(resolveAgentActivity(observation({ hook: { status: "running", ageMs: 29_999 } }))).toBe("running");
		// Past freshness a `running` write no longer proves execution; with no chrome the agent is idle.
		expect(resolveAgentActivity(observation({ hook: { status: "running", ageMs: 30_000 } }))).toBe("idle");
		expect(resolveAgentActivity(observation({ hook: { status: "running", ageMs: 899_999 } }))).toBe("idle");
	});

	it("ignores an orphaned hook of any status, falling back to the previous value", () => {
		for (const status of ["running", "idle", "error", "waiting"] as const) {
			expect(resolveAgentActivity(observation({ hook: { status, ageMs: 900_000 } }))).toBe("unknown");
			expect(
				resolveAgentActivity(observation({ hook: { status, ageMs: 900_000 }, previous: { activity: "running" } })),
			).toBe("running");
		}
		expect(resolveAgentActivity(observation({ hook: { status: "idle", ageMs: 899_999 } }))).toBe("idle");
	});

	it("fires the waiting hook rule only on an empty capture, otherwise it falls to chrome", () => {
		const waiting = { status: "waiting", ageMs: 100 } as const;
		expect(resolveAgentActivity(observation({ hook: waiting, captureEmpty: true, chrome: "running" }))).toBe("waiting");
		expect(resolveAgentActivity(observation({ hook: waiting, captureEmpty: false, chrome: "running" }))).toBe(
			"running",
		);
	});

	it("never fires hook rules for a non-hook-backed provider", () => {
		const idleHook = { status: "idle", ageMs: 100 } as const;
		expect(resolveAgentActivity(observation({ hookBacked: false, hook: idleHook }))).toBe("unknown");
		expect(
			resolveAgentActivity(
				observation({
					hookBacked: false,
					hook: idleHook,
					chrome: "waiting",
				}),
			),
		).toBe("waiting");
	});

	it("keeps the last known value when no rule matches and stays unknown on a cold attach", () => {
		expect(resolveAgentActivity(observation())).toBe("unknown");
		expect(resolveAgentActivity(observation({ previous: { activity: "waiting" } }))).toBe("waiting");
	});

	it("uses the pinned timing constants verbatim", () => {
		expect(ACTIVITY_TIMING).toMatchObject({
			freshRunningHookMs: 30_000,
			hookOrphanCeilingMs: 900_000,
			unknownUnreachableUnconfirmedMs: 4_000,
			unknownUnreachableConfirmedMs: 30_000,
			snapshotTtlMs: 2_000,
		});
	});
});

describe("pane/title chrome rules", () => {
	it("returns the first matching synthetic rule and undefined when none matches", () => {
		const rules = [
			{ pattern: /prompt/i, activity: "waiting" as const },
			{ pattern: /work/i, activity: "running" as const },
		];
		expect(detectChromeActivity(rules, "prompt while work continues")).toBe("waiting");
		expect(detectChromeActivity(rules, "ordinary output")).toBeUndefined();
	});
});

describe("skip_capture gate", () => {
	it("skips only when nothing moved and the last capture is past the activity second", () => {
		expect(
			shouldSkipCapture({
				windowActivity: 10,
				lastActivity: 10,
				lastCaptureSecond: 11,
				hasFreshHook: false,
				hasPendingProposal: false,
			}),
		).toBe(true);
	});

	it("never skips when a capture inside or before the activity second proves nothing", () => {
		expect(
			shouldSkipCapture({
				windowActivity: 10,
				lastActivity: 10,
				lastCaptureSecond: 10,
				hasFreshHook: false,
				hasPendingProposal: false,
			}),
		).toBe(false);
		expect(
			shouldSkipCapture({
				windowActivity: 10,
				lastActivity: 10,
				lastCaptureSecond: 9,
				hasFreshHook: false,
				hasPendingProposal: false,
			}),
		).toBe(false);
	});

	it("never skips with a fresh hook, a pending proposal, or a moved window", () => {
		const base = { windowActivity: 10, lastActivity: 10, lastCaptureSecond: 11 };
		expect(shouldSkipCapture({ ...base, hasFreshHook: true, hasPendingProposal: false })).toBe(false);
		expect(shouldSkipCapture({ ...base, hasFreshHook: false, hasPendingProposal: true })).toBe(false);
		expect(shouldSkipCapture({ ...base, windowActivity: 11, hasFreshHook: false, hasPendingProposal: false })).toBe(
			false,
		);
	});
});
