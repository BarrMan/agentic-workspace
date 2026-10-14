import { afterEach, describe, expect, it } from "bun:test";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import type { AgentSession } from "../agent-workspace/types.ts";
import { mountOpenTuiSessionPicker } from "../ui/opentui/session-picker.ts";

function session(id: string, createdAt: string): AgentSession {
	return {
		id,
		createdAt,
		taskId: "TASK-1",
		preset: "opencode",
		tmuxName: id,
		cwd: "/tmp",
		status: "stopped",
		outputPath: "/tmp/out",
		bootstrapPath: "/tmp/prompt",
	};
}

describe("native session picker", () => {
	const renderers: TestRendererSetup[] = [];
	afterEach(() => {
		for (const setup of renderers.splice(0)) setup.renderer.destroy();
	});

	it("sorts newest first and requires an explicit stopped-history resume", async () => {
		const setup = await createTestRenderer({ width: 130, height: 35 });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const selected: string[] = [];
		const mount = mountOpenTuiSessionPicker(setup.renderer, parent, {
			taskId: "TASK-1",
			sessions: [session("older", "2026-10-01"), session("newer", "2026-10-06")],
			activeSessionId: "older",
			onFocusLocal: (id) => {
				selected.push(id);
			},
			onResume: async (id) => {
				selected.push(id);
			},
			onDelete: async () => {},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressArrow("up");
			await setup.flush();
			const frame = setup.captureCharFrame();
			expect(frame.indexOf("newer")).toBeLessThan(frame.indexOf("older"));
			expect(frame).toContain("[active]");
			expect(frame).toContain("resume stopped");
			setup.mockInput.pressKey("r");
			await setup.flush();
			expect(selected).toEqual(["newer"]);
		} finally {
			mount.dispose();
		}
	});

	it("keeps selection on failure and cancellation never selects a session", async () => {
		const setup = await createTestRenderer({ width: 130, height: 35, kittyKeyboard: true });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const terminal = new BoxRenderable(setup.renderer, { width: 1, height: 1, focusable: true });
		parent.add(terminal);
		terminal.focus();
		let closed = false;
		let attempts = 0;
		let terminalInput = "";
		const onKey = (event: { name: string }): void => {
			if (setup.renderer.currentFocusedRenderable === terminal) terminalInput += event.name;
		};
		setup.renderer.keyInput.on("keypress", onKey);
		const mount = mountOpenTuiSessionPicker(setup.renderer, parent, {
			taskId: "TASK-1",
			sessions: [session("exact", "2026-10-06")],
			activeSessionId: "exact",
			onFocusLocal: () => {},
			onResume: async () => {
				attempts += 1;
				throw new Error("Exact session missing");
			},
			onDelete: async () => {},
			onClose: () => {
				closed = true;
			},
		});
		try {
			setup.mockInput.pressKey("r");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Exact session missing");
			expect(closed).toBeFalse();
			setup.mockInput.pressKey("x");
			expect(terminalInput).toBe("");
			setup.mockInput.pressKey("ESCAPE");
			await setup.flush();
			expect(closed).toBeTrue();
			expect(setup.renderer.currentFocusedRenderable).toBe(terminal);
			setup.mockInput.pressKey("x");
			expect(terminalInput).toBe("x");
			expect(attempts).toBe(1);
		} finally {
			setup.renderer.keyInput.off("keypress", onKey);
			mount.dispose();
		}
	});

	it("Enter routes an externally running session through the focus callback", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30 });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const terminal = new BoxRenderable(setup.renderer, { width: 1, height: 1, focusable: true });
		parent.add(terminal);
		terminal.focus();
		const focused: string[] = [];
		const resumed: string[] = [];
		let terminalInput = "";
		const onKey = (event: { name: string }): void => {
			if (setup.renderer.currentFocusedRenderable === terminal) terminalInput += event.name;
		};
		setup.renderer.keyInput.on("keypress", onKey);
		const mount = mountOpenTuiSessionPicker(setup.renderer, parent, {
			taskId: "TASK-1",
			sessions: [{ ...session("external-id", "2026-10-06"), status: "running" }],
			onFocusLocal: (id) => focused.push(id),
			onResume: async (id) => {
				resumed.push(id);
			},
			onDelete: async () => {},
			onClose: () => {},
		});
		try {
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(focused).toEqual(["external-id"]);
			expect(resumed).toEqual([]);
			expect(setup.captureCharFrame()).not.toContain("sessions");
			expect(setup.renderer.currentFocusedRenderable).toBe(terminal);
			setup.mockInput.pressKey("x");
			expect(terminalInput).toBe("x");
		} finally {
			setup.renderer.keyInput.off("keypress", onKey);
			mount.dispose();
		}
	});

	it("shows empty state and Enter cannot select a nonexistent conversation", async () => {
		const setup = await createTestRenderer({ width: 100, height: 30 });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		let selected = false;
		const mount = mountOpenTuiSessionPicker(setup.renderer, parent, {
			taskId: "TASK-1",
			sessions: [],
			onFocusLocal: () => {},
			onResume: async () => {
				selected = true;
			},
			onDelete: async () => {},
			onClose: () => {},
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("No sessions for this task");
			setup.mockInput.pressEnter();
			await setup.flush();
			expect(selected).toBeFalse();
		} finally {
			mount.dispose();
		}
	});

	it("confirms before deleting and removes the row on success", async () => {
		const setup = await createTestRenderer({ width: 130, height: 35 });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const deleted: string[] = [];
		let closed = false;
		const mount = mountOpenTuiSessionPicker(setup.renderer, parent, {
			taskId: "TASK-1",
			sessions: [session("older", "2026-10-01"), session("newer", "2026-10-06")],
			activeSessionId: "newer",
			onFocusLocal: () => {},
			onResume: async () => {},
			onDelete: async (id) => {
				deleted.push(id);
			},
			onClose: () => {
				closed = true;
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressKey("d");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Delete session newer?");
			expect(deleted).toEqual([]);
			setup.mockInput.pressKey("y");
			await setup.flush();
			expect(deleted).toEqual(["newer"]);
			const frame = setup.captureCharFrame();
			expect(frame).not.toContain("newer");
			expect(frame).toContain("older");
			expect(closed).toBeFalse();
		} finally {
			mount.dispose();
		}
	});

	it("cancelling a delete confirmation deletes nothing and keeps the picker open", async () => {
		const setup = await createTestRenderer({ width: 130, height: 35 });
		renderers.push(setup);
		const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
		setup.renderer.root.add(parent);
		const deleted: string[] = [];
		let closed = false;
		const mount = mountOpenTuiSessionPicker(setup.renderer, parent, {
			taskId: "TASK-1",
			sessions: [session("older", "2026-10-01"), session("newer", "2026-10-06")],
			activeSessionId: "newer",
			onFocusLocal: () => {},
			onResume: async () => {},
			onDelete: async (id) => {
				deleted.push(id);
			},
			onClose: () => {
				closed = true;
			},
		});
		try {
			await setup.flush();
			setup.mockInput.pressKey("d");
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Delete session newer?");
			setup.mockInput.pressKey("n");
			await setup.flush();
			expect(deleted).toEqual([]);
			expect(closed).toBeFalse();
			expect(setup.captureCharFrame()).not.toContain("Delete session");
			setup.mockInput.pressKey("d");
			await setup.flush();
			setup.mockInput.pressKey("ESCAPE");
			await setup.flush();
			expect(deleted).toEqual([]);
			expect(closed).toBeFalse();
			expect(setup.captureCharFrame()).toContain("newer");
		} finally {
			mount.dispose();
		}
	});
});
