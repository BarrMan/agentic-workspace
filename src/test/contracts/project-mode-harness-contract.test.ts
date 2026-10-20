import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../../controller/agentic-workspace.ts";
import type { AgentConfiguration, AgentPreset } from "../../model/session/types.ts";
import { buildAgentResumeCommand } from "../../runtime/bootstrap.ts";
import type { ProcessRunner, TmuxServer } from "../../runtime/sessions.ts";
import {
	initializeAgentConfiguration,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "../../storage/config.ts";
import { disableHarnessReadiness, startPaneProcess, writePiCapture } from "../agent-test-helpers.ts";
import { initializeTestProject } from "../test-utils.ts";

const { AgentSessionService } = await import("../../runtime/sessions.ts");

let restoreHarnessReadiness: (() => void) | undefined;
let paneProcess: Awaited<ReturnType<typeof startPaneProcess>>;
beforeAll(async () => {
	restoreHarnessReadiness = disableHarnessReadiness();
	paneProcess = await startPaneProcess();
});
afterAll(async () => {
	restoreHarnessReadiness?.();
	await paneProcess?.stop();
});

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

class CapturedHarness implements ProcessRunner, TmuxServer {
	readonly commands: string[][] = [];
	readonly launches: string[] = [];
	readonly sessions = new Map<string, string>();
	readonly metadata = new Map<string, Record<string, string>>();
	readonly dead = new Set<string>();
	private nextPane = 0;

	async run(args: string[]) {
		this.commands.push(args);
		return { exitCode: 0, stdout: "harness response", stderr: "" };
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
		if (command === "has-session") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			const name = target.replace(/^=/, "").replace(/:$/, "");
			if ([...this.sessions.values()].includes(name)) return [];
			throw new TmuxCommandError({ args: [command, ...args], exitCode: 1, target, stderr: [] });
		}
		if (command === "list-panes") {
			const hasTarget = args.includes("-t");
			const target = args[args.indexOf("-t") + 1];
			const name = target ? /^=(.+):$/.exec(target)?.[1] : undefined;
			const panes = [...this.sessions.keys()].filter((id) =>
				hasTarget ? (name ? this.sessions.get(id) === name : id === target) : true,
			);
			if (hasTarget && !panes.length)
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					target,
					stderr: [name ? `can't find session: ${name}` : `can't find pane: ${target ?? ""}`],
				});
			const format = args[args.indexOf("-F") + 1];
			if (!format) throw new Error("Pane listing requires an explicit format");
			return panes.map((id) => {
				const metadata = this.metadata.get(id) ?? {};
				const values: Record<string, string> = {
					...metadata,
					session_name: this.sessions.get(id) ?? "",
					pane_id: id,
					pane_dead: this.dead.has(id) ? "1" : "0",
					pane_pid: String(paneProcess.pid),
					window_id: `@${id.slice(1)}`,
					pane_title: metadata.pane_title ?? "",
				};
				return format.replace(/#\{([^}]+)\}/g, (_match, key: string) => values[key] ?? "");
			});
		}
		if (command === "display-message") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			if (args.includes("#{pid}")) return ["4242"];
			if (args.at(-1) === "#{pane_pid}") return [String(paneProcess.pid)];
			if (args.includes("#{pane_pid} #{pane_dead}")) {
				if (!this.sessions.has(target))
					throw new TmuxCommandError({
						args: [command, ...args],
						exitCode: 1,
						target,
						stderr: [`can't find pane: ${target}`],
					});
				return [`${paneProcess.pid} ${this.dead.has(target) ? "1" : "0"}`];
			}
			if (args.some((arg) => arg.includes("@agentic_workspace_launch_resources"))) {
				if (!this.sessions.has(target))
					throw new TmuxCommandError({
						args: [command, ...args],
						exitCode: 1,
						target,
						stderr: [`can't find pane: ${target}`],
					});
				return [this.metadata.get(target)?.["@agentic_workspace_launch_resources"] ?? ""];
			}
			if (target && !this.sessions.has(target))
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					target,
					stderr: [`can't find pane: ${target}`],
				});
			return [`${target} ${this.dead.has(target) ? "1" : "0"}`];
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
			respawn: async (command) => {
				if (command) {
					this.launches.push(command);
					const raw = this.metadata.get(id)?.["@agentic_workspace_launch_resources"];
					const skillPath = raw ? (JSON.parse(raw) as { skill?: { path?: string } }).skill?.path : undefined;
					const nativeId = /nativeSessionId[^0-9a-f]+([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/.exec(command)?.[1];
					if (skillPath && nativeId) {
						const receipt = JSON.stringify({ session_id: nativeId });
						await writePiCapture(skillPath, command, nativeId);
						await writeFile(join(skillPath, "initialized"), receipt);
						await writeFile(join(skillPath, "prompt-accepted"), receipt);
					}
				}
				this.dead.delete(id);
			},
			displayMessage: async (message) =>
				message === "#{pane_id} #{pane_dead}" ? [`${id} ${this.dead.has(id) ? "1" : "0"}`] : ["0 0"],
			kill: async () => {
				this.dead.delete(id);
				this.sessions.delete(id);
				this.metadata.delete(id);
			},
		};
	}
}

const preset = (command: string[], bootstrap: AgentPreset["bootstrap"]): AgentPreset => ({
	command: [...command, "{prompt}"],
	env: { HARNESS_MARKER: command.join(" ") },
	prepare: "",
	bootstrap,
});

describe("project mode harness contract through public configuration and session APIs", () => {
	const roots: string[] = [];
	const originalXdg = process.env.XDG_CONFIG_HOME;
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = originalXdg;
	});

	async function fixture(taskOverride = false) {
		const root = await mkdtemp(join(tmpdir(), "project-mode-harness-contract-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "isolated-config-home");
		const core = new Core(root);
		await core.getConfig();
		await initializeTestProject(core, "Project mode harness contract");
		await core.createTaskFromInput({ title: "Harness isolation task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		const base = await loadAgentConfiguration(core, "project");
		if (!base) throw new Error("Project configuration was not initialized");
		const project: AgentConfiguration = {
			...base,
			selectedPreset: "project-pi",
			presets: {
				"project-opencode": preset(["opencode"], "opencode"),
				"project-pi": preset(["project-pi"], "pi"),
				"project-claude": preset(["project-claude"], "claude"),
			},
		};
		await upsertAgentConfiguration(core, "project", project);
		await upsertAgentConfiguration(core, "root", {
			selectedPreset: "root-claude",
			presets: { "root-claude": preset(["claude"], "claude") },
		});
		if (taskOverride)
			await upsertAgentConfiguration(
				core,
				"card",
				{
					selectedPreset: "card-pi",
					presets: { "card-pi": preset(["pi"], "pi") },
				},
				"task-1",
			);
		const harness = new CapturedHarness();
		const service = new AgentSessionService(core, { runner: harness, tmuxServer: harness });
		return { root, core, harness, service, project };
	}

	function launchCommand(harness: CapturedHarness, command: string): string {
		const invocation = harness.launches.find((value) => value.includes(command));
		if (!invocation) throw new Error(`No captured adapter invocation for ${command}`);
		return invocation;
	}

	it("uses task configuration ahead of project and user configuration for PLAN and BUILD", async () => {
		const { service, harness } = await fixture(true);
		const plan = await service.start("task-1", { modeId: "plan" });
		const build = await service.start("task-1", { modeId: "build" });
		expect(plan.preset).toBe("card-pi");
		expect(build.preset).toBe("card-pi");
		expect(plan.nativeSessionId).toBeDefined();
		expect(build.nativeSessionId).toBeDefined();
		expect(launchCommand(harness, "pi")).toContain("profile-bootstrap.md");
		expect(harness.launches).toHaveLength(2);
	});

	it("uses a changed project selection for a handoff while preserving the old preset name", async () => {
		const { service, core, harness } = await fixture();
		const old = await service.start("task-1", { modeId: "plan" });
		await service.stop("task-1", old.id);
		await upsertAgentConfiguration(core, "project", {
			...((await loadAgentConfiguration(core, "project")) as AgentConfiguration),
			selectedPreset: "project-claude",
		});
		const handoff = await service.start("task-1", { modeId: "plan", replace: true });
		expect(handoff.preset).toBe("project-claude");
		expect(handoff.nativeSessionId).toBeDefined();
		const history = await service.listMode("task-1", "plan");
		expect(history.sessions.find(({ id }) => id === old.id)?.preset).toBe("project-pi");
		expect(Object.keys(old)).not.toContain("createdWith");
		expect(launchCommand(harness, "project-pi")).toContain("profile-bootstrap.md");
		expect(launchCommand(harness, "claude")).toContain("profile-bootstrap.md");
	});

	it("asks a parked prior session with its saved name, current command and unchanged native ID", async () => {
		const { service, core, harness } = await fixture();
		const old = await service.start("task-1", { modeId: "plan" });
		await service.stop("task-1", old.id);
		await upsertAgentConfiguration(core, "project", {
			...((await loadAgentConfiguration(core, "project")) as AgentConfiguration),
			selectedPreset: "project-pi",
		});
		const handoff = await service.start("task-1", { modeId: "plan", replace: true });
		await service.stop("task-1", handoff.id);
		const nativeSessionId = old.nativeSessionId;
		if (!nativeSessionId) throw new Error("The session did not retain its native session ID");
		await upsertAgentConfiguration(core, "project", {
			...((await loadAgentConfiguration(core, "project")) as AgentConfiguration),
			presets: { "project-pi": preset(["updated-pi"], "pi") },
		});
		await service.ask("task-1", "continue the original", { sessionId: old.id, modeId: "build" });
		const ask = harness.commands.at(-1)?.join(" ") ?? "";
		expect(ask).toContain(nativeSessionId);
		expect(ask).toContain("--session");
		expect(ask).toContain(nativeSessionId);
		expect(ask).toContain("updated-pi");
		expect(ask).toContain("--session");
		expect(ask).not.toContain("project-claude -p");
		expect(old.preset).toBe("project-pi");
		const resumed = buildAgentResumeCommand(preset(["updated-pi"], "pi"), nativeSessionId);
		expect(resumed).toContain("--session");
		expect(resumed).toContain(nativeSessionId);
		expect(resumed).toContain("updated-pi");
		const saved = (await service.listMode("task-1", "plan")).sessions.find(({ id }) => id === old.id);
		expect(saved?.nativeSessionId).toBe(nativeSessionId);
	});

	it("accepts an explicit preset from the current configuration", async () => {
		const { service, harness } = await fixture();
		const explicit = await service.start("task-1", { modeId: "plan", preset: "project-claude" });
		expect(explicit.preset).toBe("project-claude");
		await service.stop("task-1", explicit.id);
		const selected = await service.start("task-1", { modeId: "plan", preset: "project-pi" });
		expect(selected.preset).toBe("project-pi");
		expect(launchCommand(harness, "pi")).toContain("profile-bootstrap.md");
	});

	it("refuses to change providers for a saved conversation without dispatching", async () => {
		const { service, core, harness } = await fixture();
		const original = await service.start("task-1", { modeId: "plan" });
		await service.stop("task-1", original.id);
		await upsertAgentConfiguration(core, "project", {
			...((await loadAgentConfiguration(core, "project")) as AgentConfiguration),
			presets: { "project-pi": preset(["updated-claude"], "claude") },
		});
		const launchesBefore = harness.launches.length;
		const commandsBefore = harness.commands.length;
		const historyBefore = await service.listMode("task-1", "plan");
		await expect(service.prepareNativeSession("task-1", original.id, "plan")).rejects.toThrow(
			"belongs to provider pi, not claude",
		);
		await expect(service.ask("task-1", "fixture-only question", { sessionId: original.id })).rejects.toThrow(
			"belongs to provider pi, not claude",
		);
		expect(harness.launches).toHaveLength(launchesBefore);
		expect(harness.commands).toHaveLength(commandsBefore);
		expect(await service.listMode("task-1", "plan")).toEqual(historyBefore);
	});
});
