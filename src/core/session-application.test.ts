import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import lockfile from "proper-lockfile";
import { initializeAgentConfiguration, upsertAgentConfiguration } from "../agent-workspace/config.ts";
import type { HarnessProvider, RunningExecution, SessionLaunchContext } from "../agent-workspace/harness.ts";
import { BunRunner } from "../agent-workspace/session-process.ts";
import { SessionMutationError, type SessionState, SessionStore } from "../agent-workspace/session-store.ts";
import { initializeTestProject } from "../test/test-utils.ts";
import { Core } from "./agentic-workspace.ts";
import { SessionApplication } from "./session-application.ts";

class TrackingStore extends SessionStore {
	mutating = false;
	writes = 0;
	failWrites = new Set<number>();

	override async mutate<T>(taskId: string, fn: (state: SessionState) => Promise<T>): Promise<T> {
		return await super.mutate(taskId, async (state) => {
			this.mutating = true;
			try {
				return await fn(state);
			} finally {
				this.mutating = false;
			}
		});
	}

	override async write(path: string, content: string): Promise<void> {
		this.writes++;
		if (this.failWrites.has(this.writes)) throw new Error(`write ${this.writes} failed`);
		await super.write(path, content);
	}
}

class Runtime implements RunningExecution {
	readonly identity;
	readonly events = {
		turnCompleted: "unsupported",
		permissionWait: "unsupported",
		executionExit: "supported",
		activity: "unsupported",
	} as const;
	private listeners = new Set<(event: never) => void>();
	stopError?: Error;
	stops = 0;
	constructor(context: SessionLaunchContext, suffix: string) {
		this.identity = {
			taskId: context.taskId,
			modeId: context.modeId,
			sessionId: context.sessionId,
			executionId: suffix,
		};
	}
	async input(): Promise<void> {}
	async sendKey(): Promise<void> {}
	async stop(): Promise<void> {
		this.stops++;
		if (this.stopError) throw this.stopError;
	}
	observe(listener: (event: never) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	teardownListeners(): void {
		this.listeners.clear();
	}
	exit(): void {
		for (const listener of this.listeners) listener({ kind: "execution-exit", exitCode: 0 } as never);
	}
}

class Provider implements HarnessProvider {
	calls = 0;
	lastExecution?: Runtime;
	constructor(
		readonly store: TrackingStore,
		private readonly fail?: Error,
		private readonly beforeLaunch?: (context: SessionLaunchContext) => Promise<void>,
	) {}
	async launch(context: SessionLaunchContext): Promise<RunningExecution> {
		this.calls++;
		if (this.store.mutating) throw new Error("provider called during mutation");
		const durable = await this.store.read(context.taskId);
		if (!durable.modes[context.modeId]?.sessions.some(({ id }) => id === context.sessionId))
			throw new Error("startup preceded durable reservation");
		await this.beforeLaunch?.(context);
		if (this.fail) {
			throw this.fail;
		}
		const execution = new Runtime(context, `execution-${this.calls}`);
		this.lastExecution = execution;
		return execution;
	}
	async resume(_nativeId: string, context: SessionLaunchContext): Promise<RunningExecution> {
		this.calls++;
		if (this.store.mutating) throw new Error("provider called during mutation");
		const execution = new Runtime(context, `execution-${this.calls}`);
		this.lastExecution = execution;
		return execution;
	}
}

const roots: string[] = [];
afterEach(
	async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))),
);

async function fixture(providerFailure?: Error, beforeFailure?: (context: SessionLaunchContext) => Promise<void>) {
	const root = await mkdtemp(join(tmpdir(), "session-application-"));
	roots.push(root);
	const core = new Core(root);
	await initializeTestProject(core, "Session application");
	const { task } = await core.createTaskFromInput({ title: "Application task", status: "To Do" });
	await initializeAgentConfiguration(core, "project");
	const loaded = (await import("../agent-workspace/config.ts")).loadAgentConfiguration;
	const config = await loaded(core, "project");
	if (!config?.modes) throw new Error("Expected initialized project mode catalog");
	await upsertAgentConfiguration(core, "project", {
		...config,
		selectedPreset: "test",
		presets: { test: { command: "agent {prompt} {skill}", env: {}, prepare: "", bootstrap: "pi" } },
	});
	const store = new TrackingStore(root, new BunRunner());
	const provider = new Provider(store, providerFailure, beforeFailure);
	const application = new SessionApplication(core, { store, harness: provider });
	return { core, store, provider, application, task };
}

describe("SessionApplication", () => {
	it("publishes one Task-owned reservation before startup through real models and store", async () => {
		const { store, provider, application, task } = await fixture();
		const session = await application.newSession(task.id);
		const reloaded = await store.read(task.id);
		const published = Object.values(reloaded.modes)
			.flatMap(({ sessions }) => sessions)
			.filter(({ id }) => id === session.id);
		expect(provider.calls).toBe(1);
		expect(published).toHaveLength(1);
		expect(published[0]?.status).toBe("running");
		expect(published[0]?.nativeWorkspace).toBe(true);
		expect(reloaded.sessions).toEqual(reloaded.modes[reloaded.legacyModeId]?.sessions ?? []);
		expect(reloaded.activeSessionId).toBe(reloaded.modes[reloaded.legacyModeId]?.activeSessionId);
	});

	it("hydrates a fresh Task for rollback and rejects a replaced incarnation", async () => {
		const { core, store, application, task } = await fixture(new Error("provider startup failed"));
		await expect(application.newSession(task.id)).rejects.toThrow("provider startup failed");
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(0);
		const replacementProvider = new Provider(store, undefined, async (context) => {
			await store.mutate(context.taskId, async (state) => {
				const history = state.modes[context.modeId];
				const provisional = history?.sessions.find(({ id }) => id === context.sessionId);
				if (!history || !provisional) throw new Error("Expected durable provisional membership");
				provisional.createdAt = "2099-01-01T00:00:00.000Z";
			});
		});
		const replacedApplication = new SessionApplication(core, { store, harness: replacementProvider });
		await expect(replacedApplication.newSession(task.id)).rejects.toBeInstanceOf(AggregateError);
		const persisted = Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions);
		expect(persisted).toHaveLength(1);
		expect(persisted[0]?.createdAt).toBe("2099-01-01T00:00:00.000Z");
	});

	it("attempts execution cleanup and full rollback after the final durable write fails", async () => {
		const { store, provider, application, task } = await fixture();
		store.failWrites.add(3);
		await expect(application.newSession(task.id)).rejects.toThrow(/write 3 failed/);
		expect(provider.lastExecution).toBeDefined();
		expect(provider.lastExecution?.stops).toBe(1);
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(0);
	});

	it("retains tracking when execution cleanup fails and reports rollback-write failure with the original error", async () => {
		const { core, store, provider, task } = await fixture();
		store.failWrites.add(3);
		const cleanupFailure = new Error("runtime cleanup failed");
		const customProvider: HarnessProvider = {
			launch: async (context) => {
				const execution = new Runtime(context, "cleanup");
				execution.stopError = cleanupFailure;
				return execution;
			},
			resume: async (nativeId, context) => await provider.resume(nativeId, context),
		};
		const cleanupApp = new SessionApplication(core, { store, harness: customProvider });
		await expect(cleanupApp.newSession(task.id)).rejects.toThrow(/cleanup failed/);
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(1);

		const rollbackStoreFixture = await fixture();
		rollbackStoreFixture.store.failWrites.add(3);
		rollbackStoreFixture.store.failWrites.add(4);
		const error = await rollbackStoreFixture.application
			.newSession(rollbackStoreFixture.task.id)
			.catch((cause) => cause);
		expect(error).toBeInstanceOf(AggregateError);
		expect((error as AggregateError).errors).toHaveLength(2);
		const failures = (error as AggregateError).errors.map((entry) => String(entry));
		expect(failures.some((message) => message.includes("write 3 failed"))).toBe(true);
		expect(failures.some((message) => message.includes("write 4 failed"))).toBe(true);
		expect(
			Object.values((await rollbackStoreFixture.store.read(rollbackStoreFixture.task.id)).modes).flatMap(
				({ sessions }) => sessions,
			),
		).toHaveLength(1);
	});

	it("distinguishes an unpublished flush from a committed write whose lock release failed", async () => {
		const { store, task } = await fixture();
		const noWrite = new Error("callback failed");
		const unpublished = await store
			.mutate(task.id, async () => {
				throw noWrite;
			})
			.catch((error) => error);
		expect(unpublished).toBe(noWrite);
		expect(unpublished).not.toBeInstanceOf(SessionMutationError);
		const originalLock = lockfile.lock;
		try {
			lockfile.lock = (async (...args: Parameters<typeof lockfile.lock>) => {
				const release = await originalLock(...args);
				return async () => {
					await release();
					throw new Error("release failed");
				};
			}) as typeof lockfile.lock;
			const committed = await store
				.mutate(task.id, async (state) => {
					state.hasSuccessfulSession = true;
				})
				.catch((error) => error);
			expect(committed).toBeInstanceOf(SessionMutationError);
			expect((committed as SessionMutationError).writeCommitted).toBe(true);
		} finally {
			lockfile.lock = originalLock;
		}
		expect((await store.read(task.id)).hasSuccessfulSession).toBe(true);
	});

	it("leaves selection alone when stopping a non-active record and chooses Task's survivor on explicit stop", async () => {
		const { application, store, task } = await fixture();
		const first = await application.newSession(task.id);
		await store.mutate(task.id, async (state) => {
			const history = Object.values(state.modes).find(({ sessions }) => sessions.some(({ id }) => id === first.id));
			const record = history?.sessions.find(({ id }) => id === first.id);
			if (record) record.status = "parked";
		});
		const second = await application.newSession(task.id);
		const before = await store.read(task.id);
		const selected = Object.values(before.modes).find(({ sessions }) =>
			sessions.some(({ id }) => id === second.id),
		)?.activeSessionId;
		await application.stopSession(task.id, first.id);
		expect(
			Object.values((await store.read(task.id)).modes).find(({ sessions }) =>
				sessions.some(({ id }) => id === second.id),
			)?.activeSessionId,
		).toBe(selected);
		await application.stopSession(task.id, second.id);
		expect(
			Object.values((await store.read(task.id)).modes).find(({ sessions }) =>
				sessions.some(({ id }) => id === first.id),
			)?.activeSessionId,
		).toBe(first.id);
	});

	it("rejects a delayed publication after concurrent deletion and clears resume terminal fields durably", async () => {
		const { application, store, provider, task } = await fixture();
		const current = await application.newSession(task.id);
		await store.mutate(task.id, async (state) => {
			const history = Object.values(state.modes).find(({ sessions }) => sessions.some(({ id }) => id === current.id));
			if (!history) throw new Error("Expected current record");
			const record = history.sessions.find(({ id }) => id === current.id);
			if (!record) throw new Error("Expected current record");
			record.status = "stopped";
			record.nativeSessionId = "native-exact";
			record.error = "old failure";
			record.endedAt = "2026-01-01T00:00:00.000Z";
		});
		await application.resumeSession(task.id, current.id);
		const reloaded = await store.read(task.id);
		const resumed = Object.values(reloaded.modes)
			.flatMap(({ sessions }) => sessions)
			.find(({ id }) => id === current.id);
		expect(resumed?.error).toBeUndefined();
		expect(resumed?.endedAt).toBeUndefined();
		expect(provider.calls).toBe(2);
		await store.mutate(task.id, async (state) => {
			for (const history of Object.values(state.modes)) {
				history.sessions = history.sessions.filter(({ id }) => id !== current.id);
				if (history.activeSessionId === current.id) history.activeSessionId = history.sessions[0]?.id;
			}
			state.sessions = [];
			state.activeSessionId = undefined;
		});
		await expect(application.stopSession(task.id, current.id)).rejects.toThrow();
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(0);
	});

	it("preserves exact-resume confirmation errors and rejects changed durable stop authority", async () => {
		const { application, store, provider, task } = await fixture();
		const current = await application.newSession(task.id);
		await store.mutate(task.id, async (state) => {
			const entry = Object.values(state.modes)
				.flatMap(({ sessions }) => sessions)
				.find(({ id }) => id === current.id);
			if (!entry) throw new Error("Expected session");
			entry.status = "stopped";
			entry.nativeSessionId = "native-exact";
			entry.resumeProbeFailed = { nativeProvider: "pi", nativeSessionId: "native-exact" };
		});
		await expect(application.resumeSession(task.id, current.id)).rejects.toMatchObject({
			name: "ExactResumeUnavailableError",
			reason: "previous-resume-failed",
		});
		await store.mutate(task.id, async (state) => {
			const entry = Object.values(state.modes)
				.flatMap(({ sessions }) => sessions)
				.find(({ id }) => id === current.id);
			if (!entry) throw new Error("Expected session");
			entry.resumeProbeFailed = undefined;
			entry.ownerPid = process.pid + 1;
		});
		await expect(application.stopSession(task.id, current.id)).rejects.toThrow(/authority changed/);
		expect(provider.lastExecution?.stops).toBe(0);
	});

	it("rejects a launch publication when durable owner authority changes under the store lock", async () => {
		const { core, store, task } = await fixture();
		const provider = new Provider(store, undefined, async (context) => {
			await store.mutate(context.taskId, async (state) => {
				const current = Object.values(state.modes)
					.flatMap(({ sessions }) => sessions)
					.find(({ id }) => id === context.sessionId);
				if (!current) throw new Error("Expected reserved session");
				current.ownerPid = process.pid + 1;
			});
		});
		const application = new SessionApplication(core, { store, harness: provider });
		await expect(application.newSession(task.id)).rejects.toThrow(/removed or replaced before publication/);
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(0);
	});

	it("retries a stopped lifecycle publication after its durable write fails", async () => {
		const { application, store, task } = await fixture();
		const session = await application.newSession(task.id);
		store.failWrites.add(store.writes + 1);
		await expect(application.stopSession(task.id, session.id)).rejects.toThrow(/write .* failed/);
		await application.stopSession(task.id, session.id);
		const persisted = Object.values((await store.read(task.id)).modes)
			.flatMap(({ sessions }) => sessions)
			.find(({ id }) => id === session.id);
		expect(persisted?.status).toBe("stopped");
		expect(persisted?.ownerPid).toBeUndefined();
	});

	it("explicitly stops and durably settles after the execution exit was observed", async () => {
		const { application, store, provider, task } = await fixture();
		const session = await application.newSession(task.id);
		provider.lastExecution?.exit();
		await application.stopSession(task.id, session.id);
		const persisted = Object.values((await store.read(task.id)).modes)
			.flatMap(({ sessions }) => sessions)
			.find(({ id }) => id === session.id);
		expect(persisted?.status).toBe("stopped");
		expect(persisted?.endedAt).toBeString();
	});

	it("uses the configured state root for application persistence", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-application-root-"));
		roots.push(root);
		const core = new Core(root);
		await initializeTestProject(core, "Pinned state root");
		const hash = createHash("sha256").update(root).digest("hex").slice(0, 16);
		const stateRoot = join(process.env.HOME ?? "/tmp", ".agentic-workspace", hash);
		const application = new SessionApplication(core, { stateRoot });
		expect(await application.store.stateRoot).toBe(stateRoot);
	});

	it("accepts the provider boundary option without leaking a second controller path", async () => {
		const { application, task } = await fixture();
		expect(application.compatibility).toBeInstanceOf(
			(await import("../agent-workspace/sessions.ts")).AgentSessionService,
		);
		expect(task.id).toBe("TASK-1");
	});
});
