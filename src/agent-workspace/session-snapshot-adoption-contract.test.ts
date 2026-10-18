import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../core/agentic-workspace.ts";
import { coreFileSystem, initializeTestProject } from "../test/test-utils.ts";
import {
	getDefaultModeCatalog,
	initializeAgentConfiguration,
	updateAgentConfiguration,
	upsertAgentConfiguration,
} from "./config.ts";
import * as processTree from "./process-tree.ts";
import type { ProcessRunner, TmuxServer } from "./sessions.ts";
import type { ModeProfile } from "./types.ts";

mock.module("./process-tree.ts", () => ({
	...processTree,
	snapshotProcessGroup: (pid: number) => [{ pid, started: "fake-start" }],
	terminateProcessTree: async () => "terminated",
	deadPaneGroupState: () => "gone",
}));
const { AgentSessionService } = await import("./sessions.ts");

function requireModeProfile(profile: ModeProfile | undefined): ModeProfile {
	if (!profile || typeof profile.name !== "string" || !profile.name.trim()) {
		throw new Error("Expected a validated mode profile.");
	}
	return profile;
}

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

class SnapshotHarness implements ProcessRunner, TmuxServer {
	readonly commands: string[][] = [];
	readonly launches: string[] = [];
	readonly metadata = new Map<string, Record<string, string>>();
	readonly dead = new Set<string>();
	private nextPane = 0;

	async run(args: string[], options?: { env?: Record<string, string> }) {
		this.commands.push(args);
		this.environments.push(options?.env);
		return { exitCode: 0, stdout: "", stderr: "" };
	}

	readonly environments: Array<Record<string, string> | undefined> = [];

	async newSession(options: { name?: string } = {}) {
		const id = `%${++this.nextPane}`;
		const pane = this.pane(id);
		this.metadata.set(id, { "@session_name": options.name ?? "" });
		return { activePane: pane };
	}

	async panes(): Promise<Iterable<Pane>> {
		return [...this.metadata.keys()].map((id) => this.pane(id));
	}

	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		if (command === "list-panes") {
			const hasTarget = args.includes("-t");
			const target = args[args.indexOf("-t") + 1];
			const name = target ? /^=(.+):$/.exec(target)?.[1] : undefined;
			const panes = [...this.metadata.entries()].filter(([id, values]) =>
				hasTarget ? (name ? values["@session_name"] === name : id === target) : true,
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
			return panes.map(([id, values]) => {
				const row: Record<string, string> = {
					...values,
					session_name: values["@session_name"] ?? "",
					pane_id: id,
					pane_dead: this.dead.has(id) ? "1" : "0",
					pane_pid: "4242",
					window_id: `@${id.slice(1)}`,
					pane_title: values.pane_title ?? "",
				};
				return format.replace(/#\{([^}]+)\}/g, (_match, key: string) => row[key] ?? "");
			});
		}
		if (command === "display-message") {
			if (args.includes("#{pid}")) return ["4242"];
			const id = args[args.indexOf("-t") + 1] ?? "";
			if (!this.metadata.has(id))
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					target: id,
					stderr: [`can't find pane: ${id}`],
				});
			if (args.includes("#{pane_pid} #{pane_dead}")) return [`4242 ${this.dead.has(id) ? "1" : "0"}`];
			if (args.some((arg) => arg.includes("@agentic_workspace_launch_resources")))
				return [this.metadata.get(id)?.["@agentic_workspace_launch_resources"] ?? ""];
			return [`${id} ${this.dead.has(id) ? "1" : "0"}`];
		}
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
			respawn: async (command) => {
				if (command) this.launches.push(command);
				this.dead.delete(id);
			},
			displayMessage: async (message) =>
				message === "#{pane_id} #{pane_dead}"
					? [`${id} ${this.dead.has(id) ? "1" : "0"}`]
					: message === "#{pane_dead} #{pane_dead_status}"
						? [this.dead.has(id) ? "1 0" : "0 0"]
						: [""],
			kill: async () => {
				this.dead.delete(id);
				this.metadata.delete(id);
			},
		};
	}
}

describe("public session snapshot adoption contract", () => {
	const roots: string[] = [];
	const originalXdg = process.env.XDG_CONFIG_HOME;
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = originalXdg;
	});

	it("adopts the saved preset name using current configuration after project settings change", async () => {
		const root = await mkdtemp(join(tmpdir(), "session-snapshot-adoption-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "isolated-config-home");
		const core = new Core(root);
		await initializeTestProject(core, "Snapshot adoption");
		await core.createTaskFromInput({ title: "Snapshot adoption task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		await upsertAgentConfiguration(core, "project", {
			modes: {
				...getDefaultModeCatalog(),
				profiles: {
					...getDefaultModeCatalog().profiles,
					plan: { ...requireModeProfile(getDefaultModeCatalog().profiles.plan), prompt: "original mode prompt" },
				},
			},
			selectedPreset: "original",
			presets: {
				original: {
					command: "original-harness",
					env: { SNAPSHOT_VALUE: "original", AGENTIC_WORKSPACE_WORKTREE_DIR: "/ignored-preset-path" },
					prepare:
						"printf '%s' \"$AGENTIC_WORKSPACE_PROJECT_DIR|$AGENTIC_WORKSPACE_WORKTREE_DIR|$AGENTIC_WORKSPACE_TASK_DIR\"",
					bootstrap: "pi",
				},
			},
		});
		const harness = new SnapshotHarness();
		const service = new AgentSessionService(core, {
			runner: harness,
			tmuxServer: harness,
			workspaceContext: async () => ({ v: 2, paneId: "%workspace", rootDir: root }),
		});
		const reservation = await service.registerPendingSession(
			"task-1",
			{ modeId: "plan" },
			{ v: 2, paneId: "%workspace", rootDir: root },
		);
		expect(reservation.nativeSessionId).toBeUndefined();
		const originalCwd = reservation.cwd;
		const canonicalTaskDir = await coreFileSystem(core).taskArtifacts.containerPath("task-1");
		expect(reservation.pathContext).toEqual({ projectDir: root, worktreeDir: originalCwd, taskDir: canonicalTaskDir });
		const prepareCommand =
			"printf '%s' \"$AGENTIC_WORKSPACE_PROJECT_DIR|$AGENTIC_WORKSPACE_WORKTREE_DIR|$AGENTIC_WORKSPACE_TASK_DIR\"";
		await updateAgentConfiguration(core, "project", (configuration) => ({
			...configuration,
			selectedPreset: "replacement",
			presets: {
				original: {
					command: "replacement-harness",
					env: { SNAPSHOT_VALUE: "replacement", AGENTIC_WORKSPACE_WORKTREE_DIR: "/ignored-preset-path" },
					prepare: prepareCommand,
					bootstrap: "pi",
				},
				replacement: { command: "unused-selected-harness", env: {}, prepare: "", bootstrap: "pi" },
			},
			modes: configuration.modes
				? {
						...configuration.modes,
						profiles: {
							...configuration.modes.profiles,
							plan: {
								...requireModeProfile(configuration.modes.profiles.plan),
								prompt: "replacement mode prompt",
							},
						},
					}
				: undefined,
		}));

		const adopted = await service.adoptPendingSession("task-1", reservation.id);
		expect(adopted.record.preset).toBe("original");
		expect(adopted.record.pathContext).toEqual(reservation.pathContext);
		expect(adopted.record.nativeSessionId).toBeString();
		expect(adopted.record.cwd).toBe(originalCwd);
		const launch = harness.launches.at(-1) ?? "";
		expect(launch).toContain(adopted.record.nativeSessionId as string);
		expect(launch).toContain("replacement-harness");
		const prepareIndex = harness.commands.findIndex((args) => args[0] === "/bin/sh" && args[1] === "-lc");
		expect(prepareIndex).toBeGreaterThanOrEqual(0);
		expect(harness.environments[prepareIndex]).toMatchObject({
			AGENTIC_WORKSPACE_PROJECT_DIR: root,
			AGENTIC_WORKSPACE_WORKTREE_DIR: originalCwd,
			AGENTIC_WORKSPACE_TASK_DIR: canonicalTaskDir,
			SNAPSHOT_VALUE: "replacement",
		});
		expect(launch).not.toContain("original-harness");
		const profilePath = launch.match(/\/[^'"\s]+\/profile-bootstrap\.md/)?.[0];
		if (!profilePath) throw new Error("Missing execution profile bootstrap");
		const profileText = await Bun.file(profilePath).text();
		expect(profileText).toContain("Active task:");
		expect(profileText).toContain("replacement mode prompt");
		await service.finishNativeSession(reservation.taskId, reservation.id, {
			record: structuredClone(adopted.record),
			paneId: adopted.paneId,
		});
		await service.ask(reservation.taskId, "verify saved environment", { sessionId: reservation.id });
		expect(harness.environments.at(-1)).toMatchObject({
			AGENTIC_WORKSPACE_PROJECT_DIR: root,
			AGENTIC_WORKSPACE_WORKTREE_DIR: originalCwd,
			AGENTIC_WORKSPACE_TASK_DIR: canonicalTaskDir,
			SNAPSHOT_VALUE: "replacement",
		});

		expect(
			harness.commands.filter((args) => args[0] === "/bin/sh" && args[1] === "-lc" && args[2] === prepareCommand),
		).toHaveLength(1);
	});
});
