import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import { Command } from "commander";
import { AgentSessionService } from "../agent-workspace/sessions.ts";
import { registerAgentWorkspaceCommands } from "../commands/agent-workspace.ts";
import type { Core } from "../core/backlog.ts";

describe("agent-session CLI routing", () => {
	afterEach(() => {
		for (const mock of mocks) mock.mockRestore();
		mocks.length = 0;
	});

	const mocks: Array<{ mockRestore(): void }> = [];

	const register = () => {
		const program = new Command();
		program.exitOverride();
		registerAgentWorkspaceCommands(program, {
			project: async () =>
				({ filesystem: { rootDir: process.cwd(), backlogDir: join(process.cwd(), ".backlog") } }) as Core,
			root: async () =>
				({ filesystem: { rootDir: process.cwd(), backlogDir: join(process.cwd(), ".backlog") } }) as Core,
		});
		return program;
	};

	const captureOutput = async (program: Command, args: string[]) => {
		const stdoutWrite = process.stdout.write;
		const stderrWrite = process.stderr.write;
		let stdout = "";
		let stderr = "";
		process.stdout.write = ((chunk: string | Uint8Array) => {
			stdout += chunk.toString();
			return true;
		}) as typeof process.stdout.write;
		process.stderr.write = ((chunk: string | Uint8Array) => {
			stderr += chunk.toString();
			return true;
		}) as typeof process.stderr.write;
		try {
			await program.parseAsync(args);
		} finally {
			process.stdout.write = stdoutWrite;
			process.stderr.write = stderrWrite;
		}
		return { stdout, stderr };
	};

	it("starts a persistent session without requesting immediate stop", async () => {
		const mockStart = spyOn(AgentSessionService.prototype, "start").mockResolvedValue({
			id: "session-1",
			preset: "opencode",
		} as never);
		mocks.push(mockStart);
		const program = register();

		const output = await captureOutput(program, ["node", "test", "agent-session", "start", "BACK-1"]);

		expect(mockStart).toHaveBeenCalledWith("BACK-1", { preset: undefined, modeId: undefined });
		expect(output.stdout).toContain("Started session session-1");
	});

	it("replaces the old session but leaves the new session persistent", async () => {
		const mockStart = spyOn(AgentSessionService.prototype, "start").mockResolvedValue({
			id: "session-2",
			preset: "opencode",
		} as never);
		mocks.push(mockStart);
		const program = register();

		await captureOutput(program, ["node", "test", "agent-session", "handoff", "BACK-1"]);

		expect(mockStart).toHaveBeenCalledWith("BACK-1", { replace: true, modeId: undefined });
	});

	it("prints a timed-out ask's partial answer and warning with exact options", async () => {
		const mockAsk = spyOn(AgentSessionService.prototype, "ask").mockResolvedValue({
			answer: "partial answer",
			timedOut: true,
		});
		mocks.push(mockAsk);
		const program = register();

		const output = await captureOutput(program, [
			"node",
			"test",
			"agent-session",
			"ask",
			"BACK-1",
			"question",
			"--session",
			"session-3",
			"--mode",
			"build",
		]);

		expect(mockAsk).toHaveBeenCalledWith("BACK-1", "question", { sessionId: "session-3", modeId: "build" });
		expect(output.stdout).toBe("partial answer\n");
		expect(output.stderr).toContain("answer above may be incomplete");
	});

	it("propagates explicit stop failures without swallowing them", async () => {
		const failure = new Error("stop failed");
		const mockStop = spyOn(AgentSessionService.prototype, "stop").mockRejectedValue(failure);
		mocks.push(mockStop);
		const program = register();

		await expect(
			captureOutput(program, ["node", "test", "agent-session", "stop", "BACK-1", "--session", "session-4"]),
		).rejects.toBe(failure);
		expect(mockStop).toHaveBeenCalledWith("BACK-1", "session-4");
	});
});
