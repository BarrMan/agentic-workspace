import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable, KeyEvent, parseKeypress } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { findShortcutConflict, shortcutsConfig } from "../renderer/opentui/keybindings.ts";
import type { TaskArtifactViewApi } from "../renderer/opentui/task-artifact-view.ts";
import { mountOpenTuiWorkspace } from "../renderer/opentui/workspace.ts";

function key(sequence: string): KeyEvent {
	const parsed = parseKeypress(sequence, { useKittyKeyboard: true });
	if (!parsed) throw new Error(`Could not parse ${JSON.stringify(sequence)}`);
	return new KeyEvent(parsed);
}

describe("workspace artifact shortcut overrides", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("opens artifacts via a conflict-free project binding", async () => {
		const customBinding = { sequence: [{ key: "o", ctrl: true }] } as const;
		const overrides = {
			"workspace.openArtifacts": customBinding,
		} as const;
		expect(
			findShortcutConflict(shortcutsConfig.workspace.openArtifacts, { key: "o", ctrl: true }, overrides),
		).toBeUndefined();
		const setup = await createTestRenderer({ width: 100, height: 30, exitOnCtrlC: false });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const calls: string[] = [];
		const listCallStacks: string[] = [];
		const api: TaskArtifactViewApi = {
			list: async (taskId) => {
				calls.push(`list:${taskId}`);
				listCallStacks.push(new Error().stack ?? "");
				return [{ path: "plan.md", state: "draft", size: 4, type: "text" }];
			},
			read: async () => new TextEncoder().encode("plan"),
			write: async () => {},
		};
		const navigation: string[] = [];
		const mount = mountOpenTuiWorkspace(setup.renderer, parent, {
			tasks: [
				{ id: "TASK-1", title: "One", status: "To Do" },
				{ id: "TASK-2", title: "Two", status: "To Do" },
			],
			taskArtifactApi: api,
			keyboardOverrides: overrides,
			onCycleMode: () => navigation.push("tab"),
			onAgentStart: (task) => navigation.push(`enter:${task.id}`),
		});
		const send = (sequence: string) => setup.renderer.keyInput.emit("keypress", key(sequence));
		const settle = async () => {
			for (let i = 0; i < 8; i++) await Promise.resolve();
		};
		try {
			send("\x1f"); // Ctrl+Shift+O default
			await settle();
			expect(calls).toEqual([]);
			send("\x0f"); // project-local Ctrl+O
			await settle();
			expect(calls).toContain("list:TASK-1");
			send("\x1b[B");
			await settle();
			expect(calls.filter((call) => call === "list:TASK-1")).toHaveLength(3);
			expect(listCallStacks[2]).toContain("at navigate (");
			expect(listCallStacks[2]).toContain("task-artifact-view.ts");
			send("\r");
			send("\t");
			await settle();
			expect(navigation).toEqual(["enter:TASK-1", "tab"]);
		} finally {
			mount.dispose();
		}
	});
});
