import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { join } from "node:path";
import { Command } from "commander";
import { registerAgentWorkspaceCommands } from "../cli/commands/agent-workspace.ts";
import type { Core } from "../controller/agentic-workspace.ts";

describe("agent-workspace CLI routing", () => {
	afterEach(() => {
		for (const mock of mocks) mock.mockRestore();
		mocks.length = 0;
	});

	const mocks: Array<{ mockRestore(): void }> = [];
	const task = {
		id: "BACK-1",
		title: "Routing",
		status: "To Do",
		done: false,
		createdDate: "2026-10-10",
		labels: [],
		dependencies: [],
	};

	const register = (newSession: (...args: unknown[]) => Promise<unknown>) => {
		const program = new Command();
		program.exitOverride();
		registerAgentWorkspaceCommands(program, {
			project: async () =>
				({
					projectRoot: process.cwd(),
					workspaceDirectory: join(process.cwd(), ".agentic-workspace"),
					newSession,
					tasks: { getTask: async () => task },
				}) as unknown as Core,
			workspace: async () => ({
				core: {
					projectRoot: process.cwd(),
					workspaceDirectory: join(process.cwd(), ".agentic-workspace"),
				} as Core,
				sessionRuntime: {} as never,
			}),
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

	it("routes agent-session start to the Controller session application", async () => {
		const newSession = spyOn(
			{
				newSession: async (..._args: unknown[]) => ({
					record: { id: "session-1", preset: "opencode" },
				}),
			},
			"newSession",
		);
		mocks.push(newSession);
		const program = register(newSession);

		const output = await captureOutput(program, ["node", "test", "agent-session", "start", "BACK-1"]);

		expect(newSession).toHaveBeenCalledWith(task, undefined, undefined);
		expect(output.stdout).toBe("Started session session-1 (preset: opencode).\n");
	});
});
