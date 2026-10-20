import { afterAll, beforeAll, describe, expect, it, mock, it as testCase } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../controller/agentic-workspace.ts";
import { ensureTaskWorktree, taskWorktreeExists, taskWorktreePath } from "../filesystem/git/task-worktree.ts";
import * as processTree from "../lib/process-tree.ts";
import { isAgenticWorkspaceSessionName, nativeSessionName } from "../model/session/session-utils.ts";
import type { AgentPreset, AgentSession } from "../model/session/types.ts";
import type { HarnessInterface } from "../runtime/agents/core/agent.ts";
import { harnessRegistry } from "../runtime/agents/startup.ts";
import { renderSessionBootstrap, yoloFlagFor } from "../runtime/bootstrap.ts";
import type { PreparedLaunchResources } from "../runtime/completion-supervisor-resources.ts";
import { prepareAgentLaunch } from "../runtime/session-launch.ts";
import type { ProcessRunner, TmuxServer } from "../runtime/sessions.ts";
import { type WorkspaceContext, workspaceRequestDir } from "../runtime/workspace-context.ts";
import { getDefaultModeCatalog, upsertAgentConfiguration } from "../storage/config.ts";
import { SessionStore } from "../storage/session-store.ts";
import { registerPromptAgent } from "./agent-test-helpers.ts";
import { coreFileSystem, createConcurrencyLimiter, initGitRepo, initializeTestProject } from "./test-utils.ts";
import { isolatedTmuxServer, killTmuxServer, uniqueTmuxSocket } from "./tmux-test-server.ts";

const processRows: processTree.ProcessRow[] = [];
mock.module("../lib/process-tree.ts", () => ({
	...processTree,
	readProcessTable: () => processRows,
	terminateProcessTree: async () => "terminated",
	terminateOwnedDescendants: async () => "terminated",
}));
const { BunRunner, SessionProcess } = await import("../runtime/session-process.ts");
const { AgentSessionService } = await import("../runtime/sessions.ts");
type SessionProcessInstance = InstanceType<typeof SessionProcess>;
type AgentSessionServiceInstance = InstanceType<typeof AgentSessionService>;

const claudeAgent = harnessRegistry.forPreset("claude");
const capturedClaudeAgent = Object.create(claudeAgent) as typeof claudeAgent;
capturedClaudeAgent.reconcileIdentity = async ({ intent, preparedIdentity }) => {
	const identity =
		preparedIdentity ??
		(intent.kind === "resume" ? { id: intent.nativeSessionId, basis: "client-established" as const } : undefined);
	if (!identity) throw new Error("Fake Claude did not receive a pinned session identity");
	return { id: identity.id, basis: "provider-confirmed" };
};
// This fake models identity capture, not provider receipt emission.
capturedClaudeAgent.readiness = undefined;

// The retired generic `prompt` bootstrap is reproduced as a test-only agent under the `pi`
// bootstrap name; this file never exercises the real Pi adapter.
const piAgent = harnessRegistry.forPreset("pi");
beforeAll(() => {
	registerPromptAgent("pi");
	harnessRegistry.replace(capturedClaudeAgent);
});
afterAll(() => {
	harnessRegistry.replace(piAgent);
	harnessRegistry.replace(claudeAgent);
});

const itRealTmux = process.env.RUN_INTERACTIVE_TUI_TESTS === "1" && Bun.which("tmux") ? it : it.skip;

async function waitUntil(predicate: () => Promise<boolean> | boolean, message: string): Promise<void> {
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		if (await predicate()) return;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
	throw new Error(`Timed out waiting for ${message}`);
}

type ProcessOptions = {
	cwd?: string;
	env?: Record<string, string>;
	stdin?: string;
	inherit?: boolean;
	timeoutMs?: number;
};

type TmuxAction =
	| { type: "newSession"; options: { name?: string; environment?: Readonly<Record<string, string>> } }
	| { type: "setOption"; pane: string; name: string; value: string }
	| { type: "setWindowOption"; pane: string; name: string; value: string }
	| { type: "setTitle"; pane: string; title: string }
	| { type: "pipeTo"; pane: string; command?: string }
	| { type: "respawn"; pane: string; command?: string }
	| { type: "kill"; pane: string }
	| { type: "cmd"; command: string; args: readonly string[] };

function isRespawnAction(action: TmuxAction): action is Extract<TmuxAction, { type: "respawn" }> {
	return action.type === "respawn";
}

class FakeWindow {
	constructor(
		private readonly owner: FakeTmux,
		private readonly paneId: string,
	) {}

	async setOption(name: string, value: string): Promise<void> {
		this.owner.actions.push({ type: "setWindowOption", pane: this.paneId, name, value });
	}
}

class FakePane {
	readonly window: FakeWindow;

	constructor(
		private readonly owner: FakeTmux,
		readonly id: string,
	) {
		this.window = new FakeWindow(owner, id);
	}

	async setOption(name: string, value: string): Promise<void> {
		const metadata = this.owner.paneMetadata.get(this.id) ?? {};
		metadata[name] = value;
		this.owner.paneMetadata.set(this.id, metadata);
		this.owner.actions.push({ type: "setOption", pane: this.id, name, value });
	}

	async setTitle(title: string): Promise<void> {
		this.owner.paneTitles.set(this.id, title);
		this.owner.actions.push({ type: "setTitle", pane: this.id, title });
	}

	async pipeTo(command?: string): Promise<void> {
		this.owner.actions.push({ type: "pipeTo", pane: this.id, command });
	}

	async respawn(command?: string): Promise<void> {
		this.owner.launchStarted?.();
		await this.owner.launchGate;
		if (this.owner.failLaunch) throw new Error("launch failed");
		this.owner.missingPanes.delete(this.id);
		this.owner.actions.push({ type: "respawn", pane: this.id, command });
	}

	async displayMessage(message: string): Promise<readonly string[]> {
		if (message === "#{pane_pid} #{pane_dead}")
			return [`${this.owner.panePids.get(this.id) ?? 0} ${this.owner.missingPanes.has(this.id) ? "1" : "0"}`];
		if (message === "#{pane_id} #{pane_dead}") {
			if (this.owner.probeError) throw this.owner.probeError;
			return [`${this.id} ${this.owner.missingPanes.has(this.id) ? "1" : "0"}`];
		}
		if (message === "#{pane_dead} #{pane_dead_status}") return [this.owner.missingPanes.has(this.id) ? "1 0" : "0 0"];
		return [""];
	}

	async kill(): Promise<void> {
		if (this.owner.failStop) throw new Error("stop failed");
		this.owner.missingPanes.add(this.id);
		this.owner.paneInventory.delete(this.id);
		this.owner.paneHandles.delete(this.id);
		this.owner.paneMetadata.delete(this.id);
		this.owner.paneSessions.delete(this.id);
		this.owner.panePids.delete(this.id);
		this.owner.paneTitles.delete(this.id);
		for (const [name, pane] of this.owner.nativeHosts) if (pane === this.id) this.owner.nativeHosts.delete(name);
		this.owner.actions.push({ type: "kill", pane: this.id });
	}
}

class FakeTmux implements ProcessRunner, TmuxServer {
	readonly processCommands: string[][] = [];
	readonly processOptions: (ProcessOptions | undefined)[] = [];
	readonly actions: TmuxAction[] = [];
	failPrepare = false;
	failLaunch = false;
	launchGate: Promise<void> | undefined;
	launchStarted: (() => void) | undefined;
	failStop = false;
	probeError: Error | undefined;
	/** Test seam: when set, every `/bin/sh` run returns this canned result instead of the default empty success. */
	shellResponse: { exitCode: number; stdout: string; stderr: string; timedOut?: boolean } | undefined;
	prepareGate: Promise<void> | undefined;
	createdPanes = 0;
	serverPid = 4242;
	probeDeadValue: string | undefined;
	paneInventory = new Set<string>();
	missingPanes = new Set<string>();
	paneMetadata = new Map<string, Record<string, string>>();
	paneSessions = new Map<string, string>();
	nativeHosts = new Map<string, string>();
	paneHandles = new Map<string, FakePane>();
	paneTitles = new Map<string, string>();
	panePids = new Map<string, number>();
	lastPaneLookup: { target: string; format: string; rows: string[] } | undefined;

	async run(
		args: string[],
		options?: ProcessOptions,
	): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }> {
		this.processCommands.push(args);
		this.processOptions.push(options);
		if (args[0] === "/bin/sh" && this.failPrepare) {
			await this.prepareGate;
			return { exitCode: 1, stdout: "", stderr: "prepare failed" };
		}
		if (args[0] === "/bin/sh" && this.shellResponse) return this.shellResponse;
		if (args[0] === "git" && args[1] === "rev-parse") return { exitCode: 0, stdout: ".git\n", stderr: "" };
		if (args[0] === "ps") {
			const pid = args[args.indexOf("-p") + 1];
			expect(args).toEqual(["ps", "-p", pid as string, "-o", "pid=,stat="]);
			return [...this.paneInventory].some((pane) => String(this.panePids.get(pane)) === pid)
				? { exitCode: 0, stdout: `${pid} S\n`, stderr: "" }
				: { exitCode: 1, stdout: "", stderr: "" };
		}
		return { exitCode: 0, stdout: "", stderr: "" };
	}

	async newSession(
		options: { name?: string; environment?: Readonly<Record<string, string>> } = {},
	): Promise<{ activePane?: FakePane }> {
		const id = `%${++this.createdPanes}`;
		const pane = new FakePane(this, id);
		this.paneInventory.add(id);
		this.paneHandles.set(id, pane);
		this.paneSessions.set(id, options.name ?? "");
		this.panePids.set(id, 100_000 + this.createdPanes);
		processRows.push({
			pid: 100_000 + this.createdPanes,
			ppid: 1,
			name: "bun",
			state: "running",
			start_time_unix_ms: 100_000 + this.createdPanes,
		});
		this.paneMetadata.set(id, {});
		this.actions.push({ type: "newSession", options });
		return { activePane: pane };
	}

	async panes(): Promise<Iterable<FakePane>> {
		return [...this.paneInventory].flatMap((id) => this.paneHandles.get(id) ?? []);
	}

	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		this.actions.push({ type: "cmd", command, args });
		if (command === "list-sessions") {
			if (this.probeError) throw this.probeError;
			return [
				...new Set([...this.paneSessions].flatMap(([pane, name]) => (this.paneInventory.has(pane) ? [name] : []))),
			];
		}
		if (command === "has-session") {
			if (this.probeError) throw this.probeError;
			const target = args[args.indexOf("-t") + 1] ?? "";
			const name = target.slice(1);
			if (
				this.paneInventory.has(this.nativeHosts.get(name) ?? "") ||
				[...this.paneSessions].some(([pane, session]) => this.paneInventory.has(pane) && session === name)
			)
				return [];
			throw new TmuxCommandError({ args: [command, ...args], exitCode: 1, target, stderr: [] });
		}
		if (command === "list-panes" && this.probeError) throw this.probeError;
		if (command === "list-panes") {
			if (args.includes("-t")) {
				const target = args[args.indexOf("-t") + 1] ?? "";
				const format = args[args.indexOf("-F") + 1];
				if (!format) throw new Error("Targeted pane lookup requires an explicit format");
				const nativeName = /^=(.+):$/.exec(target)?.[1];
				const nativeHost = nativeName ? this.nativeHosts.get(nativeName) : undefined;
				const panes = nativeName
					? nativeHost
						? [nativeHost]
						: [...this.paneInventory].filter((pane) => this.paneSessions.get(pane) === nativeName)
					: this.paneInventory.has(target)
						? [target]
						: [];
				if (!panes.length)
					throw new TmuxCommandError({
						args: [command, ...args],
						exitCode: 1,
						target,
						stderr: [nativeName ? `can't find session: ${nativeName}` : `can't find pane: ${target}`],
					});
				const rows = panes.map((pane) => {
					const values: Record<string, string> = {
						...this.paneMetadata.get(pane),
						session_name: this.paneSessions.get(pane) ?? "",
						pane_id: pane,
						window_id: `@${pane.slice(1)}`,
						pane_pid: String(this.panePids.get(pane)),
						pane_dead: this.probeDeadValue ?? (this.missingPanes.has(pane) ? "1" : "0"),
						pane_title: this.paneTitles.get(pane) ?? "",
					};
					return format.replace(/#\{([^}]+)\}/g, (_match, key: string) => values[key] ?? "");
				});
				this.lastPaneLookup = { target, format, rows };
				return rows;
			}
			const format = args[args.indexOf("-F") + 1];
			if (!format) throw new Error("Pane listing requires an explicit format");
			return [...this.paneInventory].map((pane) => {
				const values: Record<string, string> = {
					...this.paneMetadata.get(pane),
					session_name: this.paneSessions.get(pane) ?? "",
					pane_id: pane,
					window_id: `@${pane.slice(1)}`,
					pane_pid: String(this.panePids.get(pane) ?? ""),
					pane_dead: this.missingPanes.has(pane) ? "1" : "0",
					pane_title: this.paneTitles.get(pane) ?? "",
					window_name: "@agent",
				};
				return format.replace(/#\{([^}]+)\}/g, (_match, key: string) => values[key] ?? "");
			});
		}
		if (command === "set-option") {
			const pane = args[args.indexOf("-t") + 1] ?? "";
			const unset = args.includes("-u");
			const name = unset ? (args.at(-1) ?? "") : (args.at(-2) ?? "");
			const metadata = this.paneMetadata.get(pane) ?? {};
			if (unset) delete metadata[name];
			else metadata[name] = args.at(-1) ?? "";
			this.paneMetadata.set(pane, metadata);
			return [];
		}
		if (command === "display-message") {
			if (args.includes("#{pid}")) return [`${this.serverPid}`];
			const target = args[args.indexOf("-t") + 1] ?? "";
			if (target && !this.paneInventory.has(target))
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					target,
					stderr: [`can't find pane: ${target}`],
				});
			if (args.some((arg) => arg.includes("@agentic_workspace_launch_resources")))
				return [this.paneMetadata.get(target)?.["@agentic_workspace_launch_resources"] ?? ""];
			if (args.includes("#{pane_pid} #{pane_dead}"))
				return [`${this.panePids.get(target) ?? this.serverPid} ${this.missingPanes.has(target) ? "1" : "0"}`];
			return [`${target} ${this.missingPanes.has(target) ? "1" : "0"}`];
		}
		return [];
	}
}

/**
 * Every case needs the same initialized project (project config, TASK-1, and the `test` preset), so
 * one template is laid out once in `beforeAll` and cloned per case. Cloning keeps each case's writes
 * private while removing the repeated project initialization that used to dominate this suite.
 */
let templateDir: string;
let projectNumber = 0;
let originalXdgConfigHome: string | undefined;
let isolatedConfigHome: string;
const projectDirs: string[] = [];

beforeAll(async () => {
	// A developer running the suite from inside a workspace agent pane inherits this variable; the
	// unowned branch must stay the default here.
	delete process.env.AGENTIC_WORKSPACE_WORKSPACE_CONTEXT;
	// User-level configuration must not leak into the template project's parent lookup; pin it to an
	// empty directory (mirrors `config.test.ts`).
	originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	isolatedConfigHome = await mkdtemp(join(tmpdir(), "agent-sessions-config-"));
	process.env.XDG_CONFIG_HOME = isolatedConfigHome;
	templateDir = await mkdtemp(join(tmpdir(), "agent-sessions-template-"));
	const core = new Core(templateDir);
	await initializeTestProject(core, "Agent sessions");
	await core.createTaskFromInput({ title: "Session task", status: "To Do" });
	await upsertAgentConfiguration(core, "project", {
		selectedPreset: "test",
		presets: {
			test: { command: ["agent", "{prompt}", "{skill}"], env: {}, prepare: "", bootstrap: "pi" },
		},
	});
});

afterAll(async () => {
	await Promise.all(projectDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
	await rm(templateDir, { recursive: true, force: true });
	await rm(isolatedConfigHome, { recursive: true, force: true });
	if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
});

async function project(): Promise<{ root: string; core: Core; runner: FakeTmux }> {
	const target = join(tmpdir(), `agent-sessions-${process.pid}-${projectNumber++}`);
	await cp(templateDir, target, { recursive: true });
	const root = await realpath(target);
	projectDirs.push(root);
	return { root, core: new Core(root), runner: new FakeTmux() };
}

/** The real Claude adapter's ask command; used instead of the registered `pi` fake, whose ask throws. */
const askPreset: AgentPreset = { command: ["agent"], env: {}, prepare: "", bootstrap: "claude" };

function askSession(
	root: string,
	overrides: Partial<AgentSession> & { id: string; status: AgentSession["status"] },
): AgentSession {
	return {
		taskId: "TASK-1",
		preset: "test",
		tmuxName: `agentic-workspace-task-1-${overrides.id.slice(0, 8)}`,
		cwd: root,
		createdAt: new Date().toISOString(),
		outputPath: join(root, `${overrides.id}.log`),
		bootstrapPath: join(root, `${overrides.id}.md`),
		...overrides,
	};
}

async function seedAskSessions(root: string, sessions: AgentSession[], activeSessionId?: string): Promise<void> {
	await upsertAgentConfiguration(new Core(root), "project", { selectedPreset: "test", presets: { test: askPreset } });
	const store = new SessionStore(root, new BunRunner());
	await store.mutate("TASK-1", async (state) => {
		state.modes.build ??= { sessions: [] };
		const history = state.modes.build;
		history.sessions.splice(0, history.sessions.length, ...sessions);
		history.activeSessionId = activeSessionId ?? sessions.at(-1)?.id;
	});
}

function nativeCleanupSession(
	root: string,
	overrides: Partial<AgentSession> & { id: string; status: AgentSession["status"] },
): AgentSession {
	return askSession(root, {
		nativeWorkspace: true,
		nativeSessionId: `native-${overrides.id}`,
		outputPath: join(root, ".agentic-workspace", "task-1", `${overrides.id}.log`),
		bootstrapPath: join(root, ".agentic-workspace", "task-1", `${overrides.id}.md`),
		...overrides,
	});
}

function sessionOrigin(session: { record: AgentSession; paneId: string }): { record: AgentSession; paneId: string } {
	return { record: structuredClone(session.record), paneId: session.paneId };
}

function addNativeHost(runner: FakeTmux, root: string, session: AgentSession, ownerPid: number): string {
	const pane = `%${++runner.createdPanes}`;
	runner.paneInventory.add(pane);
	runner.nativeHosts.set(session.tmuxName, pane);
	runner.paneSessions.set(pane, session.tmuxName);
	runner.paneHandles.set(pane, new FakePane(runner, pane));
	runner.panePids.set(pane, ownerPid);
	runner.paneMetadata.set(pane, {
		"@agentic_workspace_root": root,
		"@agentic_workspace_task": session.taskId,
		"@agentic_workspace_session": session.id,
		"@agentic_workspace_role": "live-preview",
		"@agentic_workspace_owner_pid": String(ownerPid),
		"@agentic_workspace_native_session_id": session.nativeSessionId ?? "",
		"@agentic_workspace_native_provider": session.nativeProvider ?? "",
	});
	return pane;
}

async function releaseFakeExecutionPane(
	service: AgentSessionServiceInstance,
	runner: FakeTmux,
	session: AgentSession,
): Promise<void> {
	try {
		await (service as unknown as { process: SessionProcessInstance }).process.kill(session);
	} catch (error) {
		throw new Error(
			`${error instanceof Error ? error.message : String(error)}; fake exact-pane query=${JSON.stringify(runner.lastPaneLookup)}; panes=${JSON.stringify(
				[...runner.paneInventory].map((id) => ({
					id,
					name: runner.paneSessions.get(id),
					tags: runner.paneMetadata.get(id),
				})),
			)}`,
		);
	}
	for (const [pane, metadata] of runner.paneMetadata) {
		if (
			metadata["@agentic_workspace_session"] !== session.id ||
			!(["live-preview", "retired-session"] as const).includes(
				metadata["@agentic_workspace_role"] as "live-preview" | "retired-session",
			)
		)
			continue;
		runner.paneInventory.delete(pane);
		runner.paneHandles.delete(pane);
		runner.paneSessions.delete(pane);
		runner.panePids.delete(pane);
		runner.paneTitles.delete(pane);
		runner.paneMetadata.delete(pane);
	}
}

/** The single `/bin/sh -lc` command the runner recorded, or undefined when none ran. */
function shellRun(runner: FakeTmux): string[] | undefined {
	return runner.processCommands.find((args) => args[0] === "/bin/sh");
}

describe("agent auto-approval (yolo) flags", () => {
	it("maps only the providers with a verified auto-approval flag", () => {
		expect(yoloFlagFor("opencode")).toBeUndefined();
		expect(harnessRegistry.forPreset("opencode-v1").yoloFlag()).toBe("--auto");
		expect(harnessRegistry.forPreset("opencode-v2").yoloFlag()).toBe("--auto");
		expect(yoloFlagFor("claude")).toBe("--dangerously-skip-permissions");
		expect(yoloFlagFor("pi")).toBeUndefined();
	});

	it("appends the OpenCode auto-approval flag only when yolo is enabled", async () => {
		const root = await mkdtemp(join(tmpdir(), "agent-sessions-yolo-"));
		const bootstrapPath = join(root, "bootstrap.md");
		await Bun.write(bootstrapPath, renderSessionBootstrap({ taskId: "TASK-1" }));
		const original = harnessRegistry.forPreset("opencode-v2");
		const fake = Object.create(original) as typeof original;
		fake.preflightLaunch = async () => undefined;
		fake.prepare = async (request) => ({ command: request.preset.command.join(" "), env: request.env });
		fake.readiness = undefined;
		harnessRegistry.replace(fake);
		const preset: AgentPreset = { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode-v2" };
		const profile = getDefaultModeCatalog().profiles.build!;
		try {
			const off = await prepareAgentLaunch(preset, bootstrapPath, {
				cwd: root,
				intent: { kind: "new" },
				profile,
			});
			try {
				expect(off.command).not.toContain("--auto");
			} finally {
				await off.cleanup();
			}
			const on = await prepareAgentLaunch(preset, bootstrapPath, {
				cwd: root,
				intent: { kind: "new" },
				yolo: true,
				profile,
			});
			try {
				expect(on.command).toContain("--auto");
			} finally {
				await on.cleanup();
			}
		} finally {
			harnessRegistry.replace(original);
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe.concurrent("AgentSessionService", () => {
	// Each case copies a project fixture; eight slots limit filesystem contention while avoiding
	// the long per-case queue introduced by narrower caps under the unchanged timeout.
	const limit = createConcurrencyLimiter(8);
	const it = Object.assign(
		(name: string, fn: () => Promise<void>, timeout?: number) => testCase(name, () => limit(fn), timeout),
		{
			each: (values: boolean[]) => (name: string, fn: (value: boolean) => Promise<void>) =>
				testCase.each(values)(name, (value) => limit(() => fn(value))),
		},
	);
	const itRealTmuxLimited = (name: string, fn: () => Promise<void>) => itRealTmux(name, () => limit(fn));

	it("reconciles a parked native session when its exact host is absent", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const parked = nativeCleanupSession(root, { id: "parked", status: "parked", ownerPid: undefined });
		await seedAskSessions(root, [parked]);
		await service.reconcileTaskSessions("TASK-1");

		expect((await service.list("TASK-1")).sessions[0]?.status).toBe("parked");
		expect((await service.list("TASK-1")).sessions[0]?.endedAt).toBeUndefined();
		expect(runner.actions.some((action) => action.type === "kill")).toBe(false);
	});

	it("rejects foreign live sessions and stale STARTING records without dispatch", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const cli = askSession(root, { id: "cli", status: "running" });
		const native = nativeCleanupSession(root, { id: "native", status: "running", ownerPid: 1 });
		const host = addNativeHost(runner, root, native, 7_777);
		const hostTags = runner.paneMetadata.get(host);
		if (!hostTags) throw new Error("Expected fake live-host tags");
		hostTags["@agentic_workspace_root"] = "/foreign/root";
		await seedAskSessions(root, [cli, native]);

		await expect(service.stopAllTaskSessions("TASK-1")).rejects.toThrow("ownership does not match");
		expect(runner.actions.some((action) => action.type === "kill")).toBe(false);
		expect((await service.list("TASK-1")).sessions.map((session) => session.status)).toEqual(["running", "running"]);

		const starting = nativeCleanupSession(root, { id: "starting", status: "starting", ownerPid: undefined });
		await seedAskSessions(root, [cli, starting]);
		await expect(service.stopAllTaskSessions("TASK-1")).rejects.toThrow(
			"can't find session: agentic-workspace-task-1-starting",
		);
		expect(runner.actions.some((action) => action.type === "kill")).toBe(false);
		expect((await service.list("TASK-1")).sessions.map((session) => session.status)).toEqual(["running", "starting"]);
	});

	it("attaches a live STARTING record before applying the unverified-pending refusal", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const original = await service.prepareNativeSession("task-1", undefined, "build");
		const store = new SessionStore(root, new BunRunner());
		await store.mutateSession("TASK-1", original.record.id, async (record) => {
			record.status = "starting";
		});
		const launchesBefore = runner.actions.filter(isRespawnAction).length;
		const attached = await service.prepareNativeSession("task-1", original.record.id, "build");
		expect(attached.paneId).toBe(original.paneId);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(launchesBefore);
		expect(runner.actions.filter((action) => action.type === "kill")).toEqual([]);
		expect((await store.read("TASK-1")).modes?.build?.sessions[0]?.status).toBe("starting");
	});

	it("refuses an unmarked non-live STARTING record without cleanup or dispatch", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await service.prepareNativeSession("task-1", undefined, "build");
		const store = new SessionStore(root, new BunRunner());
		await store.mutateSession("TASK-1", pending.record.id, async (record) => {
			record.status = "starting";
		});
		runner.missingPanes.add(pending.paneId);
		const launchesBefore = runner.actions.filter(isRespawnAction).length;
		await expect(service.prepareNativeSession("task-1", pending.record.id, "build")).rejects.toThrow(
			"unverified pending launch",
		);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(launchesBefore);
		expect(runner.actions.filter((action) => action.type === "kill")).toEqual([]);
		expect((await store.read("TASK-1")).modes?.build?.sessions[0]?.status).toBe("starting");
	});

	it("rejects a foreign live host and propagates native probe errors without mutating state", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const parked = nativeCleanupSession(root, { id: "parked-live", status: "parked", ownerPid: undefined });
		const host = addNativeHost(runner, root, parked, 8_888);
		const hostTags = runner.paneMetadata.get(host);
		if (!hostTags) throw new Error("Expected fake owned host tags");
		hostTags["@agentic_workspace_root"] = "/foreign/root";
		await seedAskSessions(root, [parked]);
		await expect(service.stopAllTaskSessions("TASK-1")).rejects.toThrow();
		expect((await service.list("TASK-1")).sessions[0]?.status).toBe("parked");

		const failedProbeServer = {
			...runner,
			cmd: async () => {
				throw new Error("probe transport failed");
			},
		} as unknown as TmuxServer;
		const failedProbe = new AgentSessionService(core, { runner, tmuxServer: failedProbeServer });
		await expect(failedProbe.stopAllTaskSessions("TASK-1")).rejects.toThrow("probe transport failed");
		expect((await service.list("TASK-1")).sessions[0]?.status).toBe("parked");
	});

	it.each([
		true,
		false,
	])("resumes a dead owned pane only after cleanup (nativeWorkspace=%s)", async (nativeWorkspace) => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const parked = nativeCleanupSession(root, {
			id: `parked-dead-${nativeWorkspace}`,
			status: "parked",
			nativeWorkspace,
			ownerPid: 9_999,
		});
		const pane = addNativeHost(runner, root, parked, 9_999);
		runner.missingPanes.add(pane);
		await seedAskSessions(root, [parked]);

		await service.reconcileTaskSessions("TASK-1");
		expect((await service.list("TASK-1")).sessions[0]?.status).toBe("parked");
		const resumed = await service.prepareNativeSession("TASK-1", parked.id);
		expect(resumed.record.nativeSessionId).toBe(parked.nativeSessionId);
		expect(runner.actions).toContainEqual({ type: "kill", pane });
		expect(runner.paneInventory.has(pane)).toBe(false);
		const actions = runner.actions;
		expect(actions.findIndex((action) => action.type === "kill")).toBeLessThan(actions.findIndex(isRespawnAction));
		expect(actions.filter(isRespawnAction).at(-1)?.command).toContain(parked.nativeSessionId as string);
	});

	it.each([true, false])("attaches an exact live native session (nativeWorkspace=%s)", async (nativeWorkspace) => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const existing = nativeCleanupSession(root, {
			id: `live-${nativeWorkspace}`,
			status: "running",
			nativeWorkspace,
			ownerPid: process.pid,
		});
		const pane = addNativeHost(runner, root, existing, process.pid);
		await seedAskSessions(root, [existing], existing.id);

		const attached = await service.prepareNativeSession("TASK-1", existing.id);

		expect(attached.record.id).toBe(existing.id);
		expect(attached.paneId).toBe(pane);
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
		expect(runner.actions.filter((action) => action.type === "kill")).toEqual([]);
		expect((await service.list("TASK-1")).activeSessionId).toBe(existing.id);
	});

	it("claims every mode in stable order and releases earlier claims after contention", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const store = (service as unknown as { store: SessionStore }).store;
		const cli = askSession(root, { id: "a-cli", status: "running" });
		const parked = nativeCleanupSession(root, { id: "b-parked", status: "parked", ownerPid: undefined });
		await store.mutateMode("TASK-1", "alpha", async (history) => {
			history.sessions.push(cli);
			history.activeSessionId = cli.id;
		});
		await store.mutateMode("TASK-1", "zeta", async (history) => {
			history.sessions.push(parked);
			history.activeSessionId = parked.id;
		});
		const blocker = await store.claimSession("TASK-1", parked.id);
		try {
			await expect(service.stopAllTaskSessions("TASK-1")).rejects.toThrow("already being resumed or asked");
			expect((await store.read("TASK-1")).modes?.alpha?.sessions[0]?.status).toBe("running");
			expect((await store.read("TASK-1")).modes?.zeta?.sessions[0]?.status).toBe("parked");
			expect(runner.actions.some((action) => action.type === "kill")).toBe(false);
		} finally {
			await blocker();
		}
		const released = await store.claimSession("TASK-1", cli.id);
		await released();
	});

	it("rejects a status change observed after claims without stopping another mode", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const store = (service as unknown as { store: SessionStore }).store;
		const cli = askSession(root, { id: "a-cli", status: "running" });
		const parked = nativeCleanupSession(root, { id: "b-parked", status: "parked", ownerPid: undefined });
		await store.mutateMode("TASK-1", "alpha", async (history) => {
			history.sessions.push(cli);
			history.activeSessionId = cli.id;
		});
		await store.mutateMode("TASK-1", "zeta", async (history) => {
			history.sessions.push(parked);
			history.activeSessionId = parked.id;
		});
		const claim = store.claimSession.bind(store);
		store.claimSession = async (taskId, sessionId) => {
			const release = await claim(taskId, sessionId);
			if (sessionId === cli.id)
				await store.mutateSession(taskId, sessionId, async (current) => {
					current.status = "stopped";
				});
			return release;
		};

		await expect(service.stopAllTaskSessions("TASK-1")).rejects.toThrow("session history changed");
		expect((await store.read("TASK-1")).modes?.alpha?.sessions[0]?.status).toBe("stopped");
		expect((await store.read("TASK-1")).modes?.zeta?.sessions[0]?.status).toBe("parked");
		expect(runner.actions.some((action) => action.type === "kill")).toBe(false);
		const released = await claim("TASK-1", cli.id);
		await released();
	});

	it("does not overwrite a native status changed after running-host preflight", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const store = (service as unknown as { store: SessionStore }).store;
		const native = nativeCleanupSession(root, { id: "native-race", status: "running", ownerPid: process.pid });
		addNativeHost(runner, root, native, process.pid);
		await seedAskSessions(root, [native]);
		const mutateSession = store.mutateSession.bind(store);
		let raced = false;
		store.mutateSession = async (taskId, sessionId, mutate) => {
			if (sessionId === native.id && !raced) {
				raced = true;
				await store.mutate(taskId, async (state) => {
					for (const history of Object.values(state.modes)) {
						const current = history.sessions.find((candidate) => candidate.id === sessionId);
						if (current) {
							current.status = "parked";
							current.ownerPid = undefined;
						}
					}
				});
			}
			return await mutateSession(taskId, sessionId, mutate);
		};

		await expect(service.stopAllTaskSessions("TASK-1", new Map([[native.id, async () => {}]]))).rejects.toThrow(
			"status or owner changed",
		);
		expect((await store.read("TASK-1")).modes.build?.sessions[0]?.status).toBe("parked");
	});

	it("preflights every mode before invoking an owned native stop capability", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const store = (service as unknown as { store: SessionStore }).store;
		const owned = nativeCleanupSession(root, { id: "owned-mode", status: "running", ownerPid: process.pid });
		const foreign = nativeCleanupSession(root, { id: "foreign-mode", status: "running", ownerPid: 12_345 });
		const foreignPane = addNativeHost(runner, root, foreign, 12_345);
		const foreignTags = runner.paneMetadata.get(foreignPane);
		if (!foreignTags) throw new Error("Expected fake foreign-host tags");
		foreignTags["@agentic_workspace_root"] = "/foreign/root";
		await store.mutateMode("TASK-1", "alpha", async (history) => {
			history.sessions.push(owned);
			history.activeSessionId = owned.id;
		});
		await store.mutateMode("TASK-1", "zeta", async (history) => {
			history.sessions.push(foreign);
			history.activeSessionId = foreign.id;
		});
		const stops: string[] = [];

		await expect(
			service.stopAllTaskSessions(
				"TASK-1",
				new Map([
					[
						owned.id,
						async () => {
							stops.push(owned.id);
						},
					],
				]),
			),
		).rejects.toThrow("ownership does not match");
		expect(stops).toEqual([]);
		expect((await store.read("TASK-1")).modes?.alpha?.sessions[0]?.status).toBe("running");
		expect((await store.read("TASK-1")).modes?.zeta?.sessions[0]?.status).toBe("running");
	});

	it("tags the placeholder pane before launching the agent", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		expect("paneId" in session).toBe(false);
		expect("paneId" in ((await service.list("task-1")).sessions[0] ?? {})).toBe(false);
		expect(session.nativeSessionId).toBe(session.id);
		const created = runner.actions.find((action) => action.type === "newSession");
		expect(created).toMatchObject({ type: "newSession", options: { name: session.tmuxName } });
		expect(runner.paneMetadata.get("%1")?.["@agentic_workspace_task"]).toBe("TASK-1");
		expect(runner.paneMetadata.get("%1")?.["@agentic_workspace_session"]).toBe(session.id);
		expect(runner.paneMetadata.get("%1")?.["@agentic_workspace_role"]).toBe("live-preview");
		expect(runner.actions).toContainEqual({ type: "setTitle", pane: "%1", title: "TASK-1 live-preview" });
		expect(runner.actions).toContainEqual({ type: "respawn", pane: "%1", command: expect.anything() });
	});

	testCase.serial(
		"fails and cleans up a dispatched launch when its readiness receipt never appears",
		async () => {
			const { core, runner } = await project();
			const original = harnessRegistry.forPreset("claude");
			const fake = Object.create(capturedClaudeAgent) as typeof capturedClaudeAgent;
			let launchDirectory = "";
			fake.readiness = (_intent, directory) => {
				launchDirectory = directory;
				return {
					initialized: { path: join(directory, "never-initialized") },
					promptAccepted: { path: join(directory, "never-accepted") },
				};
			};
			harnessRegistry.replace(fake);
			await upsertAgentConfiguration(core, "project", {
				selectedPreset: "claude",
				presets: { claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" } },
			});
			const service = new AgentSessionService(core, { runner, tmuxServer: runner });
			try {
				await expect(service.start("task-1")).rejects.toThrow("Provider readiness timed out");
				const state = await service.list("task-1");
				expect(state.sessions[0]?.status).not.toBe("running");
				expect(state.sessions[0]?.error).toContain("Provider readiness timed out");
				expect(runner.actions).toContainEqual({ type: "kill", pane: "%1" });
				expect(launchDirectory).not.toBe("");
				expect(existsSync(launchDirectory)).toBeFalse();
			} finally {
				harnessRegistry.replace(original);
			}
		},
		30000,
	);

	it("reads every persisted session in one scan, without needing the task corpus", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const all = await service.listAllSessions();
		expect(all.get("TASK-1")?.sessions.map((entry) => entry.id)).toEqual([session.id]);

		// A task with durable session state but no task file: `list` must keep rejecting it, while the
		// single-scan read must still see the state. This is the whole point of the method.
		const store = new SessionStore(root, new BunRunner());
		await store.mutate("TASK-404", async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push({ ...session, id: "ghost", taskId: "TASK-404" });
			history.activeSessionId = "ghost";
		});
		const scanned = await service.listAllSessions();
		expect(scanned.get("TASK-404")?.sessions.map((entry) => entry.id)).toEqual(["ghost"]);
		await expect(service.list("TASK-404")).rejects.toThrow("Locally editable task not found: TASK-404");
	});

	it("forwards a key only to the running selected session pane", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");

		await service.sendKey("task-1", session.id, "x");

		expect(runner.actions.at(-1)).toEqual({ type: "cmd", command: "send-keys", args: ["-t", "%1", "x"] });
		await service.stop("task-1", session.id);
		await expect(service.sendKey("task-1", session.id, "x")).rejects.toThrow("not active");
	});

	it("persists the provider-captured native session identity at launch", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: {
				claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const nativeSessionId = session.nativeSessionId;
		expect(nativeSessionId).toBeString();
		expect(nativeSessionId).not.toBe(session.id);
		expect((await service.list("task-1")).sessions[0]?.nativeSessionId).toBe(nativeSessionId);
		const launched = runner.actions.filter(isRespawnAction).find((action) => action.pane === "%1")?.command;
		expect(launched).toContain(nativeSessionId);
	});

	it("preserves configured PATH without injecting task-manager environment", async () => {
		const { core, runner } = await project();
		const prepareCommand = `printf '%s' "$AGENTIC_WORKSPACE_PROJECT_DIR|$AGENTIC_WORKSPACE_WORKTREE_DIR|$AGENTIC_WORKSPACE_TASK_DIR"`;
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: {
					command: ["agent", "{prompt}", "{skill}"],
					env: { TASK_CONTEXT: "$AGENTIC_WORKSPACE_TASK_DIR", PATH: "/custom/bin" },
					prepare: prepareCommand,
					bootstrap: "pi",
				},
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const taskDir = await coreFileSystem(core).taskArtifacts.containerPath(session.taskId);
		expect(session.pathContext).toEqual({
			projectDir: coreFileSystem(core).rootDir,
			worktreeDir: session.cwd,
			taskDir,
		});
		const created = runner.actions.find((action) => action.type === "newSession");
		expect(created?.options.environment?.PATH).toBe("/custom/bin");
		expect(created?.options.environment?.AGENTIC_WORKSPACE_PROJECT_DIR).toBe(coreFileSystem(core).rootDir);
		expect(created?.options.environment?.AGENTIC_WORKSPACE_WORKTREE_DIR).toBe(session.cwd);
		expect(created?.options.environment?.AGENTIC_WORKSPACE_TASK_DIR).toBe(taskDir);
		expect(created?.options.environment?.TASK_CONTEXT).toBe(taskDir);
		const preparation = runner.processCommands.findIndex((args) => args[0] === "/bin/sh" && args[2] === prepareCommand);
		expect(preparation).toBeGreaterThanOrEqual(0);
		expect(runner.processOptions[preparation]?.env).toMatchObject({
			AGENTIC_WORKSPACE_PROJECT_DIR: coreFileSystem(core).rootDir,
			AGENTIC_WORKSPACE_WORKTREE_DIR: session.cwd,
			AGENTIC_WORKSPACE_TASK_DIR: taskDir,
			TASK_CONTEXT: taskDir,
		});
		expect(created?.options.environment?.AGENTIC_WORKSPACE_CWD).toBeUndefined();
		expect(created?.options.environment?.AGENTIC_WORKSPACE_TASK_ID).toBeUndefined();
		expect(created?.options.environment?.AGENTIC_WORKSPACE_SESSION_ID).toBeUndefined();
	});

	it("preserves an unflagged predecessor and activates a new session when replacing", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1");
		let replacement: AgentSession;
		try {
			replacement = await service.start("task-1", { replace: true });
		} catch (error) {
			throw new Error(
				`${error instanceof Error ? error.message : String(error)}; fake exact-pane query=${JSON.stringify(runner.lastPaneLookup)}; panes=${JSON.stringify(
					[...runner.paneInventory].map((id) => ({
						id,
						name: runner.paneSessions.get(id),
						tags: runner.paneMetadata.get(id),
					})),
				)}`,
			);
		}
		const state = await service.list("task-1");
		expect(state.sessions.find((session) => session.id === first.id)?.status).toBe("running");
		expect(state.activeSessionId).toBe(replacement.id);
		expect(replacement.id).not.toBe(first.id);
		expect(state.sessions.map((session) => session.id)).toEqual([first.id, replacement.id]);
	});

	it("exposes a running CLI pane for native attachment without launching another conversation", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const before = await service.list("task-1");
		const live = await service.liveSession("task-1", session.id);
		expect(live?.record.id).toBe(session.id);
		expect(live?.paneId).toBe("%1");
		expect(live?.server).toBe(runner);
		expect(await service.list("task-1")).toEqual(before);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(1);
		expect(runner.actions.some((action) => action.type === "kill")).toBeFalse();
	});

	it("inspects a live pane passively without killing it or rewriting status", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const before = await service.list("task-1");
		const killsBefore = runner.actions.filter((action) => action.type === "kill").length;

		expect((await service.liveSession("task-1", session.id, { passive: true }))?.paneId).toBe("%1");
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBefore);
		expect(await service.list("task-1")).toEqual(before);

		// tmux reporting pane_dead=1 is the only dead signal; passive inspection still never kills.
		runner.missingPanes.add("%1");
		expect(await service.liveSession("task-1", session.id, { passive: true })).toBeUndefined();
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBefore);
		expect((await service.list("task-1")).sessions[0]?.status).toBe("stopped");
	});

	it("settles a passive session whose pane is gone without killing anything", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const killsBefore = runner.actions.filter((action) => action.type === "kill").length;
		// No pane matches the session any more: `alive` answers with its canonical no-pane result.
		runner.paneInventory.delete("%1");
		runner.paneMetadata.delete("%1");
		runner.paneSessions.delete("%1");
		runner.paneHandles.delete("%1");
		runner.panePids.delete("%1");
		runner.paneTitles.delete("%1");
		expect(await service.liveSession("task-1", session.id, { passive: true })).toBeUndefined();
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBefore);
		expect((await service.list("task-1")).sessions[0]?.status).toBe("stopped");
	});

	it("reports an inconclusive passive probe without killing the pane or rewriting status", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const before = await service.list("task-1");
		const killsBefore = runner.actions.filter((action) => action.type === "kill").length;
		runner.probeError = new Error("tmux transport failure");

		await expect(service.liveSession("task-1", session.id, { passive: true })).rejects.toThrow(
			"tmux transport failure",
		);
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBefore);
		expect(await service.list("task-1")).toEqual(before);
	});

	it("never treats a transport not-found message as a missing pane", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const before = await service.list("task-1");
		const killsBefore = runner.actions.filter((action) => action.type === "kill").length;
		runner.probeError = new Error("tmux binary not found");

		// The wording contains "not found", but it is not the canonical no-pane result for this
		// session, so it is inconclusive rather than proof the pane is gone.
		await expect(service.liveSession("task-1", session.id, { passive: true })).rejects.toThrow("tmux binary not found");
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBefore);
		expect(await service.list("task-1")).toEqual(before);
	});

	it("persists native conversations across workspace reopening and resumes only their exact identity", async () => {
		const { root, core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: { claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" } },
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.prepareNativeSession("task-1");
		expect(first.record.cwd).toBe(root);
		expect(first.record.nativeSessionId).toBeTruthy();
		expect(first.record.nativeWorkspace).toBeTrue();
		await service.activateNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		const running = await service.list("task-1");
		const preview = await service.liveSession("task-1", first.record.id, { passive: true });
		expect(preview).toMatchObject({
			paneId: first.paneId,
			record: { id: first.record.id, ownerPid: process.pid },
		});
		expect(runner.paneMetadata.get(first.paneId)?.["@agentic_workspace_role"]).toBe("live-preview");
		expect(runner.actions).toContainEqual({
			type: "cmd",
			command: "set-option",
			args: ["-p", "-t", first.paneId, "@agentic_workspace_native_provider", "claude"],
		});
		const sharedMetadata = runner.paneMetadata.get(first.paneId) ?? {};
		for (const [name, value] of Object.entries({
			"@agentic_workspace_root": root,
			"@agentic_workspace_task": first.record.taskId,
			"@agentic_workspace_session": first.record.id,
			"@agentic_workspace_native_session_id": first.record.nativeSessionId as string,
			"@agentic_workspace_native_provider": "claude",
		})) {
			const launchesBeforeMismatch = runner.actions.filter(isRespawnAction).length;
			sharedMetadata[name] = "foreign";
			await expect(service.liveSession("task-1", first.record.id, { passive: true })).rejects.toThrow(
				/does not match|identity conflicts/,
			);
			expect(runner.actions.filter(isRespawnAction)).toHaveLength(launchesBeforeMismatch);
			expect(await service.list("task-1")).toEqual(running);
			sharedMetadata[name] = value;
		}
		await releaseFakeExecutionPane(service, runner, first.record);
		await service.finishNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		const reopened = new AgentSessionService(core, { runner, tmuxServer: runner });
		expect((await reopened.list("task-1")).activeSessionId).toBe(first.record.id);
		const resumed = await reopened.prepareNativeSession("task-1", first.record.id);
		expect(resumed.record.id).toBe(first.record.id);
		expect(resumed.bootstrap).toBe("claude");
		const resumeCommand = runner.actions.filter(isRespawnAction).at(-1)?.command ?? "";
		expect(resumeCommand).toContain("--resume");
		expect(resumeCommand).toContain(first.record.nativeSessionId as string);
		expect((await reopened.list("task-1")).sessions).toHaveLength(1);
		expect((await core.loadTaskById("task-1"))?.status).toBe("To Do");
	});

	it("resumes the exact native identity after natural exit, detach, and reopen without clearing pane inventory", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: { claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" } },
		});
		const original = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await original.prepareNativeSession("task-1");
		const nativeId = first.record.nativeSessionId;
		if (!nativeId) throw new Error("Expected the native conversation identity to be saved");
		const paneId = first.paneId;
		const paneCount = runner.paneInventory.size;

		// Natural exit leaves the tagged tmux pane and its resource inventory for service recovery.
		runner.missingPanes.add(paneId);
		const reopened = new AgentSessionService(core, { runner, tmuxServer: runner });
		await reopened.reconcileTaskSessions("task-1");
		expect((await reopened.list("task-1")).sessions[0]?.status).toBe("stopped");
		expect(runner.actions.some((action) => action.type === "kill")).toBe(false);
		expect(runner.paneInventory.size).toBe(paneCount);

		const resumed = await reopened.prepareNativeSession("task-1", first.record.id);
		expect(resumed.record.id).toBe(first.record.id);
		expect(resumed.record.nativeSessionId).toBe(nativeId);
		expect(runner.actions.filter(isRespawnAction).at(-1)?.command).toContain(nativeId);
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(1);
		expect(runner.paneInventory.has(paneId)).toBe(false);
		const killIndex = runner.actions.findIndex((action) => action.type === "kill");
		const launchIndex = runner.actions.findLastIndex(
			(action) => action.type === "respawn" && action.command?.includes(nativeId),
		);
		expect(killIndex).toBeGreaterThanOrEqual(0);
		expect(launchIndex).toBeGreaterThan(killIndex);
	});

	it("parks a native session without ending it and keeps the active pointer for auto-resume", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: { claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" } },
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.prepareNativeSession("task-1");
		await service.activateNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		await service.parkNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		const state = await service.list("task-1");
		const parked = state.sessions.find((session) => session.id === first.record.id);
		expect(parked?.status).toBe("parked");
		expect(parked?.endedAt).toBeUndefined();
		expect(parked?.ownerPid).toBeUndefined();
		// Parking never ends the session: the pointer survives for the next workspace.
		expect(state.activeSessionId).toBe(first.record.id);
		await releaseFakeExecutionPane(service, runner, first.record);
		const resumed = await service.prepareNativeSession("task-1", first.record.id);
		expect(resumed.record.id).toBe(first.record.id);
		expect(resumed.bootstrap).toBe("claude");
		const resumeCommand = runner.actions.filter(isRespawnAction).at(-1)?.command ?? "";
		expect(resumeCommand).toContain("--resume");
		expect(resumeCommand).toContain(first.record.nativeSessionId as string);
	});

	it("requires parking before fresh preparation and preserves a target without resume identity", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.prepareNativeSession("task-1");
		await service.activateNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		await expect(service.prepareNativeSession("task-1")).rejects.toThrow("already running");
		await service.parkNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		await releaseFakeExecutionPane(service, runner, first.record);
		const second = await service.prepareNativeSession("task-1");
		const afterPrepare = await service.list("task-1");
		expect(afterPrepare.sessions.find((session) => session.id === first.record.id)?.status).toBe("parked");
		expect(afterPrepare.activeSessionId).toBe(second.record.id);
		await releaseFakeExecutionPane(service, runner, second.record);
		await service.finishNativeSession("TASK-1", second.record.id, sessionOrigin(second));
		await (service as unknown as { store: SessionStore }).store.mutateSession(
			"TASK-1",
			second.record.id,
			async (record) => {
				delete record.nativeSessionId;
			},
		);
		const before = await service.list("task-1");
		await expect(service.prepareNativeSession("task-1", second.record.id)).rejects.toThrow("resume");
		expect(await service.list("task-1")).toEqual(before);
		const killsBeforeReconcile = runner.actions.filter((action) => action.type === "kill").length;
		await service.reconcileTaskSessions("task-1");
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBeforeReconcile);
		expect((await service.list("task-1")).sessions.find((session) => session.id === second.record.id)?.status).toBe(
			"stopped",
		);
	}, 30000);

	async function nativeIdentityFixture() {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const attachment = await service.prepareNativeSession("task-1", undefined, "build");
		const raw = runner.paneMetadata.get(attachment.paneId)?.["@agentic_workspace_launch_resources"];
		if (!raw) throw new Error("Fixture pane has no launch-resource inventory");
		const origin = {
			record: attachment.record,
			modeId: "build" as const,
			paneId: attachment.paneId,
			resources: JSON.parse(raw) as PreparedLaunchResources,
		};
		const promptAgent = harnessRegistry.forPreset("pi");
		if (!promptAgent) throw new Error("Expected the fake Pi agent to be registered");
		const provider = Object.create(promptAgent) as HarnessInterface;
		provider.reconcileIdentity = async ({ preparedIdentity }) => {
			if (!preparedIdentity) throw new Error("Fake provider did not receive a pinned identity");
			return { id: preparedIdentity.id, basis: "provider-confirmed" };
		};
		return {
			root,
			runner,
			service,
			store: new SessionStore(root, runner),
			attachment,
			origin,
			captureIdentity: async (id: string) => {
				const identity = await provider.reconcileIdentity({
					intent: { kind: "new" },
					preset: askPreset,
					cwd: attachment.record.cwd,
					env: {},
					launchDirectory: origin.resources.skill.path,
					preparedIdentity: { id, basis: "client-established" },
					signal: new AbortController().signal,
				});
				await service.publishNativeIdentity(origin, identity);
			},
		};
	}

	/** Drop the record's established identity and pane tag so a deferred report is the first publish. */
	async function deferIdentity(f: Awaited<ReturnType<typeof nativeIdentityFixture>>): Promise<string> {
		const sessionId = f.attachment.record.id;
		await f.store.mutateSession("TASK-1", sessionId, async (session) => {
			delete session.nativeSessionId;
		});
		const metadata = f.runner.paneMetadata.get(f.origin.paneId) ?? {};
		delete metadata["@agentic_workspace_native_session_id"];
		f.runner.paneMetadata.set(f.origin.paneId, metadata);
		return sessionId;
	}

	it("accepts an identical published identity and rejects a conflicting one", async () => {
		const f = await nativeIdentityFixture();
		const current = f.attachment.record.nativeSessionId;
		if (!current) throw new Error("Expected an established identity");
		await f.captureIdentity(current);
		expect((await f.service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBe(current);
		await expect(f.captureIdentity("ses_conflicting")).rejects.toThrow("already has native identity");
		expect((await f.service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBe(current);
	});

	it("publishes a late deferred identity into the exact record and pane", async () => {
		const f = await nativeIdentityFixture();
		await deferIdentity(f);
		await f.captureIdentity("ses_late");
		expect((await f.service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBe("ses_late");
		expect(f.runner.paneMetadata.get(f.origin.paneId)?.["@agentic_workspace_native_session_id"]).toBe("ses_late");
	});

	it("never resurrects a deleted record when a deferred identity arrives", async () => {
		const f = await nativeIdentityFixture();
		await f.store.remove("TASK-1", f.attachment.record.id);
		await f.captureIdentity("ses_after_delete");
		expect((await f.service.list("task-1", "build")).sessions).toEqual([]);
	});

	it("refuses to publish into a replacement launch's pane", async () => {
		const f = await nativeIdentityFixture();
		await deferIdentity(f);
		const baseline = f.runner.paneMetadata.get(f.origin.paneId) ?? {};
		f.runner.paneMetadata.set(f.origin.paneId, {
			...baseline,
			"@agentic_workspace_launch_resources": JSON.stringify({
				...f.origin.resources,
				skill: { ...f.origin.resources.skill, marker: "f".repeat(64) },
			}),
		});
		await f.captureIdentity("ses_stale");
		expect((await f.service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBeUndefined();
	});

	it("persists a deferred identity without tagging when the owned pane has exited", async () => {
		const f = await nativeIdentityFixture();
		await deferIdentity(f);
		f.runner.paneInventory.delete(f.origin.paneId);
		f.runner.paneHandles.delete(f.origin.paneId);
		f.runner.paneMetadata.delete(f.origin.paneId);
		await f.captureIdentity("ses_exited");
		expect((await f.service.list("task-1", "build")).sessions[0]?.nativeSessionId).toBe("ses_exited");
	});

	it("rejects implicit running-session replacement and activates a new session after explicit parking", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.prepareNativeSession("task-1");
		await service.activateNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		await expect(service.prepareNativeSession("task-1")).rejects.toThrow("already running");
		await service.parkNativeSession("TASK-1", first.record.id, sessionOrigin(first));
		await releaseFakeExecutionPane(service, runner, first.record);
		const replacement = await service.prepareNativeSession("task-1");
		const afterPrepare = await service.list("task-1");
		expect(afterPrepare.sessions.find((session) => session.id === first.record.id)?.status).toBe("parked");
		expect(afterPrepare.activeSessionId).toBe(replacement.record.id);
		await service.activateNativeSession("TASK-1", replacement.record.id, sessionOrigin(replacement));
		expect((await service.list("task-1")).activeSessionId).toBe(replacement.record.id);
	}, 30000);

	it("canonicalizes task identity and persists sessions without starting task work", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("TASK-1");
		expect(session.taskId).toBe("TASK-1");
		expect((await service.list("task-1")).activeSessionId).toBe(session.id);
		expect((await core.loadTaskById("task-1"))?.status).toBe("To Do");
		await expect(service.start("task-1")).rejects.toThrow("already has an active");
		await service.stop("task-1");
		expect(runner.actions.filter((action) => action.type === "kill").at(-1)).toEqual({ type: "kill", pane: "%1" });
		await Bun.write(session.outputPath, "retired output\n");
		expect(await service.output("task-1", session.id)).toBe("retired output\n");
		await expect(service.attach("task-1", session.id)).rejects.toThrow("no longer exists");
		const second = await service.start("TASK-1");
		expect(second.status).toBe("running");
		expect((await service.list("task-1")).sessions).toHaveLength(2);
	});

	it("auto-stops the least-used live session when the running cap is reached", async () => {
		const { core, runner } = await project();
		await core.createTaskFromInput({ title: "Second", status: "To Do" });
		await core.createTaskFromInput({ title: "Third", status: "To Do" });
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1", { maxRunningSessions: 99 });
		await service.start("task-2", { maxRunningSessions: 99 });
		await service.touchUsage("task-1", first.id);
		const third = await service.start("task-3", { maxRunningSessions: 2 });

		expect((await service.list("task-1")).sessions[0]?.status).toBe("running");
		expect((await service.list("task-2")).sessions[0]?.status).toBe("stopped");
		expect((await service.list("task-3")).sessions[0]?.id).toBe(third.id);
		expect((await service.list("task-3")).sessions[0]?.status).toBe("running");
	});

	it("records launch failures durably and lets a later start retry", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: ["agent", "{prompt}", "{skill}"], env: {}, prepare: "false", bootstrap: "pi" },
			},
		});
		runner.failPrepare = true;
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await expect(service.start("task-1")).rejects.toThrow("preparation failed");
		expect((await service.list("task-1")).sessions[0]?.status).toBe("failed");
		runner.failPrepare = false;
		await service.start("task-1");
		expect((await service.list("task-1")).activeSessionId).toBeDefined();
	});

	it("starts at project root when worktrees are not configured", async () => {
		const { root, core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: ["agent", "{prompt}", "{skill}"], env: {}, prepare: "", bootstrap: "pi" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		expect(session.cwd).toBe(root);
		expect(runner.processCommands.some((command) => command[0] === "git" && command[1] === "worktree")).toBeFalse();
	});

	it("replacing via start({ replace: true }) preserves unflagged runtime, task context and output", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1");
		await core.updateTaskFromInput("task-1", { description: "Verified step one. Next: step two." });
		await Bun.write(first.outputPath, "Previous session output");
		let replacement: AgentSession;
		try {
			replacement = await service.start("task-1", { replace: true });
		} catch (error) {
			throw new Error(
				`${error instanceof Error ? error.message : String(error)}; fake exact-pane query=${JSON.stringify(runner.lastPaneLookup)}; panes=${JSON.stringify(
					[...runner.paneInventory].map((id) => ({
						id,
						name: runner.paneSessions.get(id),
						tags: runner.paneMetadata.get(id),
					})),
				)}`,
			);
		}
		const state = await service.list("task-1");
		expect(state.sessions.find((session) => session.id === first.id)?.status).toBe("running");
		expect(state.activeSessionId).toBe(replacement.id);
		expect(await service.output("task-1", first.id)).toBe("Previous session output");
		expect((await core.loadTaskById("task-1"))?.description).toBe("Verified step one. Next: step two.");
		expect(await Bun.file(replacement.bootstrapPath).text()).toContain("TASK-1");
	});

	it("does not attribute a live pane with missing UUID metadata to this session", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const taskBefore = await core.loadTaskById("task-1");
		runner.paneMetadata.delete("%1");
		await expect(service.reconcileTaskSessions("task-1")).rejects.toThrow("ownership does not match");
		const recovered = await service.list("task-1");
		expect(recovered.sessions[0]?.status).toBe("running");
		expect(recovered.activeSessionId).toBe(session.id);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(1);
		expect(runner.actions.some((action) => action.type === "kill")).toBeFalse();
		expect(recovered.sessions[0]?.id).toBe(session.id);
		expect(await core.loadTaskById("task-1")).toEqual(taskBefore);
	});

	it("settles a dead active session without resuming it during reconciliation", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: {
				claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		runner.missingPanes.add("%1");

		await service.reconcileTaskSessions("task-1");

		const recovered = await service.list("task-1");
		expect(recovered.sessions[0]?.status).toBe("stopped");
		expect(recovered.activeSessionId).toBe(session.id);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(1);
	});

	it("a failed replacement leaves the previous session running and records the new one failed", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: ["agent", "{prompt}", "{skill}"], env: {}, prepare: "false", bootstrap: "pi" },
			},
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = await service.start("task-1");
		runner.failPrepare = true;
		await expect(service.start("task-1", { replace: true })).rejects.toThrow("Agent preparation failed");
		const failed = await service.list("task-1");
		expect(failed.sessions.find((session) => session.id === first.id)?.status).toBe("running");
		const replacement = failed.sessions.find((session) => session.id !== first.id);
		expect(replacement?.status).toBe("failed");
		expect(failed.activeSessionId).toBe(first.id);
	});

	it("serializes concurrent session starts behind task admission", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: {
				test: { command: ["agent", "{prompt}", "{skill}"], env: {}, prepare: "false", bootstrap: "pi" },
			},
		});
		runner.failPrepare = true;
		let releasePrepare: (() => void) | undefined;
		runner.prepareGate = new Promise((resolve) => {
			releasePrepare = resolve;
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const first = service.start("task-1");
		await waitUntil(async () => (await service.list("task-1")).sessions.length === 1, "reserved starting session");
		const second = service.start("task-1");
		let secondSettled = false;
		const secondResultPromise = Promise.resolve(second)
			.then(
				(value) => ({ status: "fulfilled" as const, value }),
				(reason) => ({ status: "rejected" as const, reason }),
			)
			.finally(() => {
				secondSettled = true;
			});
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(secondSettled).toBe(false);
		runner.failPrepare = false;
		releasePrepare?.();
		const firstResult = await Promise.resolve(first).then(
			(value) => ({ status: "fulfilled" as const, value }),
			(reason) => ({ status: "rejected" as const, reason }),
		);
		const secondResult = await secondResultPromise;
		const results = [firstResult, secondResult];
		expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled"]);
		const sessions = (await service.list("task-1")).sessions;
		expect(sessions.map((session) => session.status).sort()).toEqual(["failed", "running"]);
	}, 30000);

	it("registers a pending request instead of launching when a workspace owns the invocation", async () => {
		const { core, runner } = await project();
		const context: WorkspaceContext = {
			v: 2,
			paneId: "%workspace",
			rootDir: coreFileSystem(core).rootDir,
		};
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => context,
		});
		const session = await service.start("task-1");
		expect(session.nativeWorkspace).toBe(true);
		expect(session.nativeWorkspace).toBe(true);
		expect(isAgenticWorkspaceSessionName(session.tmuxName)).toBeTrue();
		expect(session.tmuxName).toBe(nativeSessionName("TASK-1", session.id));
		expect(session.status).toBe("starting");
		expect(session.nativeSessionId).toBeUndefined();
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
		expect((await service.list("task-1")).sessions[0]?.status).toBe("starting");
		await expect(service.start("task-1")).rejects.toThrow("already has an active");
	});

	it("keeps an unowned CLI launch active until explicitly stopped", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => undefined,
		});
		const session = await service.start("task-1");
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(1);
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(0);
		expect(session.status).toBe("running");
		expect((await service.list("task-1")).activeSessionId).toBe(session.id);
		await service.stop("task-1", session.id);
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(1);
		const state = await service.list("task-1");
		expect(state.sessions[0]?.status).toBe("stopped");
		expect(state.activeSessionId).toBe(session.id);
	});

	it("cancels a pending request instead of erroring when it is stopped", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => undefined,
		});
		const pending = await service.registerPendingSession(
			"task-1",
			{},
			{
				v: 2,
				paneId: "%workspace",
				rootDir: coreFileSystem(core).rootDir,
			},
		);
		await service.stop("task-1", pending.id);
		const state = await service.list("task-1");
		expect(state.sessions[0]?.status).toBe("stopped");
		expect(state.sessions[0]?.ownerPid).toBeUndefined();
		expect(state.sessions[0]?.endedAt).toBeDefined();
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
	});

	it("routes an owned pending record through the native launch path into adoption", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => ({ v: 2, paneId: "%workspace", rootDir: coreFileSystem(core).rootDir }),
		});
		const pending = await service.registerPendingSession(
			"task-1",
			{},
			{
				v: 2,
				paneId: "%workspace",
				rootDir: coreFileSystem(core).rootDir,
			},
		);
		const adopted = await service.prepareNativeSession("task-1", pending.id);
		expect(adopted.record.id).toBe(pending.id);
		expect(adopted.record.nativeWorkspace).toBe(true);
		expect(adopted.record.status).toBe("running");
		expect(adopted.bootstrap).toBe("pi");
		expect((await service.list("task-1")).sessions).toHaveLength(1);
		const launch = runner.actions.filter(isRespawnAction).at(-1)?.command ?? "";
		expect(launch).not.toContain("--resume");
	});

	it("adopts a pending request owned by this workspace without resuming it", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => ({ v: 2, paneId: "%workspace", rootDir: coreFileSystem(core).rootDir }),
		});
		const pending = await service.registerPendingSession(
			"task-1",
			{},
			{
				v: 2,
				paneId: "%workspace",
				rootDir: coreFileSystem(core).rootDir,
			},
		);
		const adopted = await service.adoptPendingSession("task-1", pending.id);
		expect(adopted.record.id).toBe(pending.id);
		expect(adopted.record.nativeWorkspace).toBe(true);
		expect(adopted.bootstrap).toBe("pi");
		expect((await service.list("task-1")).sessions).toHaveLength(1);
		const launch = runner.actions.filter(isRespawnAction).at(-1)?.command ?? "";
		expect(launch).not.toContain("--resume");
	});

	it("adopts a verified queued request without inherited adopter context", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => undefined,
		});
		const pending = await service.registerPendingSession(
			"task-1",
			{},
			{
				v: 2,
				paneId: "%foreign-workspace",
				rootDir: coreFileSystem(core).rootDir,
			},
		);
		await new SessionStore(coreFileSystem(core).rootDir, new BunRunner()).mutateSession(
			"TASK-1",
			pending.id,
			async (record) => {
				record.ownerPid = 2 ** 30;
			},
		);
		const adopted = await service.adoptPendingSession("task-1", pending.id);
		expect(adopted.record.id).toBe(pending.id);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(1);
	});

	it("refuses adoption when the queued marker is missing", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await service.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		await rm(marker);
		const before = await new SessionStore(root, new BunRunner()).read("TASK-1");
		await expect(service.adoptPendingSession("task-1", pending.id)).rejects.toThrow(
			"verified queued workspace request",
		);
		expect(await new SessionStore(root, new BunRunner()).read("TASK-1")).toEqual(before);
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
	});

	it("refuses adoption when the marked record is no longer queued", async () => {
		const { root, core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: { claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" } },
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await service.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		expect(pending.nativeSessionId).toBeUndefined();
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		await writeFile(marker, JSON.stringify({ taskId: "TASK-1", sessionId: pending.id, pid: process.pid }));
		await new SessionStore(root, new BunRunner()).mutateSession("TASK-1", pending.id, async (record) => {
			record.status = "stopped";
		});
		const nonqueued = await new SessionStore(root, new BunRunner()).read("TASK-1");
		await expect(service.adoptPendingSession("task-1", pending.id)).rejects.toThrow(
			"verified queued workspace request",
		);
		expect(await new SessionStore(root, new BunRunner()).read("TASK-1")).toEqual(nonqueued);
		expect(existsSync(marker)).toBeTrue();
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
	});

	it("refuses an uncertain queued runtime without changing the request", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await service.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		const store = new SessionStore(root, new BunRunner());
		const before = await store.read("TASK-1");
		runner.probeError = new Error("transient tmux failure");
		await expect(service.adoptPendingSession("task-1", pending.id)).rejects.toThrow("transient tmux failure");
		expect(await store.read("TASK-1")).toEqual(before);
		expect(existsSync(marker)).toBeTrue();
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
		expect(runner.actions.filter((action) => action.type === "kill")).toEqual([]);
	});

	it("rejects a queued provider mismatch before mutating runtime or marker", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await service.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		const store = new SessionStore(root, new BunRunner());
		await store.mutateSession("TASK-1", pending.id, async (record) => {
			record.nativeProvider = "claude";
		});
		const before = await store.read("TASK-1");
		await expect(service.adoptPendingSession("task-1", pending.id)).rejects.toThrow(
			"belongs to provider claude, not pi",
		);
		expect(await store.read("TASK-1")).toEqual(before);
		expect(existsSync(marker)).toBeTrue();
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
		expect(runner.actions.filter((action) => action.type === "kill")).toEqual([]);
	});

	it("refuses an exact dead queued runtime without resuming or changing its record", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await service.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		const deadPane = addNativeHost(runner, root, pending, process.pid);
		runner.missingPanes.add(deadPane);
		const store = new SessionStore(root, new BunRunner());
		const before = await store.read("TASK-1");
		await expect(service.adoptPendingSession("task-1", pending.id)).rejects.toThrow("existing non-live runtime");
		expect(await store.read("TASK-1")).toEqual(before);
		expect(existsSync(marker)).toBeTrue();
		expect(runner.actions.filter(isRespawnAction)).toEqual([]);
		expect(runner.actions.filter((action) => action.type === "kill")).toEqual([]);
	});

	it("admits two frontends for one missing queued runtime with a single fresh launch", async () => {
		const { root, core, runner } = await project();
		const first = new AgentSessionService(core, { runner, tmuxServer: runner });
		const second = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await first.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		const left = await first.adoptPendingSession("task-1", pending.id);
		const right = await second.prepareNativeSession("task-1", pending.id);
		expect(left.record.id).toBe(pending.id);
		expect(right.record.id).toBe(pending.id);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(1);
		expect(existsSync(marker)).toBeFalse();
	});

	it("keeps the request marker through failed queued launch preparation", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const pending = await service.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		let releaseLaunch: (() => void) | undefined;
		runner.launchGate = new Promise((resolve) => {
			releaseLaunch = resolve;
		});
		const launchStarted = Promise.withResolvers<void>();
		runner.launchStarted = launchStarted.resolve;
		runner.failLaunch = true;
		const adoption = service.adoptPendingSession("task-1", pending.id);
		try {
			await launchStarted.promise;
			expect(existsSync(marker)).toBeTrue();
			releaseLaunch?.();
			await expect(adoption).rejects.toThrow("launch failed");
			expect(existsSync(marker)).toBeTrue();
		} finally {
			releaseLaunch?.();
			await Promise.resolve(adoption).catch(() => undefined);
		}
	});

	it("preserves a queued request when its requester process has died", async () => {
		const { root, core, runner } = await project();
		const deadPid = 2 ** 30;
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => ({
				v: 2,
				paneId: "%dead-workspace",
				rootDir: coreFileSystem(core).rootDir,
			}),
		});
		const pending = await service.registerPendingSession(
			"task-1",
			{},
			{
				v: 2,
				paneId: "%dead-workspace",
				rootDir: root,
			},
		);
		const store = new SessionStore(root, new BunRunner());
		const modeId = await store.mutateSession("TASK-1", pending.id, async (record, history, ownerModeId) => {
			record.nativeWorkspace = true;
			record.ownerPid = deadPid;
			// Make this the active session, so a resume path would be reachable if the code took one.
			history.activeSessionId = pending.id;
			return ownerModeId;
		});
		const persisted = await store.readMode("TASK-1", modeId);
		expect(persisted.sessions.find((entry) => entry.id === pending.id)).toMatchObject({
			nativeWorkspace: true,
			ownerPid: deadPid,
		});
		await writeFile(
			join(workspaceRequestDir(root), `${pending.id}.json`),
			JSON.stringify({
				taskId: "TASK-1",
				sessionId: pending.id,
				pid: deadPid,
			}),
		);
		await service.reconcileTaskSessions("task-1");
		const state = await service.listMode("task-1", modeId);
		expect(state.sessions[0]).toMatchObject({
			id: pending.id,
			taskId: "TASK-1",
			status: "starting",
			ownerPid: deadPid,
			nativeWorkspace: true,
		});
		expect(state.sessions[0]?.endedAt).toBeUndefined();
		expect(state.activeSessionId).toBe(pending.id);
		expect(state.sessions[0]?.nativeSessionId).toBe(pending.nativeSessionId);
		expect(runner.actions.filter(isRespawnAction)).toHaveLength(0);
	});

	it("writes a request marker on registration and retires it on adoption", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => ({ v: 2, paneId: "%workspace", rootDir: root }),
		});
		const pending = await service.registerPendingSession(
			"task-1",
			{},
			{
				v: 2,
				paneId: "%workspace",
				rootDir: root,
			},
		);
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		expect(await Bun.file(marker).json()).toEqual({ taskId: "TASK-1", sessionId: pending.id, pid: process.pid });

		await service.adoptPendingSession("task-1", pending.id);
		expect(existsSync(marker)).toBeFalse();
	});

	it("retires the request marker when a pending request is cancelled", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => undefined,
		});
		const pending = await service.registerPendingSession("task-1", {}, { v: 2, paneId: "%workspace", rootDir: root });
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		expect(existsSync(marker)).toBeTrue();

		await service.stop("task-1", pending.id);

		expect(existsSync(marker)).toBeFalse();
	});

	it("drops the durable record when its request marker cannot be written", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => undefined,
		});
		// A file where the marker directory belongs makes the marker write fail.
		await mkdir(join(root, ".agentic-workspace"), { recursive: true });
		await Bun.write(workspaceRequestDir(root), "not a directory");

		await expect(
			service.registerPendingSession(
				"task-1",
				{},
				{
					v: 2,
					paneId: "%workspace",
					rootDir: root,
				},
			),
		).rejects.toThrow();
		expect((await service.list("task-1")).sessions).toEqual([]);
	});

	it("deletes a stopped active session with its files and clears the active pointer", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		await Bun.write(session.outputPath, "session output\n");
		await service.stop("task-1", session.id);
		expect(existsSync(session.outputPath)).toBeTrue();
		expect(existsSync(session.bootstrapPath)).toBeTrue();
		// `stop` releases the active pointer; re-point it at the stopped record so deletion must clear it.
		const store = new SessionStore(root, new BunRunner());
		await store.mutateSession("TASK-1", session.id, async (_record, history) => {
			history.activeSessionId = session.id;
		});

		const killsBefore = runner.actions.filter((action) => action.type === "kill").length;
		await service.delete("task-1", session.id);

		const state = await service.list("task-1");
		expect(state.sessions).toEqual([]);
		expect(state.activeSessionId).toBeUndefined();
		expect(existsSync(session.outputPath)).toBeFalse();
		expect(existsSync(session.bootstrapPath)).toBeFalse();
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBefore);
	});

	it("refuses to delete a session when a sidecar is a symlink", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = nativeCleanupSession(root, { id: "symlink-sidecar", status: "stopped", ownerPid: undefined });
		await seedAskSessions(root, [session]);
		const target = join(root, "outside-session-log");
		await writeFile(target, "outside data");
		await writeFile(session.outputPath, "session output");
		await rm(session.outputPath);
		await symlink(target, session.outputPath);

		await expect(service.delete("task-1", session.id)).rejects.toThrow(/not a regular owned file/);
		expect((await service.list("task-1")).sessions.map(({ id }) => id)).toContain(session.id);
		expect(await Bun.file(target).text()).toBe("outside data");
	});

	it("refuses to delete a running session without force and kills it when forced", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");

		await expect(service.delete("task-1", session.id)).rejects.toThrow(/stop it first|force/i);
		const unforced = await service.list("task-1");
		expect(unforced.sessions).toHaveLength(1);
		expect(unforced.sessions[0]?.status).toBe("running");
		expect(existsSync(session.bootstrapPath)).toBeTrue();
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(0);

		await service.delete("task-1", session.id, { force: true });

		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(1);
		expect((await service.list("task-1")).sessions).toEqual([]);
		expect(existsSync(session.bootstrapPath)).toBeFalse();
	});

	it("deletes a native pending request and retires its marker", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, {
			runner,
			tmuxServer: runner,
			workspaceContext: async () => undefined,
		});
		const pending = await service.registerPendingSession(
			"task-1",
			{},
			{
				v: 2,
				paneId: "%workspace",
				rootDir: root,
			},
		);
		const marker = join(workspaceRequestDir(root), `${pending.id}.json`);
		expect(existsSync(marker)).toBeTrue();

		await service.delete("task-1", pending.id);

		expect(existsSync(marker)).toBeFalse();
		expect((await service.list("task-1")).sessions).toEqual([]);
	});

	it("refuses to delete a running native workspace session before its workspace stops it", async () => {
		const { core, runner } = await project();
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "claude",
			presets: { claude: { command: ["claude"], env: {}, prepare: "", bootstrap: "claude" } },
		});
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const prepared = await service.prepareNativeSession("task-1");
		try {
			await service.activateNativeSession("TASK-1", prepared.record.id, sessionOrigin(prepared));
			await expect(service.delete("task-1", prepared.record.id)).rejects.toThrow("running in its workspace");
			await expect(service.delete("task-1", prepared.record.id, { force: true })).rejects.toThrow(
				"running in its workspace",
			);
			expect((await service.list("task-1")).sessions).toHaveLength(1);
		} finally {
		}
	});

	it("removes an unknown session id as a no-op", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const store = new SessionStore(root, new BunRunner());

		await expect(store.remove("TASK-1", "does-not-exist")).resolves.toBeUndefined();

		expect((await service.list("task-1")).sessions.map((entry) => entry.id)).toEqual([session.id]);
	});

	it("asks the previous non-active session and returns its trimmed answer", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await seedAskSessions(
			root,
			[
				askSession(root, {
					id: "older",
					status: "stopped",
					nativeSessionId: "native-older",
					lastUsedAt: "2024-01-01T00:00:00.000Z",
				}),
				askSession(root, {
					id: "previous",
					status: "stopped",
					nativeSessionId: "native-prev",
					lastUsedAt: "2024-02-01T00:00:00.000Z",
				}),
				askSession(root, {
					id: "active",
					status: "running",
					nativeSessionId: "native-active",
					lastUsedAt: "2024-03-01T00:00:00.000Z",
				}),
			],
			"active",
		);
		runner.shellResponse = { exitCode: 0, stdout: "  the answer  \n", stderr: "" };

		const { answer, timedOut } = await service.ask("task-1", "what changed?");

		expect(answer).toBe("the answer");
		expect(timedOut).toBe(false);
		const command = shellRun(runner);
		expect(command?.slice(0, 2)).toEqual(["/bin/sh", "-lc"]);
		expect(command?.[2]).not.toContain("unset AGENTIC_WORKSPACE_CWD AGENTIC_WORKSPACE_TASK_ID");
		expect(command?.[2]).toContain("--resume");
		expect(command?.[2]).toContain("native-prev");
		expect(command?.[2]).toContain("native-prev");
		expect(command?.[2]).toContain("what changed?");
		const options = runner.processOptions[runner.processCommands.indexOf(command as string[])];
		expect(typeof options?.timeoutMs).toBe("number");
	});

	it("asks the named session when --session is given", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await seedAskSessions(root, [
			askSession(root, {
				id: "older",
				status: "stopped",
				nativeSessionId: "native-older",
				lastUsedAt: "2024-01-01T00:00:00.000Z",
			}),
			askSession(root, {
				id: "previous",
				status: "stopped",
				nativeSessionId: "native-prev",
				lastUsedAt: "2024-02-01T00:00:00.000Z",
			}),
		]);
		runner.shellResponse = { exitCode: 0, stdout: "named answer\n", stderr: "" };

		const { answer, timedOut } = await service.ask("task-1", "hi", { sessionId: "older" });

		expect(answer).toBe("named answer");
		expect(timedOut).toBe(false);
		expect(shellRun(runner)?.slice(0, 2)).toEqual(["/bin/sh", "-lc"]);
		expect(shellRun(runner)?.[2]).not.toContain("unset AGENTIC_WORKSPACE_CWD AGENTIC_WORKSPACE_TASK_ID");
		expect(shellRun(runner)?.[2]).toContain("--resume");
		expect(shellRun(runner)?.[2]).toContain("native-older");
		expect(shellRun(runner)?.[2]).toContain("native-older");
		expect(shellRun(runner)?.[2]).toContain("hi");
	});

	it("returns the captured partial answer when the ask times out", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await seedAskSessions(root, [
			askSession(root, {
				id: "previous",
				status: "stopped",
				nativeSessionId: "native-prev",
				lastUsedAt: "2024-02-01T00:00:00.000Z",
			}),
			askSession(root, { id: "active", status: "stopped", lastUsedAt: "2024-03-01T00:00:00.000Z" }),
		]);
		runner.shellResponse = { exitCode: 124, stdout: "partial answer\n", stderr: "", timedOut: true };

		const result = await service.ask("task-1", "what changed?");

		expect(result).toEqual({ answer: "partial answer", timedOut: true });
	});

	it("throws when the ask times out without any captured output", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await seedAskSessions(root, [
			askSession(root, {
				id: "previous",
				status: "stopped",
				nativeSessionId: "native-prev",
				lastUsedAt: "2024-02-01T00:00:00.000Z",
			}),
			askSession(root, { id: "active", status: "stopped", lastUsedAt: "2024-03-01T00:00:00.000Z" }),
		]);
		runner.shellResponse = { exitCode: 124, stdout: "", stderr: "", timedOut: true };

		await expect(service.ask("task-1", "what changed?")).rejects.toThrow("did not answer within");
	});

	it("refuses to ask a running session", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await seedAskSessions(
			root,
			[
				askSession(root, {
					id: "running",
					status: "running",
					nativeSessionId: "native-run",
				}),
			],
			"running",
		);

		await expect(service.ask("task-1", "q", { sessionId: "running" })).rejects.toThrow("is running");
		expect(runner.processCommands).toEqual([]);
	});

	it("throws when there is no previous session to ask", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });

		await expect(service.ask("task-1", "q")).rejects.toThrow("no previous session");

		await seedAskSessions(
			root,
			[
				askSession(root, {
					id: "active",
					status: "running",
					nativeSessionId: "native-active",
				}),
			],
			"active",
		);
		await expect(service.ask("task-1", "q")).rejects.toThrow("no previous session");
	});

	it("throws when the target session has no native session id", async () => {
		const { root, core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		await seedAskSessions(root, [
			askSession(root, { id: "previous", status: "stopped" }),
			askSession(root, { id: "active", status: "stopped", lastUsedAt: "2026-01-01T00:00:00.000Z" }),
		]);

		await expect(service.ask("task-1", "q")).rejects.toThrow("no native session id");
	});

	itRealTmuxLimited("replaces selection without stopping an unflagged real tmux predecessor", async () => {
		const { root, core } = await project();
		const agent = join(root, "fake-agent.sh");
		await Bun.write(agent, ["#!/bin/sh", "printf 'Saved session output\\n'", "exec sleep 300"].join("\n"));
		await chmod(agent, 0o755);
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "fake",
			presets: {
				fake: { command: [agent, "{prompt}", "{skill}"], env: {}, prepare: "", bootstrap: "pi" },
			},
		});
		const socket = uniqueTmuxSocket("agent-sessions");
		const service = new AgentSessionService(core, { runner: new BunRunner(), tmuxServer: isolatedTmuxServer(socket) });
		const first = await service.start("task-1");
		try {
			const replacement = await service.start("task-1", { replace: true });
			const state = await service.list("task-1");
			expect(state.sessions.find((session) => session.id === first.id)?.status).toBe("running");
			expect(state.activeSessionId).not.toBe(first.id);
			expect(state.activeSessionId).toBe(replacement.id);
			expect(await service.output("task-1", first.id)).toContain("Saved session output");
		} finally {
			await service.stop("task-1").catch(() => undefined);
			await killTmuxServer(socket);
		}
	});
});

/**
 * These cases mutate state that is shared by the whole test process — `process.env.TMUX` and the
 * `SessionProcess` prototype — so they run apart from the concurrent group.
 */
describe("AgentSessionService shared process state", () => {
	it("attaches outside tmux, switches a client on the backend server, and nests a foreign client", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const previousTmux = process.env.TMUX;
		try {
			delete process.env.TMUX;
			await service.attach("task-1", session.id);
			expect(runner.actions.at(-1)).toEqual({ type: "cmd", command: "attach-session", args: ["-t", "%1"] });
			process.env.TMUX = `/private/tmp/tmux-1/default,${runner.serverPid},0`;
			await service.attach("task-1", session.id);
			expect(runner.actions.at(-1)).toEqual({ type: "cmd", command: "switch-client", args: ["-t", "%1"] });
			// The backend is always the default server, so a client attached to another server cannot
			// be switched onto it; it nests instead.
			process.env.TMUX = `/private/tmp/tmux-1/agentic-workspace-outer,${runner.serverPid + 1},0`;
			await service.attach("task-1", session.id);
			expect(runner.actions.at(-1)).toEqual({ type: "cmd", command: "attach-session", args: ["-t", "%1"] });
		} finally {
			if (previousTmux === undefined) delete process.env.TMUX;
			else process.env.TMUX = previousTmux;
		}
	});

	it("treats an unexpected pane_dead value as inconclusive instead of dead", async () => {
		const { core, runner } = await project();
		const service = new AgentSessionService(core, { runner, tmuxServer: runner });
		const session = await service.start("task-1");
		const before = await service.list("task-1");
		const killsBefore = runner.actions.filter((action) => action.type === "kill").length;
		runner.probeDeadValue = "2";
		await expect(service.liveSession("task-1", session.id, { passive: true })).rejects.toThrow(
			"Tmux instance ownership does not match session",
		);
		expect(runner.actions.filter((action) => action.type === "kill")).toHaveLength(killsBefore);
		expect(await service.list("task-1")).toEqual(before);
	});
});

/**
 * Worktree-per-task launches mutate `AGENTIC_WORKSPACE_WORKTREE_HOME`, so they run apart from the
 * concurrent group rather than racing its default-settings cases.
 */
describe("AgentSessionService worktree sessions", () => {
	it("runs a session in the task worktree when worktree-per-task is on and the worktree exists", async () => {
		const root = await realpath(await mkdtemp(join(tmpdir(), "agent-sessions-worktree-")));
		projectDirs.push(root);
		const previousHome = process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
		const worktreeHome = await realpath(await mkdtemp(join(tmpdir(), "agent-sessions-worktree-home-")));
		process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = worktreeHome;
		try {
			initGitRepo(root, "main");
			const core = new Core(root);
			await initializeTestProject(core, "Agent sessions worktree", true);
			const { task } = await core.createTaskFromInput({ title: "Session task", status: "To Do" });
			await upsertAgentConfiguration(core, "project", {
				selectedPreset: "test",
				presets: {
					test: { command: ["agent", "{prompt}", "{skill}"], env: {}, prepare: "", bootstrap: "pi" },
				},
				sessions: { worktreePerTask: true, yoloMode: false },
			});
			const worktreePath = await ensureTaskWorktree(root, task);
			if (!worktreePath) throw new Error("Expected the task worktree to be created.");
			expect(worktreePath).toBe(taskWorktreePath(root, task));
			expect(await taskWorktreeExists(root, task)).toBe(true);

			const runner = new FakeTmux();
			const service = new AgentSessionService(core, { runner, tmuxServer: runner });
			const session = await service.start("task-1");

			expect(session.cwd).toBe(worktreePath);
		} finally {
			if (previousHome === undefined) delete process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
			else process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = previousHome;
			await rm(worktreeHome, { recursive: true, force: true });
		}
	});
});
