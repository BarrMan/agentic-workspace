import { describe, expect, test } from "bun:test";
import { Session } from "./session.ts";
import type {
	Harness,
	LifecycleCheckpoint,
	RunningExecution,
	RunningExecutionEvent,
	SessionLaunchOperation,
	SessionPublication,
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
const context = { taskId: "task", modeId: "mode", sessionId: record.id, record } as SessionLaunchOperation["context"];

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

function operation(
	harness: Harness,
	checkpoint: SessionPublication["checkpoint"] = async () => {},
): SessionLaunchOperation {
	return { harness, context, checkpoint };
}
function unusedHarness(): Harness {
	return {
		launch: async () => {
			throw new Error("unused");
		},
		resume: async () => {
			throw new Error("unused");
		},
	};
}

describe("Session lifecycle", () => {
	test("start waits for readiness and checkpoints in order", async () => {
		let ready!: (value: RunningExecution) => void;
		const launched = new Promise<RunningExecution>((resolve) => {
			ready = resolve;
		});
		const phases: LifecycleCheckpoint["phase"][] = [];
		const session = new Session(record);
		let settled = false;
		const starting = session
			.start(
				operation({ ...unusedHarness(), launch: () => launched }, async ({ phase }) => {
					phases.push(phase);
				}),
			)
			.then(() => {
				settled = true;
			});
		await Promise.resolve();
		expect(settled).toBe(false);
		const running = execution("exec");
		ready(running.value);
		await starting;
		expect(phases).toEqual(["reservation", "identity", "ready"]);
		expect(session.execution).toBe(running.value);
	});

	test("checkpoint rejection prevents dependent launch", async () => {
		const failure = new Error("reservation failed");
		let launches = 0;
		const session = new Session(record);
		const harness = {
			...unusedHarness(),
			launch: async () => {
				launches++;
				return execution("x").value;
			},
		};
		await expect(
			session.start(
				operation(harness, async () => {
					throw failure;
				}),
			),
		).rejects.toBe(failure);
		expect(launches).toBe(0);
	});

	test("stop retains conversation and releases execution listeners", async () => {
		const running = execution("exec", "native-conversation");
		const session = new Session(record);
		const harness = { ...unusedHarness(), resume: async () => running.value };
		await session.resume("native-conversation", operation(harness));
		const publications: LifecycleCheckpoint[] = [];
		await session.stop({
			checkpoint: async (checkpoint) => {
				publications.push(checkpoint);
			},
		});
		expect(session.serialize()).toMatchObject({
			id: "app-id",
			nativeSessionId: "native-conversation",
			status: AGENT_SESSION_STATUS.STOPPED,
		});
		expect(session.execution).toBeUndefined();
		expect(running.calls.stop).toBe(1);
		expect(running.observerCount()).toBe(0);
		expect(publications).toHaveLength(1);
	});

	test("resume replaces execution, clears prior terminal fields, and ignores obsolete events", async () => {
		const first = execution("first");
		const second = execution("second", "same-conversation");
		const session = new Session({ ...record, endedAt: "then", error: "old failure" });
		const harness = { ...unusedHarness(), launch: async () => first.value, resume: async () => second.value };
		const received: string[] = [];
		session.subscribe((event) => received.push(event.kind));
		await session.start(operation(harness));
		await session.resume("same-conversation", operation(harness));
		expect(first.observerCount()).toBe(0);
		expect(first.calls.teardown).toBe(1);
		first.emit({ kind: "turn-completed" });
		second.emit({ kind: "turn-completed" });
		expect(received).toEqual(["turn-completed"]);
		expect(session.serialize()).toMatchObject({
			id: "app-id",
			nativeSessionId: "same-conversation",
			status: AGENT_SESSION_STATUS.RUNNING,
		});
		expect(session.serialize().endedAt).toBeUndefined();
		expect(session.serialize().error).toBeUndefined();
	});

	test("execution exit updates record and emits its snapshot without publishing", async () => {
		const running = execution("exec");
		const session = new Session(record);
		const events: Array<{ record: Readonly<AgentSession>; kind: string }> = [];
		const checkpoints: LifecycleCheckpoint[] = [];
		session.subscribe((event) => events.push(event));
		await session.start(
			operation({ ...unusedHarness(), launch: async () => running.value }, async (checkpoint) => {
				checkpoints.push(checkpoint);
			}),
		);
		const before = checkpoints.length;
		running.emit({ kind: "execution-exit", exitCode: 1 });
		expect(session.serialize()).toMatchObject({
			status: AGENT_SESSION_STATUS.FAILED,
			error: "Execution exited with code 1",
		});
		expect(session.serialize().endedAt).toBeString();
		expect(session.execution).toBeUndefined();
		expect(running.observerCount()).toBe(0);
		expect(events.at(-1)).toMatchObject({ kind: "execution-exit", record: { status: AGENT_SESSION_STATUS.FAILED } });
		expect(checkpoints).toHaveLength(before);
	});

	test("unsupported events are suppressed without synthetic activity", async () => {
		const running = execution("exec");
		const session = new Session(record);
		const received: string[] = [];
		session.subscribe((event) => received.push(event.kind));
		await session.resume("exec", operation({ ...unusedHarness(), resume: async () => running.value }));
		running.emit({ kind: "permission-wait" });
		running.emit({ kind: "activity", activity: "running" });
		expect(received).toEqual(["activity"]);
	});
});
