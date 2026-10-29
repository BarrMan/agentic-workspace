import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BoxRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import type { AgentSession } from "../model/session/types.ts";
import { mountOpenTuiWorkspace } from "../renderer/opentui/workspace.ts";
import { modeSessionIndication } from "../renderer/opentui/workspace-session-monitor.ts";
import { SessionStore } from "../storage/session-store.ts";

/**
 * A row dot comes only from that task's active session in its selected mode. The compatibility
 * flattened session list is deliberately not the source of the active pointer.
 */
function session(id: string, taskId: string): AgentSession {
	return {
		id,
		taskId,
		preset: "test",
		tmuxName: id,
		createdAt: "2026-01-01T00:00:00.000Z",
		outputPath: "/tmp/output",
		bootstrapPath: "/tmp/bootstrap",
	};
}

describe("workspace row dot projection", () => {
	const directories: string[] = [];

	afterEach(async () => {
		await Promise.all(
			directories.splice(0).map(async (directory) => await rm(directory, { recursive: true, force: true })),
		);
	});

	it("renders a plan-mode active session dot from idle activity", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-dot-"));
		directories.push(root);
		await mkdir(join(root, ".agentic-workspace"), { recursive: true });
		const store = new SessionStore(root);
		await store.insertTask("TASK-1");
		const id = "plan-session";
		// Production stores a task's session under its owning mode; the default catalog mode is "plan"
		// (config.ts getDefaultModeCatalog), not the hardcoded compatibility lane "build".
		await store.reserveSession("TASK-1", "plan", session(id, "TASK-1"), id);

		const plan = await store.readMode("TASK-1", "plan");
		const active = plan.sessions.find((candidate) => candidate.id === plan.activeSessionId);
		expect(active?.id).toBe(id);
		const indication = modeSessionIndication({ state: "running", activity: "idle", idleSince: 1 });
		expect(indication).toBe("parked");
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		const mount = mountOpenTuiWorkspace(setup.renderer, setup.renderer.root as unknown as BoxRenderable, {
			tasks: [{ id: "TASK-1", title: "Plan session task", status: "To Do", done: false }],
			selectedModeId: "plan",
			selectedTaskIndex: 0,
			modeProjectionByTask: () => ({ modeLabel: "PLAN", approved: false }),
			indicationByTask: new Map([["TASK-1", indication!]]),
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("● Plan session task");
		} finally {
			mount.dispose();
			setup.renderer.destroy();
		}
	});

	it("does not project a dot when the selected mode has no active session", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-dot-"));
		directories.push(root);
		await mkdir(join(root, ".agentic-workspace"), { recursive: true });
		const store = new SessionStore(root);
		await store.insertTask("TASK-1");
		const id = "build-session";
		await store.reserveSession("TASK-1", "build", session(id, "TASK-1"), id);

		const build = await store.readMode("TASK-1", "build");
		expect(build.activeSessionId).toBe(id);
		const plan = await store.readMode("TASK-1", "plan");
		expect(plan.activeSessionId).toBeUndefined();
		expect(modeSessionIndication(undefined)).toBeUndefined();
	});
});
