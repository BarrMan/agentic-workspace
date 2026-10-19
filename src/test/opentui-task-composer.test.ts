import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentConfiguration } from "../model/session/types.ts";
import type { Task, TaskCreateInput } from "../model/types.ts";
import { mountOpenTuiTaskComposer } from "../renderer/opentui/task-composer.ts";

function configuration(overrides: Partial<AgentConfiguration> = {}): AgentConfiguration {
	return {
		selectedPreset: "existing",
		presets: {
			existing: { command: "existing {prompt}", env: {}, prepare: "", bootstrap: "opencode" },
			alternate: { command: "alternate {prompt}", env: {}, prepare: "", bootstrap: "opencode" },
		},
		sessions: { worktreePerTask: false, yoloMode: false },
		...overrides,
	};
}

function parent(setup: TestRendererSetup): BoxRenderable {
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	return root;
}

function fakeTask(input: TaskCreateInput): Task {
	return {
		id: "TASK-1",
		title: input.title,
		status: input.status ?? "To Do",
	} as Task;
}

/**
 * Field order with a configuration and no projects: title, description, status, type,
 * priority, agentPreset, worktreePerTask, yoloMode.
 */
async function focusWithTab(setup: TestRendererSetup, tabs: number): Promise<void> {
	for (let index = 0; index < tabs; index += 1) setup.mockInput.pressTab();
	await setup.flush();
}

describe("openTUI task composer", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("renders both session checkboxes with the inherited project state", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do", "Done"],
			agentConfiguration: configuration({ sessions: { worktreePerTask: true, yoloMode: false } }),
			persist: async (input) => fakeTask(input),
		});
		try {
			await setup.flush();
			await focusWithTab(setup, 7);
			expect(setup.captureCharFrame()).toContain("[x] Worktree per task");
			await focusWithTab(setup, 1);
			expect(setup.captureCharFrame()).toContain("[ ] YOLO mode");
		} finally {
			mount.dispose();
		}
	});

	it("toggles the focused checkbox with Space and Enter", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do", "Done"],
			agentConfiguration: configuration(),
			persist: async (input) => fakeTask(input),
		});
		try {
			await setup.flush();
			await focusWithTab(setup, 7);
			expect(setup.captureCharFrame()).toContain("[ ] Worktree per task");
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("[x] Worktree per task");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("[ ] Worktree per task");
		} finally {
			mount.dispose();
		}
	});

	it("persists a changed session value as card-scope agentConfiguration.sessions", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const inputs: TaskCreateInput[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do", "Done"],
			agentConfiguration: configuration(),
			persist: async (input) => {
				inputs.push(input);
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Toggle task");
			await focusWithTab(setup, 6);
			setup.mockInput.pressKey(" ");
			await setup.flush();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(inputs).toHaveLength(1);
			expect(inputs[0]?.title).toBe("Toggle task");
			expect(inputs[0]?.agentConfiguration?.sessions).toEqual({ worktreePerTask: true, yoloMode: false });
		} finally {
			mount.dispose();
		}
	});

	it("omits agentConfiguration when sessions are unchanged and the preset is inherited", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const inputs: TaskCreateInput[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do", "Done"],
			agentConfiguration: configuration(),
			persist: async (input) => {
				inputs.push(input);
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Inherited task");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(inputs).toHaveLength(1);
			expect(inputs[0]?.agentConfiguration).toBeUndefined();
		} finally {
			mount.dispose();
		}
	});

	it("still persists an explicitly chosen preset", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const inputs: TaskCreateInput[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do", "Done"],
			agentConfiguration: configuration(),
			persist: async (input) => {
				inputs.push(input);
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Preset task");
			await focusWithTab(setup, 5);
			setup.mockInput.pressArrow("down");
			setup.mockInput.pressArrow("down");
			await setup.flush();
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(inputs).toHaveLength(1);
			expect(inputs[0]?.agentConfiguration?.selectedPreset).toBe("alternate");
			expect(inputs[0]?.agentConfiguration?.sessions).toEqual({ worktreePerTask: false, yoloMode: false });
		} finally {
			mount.dispose();
		}
	});

	it("cycles select fields with arrow keys and wraps around both directions", async () => {
		const setup = await createTestRenderer({ width: 80, height: 24, kittyKeyboard: true });
		renderers.push(setup);
		const inputs: TaskCreateInput[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do", "Done"],
			persist: async (input) => {
				inputs.push(input);
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Cycler task");
			await focusWithTab(setup, 2);
			expect(setup.captureCharFrame()).toContain("◀ To Do ▶");
			setup.mockInput.pressArrow("right");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("◀ Done ▶");
			setup.mockInput.pressArrow("right");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("◀ To Do ▶");
			setup.mockInput.pressArrow("left");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("◀ Done ▶");
			setup.mockInput.pressArrow("up");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("◀ To Do ▶");
			setup.mockInput.pressArrow("right");
			setup.mockInput.pressArrow("right");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("◀ To Do ▶");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.flush();
			expect(inputs).toHaveLength(1);
			expect(inputs[0]?.status).toBe("To Do");
		} finally {
			mount.dispose();
		}
	});
});

type PersistCall = { input: TaskCreateInput; groupId: string | null };

describe("native task composer group context", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("renders a checked Root and persists to the root by default", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true });
		renderers.push(setup);
		const calls: PersistCall[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do", "In Progress"],
			persist: async (input, context) => {
				calls.push({ input, groupId: context.groupId });
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			const frame = setup.captureCharFrame();
			expect(frame).toContain("[x] Root");
			expect(frame).not.toContain("[ ] Root");

			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Grouped task");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.waitFor(() => calls.length > 0);
			expect(calls).toHaveLength(1);
			expect(calls[0]?.groupId).toBeNull();
			expect(calls[0]?.input.title).toBe("Grouped task");
		} finally {
			mount.dispose();
		}
	});

	it("renders an unchecked Root naming the default group and persists into it", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true });
		renderers.push(setup);
		const calls: PersistCall[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do"],
			defaultGroupId: "g1",
			defaultGroupName: "Work",
			persist: async (input, context) => {
				calls.push({ input, groupId: context.groupId });
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			const frame = setup.captureCharFrame();
			expect(frame).toContain('[ ] Root (uncheck to add inside "Work")');

			setup.mockInput.pressTab();
			await setup.mockInput.typeText("In group");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.waitFor(() => calls.length > 0);
			expect(calls[0]?.groupId).toBe("g1");
		} finally {
			mount.dispose();
		}
	});

	it("checks Root to opt out of the default group", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true });
		renderers.push(setup);
		const calls: PersistCall[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do"],
			defaultGroupId: "g1",
			defaultGroupName: "Work",
			persist: async (input, context) => {
				calls.push({ input, groupId: context.groupId });
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressKey(" ");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain('[x] Root (uncheck to add inside "Work")');

			setup.mockInput.pressTab();
			await setup.mockInput.typeText("At root");
			setup.mockInput.pressKey("s", { ctrl: true });
			await setup.waitFor(() => calls.length > 0);
			expect(calls[0]?.groupId).toBeNull();
		} finally {
			mount.dispose();
		}
	});

	it("resolves null and does not persist on Escape", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true });
		renderers.push(setup);
		const calls: PersistCall[] = [];
		const mount = mountOpenTuiTaskComposer(setup.renderer, parent(setup), {
			statuses: ["To Do"],
			persist: async (input, context) => {
				calls.push({ input, groupId: context.groupId });
				return fakeTask(input);
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressEscape();
			expect(await mount.result).toBeNull();
			expect(calls).toHaveLength(0);
		} finally {
			mount.dispose();
		}
	});
});
