import { afterEach, describe, expect, it, mock } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../core/agentic-workspace.ts";
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
				args.at(-1) === "@agentic_workspace_native_session_id" || args.at(-1) === "@agentic_workspace_native_provider"
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
			args.at(-1)?.includes("@agentic_workspace_native_session_id")
		) {
			const paneId = args[args.indexOf("-t") + 1];
			const pane = this.panesById.get(paneId ?? "");
			return pane
				? [
						[
							pane.options["@agentic_workspace_root"],
							pane.options["@agentic_workspace_task"],
							pane.options["@agentic_workspace_session"],
							paneId,
							pane.options["@agentic_workspace_native_session_id"],
							pane.options["@agentic_workspace_native_provider"],
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
					pane.options["@agentic_workspace_root"],
					pane.options["@agentic_workspace_task"],
					pane.options["@agentic_workspace_session"],
					pane.options["@agentic_workspace_role"],
				];
				return [
					...identity,
					...(args.at(-1)?.includes("#{pane_pid}")
						? ["4242", pane.dead ? "1" : "0", paneId]
						: [paneId, pane.dead ? "1" : "0"]),
				].join("\t");
			});
		}
		if (command === "list-panes" && args.at(-1)?.includes("@agentic_workspace_native_session_id"))
			return [...this.panesById].map(([paneId, pane]) =>
				[
					pane.options["@agentic_workspace_root"],
					pane.options["@agentic_workspace_task"],
					pane.options["@agentic_workspace_session"],
					...(args.at(-1)?.includes("#{pane_id}") ? [paneId] : []),
					pane.options["@agentic_workspace_native_session_id"],
					...(args.at(-1)?.includes("@agentic_workspace_native_provider")
						? [pane.options["@agentic_workspace_native_provider"]]
						: []),
				].join("\t"),
			);
		if (command === "list-panes")
			return [...this.panesById].map(([paneId, pane]) =>
				[
					paneId,
					pane.dead ? "1" : "0",
					"@agent",
					pane.options["@agentic_workspace_root"],
					pane.options["@agentic_workspace_task"],
					pane.options["@agentic_workspace_session"],
					pane.options["@agentic_workspace_role"],
					"",
				].join("\t"),
			);
		if (command === "display-message") {
			const format = args.at(-1);
			if (format === "#{@agentic_workspace_launch_resources}")
				return [this.panesById.get(args[2] ?? "")?.options["@agentic_workspace_launch_resources"] ?? ""];
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
				.find((session) => session.status === "failed") ??
			Object.values(state.modes).flatMap((history) => history.sessions)[0];
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
		expect((await store.read("TASK-1")).modes?.build?.activeSessionId).toBe(started.record.id);
		await service.activateNativeSession("task-1", started.record.id, originOf(started));
		expect((await store.read("TASK-1")).modes?.build?.activeSessionId).toBe(started.record.id);

		const pane = runtime.panesById.get(started.paneId);
		if (!pane) throw new Error("Missing native runtime pane");
		for (const [option, conflicting] of [
			["@agentic_workspace_root", join(root, "other-project")],
			["@agentic_workspace_task", "TASK-2"],
			["@agentic_workspace_session", "other-session"],
			["@agentic_workspace_native_provider", "claude"],
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
		expect((await service.list("task-3", "build")).sessions[0]?.status).toBe("running");

		await core.createTaskFromInput({ title: "Publication failure task", status: "To Do" });
		const launchesBeforePublicationFailure = runtime.launches.length;
		const killsBeforePublicationFailure = runtime.kills;
		runtime.afterLaunch = async () => {
			const state = await new SessionStore(root, runtime).read("TASK-4");
			const record = state.modes.build?.sessions[0];
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
		expect(runtime.runEnvironments.at(-1)?.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT).toBeUndefined();
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

	it.each(["native", "direct"] as const)("settles a live %s launch after dispatch begins", async (route) => {
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
		expect(failedModeSession?.status).toBe("running");
		expect(state.modes?.plan?.sessions[0]?.id).toBe(otherMode.record.id);
		expect(state.modes?.plan?.sessions[0]?.status).toBe("running");
	});

	it("settles a post-dispatch handoff failure and permits a second successor", async () => {
		const { service, store, runtime } = await observationFixture();
		runtime.exitOnLaunch = true;
		runtime.afterLaunch = async () => {
			throw new Error("controlled successor failure after dispatch");
		};
		await expect(service.prepareNewSession("task-1", "build")).rejects.toThrow(
			"controlled successor failure after dispatch",
		);
		runtime.afterLaunch = undefined;
		const afterFailure = (await store.read("TASK-1")).modes?.build;
		const settled = afterFailure?.sessions[0];
		expect(settled?.status).toBe("failed");
		expect(afterFailure?.activeSessionId).toBe(settled?.id);
		runtime.exitOnLaunch = false;
		const next = await service.prepareNewSession("task-1", "build");
		expect(next.record.id).not.toBe(settled?.id);
		expect((await store.read("TASK-1")).modes?.build?.activeSessionId).toBe(next.record.id);
	});

	it("stops a dispatched direct session after settling it running", async () => {
		const { service, store, runtime } = await observationFixture();
		runtime.afterLaunch = async () => {
			throw new Error("leave dispatched session starting");
		};
		await expect(service.start("task-1")).rejects.toThrow("leave dispatched session starting");
		runtime.afterLaunch = undefined;
		const stoppedState = await store.read("TASK-1");
		const beforeStop = Object.values(stoppedState.modes ?? {})
			.flatMap((history) => history.sessions)
			.find((session) => session.status === "running");
		if (!beforeStop) throw new Error("Expected direct session to be persisted");
		expect(beforeStop.status).toBe("running");
		let statusAtTeardown: string | undefined;
		runtime.onKill = async () => {
			const current = await store.read("TASK-1");
			statusAtTeardown = Object.values(current.modes ?? {})
				.flatMap((history) => history.sessions)
				.find((session) => session.id === beforeStop.id)?.status;
		};
		await service.stopAllTaskSessions("TASK-1");
		runtime.onKill = undefined;
		expect(statusAtTeardown).toBe("running");
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
			history.activeSessionId = replacement.id;
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

	it("does not replace a selected parked conversation when auto-resume is disabled", async () => {
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
		const store = new SessionStore(root, runtime);
		await store.mutateSession("TASK-1", started.record.id, async (session) => {
			session.status = "parked";
		});
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
		const before = await store.read("TASK-1");
		const launches = runtime.launches.length;
		await expect(service.prepareNativeSession("task-1", started.record.id, "build")).rejects.toMatchObject({
			kind: "exact-resume-unavailable",
			reason: "auto-resume-disabled",
			nativeSessionId: started.record.nativeSessionId,
		});
		expect(runtime.launches).toHaveLength(launches);
		expect(await store.read("TASK-1")).toEqual(before);
	});

	it("creates a distinct handoff session and restores the predecessor selection on launch failure", async () => {
		const successful = await resumeFixture();
		const originalPane = successful.runtime.panesById.get(successful.paneId);
		if (!originalPane) throw new Error("Missing predecessor pane");
		originalPane.dead = false;
		const predecessorBefore = (await successful.store.read("TASK-1")).modes?.build?.sessions[0];

		const successor = await successful.service.prepareNewSession("task-1", "build");

		const afterSuccess = await successful.store.read("TASK-1");
		const predecessorAfter = afterSuccess.modes?.build?.sessions.find(({ id }) => id === successful.sessionId);
		expect(successor.record.id).not.toBe(successful.sessionId);
		expect(afterSuccess.modes?.build?.activeSessionId).toBe(successor.record.id);
		expect(predecessorAfter).toMatchObject({ status: "running", nativeSessionId: successful.nativeSessionId });
		expect(originalPane.dead).toBe(false);

		const failed = await resumeFixture();
		const failedPane = failed.runtime.panesById.get(failed.paneId);
		if (!failedPane) throw new Error("Missing failure-case predecessor pane");
		failedPane.dead = false;
		const failedBefore = await failed.store.read("TASK-1");
		failed.runtime.failLaunch = true;

		await expect(failed.service.prepareNewSession("task-1", "build")).rejects.toThrow("fake publication failure");

		const failedAfter = await failed.store.read("TASK-1");
		expect(failedAfter.modes?.build?.activeSessionId).toBe(failedBefore.modes?.build?.activeSessionId);
		expect(failedAfter.modes?.build?.sessions.find(({ id }) => id === failed.sessionId)).toMatchObject({
			status: "running",
			nativeSessionId: failed.nativeSessionId,
		});
		expect(failedPane.dead).toBe(false);
		expect(failedAfter.modes?.build?.sessions.some(({ id }) => id !== failed.sessionId)).toBe(true);
		expect(predecessorBefore?.status).toBe("running");
	});

	it.each([
		{ queued: false, owned: true },
		{ queued: false, owned: false },
		{ queued: true, owned: true },
		{ queued: true, owned: false },
	])("hands off successor-first with explicit ownership %j", async ({ queued, owned }) => {
		const { root, service, store, runtime } = await observationFixture();
		const predecessor = owned
			? (await service.prepareNativeSession("task-1", undefined, "build")).record
			: await service.start("task-1", { modeId: "build" });
		const before = (await store.read("TASK-1")).modes.build!.sessions[0];
		runtime.afterLaunch = async () => {
			expect((await store.read("TASK-1")).modes.build!.sessions[0]).toEqual(before);
			expect(runtime.kills).toBe(0);
		};
		runtime.onKill = async () => {
			const history = (await store.read("TASK-1")).modes.build!;
			expect(history.sessions.find(({ id }) => id === history.activeSessionId)?.status).toBe("running");
		};
		const pending = queued
			? await service.registerPendingSession(
					"task-1",
					{ modeId: "build", replace: true },
					{
						v: 2,
						paneId: "%parent",
						rootDir: root,
					},
				)
			: undefined;
		if (pending) {
			expect((await store.read("TASK-1")).modes.build!.sessions[0]).toEqual(before);
			expect((await readWorkspaceRequests(root))[0]?.handoff?.predecessor?.id).toBe(predecessor.id);
		}
		const successor = pending
			? (await service.adoptPendingSession("task-1", pending.id)).record
			: await service.start("task-1", { modeId: "build", replace: true });
		const history = (await store.read("TASK-1")).modes.build!;
		expect(history.activeSessionId).toBe(successor.id);
		expect(history.sessions.find(({ id }) => id === predecessor.id)?.status).toBe(owned ? "stopped" : "running");
		expect(runtime.kills).toBe(owned ? 1 : 0);
		expect(await readWorkspaceRequests(root)).toEqual([]);
		expect(
			[...runtime.panesById.values()].some(({ options }) => options["@agentic_workspace_role"] === "retired-session"),
		).toBe(false);
	});

	it.each([false, true])("keeps the successor on retirement failure (queued=%s)", async (queued) => {
		const { root, service, store, runtime } = await observationFixture();
		const predecessor = await service.prepareNativeSession("task-1", undefined, "build");
		const pending = queued
			? await service.registerPendingSession(
					"task-1",
					{ modeId: "build", replace: true },
					{
						v: 2,
						paneId: "%parent",
						rootDir: root,
					},
				)
			: undefined;
		runtime.onKill = async () => {
			throw new Error("retirement unavailable");
		};
		await expect(
			pending
				? service.adoptPendingSession("task-1", pending.id)
				: service.start("task-1", { modeId: "build", replace: true }),
		).rejects.toThrow("Successor running; predecessor cleanup failed");
		const history = (await store.read("TASK-1")).modes.build!;
		expect(history.sessions.every(({ status }) => status === "running")).toBe(true);
		expect(history.activeSessionId).not.toBe(predecessor.record.id);
		expect(runtime.panesById.size).toBe(2);
		if (pending) {
			expect(await readWorkspaceRequests(root)).toHaveLength(1);
			const launches = runtime.launches.length;
			runtime.onKill = undefined;
			await service.adoptPendingSession("task-1", pending.id);
			expect(runtime.launches).toHaveLength(launches);
			expect(runtime.panesById.size).toBe(1);
			expect(await readWorkspaceRequests(root)).toEqual([]);
		}
	});

	it.each([
		{ queued: false, competingSelection: false },
		{ queued: true, competingSelection: false },
		{ queued: false, competingSelection: true },
		{ queued: true, competingSelection: true },
	])("rolls back only the successor's selection on launch failure %j", async ({ queued, competingSelection }) => {
		const { root, service, store, runtime } = await observationFixture();
		const predecessor = await service.prepareNativeSession("task-1", undefined, "build");
		const other = await service.prepareNewSession("task-1", "build");
		await store.mutateMode("TASK-1", "build", async (history) => {
			history.activeSessionId = predecessor.record.id;
		});
		const before = (await store.read("TASK-1")).modes.build!.sessions[0];
		const pending = queued
			? await service.registerPendingSession(
					"task-1",
					{ modeId: "build", replace: true },
					{
						v: 2,
						paneId: "%parent",
						rootDir: root,
					},
				)
			: undefined;
		runtime.afterLaunch = async () => {
			if (competingSelection)
				await store.mutateMode("TASK-1", "build", async (history) => {
					history.activeSessionId = other.record.id;
				});
			throw new Error("post-dispatch failure");
		};
		await expect(
			pending
				? service.adoptPendingSession("task-1", pending.id)
				: service.start("task-1", { modeId: "build", replace: true }),
		).rejects.toThrow("post-dispatch failure");
		const history = (await store.read("TASK-1")).modes.build!;
		expect(history.activeSessionId).toBe(competingSelection ? other.record.id : predecessor.record.id);
		expect(history.sessions[0]).toEqual(before);
		expect(runtime.kills).toBe(0);
	});

	it("finalizes the captured local predecessor, independently of the shared selection", async () => {
		const { service, store, runtime } = await observationFixture();
		const local = await service.prepareNativeSession("task-1", undefined, "build");
		const shared = await service.prepareNewSession("task-1", "build");
		const successor = await service.prepareNewSession("task-1", "build");
		await store.mutateMode("TASK-1", "build", async (history) => {
			history.activeSessionId = shared.record.id;
		});
		await service.finalizeHandoff("task-1", successor.record, {
			modeId: "build",
			predecessor: local.record,
			priorActiveSessionId: shared.record.id,
		});
		const history = (await store.read("TASK-1")).modes.build!;
		expect(history.activeSessionId).toBe(shared.record.id);
		expect(history.sessions.find(({ id }) => id === local.record.id)?.status).toBe("stopped");
		expect(runtime.panesById.has(shared.paneId)).toBe(true);
		expect(runtime.panesById.has(successor.paneId)).toBe(true);
	});

	it("restores queued predispatch failure without touching the predecessor", async () => {
		const { root, service, store, runtime } = await observationFixture();
		const predecessor = await service.prepareNativeSession("task-1", undefined, "build");
		const before = (await store.read("TASK-1")).modes.build!.sessions[0];
		const pending = await service.registerPendingSession(
			"task-1",
			{ modeId: "build", replace: true },
			{
				v: 2,
				paneId: "%parent",
				rootDir: root,
			},
		);
		runtime.failTag = true;
		await expect(service.adoptPendingSession("task-1", pending.id)).rejects.toThrow(
			"controlled predispatch tag failure",
		);
		const history = (await store.read("TASK-1")).modes.build!;
		expect(history.activeSessionId).toBe(predecessor.record.id);
		expect(history.sessions[0]).toEqual(before);
		expect(history.sessions.find(({ id }) => id === pending.id)?.status).toBe("failed");
		expect(runtime.panesById.has(predecessor.paneId)).toBe(true);
	});

	it.each(["predecessor", "successor"])("revalidates %s identity at finalization", async (changed) => {
		const { service, store, runtime } = await observationFixture();
		const predecessor = await service.prepareNativeSession("task-1", undefined, "build");
		const successor = await service.prepareNewSession("task-1", "build");
		await store.mutateSession(
			"TASK-1",
			changed === "predecessor" ? predecessor.record.id : successor.record.id,
			async (record) => {
				record.createdAt = "2000-01-01T00:00:00.000Z";
			},
		);
		await expect(
			service.finalizeHandoff("task-1", successor.record, {
				modeId: "build",
				predecessor: predecessor.record,
				priorActiveSessionId: predecessor.record.id,
			}),
		).rejects.toThrow("predecessor cleanup failed");
		expect(runtime.kills).toBe(0);
		expect(runtime.panesById.size).toBe(2);
	});

	it.each([
		"predecessor",
		"successor",
		"mode",
	])("rejects stale queued handoff %s identity before launch", async (changed) => {
		const { root, service, store, runtime } = await observationFixture();
		const predecessor = await service.prepareNativeSession("task-1", undefined, "build");
		const pending = await service.registerPendingSession(
			"task-1",
			{ modeId: "build", replace: true },
			{
				v: 2,
				paneId: "%parent",
				rootDir: root,
			},
		);
		const request = (await readWorkspaceRequests(root))[0]!;
		if (changed === "mode") {
			request.handoff!.modeId = "plan";
			await writeWorkspaceRequest(root, request);
		} else
			await store.mutateSession(
				"TASK-1",
				changed === "predecessor" ? predecessor.record.id : pending.id,
				async (record) => {
					record.createdAt = "2000-01-01T00:00:00.000Z";
				},
			);
		const before = await store.read("TASK-1");
		await expect(service.adoptPendingSession("task-1", pending.id)).rejects.toThrow();
		expect(await store.read("TASK-1")).toEqual(before);
		expect(runtime.launches).toHaveLength(1);
		expect(runtime.kills).toBe(0);
	});

	it("resumes a parked conversation using its stored native session ID", async () => {
		const f = await resumeFixture();
		await f.store.mutateSession("TASK-1", f.sessionId, async (session) => {
			session.status = "parked";
		});

		const resumed = await f.service.prepareNativeSession("task-1", f.sessionId, "build");

		expect(f.runtime.launches.at(-1)).toContain(f.nativeSessionId);
		expect(resumed.record.nativeSessionId).toBe(f.nativeSessionId);
		expect(resumed.outcome).toEqual({ kind: "Resumed" });
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

	it("next launch after an exact-resume failure surfaces the preserved conversation", async () => {
		const f = await resumeFixture();
		f.runtime.exitOnLaunch = true;
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow("ResumeFailed:");
		const failure = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(failure?.resumeProbeFailed?.nativeSessionId).toBe(f.nativeSessionId);
		f.runtime.exitOnLaunch = false;
		const before = await f.store.read("TASK-1");
		const launches = f.runtime.launches.length;
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toMatchObject({
			kind: "exact-resume-unavailable",
			reason: "previous-resume-failed",
			nativeProvider: "pi",
			nativeSessionId: f.nativeSessionId,
		});
		expect(f.runtime.launches).toHaveLength(launches);
		expect(await f.store.read("TASK-1")).toEqual(before);
		const current = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(current?.resumeProbeFailed?.nativeSessionId).toBe(f.nativeSessionId);
		expect(current?.nativeSessionId).toBe(f.nativeSessionId);
	});

	it("a failed-resume marker blocks fresh launch even if it would fail", async () => {
		const f = await resumeFixture();
		f.runtime.exitOnLaunch = true;
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow("ResumeFailed:");
		f.runtime.exitOnLaunch = false;
		f.runtime.failLaunch = true;
		const recreated = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		const before = await f.store.read("TASK-1");
		const launches = f.runtime.launches.length;
		await expect(recreated.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toMatchObject({
			kind: "exact-resume-unavailable",
			reason: "previous-resume-failed",
		});
		expect(f.runtime.launches).toHaveLength(launches);
		expect(await f.store.read("TASK-1")).toEqual(before);
		const record = (await f.store.read("TASK-1")).modes?.build?.sessions.find(({ id }) => id === f.sessionId);
		expect(record?.resumeProbeFailed?.nativeSessionId).toBe(f.nativeSessionId);
		expect(record?.nativeSessionId).toBe(f.nativeSessionId);
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

	it("competing preparations cannot duplicate resume or start a fresh conversation", async () => {
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
		const errors = outcomes
			.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")
			.map(({ reason }) => reason as Error);
		expect(errors.some((error) => error.message.includes("ResumeFailed:"))).toBe(true);
		expect(errors).toHaveLength(2);
		expect(f.runtime.launches).toHaveLength(before + 1);
		f.runtime.exitOnLaunch = false;
		const retry = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		await expect(retry.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toMatchObject({
			kind: "exact-resume-unavailable",
			reason: "previous-resume-failed",
		});
		expect(f.runtime.launches).toHaveLength(before + 1);
	});

	it("does not rotate an OpenCode identity after exact resume failure", async () => {
		const f = await resumeFixture("opencode-v1");
		f.runtime.exitOnLaunch = true;
		await expect(f.service.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toThrow("ResumeFailed:");
		f.runtime.exitOnLaunch = false;
		const recreated = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		const before = await f.store.read("TASK-1");
		await expect(recreated.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toMatchObject({
			kind: "exact-resume-unavailable",
			reason: "previous-resume-failed",
		});
		expect(await f.store.read("TASK-1")).toEqual(before);
		const launches = f.runtime.launches.length;
		const reopened = new AgentSessionService(f.core, { runner: f.runtime, tmuxServer: f.runtime });
		await expect(reopened.prepareNativeSession("task-1", f.sessionId, "build")).rejects.toMatchObject({
			kind: "exact-resume-unavailable",
			reason: "previous-resume-failed",
		});
		expect(f.runtime.launches).toHaveLength(launches);
	});

	it("resume failure and subsequent unavailability give distinct actionable errors", async () => {
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
		let unavailable: unknown;
		try {
			await recreated.prepareNativeSession("task-1", f.sessionId, "build");
		} catch (error) {
			unavailable = error;
		}
		expect(resumeNotice).toContain("ResumeFailed:");
		expect(unavailable).toMatchObject({
			kind: "exact-resume-unavailable",
			reason: "previous-resume-failed",
			nativeSessionId: f.nativeSessionId,
		});
		expect((unavailable as Error).message).toContain("start a fresh conversation explicitly");
		expect((unavailable as Error).message).not.toBe(resumeNotice);
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
			outgoingPane.options["@agentic_workspace_launch_resources"] ?? "null",
		) as PreparedLaunchResources;
		const resourceFilePaths = [
			join(inventory.skill.path, "skills/agentic-workspace-task-management/SKILL.md"),
			join(inventory.skill.path, "agentic-workspace-opencode-cli-plugin/package.json"),
			join(inventory.skill.path, "agentic-workspace-opencode-cli-plugin/tui.js"),
			join(inventory.skill.path, ".agentic-workspace-launch-owner"),
			...(inventory.activity ? [join(inventory.activity.path, ".agentic-workspace-launch-owner")] : []),
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
		expect([...runtime.panesById.values()][0]?.options["@agentic_workspace_native_session_id"]).toBe(
			"ses_receipt_exact",
		);
		await core.createTaskFromInput({ title: "Forgotten native alias", status: "To Do" });
		const alias = await service.prepareNativeSession("task-3", undefined, "build");
		await service.stop("task-3", alias.record.id);
		const store = new SessionStore(root, runtime);
		await store.mutateSession("TASK-3", alias.record.id, async (session) => {
			session.nativeSessionId = "ses_receipt_exact";
		});
		const aliasedAttachment = await service.prepareNativeSession("task-3", alias.record.id, "build");
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
		expect([...runtime.panesById.values()][0]?.options["@agentic_workspace_native_session_id"]).toBeUndefined();
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
			runtime.runEnvironments.at(-1)?.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT ?? "null",
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

		const requestDir = join(rootAlias, ".agentic-workspace", "agent-requests");
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
