import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { loadAgentConfiguration, upsertAgentConfiguration } from "../agent-workspace/config.ts";
import { MODE_TEXT_COLORS } from "../agent-workspace/mode-colors.ts";
import { BunRunner } from "../agent-workspace/session-process.ts";
import { SessionStore } from "../agent-workspace/session-store.ts";
import { AgentSessionService } from "../agent-workspace/sessions.ts";
import type { AgentConfiguration, AgentSession } from "../agent-workspace/types.ts";
import { WorkspaceStateService } from "../agent-workspace/workspace-state.ts";
import { Core } from "../core/agentic-workspace.ts";
import { mountOpenTuiWorkspace, type OpenTuiWorkspaceOptions } from "../ui/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { initializeTestProject } from "./test-utils.ts";

function initialConfiguration(): AgentConfiguration {
	return {
		selectedPreset: "contract",
		presets: {
			contract: {
				command: "false {prompt}",
				bootstrap: "claude",
				env: { RAW: "kept=exact" },
				prepare: "kept",
				resumeFlag: "--resume",
			},
		},
		sessions: { worktreePerTask: false, yoloMode: false },
		modes: {
			version: 1,
			defaultModeId: "plan",
			order: ["plan", "build"],
			profiles: {
				plan: {
					name: "PLAN",
					model: { kind: "default" },
					prompt: "Original prompt",
					permissions: { repository: "read", task: "read", artifacts: "read", subagents: "allowed" },
					artifacts: [{ path: "plan.md", purpose: "original purpose" }],
					approvalArtifact: "plan.md",
				},
				build: {
					name: "BUILD",
					model: { kind: "default" },
					prompt: "Build",
					permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "disabled" },
					artifacts: [],
				},
			},
		},
	};
}

describe("real WorkspaceController Settings persistence", () => {
	const cleanups: Array<() => Promise<void>> = [];
	afterEach(async () => {
		for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	});

	async function fixture(pinExternalRoot = false) {
		const rootDir = await mkdtemp(join(tmpdir(), "settings-persistence-"));
		cleanups.push(async () => await rm(rootDir, { recursive: true, force: true }));
		const core = new Core(rootDir);
		await initializeTestProject(core, "Settings persistence");
		const { task } = await core.createTaskFromInput({ title: "Settings fixture", status: "To Do" });
		await upsertAgentConfiguration(core, "project", initialConfiguration());
		const path = core.filesystem.configFilePath;
		let workspaceState: WorkspaceStateService | undefined;
		if (pinExternalRoot) {
			const storageHome = await mkdtemp(join(tmpdir(), "settings-pinned-home-"));
			cleanups.push(async () => await rm(storageHome, { recursive: true, force: true }));
			const originalHome = process.env.HOME;
			const originalAgenticWorkspaceCwd = process.env.AGENTIC_WORKSPACE_CWD;
			const originalCwd = process.cwd();
			cleanups.push(async () => {
				process.chdir(originalCwd);
				if (originalHome === undefined) delete process.env.HOME;
				else process.env.HOME = originalHome;
				if (originalAgenticWorkspaceCwd === undefined) delete process.env.AGENTIC_WORKSPACE_CWD;
				else process.env.AGENTIC_WORKSPACE_CWD = originalAgenticWorkspaceCwd;
			});
			process.env.HOME = storageHome;
			const hash = createHash("sha256").update(core.filesystem.rootDir).digest("hex").slice(0, 16);
			workspaceState = new WorkspaceStateService(core, { stateRoot: join(storageHome, ".agentic-workspace", hash) });
			await workspaceState.stateRoot;
			process.env.HOME = join(storageHome, "changed-home");
			process.env.AGENTIC_WORKSPACE_CWD = storageHome;
			process.chdir(storageHome);
		}
		const setup = await createTestRenderer({ width: 160, height: 40, kittyKeyboard: true });
		const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(root);
		let workspace: OpenTuiWorkspaceOptions | undefined;
		const controller = new OpenTuiWorkspaceController(core, {
			workspaceState,
			runtime: {
				createHost: async () => ({ renderer: setup.renderer, root, destroy: () => setup.renderer.destroy() }),
				mountWorkspace: (renderer, parent, options) => {
					workspace = options;
					const mount = mountOpenTuiWorkspace(renderer, parent, options);
					return {
						...mount,
						update: (next) => {
							workspace = next;
							mount.update(next);
						},
					};
				},
				createActivityProbe: () => ({ probe: async () => new Map() }),
				isAgentAlive: async () => false,
			},
		});
		const running = controller.run();
		let runError: unknown;
		void running.catch((error: unknown) => {
			runError = error;
		});
		cleanups.push(async () => {
			controller.destroy();
			await running;
		});
		await eventually(async () => {
			if (runError) throw runError;
			return workspace !== undefined;
		});
		const open = async () => {
			workspace?.onSettingsRequest?.();
			await eventually(async () => {
				await setup.flush();
				return setup.captureCharFrame().includes("Settings") && setup.captureCharFrame().includes("Categories");
			});
		};
		const saved = async () =>
			await eventually(async () => {
				await setup.flush();
				const frame = setup.captureCharFrame();
				if (frame.includes("Error:")) throw new Error(frame.split("\n").slice(-4).join("\n").trim());
				return !frame.includes("Categories");
			});
		return {
			core,
			stateRoot: await workspaceState?.stateRoot,
			task,
			setup,
			path,
			open,
			saved,
			json: async () => core.filesystem.loadConfig().then((config) => config?.agentConfiguration as AgentConfiguration),
		};
	}
	async function eventually(predicate: () => Promise<boolean>) {
		for (let attempt = 0; attempt < 300; attempt++) {
			if (await predicate()) return;
			await Bun.sleep(10);
		}
		throw new Error("Settings integration condition did not settle");
	}
	function down(setup: TestRendererSetup, count = 1) {
		for (let i = 0; i < count; i++) setup.mockInput.pressArrow("down");
	}
	function clear(setup: TestRendererSetup) {
		setup.mockInput.pressKey("a", { ctrl: true });
		setup.mockInput.pressKey("k", { ctrl: true });
	}
	function modes(setup: TestRendererSetup) {
		down(setup, 2);
		setup.mockInput.pressEnter();
		setup.mockInput.pressEnter();
	}
	function save(setup: TestRendererSetup) {
		setup.mockInput.pressKey("s", { ctrl: true });
	}

	it("reuses the pinned root for view state and settings service after HOME/cwd change", async () => {
		const f = await fixture(true);
		const pinnedRoot = f.stateRoot;
		if (!pinnedRoot) throw new Error("Fixture did not pin a state root.");
		expect(await readFile(join(pinnedRoot, "view-state.json"), "utf8")).toContain('"state"');
		expect(existsSync(join(f.core.filesystem.rootDir, ".agentic-workspace", "view-state.json"))).toBe(false);
		const originalDelete = AgentSessionService.prototype.deleteMode;
		const deletion = spyOn(AgentSessionService.prototype, "deleteMode").mockImplementation(async function (
			this: AgentSessionService,
			modeId,
			destinationModeId,
		) {
			expect(await this.stateRoot).toBe(pinnedRoot);
			await originalDelete.call(this, modeId, destinationModeId);
		});
		try {
			await f.open();
			modes(f.setup);
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			save(f.setup);
			await f.saved();
			expect(deletion).toHaveBeenCalledTimes(1);
			expect((await f.json()).modes?.profiles.plan).toBeUndefined();
			expect(existsSync(join(f.core.filesystem.rootDir, ".agentic-workspace", "view-state.json"))).toBe(false);
		} finally {
			deletion.mockRestore();
		}
	});

	it("persists all mode fields and combined Agents/Sessions edits, then renders them after a config reload", async () => {
		const f = await fixture();
		await f.open();
		// Agents: choose the project preset, change command, resume flag and environment.
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressEnter();
		down(f.setup, 20);
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressTab();
		f.setup.mockInput.pressEnter();
		clear(f.setup);
		await f.setup.mockInput.typeText("false changed {prompt}");
		f.setup.mockInput.pressEnter();
		down(f.setup);
		f.setup.mockInput.pressEnter();
		clear(f.setup);
		await f.setup.mockInput.typeText("--continue");
		f.setup.mockInput.pressEnter();
		down(f.setup);
		f.setup.mockInput.pressEnter();
		clear(f.setup);
		await f.setup.mockInput.typeText("RAW=kept=exact");
		f.setup.mockInput.pressEnter({ shift: true });
		await f.setup.mockInput.typeText("NEW=value");
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressArrow("left");
		down(f.setup);
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressEnter();
		down(f.setup);
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressArrow("left");
		down(f.setup);
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressEnter();
		// Models use the real controller discovery callback and manual Claude selection.
		f.setup.mockInput.pressEnter();
		await f.setup.flush();
		await f.setup.mockInput.typeText("saved-model");
		f.setup.mockInput.pressEnter({ ctrl: true });
		await eventually(async () => {
			await f.setup.flush();
			return f.setup.renderer.currentFocusedRenderable?.id === "settings-mode-profile";
		});
		for (let i = 0; i < 4; i++) {
			down(f.setup);
			f.setup.mockInput.pressEnter();
		}
		down(f.setup);
		f.setup.mockInput.pressEnter();
		clear(f.setup);
		await f.setup.mockInput.typeText("Saved prompt");
		f.setup.mockInput.pressEnter();
		await f.setup.mockInput.typeText("Second line");
		f.setup.mockInput.pressEnter({ ctrl: true });
		down(f.setup);
		f.setup.mockInput.pressEnter();
		clear(f.setup);
		await f.setup.mockInput.typeText("result.md — saved purpose");
		f.setup.mockInput.pressEnter({ ctrl: true });
		down(f.setup);
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressEnter();
		clear(f.setup);
		await f.setup.mockInput.typeText("approved.md");
		f.setup.mockInput.pressEnter();
		expect(f.setup.renderer.currentFocusedRenderable?.id).toBe("settings-mode-profile");
		down(f.setup);
		f.setup.mockInput.pressEnter();
		down(f.setup, MODE_TEXT_COLORS.indexOf("brightgreen") + 1);
		f.setup.mockInput.pressEnter();
		await f.setup.flush();
		expect(f.setup.captureCharFrame()).toContain("Color: brightgreen");
		const before = await f.json();
		expect(before.modes?.profiles.plan?.prompt).toBe("Original prompt");
		save(f.setup);
		await f.saved();
		const raw = await f.json();
		expect(raw.modes?.profiles.plan).toMatchObject({
			model: { kind: "explicit", id: "saved-model" },
			prompt: "Saved prompt\nSecond line",
			permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "disabled" },
			artifacts: [{ path: "result.md", purpose: "saved purpose" }],
			approvalArtifact: "approved.md",
			textColor: "brightgreen",
		});
		expect(raw.presets.contract).toMatchObject({
			command: "false changed {prompt}",
			resumeFlag: "--continue",
			env: { RAW: "kept=exact", NEW: "value" },
			prepare: "kept",
			bootstrap: "claude",
		});
		expect(raw.sessions).toEqual({ worktreePerTask: true, yoloMode: true, autoResumeOnRestart: true });
		expect(await loadAgentConfiguration(f.core, "project")).toEqual(raw);
		await f.open();
		modes(f.setup);
		await f.setup.flush();
		for (const value of [
			"saved-model",
			"Saved prompt",
			"Second line",
			"result.md",
			"saved purpose",
			"approved.md",
			"brightgreen",
			"Repository: read-write",
			"Task: read-write",
			"Artifacts: read-write",
			"Subagents: disabled",
		])
			expect(f.setup.captureCharFrame()).toContain(value);
		f.setup.mockInput.pressEscape();
	});

	it("refuses session moves, then saves empty-mode deletion, added modes and color", async () => {
		const f = await fixture();
		const store = new SessionStore(f.core.filesystem.rootDir, new BunRunner());
		const session: AgentSession = {
			id: "persisted-session",
			taskId: f.task.id,
			preset: "contract",
			tmuxName: "test-stopped-settings",
			cwd: f.core.filesystem.rootDir,
			outputPath: join(f.core.filesystem.rootDir, "output.log"),
			bootstrapPath: join(f.core.filesystem.rootDir, "bootstrap.sh"),
			createdAt: "2026-10-10T10:00:00.000Z",
			status: "stopped",
		};
		await store.mutateMode(f.task.id, "plan", async (history) => {
			history.sessions.push(session);
			history.activeSessionId = session.id;
		});
		await f.open();
		modes(f.setup);
		f.setup.mockInput.pressKey("a");
		await f.setup.mockInput.typeText("REVIEW");
		f.setup.mockInput.pressEnter();
		down(f.setup, 8);
		f.setup.mockInput.pressEnter();
		down(f.setup, MODE_TEXT_COLORS.indexOf("brightblue") + 1);
		f.setup.mockInput.pressEnter();
		f.setup.mockInput.pressArrow("left");
		f.setup.mockInput.pressArrow("up");
		f.setup.mockInput.pressArrow("up");
		f.setup.mockInput.pressKey("d");
		await f.setup.flush();
		expect(f.setup.captureCharFrame()).toContain("1 owned sessions");
		f.setup.mockInput.pressEnter();
		expect((await store.readMode(f.task.id, "plan")).sessions.map((item) => item.id)).toEqual([session.id]);
		expect((await f.json()).modes?.profiles.review).toBeUndefined();
		save(f.setup);
		await eventually(async () => {
			await f.setup.flush();
			return f.setup.captureCharFrame().includes("sessions cannot change modes");
		});
		expect((await store.readMode(f.task.id, "plan")).sessions.map((item) => item.id)).toEqual([session.id]);
		expect((await f.json()).modes?.profiles.plan).toBeDefined();
		await store.remove(f.task.id, session.id);
		save(f.setup);
		await f.saved();
		const raw = await f.json();
		expect(raw.modes?.order).toEqual(["build", "review"]);
		expect(raw.modes?.defaultModeId).toBe("build");
		expect(raw.modes?.profiles.plan).toBeUndefined();
		expect(raw.modes?.profiles.review?.textColor).toBe("brightblue");
		expect((await store.readMode(f.task.id, "plan")).sessions).toEqual([]);
		expect((await store.readMode(f.task.id, "build")).sessions).toEqual([]);
		await f.open();
		modes(f.setup);
		await f.setup.flush();
		expect(f.setup.captureCharFrame()).toContain("REVIEW");
		expect(f.setup.captureCharFrame()).toContain("BUILD ● default");
	});

	it("keeps real serialization errors visible without closing, permits retry, and discards without writing", async () => {
		const f = await fixture();
		await f.open();
		modes(f.setup);
		down(f.setup);
		f.setup.mockInput.pressEnter();
		const original = await readFile(f.path, "utf8");
		await writeFile(f.path, "agent_configuration: 123\n");
		f.core.filesystem.invalidateConfigCache();
		save(f.setup);
		await eventually(async () => {
			await f.setup.flush();
			return f.setup.captureCharFrame().includes("Error:");
		});
		expect(f.setup.captureCharFrame()).toContain("Categories");
		expect(f.setup.captureCharFrame()).toContain("Invalid project agent configuration");
		expect(await readFile(f.path, "utf8")).toBe("agent_configuration: 123\n");
		await writeFile(f.path, original);
		f.core.filesystem.invalidateConfigCache();
		save(f.setup);
		await f.saved();
		expect((await f.json()).modes?.profiles.plan?.permissions.repository).toBe("read-write");
		await f.open();
		modes(f.setup);
		f.setup.mockInput.pressKey("a");
		await f.setup.mockInput.typeText("DISCARDED");
		f.setup.mockInput.pressEnter();
		const beforeDiscard = await readFile(f.path, "utf8");
		f.setup.mockInput.pressEscape();
		await f.saved();
		expect(await readFile(f.path, "utf8")).toBe(beforeDiscard);
		expect((await f.json()).modes?.profiles.discarded).toBeUndefined();
	});

	it("persists and reopens every mode field through the source entrypoint in an isolated real PTY", async () => {
		const rootDir = await mkdtemp(join(tmpdir(), "settings-binary-pty-"));
		cleanups.push(async () => await rm(rootDir, { recursive: true, force: true }));
		const core = new Core(rootDir);
		await initializeTestProject(core, "Settings binary PTY");
		await core.createTaskFromInput({ title: "PTY fixture", status: "To Do" });
		await upsertAgentConfiguration(core, "project", initialConfiguration());
		const command = getTestCliCommand();
		const script = String.raw`
import errno, fcntl, json, os, pty, re, select, struct, subprocess, sys, termios, time
runtime, cli, root = sys.argv[1], sys.argv[2], sys.argv[3]
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 160, 0, 0))
env = dict(os.environ, TERM="xterm-256color", AGENTIC_WORKSPACE_CWD=root)
for key in ("AGENTIC_WORKSPACE_WORKSPACE_CONTEXT", "AGENTIC_WORKSPACE_TASK_ID", "AGENTIC_WORKSPACE_SESSION_ID"):
    env.pop(key, None)
process = subprocess.Popen([runtime, cli, "workspace"], cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
output = ""
def pump(duration=0.15):
    global output
    end = time.monotonic() + duration
    while time.monotonic() < end:
        if select.select([master], [], [], max(0, end-time.monotonic()))[0]:
            try: data = os.read(master, 65536)
            except OSError as error:
                if error.errno == errno.EIO: break
                raise
            if not data: break
            output += data.decode("utf8", "replace")
            if b"\x1b[6n" in data: os.write(master, b"\x1b[1;1R")
def send(keys):
    os.write(master, keys.encode())
    pump()
def wait_for(text):
    deadline = time.monotonic() + 8
    while text not in output and time.monotonic() < deadline: pump(0.1)
    if text not in output: raise AssertionError("PTY missing " + text + ": " + output[-1500:])
down, enter, commit = "\x1b[B", "\r", "\x1b[13;5u"
def edit(text): send("\x01\x0b" + text)
try:
    wait_for("Settings")
    send(","); wait_for("Categories")
    send(down+down+enter+enter); wait_for("Model:")
    send(enter); wait_for("Choose model")
    send("pty-model"+commit)
    for _ in range(4): send(down+enter)
    send(down+enter); edit("PTY prompt"); send(commit)
    send(down+enter); edit("pty-result.md — PTY purpose"); send(commit)
    send(down+enter+enter); edit("pty-approved.md"); send(enter)
    send(down+enter); send(down*11+enter)
    send("\x1b[115;5u")
    path = sys.argv[-1]
    expected = {"model":{"kind":"explicit","id":"pty-model"}, "prompt":"PTY prompt", "permissions":{"repository":"read-write","task":"read-write","artifacts":"read-write","subagents":"disabled"}, "artifacts":[{"path":"pty-result.md","purpose":"PTY purpose"}], "approvalArtifact":"pty-approved.md", "textColor":"brightgreen"}
    deadline = time.monotonic()+5
    while True:
        with open(path) as file: persisted = json.loads(file.read().split("agent_configuration: ", 1)[1].splitlines()[0])["modes"]["profiles"]["plan"]
        if all(persisted.get(key)==value for key,value in expected.items()): break
        if time.monotonic() > deadline: raise AssertionError("PTY persisted mismatch: " + json.dumps(persisted) + "; " + output[-1000:])
        pump(0.1)
    output = ""
    send(","); wait_for("Categories")
    output = ""
    send(down+down+enter+enter); pump(0.3)
    rendered = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", output)
    checks = {text: text in rendered for text in ("pty-model","PTY prompt","pty-result.md","PTY purpose","pty-approved.md","brightgreen","Repository: read-write","Task: read-write","Artifacts: read-write","Subagents: disabled")}
    if not all(checks.values()): raise AssertionError("PTY reopen mismatch: " + json.dumps(checks) + "; " + rendered[-1000:])
    print(json.dumps({"persisted":persisted,"reopened":checks}))
finally:
    process.terminate()
    try: process.wait(timeout=3)
    except subprocess.TimeoutExpired: process.kill(); process.wait()
    os.close(master)
`;
		const child = Bun.spawn(["python3", "-c", script, ...command, rootDir, core.filesystem.configFilePath], {
			cwd: rootDir,
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = new Response(child.stdout).text();
		const stderr = new Response(child.stderr).text();
		const exitCode = await child.exited;
		const [result, errors] = await Promise.all([stdout, stderr]);
		if (exitCode !== 0) throw new Error(`Source entrypoint PTY failed: ${errors}`);
		const evidence = JSON.parse(result);
		expect(evidence.persisted).toMatchObject({
			model: { kind: "explicit", id: "pty-model" },
			prompt: "PTY prompt",
			textColor: "brightgreen",
			approvalArtifact: "pty-approved.md",
		});
		expect(Object.values(evidence.reopened).every((value) => value === true)).toBe(true);
		core.filesystem.invalidateConfigCache();
		expect((await loadAgentConfiguration(core, "project"))?.modes?.profiles.plan).toEqual(evidence.persisted);
	}, 30000);
});
