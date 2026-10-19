/**
 * Thin, stateful tmux/filesystem probe that feeds {@link resolveAgentActivity}.
 *
 * It owns no durable state and can mutate nothing: it reads the owned activity sidecar (a file
 * read, no fork) and one bounded tmux metadata/capture pair per session. The batched-metadata
 * cache honours AOE's 2 s snapshot TTL with a half-life refresh, so an idle agent costs zero tmux
 * calls on a cached tick.
 */

import { readFile, stat } from "node:fs/promises";
import type { ActivityMetadata, AgentActivity } from "../model/session/types.ts";
import { ACTIVITY_TIMING, detectChromeActivity, type PaneProbe, shouldSkipCapture } from "./agent-status.ts";
import type { AgentChromeRule } from "./agents/agent.ts";
import { agentFor } from "./agents/agents.ts";
import type { TmuxResult } from "./live/tmux/types.ts";
import { activityStatusPath, HOOK_STATUS_VALUES, type HookStatus } from "./status-hooks.ts";

export interface ActivityProbeTarget {
	readonly sessionId: string;
	/** Bootstrap type, used to pick the provider's pane/title chrome rules. */
	readonly bootstrap: string;
	/** Owned sidecar directory, when this launch is ours; attached external sessions have none. */
	readonly statusDir: string | undefined;
	/** Runs one tmux subcommand argv against this session's server. */
	readonly exec: (argv: readonly string[]) => Promise<TmuxResult>;
	/** tmux target string, e.g. `agent:0.0` or a pane id. */
	readonly target: string;
	/**
	 * Owned VT sessions already read `#{pane_dead} #{window_activity}` on their fused lease tick;
	 * when present this supplies the read with no fork. Absent for external sessions.
	 */
	readonly read?: () => ActivityMetadata | undefined;
	/** The resolver's pending-idle hold for this session, which makes `skip_capture` refuse to skip. */
	readonly pendingProposal?: boolean;
}

export interface ActivityProbeEvidence {
	readonly hook: { readonly status: HookStatus; readonly ageMs: number } | undefined;
	readonly pane: PaneProbe;
	readonly captureEmpty: boolean;
	readonly chrome: AgentActivity | undefined;
}

export interface ActivityProbe {
	probe(targets: readonly ActivityProbeTarget[]): Promise<Map<string, ActivityProbeEvidence>>;
}

function parseHookStatus(value: string): HookStatus | undefined {
	const trimmed = value.trim();
	return (HOOK_STATUS_VALUES as readonly string[]).includes(trimmed) ? (trimmed as HookStatus) : undefined;
}

/** Read the owned sidecar; a missing/unreadable file or an unknown value reads as absent. */
async function readHook(
	statusDir: string | undefined,
	now: number,
): Promise<{ status: HookStatus; ageMs: number } | undefined> {
	if (!statusDir) return undefined;
	const path = activityStatusPath(statusDir);
	try {
		const [value, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
		const status = parseHookStatus(value);
		if (!status) return undefined;
		return { status, ageMs: Math.max(0, now - info.mtimeMs) };
	} catch {
		return undefined;
	}
}

export function createActivityProbe(options: { now?: () => number } = {}): ActivityProbe {
	const now = options.now ?? (() => Date.now());
	const cache = new Map<
		string,
		{ at: number; pane: PaneProbe; captureEmpty: boolean; chrome: AgentActivity | undefined }
	>();
	/** Per-session `skip_capture` memory: the window second and capture second of the last capture. */
	const lastCapture = new Map<string, { activity: number; second: number }>();

	/** Read `#{pane_dead} #{window_activity}`, from the owned VT tick when available, else one fork. */
	async function readLiveMetadata(
		target: ActivityProbeTarget,
	): Promise<{ pane: PaneProbe; windowActivity: number } | undefined> {
		const shared = target.read?.();
		if (shared) return { pane: shared.paneDead ? "dead" : "alive", windowActivity: shared.windowActivity };
		const probe = await target.exec(["display-message", "-p", "-t", target.target, "#{pane_dead} #{window_activity}"]);
		if (probe.exitCode !== 0) return undefined;
		const [dead, activity] = probe.stdout.trim().split(/\s+/);
		return { pane: dead === "1" ? "dead" : "alive", windowActivity: Number(activity) || 0 };
	}

	async function metadata(
		target: ActivityProbeTarget,
		rules: readonly AgentChromeRule[] | undefined,
		hook: { readonly status: HookStatus; readonly ageMs: number } | undefined,
	): Promise<{ pane: PaneProbe; captureEmpty: boolean; chrome: AgentActivity | undefined }> {
		const cached = cache.get(target.sessionId);
		const at = now();
		if (cached && at - cached.at < ACTIVITY_TIMING.snapshotTtlMs / 2)
			return { pane: cached.pane, captureEmpty: cached.captureEmpty, chrome: cached.chrome };

		const live = await readLiveMetadata(target);
		if (live === undefined) {
			const unreachable = { at, pane: "unreachable" as const, captureEmpty: false, chrome: undefined };
			cache.set(target.sessionId, unreachable);
			return unreachable;
		}
		const { pane, windowActivity } = live;
		if (pane !== "alive" || !rules) {
			// No capture is taken, so the skip memory must not survive into a later live run.
			lastCapture.delete(target.sessionId);
			const result = {
				pane,
				captureEmpty: pane === "alive" ? (cached?.captureEmpty ?? true) : true,
				chrome: undefined,
			};
			cache.set(target.sessionId, { at, ...result });
			return result;
		}

		const previous = lastCapture.get(target.sessionId);
		const hasFreshHook = hook !== undefined && hook.ageMs < ACTIVITY_TIMING.freshRunningHookMs;
		const skip =
			previous !== undefined &&
			shouldSkipCapture({
				windowActivity,
				lastActivity: previous.activity,
				lastCaptureSecond: previous.second,
				hasFreshHook,
				hasPendingProposal: target.pendingProposal === true,
			});
		if (skip) {
			// The window has not moved since the last capture: keep its verdict, take no capture.
			const result = { pane, captureEmpty: cached?.captureEmpty ?? true, chrome: cached?.chrome };
			cache.set(target.sessionId, { at, ...result });
			return result;
		}

		const capture = await target.exec(["capture-pane", "-p", "-t", target.target]);
		const text = capture.exitCode === 0 ? capture.stdout : "";
		const captureEmpty = text.trim().length === 0;
		const chrome = detectChromeActivity(rules, text);
		lastCapture.set(target.sessionId, { activity: windowActivity, second: Math.floor(now() / 1000) });
		const result = { pane, captureEmpty, chrome };
		cache.set(target.sessionId, { at, ...result });
		return result;
	}

	return {
		async probe(targets: readonly ActivityProbeTarget[]): Promise<Map<string, ActivityProbeEvidence>> {
			const entries = await Promise.all(
				targets.map(async (target): Promise<[string, ActivityProbeEvidence]> => {
					const hook = await readHook(target.statusDir, now());
					const meta = await metadata(target, agentFor(target.bootstrap)?.chromeRules, hook);
					return [target.sessionId, { hook, pane: meta.pane, captureEmpty: meta.captureEmpty, chrome: meta.chrome }];
				}),
			);
			return new Map(entries);
		},
	};
}
