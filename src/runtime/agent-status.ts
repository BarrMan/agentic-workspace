/**
 * Pure agent-activity resolver.
 *
 * This module mirrors the pinned AOE precedence table (`docs/aoe-status-tracking-plan.md` §3.2) and
 * its verbatim timing constants (`§0.3`). It has no I/O: it turns one observation into one derived
 * activity value, and it never calls a session service, never reconciles durable state, and never
 * kills a process. The thin tmux probe lives in `agent-status-probe.ts`.
 */

import type { AgentActivity, AgentSessionStatus } from "../model/session/types.ts";
import type { AgentChromeRule } from "./agents/agent.ts";
import type { HookStatus } from "./status-hooks.ts";

/** Timing constants copied verbatim from AOE (`§0.3`). All values are milliseconds. */
export const ACTIVITY_TIMING = {
	/** AOE rule 5e: a `running` hook write is fresh for 30 s. */
	freshRunningHookMs: 30_000,
	/** Orphan guard: a hook write older than 900 s is ignored regardless of its status. */
	hookOrphanCeilingMs: 900_000,
	/** AOE rule 3: an inconclusive tmux result is held 4 s before it becomes `unknown`. */
	unknownUnreachableUnconfirmedMs: 4_000,
	/** AOE rule 3: once a pane was confirmed alive, an inconclusive result is held 30 s. */
	unknownUnreachableConfirmedMs: 30_000,
	/** AOE `reference` §2.1: the batched snapshot is fresh for 2 s and refreshes at half-life. */
	snapshotTtlMs: 2_000,
} as const;

/** How the pane probe characterized the session's tmux pane this poll. */
export type PaneProbe = "alive" | "dead" | "absent" | "unreachable";

export interface ActivityObservation {
	/** Durable lifecycle status; rule 0 short-circuits on a terminal value. */
	readonly lifecycle: AgentSessionStatus;
	/** Whether this provider installs a process-scoped status hook (rules 5 and 7). */
	readonly hookBacked: boolean;
	/** The last hook write, with its age; `undefined` when no hook file exists. */
	readonly hook: { readonly status: HookStatus; readonly ageMs: number } | undefined;
	/** Whether a hook write has ever been observed for this session (rule 4 gate). */
	readonly hookSeen: boolean;
	/** Pane probe outcome (rule 3 and rule 4). */
	readonly pane: PaneProbe;
	/** Milliseconds the pane has been continuously `unreachable` (rule 3 window). */
	readonly unreachableMs: number;
	/** Whether a live pane was confirmed earlier in the current `unreachable` run. */
	readonly unreachableConfirmed: boolean;
	/** Pane/title chrome verdict from the provider rules (rule 8). */
	readonly chrome: AgentActivity | undefined;
	/** Whether the captured pane text is empty (gates the low-priority `waiting` hook rule). */
	readonly captureEmpty: boolean;
	/** Previous committed value, used when no rule matches (rule 9). */
	readonly previous: { readonly activity: AgentActivity } | undefined;
}

/** Rule 9: with no decisive evidence keep the last committed value, else `unknown` on cold attach. */
function keepPrevious(observation: ActivityObservation): AgentActivity {
	return observation.previous?.activity ?? "unknown";
}

/** Rule 7: evaluate the hook rules for a hook-backed provider, freshness- and orphan-gated. */
function hookVerdict(observation: ActivityObservation): AgentActivity | undefined {
	const hook = observation.hook;
	if (!hook) return undefined;
	// A write older than the orphan ceiling is not evidence for ANY status: a file orphaned by a
	// hard-killed session must read as absent, never as a live value.
	if (hook.ageMs >= ACTIVITY_TIMING.hookOrphanCeilingMs) return undefined;
	if (hook.status === "running") return hook.ageMs < ACTIVITY_TIMING.freshRunningHookMs ? "running" : undefined;
	if (hook.status === "idle") return "idle";
	if (hook.status === "error") return "error";
	// `waiting` is the lowest-priority hook rule and only fires on an empty capture (AOE issue #2937:
	// Esc cancels a prompt without a clearing hook).
	return observation.captureEmpty ? "waiting" : undefined;
}

/**
 * Whether the sidecar carries a `running` hook stale past freshness but not yet orphaned. Such a
 * write is not fresh enough to mean the agent is executing, yet too recent to be an abandoned file.
 */
function isStaleRunningHook(observation: ActivityObservation): boolean {
	const hook = observation.hook;
	return (
		hook !== undefined &&
		hook.status === "running" &&
		hook.ageMs >= ACTIVITY_TIMING.freshRunningHookMs &&
		hook.ageMs < ACTIVITY_TIMING.hookOrphanCeilingMs
	);
}

/**
 * Resolve one derived activity value. Pure; never throws for well-formed input.
 */
export function resolveAgentActivity(observation: ActivityObservation): AgentActivity {
	// Rule 0: terminal lifecycle short-circuits every other rule.
	if (observation.lifecycle === "stopped" || observation.lifecycle === "failed") return "stopped";

	// Rule 3: tmux absent is an error; an unreachable probe holds the current value for its window.
	if (observation.pane === "absent") return "error";
	if (observation.pane === "unreachable") {
		const window = observation.unreachableConfirmed
			? ACTIVITY_TIMING.unknownUnreachableConfirmedMs
			: ACTIVITY_TIMING.unknownUnreachableUnconfirmedMs;
		return observation.unreachableMs < window ? keepPrevious(observation) : "unknown";
	}

	// Rule 4: a dead pane outranks every rule below, but only for a session we have seen a hook for.
	if (observation.pane === "dead" && observation.hookSeen) return "error";

	// Rule 5b: configured per-agent rules — reserved, none today.

	// Rules 5c–5e: hook rules, hook-backed providers on a live pane only. The sidecar is ignored for
	// a dead pane, then rule 8 pane/title chrome fills the gap.
	const sidecarTrusted = observation.hookBacked && observation.pane === "alive";
	const candidate = (sidecarTrusted ? hookVerdict(observation) : undefined) ?? observation.chrome;

	// Rule 9: no rule matched → keep the last known value; a cold attach stays `unknown`.
	if (candidate !== undefined) return candidate;

	// A stale `running` hook is evidence the agent stopped executing; never hold the prior value
	// after it, or a parked agent would keep rendering green forever.
	if (sidecarTrusted && isStaleRunningHook(observation)) return "idle";
	return keepPrevious(observation);
}

/* ------------------------------------------------------------------------------------------------
 * Pane/title chrome rules — the manifest equivalent (§3.2 rule 8).
 * ---------------------------------------------------------------------------------------------- */

/** Rule 8: derive an activity from provider pane/title chrome text, or undefined when none matches. */
export function detectChromeActivity(rules: readonly AgentChromeRule[], capture: string): AgentActivity | undefined {
	for (const rule of rules) {
		if (rule.pattern.test(capture)) return rule.activity;
	}
	return undefined;
}

/* ------------------------------------------------------------------------------------------------
 * skip_capture gate (§3.3). Reusing it is what makes an idle agent cost zero tmux captures.
 * ---------------------------------------------------------------------------------------------- */

export interface SkipCaptureInput {
	/** Server-wide `#{window_activity}` second, from the batched probe. */
	readonly windowActivity: number;
	/** The `window_activity` second observed when the last capture was taken. */
	readonly lastActivity: number;
	/** The second at which the last capture was actually taken. */
	readonly lastCaptureSecond: number;
	/** Whether a fresh (`< 30 s`) hook write exists. */
	readonly hasFreshHook: boolean;
	/** Whether a pending proposal (rule 10 hold) is outstanding. */
	readonly hasPendingProposal: boolean;
}

/**
 * AOE's `skip_capture`: skip a capture only when the window has not moved since the last capture
 * *and* that capture came after the last activity second, with no fresh hook and no pending
 * proposal. A capture taken inside or before the activity second proves nothing, so it never skips.
 */
export function shouldSkipCapture(input: SkipCaptureInput): boolean {
	if (input.hasFreshHook || input.hasPendingProposal) return false;
	if (input.windowActivity !== input.lastActivity) return false;
	return input.lastCaptureSecond > input.windowActivity;
}
