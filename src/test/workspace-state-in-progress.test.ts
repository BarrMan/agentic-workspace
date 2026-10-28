import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeAgentConfiguration } from "../controller/agent-configuration.ts";
import { Core } from "../controller/agentic-workspace.ts";
import type { Session } from "../model/session/session.ts";
import type { AgentSession, SessionFactory, SessionLaunchContext, SessionSnapshot } from "../model/session/types.ts";
import { initializeTestProject } from "./test-utils.ts";

const roots: string[] = [];

function factory(beforeStart: (context: SessionLaunchContext) => Promise<void> = async () => {}): SessionFactory {
	return ((_taskId: string, _modeId: string, record?: AgentSession) => {
		if (!record) throw new Error("Expected a durable session record.");
		let snapshot: SessionSnapshot = { state: "stopped", activity: "unknown", idleSince: null };
		return {
			id: record.id,
			record,
			moveToMode() {},
			get view() {
				return snapshot;
			},
			async start(context: SessionLaunchContext) {
				await beforeStart(context);
				snapshot = { state: "running", activity: "working", idleSince: null };
			},
			async stop() {
				snapshot = { state: "stopped", activity: "unknown", idleSince: null };
			},
			async serialize() {
				return { ...record };
			},
		} as unknown as Session;
	}) as SessionFactory;
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("session in-progress status coordination", () => {
	test("moves an unfinished task before reservation and startup", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-session-in-progress-"));
		roots.push(root);
		let core!: Core;
		core = new Core(root, {
			sessionFactory: factory(async ({ taskId, modeId }) => {
				const history = await core.sessionApplication.store.read(taskId);
				expect(history.modes[modeId]?.sessions).toHaveLength(1);
				expect((await core.loadTaskById(taskId))?.status).toBe("In Progress");
			}),
		});
		await initializeTestProject(core, "Session status coordination");
		await initializeAgentConfiguration(core, "project");
		const { task } = await core.createTaskFromInput({ title: "Move me", status: "To Do" });
		const session = await core.sessionApplication.newSession(task);
		expect(session.snapshot.state).toBe("running");
		expect((await core.loadTaskById(task.id))?.status).toBe("In Progress");
	});

	test("leaves a terminal task unchanged before starting", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-session-in-progress-"));
		roots.push(root);
		const core = new Core(root, { sessionFactory: factory() });
		await initializeTestProject(core, "Session status coordination");
		await initializeAgentConfiguration(core, "project");
		const { task } = await core.createTaskFromInput({ title: "Already shipped", status: "Done" });
		await core.sessionApplication.newSession(task);
		expect((await core.loadTaskById(task.id))?.status).toBe("Done");
	});

	test("does not reserve or start when status coordination fails", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-session-in-progress-"));
		roots.push(root);
		const core = new Core(root, { sessionFactory: factory() });
		await initializeTestProject(core, "Session status coordination");
		await initializeAgentConfiguration(core, "project");
		const { task } = await core.createTaskFromInput({ title: "Cannot change", status: "To Do" });
		const update = core.updateTaskFromInput.bind(core);
		core.updateTaskFromInput = async () => {
			throw new Error("status write failed");
		};
		try {
			await expect(core.sessionApplication.newSession(task)).rejects.toThrow("status write failed");
			expect(
				Object.values((await core.sessionApplication.store.read(task.id)).modes).flatMap(({ sessions }) => sessions),
			).toEqual([]);
		} finally {
			core.updateTaskFromInput = update;
		}
	});
});
