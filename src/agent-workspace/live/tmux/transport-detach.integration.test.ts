import { expect, it, spyOn } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Core } from "../../../core/backlog.ts";
import type { Task } from "../../../types/index.ts";
import { BunRunner } from "../../session-process.ts";
import { SessionStore } from "../../session-store.ts";
import { AgentSessionService } from "../../sessions.ts";
import type { AgentSession } from "../../types.ts";
import { createExistingAgentHost } from "../existing-agent-host.ts";
import { createTmuxExec } from "./exec.ts";
import type { TmuxResult } from "./types.ts";

async function waitFor(check: () => boolean | Promise<boolean>, label: string): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (Date.now() < deadline) {
		if (await check()) return;
		await Bun.sleep(10);
	}
	throw new Error(`Timed out waiting for ${label}`);
}

it("detaches a default live-session transport before saturated slots admit canceled input or resize", async () => {
	const root = await realpath(await mkdtemp(join(tmpdir(), "backlog-default-transport-detach-")));
	const logPath = join(root, "calls.log");
	const releasePath = join(root, "release");
	const socketName = `transport-detach-${crypto.randomUUID()}`;
	const keys = [
		"PATH",
		"BACKLOG_CWD",
		"BACKLOG_TMUX_SOCKET",
		"TMUX_TMPDIR",
		"TMUX",
		"BACKLOG_EXEC_TEST_LOG",
		"BACKLOG_EXEC_TEST_RELEASE",
		"BACKLOG_EXEC_TEST_ROOT",
	] as const;
	const environment = keys.map((key) => [key, process.env[key]] as const);
	const controller = new AbortController();
	let active: Promise<TmuxResult>[] = [];
	let completedHolds = 0;
	let host: ReturnType<typeof createExistingAgentHost> | undefined;
	let restoreSpies = () => {};
	try {
		await writeFile(logPath, "");
		await mkdir(join(root, ".backlog"), { recursive: true });
		await writeFile(
			join(root, ".backlog", "agents.json"),
			JSON.stringify({
				selectedPreset: "fixture",
				presets: { fixture: { command: "pi", env: {}, prepare: "", bootstrap: "pi" } },
			}),
		);
		await writeFile(
			join(root, "tmux"),
			`#!/bin/sh
printf '%s\n' "$*" >> "$BACKLOG_EXEC_TEST_LOG"
case " $* " in
  *" hold "*) while [ ! -f "$BACKLOG_EXEC_TEST_RELEASE" ]; do /bin/sleep 0.01; done;;
  *" list-panes "*) printf 'backlog-fixture-session\t%s\tTASK-1\tsaved-session\tlive-preview\t%%1\t0\n' "$BACKLOG_EXEC_TEST_ROOT";;
  *" display-message "*) case "$*" in *pane_id*) printf '%%1 0\n';; *) printf '0\n';; esac;;
  *" capture-pane "*) printf 'fixture screen\n';;
esac
`,
		);
		await chmod(join(root, "tmux"), 0o755);
		process.env.PATH = `${root}${delimiter}/usr/bin${delimiter}/bin`;
		process.env.BACKLOG_CWD = root;
		process.env.BACKLOG_TMUX_SOCKET = socketName;
		process.env.TMUX_TMPDIR = root;
		process.env.TMUX = "/unrelated/client,123,0";
		process.env.BACKLOG_EXEC_TEST_LOG = logPath;
		process.env.BACKLOG_EXEC_TEST_RELEASE = releasePath;
		process.env.BACKLOG_EXEC_TEST_ROOT = root;
		const record: AgentSession = {
			id: "saved-session",
			taskId: "TASK-1",
			preset: "fixture",
			tmuxName: "backlog-fixture-session",
			cwd: root,
			createdAt: new Date().toISOString(),
			status: "running",
			outputPath: join(root, "output.log"),
			bootstrapPath: join(root, "bootstrap.md"),
		};
		await writeFile(record.outputPath, "");
		const store = new SessionStore(root, new BunRunner());
		await store.mutate(record.taskId, async (state) => {
			state.sessions.push(record);
		});
		const core = {
			filesystem: {
				rootDir: root,
				backlogDir: join(root, ".backlog"),
				loadTask: async (taskId: string) => ({ id: taskId, agentConfiguration: undefined }),
				taskArtifacts: { containerPath: async (taskId: string) => join(root, "artifacts", taskId) },
				withTaskLock: async (_task: unknown, operation: () => Promise<unknown>) => await operation(),
			},
		} as unknown as Core;
		const task: Task = {
			id: record.taskId,
			title: "Transport detach fixture",
			status: "To Do",
			assignee: [],
			createdDate: new Date().toISOString(),
			labels: [],
			dependencies: [],
			filePath: join(root, "task.md"),
		};
		core.loadTaskForMutation = async () => task;
		// No injected runner/server/transport: lookup must return the default factory's real pair.
		const service = new AgentSessionService(core);
		const live = await service.liveSession(record.taskId, record.id);
		if (!live?.exec)
			throw new Error(
				`Default liveSession did not return its cancellable executor; fixture dispatches: ${(await readFile(logPath, "utf8")).slice(0, 1_000)}`,
			);
		expect(live.record).toEqual(record);
		expect(live.paneId).toBe("%1");
		const serverCommands = spyOn(live.server, "cmd");
		const executorCalls = spyOn(live.exec, "run");
		restoreSpies = () => {
			executorCalls.mockRestore();
			serverCommands.mockRestore();
		};
		const errors: Error[] = [];
		host = createExistingAgentHost({
			server: live.server,
			exec: live.exec,
			paneId: live.paneId,
			readOnly: false,
			outputPath: live.record.outputPath,
			onOutput: () => {},
			onError: (error) => errors.push(error),
		});
		await host.start();
		// A different real executor proves admission is shared with the service-created executor.
		const saturator = createTmuxExec({ socketName });
		active = Array.from({ length: 32 }, (_, index) =>
			saturator.run(["hold", String(index)], { signal: controller.signal }).finally(() => {
				completedHolds++;
			}),
		);
		const dispatched = async () => (await readFile(logPath, "utf8")).trim().split("\n");
		await waitFor(
			async () => (await dispatched()).filter((line) => line.includes(" hold ")).length === 32,
			"all 32 real capture slots to be occupied",
		);
		host.sendBytes(new Uint8Array([0x61]));
		const resize = host.resize(91, 27).then(
			() => undefined,
			(error: unknown) => error,
		);
		const queuedCalls = () =>
			executorCalls.mock.calls.filter(([argv]) => argv[0] === "send-keys" || argv[0] === "resize-window");
		await waitFor(() => queuedCalls().length === 2, "production input worker and resize to enter the real executor");
		for (const [argv, options] of queuedCalls()) {
			expect(argv).toContain("%1");
			expect((options?.admissionSignal ?? options?.signal)?.aborted).toBe(false);
		}
		const mutations = (lines: string[]) => lines.filter((line) => /send-keys|resize-window|resize-pane/.test(line));
		expect(mutations(await dispatched())).toEqual([]);
		const detach = host.detach?.().then(
			() => undefined,
			(error: unknown) => error,
		);
		const detachError = await detach;
		expect(completedHolds).toBe(0);
		for (const [, options] of queuedCalls()) expect((options?.admissionSignal ?? options?.signal)?.aborted).toBe(true);
		expect(serverCommands).not.toHaveBeenCalled();
		expect(detachError).toBeUndefined();
		expect(String(await resize)).toContain("Existing agent host stopped before resize dispatch");
		expect(errors).toEqual([]);
		expect(await host.detach?.()).toBe("retained");
		expect(completedHolds).toBe(0);
		await writeFile(releasePath, "release");
		expect((await Promise.all(active)).every((result) => result.exitCode === 0)).toBe(true);
		expect(completedHolds).toBe(32);
		// Fence after admission resumes: all canceled waiters must be gone before new work runs.
		expect((await live.exec.run(["display-message", "-p", "-t", live.paneId, "#{pane_dead}"])).exitCode).toBe(0);
		expect(mutations(await dispatched())).toEqual([]);
		expect(serverCommands).not.toHaveBeenCalled();
		for (const line of await dispatched()) expect(line).toMatch(new RegExp(`^-L ?${socketName} `));
	} finally {
		// Release and abort only fixture commands, then drain before restoring PATH or deleting files.
		await writeFile(releasePath, "release");
		await Promise.allSettled(active);
		controller.abort(new Error("Fixture cleanup"));
		await host?.stop().catch(() => {});
		restoreSpies();
		for (const [key, value] of environment) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		await rm(root, { recursive: true, force: true });
	}
}, 20_000);
