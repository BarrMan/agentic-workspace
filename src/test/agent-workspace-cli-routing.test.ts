import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import { Command } from "commander";
import { registerAgentWorkspaceCommands } from "../cli/commands/agent-workspace.ts";
import type { Core } from "../controller/agentic-workspace.ts";
import { AgentSessionService } from "../runtime/sessions.ts";

describe("agent-workspace CLI routing", () => {
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
				({
					projectRoot: process.cwd(),
					workspaceDirectory: join(process.cwd(), ".agentic-workspace"),
				}) as unknown as Core,
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

	it("routes agent-session start to AgentSessionService", async () => {
		const mockStart = spyOn(AgentSessionService.prototype, "start").mockResolvedValue({
			id: "session-1",
			preset: "opencode",
		} as never);
		mocks.push(mockStart);
		const program = register();

		const output = await captureOutput(program, ["node", "test", "agent-session", "start", "BACK-1"]);

		expect(mockStart).toHaveBeenCalledWith("BACK-1", { preset: undefined, modeId: undefined });
		expect(output.stdout).toBe("Started session session-1 (preset: opencode).\n");
	});
});
