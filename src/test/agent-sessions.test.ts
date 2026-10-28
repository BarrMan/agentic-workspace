import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	initializeAgentConfiguration,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "../controller/agent-configuration.ts";
import { Core } from "../controller/agentic-workspace.ts";
import type { SessionRuntime } from "../model/session/session.ts";
import { Session } from "../model/session/session.ts";
import type {
	AgentSession,
	PreparedSessionStop,
	RetainedSessionObservation,
	RunningExecution,
	SessionFactory,
	SessionLaunchContext,
	Unsubscribe,
} from "../model/session/types.ts";
import { Storage } from "../storage/storage.ts";
import { initializeTestProject } from "./test-utils.ts";

const roots: string[] = [];
afterEach(
	async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))),
);

function controlledRuntime(options: { stopError?: Error } = {}) {
	const executions = new Map<string, RunningExecution>();
	const runtime: SessionRuntime = {
		async start(context: SessionLaunchContext) {
			const execution: RunningExecution = {
				identity: {
					taskId: context.taskId,
					modeId: context.modeId,
					sessionId: context.sessionId,
					executionId: `execution-${context.sessionId}`,
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
				observe: () => () => {},
				teardownListeners() {},
			};
			executions.set(context.sessionId, execution);
			return execution;
		},
		async resume() {
			throw new Error("Unexpected resume");
		},
		async stop(execution) {
			if (options.stopError) throw options.stopError;
			executions.delete(execution.identity.sessionId);
		},
		observe(_execution, _listener): Unsubscribe {
			return () => {};
		},
		async attach() {
			throw new Error("Unexpected attachment");
		},
		async detach() {},
		async observeRetained(_record: Readonly<AgentSession>): Promise<RetainedSessionObservation> {
			return "absent";
		},
		async prepareStop(_record: Readonly<AgentSession>): Promise<PreparedSessionStop> {
			return { stop: async () => {} };
		},
		async ask() {
			return { answer: "answer" };
		},
	};
	return runtime;
}

async function fixture(runtime = controlledRuntime()) {
	const root = await mkdtemp(join(tmpdir(), "agent-sessions-"));
	roots.push(root);
	const sessionFactory: SessionFactory = (_taskId, modeId, record) => {
		if (!record) throw new Error("Expected durable session identity.");
		return new Session(record, modeId, runtime);
	};
	const storage = Storage.open(root);
	const core = new Core(root, { storage, sessionFactory });
	await initializeTestProject(core, "Agent sessions");
	const { task } = await core.createTaskFromInput({ title: "Session task", status: "To Do" });
	await initializeAgentConfiguration(core, "project");
	const config = await loadAgentConfiguration(core, "project");
	if (!config) throw new Error("Expected initialized configuration.");
	await upsertAgentConfiguration(core, "project", {
		...config,
		selectedPreset: "test",
		presets: { test: { command: ["agent"], env: {}, prepare: "", bootstrap: "pi" } },
	});
	return { application: core.sessionApplication, core, root, task, runtime, sessionFactory };
}

describe("consolidated session lifecycle", () => {
	it("reads current execution state separately from durable session identity", async () => {
		const { application, task } = await fixture();
		const started = await application.newSession(task);
		const observed = await application.readObserved(task.id, started.record.id);

		expect(observed.record.id).toBe(started.record.id);
		expect(observed.snapshot).toEqual({ state: "running", activity: "working", idleSince: null });
		expect(
			(await application.projectInventory()).flatMap((entry) => entry.sessions).map((entry) => entry.record.id),
		).toContain(started.record.id);
	});

	it("rolls back a clean failed creation without leaving a phantom observed session", async () => {
		const { application, task } = await fixture();
		const mutate = application.store.mutate.bind(application.store);
		let mutations = 0;
		application.store.mutate = (async (...args: Parameters<typeof mutate>) => {
			if (++mutations === 2) throw new Error("publication failed");
			return await mutate(...args);
		}) as typeof application.store.mutate;

		// SESSION-009, docs/specs/sessions.md:202-205: successful cleanup rolls back the provisional relationship.
		await expect(application.newSession(task)).rejects.toThrow("publication failed");
		expect(Object.values((await application.store.read(task.id)).modes).flatMap((history) => history.sessions)).toEqual(
			[],
		);
		await expect(application.readObserved(task.id, "missing-session")).rejects.toThrow("Agent session not found");
	});

	it("retains tracking and preserves the creation error when execution cleanup fails", async () => {
		const original = new Error("publication failed");
		const cleanup = new Error("cleanup failed");
		const { application, task } = await fixture(controlledRuntime({ stopError: cleanup }));
		const mutate = application.store.mutate.bind(application.store);
		let mutations = 0;
		application.store.mutate = (async (...args: Parameters<typeof mutate>) => {
			if (++mutations === 2) throw original;
			return await mutate(...args);
		}) as typeof application.store.mutate;

		// SESSION-009, docs/specs/sessions.md:203-205: retain tracking when cleanup fails and report both failures.
		let failure: unknown;
		try {
			await application.newSession(task);
		} catch (error) {
			failure = error;
		}
		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).cause).toBe(original);
		expect((failure as AggregateError).errors).toEqual([original, cleanup]);
		const retained = Object.values((await application.store.read(task.id)).modes).flatMap(
			(history) => history.sessions,
		);
		expect(retained).toHaveLength(1);
		expect((await application.readObserved(task.id, retained[0]!.id)).record.id).toBe(retained[0]!.id);
	});

	it("allows a start without stopping sessions when no positively idle candidate is established", async () => {
		const { application, task } = await fixture();
		const started = await application.newSession(task);
		// SESSION-012, docs/specs/sessions.md:261-264: starts are allowed and unknown/non-idle sessions are protected.
		expect(started.snapshot.activity).toBe("working");
		expect((await application.readObserved(task.id, started.record.id)).snapshot.state).toBe("running");
	});
});
