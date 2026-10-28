import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as sysprims from "@3leaps/sysprims";
import { TmuxCommandError } from "libtmux";
import type { AgentSession } from "../../model/session/types.ts";
import { type ProcessRunner, SessionProcess, type TmuxServer } from "../../runtime/session-process.ts";
import { Storage } from "../../storage/storage.ts";

describe("SessionProcess tmux instance lifecycle", () => {
	const roots: string[] = [];
	const session: AgentSession = {
		id: "instance-session",
		taskId: "TASK-1",
		preset: "opencode",
		tmuxName: "agentic-workspace-task-1-instance",
		createdAt: "2026-10-12T00:00:00.000Z",
		outputPath: join(tmpdir(), "instance.log"),
		bootstrapPath: join(tmpdir(), "instance.md"),
	};
	afterEach(async () => {
		mock.restore();
		await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
	});

	async function fixture(state: "live" | "dead" | "absent" = "live", role = "live-preview", realProcesses = false) {
		if (!realProcesses) {
			const table = sysprims.processList();
			spyOn(sysprims, "processList").mockReturnValue({ ...table, processes: [] });
		}
		const root = await realpath(await mkdtemp(join(tmpdir(), "agentic-workspace-tmux-lifecycle-")));
		roots.push(root);
		const events: string[] = [];
		const killedPaneIds: string[] = [];
		let instanceState = state;
		let panePid = "4242";
		const options = new Map<string, string>([
			["@agentic_workspace_root", root],
			["@agentic_workspace_task", session.taskId],
			["@agentic_workspace_session", session.id],
			["@agentic_workspace_role", role],
		]);
		const pane = {
			id: "%731",
			kill: async () => {
				events.push("kill-pane");
				killedPaneIds.push(pane.id);
				options.clear();
				instanceState = "absent";
			},
			setOption: async (name: string, value: string) => {
				options.set(name, value);
			},
			setTitle: async (_title: string) => {},
			pipeTo: async () => {},
			respawn: async () => {
				events.push("respawn");
			},
			displayMessage: async () => ["0 0"],
		};
		const server = {
			newSession: async () => ({ activePane: pane }),
			panes: async () => (instanceState !== "absent" ? [pane] : []),
			cmd: async (command: string, args: readonly string[] = []) => {
				if (command === "display-message") return [args.at(-1) === "#{pane_pid}" ? panePid : ""];
				if (command === "list-sessions") return instanceState === "absent" ? [] : [session.tmuxName];
				if (command === "list-panes") {
					if (instanceState === "absent")
						throw new TmuxCommandError({
							args: [command, ...args],
							exitCode: 1,
							stderr: [`can't find session: ${session.tmuxName}`],
							target: `=${session.tmuxName}:`,
						});
					const format = args.at(-1);
					const values: Record<string, string> = {
						"#{pane_id}": pane.id,
						"#{session_name}": session.tmuxName,
						"#{@agentic_workspace_root}": options.get("@agentic_workspace_root") ?? "",
						"#{@agentic_workspace_task}": options.get("@agentic_workspace_task") ?? "",
						"#{@agentic_workspace_session}": options.get("@agentic_workspace_session") ?? "",
						"#{@agentic_workspace_role}": options.get("@agentic_workspace_role") ?? "",
						"#{pane_dead}": instanceState === "dead" ? "1" : "0",
					};
					if (format && format in values) return [values[format]!];
					return [
						[
							session.tmuxName,
							options.get("@agentic_workspace_root"),
							options.get("@agentic_workspace_task"),
							options.get("@agentic_workspace_session"),
							options.get("@agentic_workspace_role"),
							pane.id,
							instanceState === "dead" ? "1" : "0",
						].join("\t"),
					];
				}
				return [""];
			},
		} satisfies TmuxServer;
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("No OS process probes/signals expected");
			},
		};
		const storage = Storage.open(root);
		return {
			process: new SessionProcess(
				runner,
				{ projectRoot: root, stateRoot: () => storage.sessionStore().stateRoot },
				server,
			),
			events,
			killedPaneIds,
			options,
			pane,
			server,
			setPanePid: (value: string) => {
				panePid = value;
			},
		};
	}

	it("stops the confirmed pane process tree before removing its owned pane", async () => {
		const f = await fixture("live", "live-preview", true);
		const child = Bun.spawn(["/bin/sleep", "60"], { detached: true, stdout: "ignore", stderr: "ignore" });
		f.setPanePid(String(child.pid));
		try {
			await f.process.kill(session);
			expect(await child.exited).not.toBe(0);
			expect(f.events).toEqual(["kill-pane"]);
			expect(f.options.size).toBe(0);
		} finally {
			try {
				process.kill(child.pid, "SIGKILL");
			} catch {
				// The confirmed process tree may already have exited.
			}
			await child.exited;
		}
	});

	it("cleans a retained dead pane and makes it ready for the saved-ID relaunch", async () => {
		const f = await fixture("dead");
		expect(await f.process.nativeRuntimeClassification(session)).toEqual({
			status: "dead",
			paneId: "%731",
		});
		await f.process.kill(session);
		expect(f.events).toEqual(["kill-pane"]);
	});

	it("stops only the pane captured for this execution", async () => {
		const replaced = await fixture();
		const record = session;
		const capturedPaneId = await replaced.process.paneId(record, { roles: ["live-preview"] });
		replaced.pane.id = "%732";

		await expect(replaced.process.killCaptured(record, capturedPaneId)).rejects.toThrow(/pane incarnation changed/);
		expect(replaced.killedPaneIds).toEqual([]);

		const current = await fixture();
		const currentRecord = session;
		const currentPaneId = await current.process.paneId(currentRecord, { roles: ["live-preview"] });
		await current.process.killCaptured(currentRecord, currentPaneId);
		expect(current.killedPaneIds).toEqual(["%731"]);
	});

	it("fails closed on a malformed pane PID before pane teardown", async () => {
		const f = await fixture();
		f.setPanePid("not-a-pid");
		await expect(f.process.kill(session)).rejects.toThrow(/refusing pane teardown/);
		expect(f.events).toEqual([]);
	});

	it("treats an already-exited pane process as stopped and still removes the pane", async () => {
		const f = await fixture("live", "live-preview", true);
		const child = Bun.spawn(["/usr/bin/true"], { stdout: "ignore", stderr: "ignore" });
		await child.exited;
		f.setPanePid(String(child.pid));
		const terminate = spyOn(sysprims, "terminateTree").mockImplementation(() => {
			throw new Error("An absent process must not be signalled.");
		});
		const record = session;
		const prepared = await f.process.prepareStop(record);
		await prepared.stop();
		await prepared.stop();
		expect(f.events).toEqual(["kill-pane"]);
		expect(terminate).not.toHaveBeenCalled();
	});

	it.each(["kill", "prepareStop"] as const)("refuses unknown process inspection during %s", async (operation) => {
		const f = await fixture();
		spyOn(sysprims, "processList").mockImplementation(() => {
			throw new Error("process inspection denied");
		});
		await expect(f.process[operation](session)).rejects.toThrow("Could not inspect process identity");
		expect(f.events).toEqual([]);
	});

	it.each([
		"kill",
		"prepareStop",
	] as const)("refuses a process with an unreadable name during %s", async (operation) => {
		const table = sysprims.processList();
		const row = table.processes[0];
		if (!row) throw new Error("Expected a process snapshot.");
		const f = await fixture();
		spyOn(sysprims, "processList").mockReturnValue({
			...table,
			processes: [{ ...row, pid: 4242, name: "", state: "running" }],
		});
		await expect(f.process[operation](session)).rejects.toThrow("Could not read process name");
		expect(f.events).toEqual([]);
	});

	it("refuses a changed process name before signalling or pane teardown", async () => {
		const table = sysprims.processList();
		const row = table.processes[0];
		if (!row) throw new Error("Expected a process snapshot.");
		const f = await fixture();
		let probes = 0;
		spyOn(sysprims, "processList").mockImplementation(() => ({
			...table,
			processes: [{ ...row, pid: 4242, name: probes++ === 0 ? "agent" : "replacement", state: "running" }],
		}));
		const terminate = spyOn(sysprims, "terminateTree").mockImplementation(() => {
			throw new Error("A replacement process must not be signalled.");
		});
		await expect(f.process.kill(session)).rejects.toThrow("survivor");
		expect(terminate).not.toHaveBeenCalled();
		expect(f.events).toEqual([]);
	});

	it("treats a conclusive absent instance as already stopped", async () => {
		const f = await fixture("absent");
		expect(await f.process.nativeRuntimeClassification(session)).toEqual({
			status: "missing",
		});
		await f.process.kill(session);
		expect(f.events).toEqual([]);
	});

	it("refuses foreign ownership and propagates uncertain probe and pane-kill errors", async () => {
		const foreign = await fixture();
		foreign.options.set("@agentic_workspace_task", "OTHER");
		await expect(foreign.process.kill(session)).rejects.toThrow();
		expect(foreign.events).toEqual([]);

		const probe = await fixture();
		probe.server.cmd = async () => Promise.reject(new Error("tmux socket denied"));
		await expect(probe.process.nativeRuntimeClassification(session)).rejects.toThrow("tmux socket denied");

		const failedKill = await fixture();
		failedKill.pane.kill = async () => {
			throw new Error("tmux kill denied");
		};
		await expect(failedKill.process.kill(session)).rejects.toThrow("tmux kill denied");
	});

	it("keeps normal and retired role ownership disjoint", async () => {
		for (const role of ["native-workspace", "retired-session"]) {
			const f = await fixture("live", role);
			await expect(f.process.kill(session)).rejects.toThrow("ownership");
			expect(f.events).toEqual([]);
		}
		const retired = await fixture("live", "retired-session");
		await retired.process.killRetired(session);
		expect(retired.events).toEqual(["kill-pane"]);
		const wrongRetired = await fixture("live", "live-preview");
		await expect(wrongRetired.process.killRetired(session)).rejects.toThrow("ownership");
		expect(wrongRetired.events).toEqual([]);
	});

	it("demotes a verified live pane idempotently and refuses non-live or foreign tags", async () => {
		const live = await fixture();
		const writes: string[] = [];
		live.pane.setOption = async (name: string, value: string) => {
			writes.push(`${name}:${value}`);
			live.options.set(name, value);
		};
		live.pane.setTitle = async (title: string) => {
			writes.push(`title:${title}`);
		};
		await live.process.demote(session);
		expect(live.options.get("@agentic_workspace_role")).toBe("retired-session");
		expect(writes).toHaveLength(2);
		await live.process.demote(session);
		expect(writes).toHaveLength(4);

		for (const tags of [{ role: "native-workspace" }, { task: "OTHER" }]) {
			const foreign = await fixture();
			if (tags.role) foreign.options.set("@agentic_workspace_role", tags.role);
			if (tags.task) foreign.options.set("@agentic_workspace_task", tags.task);
			let mutations = 0;
			foreign.pane.setOption = async () => {
				mutations++;
			};
			foreign.pane.setTitle = async () => {
				mutations++;
			};
			await expect(foreign.process.demote(session)).rejects.toThrow("ownership");
			expect(mutations).toBe(0);
		}
	});

	it("never routes input or attach through a wrong-name pane and does not report it missing", async () => {
		const f = await fixture();
		let sends = 0;
		f.server.cmd = async (command: string, args: readonly string[] = []) => {
			if (command === "list-panes") {
				const format = args.at(-1);
				const values: Record<string, string> = {
					"#{pane_id}": "%731",
					"#{session_name}": "foreign-tmux-name",
					"#{@agentic_workspace_root}": f.options.get("@agentic_workspace_root") ?? "",
					"#{@agentic_workspace_task}": session.taskId,
					"#{@agentic_workspace_session}": session.id,
					"#{@agentic_workspace_role}": "live-preview",
					"#{pane_dead}": "0",
				};
				return format && format in values ? [values[format]!] : [];
			}
			if (command === "send-keys") sends++;
			return [""];
		};
		await expect(f.process.paneId(session)).rejects.toThrow("ownership");
		await expect(f.process.sendKey(session, "enter")).rejects.toThrow("ownership");
		await expect(f.process.attach(session)).rejects.toThrow("ownership");
		const alive = await f.process.alive(session);
		expect(alive.exitCode).toBe(1);
		expect(alive.stderr).not.toBe(`tmux pane for session ${session.id} not found`);
		expect(sends).toBe(0);
	});
});
