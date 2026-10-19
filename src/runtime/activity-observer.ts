import type { AgentActivity, AgentSessionStatus } from "../model/session/types.ts";
import { resolveAgentActivity } from "./agent-status.ts";
import type { ActivityProbeEvidence } from "./agent-status-probe.ts";
import { agentFor } from "./agents/agents.ts";

export interface ActivityObserverTarget {
	readonly sessionId: string;
	readonly bootstrap: string;
	readonly lifecycle: AgentSessionStatus;
}

export interface ActivityObserver {
	observe(target: ActivityObserverTarget, evidence: ActivityProbeEvidence): AgentActivity;
	clear(sessionId: string): void;
	snapshot(sessionId: string): ActivityHistory | undefined;
	seed(sessionId: string, history: ActivityHistory): void;
}

export interface ActivityHistory {
	readonly activity: AgentActivity;
	readonly hookSeen: boolean;
	readonly unreachableSince: number | undefined;
	readonly unreachableConfirmed: boolean;
}

/** Per-session observation history shared by attached and detached activity consumers. */
export function createActivityObserver(options: { now?: () => number } = {}): ActivityObserver {
	const now = options.now ?? (() => Date.now());
	const history = new Map<string, ActivityHistory>();
	return {
		observe(target, evidence) {
			const previous = history.get(target.sessionId);
			const at = now();
			const unreachableSince = evidence.pane === "unreachable" ? (previous?.unreachableSince ?? at) : undefined;
			const unreachableConfirmed = (previous?.unreachableConfirmed ?? false) || evidence.pane !== "unreachable";
			const hookSeen = (previous?.hookSeen ?? false) || evidence.hook !== undefined;
			const activity = resolveAgentActivity({
				lifecycle: target.lifecycle,
				hookBacked: agentFor(target.bootstrap)?.hookBacked ?? false,
				...evidence,
				hookSeen,
				unreachableMs: unreachableSince !== undefined ? at - unreachableSince : 0,
				unreachableConfirmed,
				previous: previous ? { activity: previous.activity } : undefined,
			});
			history.set(target.sessionId, { activity, hookSeen, unreachableSince, unreachableConfirmed });
			return activity;
		},
		clear(sessionId) {
			history.delete(sessionId);
		},
		snapshot(sessionId) {
			const value = history.get(sessionId);
			return value ? { ...value } : undefined;
		},
		seed(sessionId, value) {
			if (
				!value ||
				!["starting", "running", "waiting", "idle", "unknown", "error", "stopped"].includes(value.activity) ||
				typeof value.hookSeen !== "boolean" ||
				typeof value.unreachableConfirmed !== "boolean" ||
				(value.unreachableSince !== undefined &&
					(!Number.isFinite(value.unreachableSince) || value.unreachableSince < 0))
			)
				throw new Error("Invalid activity history.");
			history.set(sessionId, {
				activity: value.activity,
				hookSeen: value.hookSeen,
				unreachableSince: value.unreachableSince,
				unreachableConfirmed: value.unreachableConfirmed,
			});
		},
	};
}
