import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { loadAgentConfiguration, upsertAgentConfiguration } from "../controller/agent-configuration.ts";
import { Core } from "../controller/agentic-workspace.ts";
import { MODE_TEXT_COLORS } from "../model/session/mode-colors.ts";
import type { AgentConfiguration, AgentSession } from "../model/session/types.ts";
import { mountOpenTuiWorkspace, type OpenTuiWorkspaceOptions } from "../renderer/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../renderer/opentui/workspace-controller.ts";
import { getTestCliCommand } from "./test-cli.ts";
import { coreFileSystem, initializeTestProject } from "./test-utils.ts";

function initialConfiguration(): AgentConfiguration {
	return {
		selectedPreset: "contract",
		presets: {
			contract: {
				command: ["false", "{prompt}"],
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

	async function fixture(pinExternalRoot = false, configuration = initialConfiguration()) {
		const rootDir = await mkdtemp(join(tmpdir(), "settings-persistence-"));
		cleanups.push(async () => await rm(rootDir, { recursive: true, force: true }));
		const core = new Core(rootDir);
		await initializeTestProject(core, "Settings persistence");
		const { task } = await core.createTaskFromInput({ title: "Settings fixture", status: "To Do" });
		await upsertAgentConfiguration(core, "project", configuration);
		const path = coreFileSystem(core).configFilePath;
		let workspaceState: Core["workspaceState"] | undefined;
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
			workspaceState = core.workspaceState;
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
		const saved = async () => {
			for (let attempt = 0; attempt < 300; attempt++) {
				await setup.flush();
				const frame = setup.captureCharFrame();
				if (frame.includes("Error:")) throw new Error(frame.split("\n").slice(-4).join("\n").trim());
				if (!frame.includes("Categories")) return;
				await Bun.sleep(10);
			}
			throw new Error(`Settings did not close after save:\n${setup.captureCharFrame()}`);
		};
		return {
			core,
			stateRoot: await workspaceState?.stateRoot,
			task,
			setup,
			path,
			open,
			saved,
			json: async () =>
				coreFileSystem(core)
					.loadConfig()
					.then((config) => config?.agentConfiguration as AgentConfiguration),
		};
	}
	async function eventually(predicate: () => Promise<boolean>) {
		for (let attempt = 0; attempt < 300; attempt++) {
			if (await predicate()) return;
			await Bun.sleep(10);
		}
		throw new Error("Settings integration condition did not settle");
	}
	async function confirmModeDeletion(setup: TestRendererSetup) {
		for (let attempt = 0; attempt < 300; attempt++) {
			await setup.flush();
			if (setup.captureCharFrame().includes("Delete mode")) break;
			if (attempt === 299) throw new Error(`Mode deletion confirmation did not settle:\n${setup.captureCharFrame()}`);
			await Bun.sleep(10);
		}
		setup.mockInput.pressEnter();
		await setup.flush();
		await eventually(async () => {
			await setup.flush();
			return setup.captureCharFrame().includes("Choose an action");
		});
	}
	async function confirmMultiple(setup: TestRendererSetup, count: number) {
		for (let i = 0; i < count; i++) {
			await eventually(async () => {
				await setup.flush();
				return setup.captureCharFrame().includes("Delete mode");
			});
			setup.mockInput.pressEnter();
			await setup.flush();
		}
		await eventually(async () => {
			await setup.flush();
			return setup.captureCharFrame().includes("Choose an action");
		});
	}
	async function chooseModeDeletion(
		setup: TestRendererSetup,
		choice: "discard" | "build" | "review",
		expectedNextMode?: string,
	) {
		await eventually(async () => {
			await setup.flush();
			return setup.captureCharFrame().includes("Delete mode");
		});
		const steps = choice === "discard" ? 1 : 2;
		for (let i = 0; i < steps; i++) {
			setup.mockInput.pressArrow("down");
			await setup.flush();
		}
		expect(setup.captureCharFrame()).toContain(choice === "discard" ? "Discard sessions" : `Move to ${choice}`);
		setup.mockInput.pressKey("s", { ctrl: true });
		await eventually(async () => {
			await setup.flush();
			const frame = setup.captureCharFrame();
			if (expectedNextMode) return frame.includes(`Delete mode ${expectedNextMode}`);
			return !frame.includes("Delete mode ") || frame.includes("Error:");
		});
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
		const originalDelete = Core.prototype.deleteMode;
		const deletion = spyOn(Core.prototype, "deleteMode").mockImplementation(async function (
			this: Core,
			modeId,
			options,
		) {
			expect(await this.workspaceState.stateRoot).toBe(pinnedRoot);
			return await originalDelete.call(this, modeId, options);
		});
		try {
			await f.open();
			modes(f.setup);
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			save(f.setup);
			await confirmModeDeletion(f.setup);
			await chooseModeDeletion(f.setup, "discard");
			await f.saved();
			expect(deletion).toHaveBeenCalledTimes(1);
			expect((await f.json()).modes?.profiles.plan).toBeUndefined();
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
		await f.setup.mockInput.typeText('["false","changed","{prompt}"]');
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
		await upsertAgentConfiguration(f.core, "project", {
			...before,
			presets: {
				...before.presets,
				concurrent: { command: ["concurrent", "{prompt}"], bootstrap: "claude", env: {}, prepare: "" },
			},
		});
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
		expect(raw.presets?.contract).toMatchObject({
			command: ["false", "changed", "{prompt}"],
			resumeFlag: "--continue",
			env: { RAW: "kept=exact", NEW: "value" },
			prepare: "kept",
			bootstrap: "claude",
		});
		expect(raw.presets?.concurrent?.command).toEqual(["concurrent", "{prompt}"]);
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

	it("moves sessions to the chosen mode and saves deletion, added modes and color", async () => {
		const f = await fixture();
		const store = f.core.sessionApplication.store;
		const session: AgentSession = {
			id: "persisted-session",
			taskId: f.task.id,
			preset: "contract",
			tmuxName: "test-stopped-settings",
			cwd: coreFileSystem(f.core).rootDir,
			outputPath: join(coreFileSystem(f.core).rootDir, "output.log"),
			bootstrapPath: join(coreFileSystem(f.core).rootDir, "bootstrap.sh"),
			createdAt: "2026-10-10T10:00:00.000Z",
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
		expect(f.setup.captureCharFrame()).toContain("Delete PLAN");
		f.setup.mockInput.pressEnter();
		expect((await store.readMode(f.task.id, "plan")).sessions.map((item) => item.id)).toEqual([session.id]);
		expect((await f.json()).modes?.profiles.review).toBeUndefined();
		save(f.setup);
		await confirmModeDeletion(f.setup);
		await chooseModeDeletion(f.setup, "build");
		await f.saved();
		const raw = await f.json();
		expect(raw.modes?.order).toEqual(["build", "review"]);
		expect(raw.modes?.defaultModeId).toBe("build");
		expect(raw.modes?.profiles.plan).toBeUndefined();
		expect(raw.modes?.profiles.review?.textColor).toBe("brightblue");
		expect((await store.readMode(f.task.id, "plan")).sessions).toEqual([]);
		expect((await store.readMode(f.task.id, "build")).sessions.map((item) => item.id)).toEqual([session.id]);
		await store.remove(f.task.id, session.id);
		await f.open();
		modes(f.setup);
		await f.setup.flush();
		expect(f.setup.captureCharFrame()).toContain("REVIEW");
		expect(f.setup.captureCharFrame()).toContain("BUILD ● default");
	});

	it("saves two staged deletions and preserves edits to the remaining default", async () => {
		const config = initialConfiguration();
		const catalog = config.modes;
		if (!catalog?.profiles.build) throw new Error("Fixture requires the build mode.");
		catalog.order.push("review");
		catalog.profiles.review = { ...catalog.profiles.build, name: "REVIEW", prompt: "Original" };
		const f = await fixture(false, config);
		const originalDelete = Core.prototype.deleteMode;
		const deletion = spyOn(Core.prototype, "deleteMode").mockImplementation(async function (this: Core, id, options) {
			return await originalDelete.call(this, id, options);
		});
		try {
			await f.open();
			modes(f.setup);
			f.setup.mockInput.pressArrow("left");
			down(f.setup, 2);
			f.setup.mockInput.pressArrow("right");
			f.setup.mockInput.pressKey("n");
			clear(f.setup);
			await f.setup.mockInput.typeText("REVISED REVIEW");
			f.setup.mockInput.pressEnter();
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressArrow("up");
			f.setup.mockInput.pressArrow("up");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressArrow("down");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			save(f.setup);
			await eventually(async () => {
				await f.setup.flush();
				return f.setup.captureCharFrame().includes("Delete mode");
			});
			f.setup.mockInput.pressEnter();
			await f.setup.flush();
			expect(deletion).not.toHaveBeenCalled();
			await eventually(async () => {
				await f.setup.flush();
				return f.setup.captureCharFrame().includes("Delete mode");
			});
			f.setup.mockInput.pressEnter();
			await eventually(async () => {
				await f.setup.flush();
				return f.setup.captureCharFrame().includes("Choose an action");
			});
			await chooseModeDeletion(f.setup, "review", "build");
			await chooseModeDeletion(f.setup, "review");
			await f.saved();
			const saved = await f.json();
			expect(saved.modes?.order).toEqual(["review"]);
			expect(saved.modes?.defaultModeId).toBe("review");
			expect(saved.modes?.profiles.review?.name).toBe("REVISED REVIEW");
			expect(saved.modes?.profiles.review?.prompt).toBe("Original");
			expect(saved.presets).toEqual(config.presets);
			expect(deletion).toHaveBeenCalledTimes(2);
		} finally {
			deletion.mockRestore();
		}
	});

	it("reports partial progress when the second staged deletion fails", async () => {
		const config = initialConfiguration();
		const catalog = config.modes;
		if (!catalog?.profiles.build) throw new Error("Fixture requires the build mode.");
		catalog.order.push("review");
		catalog.profiles.review = { ...catalog.profiles.build, name: "REVIEW" };
		const f = await fixture(false, config);
		const originalDelete = Core.prototype.deleteMode;
		const deletion = spyOn(Core.prototype, "deleteMode").mockImplementation(async function (this: Core, id, options) {
			if (id === "build") throw new Error("second deletion failed");
			return await originalDelete.call(this, id, options);
		});
		try {
			await f.open();
			modes(f.setup);
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressArrow("down");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			save(f.setup);
			await confirmMultiple(f.setup, 2);
			await chooseModeDeletion(f.setup, "review");
			await chooseModeDeletion(f.setup, "review");
			await eventually(async () => {
				await f.setup.flush();
				return f.setup.captureCharFrame().includes("Mode settings save failed after deleting modes: plan.");
			});
			expect(deletion).toHaveBeenCalledTimes(2);
			expect((await f.json()).modes?.profiles.plan).toBeUndefined();
			expect((await f.json()).modes?.profiles.build).toBeDefined();
		} finally {
			deletion.mockRestore();
		}
	});

	it("refuses staged deletion of every mode before calling Core deletion", async () => {
		const f = await fixture();
		const deletion = spyOn(Core.prototype, "deleteMode");
		try {
			await f.open();
			modes(f.setup);
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			f.setup.mockInput.pressArrow("left");
			f.setup.mockInput.pressArrow("down");
			f.setup.mockInput.pressKey("d");
			f.setup.mockInput.pressEnter();
			save(f.setup);
			for (let i = 0; i < 2; i++) {
				await eventually(async () => {
					await f.setup.flush();
					return f.setup.captureCharFrame().includes("Delete mode");
				});
				f.setup.mockInput.pressEnter();
				await f.setup.flush();
			}
			await eventually(async () => {
				await f.setup.flush();
				return f.setup.captureCharFrame().includes("Cannot delete the last configured mode.");
			});
			expect(deletion).not.toHaveBeenCalled();
			expect((await f.json()).modes?.order).toEqual(["plan", "build"]);
		} finally {
			deletion.mockRestore();
		}
	});

	it("keeps real serialization errors visible without closing, permits retry, and discards without writing", async () => {
		const f = await fixture();
		await f.open();
		const original = await readFile(f.path, "utf8");
		await writeFile(f.path, "agent_configuration: 123\n");
		coreFileSystem(f.core).invalidateConfigCache();
		save(f.setup);
		await eventually(async () => {
			await f.setup.flush();
			return f.setup.captureCharFrame().includes("Error:");
		});
		expect(f.setup.captureCharFrame()).toContain("Categories");
		expect(f.setup.captureCharFrame()).toContain('invalid value for "agent_configuration"');
		expect(await readFile(f.path, "utf8")).toBe("agent_configuration: 123\n");
		await writeFile(f.path, original);
		coreFileSystem(f.core).invalidateConfigCache();
		save(f.setup);
		await f.saved();
		expect((await f.json()).modes?.profiles.plan?.permissions.repository).toBe("read");
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
		const child = Bun.spawn(["python3", "-c", script, ...command, rootDir, coreFileSystem(core).configFilePath], {
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
		coreFileSystem(core).invalidateConfigCache();
		expect((await loadAgentConfiguration(core, "project"))?.modes?.profiles.plan).toEqual(evidence.persisted);
	}, 30000);
});
