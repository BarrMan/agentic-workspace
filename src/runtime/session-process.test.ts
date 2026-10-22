import { describe, expect, it } from "bun:test";
import { TmuxCommandError, TmuxTransportError } from "libtmux";
import type { AgentSession } from "../model/session/types.ts";
import {
	BunRunner,
	type ProcessRunner,
	SessionProcess,
	type SessionProcessResourceContext,
	type TmuxServer,
} from "./session-process.ts";

const resources = (): SessionProcessResourceContext => ({
	projectRoot: process.cwd(),
	stateRoot: async () => process.cwd(),
});

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
		nativeWorkspace: true,
		ownerPid: 1,
		outputPath: "/unused.log",
		bootstrapPath: "/unused.md",
	};

	const exactMissing = () =>
		new TmuxCommandError({
			args: ["has-session", "-t", `=${record.tmuxName}`],
			exitCode: 1,
			stderr: [],
			target: `=${record.tmuxName}`,
		});
	const ownedServer = (
		values: Partial<Record<"name" | "root" | "task" | "id" | "role" | "pane" | "dead", string>> = {},
	) => ({
		cmd: async (command: string, args: readonly string[]) => {
			if (command === "list-panes") {
				const format = args[args.length - 1];
				const fields: Record<string, string> = {
					"#{session_name}": values.name ?? record.tmuxName,
					"#{@agentic_workspace_root}": values.root ?? process.cwd(),
					"#{@agentic_workspace_task}": values.task ?? record.taskId,
					"#{@agentic_workspace_session}": values.id ?? record.id,
					"#{@agentic_workspace_role}": values.role ?? "live-preview",
					"#{pane_id}": values.pane ?? "%42",
					"#{pane_dead}": values.dead ?? "0",
				};
				return [fields[format ?? ""] ?? "%42"];
			}
			throw new Error(`Unexpected tmux command ${command}`);
		},
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
		const server = ownedServer({ dead }) as unknown as TmuxServer;
		expect(await new SessionProcess(runner, resources(), server).nativeRuntimeClassification(record)).toEqual(expected);
	});

	it("rejects replacement of a live owned pane before cleanup effects", async () => {
		const process = new SessionProcess(
			{
				run: async () => {
					throw new Error("No process effects allowed");
				},
			},
			resources(),
			ownedServer() as unknown as TmuxServer,
		);
		await expect(process.assertNoPreparedResources(record)).rejects.toThrow("live; refusing replacement");
	});

	it("rejects uncertain replacement inspection before cleanup effects", async () => {
		const server = {
			cmd: async () => {
				throw new TmuxTransportError("inspection unavailable", { kind: "spawn", delivery: "not_started" });
			},
		} as unknown as TmuxServer;
		const process = new SessionProcess(
			{
				run: async () => {
					throw new Error("No process effects allowed");
				},
			},
			resources(),
			server,
		);
		await expect(process.assertNoPreparedResources(record)).rejects.toThrow();
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
				new SessionProcess(runner, resources(), server).nativeRuntimeClassification(record),
			).rejects.toThrow();
		}
	});

	it("rejects non-live native-workspace ownership instead of adopting it", async () => {
		const server = ownedServer({ role: "native-workspace" }) as unknown as TmuxServer;
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("Classification must not probe the OS");
			},
		};
		await expect(new SessionProcess(runner, resources(), server).nativeRuntimeClassification(record)).rejects.toThrow(
			"ownership",
		);
	});

	it("classifies absence only from a successful exact session inventory", async () => {
		const server = {
			cmd: async (command: string) => {
				if (command === "list-panes") throw new TmuxCommandError({ args: [command], exitCode: 1, stderr: ["failed"] });
				expect(command).toBe("list-sessions");
				return [];
			},
		} as unknown as TmuxServer;
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("Missing targets must not probe a process");
			},
		};
		expect(await new SessionProcess(runner, resources(), server).nativeRuntimeClassification(record)).toEqual({
			status: "missing",
		});
	});

	it("rechecks exact session absence when ownership inspection loses its target", async () => {
		const server = {
			cmd: async (command: string, args: readonly string[]) => {
				if (command === "list-sessions") return [];
				if (args[args.indexOf("-F") + 1] === "#{pane_id}") return ["%42"];
				throw new TmuxCommandError({ args: [command, ...args], exitCode: 1, stderr: ["target missing"] });
			},
		} as unknown as TmuxServer;
		await expect(
			new SessionProcess(
				{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
				resources(),
				server,
			).nativeRuntimeClassification(record),
		).resolves.toEqual({ status: "missing" });
	});

	it("keeps failed pane and session inspections uncertain", async () => {
		const server = {
			cmd: async (command: string) => {
				throw new TmuxCommandError({
					args: [command],
					exitCode: 1,
					stderr: ["permission denied"],
				});
			},
		} as unknown as TmuxServer;
		await expect(
			new SessionProcess(
				{
					run: async () => {
						throw new Error("No process probe expected");
					},
				},
				resources(),
				server,
			).nativeRuntimeClassification(record),
		).rejects.toThrow();
	});

	it("preserves an unreachable tmux socket as an error", async () => {
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
		await expect(new SessionProcess(runner, resources(), server).nativeRuntimeClassification(record)).rejects.toThrow();
	});

	it("preserves alive live/dead numeric results and its canonical exact missing stderr", async () => {
		for (const [dead, stdout] of [
			["0", "0\n"],
			["1", "1\n"],
		] as const) {
			const server = ownedServer({ dead }) as unknown as TmuxServer;
			expect(
				await new SessionProcess(
					{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
					resources(),
					server,
				).alive(record),
			).toEqual({
				exitCode: 0,
				stdout,
				stderr: "",
			});
		}
		const missingServer = {
			cmd: async (command: string) => (command === "list-panes" ? Promise.reject(exactMissing()) : []),
		} as unknown as TmuxServer;
		expect(
			await new SessionProcess(
				{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
				resources(),
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
					resources(),
					server,
				).nativeRuntimeClassification(record),
			).rejects.toThrow();
		}
	});

	it("rejects wrong-name, foreign-tagged, malformed, and empty successful exact responses", async () => {
		for (const server of [
			ownedServer({ name: "another-session" }),
			ownedServer({ task: "OTHER" }),
			{ cmd: async (command: string) => (command === "list-panes" ? ["malformed"] : []) },
			{ cmd: async (command: string) => (command === "list-panes" ? [] : []) },
		]) {
			await expect(
				new SessionProcess(
					{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
					resources(),
					server as unknown as TmuxServer,
				).nativeRuntimeClassification(record),
			).rejects.toThrow();
		}
	});

	it("compares ownership fields as independent values rather than reparsing delimiters", async () => {
		const server = ownedServer({ task: `${record.taskId}\t${record.id}` }) as unknown as TmuxServer;
		await expect(
			new SessionProcess(
				{ run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
				resources(),
				server,
			).nativeRuntimeClassification(record),
		).rejects.toThrow("ownership");
	});
});
