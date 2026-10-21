import { describe, expect, test } from "bun:test";
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
