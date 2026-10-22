import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionRuntime } from "../model/session/session.ts";
import type { AgentSession, HarnessProvider, RunningExecution, SessionLaunchContext } from "../model/session/types.ts";
import type { ProcessRunner, SessionProcess } from "./session-process.ts";
import { HarnessSessionRuntime } from "./session-runtime.ts";

const context = { taskId: "task", modeId: "mode", sessionId: "session" } as SessionLaunchContext;

function execution(calls: { stop: number; observe: number }): RunningExecution {
	return {
		identity: { taskId: "task", modeId: "mode", sessionId: "session", executionId: "execution" },
		events: {
			turnCompleted: "unsupported",
			permissionWait: "unsupported",
			executionExit: "unsupported",
			activity: "unsupported",
		},
		input: async () => {},
		sendKey: async () => {},
		stop: async () => void calls.stop++,
		observe: () => {
			calls.observe++;
			return () => {};
		},
		teardownListeners: () => {},
	};
}

describe("HarnessSessionRuntime", () => {
	test("shares only positive launch-sidecar idle evidence across runtime instances", async () => {
		const root = await mkdtemp(join(tmpdir(), "runtime-idle-"));
		const record = { id: "session", bootstrapPath: join(root, "session.md") } as AgentSession;
		let status = "live";
		const process = {
			nativeRuntimeClassification: async () => ({ status, paneId: "%42" }),
		} as unknown as SessionProcess;
		const harness: HarnessProvider = {
			launch: async () => {
				throw new Error("unused");
			},
			resume: async () => {
				throw new Error("unused");
			},
		};
		const runner: ProcessRunner = { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) };
		const first = new HarnessSessionRuntime(harness, process, runner);
		const second = new HarnessSessionRuntime(harness, process, runner);
		const path = join(root, "session.activity", "status");
		try {
			expect((await first.observeRetainedActivity(record)).activity).toBe("unknown");
			await mkdir(join(root, "session.activity"));
			await writeFile(path, "idle");
			await utimes(path, 100, 100);
			expect(await first.observeRetainedActivity(record)).toEqual({
				state: "parked",
				activity: "idle",
				idleSince: 100_000,
			});
			expect(await second.observeRetainedActivity(record)).toEqual(await first.observeRetainedActivity(record));
			for (const value of ["running", "waiting", "malformed"]) {
				await writeFile(path, value);
				expect((await first.observeRetainedActivity(record)).idleSince).toBeNull();
			}
			await writeFile(path, "idle");
			status = "uncertain";
			expect((await first.observeRetainedActivity(record)).activity).toBe("unknown");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
	test("adapts only provider launch/resume and execution-handle operations", async () => {
		const executionCalls = { stop: 0, observe: 0 };
		const running = execution(executionCalls);
		const calls: string[] = [];
		const harness: HarnessProvider = {
			launch: async (value) => {
				calls.push(`launch:${value.sessionId}`);
				return running;
			},
			resume: async (providerSessionId, value) => {
				calls.push(`resume:${providerSessionId}:${value.sessionId}`);
				return running;
			},
		};
		const process = {
			nativeRuntimeClassification: async () => ({ status: "missing" as const }),
			prepareStop: async () => ({ stop: async () => {} }),
			terminalTarget: async () => ({ paneId: "%1", server: {}, exec: {} }),
		} as unknown as SessionProcess;
		const runner: ProcessRunner = { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) };
		const runtime: SessionRuntime = new HarnessSessionRuntime(harness, process, runner);
		await runtime.start(context);
		await runtime.resume("native-session", context);
		runtime.observe(running, () => {});
		await runtime.stop(running);
		const attachment = await runtime.attach({
			id: "session",
			outputPath: "/tmp/output",
			bootstrapPath: "/tmp/bootstrap",
		} as AgentSession);
		expect(attachment).toMatchObject({ paneId: "%1", outputPath: "/tmp/output", bootstrap: "" });
		await runtime.detach(attachment);
		expect(calls).toEqual(["launch:session", "resume:native-session:session"]);
		expect(executionCalls).toEqual({ stop: 1, observe: 1 });
	});
});
