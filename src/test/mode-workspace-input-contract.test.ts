import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable, KeyEvent, parseKeypress } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mountOpenTuiWorkspace } from "../renderer/opentui/workspace.ts";
import { createWorkspaceAgent } from "../renderer/opentui/workspace-agent.ts";
import type { AgentHost } from "../runtime/live/agent-host.ts";

function key(sequence: string): KeyEvent {
	const parsed = parseKeypress(sequence, { useKittyKeyboard: true });
	if (!parsed) throw new Error(`Could not parse ${JSON.stringify(sequence)}`);
	return new KeyEvent(parsed);
}

describe("workspace mode input contract", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("routes Tab to mode selection, forwards Tab to focused agent input, and preserves Ctrl+Q/Ctrl+C", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const modes: string[] = [];
		const quit: string[] = [];
		const writes: string[] = [];
		const host = {
			sendBytes: (bytes: Uint8Array) => writes.push(new TextDecoder().decode(bytes)),
			resize: async () => {},
		} as unknown as AgentHost;
		const terminal = createWorkspaceAgent(setup.renderer, host, 80, 24, (error) => {
			throw error;
		});
		const task = { id: "TASK-1", title: "Input routing", status: "To Do" };
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [task],
			selectedModeId: "plan",
			onCycleMode: () => modes.push("cycle"),
			onQuit: () => quit.push("quit"),
			onAgentStart: () => modes.push("launch"),
			liveAgent: { taskId: task.id, label: "test", status: "running", host, terminal },
		});
		try {
			setup.renderer.keyInput.emit("keypress", key("\t"));
			expect(modes).toEqual(["cycle"]);
			expect(quit).toEqual([]);

			terminal.emit("focused");
			setup.renderer.keyInput.emit("keypress", key("\t"));
			expect(writes).toContain("\t");
			expect(modes).toEqual(["cycle"]);

			terminal.blur();
			setup.renderer.keyInput.emit("keypress", key("\x11"));
			expect(quit).toEqual([]);
			setup.renderer.keyInput.emit("keypress", key("\x03"));
			expect(quit).toEqual(["quit"]);
			expect(modes).not.toContain("launch");
		} finally {
			mount.dispose();
			terminal.destroy();
		}
	});
});
