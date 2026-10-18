import { describe, expect, it } from "bun:test";
import { TmuxCommandError, TmuxTransportError } from "libtmux";
import { BunRunner, type ProcessRunner, SessionProcess, type TmuxServer } from "./session-process.ts";
import type { AgentSession } from "./types.ts";

describe("BunRunner timeouts", () => {
	it("returns the captured output and a timeout marker instead of throwing", async () => {
		const runner = new BunRunner();

		const result = await runner.run(["/bin/sh", "-c", "printf 'partial answer'; exec sleep 10"], { timeoutMs: 2_000 });

		expect(result.timedOut).toBe(true);
		expect(result.stdout).toContain("partial answer");
		expect(result.exitCode).toBe(124);
	});

	it("returns a normal result for a command that finishes in time", async () => {
		const runner = new BunRunner();

		const result = await runner.run(["/bin/sh", "-c", "printf ok"]);

		expect(result.timedOut).toBeFalsy();
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toBe("ok");
	});
});

describe("native runtime ownership probes", () => {
	const record: AgentSession = {
		id: "conversation-exact",
		taskId: "TASK-23",
		preset: "opencode",
		tmuxName: "agentic-workspace-task-23-12345678",
		cwd: process.cwd(),
		createdAt: "2026-10-10T00:00:00.000Z",
		status: "running",
		nativeWorkspace: true,
		ownerPid: 1,
		outputPath: "/unused.log",
		bootstrapPath: "/unused.md",
	};

	const row = (values: Partial<Record<"name" | "root" | "task" | "id" | "role" | "pane" | "dead", string>> = {}) =>
		[
			values.name ?? record.tmuxName,
			values.root ?? process.cwd(),
			values.task ?? record.taskId,
			values.id ?? record.id,
			values.role ?? "live-preview",
			values.pane ?? "%42",
			values.dead ?? "0",
		].join("\t");
	const exactMissing = () =>
		new TmuxCommandError({
			args: ["list-panes", "-t", `=${record.tmuxName}:`],
			exitCode: 1,
			stderr: [`can't find session: ${record.tmuxName}`],
			target: `=${record.tmuxName}:`,
		});

	it.each([
		["live pane", "0", { status: "live", paneId: "%42" }],
		["retained dead pane", "1", { status: "dead", paneId: "%42" }],
	] as const)("classifies %s against exact pane tags", async (_label, dead, expected) => {
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("Classification must not probe the OS");
			},
		};
		const server = {
			cmd: async (command: string, args: readonly string[]) => {
				expect(command).toBe("list-panes");
				expect(args).toContain(`=${record.tmuxName}:`);
				return [row({ dead })];
			},
		} as unknown as TmuxServer;
		expect(await new SessionProcess(runner, process.cwd(), server).nativeRuntimeClassification(record)).toEqual(
			expected,
		);
	});

	it("does not interpret an empty or malformed successful probe as absence", async () => {
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("Process inspection must not run");
			},
		};
		for (const lines of [[], ["malformed"]]) {
			const server = { cmd: async () => lines } as unknown as TmuxServer;
			await expect(
				new SessionProcess(runner, process.cwd(), server).nativeRuntimeClassification(record),
			).rejects.toThrow();
		}
	});

	it("rejects legacy native-workspace ownership instead of adopting it", async () => {
		const server = { cmd: async () => [row({ role: "native-workspace" })] } as unknown as TmuxServer;
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("Classification must not probe the OS");
			},
		};
		await expect(new SessionProcess(runner, process.cwd(), server).nativeRuntimeClassification(record)).rejects.toThrow(
			"ownership",
		);
	});

	it("classifies only a typed exact missing tmux target as missing", async () => {
		const server = {
			cmd: async () => {
				throw exactMissing();
			},
		} as unknown as TmuxServer;
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("Missing targets must not probe a process");
			},
		};
		expect(await new SessionProcess(runner, process.cwd(), server).nativeRuntimeClassification(record)).toEqual({
			status: "missing",
		});
	});

	it("classifies an unreachable tmux socket as conclusive absence", async () => {
		const server = {
			cmd: async () => {
				throw new TmuxTransportError("error connecting to /private/tmp/tmux-501/default", {
					kind: "spawn",
					delivery: "not_started",
				});
			},
		} as unknown as TmuxServer;
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("An unavailable server must not probe the OS");
			},
		};
		expect(await new SessionProcess(runner, process.cwd(), server).nativeRuntimeClassification(record)).toEqual({
			status: "missing",
		});
	});

	it("preserves alive live/dead numeric results and its canonical exact missing stderr", async () => {
		for (const [dead, stdout] of [
			["0", "0\n"],
			["1", "1\n"],
		] as const) {
			const server = { cmd: async () => [row({ dead })] } as unknown as TmuxServer;
			expect(
				await new SessionProcess(
					{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
					process.cwd(),
					server,
				).alive(record),
			).toEqual({
				exitCode: 0,
				stdout,
				stderr: "",
			});
		}
		const missingServer = {
			cmd: async () => {
				throw exactMissing();
			},
		} as unknown as TmuxServer;
		expect(
			await new SessionProcess(
				{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
				process.cwd(),
				missingServer,
			).alive(record),
		).toEqual({
			exitCode: 1,
			stdout: "",
			stderr: `tmux pane for session ${record.id} not found`,
		});
	});

	it("keeps arbitrary and embedded missing phrases as errors", async () => {
		for (const error of [
			new Error(`can't find session: ${record.tmuxName}`),
			new TmuxCommandError({
				args: ["list-panes", "-t", `=${record.tmuxName}:`],
				exitCode: 1,
				stderr: [`prefix: can't find session: ${record.tmuxName}`],
			}),
		]) {
			const server = {
				cmd: async () => {
					throw error;
				},
			} as unknown as TmuxServer;
			await expect(
				new SessionProcess(
					{
						run: async () => {
							throw error;
						},
					},
					process.cwd(),
					server,
				).nativeRuntimeClassification(record),
			).rejects.toThrow();
		}
	});

	it("rejects wrong-name, foreign-tagged, malformed, and empty successful exact responses", async () => {
		for (const lines of [[row({ name: "another-session" })], [row({ task: "OTHER" })], ["malformed"], []]) {
			const server = { cmd: async () => lines } as unknown as TmuxServer;
			await expect(
				new SessionProcess(
					{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
					process.cwd(),
					server,
				).nativeRuntimeClassification(record),
			).rejects.toThrow();
		}
	});
});
