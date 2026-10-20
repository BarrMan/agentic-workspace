import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../../controller/agentic-workspace.ts";
import type { ModeProfile } from "../../model/session/types.ts";
import { AgentSessionService, type ProcessRunner, type TmuxServer } from "../../runtime/sessions.ts";
import {
	getDefaultModeCatalog,
	initializeAgentConfiguration,
	loadAgentConfiguration,
	updateAgentConfiguration,
	upsertAgentConfiguration,
} from "../../storage/config.ts";
import { SessionStore } from "../../storage/session-store.ts";
import { disableHarnessReadiness } from "../agent-test-helpers.ts";
import { initializeTestProject } from "../test-utils.ts";

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

let originalXdgConfigHome: string | undefined;
let testConfigHome: string;
let restoreHarnessReadiness: (() => void) | undefined;
beforeAll(async () => {
	restoreHarnessReadiness = disableHarnessReadiness();
	originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	testConfigHome = await mkdtemp(join(tmpdir(), "mode-session-service-config-"));
	process.env.XDG_CONFIG_HOME = testConfigHome;
});
afterAll(async () => {
	restoreHarnessReadiness?.();
	if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
	await rm(testConfigHome, { recursive: true, force: true });
});

class FakeHarness implements ProcessRunner, TmuxServer {
	readonly commands: string[][] = [];
	readonly sessions = new Map<string, string>();
	readonly metadata = new Map<string, Record<string, string>>();
	readonly dead = new Set<string>();
	private nextPane = 0;

	async run(args: string[]) {
		this.commands.push(args);
		return { exitCode: 0, stdout: "answer from previous", stderr: "" };
	}

	async newSession(options: { name?: string } = {}) {
		const id = `%${++this.nextPane}`;
		const pane: Pane = {
			id,
			window: { setOption: async () => {} },
			setOption: async (name, value) => {
				const values = this.metadata.get(id) ?? {};
				values[name] = value;
				this.metadata.set(id, values);
			},
			setTitle: async () => {},
			pipeTo: async () => {},
			respawn: async (command) => {
				if (command) await this.captureIdentity(id, command);
				this.dead.delete(id);
			},
			displayMessage: async (message) => {
				if (message === "#{pane_id} #{pane_dead}") return [`${id} ${this.dead.has(id) ? "1" : "0"}`];
				if (message === "#{pane_dead} #{pane_dead_status}") return [this.dead.has(id) ? "1 0" : "0 0"];
				return [""];
			},
			kill: async () => {
				this.dead.add(id);
			},
		};
		this.sessions.set(id, options.name ?? "");
		this.metadata.set(id, {});
		return { activePane: pane };
	}

	async panes(): Promise<Iterable<Pane>> {
		return [...this.sessions.keys()].map((id) => this.pane(id));
	}

	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		if (command === "has-session") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			const name = target.replace(/^=/, "").replace(/:$/, "");
			if ([...this.sessions.values()].includes(name)) return [];
			throw new TmuxCommandError({ args: [command, ...args], exitCode: 1, target, stderr: [] });
		}
		if (command === "list-panes") {
			const targetIndex = args.indexOf("-t");
			const target = targetIndex >= 0 ? args[targetIndex + 1] : undefined;
			const sessionName = target ? /^=(.*):$/.exec(target)?.[1] : undefined;
			const panes = [...this.sessions.entries()].filter(
				([id, name]) => !target || (sessionName !== undefined ? name === sessionName : id === target),
			);
			if (target && !panes.length)
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					target,
					stderr: [sessionName ? `can't find session: ${sessionName}` : `can't find pane: ${target}`],
				});
			const format = args[args.indexOf("-F") + 1];
			if (!format) throw new Error("Pane listing requires an explicit format");
			return panes.map(([id, name]) => {
				const values: Record<string, string> = {
					...(this.metadata.get(id) ?? {}),
					session_name: name,
					pane_id: id,
					pane_dead: this.dead.has(id) ? "1" : "0",
				};
				return format.replace(/#\{([^}]+)\}/g, (_match, key: string) => values[key] ?? "");
			});
		}
		if (command === "display-message") {
			if (args.includes("#{pid}")) return ["4242"];
			const id = args[args.indexOf("-t") + 1] ?? "";
			if (args.some((arg) => arg.includes("@agentic_workspace_launch_resources")))
				return [this.metadata.get(id)?.["@agentic_workspace_launch_resources"] ?? ""];
			if (args.includes("#{pane_pid} #{pane_dead}")) return [`4242 ${this.dead.has(id) ? "1" : "0"}`];
			return [`${id} ${this.dead.has(id) ? "1" : "0"}`];
		}
		return [];
	}

	private pane(id: string): Pane {
		const metadata = this.metadata.get(id) ?? {};
		return {
			id,
			window: { setOption: async () => {} },
			setOption: async (name, value) => {
				metadata[name] = value;
				this.metadata.set(id, metadata);
			},
			setTitle: async () => {},
			pipeTo: async () => {},
			respawn: async (command) => {
				if (command) await this.captureIdentity(id, command);
				this.dead.delete(id);
			},
			displayMessage: async (message) =>
				message === "#{pane_id} #{pane_dead}"
					? [`${id} ${this.dead.has(id) ? "1" : "0"}`]
					: message === "#{pane_dead} #{pane_dead_status}"
						? [this.dead.has(id) ? "1 0" : "0 0"]
						: [""],
			kill: async () => {
				this.dead.add(id);
			},
		};
	}

	private async captureIdentity(id: string, command: string): Promise<void> {
		const raw = this.metadata.get(id)?.["@agentic_workspace_launch_resources"];
		const skillPath = raw ? (JSON.parse(raw) as { skill?: { path?: string } }).skill?.path : undefined;
		const nativeId = /nativeSessionId[^0-9a-f]+([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/.exec(command)?.[1];
		if (!skillPath || !nativeId) return;
		const receipt = JSON.stringify({ session_id: nativeId });
		await writeFile(join(skillPath, "session_id"), nativeId);
		await writeFile(join(skillPath, "initialized"), receipt);
		await writeFile(join(skillPath, "prompt-accepted"), receipt);
	}
}

describe("public AgentSessionService mode contract", () => {
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

	async function fixture() {
		const root = await mkdtemp(join(tmpdir(), "mode-session-service-contract-"));
		roots.push(root);
		const core = new Core(root);
		await core.getConfig();
		await initializeTestProject(core, "Mode session contract");
		await core.createTaskFromInput({ title: "Mode contract task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		await upsertAgentConfiguration(core, "project", {
			modes: getDefaultModeCatalog(),
			selectedPreset: "contract",
			presets: { contract: { command: ["pi", "{prompt}"], env: {}, prepare: "", bootstrap: "pi" } },
		});
		const harness = new FakeHarness();
		const store = new SessionStore(root, harness);
		const service = new AgentSessionService(core, { runner: harness, tmuxServer: harness });
		return { root, core, harness, service, store };
	}

	it("starts independent mode histories concurrently and serializes a duplicate same-mode start", async () => {
		const { service, store } = await fixture();
		const [plan, build] = await Promise.all([
			service.start("task-1", { modeId: "plan" }),
			service.start("task-1", { modeId: "build" }),
		]);
		expect((await store.readMode(plan.taskId, "plan")).sessions[0]?.id).toBe(plan.id);
		expect((await store.readMode(build.taskId, "build")).sessions[0]?.id).toBe(build.id);
		const histories = await Promise.all([service.listMode("task-1", "plan"), service.listMode("task-1", "build")]);
		expect(histories[0]).toMatchObject({ activeSessionId: plan.id, sessions: [{ id: plan.id }] });
		expect(histories[1]).toMatchObject({ activeSessionId: build.id, sessions: [{ id: build.id }] });
		await expect(service.start("task-1", { modeId: "plan" })).rejects.toThrow(/active or reserved/i);
	});

	it("replacement handoff snapshots current mode configuration and leaves the other mode untouched", async () => {
		const { service, core, harness } = await fixture();
		const plan = await service.start("task-1", { modeId: "plan" });
		const build = await service.start("task-1", { modeId: "build" });
		const planBefore = await service.listMode("task-1", "plan");
		const buildBefore = await service.listMode("task-1", "build");
		await updateAgentConfiguration(core, "project", (configuration) => {
			if (!configuration.modes) return configuration;
			const planProfile: ModeProfile | undefined = configuration.modes.profiles.plan;
			if (!planProfile) return configuration;
			return {
				...configuration,
				modes: {
					...configuration.modes,
					profiles: {
						...configuration.modes.profiles,
						plan: { ...planProfile, prompt: "revised PLAN prompt" },
					},
				},
			};
		});
		const next = await service.start("task-1", { modeId: "plan", replace: true });
		const planAfter = await service.listMode("task-1", "plan");
		const buildAfter = await service.listMode("task-1", "build");
		expect(next.id).not.toBe(plan.id);
		expect(next.preset).toBe(plan.preset);
		expect(planAfter.activeSessionId).toBe(next.id);
		expect(planAfter.sessions.find(({ id }) => id === plan.id)).toEqual(planBefore.sessions[0]);
		await service.stop("task-1", next.id);
		expect((await service.listMode("task-1", "plan")).activeSessionId).toBe(plan.id);
		expect(planAfter.sessions.map(({ id }) => id)).toEqual([plan.id, next.id]);
		expect(planAfter.sessions.find(({ id }) => id === plan.id)?.pathContext).toEqual(plan.pathContext);
		expect(Object.keys(plan)).not.toContain("createdWith");
		expect(buildAfter).toEqual(buildBefore);
		expect(buildAfter.activeSessionId).toBe(build.id);
		expect(planBefore.activeSessionId).toBe(plan.id);
		const buildPane = [...harness.metadata.entries()].find(
			([, metadata]) => metadata["@agentic_workspace_session"] === build.id,
		)?.[0];
		expect(buildPane).toBeDefined();
		const config = await loadAgentConfiguration(core, "project");
		expect(config?.modes?.profiles.plan).toBeDefined();
	});

	it("routes ask by caller mode despite a different UI selection and does not change active pointers", async () => {
		const { service, harness, store } = await fixture();
		const plan = await service.start("task-1", { modeId: "plan" });
		await store.mutateSession("TASK-1", plan.id, async (session) => {
			session.createdAt = "2026-01-01T00:00:00.000Z";
			session.lastUsedAt = "2026-01-01T00:00:00.000Z";
		});
		const build = await service.start("task-1", { modeId: "build" });
		await store.mutateSession("TASK-1", build.id, async (session) => {
			session.createdAt = "2026-01-02T00:00:00.000Z";
			session.lastUsedAt = "2026-01-02T00:00:00.000Z";
		});
		await service.stop("task-1", plan.id);
		const previous = await service.start("task-1", { modeId: "plan", replace: true });
		await store.mutateSession("TASK-1", previous.id, async (session) => {
			session.createdAt = "2026-01-03T00:00:00.000Z";
			session.lastUsedAt = "2026-01-03T00:00:00.000Z";
		});
		await service.stop("task-1", previous.id);
		const beforePlan = await service.listMode("task-1", "plan");
		const beforeBuild = await service.listMode("task-1", "build");
		await service.ask("task-1", "question", { modeId: "plan" });
		expect(harness.commands.at(-1)?.join(" ")).toContain(previous.nativeSessionId);
		expect((await service.listMode("task-1", "plan")).activeSessionId).toBe(beforePlan.activeSessionId);
		expect((await service.listMode("task-1", "build")).activeSessionId).toBe(beforeBuild.activeSessionId);
		await expect(service.ask("task-1", "question", { sessionId: build.id })).rejects.toThrow(/running/i);
	});
});
