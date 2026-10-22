import { watch } from "node:fs";
import { dirname } from "node:path";
import { resolveSessionPreset } from "../../controller/agent-configuration.ts";
import type { Core } from "../../controller/agentic-workspace.ts";
import type { WorkspaceStateService } from "../../controller/workspace-state.ts";
import type { SessionRuntime } from "../../model/session/session.ts";
import {
	type ActivityMetadata,
	type AgentActivity,
	type AgentIndication,
	type AgentSession,
	activityToIndication,
	type SessionSnapshot,
	type TaskSessions,
} from "../../model/session/types.ts";
import { type ActivityHistory, createActivityObserver } from "../../runtime/activity-observer.ts";
import type { ActivityProbe, ActivityProbeEvidence, ActivityProbeTarget } from "../../runtime/agent-status-probe.ts";
import type { TmuxResult } from "../../runtime/live/tmux/types.ts";
import { sessionActivityDir } from "../../runtime/status-hooks.ts";

export type AgentActivityTarget = {
	readonly taskId: string;
	readonly bootstrap: string;
	readonly statusDir: string | undefined;
	readonly attached: boolean;
	readonly supervised?: boolean;
	readonly createdAt: string;
	readonly exec: (argv: readonly string[]) => Promise<TmuxResult>;
	readonly target: string;
	readonly read?: () => ActivityMetadata | undefined;
};

/** A transient overlay can refine, but never invent, the selected-mode active-session dot. */
export function modeSessionIndication(snapshot: SessionSnapshot | undefined): AgentIndication | undefined {
	if (!snapshot) return undefined;
	if (snapshot.state === "stopped") return "ended";
	return activityToIndication(snapshot.activity);
}

/** Private to the session workflow: observations, sidecar watches, and adaptive polling. */
export class WorkspaceSessionMonitor {
	#closed = false;
	#probe: ActivityProbe | undefined;
	#timer: ReturnType<typeof setTimeout> | undefined;
	#livenessTimer: ReturnType<typeof setTimeout> | undefined;
	#polling = false;
	#inventory: ReadonlyMap<string, TaskSessions> | undefined;
	readonly #snapshots = new Map<string, SessionSnapshot>();
	readonly #activity = new Map<string, { activity: AgentActivity; taskId: string }>();
	readonly #observer = createActivityObserver();
	readonly #targets = new Map<string, AgentActivityTarget>();
	readonly #watchers = new Map<string, { close(): void }>();

	constructor(
		private readonly core: Core,
		private readonly workspace: WorkspaceStateService,
		private readonly sessionRuntime: SessionRuntime | undefined,
		private readonly createProbe: () => ActivityProbe,
		private readonly operations: { paused(): boolean; changed(): void; refresh(): Promise<void> },
		private readonly intervalMs?: number,
	) {}

	async start(): Promise<void> {
		if (this.#closed) return;
		this.#probe = this.createProbe();
		this.#schedule(0);
		await this.#pollLiveness(true);
	}

	get interval(): number {
		if (this.intervalMs !== undefined) return this.intervalMs;
		let hasAttachedOnly = false;
		for (const target of this.#targets.values()) {
			if (target.statusDir !== undefined) continue;
			if (!target.attached) return 500;
			hasAttachedOnly = true;
		}
		return hasAttachedOnly ? 1_000 : 30_000;
	}

	async refresh(inventory?: ReadonlyMap<string, TaskSessions>): Promise<void> {
		if (inventory) this.#inventory = inventory;
		const observed = await this.workspace.sessionApplication.projectInventory();
		if (this.#closed) return;
		this.#snapshots.clear();
		for (const { sessions } of observed) {
			for (const { record, snapshot } of sessions) this.#snapshots.set(record.id, snapshot);
		}
	}

	observed(id: string): SessionSnapshot | undefined {
		return this.#snapshots.get(id);
	}

	get hasWorkingSessions(): boolean {
		return [...this.#snapshots.values()].some(
			(snapshot) => snapshot.state === "running" && snapshot.activity === "working",
		);
	}

	indications(activeSessions: ReadonlyMap<string, AgentSession>): Map<string, AgentIndication> {
		const indications = new Map<string, AgentIndication>();
		for (const [taskId, active] of activeSessions) {
			const snapshot = this.#snapshots.get(active.id);
			const indication = modeSessionIndication(snapshot);
			if (indication) indications.set(taskId, indication);
		}
		return indications;
	}

	history(id: string): ActivityHistory | undefined {
		return this.#observer.snapshot(id);
	}

	#schedule(delay: number): void {
		if (this.#closed) return;
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			void this.#poll();
		}, delay);
	}

	async #pollLiveness(discoverOnly = false): Promise<void> {
		if (this.#closed) return;
		try {
			if (this.#inventory) {
				await this.refresh();
				let settled = false;
				for (const [taskId, taskSessions] of this.#inventory) {
					for (const active of taskSessions.sessions) {
						if ((active as AgentSession & { ownerScope?: string }).ownerScope === "foreign") continue;
						const observed = this.#snapshots.get(active.id);
						if (discoverOnly && (observed?.state !== "running" || !active.nativeWorkspace)) continue;
						if (observed?.state !== "starting" && observed?.state !== "running") continue;
						if (this.#targets.has(active.id) && !this.#targets.get(active.id)?.supervised) continue;
						try {
							const live = await this.workspace.sessionApplication.readObserved(taskId, active.id);
							if (this.#closed) return;
							if (
								live.snapshot.state !== "running" &&
								live.snapshot.state !== "starting" &&
								live.snapshot.state !== "parked"
							) {
								this.forget(active.id);
								settled = true;
							} else if (!this.#targets.has(active.id) && this.sessionRuntime) {
								const target = await this.sessionRuntime.attach(live.record);
								const bootstrap = target.bootstrap || (await resolveSessionPreset(this.core, active)).bootstrap;
								if (this.#closed) return;
								this.track(active.id, {
									taskId,
									bootstrap,
									statusDir: sessionActivityDir(dirname(active.outputPath), active.id),
									attached: true,
									supervised: false,
									createdAt: active.createdAt,
									exec: (argv) => target.exec.run(argv),
									target: target.paneId,
								});
							}
						} catch {
							// Uncertain liveness must not block discovery of another task's live work.
						}
					}
				}
				if (settled) void this.operations.refresh();
			}
		} catch {
			// The liveness backstop is best-effort; the next tick retries.
		} finally {
			if (!this.#closed) this.#livenessTimer = setTimeout(() => void this.#pollLiveness(), 30_000);
		}
	}

	async #poll(): Promise<void> {
		if (this.#closed || !this.#probe || this.#polling) return;
		this.#polling = true;
		try {
			if (this.operations.paused()) return;
			const targets: ActivityProbeTarget[] = [...this.#targets].map(([sessionId, target]) => ({
				sessionId,
				bootstrap: target.bootstrap,
				statusDir: target.statusDir,
				exec: target.exec,
				target: target.target,
				read: target.read,
			}));
			if (!targets.length) return;
			let evidence: Map<string, ActivityProbeEvidence>;
			try {
				evidence = await this.#probe.probe(targets);
			} catch {
				evidence = new Map();
			}
			if (this.#closed) return;
			let changed = false;
			for (const id of this.#activity.keys()) {
				if (!this.#targets.has(id)) {
					this.#activity.delete(id);
					changed = true;
				}
			}
			for (const [sessionId, target] of this.#targets) {
				const measured = evidence.get(sessionId);
				if (!measured) continue;
				const activity = this.#observer.observe({ sessionId, bootstrap: target.bootstrap }, measured);
				if (this.#activity.get(sessionId)?.activity !== activity) changed = true;
				this.#activity.set(sessionId, { activity, taskId: target.taskId });
			}
			if (changed) this.operations.changed();
		} finally {
			this.#polling = false;
			if (!this.#closed) this.#schedule(this.interval);
		}
	}

	track(id: string, target: AgentActivityTarget): void {
		if (this.#closed) return;
		this.#targets.set(id, target);
		if (target.statusDir && !this.#watchers.has(id)) {
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				const watcher = watch(target.statusDir, () => {
					clearTimeout(timer);
					timer = setTimeout(() => {
						timer = undefined;
						if (!this.#closed) void this.#poll();
					}, 10);
				});
				watcher.on("error", () => {});
				watcher.unref();
				this.#watchers.set(id, {
					close: () => {
						clearTimeout(timer);
						watcher.close();
					},
				});
			} catch {
				// Missing/unwatchable sidecars are covered by the polling backstop.
			}
		}
		this.#schedule(0);
	}

	forget(id: string): void {
		const watcher = this.#watchers.get(id);
		this.#watchers.delete(id);
		try {
			watcher?.close();
		} catch {
			// Best-effort watcher teardown.
		}
		const tracked = this.#targets.delete(id);
		this.#activity.delete(id);
		this.#observer.clear(id);
		if (tracked && !this.#closed) this.operations.changed();
	}

	dispose(): void {
		this.#closed = true;
		clearTimeout(this.#timer);
		clearTimeout(this.#livenessTimer);
		this.#probe = undefined;
		for (const watcher of this.#watchers.values()) {
			try {
				watcher.close();
			} catch {
				// Best-effort watcher teardown.
			}
		}
		this.#watchers.clear();
		this.#activity.clear();
		this.#targets.clear();
	}
}
