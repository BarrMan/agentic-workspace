import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../core/backlog.ts";
import { initializeTestProject } from "../test/test-utils.ts";
import { getDefaultModeCatalog, initializeAgentConfiguration, upsertAgentConfiguration } from "./config.ts";
import * as processTree from "./process-tree.ts";
import { SessionStore } from "./session-store.ts";
import { AgentSessionService, type ProcessRunner, type TmuxServer } from "./sessions.ts";
import type { WorkspaceContext } from "./workspace-context.ts";

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
	result: { exitCode: number; stdout: string; stderr: string; timedOut?: boolean } = {
		exitCode: 0,
		stdout: "answer from previous",
		stderr: "",
	};
	private nextPane = 0;

	async run(args: string[]) {
		this.commands.push(args);
		return this.result;
	}
	async newSession(options: { name?: string } = {}) {
		const id = `%${++this.nextPane}`;
		this.sessions.set(id, options.name ?? "");
		this.metadata.set(id, {});
		return { activePane: this.pane(id) };
	}
	async panes(): Promise<Iterable<Pane>> {
		return [...this.sessions.keys()].map((id) => this.pane(id));
	}
	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		if (command === "list-panes") {
			const target = args[args.indexOf("-t") + 1];
			const name = target ? /^=(.+):$/.exec(target)?.[1] : undefined;
			const panes = [...this.sessions.entries()].filter(
				([id, sessionName]) => !target || (name ? sessionName === name : id === target),
			);
			if (target && !panes.length)
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					target,
					stderr: [name ? `can't find session: ${name}` : `can't find pane: ${target}`],
				});
			const format = args[args.indexOf("-F") + 1];
			if (!format) throw new Error("Pane listing requires an explicit format");
			return panes.map(([id, sessionName]) => {
				const metadata = this.metadata.get(id) ?? {};
				const row: Record<string, string> = {
					session_name: sessionName,
					"@backlog_root": metadata["@backlog_root"] ?? "",
					"@backlog_task": metadata["@backlog_task"] ?? "",
					"@backlog_session": metadata["@backlog_session"] ?? "",
					"@backlog_role": metadata["@backlog_role"] ?? "",
					pane_id: id,
					pane_dead: this.dead.has(id) ? "1" : "0",
				};
				return format.replace(/#\{([^}]+)\}/g, (_match, key: string) => row[key] ?? "");
			});
		}
		if (command === "display-message") {
			if (args.includes("#{pid}")) return ["4242"];
			if (args.some((arg) => arg.includes("@backlog_launch_resources"))) {
				const paneId = args[args.indexOf("-t") + 1] ?? "";
				return [this.metadata.get(paneId)?.["@backlog_launch_resources"] ?? ""];
			}
			if (args.includes("#{pane_pid} #{pane_dead}")) return ["4242 0"];
			return ["%1 0"];
		}
		return [];
	}
	private pane(id: string): Pane {
		return {
			id,
			window: { setOption: async () => {} },
			setOption: async (name, value) => {
				const metadata = this.metadata.get(id) ?? {};
				metadata[name] = value;
				this.metadata.set(id, metadata);
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

describe("mode ask ownership through the public service", () => {
	const roots: string[] = [];
	const previousConfigHomes: Array<string | undefined> = [];
	let processMocks: Array<{ mockRestore(): void }> = [];
	beforeEach(() => {
		processMocks = [
			spyOn(processTree, "snapshotProcessGroup").mockReturnValue(undefined),
			spyOn(processTree, "terminateProcessTree").mockResolvedValue("terminated"),
			spyOn(processTree, "deadPaneGroupState").mockReturnValue("gone"),
		];
	});
	afterEach(async () => {
		for (const mock of processMocks) mock.mockRestore();
		const previous = previousConfigHomes.pop();
		if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = previous;
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	async function fixture(workspaceContext?: () => Promise<WorkspaceContext | undefined>) {
		const root = await mkdtemp(join(tmpdir(), "mode-ask-context-contract-"));
		roots.push(root);
		previousConfigHomes.push(process.env.XDG_CONFIG_HOME);
		process.env.XDG_CONFIG_HOME = join(root, "xdg");
		const core = new Core(root);
		await initializeTestProject(core, "Mode ask context contract");
		await core.createTaskFromInput({ title: "Mode ownership task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		await upsertAgentConfiguration(core, "project", {
			modes: getDefaultModeCatalog(),
			selectedPreset: "contract",
			presets: { contract: { command: "pi", env: {}, prepare: "", bootstrap: "pi" } },
		});
		const harness = new FakeHarness();
		const store = new SessionStore(root, harness);
		return {
			root,
			core,
			harness,
			store,
			service: new AgentSessionService(core, { runner: harness, tmuxServer: harness, workspaceContext }),
		};
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

	it("explicit session UUID wins over explicit mode, caller membership, and UI context", async () => {
		const { service, harness } = await fixture();
		const plan = await service.start("task-1", { modeId: "plan" });
		const build = await service.start("task-1", { modeId: "build" });
		await service.stop("task-1", plan.id);
		const previous = await service.start("task-1", { modeId: "plan", replace: true });
		await service.stop("task-1", previous.id);
		await service.ask("task-1", "explicit session", { sessionId: plan.id, modeId: "build" });
		expect(harness.commands.at(-1)?.join(" ")).toContain(plan.nativeSessionId);
		await expect(service.ask("task-1", "running caller", { sessionId: build.id })).rejects.toThrow(/running/i);
	});

	it("explicit mode wins over trusted caller UUID membership; absent explicit mode, current membership wins UI selection", async () => {
		let caller: WorkspaceContext | undefined;
		const { root, service, harness } = await fixture(async () => caller);
		const plan = await service.start("task-1", { modeId: "plan" });
		const build = await service.start("task-1", { modeId: "build" });
		await service.stop("task-1", plan.id);
		await service.stop("task-1", build.id);
		const planHandoff = await service.start("task-1", { modeId: "plan", replace: true });
		await service.stop("task-1", planHandoff.id);
		const buildHandoff = await service.start("task-1", { modeId: "build", replace: true });
		await service.stop("task-1", buildHandoff.id);
		caller = context(root, { taskId: build.taskId, modeId: "build", sessionId: build.id }, build.nativeSessionId);
		await service.ask("task-1", "explicit mode", { modeId: "plan" });
		expect(harness.commands.at(-1)?.join(" ")).toContain(planHandoff.nativeSessionId);
		await service.ask("task-1", "caller membership");
		expect(harness.commands.at(-1)?.join(" ")).toContain(buildHandoff.nativeSessionId);
	});

	it("uses timestamp recency rather than append order and returns timed-out partial output", async () => {
		const { service, harness, store } = await fixture();
		const older = await service.start("task-1", { modeId: "plan" });
		await service.stop("task-1", older.id);
		const newer = await service.start("task-1", { modeId: "plan", replace: true });
		await service.stop("task-1", newer.id);
		await store.mutateSession("TASK-1", older.id, async (session) => {
			session.createdAt = "2026-01-01T00:00:00.000Z";
			session.lastUsedAt = "2026-01-01T00:00:00.000Z";
		});
		await store.mutateSession("TASK-1", newer.id, async (session) => {
			session.createdAt = "2026-01-02T00:00:00.000Z";
			session.lastUsedAt = "2026-01-02T00:00:00.000Z";
		});
		harness.result = { exitCode: 1, stdout: "partial response", stderr: "", timedOut: true };
		const answer = await service.ask("task-1", "question", { modeId: "plan" });
		expect(harness.commands.at(-1)?.join(" ")).toContain(newer.nativeSessionId);
		expect(harness.commands.at(-1)?.join(" ")).not.toContain(older.nativeSessionId);
		expect(answer).toEqual({ answer: "partial response", timedOut: true });
	});
});
