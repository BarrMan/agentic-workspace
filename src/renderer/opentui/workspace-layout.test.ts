import { afterEach, describe, expect, test } from "bun:test";
import { BoxRenderable, TextAttributes } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentIndication } from "../../model/session/types.ts";
import type { AgentHost } from "../../runtime/live/agent-host.ts";
import { mountOpenTuiWorkspace } from "./workspace.ts";
import { createWorkspaceAgent } from "./workspace-agent.ts";

function plainContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map(plainContent).join("");
	if (content && typeof content === "object") {
		if ("chunks" in content && Array.isArray(content.chunks)) {
			return content.chunks.map((chunk: unknown) => plainContent(chunk)).join("");
		}
		if ("text" in content && typeof content.text === "string") return content.text;
		if ("_string" in content && typeof content._string === "string") return content._string;
	}
	return typeof content === "number" || typeof content === "boolean" ? String(content) : "";
}

function attachParent(setup: TestRendererSetup): BoxRenderable {
	const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(parent);
	return parent;
}

function spanAt(setup: TestRendererSetup, x: number, y: number) {
	let column = 0;
	for (const span of setup.captureSpans().lines[y]?.spans ?? []) {
		if (x < column + span.width) return span;
		column += span.width;
	}
	throw new Error(`No rendered span at ${x},${y}`);
}

function taskSpans(setup: TestRendererSetup, id: string) {
	const title = plainContent(TASK_TITLES[id] ?? id);
	const rows = setup.captureCharFrame().split("\n");
	const y = rows.findIndex((row) => row.includes(title));
	expect(y).toBeGreaterThanOrEqual(0);
	const row = rows[y] ?? "";
	return {
		label: spanAt(setup, row.indexOf(title), y),
		marker: spanAt(setup, row.indexOf(title) - 2, y),
	};
}

function contrast(foreground: readonly number[], background: readonly number[]): number {
	const luminance = (color: readonly number[]): number => {
		const channels = color.slice(0, 3).map((value) => {
			const channel = value / 255;
			return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
		});
		return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
	};
	const first = luminance(foreground);
	const second = luminance(background);
	return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function liveAgent(setup: TestRendererSetup, status: "starting" | "running" = "running") {
	const writes: string[] = [];
	const resizes: Array<[number, number]> = [];
	const host = {
		sendBytes: (bytes: Uint8Array) => writes.push(new TextDecoder().decode(bytes)),
		resize: async (columns: number, rows: number) => {
			resizes.push([columns, rows]);
		},
	} as unknown as AgentHost;
	const terminal = createWorkspaceAgent(setup.renderer, host, 80, 24, (error) => {
		throw error;
	});
	return {
		agent: { taskId: "BACK-1", label: "Retained agent", status, host, terminal },
		writes,
		resizes,
	};
}

const tasks = [
	{ id: "BACK-1", title: "First task", status: "Todo", done: false, description: "OPAQUE TASK DETAILS" },
	{ id: "BACK-2", title: "Second task", status: "Todo", done: false },
	{ id: "BACK-3", title: "Third task", status: "Doing", done: false },
];

const TASK_TITLES: Record<string, string> = Object.fromEntries(
	tasks.map((task) => [task.id, plainContent(task.title)]),
);

describe("native workspace layout", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	test("details flow above preview, collapse expands retained terminal, and resize keeps it mounted", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const { agent, resizes } = liveAgent(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			liveAgent: agent,
		});
		try {
			await setup.flush();
			const initialScreen = agent.terminal.screen();
			agent.terminal.write(`\x1b[1;1HTOP-OF-PREVIEW\x1b[${initialScreen.rows};1HBOTTOM-OF-PREVIEW`);
			await setup.flush();
			const expandedFrame = setup.captureCharFrame();
			const hintLine = expandedFrame.split("\n").find((line) => line.includes("Press Space to collapse"));
			expect(expandedFrame.indexOf("OPAQUE TASK DETAILS")).toBeLessThan(expandedFrame.indexOf("TOP-OF-PREVIEW"));
			expect(hintLine?.indexOf("Press Space to collapse")).toBeGreaterThan(60);
			const resizeCount = resizes.length;
			setup.mockInput.pressKey(" ");
			await setup.flush();
			const collapsedScreen = agent.terminal.screen();
			expect(setup.captureCharFrame()).not.toContain("OPAQUE TASK DETAILS");
			expect(setup.captureCharFrame()).toContain("TOP-OF-PREVIEW");
			expect(collapsedScreen.rows).toBeGreaterThan(initialScreen.rows);
			expect(resizes.length).toBeGreaterThan(resizeCount);
			setup.resize(120, 48);
			await setup.flush();
			expect(agent.terminal.screen().rows).toBeGreaterThan(collapsedScreen.rows);
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("fullscreen reserves its exit hint and restores chrome, details, focus, and terminal identity", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = attachParent(setup);
		const { agent, writes } = liveAgent(setup);
		const fullscreenChanges: boolean[] = [];
		let quit = 0;
		const options = {
			tasks,
			liveAgent: agent,
			onFullscreenChange: (fullscreen: boolean) => fullscreenChanges.push(fullscreen),
			onQuit: () => quit++,
		};
		let mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			const { columns, rows } = agent.terminal.screen();
			const terminalParent = agent.terminal.parent;
			agent.terminal.write("\x1b[1;1HFULLSCREEN LIVE OUTPUT");
			setup.mockInput.pressKey("f");
			await setup.flush();
			expect(agent.terminal.parent).toBe(terminalParent);
			expect([agent.terminal.x, agent.terminal.y]).toEqual([0, 0]);
			expect(setup.captureCharFrame()).toContain("FULLSCREEN LIVE OUTPUT");
			expect(setup.captureCharFrame()).toContain("Press Ctrl+Q to exit fullscreen");
			const hintRow = setup
				.captureCharFrame()
				.split("\n")
				.findIndex((line) => line.includes("exit fullscreen"));
			expect(agent.terminal.screen().columns).toBe(setup.renderer.width);
			expect(agent.terminal.y + agent.terminal.screen().rows).toBe(hintRow);
			for (const chrome of ["Filters", "First task", "Live preview", "OPAQUE TASK DETAILS", "Agent input"]) {
				expect(setup.captureCharFrame()).not.toContain(chrome);
			}
			setup.mockInput.pressKey("a");
			setup.mockInput.pressCtrlC();
			await setup.flush();
			expect(writes.join("")).toBe("a");
			expect(quit).toBe(0);
			expect(agent.terminal.focused).toBe(false);
			expect(agent.terminal.screen()).toMatchObject({ columns, rows });
			expect(setup.captureCharFrame()).toContain("OPAQUE TASK DETAILS");
			expect(setup.captureCharFrame()).toContain("First task");
			expect(fullscreenChanges).toEqual([true, false]);
			setup.mockInput.pressKey("f");
			await setup.flush();
			mount.dispose();
			mount = mountOpenTuiWorkspace(setup.renderer, parent, { ...options, fullscreen: true });
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("FULLSCREEN LIVE OUTPUT");
			setup.mockInput.pressKey("q", { ctrl: true });
			await setup.flush();
			expect(agent.terminal.focused).toBe(false);
			expect(agent.terminal.screen()).toMatchObject({ columns, rows });
			expect(writes.join("")).toBe("a");
			setup.mockInput.pressCtrlC();
			expect(quit).toBe(1);
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("Ctrl+C and Ctrl+Q leave focused preview without interrupting, quitting, or losing native paste", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const { agent, writes } = liveAgent(setup);
		let quit = 0;
		const cycles: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			liveAgent: agent,
			detailsVisible: false,
			onCycleMode: () => cycles.push("next"),
			onSessionAction: () => agent.terminal.focus(),
			onQuit: () => quit++,
		});
		try {
			await setup.flush();
			setup.mockInput.pressTab();
			await setup.flush();
			expect(cycles).toEqual(["next"]);
			expect(agent.terminal.focused).toBe(false);
			setup.mockInput.pressEnter();
			expect(agent.terminal.focused).toBe(true);
			setup.mockInput.pressTab();
			expect(writes.join("")).toBe("\t");
			await setup.mockInput.pasteBracketedText("native paste");
			setup.mockInput.pressCtrlC();
			expect(agent.terminal.focused).toBe(false);
			agent.terminal.focus();
			setup.mockInput.pressKey("q", { ctrl: true });
			expect(agent.terminal.focused).toBe(false);
			expect(writes.join("")).toBe("\tnative paste");
			expect(quit).toBe(0);
			setup.mockInput.pressCtrlC();
			expect(quit).toBe(1);
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("configured Program Exit closes in navigation and leaves the focused preview", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const { agent, writes } = liveAgent(setup);
		let quit = 0;
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			liveAgent: agent,
			keyboardOverrides: { "workspace.quit": { sequence: [{ key: "x", ctrl: true }] } },
			detailsVisible: false,
			onSessionAction: () => agent.terminal.focus(),
			onQuit: () => quit++,
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("[Ctrl+X] Exit");
			setup.mockInput.pressCtrlC();
			expect(quit).toBe(0);
			setup.mockInput.pressKey("x", { ctrl: true });
			expect(quit).toBe(1);
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(agent.terminal.focused).toBe(true);
			expect(setup.captureCharFrame()).toContain("[Ctrl+X] Leave preview · [Ctrl+Q] Leave agent");
			setup.mockInput.pressKey("x", { ctrl: true });
			await setup.flush();
			expect(agent.terminal.focused).toBe(false);
			expect(quit).toBe(1);
			expect(writes).toEqual([]);
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("renders one flat task list ordered by configured status then unknown statuses", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const entries = [
			{ id: "BACK-1", title: "Doing task", status: "Doing", done: false },
			{ id: "BACK-2", title: "First todo", status: "Todo", done: false },
			{ id: "BACK-3", title: "Review task", status: "Review", done: false },
			{ id: "BACK-4", title: "Second todo", status: "Todo", done: false },
		];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: entries,
			statuses: ["Todo", "Doing"],
			detailsVisible: false,
		});
		try {
			await setup.flush();
			const rows = setup.captureCharFrame().split("\n");
			const positions = ["First todo", "Second todo", "Doing task", "Review task"].map((title) =>
				rows.findIndex((line) => line.slice(0, 36).includes(title)),
			);
			expect(positions.every((position) => position >= 0)).toBe(true);
			expect(positions).toEqual([...positions].sort((left, right) => left - right));
			expect(setup.captureCharFrame()).toContain("Tasks (4)");
		} finally {
			mount.dispose();
		}
	});

	test("groups tasks with exact configured statuses into one bucket", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: [
				{ id: "BACK-1", title: "Exact todo", status: "To Do", done: false },
				{ id: "BACK-2", title: "Padded todo", status: "To Do", done: false },
				{ id: "BACK-3", title: "Lowercase todo", status: "To Do", done: false },
			],
			statuses: ["To Do"],
			detailsVisible: false,
		});
		try {
			await setup.flush();
			const rows = setup.captureCharFrame().split("\n");
			const positions = ["Exact todo", "Padded todo", "Lowercase todo"].map((title) =>
				rows.findIndex((line) => line.slice(0, 36).includes(title)),
			);
			expect(positions.every((position) => position >= 0)).toBe(true);
			expect(positions).toEqual([...positions].sort((left, right) => left - right));
		} finally {
			mount.dispose();
		}
	});

	test("strikes through done rows while keeping unfinished rows plain", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: tasks.map((task) => ({ ...task, done: task.id === "BACK-3" })),
			statuses: ["Todo", "Doing"],
			detailsVisible: false,
		});
		try {
			await setup.flush();
			const terminal = taskSpans(setup, "BACK-3").label;
			expect(terminal.attributes & TextAttributes.STRIKETHROUGH).toBe(TextAttributes.STRIKETHROUGH);
			expect(terminal.attributes & TextAttributes.BOLD).toBe(TextAttributes.BOLD);
			expect(taskSpans(setup, "BACK-2").label.attributes & TextAttributes.STRIKETHROUGH).toBe(0);
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			const selected = taskSpans(setup, "BACK-3").label;
			expect(selected.attributes & TextAttributes.STRIKETHROUGH).toBe(TextAttributes.STRIKETHROUGH);
			expect(selected.bg.toInts()).toEqual([203, 213, 225, 255]);
		} finally {
			mount.dispose();
		}
	});

	test("shift+z and shift+d route task actions and hide the done hint for done tasks", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const actions: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: tasks.map((task) => ({ ...task, done: task.id === "BACK-3" })),
			statuses: ["Todo", "Doing"],
			detailsVisible: false,
			onTaskAction: (task, action) => actions.push(`${task.id}:${action}`),
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Done");
			expect(setup.captureCharFrame()).toContain("Delete");
			setup.mockInput.pressKey("Z");
			setup.mockInput.pressKey("D");
			expect(actions).toEqual(["BACK-1:done", "BACK-1:delete"]);
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("Done");
			expect(setup.captureCharFrame()).toContain("Delete");
			setup.mockInput.pressKey("Z");
			expect(actions).toEqual(["BACK-1:done", "BACK-1:delete"]);
			setup.mockInput.pressKey("D");
			expect(actions).toEqual(["BACK-1:done", "BACK-1:delete", "BACK-3:delete"]);
		} finally {
			mount.dispose();
		}
	});

	test("active session dots stay visible on selected and unselected task rows", async () => {
		const setup = await createTestRenderer({ width: 120, height: 24, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			indicationByTask: new Map<string, AgentIndication>([
				["BACK-1", "working"],
				["BACK-2", "waiting"],
			]),
			sessionTaskIds: ["BACK-1"],
			detailsVisible: false,
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("● First task");
			expect(setup.captureCharFrame()).toContain("● Second task");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("● First task");
			expect(setup.captureCharFrame()).toContain("● Second task");
		} finally {
			mount.dispose();
		}
	});

	test("strong row selection and readable session dots survive focus changes and move with task selection", async () => {
		const setup = await createTestRenderer({ width: 120, height: 24, exitOnCtrlC: false, useMouse: true });
		renderers.push(setup);
		const { agent } = liveAgent(setup);
		const selected: string[] = [];
		const cycles: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			liveAgent: agent,
			indicationByTask: new Map<string, AgentIndication>([
				["BACK-1", "parked"],
				["BACK-2", "parked"],
			]),
			detailsVisible: false,
			onTaskSelect: (task) => selected.push(task.id),
			onCycleMode: () => cycles.push("next"),
		});
		const modal = new BoxRenderable(setup.renderer, {
			position: "absolute",
			left: 100,
			top: 0,
			width: 10,
			height: 3,
			focusable: true,
		});
		const expectSelection = (selectedId: string, otherId: string): void => {
			const selectedRow = taskSpans(setup, selectedId);
			const otherRow = taskSpans(setup, otherId);
			const background = selectedRow.label.bg.toInts();
			expect(background).toEqual([203, 213, 225, 255]);
			expect(selectedRow.label.fg.toInts()).toEqual([17, 17, 17, 255]);
			expect(selectedRow.marker.bg.toInts()).toEqual(background);
			expect(selectedRow.marker.fg.toInts()).toEqual([30, 64, 175, 255]);
			expect(otherRow.label.bg.toInts()).not.toEqual(background);
			expect(otherRow.marker.fg.toInts()).toEqual([96, 165, 250, 255]);
			expect(contrast(selectedRow.label.fg.toInts(), background)).toBeGreaterThan(7);
			expect(contrast(background, otherRow.label.bg.toInts())).toBeGreaterThan(3);
			expect(contrast(selectedRow.marker.fg.toInts(), background)).toBeGreaterThan(4.5);
			expect(contrast(otherRow.marker.fg.toInts(), otherRow.marker.bg.toInts())).toBeGreaterThan(4.5);
		};
		try {
			await setup.flush();
			expectSelection("BACK-1", "BACK-2");
			const beforeFocus = setup
				.captureCharFrame()
				.split("\n")
				.findIndex((row) => row.includes("First task"));
			setup.mockInput.pressTab();
			await setup.flush();
			expect(cycles).toEqual(["next"]);
			expect(agent.terminal.focused).toBe(false);
			expectSelection("BACK-1", "BACK-2");
			expect(
				setup
					.captureCharFrame()
					.split("\n")
					.findIndex((row) => row.includes("First task")),
			).toBe(beforeFocus);
			setup.renderer.root.add(modal);
			modal.focus();
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(selected).toEqual([]);
			expectSelection("BACK-1", "BACK-2");
			modal.blur();
			agent.terminal.focus();
			setup.mockInput.pressKey("q", { ctrl: true });
			await setup.flush();
			expect(agent.terminal.focused).toBe(false);
			expectSelection("BACK-1", "BACK-2");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expectSelection("BACK-2", "BACK-1");
			const firstRow = setup
				.captureCharFrame()
				.split("\n")
				.findIndex((row) => row.includes("First task"));
			await setup.mockMouse.click(8, firstRow);
			await setup.flush();
			expectSelection("BACK-1", "BACK-2");
			expect(selected).toEqual(["BACK-2", "BACK-1"]);
		} finally {
			modal.destroy();
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("task capacity keeps the selected row visible", async () => {
		const setup = await createTestRenderer({ width: 120, height: 14, exitOnCtrlC: false });
		renderers.push(setup);
		const manyTasks = Array.from({ length: 20 }, (_, index) => ({
			id: `BACK-${index + 1}`,
			title: `Task ${index + 1}`,
			status: "Todo",
			done: false,
		}));
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: manyTasks,
			detailsVisible: false,
		});
		try {
			await setup.flush();
			for (let index = 0; index < 19; index += 1) setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Task 20");
		} finally {
			mount.dispose();
		}
	});

	test("measured task viewport refreshes rows after resize, fullscreen, and task-pane changes", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const manyTasks = Array.from({ length: 20 }, (_, index) => ({
			id: `BACK-${index + 1}`,
			title: `Task ${index + 1}`,
			status: "Todo",
			done: false,
		}));
		const { agent } = liveAgent(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: manyTasks,
			liveAgent: agent,
			detailsVisible: false,
			keyboardOverrides: {
				"workspace.fullscreen": { sequence: [{ key: "x" }] },
				"workspace.quickPreviewExit": { sequence: [{ key: "y" }] },
				"workspace.toggleTaskPane": { sequence: [{ key: "z" }] },
			},
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Task 20");
			setup.resize(120, 14);
			await setup.flush();
			setup.resize(120, 40);
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Task 20");
			setup.mockInput.pressKey("x");
			await setup.flush();
			setup.mockInput.pressKey("y");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Task 20");
			setup.mockInput.pressKey("z");
			await setup.flush();
			setup.mockInput.pressKey("z");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Task 20");
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});
	test("footer separates session selection from the contextual Enter action", async () => {
		const setup = await createTestRenderer({ width: 36, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const sessionRequests: string[] = [];
		const handoffRequests: string[] = [];
		const agentConfigRequests: string[] = [];
		const agentStarts: string[] = [];
		let settingsRequests = 0;
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			sessionTaskIds: ["BACK-1"],
			onTaskCreate: () => {},
			onTaskAction: () => {},
			onSessionRequest: (task) => sessionRequests.push(task.id),
			onHandoffRequest: (task) => handoffRequests.push(task.id),
			onSettingsRequest: () => {
				settingsRequests += 1;
			},
			onAgentConfigRequest: (task) => agentConfigRequests.push(task.id),
			onSessionAction: (task) => agentStarts.push(task.id),
			onFilterRequest: () => {},
			onBoardRequest: () => {},
			onQuit: () => {},
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Choose session");
			expect(setup.captureCharFrame()).toContain("Handoff");
			expect(setup.captureCharFrame()).toContain("Start");
			expect(setup.captureCharFrame()).toContain("Exit");
			setup.mockInput.pressKey("s");
			setup.mockInput.pressKey("h");
			setup.mockInput.pressKey(",");
			setup.mockInput.pressKey("p");
			expect(sessionRequests).toEqual(["BACK-1"]);
			expect(handoffRequests).toEqual(["BACK-1"]);
			expect(settingsRequests).toBe(1);
			expect(agentConfigRequests).toEqual(["BACK-1"]);
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Choose session");
			expect(setup.captureCharFrame()).toContain("Start");
			expect(setup.captureCharFrame()).not.toContain("Handoff");
			setup.mockInput.pressEnter();
			expect(agentStarts).toEqual(["BACK-2"]);
		} finally {
			mount.dispose();
		}
	});

	test("descriptor overrides drive fullscreen, exit, and history without bypassing modal focus", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false, kittyKeyboard: true });
		renderers.push(setup);
		const { agent, writes } = liveAgent(setup);
		const history: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			liveAgent: agent,
			keyboardOverrides: {
				"workspace.fullscreen": { sequence: [{ key: "z" }] },
				"workspace.quickPreviewExit": { sequence: [{ key: "x", ctrl: true }] },
			},
			onHistoryBack: () => history.push("back"),
			onHistoryForward: () => history.push("forward"),
		});
		const modal = new BoxRenderable(setup.renderer, { width: 10, height: 5, focusable: true });
		try {
			await setup.flush();
			setup.mockInput.pressKey("f");
			expect(agent.terminal.focused).toBe(false);
			setup.mockInput.pressKey("[", { ctrl: true });
			setup.mockInput.pressKey("]", { ctrl: true });
			expect(history).toEqual(["back", "forward"]);
			setup.mockInput.pressKey("z");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Press Ctrl+X to exit fullscreen");
			setup.renderer.root.add(modal);
			modal.focus();
			setup.mockInput.pressKey("x", { ctrl: true });
			setup.mockInput.pressKey("[", { ctrl: true });
			expect(history).toEqual(["back", "forward"]);
			expect(writes).toEqual([]);
			modal.blur();
			agent.terminal.focus();
			setup.mockInput.pressKey("x", { ctrl: true });
			await setup.flush();
			expect(agent.terminal.focused).toBe(false);
			expect(agent.terminal.screen().columns).toBeLessThan(120);
			expect(writes).toEqual([]);
		} finally {
			modal.destroy();
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("keeps the top task visible for in-viewport moves and for a remount selecting a lower task", async () => {
		const setup = await createTestRenderer({ width: 120, height: 24, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = attachParent(setup);
		const manyTasks = Array.from({ length: 20 }, (_, index) => ({
			id: `BACK-${index + 1}`,
			title: `Task ${index + 1}`,
			status: "Todo",
			done: false,
		}));
		const rowOf = (id: string): number =>
			setup
				.captureCharFrame()
				.split("\n")
				.findIndex((line) => line.slice(0, 36).includes(id.replace("BACK-", "Task ")));
		const options = { tasks: manyTasks, detailsVisible: false };
		let mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			// The controller remounts on every selection; a remount that selects the second task
			// must keep the first task on screen instead of pinning the selection to the top row.
			mount.dispose();
			mount = mountOpenTuiWorkspace(setup.renderer, parent, { ...options, selectedTaskIndex: 1 });
			await setup.flush();
			expect(rowOf("BACK-1")).toBeGreaterThanOrEqual(0);
			expect(rowOf("BACK-1")).toBeLessThan(rowOf("BACK-2"));
			setup.mockInput.pressArrow("down");
			await setup.flush();
			expect(rowOf("BACK-1")).toBeGreaterThanOrEqual(0);
			expect(rowOf("BACK-1")).toBeLessThan(rowOf("BACK-3"));
		} finally {
			mount.dispose();
		}
	});

	test("scrolls one row past a viewport edge and retains the window across remounts, resizes, and shorter lists", async () => {
		const setup = await createTestRenderer({ width: 120, height: 21, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = attachParent(setup);
		const manyTasks = Array.from({ length: 20 }, (_, index) => ({
			id: `BACK-${index + 1}`,
			title: `Task ${index + 1}`,
			status: "Todo",
			done: false,
		}));
		const visibleTaskIds = (): string[] =>
			setup
				.captureCharFrame()
				.split("\n")
				.flatMap((line) => {
					const match = /Task \d+/.exec(line.slice(0, 36));
					return match ? [match[0]] : [];
				});
		const offsets: number[] = [];
		const options = {
			tasks: manyTasks,
			detailsVisible: false,
			onTaskScrollChange: (firstVisible: number) => offsets.push(firstVisible),
		};
		let mount = mountOpenTuiWorkspace(setup.renderer, parent, options);
		try {
			await setup.flush();
			for (let index = 0; index < 5; index += 1) setup.mockInput.pressArrow("down");
			await setup.flush();
			// Five in-viewport moves never scroll.
			expect(offsets).toEqual([]);
			expect(visibleTaskIds()[0]).toBe("Task 1");
			for (let index = 0; index < 14; index += 1) setup.mockInput.pressArrow("down");
			await setup.flush();
			// Each move below the last visible row advances the window by exactly one row.
			expect(offsets).toEqual([1, 2, 3, 4, 5]);
			const window = visibleTaskIds();
			expect(window[0]).toBe("Task 6");
			expect(window).toContain("Task 20");
			// A taller viewport fits the whole list, so the stale offset must not hide the top task.
			setup.resize(120, 48);
			await setup.flush();
			expect(visibleTaskIds()[0]).toBe("Task 1");
			setup.resize(120, 21);
			await setup.flush();
			expect(visibleTaskIds()).toEqual(window);
			// Moving back inside the window leaves it untouched.
			setup.mockInput.pressArrow("up");
			await setup.flush();
			expect(visibleTaskIds()).toEqual(window);
			// A remount that carries the reported offset restores the same window.
			mount.dispose();
			mount = mountOpenTuiWorkspace(setup.renderer, parent, {
				...options,
				selectedTaskIndex: 18,
				firstVisibleTaskIndex: offsets.at(-1) as number,
			});
			await setup.flush();
			expect(visibleTaskIds()).toEqual(window);
			// Moving above the first visible row scrolls the window up one row per move.
			const beforeTop = offsets.length;
			for (let index = 0; index < 19; index += 1) setup.mockInput.pressArrow("up");
			await setup.flush();
			expect(offsets.slice(beforeTop)).toEqual([4, 3, 2, 1, 0]);
			expect(visibleTaskIds()[0]).toBe("Task 1");
			// A shorter list (filter change) never leaves the selection outside the window.
			mount.dispose();
			mount = mountOpenTuiWorkspace(setup.renderer, parent, {
				...options,
				tasks: manyTasks.slice(0, 3),
				selectedTaskIndex: 0,
				firstVisibleTaskIndex: offsets.at(-1) as number,
			});
			await setup.flush();
			expect(visibleTaskIds()).toEqual(["Task 1", "Task 2", "Task 3"]);
		} finally {
			mount.dispose();
		}
	});

	test("g and Shift+G select the first and last task, while Home and End do not navigate boundaries", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const { agent, writes } = liveAgent(setup);
		const selected: string[] = [];
		const cycles: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			statuses: ["Todo", "Doing", "Empty"],
			liveAgent: agent,
			detailsVisible: false,
			onTaskSelect: (task) => selected.push(task.id),
			onCycleMode: () => cycles.push("next"),
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("[g] First");
			expect(setup.captureCharFrame()).toContain("[Shift+G] Last");
			setup.mockInput.pressKey("G");
			await setup.flush();
			expect(selected).toEqual(["BACK-3"]);
			expect(setup.captureCharFrame()).toContain("Third task");
			setup.mockInput.pressKey("g");
			await setup.flush();
			expect(selected).toEqual(["BACK-3", "BACK-1"]);
			expect(setup.captureCharFrame()).toContain("First task");
			// Home and End are not task-list navigation bindings.
			setup.mockInput.pressKey("\x1b[F");
			await setup.flush();
			expect(selected).toEqual(["BACK-3", "BACK-1"]);
			setup.mockInput.pressKey("\x1b[H");
			await setup.flush();
			expect(selected).toEqual(["BACK-3", "BACK-1"]);
			// Tab in the workspace cycles modes; it does not focus the preview terminal.
			setup.mockInput.pressTab();
			await setup.flush();
			expect(cycles).toEqual(["next"]);
			expect(agent.terminal.focused).toBe(false);
			setup.mockInput.pressKey("g");
			setup.mockInput.pressKey("G");
			await setup.flush();
			expect(selected).toEqual(["BACK-3", "BACK-1", "BACK-3"]);
			expect(writes.join("")).toBe("");
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("colours the row marker by indication and renders a parked dot", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			// Select the second row so BACK-1's marker keeps its indication colour, not the selection one.
			selectedTaskIndex: 1,
			indicationByTask: new Map<string, AgentIndication>([["BACK-1", "waiting"]]),
		});
		try {
			await setup.flush();
			const waiting = taskSpans(setup, "BACK-1").marker;
			expect(waiting.text).toBe("●");
			mount.setIndication(new Map<string, AgentIndication>([["BACK-1", "working"]]));
			await setup.flush();
			const working = taskSpans(setup, "BACK-1").marker;
			expect(working.text).toBe("●");
			expect(working.fg.toInts()).not.toEqual(waiting.fg.toInts());
			// Parked (unknown/cold-start) is a present blue dot, never an absent marker.
			mount.setIndication(new Map<string, AgentIndication>([["BACK-1", "parked"]]));
			await setup.flush();
			const parked = taskSpans(setup, "BACK-1").marker;
			expect(parked.text).toBe("●");
			expect(parked.fg.toInts()).toEqual([96, 165, 250, 255]);
			expect(parked.fg.toInts()).not.toEqual(waiting.fg.toInts());
			for (const [indication, color] of [
				["error", [255, 0, 0, 255]],
				["ended", [156, 163, 175, 255]],
			] as const) {
				mount.setIndication(new Map<string, AgentIndication>([["BACK-1", indication]]));
				await setup.flush();
				const marker = taskSpans(setup, "BACK-1").marker;
				expect(marker.text).toBe("●");
				expect([...marker.fg.toInts()]).toEqual([...color]);
			}
		} finally {
			mount.dispose();
		}
	});

	test("changes the selected row's marker colour by indication", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		// BACK-1 is selected by default, so its marker renders inside the selection fill. The dot must
		// still track the indication instead of collapsing to one fixed selected colour.
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			detailsVisible: false,
			indicationByTask: new Map<string, AgentIndication>([["BACK-1", "waiting"]]),
		});
		try {
			await setup.flush();
			const waiting = taskSpans(setup, "BACK-1").marker;
			expect(waiting.text).toBe("●");
			expect(waiting.fg.toInts()).toEqual([146, 64, 14, 255]);
			expect(contrast(waiting.fg.toInts(), waiting.bg.toInts())).toBeGreaterThan(4.5);
			mount.setIndication(new Map<string, AgentIndication>([["BACK-1", "working"]]));
			await setup.flush();
			const working = taskSpans(setup, "BACK-1").marker;
			expect(working.fg.toInts()).toEqual([22, 101, 52, 255]);
			expect(working.fg.toInts()).not.toEqual(waiting.fg.toInts());
			expect(contrast(working.fg.toInts(), working.bg.toInts())).toBeGreaterThan(4.5);
			// Parked keeps a dot on the selected row too, in the darkened selected blue.
			mount.setIndication(new Map<string, AgentIndication>([["BACK-1", "parked"]]));
			await setup.flush();
			const parked = taskSpans(setup, "BACK-1").marker;
			expect(parked.text).toBe("●");
			expect(parked.fg.toInts()).toEqual([30, 64, 175, 255]);
			expect(contrast(parked.fg.toInts(), parked.bg.toInts())).toBeGreaterThan(4.5);
		} finally {
			mount.dispose();
		}
	});

	test("renders agent, status, and selected mode in order", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const { agent } = liveAgent(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			activeAgentSession: {
				id: "running",
				taskId: "BACK-1",
				status: "running",
				preset: "test",
				cwd: "/actual/task/worktree",
			},
			liveAgent: agent,
			indicationByTask: new Map<string, AgentIndication>([["BACK-1", "waiting"]]),
		});
		try {
			await setup.flush();
			const line =
				setup
					.captureCharFrame()
					.split("\n")
					.find((value) => value.includes("Agent session ·")) ?? "";
			expect(line.slice(line.indexOf("Agent session ·")).trim()).toBe(
				"Agent session · running · mode · /actual/task/worktree",
			);
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});

	test("hides the session header and keeps the selected-mode placeholder without a session", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: [{ id: "BACK-1", title: "First task", status: "Todo", done: false }],
			selectedTaskIndex: 0,
			selectedModeId: "plan",
			modeProjectionByTask: () => ({ modeLabel: "PLAN", approved: false }),
			onSessionRequest: () => {},
			onSessionAction: () => {},
		});
		try {
			await setup.flush();
			const frame = setup.captureCharFrame();
			expect(frame).not.toContain("Agent session ·");
			expect(frame).toContain("No session in PLAN · Enter start · s choose session");
			expect(frame).toContain("[Enter]");
			expect(frame).toContain("[s] Choose session");
		} finally {
			mount.dispose();
		}
	});

	test("shows Enter resume and the configured S session-picker shortcut for ended sessions", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks: [{ id: "BACK-1", title: "First task", status: "Todo", done: false }],
			selectedTaskIndex: 0,
			activeAgentSession: { id: "ended", status: "stopped", preset: "test", taskId: "BACK-1", cwd: "/project" },
			sessionTaskIds: ["BACK-1"],
			keyboardOverrides: { "workspace.sessions": { sequence: [{ key: "r" }] } },
			onSessionAction: () => {},
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Session ended · Enter resume · r choose session");
		} finally {
			mount.dispose();
		}
	});

	test("does not render session details or a no-session placeholder when a session exists", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			activeAgentSession: { id: "sess-1", status: "running", preset: "claude", taskId: "BACK-1", cwd: "/project" },
			indicationByTask: new Map<string, AgentIndication>([["BACK-1", "waiting"]]),
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).not.toContain("Agent is waiting for input.");
			expect(setup.captureCharFrame()).not.toContain("No session in");
		} finally {
			mount.dispose();
		}
	});

	test("shows warming up in the agent header while the live agent is starting", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		renderers.push(setup);
		const { agent } = liveAgent(setup, "starting");
		const mount = mountOpenTuiWorkspace(setup.renderer, attachParent(setup), {
			tasks,
			activeAgentSession: {
				id: "starting",
				taskId: "BACK-1",
				status: "starting",
				preset: "test",
				cwd: "/actual/project",
			},
			sessionTaskIds: ["BACK-1"],
			liveAgent: agent,
			indicationByTask: new Map<string, AgentIndication>([["BACK-1", "waiting"]]),
		});
		try {
			await setup.flush();
			const frame = setup.captureCharFrame();
			const line = frame.split("\n").find((value) => value.includes("Agent session ·")) ?? "";
			expect(line.slice(line.indexOf("Agent session ·")).trim()).toBe(
				"Agent session · starting · mode · /actual/project",
			);
			expect(frame).not.toContain("Agent is warming up...");
		} finally {
			mount.dispose();
			agent.terminal.destroy();
		}
	});
});
