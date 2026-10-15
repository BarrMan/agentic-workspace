import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HarnessProvider as Harness, RunningExecution, RunningExecutionEvent } from "./harness.ts";
import type { LifecycleCheckpoint, SessionLaunchOperation, SessionPublication } from "./session.ts";
import { Session } from "./session.ts";
import type { ProcessRunner } from "./session-process.ts";
import { SessionStore } from "./session-store.ts";
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
		sendKey: async () => {},
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
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

	test("start waits for readiness and checkpoints in order", async () => {
		let ready!: (value: RunningExecution) => void;
		const launched = new Promise<RunningExecution>((resolve) => {
			ready = resolve;
		});
		const phases: LifecycleCheckpoint["phase"][] = [];
		const session = new Session(record, "mode");
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
		expect(phases).toEqual(["identity", "ready"]);
		expect(session.execution).toBe(running.value);
	});

	test("checkpoint rejection propagates after installing execution", async () => {
		const failure = new Error("identity checkpoint failed");
		let launches = 0;
		const session = new Session(record, "mode");
		const launched = execution("x");
		const harness = {
			...unusedHarness(),
			launch: async () => {
				launches++;
				return launched.value;
			},
		};
		await expect(
			session.start(
				operation(harness, async () => {
					throw failure;
				}),
			),
		).rejects.toBe(failure);
		expect(launches).toBe(1);
		expect(session.execution).toBe(launched.value);
	});

	test("stop retains conversation and releases execution listeners", async () => {
		const running = execution("exec", "native-conversation");
		const session = new Session(record, "mode");
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
		expect(publications[0]).toMatchObject({ phase: "update", reason: "stop", expectedMembership: { kind: "present" } });
	});

	test("stop without an installed execution still publishes stopped lifecycle", async () => {
		const session = new Session(record, "mode");
		let published: LifecycleCheckpoint | undefined;
		await session.stop({
			checkpoint: async (checkpoint) => {
				published = checkpoint;
			},
		});
		expect(published).toMatchObject({
			phase: "update",
			reason: "stop",
			record: { status: AGENT_SESSION_STATUS.STOPPED },
		});
	});

	test("stop failure retains execution tracking and does not publish a stopped record", async () => {
		const running = execution("exec");
		const failure = new Error("stop failed");
		running.value.stop = async () => {
			running.calls.stop++;
			throw failure;
		};
		const session = new Session(record, "mode");
		await session.resume("native", operation({ ...unusedHarness(), resume: async () => running.value }));
		let publications = 0;
		await expect(session.stop({ checkpoint: async () => void publications++ })).rejects.toBe(failure);
		expect(session.execution).toBe(running.value);
		expect(running.observerCount()).toBe(1);
		expect(publications).toBe(0);
	});

	test("stop retries durable publication after execution has been released", async () => {
		const running = execution("retry-stop");
		const session = new Session(record, "mode");
		await session.resume("native", operation({ ...unusedHarness(), resume: async () => running.value }));
		const failure = new Error("publication failed");
		await expect(
			session.stop({
				checkpoint: async () => {
					throw failure;
				},
			}),
		).rejects.toBe(failure);
		expect(session.execution).toBeUndefined();
		let published: LifecycleCheckpoint | undefined;
		await session.stop({
			checkpoint: async (checkpoint) => {
				published = checkpoint;
			},
		});
		expect(published).toMatchObject({
			phase: "update",
			reason: "stop",
			record: { status: AGENT_SESSION_STATUS.STOPPED },
		});
	});

	test("park settles without signalling and finish carries its error", async () => {
		const session = new Session(record, "mode");
		const checkpoints: LifecycleCheckpoint[] = [];
		const publication = {
			checkpoint: async (checkpoint: LifecycleCheckpoint) => {
				checkpoints.push(checkpoint);
			},
		};
		await session.park(publication);
		await session.finish(publication, "provider failed");
		expect(checkpoints).toMatchObject([
			{ phase: "update", reason: "park", record: { status: AGENT_SESSION_STATUS.PARKED } },
			{ phase: "update", reason: "finish", record: { status: AGENT_SESSION_STATUS.FAILED, error: "provider failed" } },
		]);
	});

	test("park clears obsolete lifecycle fields while retaining unrelated record data", async () => {
		const session = new Session(
			{ ...record, ownerPid: 42, endedAt: "then", error: "old failure", useCount: 9, nativeSessionId: "native" },
			"mode",
		);
		let published: LifecycleCheckpoint | undefined;
		await session.park({
			checkpoint: async (checkpoint) => {
				published = checkpoint;
			},
		});
		expect(published).toMatchObject({
			phase: "update",
			reason: "park",
			record: { status: AGENT_SESSION_STATUS.PARKED, useCount: 9, nativeSessionId: "native" },
		});
		expect(published?.record.ownerPid).toBeUndefined();
		expect(published?.record.endedAt).toBeUndefined();
		expect(published?.record.error).toBeUndefined();
	});

	test("resume replaces execution, clears prior terminal fields, and ignores obsolete events", async () => {
		const first = execution("first");
		const second = execution("second", "same-conversation");
		const session = new Session({ ...record, endedAt: "then", error: "old failure" }, "mode");
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

	test("resume durably clears prior terminal fields in reloaded state", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-resume-reload-"));
		roots.push(root);
		const runner: ProcessRunner = { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) };
		const store = new SessionStore(root, runner);
		await store.mutateMode("task", "mode", async (history) => {
			history.sessions.push({ ...record, endedAt: "then", error: "old failure" });
			history.activeSessionId = record.id;
		});
		const resumed = new Session({ ...record, endedAt: "then", error: "old failure" }, "mode");
		const running = execution("resume");
		await resumed.resume(
			"native",
			operation({ ...unusedHarness(), resume: async () => running.value }, async (checkpoint) => {
				await store.mutateMode("task", "mode", async (history) => {
					const index = history.sessions.findIndex(({ id }) => id === checkpoint.record.id);
					if (index < 0) throw new Error("missing session");
					history.sessions[index] = structuredClone(checkpoint.record) as AgentSession;
				});
			}),
		);
		const reloaded = (await store.readMode("task", "mode")).sessions[0];
		expect(reloaded?.endedAt).toBeUndefined();
		expect(reloaded?.error).toBeUndefined();
	});

	test("lifecycle publication applies owned changes to newer durable data", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-lifecycle-current-record-"));
		roots.push(root);
		const store = new SessionStore(root, { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) });
		const session = new Session({ ...record, error: "old failure", endedAt: "then" }, "mode");
		const running = execution("resume", "resumed-native");
		const resumeCheckpoints: LifecycleCheckpoint[] = [];
		await session.resume(
			"resumed-native",
			operation({ ...unusedHarness(), resume: async () => running.value }, async (checkpoint) => {
				resumeCheckpoints.push(checkpoint);
			}),
		);
		await store.mutateMode("task", "mode", async (history) => {
			history.sessions.push({
				...record,
				useCount: 17,
				lastUsedAt: "concurrent-use",
				error: "old failure",
				endedAt: "then",
				ownerPid: 123,
			});
			history.activeSessionId = record.id;
		});
		for (const checkpoint of resumeCheckpoints) {
			await store.mutateMode("task", "mode", async (history) => {
				const index = history.sessions.findIndex(({ id }) => id === record.id);
				if (index < 0) throw new Error("missing session");
				const current = history.sessions[index];
				if (!current) throw new Error("missing session");
				history.sessions[index] = checkpoint.applyTo(current);
			});
		}
		const durable = (await store.readMode("task", "mode")).sessions[0];
		if (!durable) throw new Error("missing durable session");
		expect(durable).toMatchObject({
			status: AGENT_SESSION_STATUS.RUNNING,
			nativeSessionId: "resumed-native",
			useCount: 17,
			lastUsedAt: "concurrent-use",
			ownerPid: 123,
		});
		expect(durable.error).toBeUndefined();
		expect(durable.endedAt).toBeUndefined();

		const finishing = new Session({ ...record, error: "stale", endedAt: "old-end" }, "mode");
		let finishCheckpoint: LifecycleCheckpoint | undefined;
		await finishing.finish({
			checkpoint: async (checkpoint) => {
				finishCheckpoint = checkpoint;
			},
		});
		await store.mutateMode("task", "mode", async (history) => {
			const index = history.sessions.findIndex(({ id }) => id === record.id);
			if (index < 0) throw new Error("missing session");
			const current = history.sessions[index];
			if (!current) throw new Error("missing session");
			history.sessions[index] = { ...current, error: "stale", useCount: 18 };
		});
		let finished: AgentSession | undefined;
		if (!finishCheckpoint) throw new Error("missing finish checkpoint");
		const checkpoint = finishCheckpoint;
		await store.mutateMode("task", "mode", async (history) => {
			const index = history.sessions.findIndex(({ id }) => id === record.id);
			if (index < 0) throw new Error("missing session");
			const current = history.sessions[index];
			if (!current) throw new Error("missing session");
			const result = checkpoint.applyTo(current);
			finished = result;
			history.sessions[index] = result;
		});
		expect(finished).toMatchObject({
			status: AGENT_SESSION_STATUS.STOPPED,
			useCount: 18,
			lastUsedAt: "concurrent-use",
		});
		expect(finished?.error).toBeUndefined();
		expect(finished?.endedAt).toBeString();
		expect(finished?.ownerPid).toBeUndefined();
	});

	test("an obsolete execution event cannot replace durable state after resume", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-stale-event-reload-"));
		roots.push(root);
		const runner: ProcessRunner = { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) };
		const store = new SessionStore(root, runner);
		await store.mutateMode("task", "mode", async (history) => {
			history.sessions.push(record);
			history.activeSessionId = record.id;
		});
		const session = new Session(record, "mode");
		session.subscribe(async ({ record: eventRecord }) => {
			await store.mutateMode("task", "mode", async (history) => {
				const index = history.sessions.findIndex(({ id }) => id === eventRecord.id);
				if (index >= 0) history.sessions[index] = structuredClone(eventRecord) as AgentSession;
			});
		});
		const first = execution("first", "old-native");
		const second = execution("second", "current-native");
		const harness = { ...unusedHarness(), launch: async () => first.value, resume: async () => second.value };
		const persist = async (checkpoint: LifecycleCheckpoint) => {
			await store.mutateMode("task", "mode", async (history) => {
				const index = history.sessions.findIndex(({ id }) => id === checkpoint.record.id);
				if (index < 0) throw new Error("missing session");
				history.sessions[index] = structuredClone(checkpoint.record) as AgentSession;
			});
		};
		await session.start(operation(harness, persist));
		await session.resume("current-native", operation(harness, persist));
		first.emit({ kind: "execution-exit", exitCode: 1 });
		const reloaded = (await store.readMode("task", "mode")).sessions[0];
		expect(reloaded).toMatchObject({ nativeSessionId: "current-native", status: AGENT_SESSION_STATUS.RUNNING });
	});

	test("execution exit updates record and emits its snapshot without publishing", async () => {
		const running = execution("exec");
		const session = new Session(record, "mode");
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
		expect(events.at(-1)).toMatchObject({
			kind: "execution-exit",
			executionIdentity: running.value.identity,
			record: { status: AGENT_SESSION_STATUS.FAILED },
		});
		expect(checkpoints).toHaveLength(before);
	});

	test("explicit stop publishes lifecycle after the execution has exited", async () => {
		const running = execution("exited-stop");
		const session = new Session(record, "mode");
		await session.start(operation({ ...unusedHarness(), launch: async () => running.value }));
		running.emit({ kind: "execution-exit", exitCode: 0 });
		let published: LifecycleCheckpoint | undefined;
		await session.stop({
			checkpoint: async (checkpoint) => {
				published = checkpoint;
			},
		});
		expect(published).toMatchObject({
			phase: "update",
			reason: "stop",
			record: { status: AGENT_SESSION_STATUS.STOPPED },
		});
	});

	test("unsupported events are suppressed without synthetic activity", async () => {
		const running = execution("exec");
		const session = new Session(record, "mode");
		const received: string[] = [];
		session.subscribe((event) => received.push(event.kind));
		await session.resume("exec", operation({ ...unusedHarness(), resume: async () => running.value }));
		running.emit({ kind: "permission-wait" });
		running.emit({ kind: "activity", activity: "running" });
		expect(received).toEqual(["activity"]);
	});
});
