import { describe, expect, it } from "bun:test";
import { createActivityObserver } from "./activity-observer.ts";
import type { ActivityProbeEvidence } from "./agent-status-probe.ts";

const target = { sessionId: "first", bootstrap: "claude", lifecycle: "running" } as const;

function evidence(overrides: Partial<ActivityProbeEvidence> = {}): ActivityProbeEvidence {
	return { hook: undefined, pane: "alive", captureEmpty: true, chrome: undefined, ...overrides };
}

describe("shared activity observation history", () => {
	it("transfers complete history without exposing mutable state or accepting invalid seeds", () => {
		const ui = createActivityObserver({ now: () => 100 });
		const helper = createActivityObserver({ now: () => 100 });
		ui.observe(target, evidence({ hook: { status: "running", ageMs: 0 } }));
		ui.observe(target, evidence({ pane: "unreachable" }));
		const history = ui.snapshot(target.sessionId);
		if (!history) throw new Error("Missing observed history");
		helper.seed(target.sessionId, history);
		expect(helper.observe(target, evidence({ pane: "unreachable" }))).toBe(
			ui.observe(target, evidence({ pane: "unreachable" })),
		);
		expect(helper.observe(target, evidence({ pane: "dead" }))).toBe("error");
		expect(() => helper.seed(target.sessionId, { ...history, unreachableSince: Number.NaN })).toThrow("Invalid");
		helper.clear(target.sessionId);
		expect(helper.snapshot(target.sessionId)).toBeUndefined();
	});
	it("preserves running, stale idle, waiting, error, unknown and terminal verdicts", () => {
		const observer = createActivityObserver();
		expect(observer.observe(target, evidence())).toBe("unknown");
		for (const status of ["running", "idle", "waiting", "error"] as const) {
			expect(observer.observe(target, evidence({ hook: { status, ageMs: 0 } }))).toBe(status);
		}
		expect(observer.observe(target, evidence({ hook: { status: "running", ageMs: 30_000 } }))).toBe("idle");
		expect(observer.observe(target, evidence({ chrome: "running" }))).toBe("running");
		expect(observer.observe(target, evidence({ hook: { status: "running", ageMs: 900_000 } }))).toBe("running");
		expect(
			observer.observe(
				target,
				evidence({ hook: { status: "waiting", ageMs: 0 }, captureEmpty: false, chrome: "running" }),
			),
		).toBe("running");
		for (const lifecycle of ["stopped", "failed"] as const) {
			expect(observer.observe({ ...target, lifecycle }, evidence({ chrome: "running" }))).toBe("stopped");
		}
	});

	it("remembers hooks for dead panes and clears only the requested session", () => {
		const observer = createActivityObserver();
		const other = { ...target, sessionId: "second" };
		observer.observe(target, evidence({ hook: { status: "running", ageMs: 0 } }));
		observer.observe(other, evidence({ chrome: "waiting" }));
		expect(observer.observe(target, evidence({ pane: "dead" }))).toBe("error");
		observer.clear(target.sessionId);
		expect(observer.observe(target, evidence({ pane: "dead" }))).toBe("unknown");
		expect(observer.observe(other, evidence())).toBe("waiting");
		expect(
			observer.observe({ ...other, bootstrap: "custom" }, evidence({ hook: { status: "running", ageMs: 0 } })),
		).toBe("waiting");
	});

	it("holds confirmed unreachable activity for 30 seconds and resets the timer on recovery", () => {
		let at = 0;
		const observer = createActivityObserver({ now: () => at });
		observer.observe(target, evidence({ chrome: "running" }));
		expect(observer.observe(target, evidence({ pane: "unreachable" }))).toBe("running");
		at = 29_999;
		expect(observer.observe(target, evidence({ pane: "unreachable" }))).toBe("running");
		at = 30_000;
		expect(observer.observe(target, evidence({ pane: "unreachable" }))).toBe("unknown");
		observer.observe(target, evidence({ chrome: "idle" }));
		at = 40_000;
		expect(observer.observe(target, evidence({ pane: "unreachable" }))).toBe("idle");
		at = 69_999;
		expect(observer.observe(target, evidence({ pane: "unreachable" }))).toBe("idle");
		at = 70_000;
		expect(observer.observe(target, evidence({ pane: "unreachable" }))).toBe("unknown");
	});

	it("keeps cold unreachable history isolated and clearing removes confirmation", () => {
		let at = 0;
		const observer = createActivityObserver({ now: () => at });
		const other = { ...target, sessionId: "second" };
		observer.observe(target, evidence({ chrome: "running" }));
		observer.observe(other, evidence({ pane: "unreachable" }));
		at = 4_000;
		expect(observer.observe(other, evidence({ pane: "unreachable" }))).toBe("unknown");
		expect(observer.observe(target, evidence())).toBe("running");
		observer.clear(target.sessionId);
		expect(observer.observe(target, evidence({ pane: "unreachable" }))).toBe("unknown");
		expect(observer.observe(target, evidence({ pane: "absent" }))).toBe("error");
	});

	it("uses the registered adapter's hook capability and defaults unknown adapters to false", () => {
		const observer = createActivityObserver();
		expect(observer.observe(target, evidence({ hook: { status: "idle", ageMs: 0 } }))).toBe("idle");
		expect(
			observer.observe(
				{ ...target, sessionId: "unknown-adapter", bootstrap: "missing-adapter" },
				evidence({ hook: { status: "idle", ageMs: 0 } }),
			),
		).toBe("unknown");
	});
});
