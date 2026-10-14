import { describe, expect, test } from "bun:test";
import { Session } from "./session.ts";
import type {
	Harness,
	LifecycleCheckpoint,
	LifecycleCheckpointSink,
	RunningExecution,
	RunningExecutionEvent,
	SessionLaunchContext,
} from "./session-contracts.ts";
import { AGENT_SESSION_STATUS, type AgentSession } from "./types.ts";

const record: AgentSession = {
	id: "app-id",
	taskId: "task",
	preset: "preset",
	tmuxName: "tmux",
	cwd: "/tmp",
	createdAt: "now",
	status: AGENT_SESSION_STATUS.STARTING,
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
			permissionWait: "unsupported",
			executionExit: "supported",
			activity: "supported",
		},
		input: async () => {},
		stop: async () => {
			calls.stop++;
		},
		observe: (listener) => {
			observers.add(listener);
			return () => observers.delete(listener);
		},
		teardownListeners: () => {
			calls.teardown++;
		},
	};
	return {
		value,
		calls,
		emit(event: RunningExecutionEvent) {
			for (const observer of observers) observer(event);
		},
		observerCount: () => observers.size,
	};
}

function makeSession(harness: Harness, checkpoint: LifecycleCheckpointSink = async () => {}) {
	return new Session(record, harness, context, checkpoint);
}

describe("Session lifecycle", () => {
	test("start waits for readiness and required checkpoints", async () => {
		let ready!: (value: RunningExecution) => void;
		const launched = new Promise<RunningExecution>((resolve) => {
			ready = resolve;
		});
		const checkpoints: LifecycleCheckpoint["phase"][] = [];
		const session = makeSession(
			{
				launch: () => launched,
				resume: async () => {
					throw new Error("unused");
				},
			},
			async ({ phase }) => {
				checkpoints.push(phase);
			},
		);
		let settled = false;
		const starting = session.start().then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		const running = execution("exec");
		ready(running.value);
		await starting;
		expect(checkpoints).toEqual(["reservation", "identity", "ready"]);
		expect(session.execution).toBe(running.value);
	});

	test("a rejected checkpoint prevents launch and propagates", async () => {
		const failure = new Error("reservation failed");
		let launches = 0;
		const session = makeSession(
			{
				launch: async () => {
					launches++;
					return execution("x").value;
				},
				resume: async () => {
					throw new Error("unused");
				},
			},
			async () => {
				throw failure;
			},
		);
		await expect(session.start()).rejects.toBe(failure);
		expect(launches).toBe(0);
	});

	test("stop retains the conversation record and execution provenance", async () => {
		const running = execution("exec", "native-conversation");
		const session = makeSession({ launch: async () => running.value, resume: async () => running.value });
		await session.resume("native-conversation");
		await session.stop();
		expect(session.serialize().id).toBe("app-id");
		expect(session.serialize().nativeSessionId).toBe("native-conversation");
		expect(session.execution).toBe(running.value);
		expect(running.calls.stop).toBe(1);
	});

	test("exact resume replaces execution, tears down observation, and ignores obsolete events", async () => {
		const first = execution("first");
		const second = execution("second", "same-conversation");
		const resumed: string[] = [];
		const session = makeSession({
			launch: async () => first.value,
			resume: async (nativeId) => {
				resumed.push(nativeId);
				return second.value;
			},
		});
		const received: string[] = [];
		session.subscribe((event) => received.push(event.kind));
		await session.start();
		await session.resume("same-conversation");
		expect(resumed).toEqual(["same-conversation"]);
		expect(first.observerCount()).toBe(0);
		expect(first.calls.teardown).toBe(1);
		first.emit({ kind: "turn-completed" });
		second.emit({ kind: "turn-completed" });
		expect(received).toEqual(["turn-completed"]);
		expect(session.serialize().id).toBe("app-id");
		expect(session.serialize().nativeSessionId).toBe("same-conversation");
	});

	test("unsupported events stay distinguishable and do not synthesize idle", async () => {
		const running = execution("exec");
		const session = makeSession({ launch: async () => running.value, resume: async () => running.value });
		const received: string[] = [];
		session.subscribe((event) => received.push(event.kind));
		await session.resume("exec");
		running.emit({ kind: "permission-wait" });
		running.emit({ kind: "activity", activity: "running" });
		expect(running.value.events.permissionWait).toBe("unsupported");
		expect(received).toEqual(["activity"]);
	});
});
