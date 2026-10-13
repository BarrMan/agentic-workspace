import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../core/backlog.ts";
import { initializeTestProject } from "../test/test-utils.ts";
import { getDefaultModeCatalog, initializeAgentConfiguration, upsertAgentConfiguration } from "./config.ts";
import { AgentSessionService, type ProcessRunner, type TmuxServer } from "./sessions.ts";

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
beforeAll(async () => {
	originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	testConfigHome = await mkdtemp(join(tmpdir(), "failed-mode-handoff-config-"));
	process.env.XDG_CONFIG_HOME = testConfigHome;
});
afterAll(async () => {
	if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
	await rm(testConfigHome, { recursive: true, force: true });
});

class FakeHarness implements ProcessRunner, TmuxServer {
	readonly commands: string[][] = [];
	readonly sessions = new Map<string, string>();
	readonly metadata = new Map<string, Record<string, string>>();
	readonly dead = new Set<string>();
	failNextCreate = false;
	private nextPane = 0;

	async run(args: string[]) {
		this.commands.push(args);
		return { exitCode: 0, stdout: "", stderr: "" };
	}

	async newSession(options: { name?: string } = {}) {
		if (this.failNextCreate) {
			this.failNextCreate = false;
			throw new Error("replacement process.create failed");
		}
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
			respawn: async () => {
				this.dead.delete(id);
			},
			displayMessage: async (message) => {
				if (message === "#{pane_id} #{pane_dead}") return [`${id} ${this.dead.has(id) ? "1" : "0"}`];
				if (message === "#{pane_dead} #{pane_dead_status}") return [this.dead.has(id) ? "1 0" : "0 0"];
				return [""];
			},
			kill: async () => {
				this.sessions.delete(id);
				this.metadata.delete(id);
				this.dead.delete(id);
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
			if (args.some((arg) => arg.includes("@backlog_launch_resources")))
				return [this.metadata.get(id)?.["@backlog_launch_resources"] ?? ""];
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
			respawn: async () => {
				this.dead.delete(id);
			},
			displayMessage: async (message) =>
				message === "#{pane_id} #{pane_dead}"
					? [`${id} ${this.dead.has(id) ? "1" : "0"}`]
					: message === "#{pane_dead} #{pane_dead_status}"
						? [this.dead.has(id) ? "1 0" : "0 0"]
						: [""],
			kill: async () => {
				this.sessions.delete(id);
				this.metadata.delete(id);
				this.dead.delete(id);
			},
		};
	}
}

describe("failed mode handoff contract", () => {
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

	it("retains a recoverable parked predecessor and the other mode when replacement creation fails", async () => {
		const root = await mkdtemp(join(tmpdir(), "failed-mode-handoff-contract-"));
		roots.push(root);
		const core = new Core(root);
		await initializeTestProject(core, "Failed mode handoff");
		await core.createTaskFromInput({ title: "Handoff contract task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		await upsertAgentConfiguration(core, "project", {
			modes: getDefaultModeCatalog(),
			selectedPreset: "contract",
			presets: { contract: { command: "claude", env: {}, prepare: "", bootstrap: "claude" } },
		});
		const harness = new FakeHarness();
		const service = new AgentSessionService(core, { runner: harness, tmuxServer: harness });
		const original = await service.start("task-1", { modeId: "plan" });
		const originalNativeSessionId = original.nativeSessionId;
		expect(typeof originalNativeSessionId).toBe("string");
		expect(originalNativeSessionId?.length).toBeGreaterThan(0);
		const other = await service.start("task-1", { modeId: "build" });
		const originalPaths = original.pathContext;
		harness.failNextCreate = true;
		await expect(service.start("task-1", { modeId: "plan", replace: true })).rejects.toThrow(
			"replacement process.create failed",
		);

		const plan = await service.listMode("task-1", "plan");
		const build = await service.listMode("task-1", "build");
		expect(plan.activeSessionId).toBe(original.id);
		expect(plan.sessions.find(({ id }) => id === original.id)).toMatchObject({
			id: original.id,
			nativeSessionId: originalNativeSessionId,
			pathContext: originalPaths,
			status: "parked",
		});
		expect(plan.sessions.find(({ status }) => status === "failed")).toMatchObject({
			status: "failed",
			error: expect.stringContaining("replacement process.create failed"),
		});
		expect(build.activeSessionId).toBe(other.id);
		expect(build.sessions).toHaveLength(1);

		const prepared = await service.prepareNativeSession("task-1", original.id, "plan");
		expect(prepared.record.id).toBe(original.id);
		expect(prepared.record.nativeSessionId).toBe(originalNativeSessionId);
	});
});
