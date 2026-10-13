import { afterEach, describe, expect, it, mock } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../core/backlog.ts";
import { initializeTestProject } from "../test/test-utils.ts";
import type { Agent } from "./agents/agent.ts";
import { agentFor, builtInAgents, registerAgent } from "./agents/agents.ts";
import { buildAgentResumeCommand } from "./bootstrap.ts";
import type { PreparedLaunchResources } from "./completion-supervisor-resources.ts";
import { initializeAgentConfiguration, loadAgentConfiguration, upsertAgentConfiguration } from "./config.ts";
import * as processTree from "./process-tree.ts";
import * as sessionLaunch from "./session-launch.ts";
import { SessionStore } from "./session-store.ts";
import type { ProcessRunner, SessionRuntimeOrigin, TmuxServer } from "./sessions.ts";
import { sessionActivityDir } from "./status-hooks.ts";
import type { AgentConfiguration } from "./types.ts";
import type { WorkspaceContext } from "./workspace-context.ts";

const realPrepareAgentLaunch = sessionLaunch.prepareAgentLaunch;
const realPrepareAgentLaunchResources = sessionLaunch.prepareAgentLaunchResources;
mock.module("./process-tree.ts", () => ({
	...processTree,
	readProcessTable: () => [
		{ pid: 4242, ppid: 1, pgid: 4242, uid: process.getuid?.() ?? 0, stat: "S", started: "fake-start" },
	],
	snapshotProcessGroup: (pid: number) => [{ pid, started: "fake-start" }],
	terminateProcessTree: async () => "terminated",
	deadPaneGroupState: () => "gone",
}));
let afterPrepareAgentLaunch:
	| ((
			prepared: Awaited<ReturnType<typeof sessionLaunch.prepareAgentLaunch>>,
			options: Parameters<typeof sessionLaunch.prepareAgentLaunch>[2],
	  ) =>
			| Promise<Awaited<ReturnType<typeof sessionLaunch.prepareAgentLaunch>>>
			| Awaited<ReturnType<typeof sessionLaunch.prepareAgentLaunch>>)
	| undefined;
mock.module("./session-launch.ts", () => ({
	...sessionLaunch,
	prepareAgentLaunchResources: async (...args: Parameters<typeof sessionLaunch.prepareAgentLaunchResources>) => {
		const prepared = await realPrepareAgentLaunchResources(...args);
		return (await afterPrepareAgentLaunch?.(prepared, args[1].options)) ?? prepared;
	},
	prepareAgentLaunch: async (...args: Parameters<typeof sessionLaunch.prepareAgentLaunch>) => {
		const prepared = await realPrepareAgentLaunch(...args);
		return (await afterPrepareAgentLaunch?.(prepared, args[2])) ?? prepared;
	},
}));
const { AgentSessionService } = await import("./sessions.ts");
const { readWorkspaceRequests, writeWorkspaceRequest } = await import("./workspace-context.ts");

function originOf(attachment: { record: import("./types.ts").AgentSession; paneId: string }): SessionRuntimeOrigin {
	return { record: structuredClone(attachment.record), paneId: attachment.paneId };
}

type FakePane = {
	id: string;
	window: { setOption(name: string, value: string): Promise<void> };
	setOption(name: string, value: string): Promise<void>;
	setTitle(title: string): Promise<void>;
	pipeTo(command?: string): Promise<void>;
	respawn(command?: string): Promise<void>;
	displayMessage(message: string): Promise<readonly string[]>;
	kill(): Promise<void>;
};

class FakeRuntime implements ProcessRunner, TmuxServer {
	readonly panesById = new Map<string, { name: string; options: Record<string, string>; dead: boolean }>();
	readonly launches: string[] = [];
	readonly runEnvironments: Record<string, string>[] = [];
	readonly optionWrites: Array<{ paneId: string; option: string; value: string }> = [];
	unknownNativeProbe = false;
	failTag = false;
	failLaunch = false;
	failPrepare = false;
	exitOnLaunch = false;
	kills = 0;
	afterLaunch?: () => Promise<void>;
	onKill?: () => Promise<void>;
	private next = 0;

	async run(_args: string[], options?: { env?: Record<string, string> }) {
		this.runEnvironments.push(options?.env ?? {});
		if (this.failPrepare) {
			this.failPrepare = false;
			return { exitCode: 1, stdout: "", stderr: "fake predispatch failure" };
		}
		return { exitCode: 0, stdout: "4242 S", stderr: "" };
	}

	async newSession(options: { name?: string } = {}) {
		const id = `%${++this.next}`;
		this.panesById.set(id, { name: options.name ?? "", options: {}, dead: false });
		return { activePane: this.pane(id) };
	}

	async panes(): Promise<Iterable<FakePane>> {
		return [...this.panesById.keys()].map((id) => this.pane(id));
	}

	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		if (this.unknownNativeProbe && command === "list-panes") throw new Error("transient tmux failure");
		if (command === "set-option") {
			if (this.failTag) {
				this.failTag = false;
				throw new Error("controlled predispatch tag failure");
			}
			const paneId = args[args.indexOf("-t") + 1];
			const option =
				args.at(-1) === "@backlog_native_session_id" || args.at(-1) === "@backlog_native_provider"
					? args.at(-1)
					: args.at(-2);
			const value = args.at(-1);
			const pane = this.panesById.get(paneId ?? "");
			if (pane && option) {
				this.optionWrites.push({ paneId: paneId ?? "", option, value: value ?? "" });
				if (args.includes("-u")) delete pane.options[option];
				else if (value) pane.options[option] = value;
			}
			return [];
		}
		if (
			command === "list-panes" &&
			args.at(-1)?.includes("#{pane_id}") &&
			args.at(-1)?.includes("@backlog_native_session_id")
		) {
			const paneId = args[args.indexOf("-t") + 1];
			const pane = this.panesById.get(paneId ?? "");
			return pane
				? [
						[
							pane.options["@backlog_root"],
							pane.options["@backlog_task"],
							pane.options["@backlog_session"],
							paneId,
							pane.options["@backlog_native_session_id"],
							pane.options["@backlog_native_provider"],
						].join("\t"),
					]
				: [];
		}
		if (command === "list-panes" && args.at(-1)?.includes("#{session_name}")) {
			const target = args[args.indexOf("-t") + 1]?.replace(/^=/, "").replace(/:$/, "");
			const matches = [...this.panesById].filter(([, pane]) => pane.name === target);
			if (matches.length === 0)
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					stderr: [`can't find session: ${target}`],
					target: args[args.indexOf("-t") + 1] ?? "",
				});
			return matches.map(([paneId, pane]) => {
				const identity = [
					pane.name,
					pane.options["@backlog_root"],
					pane.options["@backlog_task"],
					pane.options["@backlog_session"],
					pane.options["@backlog_role"],
				];
				return [
					...identity,
					...(args.at(-1)?.includes("#{pane_pid}")
						? ["4242", pane.dead ? "1" : "0", paneId]
						: [paneId, pane.dead ? "1" : "0"]),
				].join("\t");
			});
		}
		if (command === "list-panes" && args.at(-1)?.includes("@backlog_native_session_id"))
			return [...this.panesById].map(([paneId, pane]) =>
				[
					pane.options["@backlog_root"],
					pane.options["@backlog_task"],
					pane.options["@backlog_session"],
					...(args.at(-1)?.includes("#{pane_id}") ? [paneId] : []),
					pane.options["@backlog_native_session_id"],
					...(args.at(-1)?.includes("@backlog_native_provider") ? [pane.options["@backlog_native_provider"]] : []),
				].join("\t"),
			);
		if (command === "list-panes")
			return [...this.panesById].map(([paneId, pane]) =>
				[
					paneId,
					pane.dead ? "1" : "0",
					"@agent",
					pane.options["@backlog_root"],
					pane.options["@backlog_task"],
					pane.options["@backlog_session"],
					pane.options["@backlog_role"],
					"",
				].join("\t"),
			);
		if (command === "display-message") {
			const format = args.at(-1);
			if (format === "#{@backlog_launch_resources}")
				return [this.panesById.get(args[2] ?? "")?.options["@backlog_launch_resources"] ?? ""];
			const pane = this.panesById.get(args[2] ?? "");
			if (format === "#{pane_pid} #{pane_dead}") return [`4242 ${pane?.dead ? "1" : "0"}`];
			return [format === "#{pane_id} #{pane_dead}" ? `${args[2]} ${pane?.dead ? "1" : "0"}` : "0 0"];
		}
		return [];
	}

	private pane(id: string): FakePane {
		const entry = this.panesById.get(id);
		if (!entry) throw new Error(`Missing fake pane ${id}`);
		return {
			id,
			window: { setOption: async () => {} },
			setOption: async (name, value) => {
				entry.options[name] = value;
			},
			setTitle: async () => {},
			pipeTo: async () => {},
			respawn: async (command) => {
				if (this.failLaunch) {
					this.failLaunch = false;
					throw new Error("fake publication failure");
				}
				if (command) this.launches.push(command);
				entry.dead = this.exitOnLaunch;
				await this.afterLaunch?.();
			},
			displayMessage: async (message) =>
				message === "#{pane_id} #{pane_dead}" ? [`${id} ${entry.dead ? "1" : "0"}`] : ["0 0"],
			kill: async () => {
				await this.onKill?.();
				this.kills++;
				this.panesById.delete(id);
			},
		};
	}
}

describe("shared runtime session service", () => {
	const roots: string[] = [];
	const originalXdg = process.env.XDG_CONFIG_HOME;
	async function resumeFixture(bootstrap: "pi" | "claude" | "opencode-v1" = "pi") {
		const root = await mkdtemp(join(tmpdir(), `shared-runtime-resume-${bootstrap}-`));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Resume policy");
		await core.createTaskFromInput({ title: "Resume task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		const command = join(root, "fake-opencode");
		if (bootstrap === "opencode-v1") {
			await writeFile(command, '#!/bin/sh\n[ "$1" = --version ] && { echo 1.19.0; exit 0; }\nexit 0\n');
			await chmod(command, 0o700);
		}
		const presetName = `resume-${bootstrap}`;
		const agentBootstrap = bootstrap === "opencode-v1" ? "opencode" : bootstrap;
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: presetName,
			presets: {
				[presetName]: {
					command: bootstrap === "opencode-v1" ? command : "fake-agent",
					env: {},
					prepare: "",
					bootstrap: agentBootstrap,
				},
			},
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, { runner: runtime, tmuxServer: runtime });
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const store = new SessionStore(root, runtime);
		const nativeSessionId = started.record.nativeSessionId ?? "ses_failed_old";
		await store.mutateSession("TASK-1", started.record.id, async (session) => {
			session.nativeSessionId = nativeSessionId;
			session.status = "running";
		});
		const pane = runtime.panesById.get(started.paneId);
		if (!pane) throw new Error("Missing original owned pane");
		pane.dead = true;
		return {
			root,
			core,
			runtime,
			service,
			store,
			sessionId: started.record.id,
			nativeSessionId,
			paneId: started.paneId,
		};
	}
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = originalXdg;
	});

	it.each([
		"native",
		"direct",
	] as const)("tears down and fails a %s placeholder when predispatch cleanup rejects", async (route) => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-cleanup-failure-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Predispatch cleanup failure");
		await core.createTaskFromInput({ title: "Runtime task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, { runner: runtime, tmuxServer: runtime });
		afterPrepareAgentLaunch = async (launched, options) => {
			const sessionId = options.sessionId;
			if (!sessionId) throw new Error("Missing session identity at launch preparation");
			// Both entry paths now publish identity through the same publisher, so a predispatch tag
			// failure is identical for either route.
			runtime.failTag = true;
			return {
				...launched,
				cleanup: async () => {
					await launched.cleanup();
					throw new Error("controlled prepared-resource cleanup failure");
				},
			};
		};
		try {
			const launch =
				route === "native" ? service.prepareNativeSession("task-1", undefined, "build") : service.start("task-1");
			await expect(launch).rejects.toThrow("controlled prepared-resource cleanup failure");
		} finally {
			afterPrepareAgentLaunch = undefined;
		}
		const state = await new SessionStore(root, runtime).read("TASK-1");
		const record =
			Object.values(state.modes ?? {})
				.flatMap((history) => history.sessions)
				.find((session) => session.status === "failed") ?? state.sessions[0];
		expect(record?.status).toBe("failed");
		expect(record?.error).toContain("controlled predispatch tag failure");
		expect(runtime.launches).toHaveLength(0);
		expect(runtime.kills).toBe(1);
		expect(runtime.panesById.size).toBe(0);
	});

	it("launches once and returns a verified shared attachment on retry", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-service-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime service");
		await core.createTaskFromInput({ title: "Runtime task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		const selected: AgentConfiguration = {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		};
		await upsertAgentConfiguration(core, "project", selected);
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});

		const started = await service.prepareNativeSession("task-1", undefined, "build");
		expect(started.record.status).toBe("running");
		expect(started.paneId).toMatch(/^%\d+$/);
		expect(started.bootstrap).toBe("pi");
		expect(runtime.launches).toHaveLength(1);
		expect(runtime.launches[0]).toContain('"paneId":"%1"');
		expect(runtime.launches[0]).toContain(`"sessionId":"${started.record.id}"`);
		const store = new SessionStore(root, runtime);
		expect((await store.read("TASK-1")).modes?.build?.activeSessionId).toBeUndefined();
		await service.activateNativeSession("task-1", started.record.id, originOf(started));
		expect((await store.read("TASK-1")).modes?.build?.activeSessionId).toBe(started.record.id);

		const pane = runtime.panesById.get(started.paneId);
		if (!pane) throw new Error("Missing native runtime pane");
		for (const [option, conflicting] of [
			["@backlog_root", join(root, "other-project")],
			["@backlog_task", "TASK-2"],
			["@backlog_session", "other-session"],
			["@backlog_native_provider", "claude"],
		] as const) {
			const established = pane.options[option];
			const writes = runtime.optionWrites.length;
			const launches = runtime.launches.length;
			pane.options[option] = conflicting;
			await expect(service.prepareNativeSession("task-1", started.record.id, "build")).rejects.toThrow();
			expect(runtime.optionWrites).toHaveLength(writes);
			expect(runtime.launches).toHaveLength(launches);
			pane.options[option] = established ?? "";
		}

		const retried = await service.prepareNativeSession("task-1", started.record.id, "build");
		expect(retried.record.id).toBe(started.record.id);
		expect(retried.paneId).toBe(started.paneId);
		expect(runtime.launches).toHaveLength(1);

		const outgoingPane = runtime.panesById.get(started.paneId);
		if (!outgoingPane) throw new Error("Missing owned outgoing pane");
		outgoingPane.dead = true;
		const resumed = await service.prepareNativeSession("task-1", started.record.id, "build");
		expect(resumed.record.id).toBe(started.record.id);
		expect(resumed.record.nativeSessionId).toBe(started.record.nativeSessionId);
		expect(runtime.launches).toHaveLength(2);
		expect(runtime.launches[1]).toContain(started.record.nativeSessionId);

		await core.createTaskFromInput({ title: "Alias task", status: "To Do" });
		const alias = await service.prepareNativeSession("task-2", undefined, "build");
		const aliasedNativeId = "ses_cross_task_alias";
		await store.mutateSession("TASK-1", resumed.record.id, async (session) => {
			session.nativeSessionId = aliasedNativeId;
		});
		await expect(service.liveSession("task-1", resumed.record.id)).rejects.toThrow("Native pane identity conflicts");
		await service.stop("task-2", alias.record.id);
		await store.mutateSession("TASK-2", alias.record.id, async (session) => {
			session.nativeSessionId = aliasedNativeId;
		});
		const launchesBeforeAliasResume = runtime.launches.length;
		const aliasAttachment = await service.prepareNativeSession("task-2", alias.record.id, "build");
		expect(aliasAttachment.record.nativeSessionId).toBe(aliasedNativeId);
		expect(runtime.launches).toHaveLength(launchesBeforeAliasResume + 1);
		expect(runtime.launches.at(-1)).toContain(aliasedNativeId);

		await store.reset("TASK-2");
		runtime.unknownNativeProbe = true;
		const launchesBeforeUncertainProbe = runtime.launches.length;
		await expect(service.prepareNativeSession("task-1", started.record.id, "build")).rejects.toThrow(
			"transient tmux failure",
		);
		expect(runtime.launches).toHaveLength(launchesBeforeUncertainProbe);

		runtime.unknownNativeProbe = false;
		await core.createTaskFromInput({ title: "Publication failure task", status: "To Do" });
		const killsBeforeDispatchFailure = runtime.kills;
		runtime.failLaunch = true;
		await expect(service.prepareNativeSession("task-3", undefined, "build")).rejects.toThrow(
			"fake publication failure",
		);
		expect(runtime.kills).toBe(killsBeforeDispatchFailure);
		expect((await service.list("task-3", "build")).sessions[0]?.status).toBe("starting");

		await core.createTaskFromInput({ title: "Publication failure task", status: "To Do" });
		const launchesBeforePublicationFailure = runtime.launches.length;
		const killsBeforePublicationFailure = runtime.kills;
		runtime.afterLaunch = async () => {
			const state = await new SessionStore(root, runtime).read("TASK-4");
			const record = state.sessions[0];
			if (!record) throw new Error("Missing record at publication failure seam");
			await new SessionStore(root, runtime).remove("TASK-4", record.id);
		};
		await expect(service.prepareNativeSession("task-4", undefined, "build")).rejects.toThrow("Agent session not found");
		runtime.afterLaunch = undefined;
		expect(runtime.launches).toHaveLength(launchesBeforePublicationFailure + 1);
		expect(runtime.kills).toBe(killsBeforePublicationFailure);
		expect((await service.list("task-4", "build")).sessions).toEqual([]);

		await core.createTaskFromInput({ title: "Predispatch cleanup task", status: "To Do" });
		const fakePiPreset = selected.presets["fake-pi"];
		if (!fakePiPreset) throw new Error("Missing fake Pi preset");
		const configuredFailure: AgentConfiguration = {
			...selected,
			presets: { "fake-pi": { ...fakePiPreset, prepare: "fake-prepare-failure" } },
		};
		await upsertAgentConfiguration(core, "project", configuredFailure);
		const launchesBeforePrepareFailure = runtime.launches.length;
		const killsBeforePrepareFailure = runtime.kills;
		runtime.failPrepare = true;
		await expect(service.prepareNativeSession("task-5", undefined, "build")).rejects.toThrow(
			"Agent preparation failed",
		);
		expect(runtime.launches).toHaveLength(launchesBeforePrepareFailure);
		expect(runtime.kills).toBe(killsBeforePrepareFailure + 1);

		await service.stop("task-1", resumed.record.id);
		await service.ask("task-1", "fixture question", { sessionId: resumed.record.id });
		expect(runtime.runEnvironments.at(-1)?.BACKLOG_WORKSPACE_CONTEXT).toBeUndefined();
		const currentPi = configuredFailure.presets["fake-pi"];
		if (!currentPi) throw new Error("Missing fake Pi preset");
		await upsertAgentConfiguration(core, "project", {
			...configuredFailure,
			presets: { "fake-pi": { ...currentPi, command: "fake-claude", bootstrap: "claude" } },
		});
		const runsBeforeProviderMismatch = runtime.runEnvironments.length;
		await expect(service.ask("task-1", "must not dispatch", { sessionId: resumed.record.id })).rejects.toThrow(
			"refusing to ask with a different provider",
		);
		expect(runtime.runEnvironments).toHaveLength(runsBeforeProviderMismatch);
		expect((await service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBe(aliasedNativeId);
		const killsBeforeProviderMismatch = runtime.kills;
		await expect(service.prepareNativeSession("task-1", resumed.record.id, "build")).rejects.toThrow(
			"belongs to provider pi, not claude",
		);
		expect(runtime.kills).toBe(killsBeforeProviderMismatch);

		await core.createTaskFromInput({ title: "Uncertain parked runtime", status: "To Do" });
		const parked = await service.prepareNativeSession("task-6", undefined, "build");
		await service.parkNativeSession("TASK-6", parked.record.id, originOf(parked));
		runtime.panesById.delete(parked.paneId);
		const secondParked = await service.prepareNativeSession("task-6", undefined, "plan");
		await service.parkNativeSession("TASK-6", secondParked.record.id, originOf(secondParked));
		runtime.panesById.delete(secondParked.paneId);
		runtime.unknownNativeProbe = true;
		const killsBeforeUncertainPreflight = runtime.kills;
		await expect(service.stopAllTaskSessions("TASK-6")).rejects.toThrow("transient tmux failure");
		expect(runtime.kills).toBe(killsBeforeUncertainPreflight);
		expect((await service.list("task-6", "build")).sessions[0]?.status).toBe("parked");
		runtime.unknownNativeProbe = false;
		const firstClaim = await store.claimSession("TASK-6", parked.record.id);
		const secondClaim = await store.claimSession("TASK-6", secondParked.record.id);
		await secondClaim();
		await firstClaim();
		const killsBeforeMissingStop = runtime.kills;
		await service.stopAllTaskSessions("TASK-6");
		expect(runtime.kills).toBe(killsBeforeMissingStop);
		expect((await service.list("task-6", "build")).sessions[0]?.status).toBe("stopped");
	});

	async function observationFixture() {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-observation-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime observation");
		await core.createTaskFromInput({ title: "Observation task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});
		const store = new SessionStore(root, runtime);
		return { root, service, store, runtime };
	}

	it.each([
		"native",
		"direct",
	] as const)("does not tear down or fail a %s launch after dispatch begins", async (route) => {
		const { service, store, runtime } = await observationFixture();
		const otherMode = await service.prepareNativeSession("task-1", undefined, "plan");
		runtime.afterLaunch = async () => {
			throw new Error("controlled post-dispatch failure");
		};
		const killsBeforeDispatch = runtime.kills;
		const launch =
			route === "native"
				? service.prepareNativeSession("task-1", undefined, "build")
				: service.start("task-1", { modeId: "build" });
		await expect(launch).rejects.toThrow("controlled post-dispatch failure");
		runtime.afterLaunch = undefined;
		const state = await store.read("TASK-1");
		const failedModeSession = state.modes?.build?.sessions[0];
		expect(runtime.kills).toBe(killsBeforeDispatch);
		expect(runtime.panesById.size).toBe(2);
		expect(failedModeSession?.status).toBe("starting");
		expect(state.modes?.plan?.sessions[0]?.id).toBe(otherMode.record.id);
		expect(state.modes?.plan?.sessions[0]?.status).toBe("running");
	});

	it("kills a dispatched direct STARTING session before task-wide STOPPED publication", async () => {
		const { service, store, runtime } = await observationFixture();
		runtime.afterLaunch = async () => {
			throw new Error("leave dispatched session starting");
		};
		await expect(service.start("task-1")).rejects.toThrow("leave dispatched session starting");
		runtime.afterLaunch = undefined;
		const stoppedState = await store.read("TASK-1");
		const beforeStop = Object.values(stoppedState.modes ?? {})
			.flatMap((history) => history.sessions)
			.find((session) => session.status === "starting");
		if (!beforeStop) throw new Error("Expected direct session to be persisted");
		expect(beforeStop.status).toBe("starting");
		let statusAtTeardown: string | undefined;
		runtime.onKill = async () => {
			const current = await store.read("TASK-1");
			statusAtTeardown = Object.values(current.modes ?? {})
				.flatMap((history) => history.sessions)
				.find((session) => session.id === beforeStop.id)?.status;
		};
		await service.stopAllTaskSessions("TASK-1");
		runtime.onKill = undefined;
		expect(statusAtTeardown).toBe("starting");
		const afterStop = await store.read("TASK-1");
		expect(
			Object.values(afterStop.modes ?? {})
				.flatMap((history) => history.sessions)
				.find((session) => session.id === beforeStop.id)?.status,
		).toBe("stopped");
		expect(runtime.panesById.size).toBe(0);
	});

	async function startingSession(
		service: InstanceType<typeof AgentSessionService>,
		store: SessionStore,
		nativeWorkspace: boolean | undefined,
	) {
		const attachment = await service.prepareNativeSession("task-1", undefined, "build");
		await store.mutateSession("TASK-1", attachment.record.id, async (session) => {
			session.status = "starting";
			session.nativeWorkspace = nativeWorkspace;
		});
		return attachment;
	}

	it.each([
		undefined,
		false,
		true,
	] as const)("never kills a live STARTING session during observation (nativeWorkspace=%s)", async (nativeWorkspace) => {
		const { service, store, runtime } = await observationFixture();
		await startingSession(service, store, nativeWorkspace);
		const killsBeforeObserve = runtime.kills;
		await service.reconcileTaskSessions("task-1");
		expect(runtime.kills).toBe(killsBeforeObserve);
		expect((await service.list("task-1", "build")).sessions[0]?.status).toBe("starting");
	});

	it("attaches live STARTING records before refusing unverified non-live pending launches", async () => {
		const { service, store, runtime } = await observationFixture();
		const original = await service.prepareNativeSession("task-1", undefined, "build");
		await store.mutateSession("TASK-1", original.record.id, async (session) => {
			session.status = "starting";
		});
		const launches = runtime.launches.length;
		const attached = await service.prepareNativeSession("task-1", original.record.id, "build");
		expect(attached.paneId).toBe(original.paneId);
		expect(runtime.launches).toHaveLength(launches);
		const live = runtime.panesById.get(original.paneId);
		if (!live) throw new Error("Missing live native pane");
		live.dead = true;
		await expect(service.prepareNativeSession("task-1", original.record.id, "build")).rejects.toThrow(
			"unverified pending launch",
		);
		expect(runtime.launches).toHaveLength(launches);
		expect(runtime.kills).toBe(0);
	});

	it("leaves durable state unchanged after an uncertain observation", async () => {
		const { service, store, runtime } = await observationFixture();
		const live = await startingSession(service, store, true);
		runtime.unknownNativeProbe = true;
		const beforeTransient = await store.read("TASK-1");
		const panesBeforeTransient = structuredClone([...runtime.panesById]);
		await expect(service.liveSession("task-1", live.record.id, { passive: false })).rejects.toThrow(
			"transient tmux failure",
		);
		expect(await store.read("TASK-1")).toEqual(beforeTransient);
		expect([...runtime.panesById]).toEqual(panesBeforeTransient);
	});

	it("settles a conclusively dead STARTING runtime without killing it", async () => {
		const { service, store, runtime } = await observationFixture();
		const live = await startingSession(service, store, true);
		const killsBefore = runtime.kills;
		const livePane = runtime.panesById.get(live.paneId);
		if (!livePane) throw new Error("Missing live fake pane");
		livePane.dead = true;
		await service.reconcileTaskSessions("task-1");
		expect((await service.list("task-1", "build")).sessions[0]?.status).toBe("stopped");
		expect(runtime.kills).toBe(killsBefore);
	});

	it("settles missing STARTING sessions without a request marker", async () => {
		const { service, store, runtime } = await observationFixture();
		const missing = await service.prepareNativeSession("task-1", undefined, "build");
		await store.mutateSession("TASK-1", missing.record.id, async (session) => {
			session.status = "starting";
			session.nativeWorkspace = true;
		});
		runtime.panesById.delete(missing.paneId);
		await service.reconcileTaskSessions("task-1");
		expect(
			(await service.list("task-1", "build")).sessions.find((session) => session.id === missing.record.id)?.status,
		).toBe("stopped");
		expect(runtime.kills).toBe(0);
	});

	it("preserves missing queued STARTING sessions during observation", async () => {
		const { root, service, store, runtime } = await observationFixture();
		const queued = await service.prepareNativeSession("task-1", undefined, "build");
		await store.mutateSession("TASK-1", queued.record.id, async (session) => {
			session.status = "starting";
			session.nativeWorkspace = true;
		});
		runtime.panesById.delete(queued.paneId);
		await writeWorkspaceRequest(root, { taskId: "TASK-1", sessionId: queued.record.id, pid: process.pid });
		await service.reconcileTaskSessions("task-1");
		expect(
			(await service.list("task-1", "build")).sessions.find((session) => session.id === queued.record.id)?.status,
		).toBe("starting");
		expect(runtime.kills).toBe(0);
	});

	it("rejects stale callback origins after the same record resumes on a replacement pane", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-stale-origin-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime stale origin");
		await core.createTaskFromInput({ title: "Origin task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});
		const original = await service.prepareNativeSession("task-1", undefined, "build");
		const oldOrigin = originOf(original);
		await service.stop("task-1", original.record.id);
		const resumed = await service.prepareNativeSession("task-1", original.record.id, "build");
		const newOrigin = originOf(resumed);
		expect(newOrigin.paneId).not.toBe(oldOrigin.paneId);
		expect(await service.activateNativeSession("task-1", resumed.record.id, newOrigin)).toBe(true);
		const activeSessionId = (await service.list("task-1", "build")).activeSessionId;
		const writesBeforeStaleCallbacks = runtime.optionWrites.length;
		expect(await service.activateNativeSession("task-1", original.record.id, oldOrigin)).toBe(false);
		await service.parkNativeSession("task-1", original.record.id, oldOrigin);
		await service.finishNativeSession("task-1", original.record.id, oldOrigin, "stale finish");
		expect(runtime.optionWrites).toHaveLength(writesBeforeStaleCallbacks);
		const current = await service.list("task-1", "build");
		expect(current.activeSessionId).toBe(activeSessionId);
		expect(current.sessions[0]?.status).toBe("running");

		let enterAfterActivate!: () => void;
		const afterActivateEntered = new Promise<void>((resolve) => (enterAfterActivate = resolve));
		let releaseAfterActivate!: () => void;
		const afterActivateGate = new Promise<void>((resolve) => (releaseAfterActivate = resolve));
		const activation = service.activateNativeSession("task-1", resumed.record.id, newOrigin, async () => {
			enterAfterActivate();
			await afterActivateGate;
		});
		await afterActivateEntered;
		const killsBeforeContendedStop = runtime.kills;
		await expect(service.stop("task-1", resumed.record.id)).rejects.toThrow("being modified");
		expect(runtime.kills).toBe(killsBeforeContendedStop);
		releaseAfterActivate();
		expect(await activation).toBe(true);
		await service.stop("task-1", resumed.record.id);
		expect(runtime.kills).toBe(killsBeforeContendedStop + 1);

		const store = new SessionStore(root, runtime);
		await store.remove("TASK-1", resumed.record.id);
		const replacement = {
			...resumed.record,
			createdAt: "2026-10-12T00:00:00.000Z",
			tmuxName: `${resumed.record.tmuxName}-replacement`,
			status: "stopped" as const,
			ownerPid: undefined,
		};
		await store.mutateMode("TASK-1", "build", async (history) => {
			history.sessions.push(replacement);
		});
		let staleTaskCallback = false;
		expect(
			await service.activateNativeSession("task-1", replacement.id, newOrigin, async () => {
				staleTaskCallback = true;
			}),
		).toBe(false);
		expect(staleTaskCallback).toBe(false);
		expect((await service.list("task-1", "build")).sessions[0]?.status).toBe("stopped");
	});

	it("rejects a missing resume ID without disturbing the owned outgoing pane", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-missing-resume-id-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime missing resume ID");
		await core.createTaskFromInput({ title: "Missing identity task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const outgoingPane = runtime.panesById.get(started.paneId);
		if (!outgoingPane) throw new Error("Missing owned outgoing pane");
		outgoingPane.dead = true;
		const store = new SessionStore(root, runtime);
		await store.mutateSession("TASK-1", started.record.id, async (session) => {
			session.nativeSessionId = undefined;
		});
		const before = await store.read("TASK-1");
		const kills = runtime.kills;
		const launches = runtime.launches.length;
		const paneOptions = structuredClone(outgoingPane.options);
		await expect(service.prepareNativeSession("task-1", started.record.id, "build")).rejects.toThrow(
			"exact native session ID",
		);
		expect(runtime.kills).toBe(kills);
		expect(runtime.launches).toHaveLength(launches);
		expect(runtime.panesById.has(started.paneId)).toBe(true);
		expect(outgoingPane.dead).toBe(true);
		expect(outgoingPane.options).toEqual(paneOptions);
		expect(await store.read("TASK-1")).toEqual(before);
	});

	it("disabled auto-resume starts fresh only for eligible stopped owned sessions", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-disabled-resume-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Disabled auto-resume");
		await core.createTaskFromInput({ title: "Stopped task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, { runner: runtime, tmuxServer: runtime });
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const oldPane = runtime.panesById.get(started.paneId);
		if (!oldPane) throw new Error("Missing owned outgoing pane");
		oldPane.dead = true;
		const updated = await loadAgentConfiguration(core, "project");
		if (!updated) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...updated,
			sessions: {
				worktreePerTask: updated.sessions?.worktreePerTask ?? false,
				yoloMode: updated.sessions?.yoloMode ?? false,
				autoResumeOnRestart: false,
			},
		});
		const fresh = await service.prepareNativeSession("task-1", started.record.id, "build");
		expect(runtime.launches).toHaveLength(2);
		expect(fresh.record.nativeSessionId).not.toBe(started.record.nativeSessionId);
		expect(fresh.outcome).toEqual({ kind: "Fresh" });
	});

	it("resume startup failure preserves the SID and does not dispatch fresh", async () => {
		const f = await resumeFixture();
		const before = f.runtime.launches.length;
		let markerWasPublishedBeforeCleanup = false;
		f.runtime.exitOnLaunch = true;
		f.runtime.onKill = async () => {
			if (f.runtime.launches.length > before) {
				const record = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
				markerWasPublishedBeforeCleanup = record?.resumeProbeFailed?.nativeSessionId === f.nativeSessionId;
			}
		};
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow("ResumeFailed:");
		expect(f.runtime.launches).toHaveLength(before + 1);
		expect(markerWasPublishedBeforeCleanup).toBe(true);
		const failed = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(failed?.nativeSessionId).toBe(f.nativeSessionId);
		expect(failed?.status).toBe("failed");
	});

	it("next launch skips a failed SID and reports FreshAfterFailedResume", async () => {
		const f = await resumeFixture();
		f.runtime.exitOnLaunch = true;
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow("ResumeFailed:");
		const failure = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(failure?.resumeProbeFailed?.nativeSessionId).toBe(f.nativeSessionId);
		f.runtime.exitOnLaunch = false;
		const recreated = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		const before = f.runtime.launches.length;
		const fresh = await recreated.prepareNativeSession("task-1", f.sessionId, "build");
		expect(f.runtime.launches).toHaveLength(before + 1);
		expect(f.runtime.launches.at(-1)).toContain("--session-id");
		expect(f.runtime.launches.at(-1)).not.toContain("--session ");
		expect(fresh.record.nativeSessionId).not.toBe(f.nativeSessionId);
		expect(fresh.outcome).toEqual({
			kind: "FreshAfterFailedResume",
			nativeProvider: "pi",
			nativeSessionId: f.nativeSessionId,
		});
		expect(fresh.warnings?.join(" ")).toContain(f.nativeSessionId);
		expect(fresh.warnings?.join(" ")).not.toBe(fresh.record.error);
		const current = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(current?.resumeProbeFailed).toBeUndefined();
		expect(current?.nativeSessionId).not.toBe(f.nativeSessionId);
	});

	it("fresh failure is not reported as successful fallback", async () => {
		const f = await resumeFixture();
		f.runtime.exitOnLaunch = true;
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow("ResumeFailed:");
		f.runtime.exitOnLaunch = false;
		f.runtime.failLaunch = true;
		const recreated = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		await expect(recreated.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow(
			"fake publication failure",
		);
		const record = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(record?.resumeProbeFailed).toBeUndefined();
		expect(record?.error ?? "").not.toContain("FreshAfterFailedResume");
	});

	it("preflight and uncertain startup failures never mark a SID failed", async () => {
		const preflight = await resumeFixture();
		await preflight.store.mutateSession("TASK-1", preflight.sessionId, async (record) => {
			delete record.nativeSessionId;
		});
		await expect(preflight.service.prepareNativeSession("task-1", preflight.sessionId, "build")).rejects.toThrow(
			"exact native session ID",
		);
		expect((await preflight.store.read("TASK-1")).modes?.build?.sessions[0]?.resumeProbeFailed).toBeUndefined();
		const uncertain = await resumeFixture();
		uncertain.runtime.unknownNativeProbe = true;
		await expect(uncertain.service.prepareNativeSession("task-1", uncertain.sessionId, "build")).rejects.toThrow(
			"Could not inspect",
		);
		expect((await uncertain.store.read("TASK-1")).modes?.build?.sessions[0]?.resumeProbeFailed).toBeUndefined();
	});

	it("failed-resume publication cannot mark a replacement record", async () => {
		const f = await resumeFixture();
		const originalKills = f.runtime.kills;
		f.runtime.exitOnLaunch = true;
		f.runtime.afterLaunch = async () => {
			await f.store.mutateSession("TASK-1", f.sessionId, async (record) => {
				record.nativeSessionId = "ses_replacement";
			});
		};
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow(
			"removed, replaced, or changed before store publication",
		);
		const record = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(record?.nativeSessionId).toBe("ses_replacement");
		expect(record?.resumeProbeFailed).toBeUndefined();
		expect(f.runtime.kills).toBe(originalKills + 1);
		expect(f.runtime.panesById.size).toBe(1);
	});

	it("competing preparations cannot duplicate resume or fallback", async () => {
		const f = await resumeFixture();
		f.runtime.exitOnLaunch = true;
		f.runtime.afterLaunch = async () => {
			f.runtime.exitOnLaunch = false;
		};
		const before = f.runtime.launches.length;
		const outcomes = await Promise.allSettled([
			f.service.prepareNativeSession("task-1", f.sessionId, "build"),
			f.service.prepareNativeSession("task-1", f.sessionId, "build"),
		]);
		expect(outcomes.every(({ status }) => status === "rejected")).toBe(true);
		expect(
			outcomes
				.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")
				.map(({ reason }) => (reason as Error).message)
				.join(" "),
		).toContain("ResumeFailed:");
		expect(f.runtime.launches).toHaveLength(before + 1);
		f.runtime.exitOnLaunch = false;
		const retry = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		await retry.prepareNativeSession("task-1", f.sessionId, "build");
		expect(f.runtime.launches).toHaveLength(before + 2);
	});

	it("fresh identity rotation cannot resurrect an OpenCode receipt", async () => {
		const f = await resumeFixture("opencode-v1");
		f.runtime.exitOnLaunch = true;
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow("ResumeFailed:");
		f.runtime.exitOnLaunch = false;
		const recreated = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		const attachment = await recreated.prepareNativeSession("task-1", f.sessionId, "build");
		expect(attachment.outcome?.kind).toBe("FreshAfterFailedResume");
		expect(attachment.record.nativeSessionId).toBeUndefined();
		const launches = f.runtime.launches.length;
		const reopened = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		const again = await reopened.prepareNativeSession("task-1", f.sessionId, "build");
		expect(again.record.nativeSessionId).toBeUndefined();
		expect(f.runtime.launches).toHaveLength(launches);
		expect(again.record.nativeSessionId).toBeUndefined();
	});

	it("resume failure and successful fallback have distinct UI notices", async () => {
		const f = await resumeFixture();
		f.runtime.exitOnLaunch = true;
		let resumeNotice = "";
		try {
			await f.service.prepareNativeSession("task-1", f.sessionId, "build");
		} catch (error) {
			resumeNotice = (error as Error).message;
		}
		f.runtime.exitOnLaunch = false;
		const recreated = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		const fresh = await recreated.prepareNativeSession("task-1", f.sessionId, "build");
		const fallbackNotice = fresh.warnings?.join(" ") ?? "";
		expect(resumeNotice).toContain("ResumeFailed:");
		expect(fallbackNotice).toContain(f.nativeSessionId);
		expect(fallbackNotice).not.toBe(resumeNotice);
	});

	it.each([
		["claude", "--resume"],
		["pi", "--session"],
		["opencode-v1", "--session"],
		["opencode-v2", "--standalone --session"],
	] as const)("uses literal resume flags for %s", (bootstrap, expected) => {
		const preset = {
			command: "agent",
			env: {},
			prepare: "",
			bootstrap: bootstrap,
		} satisfies import("./types.ts").AgentPreset;
		expect(buildAgentResumeCommand(preset, "ses_literal")).toContain(expected);
		expect(buildAgentResumeCommand(preset, "ses_literal")).toContain("ses_literal");
	});

	it("validates OpenCode v2 SID lookup before outgoing cleanup", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-v2-preflight-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const command = join(root, "opencode-v2");
		await writeFile(command, '#!/bin/sh\n[ "$1" = --version ] && { echo v2.1.0; exit 0; }\nexit 1\n');
		await chmod(command, 0o700);
		const core = new Core(root);
		await initializeTestProject(core, "OpenCode v2 preflight");
		await core.createTaskFromInput({ title: "Runtime task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-opencode-v2",
			presets: { "fake-opencode-v2": { command, env: {}, prepare: "", bootstrap: "opencode" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, { runner: runtime, tmuxServer: runtime });
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const outgoingPane = runtime.panesById.get(started.paneId);
		if (!outgoingPane) throw new Error("Missing owned outgoing pane");
		outgoingPane.dead = true;
		const kills = runtime.kills;
		const launches = runtime.launches.length;
		const before = await new SessionStore(root, runtime).read("TASK-1");
		const paneOptions = structuredClone(outgoingPane.options);
		await expect(service.prepareNativeSession("task-1", started.record.id, "build")).rejects.toThrow(
			"was not found or is unavailable",
		);
		expect(runtime.kills).toBe(kills);
		expect(runtime.launches).toHaveLength(launches);
		expect(outgoingPane.options).toEqual(paneOptions);
		expect(outgoingPane.dead).toBe(true);
		expect(await new SessionStore(root, runtime).read("TASK-1")).toEqual(before);
	});

	it("keeps a dead owned pane and state intact when OpenCode config preflight rejects", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-v2-config-preflight-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const command = join(root, "opencode-v2");
		await writeFile(
			command,
			`#!/bin/sh\n[ "$1" = --version ] && { echo v2.1.0; exit 0; }\n[ "$1" = api ] && { printf '{"data":{"id":"%s"}}\\n' "\${4##*/}"; exit 0; }\nexit 1\n`,
		);
		await chmod(command, 0o700);
		const core = new Core(root);
		await initializeTestProject(core, "OpenCode v2 config preflight");
		await core.createTaskFromInput({ title: "Runtime task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		const selectedPreset = "fake-opencode-v2";
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset,
			presets: { [selectedPreset]: { command, env: {}, prepare: "", bootstrap: "opencode" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, { runner: runtime, tmuxServer: runtime });
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const outgoingPane = runtime.panesById.get(started.paneId);
		if (!outgoingPane) throw new Error("Missing owned outgoing pane");
		outgoingPane.dead = true;
		const updated = await loadAgentConfiguration(core, "project");
		if (!updated) throw new Error("Missing updated agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...updated,
			presets: {
				[selectedPreset]: {
					command,
					env: { OPENCODE_CONFIG_CONTENT: "[]" },
					prepare: "",
					bootstrap: "opencode",
				},
			},
		});
		const kills = runtime.kills;
		const launches = runtime.launches.length;
		const before = await new SessionStore(root, runtime).read("TASK-1");
		const paneOptions = structuredClone(outgoingPane.options);
		const inventory = JSON.parse(
			outgoingPane.options["@backlog_launch_resources"] ?? "null",
		) as PreparedLaunchResources;
		const resourceFilePaths = [
			join(inventory.skill.path, "skills/backlog-task-management/SKILL.md"),
			join(inventory.skill.path, "backlog-opencode-cli-plugin/package.json"),
			join(inventory.skill.path, "backlog-opencode-cli-plugin/tui.js"),
			join(inventory.skill.path, ".backlog-launch-owner"),
			...(inventory.activity ? [join(inventory.activity.path, ".backlog-launch-owner")] : []),
		];
		const resourceContents = await Promise.all(resourceFilePaths.map((path) => readFile(path, "utf8")));
		await expect(service.prepareNativeSession("task-1", started.record.id, "build")).rejects.toThrow(
			"Unsupported OpenCode v2 config schema",
		);
		expect(runtime.kills).toBe(kills);
		expect(runtime.launches).toHaveLength(launches);
		expect(outgoingPane.options).toEqual(paneOptions);
		expect(outgoingPane.dead).toBe(true);
		expect(await Promise.all(resourceFilePaths.map((path) => readFile(path, "utf8")))).toEqual(resourceContents);
		expect(await new SessionStore(root, runtime).read("TASK-1")).toEqual(before);
	});

	it("rejects a missing resume worktree without disturbing the owned outgoing pane", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-path-preflight-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Resume path preflight");
		await core.createTaskFromInput({ title: "Runtime task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, { runner: runtime, tmuxServer: runtime });
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const outgoingPane = runtime.panesById.get(started.paneId);
		if (!outgoingPane) throw new Error("Missing owned outgoing pane");
		outgoingPane.dead = true;
		const store = new SessionStore(root, runtime);
		const missingWorktree = join(root, "missing-worktree");
		await store.mutateSession("TASK-1", started.record.id, async (session) => {
			if (!session.pathContext) throw new Error("Missing persisted session paths");
			session.pathContext.worktreeDir = missingWorktree;
		});
		const before = await store.read("TASK-1");
		const kills = runtime.kills;
		const launches = runtime.launches.length;
		const paneOptions = structuredClone(outgoingPane.options);
		await expect(service.prepareNativeSession("task-1", started.record.id, "build")).rejects.toThrow(
			`working directory is missing: ${missingWorktree}`,
		);
		expect(runtime.kills).toBe(kills);
		expect(runtime.launches).toHaveLength(launches);
		expect(runtime.panesById.has(started.paneId)).toBe(true);
		expect(outgoingPane.dead).toBe(true);
		expect(outgoingPane.options).toEqual(paneOptions);
		expect(await store.read("TASK-1")).toEqual(before);
	});

	it("retains a v1 native ID receipt after binding and rereads it idempotently", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-v1-receipt-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const command = join(root, "opencode-version.ts");
		const versionFile = join(root, "version");
		await writeFile(versionFile, "1.19.0");
		await writeFile(
			command,
			`#!/usr/bin/env bun\nimport { readFileSync } from "node:fs";\nif (process.argv.includes("--version")) console.log(readFileSync(${JSON.stringify(versionFile)}, "utf8"));\n`,
		);
		await chmod(command, 0o700);
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime v1 receipt");
		await core.createTaskFromInput({ title: "Receipt task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "opencode",
			presets: { opencode: { command, env: {}, prepare: "", bootstrap: "opencode" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		expect(started.record.status).toBe("running");
		const paths = await service.stateRoot;
		await core.createTaskFromInput({ title: "Direct receipt task", status: "To Do" });
		const direct = await service.start("task-2", { modeId: "build" });
		expect(direct.nativeSessionId).toBeUndefined();
		expect(
			(await new SessionStore(root, runtime).read("TASK-2")).modes?.build?.sessions[0]?.nativeSessionId,
		).toBeUndefined();
		const directReceipt = join(paths, "task-2", `${direct.id}.native-session-id`);
		await Bun.write(directReceipt, "ses_direct_receipt\n");
		await chmod(directReceipt, 0o600);
		await service.liveSession("task-2", direct.id);
		expect((await service.list("task-2", "build")).sessions[0]?.nativeSessionId).toBe("ses_direct_receipt");
		await service.stop("task-2", direct.id);
		const receiptPath = join(paths, "task-1", `${started.record.id}.native-session-id`);
		await Bun.write(receiptPath, "ses_receipt_exact\n");
		await chmod(receiptPath, 0o600);
		const receiptStore = new SessionStore(root, runtime);
		const beforeAttach = await receiptStore.read("TASK-1");
		expect(beforeAttach.modes?.build?.sessions[0]).toMatchObject({ id: started.record.id, status: "running" });
		expect(beforeAttach.modes?.build?.sessions[0]?.nativeSessionId).toBeUndefined();
		const launchesBeforeAttach = runtime.launches.length;
		const killsBeforeAttach = runtime.kills;

		const attached = await service.prepareNativeSession("task-1", started.record.id, "build");

		expect(attached.paneId).toBe(started.paneId);
		expect(attached.record.nativeSessionId).toBe("ses_receipt_exact");
		expect(runtime.launches).toHaveLength(launchesBeforeAttach);
		expect(runtime.kills).toBe(killsBeforeAttach);
		expect((await readWorkspaceRequests(root)).some((request) => request.sessionId === started.record.id)).toBe(false);
		const afterAttach = await receiptStore.read("TASK-1");
		expect(afterAttach.modes?.build?.sessions[0]).toMatchObject({
			id: started.record.id,
			status: "running",
			nativeSessionId: "ses_receipt_exact",
		});
		expect(afterAttach.modes?.build?.activeSessionId).toBe(beforeAttach.modes?.build?.activeSessionId);

		const firstRead = await service.list("task-1", "build");
		expect(firstRead.sessions[0]?.nativeSessionId).toBe("ses_receipt_exact");
		await service.liveSession("task-1", started.record.id);
		const reread = await service.list("task-1", "build");
		expect(reread.sessions[0]?.nativeSessionId).toBe("ses_receipt_exact");
		expect(await readFile(receiptPath, "utf8")).toBe("ses_receipt_exact\n");
		await service.stop("task-1", started.record.id);
		const exactResume = await service.prepareNativeSession("task-1", started.record.id, "build");
		expect(exactResume.record.nativeSessionId).toBe("ses_receipt_exact");
		expect(runtime.launches).toHaveLength(3);
		await service.liveSession("task-1", started.record.id);

		const taskDir = join(paths, "task-1");
		const activityDir = sessionActivityDir(taskDir, started.record.id);
		await mkdir(activityDir, { recursive: true });
		await writeFile(join(activityDir, "status"), "running");
		await writeWorkspaceRequest(root, { taskId: "TASK-1", sessionId: started.record.id, pid: process.pid });
		const killsBeforeForget = runtime.kills;
		await service.forgetTaskSessions("task-1");
		expect(runtime.kills).toBe(killsBeforeForget);
		expect(await Bun.file(join(taskDir, `${started.record.id}.log`)).exists()).toBe(false);
		expect(await Bun.file(join(taskDir, `${started.record.id}.md`)).exists()).toBe(false);
		expect(await Bun.file(receiptPath).exists()).toBe(false);
		expect(await Bun.file(activityDir).exists()).toBe(false);
		expect((await readWorkspaceRequests(root)).some((request) => request.sessionId === started.record.id)).toBe(false);
		expect((await service.list("task-1", "build")).sessions).toEqual([]);
		expect(runtime.panesById.size).toBe(1);
		expect([...runtime.panesById.values()][0]?.options["@backlog_native_session_id"]).toBe("ses_receipt_exact");
		await core.createTaskFromInput({ title: "Forgotten native alias", status: "To Do" });
		const alias = await service.prepareNativeSession("task-2", undefined, "build");
		await service.stop("task-2", alias.record.id);
		const store = new SessionStore(root, runtime);
		await store.mutateSession("TASK-2", alias.record.id, async (session) => {
			session.nativeSessionId = "ses_receipt_exact";
		});
		const aliasedAttachment = await service.prepareNativeSession("task-2", alias.record.id, "build");
		expect(aliasedAttachment.record.nativeSessionId).toBe("ses_receipt_exact");
	});

	it("runs immediately when its adapter establishes an identity during prepare", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-capability-receipt-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const command = join(root, "opencode-version.ts");
		const versionFile = join(root, "version");
		await writeFile(versionFile, "1.19.0");
		await writeFile(
			command,
			`#!/usr/bin/env bun\nimport { readFileSync } from "node:fs";\nif (process.argv.includes("--version")) console.log(readFileSync(${JSON.stringify(versionFile)}, "utf8"));\n`,
		);
		await chmod(command, 0o700);
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime capability receipt");
		await core.createTaskFromInput({ title: "Capability receipt task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "opencode",
			presets: { opencode: { command, env: {}, prepare: "", bootstrap: "opencode" } },
		});
		const original = agentFor("opencode-v1");
		if (!original) throw new Error("Missing OpenCode v1 adapter");
		const adapter = Object.create(original) as Agent;
		adapter.prepare = async (request) => {
			const prepared = await original.prepare(request);
			return {
				...prepared,
				identity: prepared.identity ?? { id: "ses_client_established", basis: "client-established" as const },
			};
		};
		registerAgent(adapter);
		try {
			const runtime = new FakeRuntime();
			const service = new AgentSessionService(core, {
				runner: runtime,
				tmuxServer: runtime,
				workspaceContext: async () => undefined,
			});
			const started = await service.prepareNativeSession("task-1", undefined, "build");
			expect(started.record.status).toBe("running");
			expect(started.record.nativeSessionId).toBe("ses_client_established");
		} finally {
			for (const agent of builtInAgents()) registerAgent(agent);
		}
	});

	it("forgets hydrated v1 histories without probing or preserving native runtime tags", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-v1-forget-receipt-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const command = join(root, "opencode-version.ts");
		const versionFile = join(root, "version");
		await writeFile(versionFile, "1.19.0");
		await writeFile(
			command,
			`#!/usr/bin/env bun\nimport { readFileSync } from "node:fs";\nif (process.argv.includes("--version")) console.log(readFileSync(${JSON.stringify(versionFile)}, "utf8"));\n`,
		);
		await chmod(command, 0o700);
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime v1 forget receipt");
		await core.createTaskFromInput({ title: "Receipt owner", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "opencode",
			presets: { opencode: { command, env: {}, prepare: "", bootstrap: "opencode" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const stateRoot = await service.stateRoot;
		const taskDir = join(stateRoot, "task-1");
		const receiptPath = join(taskDir, `${started.record.id}.native-session-id`);
		await Bun.write(receiptPath, "ses_hydrated_only\n");
		await chmod(receiptPath, 0o600);
		expect((await service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBe("ses_hydrated_only");
		expect((await service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBe("ses_hydrated_only");
		expect([...runtime.panesById.values()][0]?.options["@backlog_native_session_id"]).toBeUndefined();
		const blockedLog = join(taskDir, `${started.record.id}.log`);
		await mkdir(blockedLog);
		await expect(service.forgetTaskSessions("task-1")).rejects.toThrow();
		const persisted = JSON.parse(await Bun.file(join(taskDir, "state.json")).text()) as {
			modes: { build: { sessions: Array<{ id: string; nativeSessionId?: string }> } };
		};
		expect(persisted.modes.build.sessions.find(({ id }) => id === started.record.id)?.id).toBe(started.record.id);
		await rm(blockedLog, { recursive: true });

		const paneEntry = [...runtime.panesById][0];
		if (!paneEntry) throw new Error("Missing fake live runtime pane");
		runtime.panesById.delete(paneEntry[0]);
		runtime.unknownNativeProbe = true;
		await service.forgetTaskSessions("task-1");
		runtime.unknownNativeProbe = false;
		expect(runtime.kills).toBe(0);
		expect(await Bun.file(receiptPath).exists()).toBe(false);

		await core.createTaskFromInput({ title: "Receipt alias", status: "To Do" });
		const alias = await service.prepareNativeSession("task-2", undefined, "build");
		await service.stop("task-2", alias.record.id);
		await new SessionStore(root, runtime).mutateSession("TASK-2", alias.record.id, async (session) => {
			session.nativeSessionId = "ses_hydrated_only";
		});
		const aliasedAttachment = await service.prepareNativeSession("task-2", alias.record.id, "build");
		expect(aliasedAttachment.record.nativeSessionId).toBe("ses_hydrated_only");
		expect(runtime.launches.at(-1)).toContain("ses_hydrated_only");
	});

	it("adopts an unlaunched v1 pending request without requiring a resume ID", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-v1-pending-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const command = join(root, "opencode-version.ts");
		const versionFile = join(root, "version");
		await writeFile(versionFile, "1.19.0");
		await writeFile(
			command,
			`#!/usr/bin/env bun\nimport { readFileSync } from "node:fs";\nif (process.argv.includes("--version")) console.log(readFileSync(${JSON.stringify(versionFile)}, "utf8"));\n`,
		);
		await chmod(command, 0o700);
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime v1 pending");
		await core.createTaskFromInput({ title: "Pending task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "opencode",
			presets: { opencode: { command, env: {}, prepare: "", bootstrap: "opencode" } },
		});
		const runtime = new FakeRuntime();
		const context: WorkspaceContext = { v: 2, paneId: "%parent", rootDir: core.filesystem.rootDir };
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => context,
		});
		const pending = await service.registerPendingSession("task-1", {}, context);
		const attachment = await service.prepareNativeSession("task-1", pending.id);
		expect(attachment.record.id).toBe(pending.id);
		expect(attachment.record.nativeSessionId).toBeUndefined();
		expect(runtime.launches).toHaveLength(1);
		expect(runtime.launches[0]).toContain("--prompt");
		expect(runtime.launches[0]).not.toContain("--session");
	});

	it("returns the owning mode when admitting pending requests across modes", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-cross-mode-admission-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Cross-mode admission");
		await core.createTaskFromInput({ title: "Pending task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const context: WorkspaceContext = { v: 2, paneId: "%parent", rootDir: core.filesystem.rootDir };
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => context,
		});
		const plan = await service.registerPendingSession("task-1", { modeId: "plan" }, context);
		const build = await service.registerPendingSession("task-1", { modeId: "build" }, context);
		const store = new SessionStore(root, runtime);
		const before = await store.read("TASK-1");
		const planAttachment = await service.adoptPendingSession("task-1", plan.id);
		const buildAttachment = await service.adoptPendingSession("task-1", build.id);
		const after = await store.read("TASK-1");
		expect(planAttachment.modeId).toBe("plan");
		expect(buildAttachment.modeId).toBe("build");
		expect(after.modes?.plan?.activeSessionId).toBe(before.modes?.plan?.activeSessionId);
		expect(after.modes?.build?.activeSessionId).toBe(before.modes?.build?.activeSessionId);
		expect(runtime.launches).toHaveLength(2);
	});

	it("keeps launched pane context valid after its frontend context exits", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-pane-context-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime pane context");
		await core.createTaskFromInput({ title: "Context task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		let context: WorkspaceContext | undefined;
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => context,
		});
		const parent = await service.prepareNativeSession("task-1", undefined, "plan");
		context = {
			v: 2,
			paneId: parent.paneId,
			rootDir: core.filesystem.rootDir,
			conversation: { taskId: parent.record.taskId, modeId: "plan", sessionId: parent.record.id },
			...(parent.record.nativeSessionId ? { nativeSessionId: parent.record.nativeSessionId } : {}),
		};
		const child = await service.prepareNativeSession("task-1", undefined, "build");
		expect(runtime.launches[1]).toContain(`"paneId":"${child.paneId}"`);
		expect(runtime.launches[1]).toContain(`"sessionId":"${child.record.id}"`);
		expect(runtime.launches[1]).not.toContain(parent.record.id);
		context = {
			v: 2,
			paneId: child.paneId,
			rootDir: core.filesystem.rootDir,
			conversation: { taskId: child.record.taskId, modeId: "build", sessionId: child.record.id },
			...(child.record.nativeSessionId ? { nativeSessionId: child.record.nativeSessionId } : {}),
		};
		await service.parkNativeSession("task-1", child.record.id, originOf(child));
		const runsBeforeParkedAsk = runtime.runEnvironments.length;
		await expect(service.ask("task-1", "parked must not dispatch", { sessionId: child.record.id })).rejects.toThrow(
			"Stop it before asking",
		);
		await new SessionStore(root, runtime).mutateSession("TASK-1", child.record.id, async (session) => {
			session.status = "failed";
		});
		await expect(service.ask("task-1", "failed must not dispatch", { sessionId: child.record.id })).rejects.toThrow(
			"Stop it before asking",
		);
		expect(runtime.runEnvironments).toHaveLength(runsBeforeParkedAsk);
		await new SessionStore(root, runtime).mutateSession("TASK-1", child.record.id, async (session) => {
			session.status = "parked";
		});
		await service.stop("task-1", child.record.id);
		await service.ask("task-1", "continue in this conversation", { sessionId: child.record.id });
		const askContext = JSON.parse(
			runtime.runEnvironments.at(-1)?.BACKLOG_WORKSPACE_CONTEXT ?? "null",
		) as WorkspaceContext;
		expect(askContext.paneId).toBe(child.paneId);
		expect(askContext.conversation?.sessionId).toBe(child.record.id);

		context = undefined;
		const reattached = await service.prepareNativeSession("task-1", child.record.id, "build");
		expect(reattached.record.nativeSessionId).toBe(child.record.nativeSessionId);
		expect(runtime.launches).toHaveLength(3);
	});

	it("rejects redirected task/request parents and accepts a canonical project-root alias", async () => {
		const physicalRoot = await mkdtemp(join(tmpdir(), "shared-runtime-forget-root-"));
		const rootAlias = join(tmpdir(), `shared-runtime-forget-alias-${crypto.randomUUID()}`);
		roots.push(physicalRoot, rootAlias);
		await symlink(physicalRoot, rootAlias, "dir");
		expect(await realpath(rootAlias)).toBe(await realpath(physicalRoot));
		process.env.XDG_CONFIG_HOME = join(physicalRoot, "config");
		const core = new Core(rootAlias);
		await initializeTestProject(core, "Shared runtime safe forgetting");
		await core.createTaskFromInput({ title: "First task", status: "To Do" });
		await core.createTaskFromInput({ title: "Second task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});
		const first = await service.prepareNativeSession("task-1", undefined, "build");
		await service.prepareNativeSession("task-2", undefined, "build");
		const store = new SessionStore(rootAlias, runtime);
		const firstPaths = await store.paths("TASK-1");
		const secondPaths = await store.paths("TASK-2");
		const heldTaskDir = `${firstPaths.taskDir}.held`;
		await rename(firstPaths.taskDir, heldTaskDir);
		await symlink(secondPaths.taskDir, firstPaths.taskDir, "dir");
		await expect(service.forgetTaskSessions("task-1")).rejects.toThrow("resolves outside its canonical task path");
		await rm(firstPaths.taskDir);
		await rename(heldTaskDir, firstPaths.taskDir);
		expect((await service.list("task-1", "build")).sessions[0]?.id).toBe(first.record.id);

		const requestDir = join(rootAlias, ".backlog", "agent-requests");
		const heldRequestDir = `${requestDir}.held`;
		const redirectedRequestDir = join(rootAlias, "redirected-requests");
		await writeWorkspaceRequest(rootAlias, { taskId: "TASK-1", sessionId: first.record.id, pid: process.pid });
		await mkdir(redirectedRequestDir, { recursive: true });
		await writeFile(join(redirectedRequestDir, "sentinel"), "keep");
		await rename(requestDir, heldRequestDir);
		await symlink(redirectedRequestDir, requestDir, "dir");
		await expect(service.forgetTaskSessions("task-1")).rejects.toThrow("workspace request directory is redirected");
		await rm(requestDir);
		await rename(heldRequestDir, requestDir);
		expect(await Bun.file(join(redirectedRequestDir, "sentinel")).text()).toBe("keep");
		expect((await service.list("task-1", "build")).sessions[0]?.id).toBe(first.record.id);

		const killsBeforeForget = runtime.kills;
		await service.forgetTaskSessions("task-1");
		expect(runtime.kills).toBe(killsBeforeForget);
		expect((await service.list("task-1", "build")).sessions).toEqual([]);
	});

	it("retains the association when required sidecar cleanup fails and retries safely", async () => {
		const root = await mkdtemp(join(tmpdir(), "shared-runtime-forget-retry-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config");
		const core = new Core(root);
		await initializeTestProject(core, "Shared runtime forget retry");
		await core.createTaskFromInput({ title: "Retry task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const config = await loadAgentConfiguration(core, "project");
		if (!config) throw new Error("Missing agent configuration");
		await upsertAgentConfiguration(core, "project", {
			...config,
			selectedPreset: "fake-pi",
			presets: { "fake-pi": { command: "fake-agent", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const runtime = new FakeRuntime();
		const service = new AgentSessionService(core, {
			runner: runtime,
			tmuxServer: runtime,
			workspaceContext: async () => undefined,
		});
		const started = await service.prepareNativeSession("task-1", undefined, "build");
		const paths = await new SessionStore(root, runtime).paths("TASK-1");
		const blockedLog = join(paths.taskDir, `${started.record.id}.log`);
		await mkdir(blockedLog);
		await expect(service.forgetTaskSessions("task-1")).rejects.toThrow();
		expect((await service.list("task-1", "build")).sessions[0]?.id).toBe(started.record.id);

		await rm(blockedLog, { recursive: true });
		await service.forgetTaskSessions("task-1");
		expect((await service.list("task-1", "build")).sessions).toEqual([]);
		expect(runtime.panesById.size).toBe(1);
	});
});
