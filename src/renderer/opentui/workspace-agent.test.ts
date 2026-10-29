import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable, KeyEvent, parseKeypress } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentHost } from "../../runtime/live/agent-host.ts";
import type { TaskGroup } from "../../storage/group-store.ts";
import type { TaskArtifactEntry } from "../../storage/task-artifact-repository.ts";
import type { TaskArtifactViewApi } from "./task-artifact-view.ts";
import { mountOpenTuiWorkspace } from "./workspace.ts";
import { createWorkspaceAgent } from "./workspace-agent.ts";

function key(sequence: string): KeyEvent {
	const parsed = parseKeypress(sequence, { useKittyKeyboard: true });
	if (!parsed) throw new Error(`Could not parse ${JSON.stringify(sequence)}`);
	return new KeyEvent(parsed);
}

function host(writes: string[]): AgentHost {
	return {
		sendBytes: (bytes: Uint8Array) => writes.push(new TextDecoder().decode(bytes)),
		resize: async () => {},
	} as unknown as AgentHost;
}

describe("native workspace terminal", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	test("navigation Enter focuses the live preview without forwarding Enter", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const writes: string[] = [];
		const agentHost = host(writes);
		const terminal = createWorkspaceAgent(setup.renderer, agentHost, 70, 20, (error) => {
			throw error;
		});
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "BACK-1", title: "First", status: "Todo", done: false }],
			liveAgent: { taskId: "BACK-1", label: "Agent", status: "running", host: agentHost, terminal },
			onSessionAction: () => terminal.focus(),
		});
		try {
			await setup.flush();
			setup.mockInput.pressEnter();
			expect(terminal.focused).toBe(true);
			expect(writes).toEqual([]);
			setup.mockInput.pressKey("x");
			expect(writes.join("")).toBe("x");
		} finally {
			mount.dispose();
			terminal.destroy();
		}
	});

	test("encodes backward word deletion without changing forward Delete or Super", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24 });
		renderers.push(setup);
		const terminal = createWorkspaceAgent(setup.renderer, host([]), 80, 24, (error) => {
			throw error;
		});
		try {
			for (const [input, expected] of [
				["\x1b\x7f", "\x1b\x7f"],
				["\x1b\b", "\x1b\x7f"],
				["\x7f", "\x7f"],
				["\b", "\x7f"],
				["\x1b[3;3~", "\x1b[3;3~"],
				["\x1b[127;3u", "\x1b\x7f"],
			] as const) {
				const event = key(input);
				const original = { ...event };
				expect(new TextDecoder().decode(terminal.encodeKey(event))).toBe(expected);
				expect({ ...event }).toEqual(original);
			}
			terminal.write("\x1b[>3u");
			for (const input of ["\x1b[97;9u", "\x1b[97;11u"]) {
				expect(new TextDecoder().decode(terminal.encodeKey(key(input)))).toBe(input);
			}
		} finally {
			terminal.destroy();
		}
	});

	test("forwards raw Option/Alt word-motion bytes and SS3 arrows", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24 });
		renderers.push(setup);
		const terminal = createWorkspaceAgent(setup.renderer, host([]), 80, 24, (error) => {
			throw error;
		});
		try {
			for (const [input, expected] of [
				["\x1bb", "\x1bb"],
				["\x1bf", "\x1bf"],
				["\x1b[1;3D", "\x1b[1;3D"],
				["\x1b[1;3C", "\x1b[1;3C"],
				["\x1bOD", "\x1bOD"],
				["\x1bOC", "\x1bOC"],
				["\x1b\x7f", "\x1b\x7f"],
				["\x1b[127;3u", "\x1b\x7f"],
			] as const) {
				const event = key(input);
				const original = { ...event };
				expect(new TextDecoder().decode(terminal.encodeKey(event))).toBe(expected);
				expect({ ...event }).toEqual(original);
			}
		} finally {
			terminal.destroy();
		}
	});

	test("retains terminal output across task navigation and remounts, with focus-scoped input", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const writes: string[] = [];
		const agentHost = host(writes);
		const terminal = createWorkspaceAgent(setup.renderer, agentHost, 70, 20, (error) => {
			throw error;
		});
		const options = {
			detailsVisible: false,
			tasks: [
				{ id: "BACK-1", title: "First", status: "Todo", done: false },
				{ id: "BACK-2", title: "Second", status: "Todo", done: false },
			],
			liveAgent: { taskId: "BACK-1", label: "Agent", status: "running" as const, host: agentHost, terminal },
		};
		let quit = 0;
		let mount = mountOpenTuiWorkspace(setup.renderer, parent, { ...options, onQuit: () => quit++ });
		try {
			await setup.flush();
			terminal.write("RETAINED OUTPUT");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("RETAINED OUTPUT");
			terminal.focus();
			setup.mockInput.pressKey("a");
			await setup.mockInput.pasteBracketedText("paste");
			setup.mockInput.pressKey("q");
			setup.mockInput.pressCtrlC();
			setup.mockInput.pressKey("q", { ctrl: true });
			setup.mockInput.pressKey("q");
			await setup.flush();
			expect(writes.join("")).toBe("apasteq");
			expect(quit).toBe(0);

			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("RETAINED OUTPUT");
			setup.mockInput.pressArrow("up");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("RETAINED OUTPUT");
			mount.dispose();
			terminal.write(" STILL LIVE");
			mount = mountOpenTuiWorkspace(setup.renderer, parent, { ...options, onQuit: () => quit++ });
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("RETAINED OUTPUT STILL LIVE");
			setup.mockInput.pressCtrlC();
			expect(quit).toBe(1);
		} finally {
			mount.dispose();
			terminal.destroy();
		}
	});

	test("uses ordered quick-preview exit overrides without forwarding sequence strokes to the agent", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const writes: string[] = [];
		const agentHost = host(writes);
		const terminal = createWorkspaceAgent(setup.renderer, agentHost, 70, 20, (error) => {
			throw error;
		});
		const focusChanges: boolean[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "BACK-1", title: "First", status: "Todo", done: false }],
			liveAgent: { taskId: "BACK-1", label: "Agent", status: "running", host: agentHost, terminal },
			keyboardOverrides: {
				"workspace.quickPreviewExit": { sequence: [{ key: "b", ctrl: true }, { key: "d" }] },
			},
			onAgentFocusChange: (focused) => focusChanges.push(focused),
		});
		try {
			await setup.flush();
			terminal.focus();
			setup.mockInput.pressKey("b", { ctrl: true });
			expect(writes).toEqual([]);
			setup.mockInput.pressKey("d");
			expect(writes).toEqual([]);
			expect(focusChanges).toEqual([true, false]);
		} finally {
			mount.dispose();
			terminal.destroy();
		}
	});

	test("Escape remains harness input in the focused embedded preview", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const writes: string[] = [];
		const agentHost = host(writes);
		const terminal = createWorkspaceAgent(setup.renderer, agentHost, 70, 20, (error) => {
			throw error;
		});
		const focusChanges: boolean[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "BACK-1", title: "ESC RETURN TASK", status: "Todo", done: false }],
			liveAgent: { taskId: "BACK-1", label: "Agent", status: "running", host: agentHost, terminal },
			agentFocused: true,
			onAgentFocusChange: (focused) => focusChanges.push(focused),
		});
		try {
			await setup.flush();
			expect(terminal.focused).toBe(true);
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(terminal.focused).toBe(true);
			expect(writes.join("")).toBe("\x1b");
			expect(focusChanges).toEqual([]);
			expect(setup.captureCharFrame()).toContain("ESC RETURN TASK");
		} finally {
			mount.dispose();
			terminal.destroy();
		}
	});

	test("adopts retained native terminal focus before dispatching workspace shortcuts", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const writes: string[] = [];
		const agentHost = host(writes);
		const terminal = createWorkspaceAgent(setup.renderer, agentHost, 70, 20, (error) => {
			throw error;
		});
		const focusChanges: boolean[] = [];
		let sessionRequests = 0;
		let quit = 0;
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "BACK-1", title: "First", status: "Todo", done: false }],
			liveAgent: { taskId: "BACK-1", label: "Agent", status: "running", host: agentHost, terminal },
			onAgentFocusChange: (focused) => focusChanges.push(focused),
			onSessionRequest: () => {
				sessionRequests += 1;
			},
			onQuit: () => {
				quit += 1;
			},
		});
		try {
			await setup.flush();
			// Model a retained terminal regaining native focus before its controller callback.
			Object.defineProperty(terminal, "focused", { configurable: true, writable: true, value: true });
			setup.mockInput.pressKey("s");
			setup.mockInput.pressKey("f");
			setup.mockInput.pressCtrlC();
			expect(writes.join("")).toBe("sf");
			expect(sessionRequests).toBe(0);
			expect(quit).toBe(0);
			expect(focusChanges).toEqual([true, false]);
		} finally {
			Reflect.deleteProperty(terminal, "focused");
			mount.dispose();
			terminal.destroy();
		}
	});

	test("workspace details own artifact open/close and keep the current task content", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const entries: TaskArtifactEntry[] = [{ path: "notes.md", size: 6, type: "text" }];
		const api: TaskArtifactViewApi = {
			list: async () => entries,
			read: async () => new TextEncoder().encode("detail"),
			write: async () => {},
		};
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [{ id: "BACK-1", title: "First task", status: "Todo", done: false, description: "Original description" }],
			taskArtifactApi: api,
		});
		try {
			await setup.flush();
			setup.mockInput.pressKey("o", { ctrl: true, shift: true });
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("notes.md");
			setup.mockInput.pressEscape();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Original description");
			expect(setup.captureCharFrame()).not.toContain("notes.md");
		} finally {
			mount.dispose();
		}
	});

	test("workspace mount enables artifacts when the API arrives after mounting", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const options = { tasks: [{ id: "BACK-1", title: "First task", status: "Todo", done: false }] };
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			const api: TaskArtifactViewApi = {
				list: async () => [{ path: "late.md", size: 4, type: "text" }],
				read: async () => new TextEncoder().encode("late"),
				write: async () => {},
			};
			mount.update({ ...options, taskArtifactApi: api });
			setup.mockInput.pressKey("o", { ctrl: true, shift: true });
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("late.md");
			expect(setup.captureCharFrame()).toContain("late");
		} finally {
			mount.dispose();
		}
	});

	test("workspace mount replaces the artifact adapter for an open artifact pane", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const options = { tasks: [{ id: "BACK-1", title: "First task", status: "Todo", done: false }] };
		const makeApi = (path: string, content: string): TaskArtifactViewApi => ({
			list: async () => [{ path, size: content.length, type: "text" }],
			read: async () => new TextEncoder().encode(content),
			write: async () => {},
		});
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			...options,
			taskArtifactApi: makeApi("old.md", "old adapter"),
		});
		try {
			await setup.flush();
			setup.mockInput.pressKey("o", { ctrl: true, shift: true });
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("old.md");
			mount.update({ ...options, taskArtifactApi: makeApi("new.md", "new adapter") });
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("new.md");
			expect(setup.captureCharFrame()).toContain("new adapter");
			expect(setup.captureCharFrame()).not.toContain("old.md");
		} finally {
			mount.dispose();
		}
	});

	test("empty grouped workspace keeps nonnegative anchors and mouse-selects the first group", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const groups: TaskGroup[] = ["Alpha", "Beta", "Gamma"].map((name, order) => ({
			id: name.toLowerCase(),
			name,
			parentId: null,
			order,
			collapsed: false,
		}));
		const anchors: number[] = [];
		const selected: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [],
			groups,
			firstVisibleTaskIndex: 2,
			onTaskScrollChange: (index) => anchors.push(index),
			onGroupSelect: (group) => selected.push(group.id),
		});
		try {
			await setup.flush();
			const frame = setup.captureCharFrame();
			for (const name of ["Alpha (0)", "Beta (0)", "Gamma (0)"]) expect(frame).toContain(name);
			expect(anchors).toContain(0);
			expect(anchors.every((index) => index >= 0)).toBe(true);
			const lines = frame.split("\n");
			const alphaRow = lines.findIndex((line) => line.includes("Alpha (0)"));
			const alphaColumn = lines[alphaRow]?.indexOf("Alpha (0)") ?? -1;
			expect(alphaRow).toBeGreaterThanOrEqual(0);
			expect(alphaColumn).toBeGreaterThanOrEqual(0);
			await setup.mockMouse.click(alphaColumn, alphaRow);
			await setup.flush();
			expect(selected).toEqual(["alpha"]);
		} finally {
			mount.dispose();
		}
	});
});
