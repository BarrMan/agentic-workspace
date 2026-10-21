import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Session, type SessionRuntime } from "../model/session/session.ts";
import type {
	RunningExecution,
	RunningExecutionEvent,
	SessionFactory,
	SessionLaunchContext,
} from "../model/session/types.ts";
import { initializeAgentConfiguration, loadAgentConfiguration, upsertAgentConfiguration } from "../storage/config.ts";
import { Storage } from "../storage/storage.ts";
import { initializeTestProject } from "../test/test-utils.ts";
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
			return "live";
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
		return new Session(record, modeId, runtime);
	};
	return {
		factory,
		starts: () => starts,
		stopped,
		stopErrorFor,
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
		await application.forgetTaskSessions(task.id);
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
