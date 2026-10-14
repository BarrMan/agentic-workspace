import { afterEach, describe, expect, it } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoxRenderable, InputRenderable, parseColor, type TextRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { getDefaultModeCatalog, loadAgentConfiguration, upsertAgentConfiguration } from "../agent-workspace/config.ts";
import type { GroupStore } from "../agent-workspace/group-store.ts";
import type { AgentConfiguration } from "../agent-workspace/types.ts";
import type { WorkspaceStateService } from "../agent-workspace/workspace-state.ts";
import { Core } from "../core/agentic-workspace.ts";
import { mountOpenTuiAgentSettings } from "../ui/opentui/agent-settings.ts";
import { createWorkspaceFilters } from "../ui/opentui/workspace/state.ts";
import { mountOpenTuiWorkspace, type OpenTuiWorkspaceOptions } from "../ui/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";
import { initializeFilesystemTestProject } from "./test-utils.ts";

const RAW_PROMPT = "first line\n\n  indentation and {raw} placeholders\nlast line\n";
const ARTIFACTS = [
	{ path: "notes/custom.md", purpose: "independent purpose" },
	{ path: "reports/final.md", purpose: "final result" },
];

describe("independent MAIN settings persistence through public input", () => {
	const cleanup: Array<() => Promise<void> | void> = [];
	afterEach(async () => {
		for (const dispose of cleanup.splice(0).reverse()) await dispose();
	});

	async function fixture() {
		const directory = await mkdtemp(join(tmpdir(), "settings-independent-"));
		cleanup.push(() => rm(directory, { recursive: true, force: true }));
		const executable = join(directory, "fake-models");
		await writeFile(
			executable,
			"#!/bin/sh\ncase \"$*\" in\n  *--version) printf 'opencode v2.1.0\\n' ;;\n  *models) printf 'fake/model-a\\nfake/model-b\\n' ;;\nesac\n",
		);
		await chmod(executable, 0o700);
		const core = new Core(directory);
		await initializeFilesystemTestProject(core, "Independent Settings");
		const modes = getDefaultModeCatalog();
		const plan = modes.profiles.plan;
		if (!plan) throw new Error("Fixture requires PLAN");
		plan.prompt = "original";
		plan.permissions = { repository: "read", task: "read", artifacts: "read", subagents: "allowed" };
		plan.artifacts = [];
		delete plan.approvalArtifact;
		delete plan.textColor;
		modes.order.push("review");
		modes.profiles.review = { ...structuredClone(plan), name: "REVIEW" };
		const configuration: AgentConfiguration = {
			selectedPreset: "fake",
			presets: { fake: { command: `${executable} {prompt}`, env: {}, prepare: "", bootstrap: "opencode" } },
			sessions: { worktreePerTask: false, yoloMode: false },
			modes,
		};
		await upsertAgentConfiguration(core, "project", configuration);
		const path = join(core.filesystem.agenticWorkspaceDir, "agents.json");
		const setup = await createTestRenderer({ width: 140, height: 42, kittyKeyboard: true, exitOnCtrlC: false });
		cleanup.push(() => setup.renderer.destroy());
		const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%", flexDirection: "column" });
		setup.renderer.root.add(root);
		return { core, directory, configuration, path, setup, root };
	}

	async function settle(setup: TestRendererSetup, predicate: () => boolean) {
		for (let attempt = 0; attempt < 100; attempt++) {
			await setup.flush();
			if (predicate()) return;
			await Bun.sleep(5);
		}
		throw new Error(`UI did not settle:\n${setup.captureCharFrame()}`);
	}

	async function category(setup: TestRendererSetup, label: "Agents" | "Sessions" | "Modes") {
		for (let attempt = 0; attempt < 4 && !/> (Agents|Sessions|Modes)\b/.test(setup.captureCharFrame()); attempt++) {
			setup.mockInput.pressArrow("left");
			await setup.flush();
		}
		for (let attempt = 0; attempt < 4 && !setup.captureCharFrame().includes(`> ${label}`); attempt++) {
			setup.mockInput.pressArrow("down");
			await setup.flush();
		}
		expect(setup.captureCharFrame()).toContain(`> ${label}`);
		setup.mockInput.pressArrow("right");
		if (label === "Modes") setup.mockInput.pressArrow("right");
		await setup.flush();
	}

	async function field(setup: TestRendererSetup, label: string) {
		// Reset semantically, then walk to the requested label; field order is not part of the test.
		for (let attempt = 0; attempt < 16 && !setup.captureCharFrame().includes("> Model:"); attempt++) {
			setup.mockInput.pressArrow("up");
			await setup.flush();
		}
		for (let attempt = 0; attempt < 16 && !setup.captureCharFrame().includes(`> ${label}:`); attempt++) {
			setup.mockInput.pressArrow("down");
			await setup.flush();
		}
		expect(setup.captureCharFrame()).toContain(`> ${label}:`);
	}

	async function replace(setup: TestRendererSetup, text: string) {
		if (setup.renderer.currentFocusedRenderable instanceof InputRenderable) {
			setup.mockInput.pressKey("END");
			setup.mockInput.pressKey("HOME", { shift: true });
		} else {
			setup.mockInput.pressKey("a", { ctrl: true });
			setup.mockInput.pressKey("k", { ctrl: true });
		}
		await setup.mockInput.pasteBracketedText(text);
	}

	async function chooseColor(setup: TestRendererSetup, color: string) {
		await field(setup, "Color");
		setup.mockInput.pressEnter();
		await setup.flush();
		const selected = () => setup.captureCharFrame().includes(color === "Default" ? "Color: Default ·" : `(${color}) ·`);
		for (let attempt = 0; attempt < 18 && !selected(); attempt++) {
			setup.mockInput.pressArrow("down");
			await setup.flush();
		}
		expect(selected()).toBe(true);
		setup.mockInput.pressEnter();
		await setup.flush();
	}

	async function editCombined(setup: TestRendererSetup) {
		await category(setup, "Modes");
		await field(setup, "Model");
		setup.mockInput.pressEnter();
		await settle(setup, () => setup.captureCharFrame().includes("fake/model-a"));
		setup.mockInput.pressArrow("down");
		setup.mockInput.pressEnter();
		await setup.flush();
		for (const label of ["Repository", "Task", "Artifacts", "Subagents"]) {
			await field(setup, label);
			setup.mockInput.pressEnter();
			await setup.flush();
		}
		for (const [label, value] of [
			["Prompt", RAW_PROMPT],
			["Artifact definitions", ARTIFACTS.map(({ path, purpose }) => `${path} — ${purpose}`).join("\n")],
		]) {
			await field(setup, label as string);
			setup.mockInput.pressEnter();
			await setup.flush();
			await replace(setup, value as string);
			setup.mockInput.pressEnter({ ctrl: true });
			await setup.flush();
		}
		await chooseColor(setup, "brightgreen");
		await category(setup, "Agents");
		setup.mockInput.pressEnter();
		await setup.flush();
		for (let attempt = 0; attempt < 12 && !/fake .*< >/.test(setup.captureCharFrame()); attempt++) {
			setup.mockInput.pressArrow("down");
			await setup.flush();
		}
		expect(setup.captureCharFrame()).toMatch(/fake .*< >/);
		setup.mockInput.pressEnter();
		await setup.flush();
		const rows = setup.captureCharFrame().split("\n");
		const y = rows.findIndex((row) => row.includes("Command"));
		const x = rows[y]?.indexOf("Command") ?? -1;
		expect(x).toBeGreaterThanOrEqual(0);
		await setup.mockMouse.click(x + 1, y);
		setup.mockInput.pressEnter();
		await setup.flush();
		await replace(setup, "fake-edited {prompt}");
		setup.mockInput.pressEnter();
		await setup.flush();
		await category(setup, "Sessions");
		for (const label of ["Worktree per task", "YOLO mode"]) {
			for (let attempt = 0; attempt < 3 && !setup.captureCharFrame().includes(`> [ ] ${label}`); attempt++) {
				setup.mockInput.pressArrow("down");
				await setup.flush();
			}
			expect(setup.captureCharFrame()).toContain(`> [ ] ${label}`);
			setup.mockInput.pressKey(" ");
			await setup.flush();
		}
		await category(setup, "Modes");
		await field(setup, "Approval indicator");
		setup.mockInput.pressEnter();
		await setup.flush();
		for (
			let attempt = 0;
			attempt < 8 && !setup.captureCharFrame().includes("Approval indicator: Custom path");
			attempt++
		) {
			setup.mockInput.pressArrow("down");
			await setup.flush();
		}
		expect(setup.captureCharFrame()).toContain("Approval indicator: Custom path");
		setup.mockInput.pressEnter();
		await setup.flush();
		await replace(setup, "approval/custom.md");
		setup.mockInput.pressEnter();
		await setup.flush();
	}

	async function openController(f: Awaited<ReturnType<typeof fixture>>) {
		let options: OpenTuiWorkspaceOptions | undefined;
		const state = { filters: createWorkspaceFilters(), detailsVisible: true };
		const controller = new OpenTuiWorkspaceController(f.core, {
			groupStore: {
				current: { groups: [], membership: {} },
				update: async () => {},
				subscribe: () => () => {},
				close: () => {},
			} as GroupStore,
			viewStateStore: {
				current: state,
				origin: "independent-settings",
				update: async () => {},
				subscribe: () => () => {},
				recheck: async () => {},
				close: () => {},
			},
			workspaceState: {
				listTasks: async () => [],
				listAllSessions: async () => new Map(),
				listSessions: async (taskId: string) => ({ taskId, sessions: [] }),
				listModeSessions: async () => ({ sessions: [] }),
				liveSession: async () => undefined,
			} as unknown as WorkspaceStateService,
			runtime: {
				createHost: async () => ({ renderer: f.setup.renderer, root: f.root, destroy: () => {} }),
				mountWorkspace: (renderer, root, next) => {
					options = next;
					const mounted = mountOpenTuiWorkspace(renderer, root, next);
					return {
						...mounted,
						update: (updated) => {
							options = updated;
							mounted.update(updated);
						},
					};
				},
				createActivityProbe: () => ({ probe: async () => new Map() }),
				watchTasks: () => ({ stop: () => {} }),
				watchConfig: () => ({ stop: () => {} }),
			},
		});
		const running = controller.run();
		cleanup.push(async () => {
			controller.destroy();
			await running;
		});
		await settle(f.setup, () => Boolean(options?.onSettingsRequest));
		const open = async () => {
			options?.onSettingsRequest?.();
			await settle(f.setup, () => f.setup.captureCharFrame().includes("Categories"));
		};
		await open();
		return open;
	}

	function expectCombined(configuration: AgentConfiguration | null) {
		expect(configuration?.presets.fake?.command).toBe("fake-edited {prompt}");
		expect(configuration?.sessions).toEqual({ worktreePerTask: true, yoloMode: true, autoResumeOnRestart: true });
		const profile = configuration?.modes?.profiles.plan;
		expect(profile?.model).toEqual({ kind: "explicit", id: "fake/model-a" });
		expect(profile?.permissions).toEqual({
			repository: "read-write",
			task: "read-write",
			artifacts: "read-write",
			subagents: "disabled",
		});
		expect(profile?.prompt).toBe(RAW_PROMPT);
		expect(profile?.artifacts).toEqual(ARTIFACTS);
		expect(profile?.approvalArtifact).toBe("approval/custom.md");
		expect(profile?.textColor).toBe("brightgreen");
	}

	it("persists the real controller's combined Modes/Agents/Sessions save and reopens it", async () => {
		const f = await fixture();
		const open = await openController(f);
		const before = await readFile(f.path, "utf8");
		await editCombined(f.setup);
		expect(await readFile(f.path, "utf8")).toBe(before);
		f.setup.mockInput.pressKey("s", { ctrl: true });
		await settle(f.setup, () => !f.setup.captureCharFrame().includes("Categories"));
		expectCombined(await loadAgentConfiguration(f.core, "project"));
		expectCombined(JSON.parse(await readFile(f.path, "utf8")));
		await open();
		await category(f.setup, "Modes");
		await field(f.setup, "Model");
		expect(f.setup.captureCharFrame()).toContain("Model: fake/model-a");
		await field(f.setup, "Approval indicator");
		expect(f.setup.captureCharFrame()).toContain("Approval indicator: approval/custom.md");
	});

	it("discovers models for a public OpenCode preset through its resolved v2 adapter", async () => {
		const f = await fixture();
		await openController(f);
		await category(f.setup, "Modes");
		await field(f.setup, "Model");
		f.setup.mockInput.pressEnter();
		await settle(f.setup, () => f.setup.captureCharFrame().includes("fake/model-a"));
		expect(f.setup.captureCharFrame()).toContain("fake/model-b");
	});

	it("whole controller Settings cancellation discards all three categories without disk writes", async () => {
		const f = await fixture();
		const open = await openController(f);
		const before = await readFile(f.path, "utf8");
		await editCombined(f.setup);
		f.setup.mockInput.pressEscape();
		await settle(f.setup, () => !f.setup.captureCharFrame().includes("Categories"));
		expect(await readFile(f.path, "utf8")).toBe(before);
		await open();
		await category(f.setup, "Modes");
		expect(f.setup.captureCharFrame()).toContain("Model: Default");
	});

	it("the public onSave-only boundary serializes the whole combined configuration", async () => {
		const f = await fixture();
		const mount = mountOpenTuiAgentSettings(f.setup.renderer, f.root, {
			configuration: f.configuration,
			discoverModeModels: async () => [{ id: "fake/model-a" }],
			onSave: async (configuration) => {
				await upsertAgentConfiguration(f.core, "project", configuration);
			},
			onClose: () => {},
		});
		cleanup.push(() => mount.dispose());
		await f.setup.flush();
		await editCombined(f.setup);
		f.setup.mockInput.pressKey("s", { ctrl: true });
		await settle(f.setup, () => !f.setup.captureCharFrame().includes("Categories"));
		expectCombined(await loadAgentConfiguration(f.core, "project"));
	});

	for (const color of ["Default", "green", "blue", "brightgreen"] as const) {
		it(`serializes and reloads custom profile ${color} without confusing legacy PLAN defaults`, async () => {
			const f = await fixture();
			const mount = mountOpenTuiAgentSettings(f.setup.renderer, f.root, {
				configuration: f.configuration,
				onSave: async (configuration) => {
					await upsertAgentConfiguration(f.core, "project", configuration);
				},
				onClose: () => {},
			});
			cleanup.push(() => mount.dispose());
			await f.setup.flush();
			await category(f.setup, "Modes");
			f.setup.mockInput.pressArrow("left");
			for (let attempt = 0; attempt < 8 && !f.setup.captureCharFrame().includes("> REVIEW"); attempt++) {
				f.setup.mockInput.pressArrow("down");
				await f.setup.flush();
			}
			expect(f.setup.captureCharFrame()).toContain("> REVIEW");
			f.setup.mockInput.pressArrow("right");
			await f.setup.flush();
			await chooseColor(f.setup, color);
			const row = f.setup.renderer.root.findDescendantById("settings-mode-color") as TextRenderable;
			expect(row.fg).toEqual(parseColor(color === "Default" ? "#d4d4d8" : color));
			f.setup.mockInput.pressKey("s", { ctrl: true });
			await settle(f.setup, () => !f.setup.captureCharFrame().includes("Categories"));
			const saved = await loadAgentConfiguration(f.core, "project");
			expect(saved?.modes?.profiles.review?.textColor).toBe(color === "Default" ? undefined : color);
			const raw = JSON.parse(await readFile(f.path, "utf8"));
			expect(Object.hasOwn(raw.modes.profiles.review, "textColor")).toBe(color !== "Default");
		});
	}

	it.skipIf(process.env.RUN_INTERACTIVE_TUI_TESTS !== "1")(
		"source entry persists combined settings and reopens them in an isolated PTY",
		async () => {
			const f = await fixture();
			const runtime = Bun.which("bun");
			const python = Bun.which("python3");
			expect(runtime).not.toBeNull();
			expect(python).not.toBeNull();
			const sourceEntry = join(import.meta.dir, "../cli/index.ts");
			const script = String.raw`
import fcntl, json, os, pathlib, pty, re, select, signal, struct, subprocess, sys, termios, time
import pyte

runtime, source_entry, directory, configuration_path = sys.argv[1:]
root = pathlib.Path(directory)
home = root / "isolated-home"
home.mkdir()
env = {key: value for key, value in os.environ.items() if not key.startswith(("AGENTIC_WORKSPACE_", "TMUX", "XDG_"))}
env.update(HOME=str(home), XDG_CONFIG_HOME=str(home / "config"), XDG_DATA_HOME=str(home / "data"),
           XDG_CACHE_HOME=str(home / "cache"), AGENTIC_WORKSPACE_TMUX_SOCKET=str(root / "isolated-tmux"), TERM="xterm-256color")
subprocess.run(["git", "init", "-b", "main"], cwd=root, env=env, capture_output=True, check=True)
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 42, 140, 0, 0))
child = subprocess.Popen([runtime, source_entry, "workspace"], cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
os.close(slave)
screen = pyte.Screen(140, 42)
stream = pyte.Stream(screen)
def frame():
    return "\n".join(screen.display)
def drain(duration=0.06):
    deadline = time.monotonic() + duration
    while time.monotonic() < deadline:
        if select.select([master], [], [], 0.02)[0]:
            chunk = os.read(master, 65536)
            stream.feed(chunk.decode(errors="replace"))
            if b"\x1b[6n" in chunk:
                os.write(master, b"\x1b[1;1R")
    assert child.poll() is None, "workspace exited before completion"
def send(key, duration=0.06):
    os.write(master, key)
    drain(duration)
def paste(text):
    send(b"\x1b[200~" + text.encode() + b"\x1b[201~")
def require(text):
    assert text in frame(), "missing rendered label: " + text + "\n" + frame()
def category(label):
    for _ in range(4):
        if re.search(r"> (Agents|Sessions|Modes)\b", frame()): break
        send(b"\x1b[D")
    for _ in range(4):
        if "> " + label in frame(): break
        send(b"\x1b[B")
    require("> " + label)
    send(b"\x1b[C")
    if label == "Modes": send(b"\x1b[C")
def field(label):
    for _ in range(16):
        if "> Model:" in frame(): break
        send(b"\x1b[A")
    for _ in range(16):
        if "> " + label + ":" in frame(): break
        send(b"\x1b[B")
    require("> " + label + ":")
def replace(text, multiline=False):
    if multiline:
        send(b"\x01\x0b")
    else:
        send(b"\x1b[F\x1b[1;2H")
    paste(text)
before = pathlib.Path(configuration_path).read_bytes()
signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
try:
    drain(3)
    send(b",", 0.5)
    require("Categories")
    category("Modes")
    field("Model")
    send(b"\r", 1)
    require("fake/model-a")
    send(b"\x1b[B")
    send(b"\r")
    require("Model: fake/model-a")
    for label in ["Repository", "Task", "Artifacts", "Subagents"]:
        field(label)
        send(b"\r")
    for label, text in [("Prompt", "first line\n\n  indentation and {raw} placeholders\nlast line\n"),
                        ("Artifact definitions", "notes/custom.md — independent purpose\nreports/final.md — final result")]:
        field(label)
        send(b"\r")
        replace(text, True)
        send(b"\x1b[13;5u")
    field("Color")
    send(b"\r")
    for _ in range(18):
        if "(brightgreen) ·" in frame(): break
        send(b"\x1b[B")
    require("(brightgreen) ·")
    send(b"\r")
    category("Agents")
    send(b"\r")
    for _ in range(12):
        if re.search(r"fake .*< >", frame()): break
        send(b"\x1b[B")
    assert re.search(r"fake .*< >", frame()), "fake preset not selected"
    send(b"\r")
    for y, line in enumerate(screen.display):
        if "Command" in line:
            x = line.index("Command") + 2
            send(f"\x1b[<0;{x};{y+1}M\x1b[<0;{x};{y+1}m".encode())
            break
    send(b"\r")
    replace("fake-edited {prompt}")
    send(b"\r")
    category("Sessions")
    for label in ["Worktree per task", "YOLO mode"]:
        for _ in range(3):
            if "> [ ] " + label in frame(): break
            send(b"\x1b[B")
        require("> [ ] " + label)
        send(b" ")
    category("Modes")
    field("Approval indicator")
    send(b"\r")
    for _ in range(8):
        if "Approval indicator: Custom path" in frame(): break
        send(b"\x1b[B")
    require("Approval indicator: Custom path")
    send(b"\r")
    replace("approval/custom.md")
    send(b"\r")
    assert pathlib.Path(configuration_path).read_bytes() == before, "staging wrote configuration"
    send(b"\x1b[115;5u", 1)
    assert "Categories" not in frame(), "Save did not close Settings"
    saved = json.loads(pathlib.Path(configuration_path).read_text())
    print(json.dumps(saved))
    send(b",", 0.5)
    require("Categories")
    category("Modes")
    field("Model")
    require("Model: fake/model-a")
    field("Approval indicator")
    require("Approval indicator: approval/custom.md")
    field("Color")
    require("Color: brightgreen")
    send(b"\x1b")
finally:
    if child.poll() is None:
        os.killpg(child.pid, signal.SIGTERM)
        try: child.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
    os.close(master)
`;
			const child = Bun.spawn([python as string, "-c", script, runtime as string, sourceEntry, f.directory, f.path], {
				cwd: f.directory,
				stdout: "pipe",
				stderr: "pipe",
			});
			const [stdout, stderr, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			expect(stderr).toBe("");
			expect(code).toBe(0);
			expectCombined(JSON.parse(stdout));
			expectCombined(await loadAgentConfiguration(f.core, "project"));
		},
		60000,
	);
});
