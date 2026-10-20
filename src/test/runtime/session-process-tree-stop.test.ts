import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import type { AgentSession } from "../../model/session/types.ts";
import { type ProcessRunner, SessionProcess, type TmuxServer } from "../../runtime/session-process.ts";

describe("SessionProcess tmux instance lifecycle", () => {
	const roots: string[] = [];
	const session: AgentSession = {
		id: "instance-session",
		taskId: "TASK-1",
		preset: "opencode",
		tmuxName: "agentic-workspace-task-1-instance",
		cwd: process.cwd(),
		createdAt: "2026-10-12T00:00:00.000Z",
		status: "running",
		nativeWorkspace: true,
		outputPath: join(tmpdir(), "instance.log"),
		bootstrapPath: join(tmpdir(), "instance.md"),
	};
	afterEach(async () => await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

	async function fixture(state: "live" | "dead" | "absent" = "live", role = "live-preview") {
		const root = await realpath(await mkdtemp(join(tmpdir(), "agentic-workspace-tmux-lifecycle-")));
		roots.push(root);
		const events: string[] = [];
		const killedPaneIds: string[] = [];
		let instanceState = state;
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
				if (command === "list-sessions") return instanceState === "absent" ? [] : [session.tmuxName];
				if (command === "list-panes") {
					if (instanceState === "absent")
						throw new TmuxCommandError({
							args: [command, ...args],
							exitCode: 1,
							stderr: [`can't find session: ${session.tmuxName}`],
							target: `=${session.tmuxName}:`,
						});
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
		return { process: new SessionProcess(runner, root, server), events, killedPaneIds, options, pane, server };
	}

	it("explicitly stops a live owned pane without OS-group probes or signals", async () => {
		const f = await fixture();
		await f.process.kill({ ...session, cwd: await realpath(session.cwd) });
		expect(f.events).toEqual(["kill-pane"]);
		expect(f.options.size).toBe(0);
	});

	it("cleans a retained dead pane and makes it ready for the saved-ID relaunch", async () => {
		const f = await fixture("dead");
		expect(await f.process.nativeRuntimeClassification({ ...session, cwd: await realpath(session.cwd) })).toEqual({
			status: "dead",
			paneId: "%731",
		});
		await f.process.kill({ ...session, cwd: await realpath(session.cwd) });
		expect(f.events).toEqual(["kill-pane"]);
	});

	it("stops only the pane captured for this execution", async () => {
		const replaced = await fixture();
		const record = { ...session, cwd: await realpath(session.cwd) };
		const capturedPaneId = await replaced.process.paneId(record, { roles: ["live-preview"] });
		replaced.pane.id = "%732";

		await expect(replaced.process.killCaptured(record, capturedPaneId)).rejects.toThrow(/pane incarnation changed/);
		expect(replaced.killedPaneIds).toEqual([]);

		const current = await fixture();
		const currentRecord = { ...session, cwd: await realpath(session.cwd) };
		const currentPaneId = await current.process.paneId(currentRecord, { roles: ["live-preview"] });
		await current.process.killCaptured(currentRecord, currentPaneId);
		expect(current.killedPaneIds).toEqual(["%731"]);
	});

	it("treats a conclusive absent instance as already stopped", async () => {
		const f = await fixture("absent");
		expect(await f.process.nativeRuntimeClassification({ ...session, cwd: await realpath(session.cwd) })).toEqual({
			status: "missing",
		});
		await f.process.kill({ ...session, cwd: await realpath(session.cwd) });
		expect(f.events).toEqual([]);
	});

	it("refuses foreign ownership and propagates uncertain probe and pane-kill errors", async () => {
		const foreign = await fixture();
		foreign.options.set("@agentic_workspace_task", "OTHER");
		await expect(foreign.process.kill({ ...session, cwd: await realpath(session.cwd) })).rejects.toThrow();
		expect(foreign.events).toEqual([]);

		const probe = await fixture();
		probe.server.cmd = async () => Promise.reject(new Error("tmux socket denied"));
		await expect(
			probe.process.nativeRuntimeClassification({ ...session, cwd: await realpath(session.cwd) }),
		).rejects.toThrow("tmux socket denied");

		const failedKill = await fixture();
		failedKill.pane.kill = async () => {
			throw new Error("tmux kill denied");
		};
		await expect(failedKill.process.kill({ ...session, cwd: await realpath(session.cwd) })).rejects.toThrow(
			"tmux kill denied",
		);
	});

	it("keeps normal and retired role ownership disjoint", async () => {
		for (const role of ["native-workspace", "retired-session"]) {
			const f = await fixture("live", role);
			await expect(f.process.kill({ ...session, cwd: await realpath(session.cwd) })).rejects.toThrow("ownership");
			expect(f.events).toEqual([]);
		}
		const retired = await fixture("live", "retired-session");
		await retired.process.killRetired({ ...session, cwd: await realpath(session.cwd) });
		expect(retired.events).toEqual(["kill-pane"]);
		const wrongRetired = await fixture("live", "live-preview");
		await expect(wrongRetired.process.killRetired({ ...session, cwd: await realpath(session.cwd) })).rejects.toThrow(
			"ownership",
		);
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
		await live.process.demote({ ...session, cwd: await realpath(session.cwd) });
		expect(live.options.get("@agentic_workspace_role")).toBe("retired-session");
		expect(writes).toHaveLength(2);
		await live.process.demote({ ...session, cwd: await realpath(session.cwd) });
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
			await expect(foreign.process.demote({ ...session, cwd: await realpath(session.cwd) })).rejects.toThrow(
				"ownership",
			);
			expect(mutations).toBe(0);
		}
	});

	it("never routes input or attach through a wrong-name pane and does not report it missing", async () => {
		const f = await fixture();
		let sends = 0;
		f.server.cmd = async (command: string) => {
			if (command === "list-panes")
				return [
					[
						"foreign-tmux-name",
						f.options.get("@agentic_workspace_root"),
						session.taskId,
						session.id,
						"live-preview",
						"%731",
						"0",
					].join("\t"),
				];
			if (command === "send-keys") sends++;
			return [""];
		};
		await expect(f.process.paneId({ ...session, cwd: await realpath(session.cwd) })).rejects.toThrow("ownership");
		await expect(f.process.sendKey({ ...session, cwd: await realpath(session.cwd) }, "enter")).rejects.toThrow(
			"ownership",
		);
		await expect(f.process.attach({ ...session, cwd: await realpath(session.cwd) })).rejects.toThrow("ownership");
		const alive = await f.process.alive({ ...session, cwd: await realpath(session.cwd) });
		expect(alive.exitCode).toBe(1);
		expect(alive.stderr).not.toBe(`tmux pane for session ${session.id} not found`);
		expect(sends).toBe(0);
	});
});
