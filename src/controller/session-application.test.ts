import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Session, type SessionRuntime } from "../model/session/session.ts";
import type {
	RunningExecution,
	RunningExecutionEvent,
	SessionFactory,
	SessionLaunchContext,
} from "../model/session/types.ts";
import { Storage } from "../storage/storage.ts";
import { initGitRepo, initializeTestProject } from "../test/test-utils.ts";
import {
	initializeAgentConfiguration,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "./agent-configuration.ts";
import { Core } from "./agentic-workspace.ts";
import { SessionApplication } from "./session-application.ts";

const roots: string[] = [];
afterEach(
	async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))),
);

function controlledRuntime(
	beforeStart: (context: SessionLaunchContext) => Promise<void>,
	options: { resumeError?: Error } = {},
) {
	let starts = 0;
	const listeners = new Map<string, (event: RunningExecutionEvent) => void>();
	const stopped: string[] = [];
	const stopErrorFor = new Set<string>();
	const retained = { observation: "absent" as "absent" | "live" | "unknown" };
	const models = new Map<string, Session>();
	const execution = (context: SessionLaunchContext): RunningExecution => ({
		identity: {
			taskId: context.taskId,
			modeId: context.modeId,
			sessionId: context.sessionId,
			executionId: context.sessionId,
		},
		events: {
			turnCompleted: "supported",
			permissionWait: "supported",
			executionExit: "supported",
			activity: "supported",
		},
		async input() {},
		async sendKey() {},
		async stop() {},
		observe(listener) {
			listeners.set(context.sessionId, listener);
			return () => listeners.delete(context.sessionId);
		},
		teardownListeners() {},
	});
	const runtime: SessionRuntime = {
		async start(context) {
			await beforeStart(context);
			starts++;
			return execution(context);
		},
		async resume(_providerSessionId, context) {
			if (options.resumeError) throw options.resumeError;
			starts++;
			return execution(context);
		},
		async stop(current) {
			stopped.push(current.identity.sessionId);
			if (stopErrorFor.has(current.identity.sessionId)) throw new Error("eviction stop failed");
		},
		observe(current, listener) {
			listeners.set(current.identity.sessionId, listener);
			return () => listeners.delete(current.identity.sessionId);
		},
		async observeRetained() {
			return retained.observation;
		},
		async prepareStop(record) {
			return {
				stop: async () => {
					stopped.push(record.id);
					if (stopErrorFor.has(record.id)) throw new Error("prepared stop failed");
				},
			};
		},
		async attach() {
			throw new Error("unused");
		},
		async detach() {},
		async ask() {
			return { answer: "answer" };
		},
	};
	const factory: SessionFactory = (_taskId, modeId, record) => {
		if (!record) throw new Error("Expected durable record.");
		const session = new Session(record, modeId, runtime);
		models.set(record.id, session);
		return session;
	};
	return {
		factory,
		runtime,
		starts: () => starts,
		stopped,
		stopErrorFor,
		retained,
		models,
		emit(sessionId: string, activity: RunningExecutionEvent["activity"], observedAt: number) {
			listeners.get(sessionId)?.({ kind: "activity", activity, observedAt });
		},
	};
}

async function fixture(options: { startError?: Error; resumeError?: Error; maxSessions?: number } = {}) {
	const root = await mkdtemp(join(tmpdir(), "session-application-"));
	roots.push(root);
	const core = new Core(root);
	await initializeTestProject(core, "Session application");
	const { task } = await core.createTaskFromInput({ title: "Application task", status: "To Do" });
	await initializeAgentConfiguration(core, "project");
	const config = await loadAgentConfiguration(core, "project");
	if (!config) throw new Error("Expected initialized configuration.");
	await upsertAgentConfiguration(core, "project", {
		...config,
		selectedPreset: "test",
		presets: { test: { command: ["agent"], env: {}, prepare: "", bootstrap: "pi" } },
	});
	const storage = Storage.open(root);
	const store = storage.sessionStore();
	const controlled = controlledRuntime(
		async (context) => {
			const state = await store.read(context.taskId);
			expect(state.modes[context.modeId]?.sessions.some((session) => session.id === context.sessionId)).toBe(true);
			if (options.startError) throw options.startError;
		},
		{ resumeError: options.resumeError },
	);
	return {
		application: new SessionApplication(core, {
			storage,
			sessionFactory: controlled.factory,
			maxSessions: options.maxSessions,
		}),
		core,
		controlled,
		store,
		task,
	};
}

describe("SessionApplication", () => {
	it.each([
		false,
		true,
	])("preserves live membership, records and observers after mode move (other window: %s)", async (external) => {
		const { application, controlled, core, store, task } = await fixture();
		const start = controlled.runtime.start;
		controlled.runtime.start = async (context) => ({
			...(await start(context)),
			providerConversationId: `native-${context.sessionId}`,
		});
		const config = await loadAgentConfiguration(core, "project");
		if (!config?.modes) throw new Error("Missing modes");
		const source = config.modes.defaultModeId;
		const profile = config.modes.profiles[source];
		if (!profile) throw new Error("Missing profile");
		await upsertAgentConfiguration(core, "project", {
			...config,
			modes: {
				...config.modes,
				order: [...config.modes.order, "destination"],
				profiles: { ...config.modes.profiles, destination: { ...profile, name: "Destination" } },
			},
		});
		const moved = await application.newSession(task.id, source);
		const retained = await application.newSession(task.id, "destination");
		const mover = external
			? new SessionApplication(core, { storage: Storage.open(core.projectRoot), sessionFactory: controlled.factory })
			: application;
		await mover.moveModeSessions(task.id, source, "destination");
		await application.readObserved(task.id, moved.record.id);
		await application.forgetModeSessions(task.id, source);
		const state = await store.read(task.id);
		expect(state.modes[source]).toBeUndefined();
		expect(state.modes.destination?.sessions.map(({ id }) => id)).toEqual([retained.record.id, moved.record.id]);
		expect(state.modes.destination?.activeSessionId).toBe(retained.record.id);
		expect(controlled.models.get(moved.record.id)?.modeId).toBe("destination");
		expect(controlled.models.get(moved.record.id)?.record).toEqual(moved.record);
		expect(state.modes.destination?.sessions.find(({ id }) => id === moved.record.id)).toEqual(moved.record);
		controlled.emit(moved.record.id, "idle", 10);
		expect((await application.readObserved(task.id, moved.record.id)).snapshot.activity).toBe("idle");
		expect((await application.attachmentContext(task.id, moved.record.id)).ownedByThisApplication).toBe(true);
		expect((await application.attachmentContext(task.id, retained.record.id)).ownedByThisApplication).toBe(true);
		expect(controlled.stopped).toEqual([]);
	});

	it("creates and reuses the captured task worktree before launch", async () => {
		const { application, core, task } = await fixture();
		const previous = process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
		const home = await mkdtemp(join(tmpdir(), "session-worktrees-"));
		roots.push(home);
		process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = home;
		try {
			initGitRepo(core.projectRoot, "main");
			const commit = Bun.spawn(
				[
					"git",
					"-C",
					core.projectRoot,
					"-c",
					"user.name=Fixture",
					"-c",
					"user.email=fixture@example.test",
					"commit",
					"--allow-empty",
					"-m",
					"fixture",
				],
				{ stdout: "ignore", stderr: "pipe" },
			);
			const [error, code] = await Promise.all([new Response(commit.stderr).text(), commit.exited]);
			if (code !== 0) throw new Error(error);
			const current = await core.loadTaskForMutation(task.id);
			if (!current) throw new Error("Missing task");
			await core.updateTask({ ...current, worktreePolicy: "enabled" });
			const first = await application.newSession(task.id);
			const second = await application.newSession(task.id);
			expect(first.record.cwd).not.toBe(core.projectRoot);
			expect(first.record.pathContext?.worktreeDir).toBe(first.record.cwd);
			expect(await realpath(second.record.cwd)).toBe(await realpath(first.record.cwd));
		} finally {
			if (previous === undefined) delete process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
			else process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = previous;
		}
	});
	it("refuses deletion and resume for live parked and unknown retained sessions", async () => {
		const { application, controlled, store, task } = await fixture();
		const created = await application.newSession(task.id);
		await application.stopSession(task.id, created.record.id);
		await store.mutate(task.id, async (state) => {
			for (const history of Object.values(state.modes))
				for (const record of history.sessions) record.nativeSessionId = "native";
		});
		for (const observation of ["live", "unknown"] as const) {
			controlled.retained.observation = observation;
			await expect(application.deleteSession(task.id, created.record.id)).rejects.toThrow("not positively absent");
			await expect(application.resumeSession(task.id, created.record.id)).rejects.toThrow("not positively stopped");
		}
		expect(controlled.starts()).toBe(1);
		expect(controlled.stopped).toEqual([created.record.id]);
	});

	it("retains failed-start tracking and captured identity until cleanup succeeds", async () => {
		const { application, controlled, store, task } = await fixture();
		let sessionId = "";
		let cleanupFails = true;
		controlled.runtime.start = async (context) => {
			sessionId = context.sessionId;
			const execution: RunningExecution = {
				identity: { taskId: task.id, modeId: context.modeId, sessionId, executionId: "attempt" },
				providerConversationId: "captured-native",
				events: {
					activity: "unsupported",
					turnCompleted: "unsupported",
					permissionWait: "unsupported",
					executionExit: "unsupported",
				},
				input: async () => {},
				sendKey: async () => {},
				observe: () => () => {},
				teardownListeners() {},
				stop: async () => {
					if (cleanupFails) throw new Error("cleanup uncertain");
				},
			};
			throw Object.assign(new Error("startup failed"), { execution });
		};
		controlled.runtime.stop = (execution) => execution.stop();
		await expect(application.newSession(task.id)).rejects.toThrow("reservation retained");
		const records = Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions);
		expect(records).toMatchObject([{ id: sessionId, nativeSessionId: "captured-native" }]);
		expect((await application.attachmentContext(task.id, sessionId)).ownedByThisApplication).toBe(true);
		cleanupFails = false;
		await application.stopSession(task.id, sessionId);
		expect((await application.readObserved(task.id, sessionId)).snapshot.state).toBe("stopped");
	});

	it("rolls back a recoverable failed launch after successful cleanup", async () => {
		const { application, controlled, store, task } = await fixture();
		const start = controlled.runtime.start;
		controlled.runtime.start = async (context) => {
			const execution = await start(context);
			throw Object.assign(new Error("startup failed"), { execution });
		};
		await expect(application.newSession(task.id)).rejects.toThrow("startup failed");
		expect(controlled.stopped).toHaveLength(1);
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(0);
	});

	it("keeps forced-deletion tracking when cleanup fails and removes only after successful cleanup", async () => {
		const { application, controlled, store, task } = await fixture();
		const created = await application.newSession(task.id);
		controlled.stopErrorFor.add(created.record.id);
		await expect(application.deleteSession(task.id, created.record.id, { force: true })).rejects.toThrow("stop failed");
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(1);
		controlled.stopErrorFor.clear();
		await application.deleteSession(task.id, created.record.id, { force: true });
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(0);
	});

	it("persists survivor selection after stop and preserves a nonactive selection", async () => {
		const { application, store, task } = await fixture();
		const first = await application.newSession(task.id);
		const second = await application.newSession(task.id);
		await application.stopSession(task.id, second.record.id);
		const history = Object.values((await store.read(task.id)).modes).find(({ sessions }) => sessions.length);
		expect(history?.activeSessionId).toBe(first.record.id);
		expect(history?.sessions).toHaveLength(2);
		await application.stopSession(task.id, second.record.id);
		expect(
			Object.values((await store.read(task.id)).modes).find(({ sessions }) => sessions.length)?.activeSessionId,
		).toBe(first.record.id);
	});

	it("waits for an admitted launch on shutdown, rejects new launches, and attempts all stops", async () => {
		const { application, controlled, task } = await fixture();
		const first = await application.newSession(task.id);
		controlled.stopErrorFor.add(first.record.id);
		const gate = Promise.withResolvers<void>();
		const entered = Promise.withResolvers<void>();
		const start = controlled.runtime.start;
		controlled.runtime.start = async (context) => {
			entered.resolve();
			await gate.promise;
			return start(context);
		};
		const pending = application.newSession(task.id);
		await entered.promise;
		const shutdown = application.shutdown();
		expect(application.shutdown()).toBe(shutdown);
		await expect(application.newSession(task.id)).rejects.toThrow("shutting down");
		gate.resolve();
		const second = await pending;
		await expect(shutdown).rejects.toThrow(`${task.id}/${first.record.id}`);
		await expect(shutdown).rejects.toThrow(`Completed stops: ${task.id}/${second.record.id}`);
		expect(controlled.stopped).toContain(first.record.id);
		expect(controlled.stopped).toContain(second.record.id);
		const third = await application.newSession(task.id);
		controlled.stopErrorFor.clear();
		await application.shutdown();
		expect(controlled.stopped.filter((id) => id === first.record.id)).toHaveLength(2);
		expect(controlled.stopped.filter((id) => id === second.record.id)).toHaveLength(1);
		expect(controlled.stopped).toContain(third.record.id);
	});

	it("uses positive cross-window idle evidence in the project-wide limit", async () => {
		const { application, controlled, core, task } = await fixture();
		const oldest = await application.newSession(task.id);
		controlled.retained.observation = "live";
		controlled.runtime.observeRetainedActivity = async (record) => ({
			state: "parked",
			activity: record.id === oldest.record.id ? "idle" : "unknown",
			idleSince: record.id === oldest.record.id ? 10 : null,
		});
		const other = new SessionApplication(core, {
			storage: Storage.open(core.projectRoot),
			sessionFactory: controlled.factory,
			maxSessions: 1,
		});
		await other.newSession(task.id);
		expect(controlled.stopped).toEqual([oldest.record.id]);
	});

	it("fails enabled worktree preparation before reserving instead of using the checkout", async () => {
		const { application, controlled, core, store, task } = await fixture();
		const current = await core.loadTaskForMutation(task.id);
		if (!current) throw new Error("Missing task");
		await core.updateTask({ ...current, worktreePolicy: "enabled" });
		await expect(application.newSession(task.id)).rejects.toThrow("Could not prepare task worktree at");
		expect(controlled.starts()).toBe(0);
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(0);
	});
	it("coordinates task status and persists the Task reservation before launch", async () => {
		const { application, core, controlled, task } = await fixture();
		const created = await application.newSession(task.id);
		expect(controlled.starts()).toBe(1);
		expect(created.snapshot.state).toBe("running");
		expect((await core.loadTaskById(task.id))?.status).not.toBe("To Do");
	});

	it("resumes the exact durable conversation without another reservation", async () => {
		const { application, store, task } = await fixture();
		const created = await application.newSession(task.id);
		await application.stopSession(task.id, created.record.id);
		await store.mutate(task.id, async (state) => {
			const record = Object.values(state.modes)
				.flatMap(({ sessions }) => sessions)
				.find((session) => session.id === created.record.id);
			if (!record) throw new Error("Expected session reservation.");
			record.nativeSessionId = "exact-native-id";
		});
		const resumed = await application.resumeSession(task.id, created.record.id);
		expect(resumed.record.id).toBe(created.record.id);
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toHaveLength(1);
	});

	it("enforces the session limit after resume without failing the resume", async () => {
		const { application, controlled, store, task } = await fixture({ maxSessions: 1 });
		const idle = await application.newSession(task.id);
		const resumedTarget = await application.newSession(task.id);
		await application.stopSession(task.id, resumedTarget.record.id);
		controlled.emit(idle.record.id, "idle", 10);
		await store.mutate(task.id, async (state) => {
			const record = Object.values(state.modes)
				.flatMap(({ sessions }) => sessions)
				.find((session) => session.id === resumedTarget.record.id);
			if (!record) throw new Error("Expected session reservation.");
			record.nativeSessionId = "exact-native-id";
		});
		await expect(application.resumeSession(task.id, resumedTarget.record.id)).resolves.toMatchObject({
			record: { id: resumedTarget.record.id },
		});
		expect(controlled.stopped).toContain(idle.record.id);
	});

	it("rolls back a pre-execution start failure instead of retaining a provisional session", async () => {
		const { application, store, task } = await fixture({ startError: new Error("pre-start failed") });
		await expect(application.newSession(task.id)).rejects.toThrow("pre-start failed");
		expect(Object.values((await store.read(task.id)).modes).flatMap((history) => history.sessions)).toEqual([]);
	});

	it("does not retain a local session when exact resume fails before execution", async () => {
		const { application, store, task } = await fixture({ resumeError: new Error("resume failed") });
		const created = await application.newSession(task.id);
		await store.mutate(task.id, async (state) => {
			const record = Object.values(state.modes)
				.flatMap(({ sessions }) => sessions)
				.find((session) => session.id === created.record.id);
			if (!record) throw new Error("Expected session reservation.");
			record.nativeSessionId = "exact-native-id";
		});
		await application.stopSession(task.id, created.record.id);
		await expect(application.resumeSession(task.id, created.record.id)).rejects.toThrow("resume failed");
		expect((await application.attachmentContext(task.id, created.record.id)).ownedByThisApplication).toBe(false);
	});

	it("does not stop sessions below the configured limit", async () => {
		const { application, controlled, task } = await fixture({ maxSessions: 2 });
		await application.newSession(task.id);
		expect(controlled.stopped).toEqual([]);
	});

	it("evicts the longest continuously idle session when over the limit", async () => {
		const { application, controlled, task } = await fixture({ maxSessions: 2 });
		const oldest = await application.newSession(task.id);
		controlled.emit(oldest.record.id, "idle", 10);
		const newer = await application.newSession(task.id);
		controlled.emit(newer.record.id, "idle", 20);
		await application.newSession(task.id);
		expect(controlled.stopped).toEqual([oldest.record.id]);
	});

	it("counts other-task sessions while never evicting the newly started session", async () => {
		const { application, controlled, core, task } = await fixture({ maxSessions: 1 });
		const existing = await application.newSession(task.id);
		controlled.emit(existing.record.id, "idle", 10);
		const { task: otherTask } = await core.createTaskFromInput({ title: "Other task", status: "To Do" });
		const created = await application.newSession(otherTask.id);
		expect(controlled.stopped).toEqual([existing.record.id]);
		expect(created.record.id).not.toBe(existing.record.id);
	});

	it("keeps working, permission-waiting, and unknown sessions when the limit is exceeded", async () => {
		const { application, controlled, task } = await fixture({ maxSessions: 3 });
		const waiting = await application.newSession(task.id);
		controlled.emit(waiting.record.id, "waiting", 10);
		const unknown = await application.newSession(task.id);
		controlled.emit(unknown.record.id, "unknown", 20);
		const created = await application.newSession(task.id);
		const extra = await application.newSession(task.id);
		expect(created.snapshot.state).toBe("running");
		expect(extra.snapshot.state).toBe("running");
		expect(controlled.stopped).toEqual([]);
	});

	it("reports an eviction failure while leaving the started session successful", async () => {
		const { application, controlled, task } = await fixture({ maxSessions: 1 });
		const idle = await application.newSession(task.id);
		controlled.emit(idle.record.id, "idle", 10);
		controlled.stopErrorFor.add(idle.record.id);
		const warning = console.warn;
		const warnings: unknown[][] = [];
		console.warn = (...args) => warnings.push(args);
		try {
			const created = await application.newSession(task.id);
			expect(created.snapshot.state).toBe("running");
		} finally {
			console.warn = warning;
		}
		expect(controlled.stopped).toEqual([idle.record.id]);
		expect(warnings[0]?.[0]).toBe(`Failed to evict idle session ${idle.record.id}:`);
	});
});
