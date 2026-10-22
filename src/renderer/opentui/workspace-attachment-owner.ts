import type { AgentSession } from "../../model/session/types.ts";
import type { OpenTuiWorkspaceLiveAgent } from "./workspace.ts";
import type { createWorkspaceAgentHostOwner } from "./workspace-agent-host-owner.ts";

export type RetainedWorkspaceAgent = OpenTuiWorkspaceLiveAgent & {
	origin?: { record: AgentSession; paneId: string };
	hostOwner?: ReturnType<typeof createWorkspaceAgentHostOwner>;
};

export type PendingAgentLaunch = {
	taskId: string;
	invalidated: boolean;
	pending?: Promise<unknown>;
};

type History = Parameters<NonNullable<RetainedWorkspaceAgent["hostOwner"]>["detachAndDestroy"]>[1];

/** Owns local attachments and every asynchronous operation that can publish one. */
export class WorkspaceAttachmentOwner {
	readonly #agents = new Map<
		string,
		{ agent: RetainedWorkspaceAgent; detach?: (history?: History) => Promise<unknown> }
	>();
	#state: "admitted" | "closing" | "closed" = "admitted";
	readonly #sessions = new Set<string>();
	readonly #launches = new Set<PendingAgentLaunch>();
	readonly #work = new Set<Promise<unknown>>();

	get hasPending(): boolean {
		return this.#work.size > 0;
	}

	agent(id: string): RetainedWorkspaceAgent | undefined {
		return this.#agents.get(id)?.agent;
	}

	hasAgent(id: string): boolean {
		return this.#agents.has(id);
	}

	retain(id: string, agent: RetainedWorkspaceAgent): void {
		const entry = this.#agents.get(id);
		if (entry) {
			entry.agent.label = agent.label;
			entry.agent.status = agent.status;
			entry.agent.error = agent.error;
			return;
		}
		this.#agents.set(id, { agent });
	}

	agents(): [string, RetainedWorkspaceAgent][] {
		return [...this.#agents].map(([id, { agent }]) => [id, agent]);
	}

	async shutdown(stop: () => Promise<void>): Promise<void> {
		if (this.#state !== "admitted") return;
		this.#state = "closing";
		const failures: unknown[] = [];
		try {
			await this.#settlePending();
		} catch (error) {
			failures.push(error);
		}
		try {
			await stop();
		} catch (error) {
			failures.push(error);
		}
		if (failures.length) {
			if (this.#state === "closing") this.#state = "admitted";
			throw new AggregateError(failures, failures.map(String).join("; "));
		}
	}

	close(): void {
		this.#state = "closed";
	}

	isPendingSession(id: string): boolean {
		return this.#sessions.has(id);
	}

	async attach(
		launch: PendingAgentLaunch,
		id: string,
		agent: RetainedWorkspaceAgent,
		start: () => Promise<void>,
		detach: (history?: History) => Promise<unknown>,
	): Promise<boolean> {
		this.#agents.set(id, { agent, detach });
		try {
			await start();
		} catch (error) {
			try {
				await this.releaseAgent(id);
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					`Agent launch and attachment cleanup failed: ${String(error)}; ${String(cleanupError)}`,
					{ cause: error },
				);
			}
			throw error;
		}
		if (launch.invalidated) {
			await this.releaseAgent(id);
			return false;
		}
		return true;
	}

	track<T>(work: Promise<T>): Promise<T> {
		this.#work.add(work);
		void work.finally(() => this.#work.delete(work)).catch(() => undefined);
		return work;
	}

	launch<T>(
		taskId: string,
		perform: (launch: PendingAgentLaunch) => Promise<T>,
		sessionId?: string,
	): Promise<T | false> {
		if (this.#state !== "admitted" || (sessionId && this.#sessions.has(sessionId))) return Promise.resolve(false);
		if (sessionId) this.#sessions.add(sessionId);
		const launch: PendingAgentLaunch = { taskId, invalidated: false };
		this.#launches.add(launch);
		const pending = this.track(
			perform(launch).finally(() => {
				this.#launches.delete(launch);
				if (sessionId) this.#sessions.delete(sessionId);
			}),
		);
		launch.pending = pending;
		return pending;
	}

	async removeTask(
		taskId: string,
		history: (id: string) => History,
	): Promise<{ released: string[]; failures: unknown[] }> {
		const launches = [...this.#launches].filter((launch) => launch.taskId === taskId);
		for (const launch of launches) launch.invalidated = true;
		const failures = await this.#settle(launches.flatMap((launch) => (launch.pending ? [launch.pending] : [])));
		const released: string[] = [];
		await Promise.all(
			this.agents()
				.filter(([, agent]) => agent.taskId === taskId)
				.map(async ([id]) => {
					try {
						await this.releaseAgent(id, history(id));
						released.push(id);
					} catch (error) {
						failures.push(error);
					}
				}),
		);
		return { released, failures };
	}

	async #settlePending(): Promise<void> {
		const failures: unknown[] = [];
		while (this.#work.size) failures.push(...(await this.#settle([...this.#work])));
		if (failures.length) throw new AggregateError(failures, failures.map(String).join("; "));
	}

	async #settle(work: Promise<unknown>[]): Promise<unknown[]> {
		return (await Promise.allSettled(work)).flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
	}

	async releaseAgent(id: string, history?: History): Promise<void> {
		const entry = this.#agents.get(id);
		if (!entry) return;
		try {
			if (entry.detach) await entry.detach(history);
			else await entry.agent.hostOwner?.detachAndDestroy(entry.agent.terminal, history);
			if (this.#agents.get(id) === entry) this.#agents.delete(id);
		} finally {
			entry.agent.terminal?.destroy();
		}
	}

	async release(history: (id: string) => History): Promise<unknown[]> {
		this.close();
		const failures: unknown[] = [];
		try {
			await this.#settlePending();
		} catch (error) {
			failures.push(error);
		}
		const results = await Promise.all(
			[...this.#agents.keys()].map(async (id) => {
				try {
					await this.releaseAgent(id, history(id));
					return undefined;
				} catch (error) {
					return error;
				}
			}),
		);
		return [...failures, ...results.filter((error) => error !== undefined)];
	}
}
