import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionService, SessionRuntimeOrigin } from "../agent-workspace/sessions.ts";
import { WorkspaceStateService } from "../agent-workspace/workspace-state.ts";
import { Core } from "../core/agentic-workspace.ts";
import { SessionApplication } from "../core/session-application.ts";
import { initializeTestProject } from "./test-utils.ts";

const roots: string[] = [];

async function project(): Promise<Core> {
	const root = await mkdtemp(join(tmpdir(), "agentic-workspace-workspace-state-"));
	roots.push(root);
	const core = new Core(root);
	await initializeTestProject(core, "Workspace state");
	return core;
}

function origin(taskId: string, sessionId: string): SessionRuntimeOrigin {
	return {
		paneId: "%1",
		record: {
			id: sessionId,
			taskId,
			preset: "test",
			tmuxName: sessionId,
			cwd: "/tmp",
			createdAt: "2026-01-01T00:00:00.000Z",
			status: "running",
			outputPath: "/tmp/output",
			bootstrapPath: "/tmp/bootstrap",
		},
	};
}

function service(core: Core, currentTask?: Awaited<ReturnType<Core["loadTaskById"]>>): WorkspaceStateService {
	// The session record itself is irrelevant to the status policy under test.
	const sessions = {
		activateNativeSession: async (
			_taskId: string,
			_sessionId: string,
			_origin: SessionRuntimeOrigin,
			afterActivate?: (task: NonNullable<typeof currentTask>) => Promise<void>,
		) => {
			if (currentTask) await afterActivate?.(currentTask);
			return currentTask !== undefined;
		},
	} as unknown as AgentSessionService;
	return new WorkspaceStateService(core, { sessions });
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WorkspaceStateService.activateSession", () => {
	test("owns a distinct session application for each workspace context", async () => {
		const core = await project();
		const first = new WorkspaceStateService(core);
		const second = new WorkspaceStateService(core);
		expect(first.sessionApplication).toBeInstanceOf(SessionApplication);
		expect(second.sessionApplication).toBeInstanceOf(SessionApplication);
		expect(first.sessionApplication).not.toBe(second.sessionApplication);
	});

	test("moves a To Do task into the configured In Progress status", async () => {
		const core = await project();
		const { task } = await core.createTaskFromInput({ title: "Move me", status: "To Do" });
		const status = await service(core, task).activateSession(task.id, "session-1", origin(task.id, "session-1"));
		expect(status).toEqual({ activated: true, status: "In Progress" });
		expect((await core.loadTaskById(task.id))?.status).toBe("In Progress");
	});

	test("leaves a terminal (Done) task untouched", async () => {
		const core = await project();
		const { task } = await core.createTaskFromInput({ title: "Already shipped", status: "Done" });
		const status = await service(core, task).activateSession(task.id, "session-1", origin(task.id, "session-1"));
		expect(status).toEqual({ activated: true });
		expect((await core.loadTaskById(task.id))?.status).toBe("Done");
	});

	test("is idempotent when the task is already In Progress", async () => {
		const core = await project();
		const { task } = await core.createTaskFromInput({ title: "Already active", status: "In Progress" });
		const status = await service(core, task).activateSession(task.id, "session-1", origin(task.id, "session-1"));
		expect(status).toEqual({ activated: true, status: "In Progress" });
		expect((await core.loadTaskById(task.id))?.status).toBe("In Progress");
	});

	test("never nudges a task into the terminal column of a two-status configuration", async () => {
		const core = {
			filesystem: { loadConfig: async () => ({ statuses: ["Backlog", "Shipped"] }) },
		} as unknown as Core;
		const status = await new WorkspaceStateService(core, {
			sessions: { activateNativeSession: async () => false } as unknown as AgentSessionService,
			sessionApplication: {} as SessionApplication,
		}).activateSession("TASK-1", "session-1", origin("TASK-1", "session-1"));
		expect(status).toEqual({ activated: false });
	});
});
