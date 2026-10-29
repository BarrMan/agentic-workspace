import { describe, expect, test } from "bun:test";
import type { SessionRuntime } from "./session.ts";
import { Session } from "./session.ts";
import type { AgentSession, RunningExecution, RunningExecutionEvent, SessionLaunchContext } from "./types.ts";

const record: AgentSession = {
	id: "app-id",
	taskId: "task",
	preset: "preset",
	tmuxName: "tmux",
	createdAt: "now",
	outputPath: "/tmp/out",
	bootstrapPath: "/tmp/bootstrap",
};

const context = { taskId: "task", modeId: "mode", sessionId: record.id, record } as SessionLaunchContext;

function execution(id: string, nativeId = id) {
	const observers = new Set<(event: RunningExecutionEvent) => void>();
	const calls = { stop: 0, teardown: 0 };
	const value: RunningExecution = {
		identity: { taskId: "task", modeId: "mode", sessionId: record.id, executionId: id, nativeSessionId: nativeId },
		providerConversationId: nativeId,
		events: {
			turnCompleted: "supported",
			permissionWait: "supported",
			executionExit: "supported",
			activity: "supported",
		},
		input: async () => {},
		sendKey: async () => {},
		stop: async () => void calls.stop++,
		observe: (listener) => {
			observers.add(listener);
			return () => observers.delete(listener);
		},
		teardownListeners: () => void calls.teardown++,
	};
	return {
		value,
		calls,
		emit: (event: Omit<RunningExecutionEvent, "observedAt"> & { observedAt?: number }) => {
			for (const observer of observers) observer({ ...event, observedAt: event.observedAt ?? 1 });
		},
		observerCount: () => observers.size,
	};
}

function runtime(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
	return {
		start: async () => {
			throw new Error("unused");
		},
		resume: async () => {
			throw new Error("unused");
		},
		stop: async (running) => running.stop(),
		observe: (running, listener) => running.observe(listener),
		observeRetained: async () => "absent",
		prepareStop: async () => ({ stop: async () => {} }),
		attach: async () => {
			throw new Error("unused");
		},
		detach: async () => {},
		ask: async () => ({ answer: "unused" }),
		...overrides,
	};
}

describe("Session", () => {
	test("keeps a recoverable failed execution without registering observers", async () => {
		const running = execution("failed", "captured");
		const failure = Object.assign(new Error("launch failed"), { execution: running.value });
		const session = new Session(
			record,
			"mode",
			runtime({
				start: async () => {
					throw failure;
				},
			}),
		);
		await expect(session.start(context)).rejects.toBe(failure);
		expect(session.execution).toBe(running.value);
		expect(session.record.nativeSessionId).toBe("captured");
		expect(session.view.state).toBe("unknown");
		expect(running.observerCount()).toBe(0);
		await session.stop();
	});

	test("moves membership without replacing execution or its observers", async () => {
		const running = execution("one");
		const session = new Session(record, "mode", runtime({ start: async () => running.value }));
		await session.start(context);
		session.moveToMode("destination");
		running.emit({ kind: "turn-completed", observedAt: 10 });
		expect(session.modeId).toBe("destination");
		expect(session.execution).toBe(running.value);
		expect(running.observerCount()).toBe(1);
		expect(session.view.activity).toBe("idle");
		expect(session.record.nativeSessionId).toBe("one");
		await session.stop();
	});
	test("owns the current execution and durable provider identity", async () => {
		const running = execution("one", "native-1");
		const session = new Session(record, "mode", runtime({ start: async () => running.value }));
		await session.start(context);
		expect(session.execution).toBe(running.value);
		expect(session.record).toEqual({ ...record, nativeSessionId: "native-1" });
		expect(session.view).toEqual({ state: "running", activity: "working", idleSince: null });
	});

	test("filters stale-incarnation events after execution replacement", async () => {
		const first = execution("first", "native-1");
		const second = execution("second", "native-1");
		const session = new Session(
			record,
			"mode",
			runtime({ start: async () => first.value, resume: async () => second.value }),
		);
		await session.start(context);
		await session.stop();
		await session.resume(context);
		first.emit({ kind: "execution-exit", exitCode: 1, observedAt: 2 });
		expect(session.execution).toBe(second.value);
		expect(session.view).toEqual({ state: "parked", activity: "unknown", idleSince: null });
	});

	test("keeps idleSince only through uninterrupted positive idle evidence", async () => {
		const running = execution("one");
		const session = new Session(record, "mode", runtime({ start: async () => running.value }));
		await session.start(context);
		running.emit({ kind: "turn-completed", observedAt: 10 });
		expect(session.view).toEqual({ state: "running", activity: "idle", idleSince: 10 });
		running.emit({ kind: "activity", activity: "idle", observedAt: 11 });
		expect(session.view.idleSince).toBe(10);
		for (const activity of ["running", "waiting", "unknown"] as const) {
			running.emit({ kind: "activity", activity, observedAt: 12 });
			expect(session.view.idleSince).toBeNull();
			running.emit({ kind: "turn-completed", observedAt: 13 });
		}
	});

	test("stops actual execution and exposes only an ephemeral stopped view", async () => {
		const running = execution("one");
		const session = new Session(record, "mode", runtime({ start: async () => running.value }));
		await session.start(context);
		await session.stop();
		expect(running.calls.stop).toBe(1);
		expect(running.observerCount()).toBe(0);
		expect(session.view).toEqual({ state: "stopped", activity: "unknown", idleSince: null });
		expect(session.record).toEqual({ ...record, nativeSessionId: "one" });
	});

	test("keeps retained absence, verified liveness, and unknown inspection distinct", async () => {
		let observation: "absent" | "live" | "unknown" = "absent";
		const session = new Session(record, "mode", runtime({ observeRetained: async () => observation }));
		await session.observeRetained();
		expect(session.view.state).toBe("stopped");
		expect(session.executionOwnership).toBe("none");
		observation = "live";
		await session.observeRetained();
		expect(session.view.state).toBe("parked");
		expect(session.executionOwnership).toBe("external");
		observation = "unknown";
		await session.observeRetained();
		expect(session.view.state).toBe("unknown");
		expect(session.executionOwnership).toBe("unknown");
	});

	test("prepares retained stop before applying the stopped view", async () => {
		let stops = 0;
		const session = new Session(
			record,
			"mode",
			runtime({ prepareStop: async () => ({ stop: async () => void stops++ }) }),
		);
		const prepared = await session.prepareStop();
		expect(session.view.state).toBe("stopped");
		await prepared.stop();
		expect(stops).toBe(1);
		expect(session.executionOwnership).toBe("none");
	});
});
