import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getDefaultModeCatalog,
	initializeAgentConfiguration,
	upsertAgentConfiguration,
} from "../agent-workspace/config.ts";
import { SessionStore } from "../agent-workspace/session-store.ts";
import { AgentSessionService, type ProcessRunner, type TmuxServer } from "../agent-workspace/sessions.ts";
import type { AgentSession } from "../agent-workspace/types.ts";
import type { WorkspaceContext } from "../agent-workspace/workspace-context.ts";
import { Core } from "../core/backlog.ts";
import { initializeTestProject } from "../test/test-utils.ts";

type Pane = {
	id: string;
	window: { setOption(name: string, value: string): Promise<void> };
	setOption(name: string, value: string): Promise<void>;
	setTitle(title: string): Promise<void>;
	pipeTo(command?: string): Promise<void>;
	respawn(command?: string): Promise<void>;
	displayMessage(message: string): Promise<readonly string[]>;
	kill(): Promise<void>;
};

class FakeHarness implements ProcessRunner, TmuxServer {
	readonly commands: string[][] = [];
	readonly sessions = new Map<string, string>();
	readonly metadata = new Map<string, Record<string, string>>();
	readonly dead = new Set<string>();
	private nextPane = 0;

	async run(args: string[]) {
		this.commands.push(args);
		return { exitCode: 0, stdout: "answer from selected native session", stderr: "" };
	}

	async newSession(options: { name?: string } = {}) {
		const id = `%${++this.nextPane}`;
		const pane = this.pane(id);
		this.sessions.set(id, options.name ?? "");
		this.metadata.set(id, {});
		return { activePane: pane };
	}

	async panes(): Promise<Iterable<Pane>> {
		return [...this.sessions.keys()].map((id) => this.pane(id));
	}

	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		if (command === "list-panes")
			return [...this.sessions.keys()].map((id) => {
				const values = this.metadata.get(id) ?? {};
				return [
					id,
					this.dead.has(id) ? "1" : "0",
					"@agent",
					values["@backlog_root"] ?? "",
					values["@backlog_task"] ?? "",
					values["@backlog_session"] ?? "",
					values["@backlog_role"] ?? "",
					"",
				].join("\t");
			});
		if (command === "display-message")
			return args.includes("#{pid}") ? ["4242"] : [`${args[args.indexOf("-t") + 1] ?? ""} 0`];
		return [];
	}

	private pane(id: string): Pane {
		return {
			id,
			window: { setOption: async () => {} },
			setOption: async (name, value) => {
				const values = this.metadata.get(id) ?? {};
				values[name] = value;
				this.metadata.set(id, values);
			},
			setTitle: async () => {},
			pipeTo: async () => {},
			respawn: async () => {
				this.dead.delete(id);
			},
			displayMessage: async (message) => (message === "#{pane_id} #{pane_dead}" ? [`${id} 0`] : ["0 0"]),
			kill: async () => {
				this.dead.add(id);
			},
		};
	}
}

describe("public previous-session selection by mode", () => {
	const roots: string[] = [];
	const previousConfigHomes: Array<string | undefined> = [];
	afterEach(async () => {
		const previous = previousConfigHomes.pop();
		if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = previous;
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	async function fixture(workspaceContext?: () => Promise<WorkspaceContext | undefined>) {
		const root = await mkdtemp(join(tmpdir(), "mode-previous-session-contract-"));
		roots.push(root);
		previousConfigHomes.push(process.env.XDG_CONFIG_HOME);
		process.env.XDG_CONFIG_HOME = join(root, "xdg");
		const core = new Core(root);
		await initializeTestProject(core, "Previous session contract");
		await core.createTaskFromInput({ title: "Previous session task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		await upsertAgentConfiguration(core, "project", {
			modes: getDefaultModeCatalog(),
			selectedPreset: "contract",
			presets: { contract: { command: "pi", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const harness = new FakeHarness();
		const store = new SessionStore(root, harness);
		const service = new AgentSessionService(core, { runner: harness, tmuxServer: harness, workspaceContext });
		return { core, harness, service, store, root };
	}

	function context(
		rootDir: string,
		conversation?: WorkspaceContext["conversation"],
		nativeSessionId?: string,
	): WorkspaceContext {
		return {
			v: 2,
			paneId: "%42",
			rootDir,
			...(conversation ? { conversation } : {}),
			...(nativeSessionId ? { nativeSessionId } : {}),
		};
	}

	function session(id: string, nativeSessionId: string, _modeId: "plan" | "build"): AgentSession {
		const now = new Date().toISOString();
		return {
			id,
			taskId: "TASK-1",
			preset: "contract",
			tmuxName: `contract-${id}`,
			cwd: process.cwd(),
			createdAt: now,
			lastUsedAt: now,
			status: "stopped",
			nativeSessionId,
			outputPath: join(process.cwd(), `${id}.log`),
			bootstrapPath: join(process.cwd(), `${id}.md`),
		};
	}

	it("chooses the newest prior session by timestamp within the mode, not merged append order", async () => {
		const { service, harness, store } = await fixture();
		const earlierInArray = session("plan-earlier-array", "native-earlier-array", "plan");
		const laterInArray = session("plan-later-array", "native-later-array", "plan");
		await store.mutateMode("TASK-1", "plan", async (history) => {
			history.sessions.push(earlierInArray, laterInArray);
		});
		await store.mutateMode("TASK-1", "plan", async (history) => {
			const earlier = history.sessions.find(({ id }) => id === earlierInArray.id);
			const later = history.sessions.find(({ id }) => id === laterInArray.id);
			if (!earlier || !later) throw new Error("fixture sessions missing");
			earlier.lastUsedAt = "2030-02-01T00:00:00.000Z";
			later.lastUsedAt = "2030-01-01T00:00:00.000Z";
		});

		await service.ask("task-1", "which session?", { modeId: "plan" });
		expect(harness.commands.at(-1)?.join(" ")).toContain(earlierInArray.nativeSessionId);
		expect(harness.commands.at(-1)?.join(" ")).not.toContain(laterInArray.nativeSessionId);
	});

	it("excludes the active session and the trusted caller, while explicit UUID selection still works", async () => {
		let caller: WorkspaceContext | undefined;
		const { root, service, harness, store } = await fixture(async () => caller);
		const candidate = session("plan-candidate", "native-plan-candidate", "plan");
		const callerSession = session("plan-caller", "native-plan-caller", "plan");
		await store.mutateMode("TASK-1", "plan", async (history) => {
			history.sessions.push(candidate, callerSession);
		});
		caller = context(
			root,
			{ taskId: callerSession.taskId, modeId: "plan", sessionId: callerSession.id },
			callerSession.nativeSessionId,
		);
		const active = session("plan-active", "native-plan-active", "plan");
		active.status = "running";
		await store.mutateMode("TASK-1", "plan", async (history) => {
			history.sessions.push(active);
			history.activeSessionId = active.id;
		});
		await service.ask("task-1", "prior only");
		expect(harness.commands.at(-1)?.join(" ")).toContain(candidate.nativeSessionId);
		await service.ask("task-1", "explicit caller", { sessionId: callerSession.id });
		expect(harness.commands.at(-1)?.join(" ")).toContain(callerSession.nativeSessionId);
		await expect(service.ask("task-1", "active", { sessionId: active.id })).rejects.toThrow(/running/i);
	});

	it("honors fixed owning mode despite a stale selected mode in calling context", async () => {
		let caller: WorkspaceContext | undefined;
		const { root, service, harness, store } = await fixture(async () => caller);
		const moved = session("build-owned", "native-build-owned", "build");
		const buildPrior = session("build-prior", "native-build-prior", "build");
		const buildCaller = session("build-caller", "native-build-caller", "build");
		await store.mutateMode("TASK-1", "build", async (history) => {
			history.sessions.push(moved, buildPrior, buildCaller);
		});
		caller = context(root, { taskId: moved.taskId, modeId: "plan", sessionId: moved.id }, moved.nativeSessionId);
		await service.ask("task-1", "ask in current owner");
		expect(harness.commands.at(-1)?.join(" ")).toContain(buildPrior.nativeSessionId);
		await service.ask("task-1", "explicit moved UUID", { sessionId: moved.id });
		expect(harness.commands.at(-1)?.join(" ")).toContain(moved.nativeSessionId);
		await expect(service.ask("task-1", "explicit mode with no prior", { modeId: "plan" })).rejects.toThrow(
			/no previous session/i,
		);
		expect(harness.commands.at(-1)?.join(" ")).toContain(moved.nativeSessionId);
		expect(buildPrior.id).not.toBe(buildCaller.id);
	});

	it("reports a clear no-previous-session error for an empty mode", async () => {
		const { service, harness } = await fixture();
		await expect(service.ask("task-1", "nothing to ask", { modeId: "plan" })).rejects.toThrow(/no previous session/i);
		expect(harness.commands).toEqual([]);
	});
});
