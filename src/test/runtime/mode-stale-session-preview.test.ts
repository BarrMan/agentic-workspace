import { afterEach, describe, expect, it, mock } from "bun:test";
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../../controller/agentic-workspace.ts";
import * as processTree from "../../lib/process-tree.ts";
import type { AgentSession } from "../../model/session/types.ts";
import type { ProcessRunner, TmuxServer } from "../../runtime/sessions.ts";
import { getDefaultModeCatalog, initializeAgentConfiguration, upsertAgentConfiguration } from "../../storage/config.ts";
import { SessionStore } from "../../storage/session-store.ts";
import { coreFileSystem, initializeTestProject } from "../test-utils.ts";

const processRows: processTree.ProcessRow[] = [
	{
		pid: 4242,
		ppid: 1,
		pgid: 4242,
		uid: typeof process.getuid === "function" ? process.getuid() : 0,
		stat: "S",
		started: "fake-start",
	},
];
mock.module("../../lib/process-tree.ts", () => ({
	...processTree,
	readProcessTable: () => processRows,
	snapshotProcessGroup: (pid: number) => [{ pid, started: "fake-start" }],
	terminateProcessTree: async () => "terminated",
	terminateOwnedDescendants: async () => "terminated",
	deadPaneGroupState: () => "gone",
}));
const { AgentSessionService } = await import("../../runtime/sessions.ts");

class DeadProcessHarness implements ProcessRunner, TmuxServer {
	readonly commands: string[][] = [];
	readonly respawns: string[] = [];
	readonly metadata = new Map<string, Record<string, string>>();
	readonly paneHandles = new Map<string, Awaited<ReturnType<TmuxServer["newSession"]>>["activePane"]>();
	readonly sessionNames = new Map<string, string>();
	readonly dead = new Set<string>();
	private nextPane = 0;
	row?: string;
	probeError?: Error;
	async run(args: string[]) {
		this.commands.push(args);
		return { exitCode: 0, stdout: "12345 S", stderr: "" };
	}
	async newSession(_options: { name?: string } = {}): Promise<Awaited<ReturnType<TmuxServer["newSession"]>>> {
		const id = `%${++this.nextPane}`;
		const name = _options.name ?? "";
		this.sessionNames.set(id, name);
		this.row = [name, "", "", "", "", "", "4242", "0", id, "", ""].join("\t");
		this.metadata.set(id, {});
		const pane = {
			id,
			window: { setOption: async () => {} },
			setOption: async (name: string, value: string) => {
				const metadata = this.metadata.get(id) ?? {};
				metadata[name] = value;
				this.metadata.set(id, metadata);
				if (this.row?.split("\t")[8] === id) {
					const row = this.row.split("\t");
					const columns: Record<string, number> = {
						"@agentic_workspace_root": 1,
						"@agentic_workspace_task": 2,
						"@agentic_workspace_session": 3,
						"@agentic_workspace_role": 4,
						"@agentic_workspace_owner_pid": 5,
					};
					const column = columns[name];
					if (column !== undefined) row[column] = value;
					this.row = row.join("\t");
				}
			},
			setTitle: async () => {},
			pipeTo: async () => {},
			respawn: async (command?: string) => {
				if (command) this.respawns.push(command);
			},
			displayMessage: async (message: string) =>
				message === "#{pane_id} #{pane_dead}" ? [`${id} ${this.dead.has(id) ? "1" : "0"}`] : ["0"],
			kill: async () => {
				this.metadata.delete(id);
				this.paneHandles.delete(id);
				this.sessionNames.delete(id);
				this.dead.delete(id);
				if (this.row?.split("\t")[8] === id) this.row = undefined;
			},
		};
		this.paneHandles.set(id, pane);
		return { activePane: pane };
	}
	async panes(): Promise<Iterable<NonNullable<Awaited<ReturnType<TmuxServer["newSession"]>>["activePane"]>>> {
		return [...this.paneHandles.values()].filter((pane) => pane !== undefined);
	}
	async cmd(_command: string, args: readonly string[] = []) {
		const target = args[args.indexOf("-t") + 1] ?? "";
		if (_command === "display-message") {
			if (args.includes("#{pane_id} #{pane_dead}")) {
				const dead = target === this.row?.split("\t")[8] && this.row?.split("\t")[7] === "1";
				return [`${target} ${dead ? "1" : "0"}`];
			}
			if (args.includes("#{pane_pid} #{pane_dead}")) return ["4242 0"];
		}
		if (args.some((arg) => arg.includes("@agentic_workspace_launch_resources")))
			return [this.metadata.get(target)?.["@agentic_workspace_launch_resources"] ?? ""];
		if (this.probeError) throw this.probeError;
		if (this.row) {
			const format = args[args.indexOf("-F") + 1] ?? "";
			if (args.includes("-t")) {
				const target = args[args.indexOf("-t") + 1] ?? "";
				const metadata = this.metadata.get(target);
				if (metadata) {
					const values: Record<string, string> = {
						...metadata,
						session_name: this.row.split("\t")[0] ?? "",
						pane_id: target,
						pane_dead: this.dead.has(target) ? "1" : "0",
						window_id: "@1",
						pane_title: "TASK-1 live-preview",
					};
					return [format.replace(/#\{([^}]+)\}/g, (_match, key: string) => values[key] ?? "")];
				}
				if (target !== `=${this.row.split("\t")[0]}:` && target !== this.row.split("\t")[8])
					throw new TmuxCommandError({
						args: [_command, ...args],
						exitCode: 1,
						target,
						stderr: [
							target.startsWith("=") ? `can't find session: ${target.slice(1, -1)}` : `can't find pane: ${target}`,
						],
					});
			}
			const [session_name, root, task, session, role, owner, pane_pid, pane_dead, pane_id, endpoint, generation] =
				this.row.split("\t");
			const requestedTarget = args.includes("-t") ? (args[args.indexOf("-t") + 1] ?? "") : undefined;
			if (requestedTarget && requestedTarget !== `=${session_name}:`) return [];
			const taggedRows = [...this.metadata].map(([id, metadata]) => ({
				...metadata,
				session_name: session_name ?? "",
				pane_id: id,
				pane_dead: this.dead.has(id) ? "1" : "0",
				window_id: "@1",
				pane_title: "TASK-1 live-preview",
			}));
			const rows: Record<string, string>[] = [
				...(taggedRows.length
					? []
					: [
							{
								session_name: session_name ?? "",
								"@agentic_workspace_root": root ?? "",
								"@agentic_workspace_task": task ?? "",
								"@agentic_workspace_session": session ?? "",
								"@agentic_workspace_role": role ?? "",
								"@agentic_workspace_owner_pid": owner ?? "",
								"@agentic_workspace_native_session_id":
									[...this.metadata.values()].find(
										(metadata) => metadata["@agentic_workspace_role"] === "live-preview",
									)?.["@agentic_workspace_native_session_id"] ?? "native-conversation-exact",
								"@agentic_workspace_native_provider": "opencode",
								"@agentic_workspace_completion_endpoint": endpoint ?? "",
								"@agentic_workspace_completion_generation": generation ?? "",
								pane_pid: pane_pid ?? "",
								pane_dead: pane_dead ?? "",
								pane_id: pane_id ?? "",
								window_id: "@1",
								pane_title: "TASK-1 live-preview",
							},
						]),
				...taggedRows,
			];
			return rows.map((values) => format.replace(/#\{([^}]+)\}/g, (_match, key: string) => values[key] ?? ""));
		}
		throw new TmuxCommandError({
			args: ["list-panes", "-t", "=dead-pane:"],
			exitCode: 1,
			target: "=dead-pane:",
			stdout: [],
			stderr: ["can't find session: dead-pane"],
		});
	}
}

describe("stale persisted mode session preview", () => {
	const roots: string[] = [];
	const originalXdg = process.env.XDG_CONFIG_HOME;
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = originalXdg;
	});

	it("passively settles a dead running record and only resumes its exact identity on explicit prepare", async () => {
		const root = await mkdtemp(join(tmpdir(), "mode-stale-session-preview-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "isolated-config-home");
		const core = new Core(root);
		await initializeTestProject(core, "Stale mode session");
		const createdTask = await core.createTaskFromInput({ title: "Stale session task", status: "To Do" });
		const taskId = createdTask.task.id;
		const task = await coreFileSystem(core).loadTask(taskId);
		expect(task?.id).toBe(taskId);
		if (!task) throw new Error(`Expected task ${taskId} to be loaded`);
		const opencode = join(root, "opencode-v1");
		await writeFile(opencode, "#!/usr/bin/env bun\nif (process.argv.includes('--version')) console.log('1.19.0');\n");
		await chmod(opencode, 0o700);
		await initializeAgentConfiguration(core, "project");
		await upsertAgentConfiguration(core, "project", {
			modes: getDefaultModeCatalog(),
			sessions: { worktreePerTask: false, yoloMode: true },
			selectedPreset: "contract",
			presets: {
				contract: { command: opencode, env: {}, prepare: "", bootstrap: "opencode", resumeFlag: "--session" },
			},
		});
		const harness = new DeadProcessHarness();
		let service = new AgentSessionService(core, { runner: harness, tmuxServer: harness });
		const store = new SessionStore(root, harness);
		const sessionPaths = await store.paths(taskId);
		const taskRoot = await coreFileSystem(core).taskArtifacts.containerPath(taskId);
		const stale: AgentSession = {
			id: randomUUID(),
			taskId,
			preset: "contract",
			tmuxName: "dead-pane",
			cwd: taskRoot,
			createdAt: "2026-10-10T00:00:00.000Z",
			status: "running",
			nativeSessionId: "native-conversation-exact",
			nativeWorkspace: true,
			outputPath: join(sessionPaths.taskDir, "conversation.log"),
			bootstrapPath: join(sessionPaths.taskDir, "conversation.prompt"),
			pathContext: { projectDir: root, worktreeDir: taskRoot, taskDir: taskRoot },
			ownerPid: process.pid,
		};
		await store.mutateMode(taskId, "plan", async (history) => {
			history.sessions.push(stale);
			history.activeSessionId = stale.id;
		});
		const before = await store.read(taskId);
		const history = await service.listMode(taskId, "plan");
		expect(history.activeSessionId).toBe(stale.id);
		expect(harness.commands).toEqual([]);
		expect(before.modes?.plan?.activeSessionId).toBe(stale.id);
		await service.reconcileTaskSessions(taskId);
		expect((await store.readMode(taskId, "plan")).sessions[0]?.status).toBe("stopped");
		await store.mutateSession(taskId, stale.id, async (current) => {
			Object.assign(current, stale);
		});
		// A live PID alone is not a live conversation. No passive launch or replacement history.
		expect(await service.liveSession(taskId, stale.id, { passive: true })).toBeUndefined();
		const stopped = await store.readMode(taskId, "plan");
		expect(stopped.sessions[0]?.status).toBe("stopped");
		expect(stopped.sessions[0]?.ownerPid).toBeUndefined();
		expect(stopped.activeSessionId).toBe(stale.id);
		expect(stopped.sessions[0]?.pathContext).toEqual(stale.pathContext);
		expect(harness.commands).toEqual([]);

		await store.mutateSession(taskId, stale.id, async (current) => {
			Object.assign(current, stale);
		});
		harness.row = [
			stale.tmuxName,
			realpathSync(root),
			taskId,
			stale.id,
			"live-preview",
			process.pid,
			"12345",
			"0",
			"%42",
			"",
			"",
		].join("\t");
		const { activePane: sharedPane } = await harness.newSession({ name: stale.tmuxName });
		if (!sharedPane) throw new Error("Expected a test-owned shared execution pane");
		const fixtureRow = harness.row?.split("\t");
		if (fixtureRow) {
			fixtureRow[8] = sharedPane.id;
			harness.row = fixtureRow.join("\t");
		}
		const nativeSessionId = stale.nativeSessionId;
		if (!nativeSessionId) throw new Error("Expected the stale fixture's native identity");
		for (const [name, value] of Object.entries({
			"@agentic_workspace_root": realpathSync(root),
			"@agentic_workspace_task": taskId,
			"@agentic_workspace_session": stale.id,
			"@agentic_workspace_role": "live-preview",
			"@agentic_workspace_native_session_id": nativeSessionId,
			"@agentic_workspace_native_provider": "opencode",
		}))
			await sharedPane.setOption(name, value);
		const launchesBeforeLivePrepare = harness.respawns.length;
		const alreadyLive = await service.prepareNativeSession(taskId, stale.id, "plan");
		expect(alreadyLive.record.id).toBe(stale.id);
		expect(alreadyLive.paneId).toBe(sharedPane.id);
		expect(harness.respawns).toHaveLength(launchesBeforeLivePrepare);
		const ownedHistory = await store.readMode(taskId, "plan");
		for (const passive of [true, false]) {
			const preview = await service.liveSession(taskId, stale.id, { passive });
			expect(preview).toMatchObject({
				paneId: sharedPane.id,
				record: { id: stale.id, ownerPid: process.pid },
			});
			expect(preview?.server).toBe(harness);
			expect(await store.readMode(taskId, "plan")).toEqual(ownedHistory);
		}

		const sharedMetadata = harness.metadata.get(sharedPane.id);
		if (!sharedMetadata) throw new Error("Expected shared execution pane metadata");
		const launchesBeforeMismatch = harness.respawns.length;
		sharedMetadata["@agentic_workspace_native_session_id"] = "foreign-conversation";
		await expect(service.prepareNativeSession(taskId, stale.id, "plan")).rejects.toThrow("refusing to retag it");
		await expect(service.liveSession(taskId, stale.id, { passive: true })).rejects.toThrow("refusing to retag it");
		expect(harness.respawns).toHaveLength(launchesBeforeMismatch);
		harness.probeError = new Error("transport timed out");
		await expect(service.liveSession(taskId, stale.id, { passive: true })).rejects.toThrow("transport timed out");
		expect((await store.readMode(taskId, "plan")).sessions[0]?.status).toBe("running");
		harness.probeError = undefined;
		sharedMetadata["@agentic_workspace_native_session_id"] = nativeSessionId;
		// A dead matching pane is stopped on observation and remains eligible for exact explicit resume.
		harness.dead.add(sharedPane.id);
		expect(await service.liveSession(taskId, stale.id, { passive: true })).toBeUndefined();
		expect((await store.readMode(taskId, "plan")).sessions[0]?.status).toBe("stopped");
		expect(harness.metadata.has(sharedPane.id)).toBe(true);
		expect(harness.dead.has(sharedPane.id)).toBe(true);
		expect([...(await harness.panes())].map(({ id }) => id)).toContain(sharedPane.id);

		const prepared = await service.prepareNativeSession(taskId, stale.id, "plan");
		expect(prepared.record.id).toBe(stale.id);
		expect(prepared.record.nativeSessionId).toBe(stale.nativeSessionId);
		expect(prepared.record.cwd).toBe(stale.cwd);
		expect(prepared.record.pathContext).toEqual(stale.pathContext);
		expect(prepared.bootstrap).toBe("opencode-v1");
		expect(harness.respawns.at(-1)).toContain("native-conversation-exact");
		expect(harness.respawns.at(-1)).toContain("--session");
		expect(harness.respawns.at(-1)).toContain("--auto");
		await store.mutateSession(taskId, stale.id, async (current) => {
			current.status = "parked";
			current.ownerPid = undefined;
		});
		const resumedPane = [...harness.paneHandles.values()].at(-1);
		if (resumedPane) {
			await resumedPane.kill();
			harness.metadata.delete(resumedPane.id);
			harness.paneHandles.delete(resumedPane.id);
		}
		await upsertAgentConfiguration(core, "project", {
			modes: getDefaultModeCatalog(),
			sessions: { worktreePerTask: false, yoloMode: false },
			selectedPreset: "contract",
			presets: {
				contract: { command: opencode, env: {}, prepare: "", bootstrap: "opencode", resumeFlag: "--session" },
			},
		});
		service = new AgentSessionService(core, { runner: harness, tmuxServer: harness });
		const resumedWithYoloOff = await service.prepareNativeSession(taskId, stale.id, "plan");
		expect(resumedWithYoloOff.record.pathContext).toEqual(stale.pathContext);
		expect(resumedWithYoloOff.bootstrap).toBe("opencode-v1");
		expect(harness.respawns.at(-1)).not.toContain("--auto");
		expect(harness.respawns.at(-1)).toContain("--session");
	});
});
