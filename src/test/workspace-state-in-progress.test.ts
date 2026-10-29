import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Session } from "../model/session/session.ts";
import type { AgentSession, SessionFactory, SessionLaunchContext, SessionSnapshot } from "../model/session/types.ts";
import { Storage } from "../storage/storage.ts";
import { initializeTestProject } from "./test-utils.ts";

const roots: string[] = [];

function factory(beforeStart: (context: SessionLaunchContext) => Promise<void> = async () => {}): SessionFactory {
	return ((_taskId: string, modeId: string, record?: AgentSession) => {
		if (!record) throw new Error("Expected a durable session record.");
		let currentRecord: Readonly<AgentSession> = record;
		let currentModeId = modeId;
		let snapshot: SessionSnapshot = { state: "stopped", activity: "unknown", idleSince: null };
		return {
			id: record.id,
			get record() {
				return currentRecord;
			},
			get modeId() {
				return currentModeId;
			},
			replaceLoadedRecord(record: Readonly<AgentSession>, nextModeId: string) {
				currentRecord = record;
				currentModeId = nextModeId;
			},
			moveToMode(nextModeId: string) {
				currentModeId = nextModeId;
			},
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
		const storage = Storage.open(root);
		const core = new Core(root, {
			storage,
			sessionFactory: factory(async ({ taskId, modeId }) => {
				const history = await core.store.read(taskId);
				expect(history.modes[modeId]?.sessions).toHaveLength(1);
				expect((await core.tasks.getTask(taskId))?.status).toBe("In Progress");
			}),
		});
		await initializeTestProject(core, "Session status coordination");
		const { task } = await core.tasks.create({ title: "Move me", status: "To Do" });
		const session = await core.newSession(task);
		expect(session.snapshot.state).toBe("running");
		expect((await core.tasks.getTask(task.id))?.status).toBe("In Progress");
	});

	test("leaves a terminal task unchanged before starting", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-session-in-progress-"));
		roots.push(root);
		const core = new Core(root, { sessionFactory: factory() });
		await initializeTestProject(core, "Session status coordination");
		const { task } = await core.tasks.create({ title: "Already shipped", status: "Done" });
		const completed = await core.storage.withTaskLock(task.id, (current) =>
			core.tasks.edit({ ...current, done: true }),
		);
		await core.newSession(completed);
		expect((await core.tasks.getTask(task.id))?.status).toBe("Done");
	});

	test("does not reserve or start when status coordination fails", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-session-in-progress-"));
		roots.push(root);
		const storage = Storage.open(root);
		const core = new Core(root, { storage, sessionFactory: factory() });
		await initializeTestProject(core, "Session status coordination");
		const { task } = await core.tasks.create({ title: "Cannot change", status: "To Do" });
		const saveTask = storage.saveTask.bind(storage);
		storage.saveTask = async () => {
			throw new Error("status write failed");
		};
		try {
			await expect(core.newSession(task)).rejects.toThrow("status write failed");
			expect(Object.values((await core.store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);
		} finally {
			storage.saveTask = saveTask;
		}
	});
});
