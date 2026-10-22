import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as sysprims from "@3leaps/sysprims";
import { TmuxCommandError } from "libtmux";
import type { AgentSession } from "../../model/session/types.ts";
import { preparedLaunchResources } from "../../runtime/completion-supervisor-resources.ts";
import { ConclusiveStartupFailureError } from "../../runtime/errors/sessions.ts";
import type { ProcessRunner, TmuxServer } from "../../runtime/session-process.ts";
import { Storage } from "../../storage/storage.ts";

let resourceMarker = "";
const { SessionProcess } = await import("../../runtime/session-process.ts");

async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("Expected promise to reject");
}

describe("persisted prepared launch resources", () => {
	const roots: string[] = [];
	afterEach(async () => {
		mock.restore();
		await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
		resourceMarker = "";
	});

	async function fixture() {
		const table = sysprims.processList();
		spyOn(sysprims, "processList").mockReturnValue({ ...table, processes: [] });
		const createdRoot = await mkdtemp(join(tmpdir(), "agentic-workspace-resource-root-"));
		roots.push(createdRoot);
		const root = await realpath(createdRoot);
		const storage = Storage.open(root);
		const stateRoot = await storage.sessionStore().stateRoot;
		const taskDir = join(stateRoot, "TASK-1");
		await mkdir(taskDir, { recursive: true });
		const outputPath = join(taskDir, "session.log");
		const bootstrapPath = join(taskDir, "session.md");
		await writeFile(outputPath, "durable output");
		await writeFile(bootstrapPath, "durable bootstrap");
		const skill = await mkdtemp(join(tmpdir(), "agentic-workspace-agent-skill-"));
		roots.push(skill);
		const resources = await preparedLaunchResources(skill);
		resourceMarker = join(resources.skill.path, ".agentic-workspace-launch-owner");
		const session: AgentSession = {
			id: "resource-session",
			taskId: "TASK-1",
			preset: "opencode",
			tmuxName: "agentic-workspace-task-1-resource",
			nativeSessionId: "native-resource-session",
			cwd: root,
			createdAt: "2026-10-12T00:00:00.000Z",
			nativeWorkspace: true,
			outputPath,
			bootstrapPath,
		};
		const options = new Map<string, string>([
			["@agentic_workspace_root", root],
			["@agentic_workspace_task", session.taskId],
			["@agentic_workspace_session", session.id],
			["@agentic_workspace_role", "live-preview"],
		]);
		const events: string[] = [];
		let paneExists = true;
		let paneDead = false;
		let malformedPaneProbe = false;
		let malformedPaneProbeOnRespawn = false;
		let paneDeadOnRespawn = false;
		let paneDeadAfterMs: number | undefined;
		let currentPaneId = "%731";
		let changePaneIdOnRespawn = false;
		let disappearPaneOnRespawn = false;
		let delayProbeOnRespawn = false;
		let respawned = false;
		const probeTimeouts: number[] = [];
		let inventoryRows: readonly string[] | undefined;
		const pane = {
			id: "%731",
			window: { setOption: async () => {} },
			setOption: async (name: string, value: string) => {
				events.push(`option:${name}`);
				options.set(name, value);
			},
			setTitle: async () => {},
			pipeTo: async () => events.push("capture"),
			respawn: async () => {
				events.push("respawn");
				respawned = true;
				if (changePaneIdOnRespawn) currentPaneId = "%732";
				if (disappearPaneOnRespawn) paneExists = false;
				paneDead = paneDeadOnRespawn;
				malformedPaneProbe = malformedPaneProbeOnRespawn;
				if (paneDeadAfterMs !== undefined) setTimeout(() => (paneDead = true), paneDeadAfterMs);
			},
			displayMessage: async (message: string) => (message.includes("pane_dead") ? [paneDead ? "1 42" : "0 0"] : []),
			kill: async () => {
				const resourcePresent = await readFile(resourceMarker, "utf8").then(
					() => true,
					() => false,
				);
				events.push(`kill-pane:resource-${resourcePresent ? "present" : "absent"}`);
				paneExists = false;
				options.clear();
			},
		};
		const server = {
			newSession: async () => {
				events.push("create");
				paneExists = true;
				options.clear();
				return { activePane: pane };
			},
			panes: async () => (paneExists ? [pane] : []),
			cmd: async (command: string, args: readonly string[], cmdOptions?: { timeoutMs?: number | null }) => {
				if (command === "list-sessions") return paneExists ? [session.tmuxName] : [];
				if (command === "list-panes") {
					if (respawned && delayProbeOnRespawn) {
						const timeoutMs = cmdOptions?.timeoutMs;
						if (typeof timeoutMs === "number") probeTimeouts.push(timeoutMs);
						await Bun.sleep(typeof timeoutMs === "number" ? timeoutMs : 1_000);
						throw new Error("startup pane probe deadline exceeded");
					}
					if (!paneExists)
						throw new TmuxCommandError({
							args: [command, ...args],
							exitCode: 1,
							stderr: [`can't find session: ${session.tmuxName}`],
							target: `=${session.tmuxName}:`,
						});
					const format = args.at(-1);
					const values: Record<string, string> = {
						"#{pane_id}": currentPaneId,
						"#{session_name}": session.tmuxName,
						"#{@agentic_workspace_root}": options.get("@agentic_workspace_root") ?? "",
						"#{@agentic_workspace_task}": options.get("@agentic_workspace_task") ?? "",
						"#{@agentic_workspace_session}": options.get("@agentic_workspace_session") ?? "",
						"#{@agentic_workspace_role}": options.get("@agentic_workspace_role") ?? "",
						"#{pane_dead}": malformedPaneProbe ? "unknown" : paneDead ? "1" : "0",
					};
					if (format && format in values) return [values[format]!];
					return [
						[
							session.tmuxName,
							options.get("@agentic_workspace_root"),
							options.get("@agentic_workspace_task"),
							options.get("@agentic_workspace_session"),
							options.get("@agentic_workspace_role"),
							currentPaneId,
							malformedPaneProbe ? "unknown" : paneDead ? "1" : "0",
						].join("\t"),
					];
				}
				if (command === "has-session" && paneExists) return [session.tmuxName];
				if (command === "has-session")
					throw new TmuxCommandError({
						args: [command, ...args],
						exitCode: 1,
						stderr: [`can't find session: ${session.tmuxName}`],
						target: `=${session.tmuxName}`,
					});
				if (command === "display-message" && args.at(-1) === "#{@agentic_workspace_launch_resources}")
					return inventoryRows ?? [options.get("@agentic_workspace_launch_resources") ?? ""];
				if (command === "display-message" && args.at(-1) === "#{pane_pid}") return ["4242"];
				return [""];
			},
		} as unknown as TmuxServer;
		const runner: ProcessRunner = {
			run: async () => {
				throw new Error("Fake resource tests must not run processes");
			},
		};
		const makeProcess = () =>
			new SessionProcess(runner, { projectRoot: root, stateRoot: () => storage.sessionStore().stateRoot }, server);
		const launch = {
			command: "fake-agent",
			env: {},
			resources,
			cleanup: async () => {
				events.push("unsafe-cleanup-callback");
			},
		};
		return {
			root,
			stateRoot,
			outputPath,
			bootstrapPath,
			skill,
			resources,
			session,
			options,
			events,
			pane,
			server,
			makeProcess,
			launch,
			removePane: () => {
				paneExists = false;
				options.clear();
			},
			setInventoryRows: (rows: readonly string[]) => {
				inventoryRows = rows;
			},
			setPaneDeadOnRespawn: () => {
				paneDeadOnRespawn = true;
			},
			setPaneDeadAfter: (delay: number) => {
				paneDeadAfterMs = delay;
			},
			setMalformedPaneProbe: () => {
				malformedPaneProbeOnRespawn = true;
			},
			setPaneIdChangeOnRespawn: () => {
				changePaneIdOnRespawn = true;
			},
			setPaneDisappearOnRespawn: () => {
				disappearPaneOnRespawn = true;
			},
			setProbeDelayOnRespawn: () => {
				delayProbeOnRespawn = true;
			},
			probeTimeouts,
		};
	}

	it("persists validated inventory before respawn and a fresh instance stops from that inventory", async () => {
		const f = await fixture();
		await f.makeProcess().launchPrepared(f.session, f.launch);
		expect(f.events.indexOf("option:@agentic_workspace_launch_resources")).toBeLessThan(f.events.indexOf("respawn"));
		const stored = JSON.parse(f.options.get("@agentic_workspace_launch_resources") ?? "null");
		expect(stored).toEqual(f.resources);
		const release = f.makeProcess();
		await release.kill(f.session);
		expect(f.events).toContain("kill-pane:resource-absent");
		await expect(readFile(f.resources.skill.path)).rejects.toMatchObject({ code: "ENOENT" });
		expect(f.events).not.toContain("unsafe-cleanup-callback");
		expect(await readFile(f.outputPath, "utf8")).toBe("durable output");
		expect(await readFile(f.bootstrapPath, "utf8")).toBe("durable bootstrap");
	});

	it("uses its validated local inventory if pane metadata disappears", async () => {
		const f = await fixture();
		const process = f.makeProcess();
		await process.launchPrepared(f.session, f.launch);
		f.options.delete("@agentic_workspace_launch_resources");
		f.events.length = 0;
		await process.kill(f.session);
		await expect(readFile(f.resources.skill.path)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("cleans local inventory and releases reservation when the exact instance is absent", async () => {
		const f = await fixture();
		const process = f.makeProcess();
		await process.launchPrepared(f.session, f.launch);
		f.removePane();
		await process.kill(f.session);
		await expect(readFile(f.resources.skill.path)).rejects.toMatchObject({ code: "ENOENT" });
		expect(f.events).not.toContain("kill-pane:resource-absent");
	});

	it("releases the local launch reservation after successful outgoing teardown", async () => {
		const f = await fixture();
		const process = f.makeProcess();
		await process.launchPrepared(f.session, f.launch);
		await process.kill(f.session);
		await process.create(f.session, {});
		await process.preparePane(f.session);
		await process.launchPrepared(f.session, f.launch);
		expect(f.events.filter((event) => event === "respawn")).toHaveLength(2);
	});

	it("treats an early non-127 pane exit as failed startup", async () => {
		const f = await fixture();
		f.setPaneDeadOnRespawn();
		const error = await rejection(f.makeProcess().launchPrepared(f.session, f.launch));
		expect(error).toBeInstanceOf(ConclusiveStartupFailureError);
		expect(error).toMatchObject({ message: expect.stringContaining("failed to launch") });
	});

	it("detects an early exit after the first startup observation", async () => {
		const f = await fixture();
		f.setPaneDeadAfter(60);
		const error = await rejection(f.makeProcess().launchPrepared(f.session, f.launch));
		expect(error).toBeInstanceOf(ConclusiveStartupFailureError);
		expect(error).toMatchObject({ message: expect.stringContaining("failed to launch") });
	});

	it("classifies a disappeared owned pane as conclusive startup failure", async () => {
		const f = await fixture();
		f.setPaneDisappearOnRespawn();
		const error = await rejection(f.makeProcess().launchPrepared(f.session, f.launch));
		expect(error).toBeInstanceOf(ConclusiveStartupFailureError);
	});

	it("leaves launch inventory untouched when the owned startup probe is malformed", async () => {
		const f = await fixture();
		f.setMalformedPaneProbe();
		const error = await rejection(f.makeProcess().launchPrepared(f.session, f.launch));
		expect(error).toMatchObject({ message: expect.stringContaining("ownership does not match") });
		expect(error).not.toBeInstanceOf(ConclusiveStartupFailureError);
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(true);
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
		expect(f.events.some((event) => event.startsWith("kill-pane:"))).toBe(false);
	});

	it("bounds the startup observation itself and preserves resources on transport timeout", async () => {
		const f = await fixture();
		f.setProbeDelayOnRespawn();
		const error = await rejection(f.makeProcess().launchPrepared(f.session, f.launch));
		expect(error).toMatchObject({ message: expect.stringContaining("startup pane probe deadline exceeded") });
		expect(error).not.toBeInstanceOf(ConclusiveStartupFailureError);
		expect(f.probeTimeouts).toHaveLength(1);
		expect(f.probeTimeouts[0]).toBeGreaterThan(0);
		expect(f.probeTimeouts[0]).toBeLessThanOrEqual(250);
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(true);
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
		expect(f.events.some((event) => event.startsWith("kill-pane:"))).toBe(false);
	});

	it("rejects a changed owned pane ID during startup probing", async () => {
		const f = await fixture();
		f.setPaneIdChangeOnRespawn();
		const error = await rejection(f.makeProcess().launchPrepared(f.session, f.launch));
		expect(error).toMatchObject({ message: expect.stringContaining("pane changed during probe") });
		expect(error).not.toBeInstanceOf(ConclusiveStartupFailureError);
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(true);
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
	});

	it("still explicitly stops a pane with no declared resource inventory", async () => {
		const f = await fixture();
		await f.makeProcess().kill(f.session);
		expect(f.events).toContain("kill-pane:resource-present");
	});

	it("retains resources and inventory when respawn acknowledgement is lost", async () => {
		const f = await fixture();
		f.pane.respawn = async () => {
			f.events.push("respawn");
			throw new Error("lost respawn ACK");
		};
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
		const error = await rejection(f.makeProcess().launchPrepared(f.session, f.launch));
		expect(error).toMatchObject({ message: expect.stringContaining("lost respawn ACK") });
		expect(error).not.toBeInstanceOf(ConclusiveStartupFailureError);
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(true);
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
		expect(f.events).not.toContain("unsafe-cleanup-callback");
	});

	it.each([
		{ rows: [] },
		{ rows: ["{}", "{}"] },
	])("refuses malformed-row inventory reads before cleanup or pane kill", async ({ rows }) => {
		const f = await fixture();
		await f.makeProcess().launchPrepared(f.session, f.launch);
		const persisted = f.options.get("@agentic_workspace_launch_resources");
		f.setInventoryRows(rows);
		await expect(f.makeProcess().kill(f.session)).rejects.toThrow("expected exactly one row");
		expect(f.options.get("@agentic_workspace_launch_resources")).toBe(persisted);
		expect(f.events).not.toContain("kill-pane:resource-absent");
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
	});

	it.each([
		{ inventory: "{broken" },
		{ inventory: JSON.stringify({ skill: { path: "/untrusted" } }) },
		{
			inventory: (resources: Awaited<ReturnType<typeof preparedLaunchResources>>) =>
				JSON.stringify({ ...resources, skill: { ...resources.skill, marker: "f".repeat(64) } }),
			error: "ownership marker changed",
		},
	])("refuses malformed or replaced inventory before pane destruction", async ({ inventory, error }) => {
		const f = await fixture();
		const persisted = typeof inventory === "function" ? inventory(f.resources) : inventory;
		f.options.set("@agentic_workspace_launch_resources", persisted);
		const kill = f.makeProcess().kill(f.session);
		if (error) await expect(kill).rejects.toThrow(error);
		else await expect(kill).rejects.toThrow();
		expect(f.options.get("@agentic_workspace_launch_resources")).toBe(persisted);
		expect(f.events.some((event) => event.startsWith("kill-pane:"))).toBe(false);
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
	});

	it("leaves the pane live with inventory on validation failure and retries from a fresh process", async () => {
		const f = await fixture();
		f.options.set("@agentic_workspace_launch_resources", JSON.stringify(f.resources));
		await writeFile(join(f.skill, ".agentic-workspace-launch-owner"), "replaced");
		await expect(f.makeProcess().kill(f.session)).rejects.toThrow("ownership marker changed");
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(true);
		expect(f.events).not.toContain("kill-pane:resource-present");
		await writeFile(join(f.skill, ".agentic-workspace-launch-owner"), f.resources.skill.marker);
		await f.makeProcess().kill(f.session);
		await expect(readFile(f.resources.skill.path)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("retries a successful resource cleanup after tmux kill failure", async () => {
		const f = await fixture();
		f.options.set("@agentic_workspace_launch_resources", JSON.stringify(f.resources));
		f.pane.kill = async () => {
			throw new Error("tmux kill denied");
		};
		await expect(f.makeProcess().kill(f.session)).rejects.toThrow(
			"resources were cleaned, but tmux pane teardown failed",
		);
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(true);
		expect(f.events).not.toContain("kill-pane:resource-present");
		await expect(readFile(f.resources.skill.path)).rejects.toMatchObject({ code: "ENOENT" });
		f.pane.kill = async () => {
			f.events.push("kill-pane:resource-absent");
			f.removePane();
		};
		await f.makeProcess().kill(f.session);
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(false);
	});

	it("does not clean resources or release reservation for arbitrary errors with missing-like text", async () => {
		const f = await fixture();
		const process = f.makeProcess();
		await process.launchPrepared(f.session, f.launch);
		f.server.cmd = async () => {
			throw new Error(`transport failure: can't find session ${f.session.tmuxName}`);
		};
		await expect(process.kill(f.session)).rejects.toThrow("can't find session");
		expect(f.options.has("@agentic_workspace_launch_resources")).toBe(true);
		expect(await readFile(join(f.resources.skill.path, ".agentic-workspace-launch-owner"), "utf8")).toBe(
			f.resources.skill.marker,
		);
		expect(f.events).not.toContain("kill-pane:resource-absent");
	});
});
