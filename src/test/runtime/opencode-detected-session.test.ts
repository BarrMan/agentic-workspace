import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TmuxCommandError } from "libtmux";
import { Core } from "../../controller/agentic-workspace.ts";
import * as processTree from "../../lib/process-tree.ts";
import type { ProcessRunner, TmuxServer } from "../../runtime/sessions.ts";
import { getDefaultModeCatalog, initializeAgentConfiguration, upsertAgentConfiguration } from "../../storage/config.ts";
import { SessionStore } from "../../storage/session-store.ts";
import { disableHarnessReadiness } from "../agent-test-helpers.ts";
import { initializeTestProject } from "../test-utils.ts";

mock.module("../../lib/process-tree.ts", () => ({
	...processTree,
	terminateProcessTree: async (pid: number) => {
		process.kill(pid, "SIGTERM");
		return "terminated";
	},
}));
const { AgentSessionService } = await import("../../runtime/sessions.ts");

let restoreHarnessReadiness: (() => void) | undefined;
beforeAll(() => {
	restoreHarnessReadiness = disableHarnessReadiness();
});
afterAll(() => restoreHarnessReadiness?.());

class Runner implements ProcessRunner {
	readonly commands: string[][] = [];

	async run(args: string[]) {
		this.commands.push(args);
		return { exitCode: 0, stdout: "", stderr: "" };
	}
}

class LaunchServer implements TmuxServer {
	readonly launches: string[] = [];
	readonly metadata = new Map<string, Record<string, string>>();
	readonly sessionNames = new Map<string, string>();
	readonly paneHandles = new Map<string, NonNullable<Awaited<ReturnType<TmuxServer["newSession"]>>["activePane"]>>();
	private nextPane = 0;
	async cmd(command: string, args: readonly string[] = []): Promise<readonly string[]> {
		if (command === "has-session") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			const name = target.slice(1);
			if ([...this.sessionNames.values()].includes(name)) return [];
			throw new TmuxCommandError({ args: [command, ...args], exitCode: 1, target, stderr: [] });
		}
		if (command === "list-panes") {
			const hasTarget = args.includes("-t");
			const target = args[args.indexOf("-t") + 1] ?? "";
			const name = /^=(.+):$/.exec(target)?.[1];
			const panes = name
				? [...this.sessionNames].filter(([, sessionName]) => sessionName === name)
				: hasTarget
					? [...this.sessionNames].filter(([id]) => id === target)
					: [...this.sessionNames];
			if (hasTarget && !panes.length)
				throw new TmuxCommandError({
					args: [command, ...args],
					exitCode: 1,
					target,
					stderr: [name ? `can't find session: ${name}` : `can't find pane: ${target}`],
				});
			const format = args[args.indexOf("-F") + 1] ?? "#{pane_id}";
			return panes.map(([id, sessionName]) =>
				format.replace(
					/#\{([^}]+)\}/g,
					(_match, key: string) =>
						({
							...this.metadata.get(id),
							session_name: sessionName,
							pane_id: id,
							window_id: "@1",
							pane_pid: "4242",
							pane_dead: "0",
							pane_title: this.metadata.get(id)?.pane_title ?? "",
						})[key] ?? "",
				),
			);
		}
		if (command === "set-option") {
			const paneId = args[args.indexOf("-t") + 1] ?? "";
			const unset = args.includes("-u");
			const key = unset ? (args.at(-1) ?? "") : (args.at(-2) ?? "");
			const metadata = this.metadata.get(paneId) ?? {};
			if (unset) delete metadata[key];
			else metadata[key] = args.at(-1) ?? "";
			this.metadata.set(paneId, metadata);
			return [];
		}
		if (command === "display-message") {
			const target = args[args.indexOf("-t") + 1] ?? "";
			if (args.includes("#{pane_pid} #{pane_dead}")) {
				if (!this.sessionNames.has(target))
					throw new TmuxCommandError({
						args: [command, ...args],
						exitCode: 1,
						target,
						stderr: [`can't find pane: ${target}`],
					});
				return ["4242 0"];
			}
			if (args.some((arg) => arg.includes("@agentic_workspace_launch_resources"))) {
				if (!this.sessionNames.has(target))
					throw new TmuxCommandError({
						args: [command, ...args],
						exitCode: 1,
						target,
						stderr: [`can't find pane: ${target}`],
					});
				return [this.metadata.get(target)?.["@agentic_workspace_launch_resources"] ?? ""];
			}
		}
		return [];
	}
	async panes() {
		return this.paneHandles.values();
	}
	clear(): void {
		this.sessionNames.clear();
		this.metadata.clear();
		this.paneHandles.clear();
	}
	async newSession(options: { name?: string } = {}) {
		const id = `%${++this.nextPane}`;
		this.metadata.set(id, {});
		this.sessionNames.set(id, options.name ?? "");
		const activePane = {
			id,
			window: { setOption: async () => {} },
			setOption: async (name: string, value: string) => {
				const metadata = this.metadata.get(id) ?? {};
				metadata[name] = value;
				this.metadata.set(id, metadata);
			},
			setTitle: async () => {},
			pipeTo: async () => {},
			respawn: async (command?: string) => {
				if (command) this.launches.push(command);
			},
			displayMessage: async (message: string) => (message === "#{pane_id} #{pane_dead}" ? [`${id} 0`] : ["0"]),
			kill: async () => {
				this.metadata.delete(id);
				this.sessionNames.delete(id);
				this.paneHandles.delete(id);
			},
		};
		this.paneHandles.set(id, activePane);
		return { activePane };
	}
}

describe("runtime OpenCode adapter selection", () => {
	const roots: string[] = [];
	const originalXdg = process.env.XDG_CONFIG_HOME;
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
		if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = originalXdg;
	});

	it("keeps only the preset name and resolves the executable again for resume and ask", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-opencode-detected-session-"));
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "isolated-config-home");
		const command = join(root, "opencode-version.ts");
		const versionFile = join(root, "version");
		await writeFile(versionFile, "opencode v2.1.0");
		await writeFile(
			command,
			`#!/usr/bin/env bun
import { readFileSync } from "node:fs";
if (process.argv.includes("--version")) console.log(readFileSync(${JSON.stringify(versionFile)}, "utf8"));
else if (process.argv.includes("api")) console.log(JSON.stringify({ data: { id: process.argv.at(-1).split("/").at(-1) } }));
else if (process.argv.includes("serve")) {
  const port = Number(process.argv[process.argv.indexOf("--port") + 1]);
  const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: async (request) => {
    const body = request.method === "POST" ? await request.json() : {};
    return Response.json({ data: { id: body.id ?? "" } });
  } });
  process.on("SIGTERM", () => { server.stop(true); process.exit(0); });
  setInterval(() => {}, 1000);
}
`,
		);
		await chmod(command, 0o700);
		const core = new Core(root);
		await initializeTestProject(core, "Detected OpenCode session");
		await core.createTaskFromInput({ title: "Detected OpenCode task", status: "To Do" });
		await initializeAgentConfiguration(core, "project");
		await upsertAgentConfiguration(core, "project", {
			modes: getDefaultModeCatalog(),
			selectedPreset: "opencode",
			presets: { opencode: { command: [command], env: {}, prepare: "", bootstrap: "opencode" } },
		});
		const runner = new Runner();
		const server = new LaunchServer();
		let service = new AgentSessionService(core, { runner, tmuxServer: server });

		const launched = await service.prepareNativeSession("task-1", undefined, "build");
		expect(launched.record.preset).toBe("opencode");
		expect(launched.bootstrap).toBe("opencode-v2");
		for (const key of ["presetSnapshot", "configScope", "createdWith", "harness", "agent"])
			expect(Object.keys(launched.record)).not.toContain(key);
		const nativeId = launched.record.nativeSessionId;
		expect(server.launches.at(-1)).toContain("--standalone --session");
		await service.finishNativeSession(launched.record.taskId, launched.record.id, {
			record: structuredClone(launched.record),
			paneId: launched.paneId,
		});
		server.clear();
		service = new AgentSessionService(core, { runner, tmuxServer: server });

		const store = new SessionStore(root, runner);
		const v2 = await service.prepareNativeSession("task-1", launched.record.id);
		expect(v2.bootstrap).toBe("opencode-v2");
		expect(v2.record.nativeSessionId).toBe(nativeId);
		expect(server.launches.at(-1)).toContain("--standalone --session");
		await service.finishNativeSession(launched.record.taskId, launched.record.id, {
			record: structuredClone(v2.record),
			paneId: v2.paneId,
		});
		server.clear();
		service = new AgentSessionService(core, { runner, tmuxServer: server });
		await writeFile(versionFile, "1.19.0");
		const v1 = await service.prepareNativeSession("task-1", launched.record.id);
		expect(v1.bootstrap).toBe("opencode-v1");
		expect(v1.record.nativeSessionId).toBe(nativeId);
		expect(server.launches.at(-1)).toContain("--session");
		expect(server.launches.at(-1)).not.toContain("--standalone");
		await service.finishNativeSession(launched.record.taskId, launched.record.id, {
			record: structuredClone(v1.record),
			paneId: v1.paneId,
		});
		server.clear();
		service = new AgentSessionService(core, { runner, tmuxServer: server });
		await service.ask("task-1", "fixture-only question", { sessionId: launched.record.id });
		expect(runner.commands.at(-1)?.join(" ")).toContain(nativeId);
		expect(runner.commands.at(-1)?.join(" ")).not.toContain("--standalone");
		await writeFile(versionFile, "opencode v2.1.0");
		await service.ask("task-1", "fixture-only question", { sessionId: launched.record.id });
		expect(runner.commands.at(-1)?.join(" ")).toContain("run --standalone --session");
		const persisted = JSON.parse(await Bun.file((await store.paths("task-1")).statePath).text());
		expect(persisted.modes.build.sessions[0].preset).toBe("opencode");
		expect(persisted.modes.build.sessions[0].nativeSessionId).toBe(nativeId);
	});
});
