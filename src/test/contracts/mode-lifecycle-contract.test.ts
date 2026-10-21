import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../../controller/agentic-workspace.ts";
import { Session, type SessionRuntime } from "../../model/session/session.ts";
import type { RunningExecution, SessionFactory, SessionLaunchContext } from "../../model/session/types.ts";
import {
	getDefaultModeCatalog,
	initializeAgentConfiguration,
	loadAgentConfiguration,
	upsertAgentConfiguration,
} from "../../storage/config.ts";
import { Storage } from "../../storage/storage.ts";
import { initializeTestProject } from "../test-utils.ts";

const roots: string[] = [];
afterEach(
	async () => await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true }))),
);

function controlledSessions() {
	const stopped: string[] = [];
	const preflightFailures = new Set<string>();
	const stopFailures = new Set<string>();
	const execution = (context: SessionLaunchContext): RunningExecution => ({
		identity: {
			taskId: context.taskId,
			modeId: context.modeId,
			sessionId: context.sessionId,
			executionId: context.sessionId,
		},
		events: {
			turnCompleted: "supported",
			permissionWait: "supported",
			executionExit: "supported",
			activity: "supported",
		},
		async input() {},
		async sendKey() {},
		async stop() {
			stopped.push(context.sessionId);
			if (stopFailures.has(context.sessionId)) throw new Error(`stop failed: ${context.sessionId}`);
		},
		observe() {
			return () => {};
		},
		teardownListeners() {},
	});
	const runtime: SessionRuntime = {
		async start(context) {
			return execution(context);
		},
		async resume(_nativeId, context) {
			return execution(context);
		},
		async stop(current) {
			await current.stop();
		},
		observe(current, listener) {
			return current.observe(listener);
		},
		async observeRetained() {
			return "absent";
		},
		async prepareStop(record) {
			if (preflightFailures.has(record.id)) throw new Error(`preflight failed: ${record.id}`);
			return {
				stop: async () => {
					stopped.push(record.id);
					if (stopFailures.has(record.id)) throw new Error(`stop failed: ${record.id}`);
				},
			};
		},
		async attach() {
			throw new Error("unused");
		},
		async detach() {},
		async ask() {
			return { answer: "unused" };
		},
	};
	const factory: SessionFactory = (_taskId, modeId, record) => {
		if (!record) throw new Error("Expected durable session record.");
		return new Session(record, modeId, runtime);
	};
	return { factory, stopped, preflightFailures, stopFailures };
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "mode-deletion-contract-"));
	roots.push(root);
	const storage = Storage.open(root);
	const controlled = controlledSessions();
	const core = new Core(root, { storage, sessionFactory: controlled.factory });
	await initializeTestProject(core, "Mode deletion");
	const { task } = await core.createTaskFromInput({ title: "First task", status: "To Do" });
	const { task: otherTask } = await core.createTaskFromInput({ title: "Second task", status: "To Do" });
	await initializeAgentConfiguration(core, "project");
	const configuration = await loadAgentConfiguration(core, "project");
	if (!configuration) throw new Error("Expected project agent configuration.");
	const modes = getDefaultModeCatalog();
	const plan = modes.profiles.plan;
	if (!plan) throw new Error("Expected plan mode.");
	modes.profiles.research = { ...plan, name: "Research" };
	modes.order.push("research");
	modes.defaultModeId = "build";
	await upsertAgentConfiguration(core, "project", { ...configuration, modes });
	return { root, core, storage, task, otherTask, controlled };
}

describe("Core mode deletion contract", () => {
	it("refuses the last mode and requires confirmation before any effect", async () => {
		const { core } = await fixture();
		const before = await core.getProjectModeCatalog();
		await expect(core.deleteMode("build", { confirmed: false } as never)).rejects.toThrow(/explicit confirmation/i);
		const build = before.profiles.build;
		if (!build) throw new Error("Expected build mode.");
		await upsertAgentConfiguration(core, "project", {
			modes: { ...before, order: ["build"], profiles: { build }, defaultModeId: "build" },
		});
		await expect(core.deleteMode("build", { confirmed: true })).rejects.toMatchObject({
			cause: expect.objectContaining({ message: expect.stringMatching(/last configured mode/i) }),
		});
		expect(await core.getProjectModeCatalog()).toEqual({
			...before,
			order: ["build"],
			profiles: { build },
			defaultModeId: "build",
		});
	});

	it("rejects failed preflight without stopping or changing the mode", async () => {
		const { core, task, controlled, storage } = await fixture();
		const created = await core.sessionApplication.newSession(task.id, "build");
		await core.sessionApplication.forgetTaskSessions(task.id);
		controlled.preflightFailures.add(created.record.id);
		const before = await storage.sessionStore().read(task.id);
		await expect(core.deleteMode("build", { confirmed: true })).rejects.toMatchObject({
			cause: expect.objectContaining({ message: expect.stringMatching(/preflight failed/i) }),
		});
		expect(controlled.stopped).toEqual([]);
		expect(await storage.sessionStore().read(task.id)).toEqual(before);
		expect((await core.getProjectModeCatalog()).profiles.build).toBeDefined();
	});

	it("deletes populated histories, stops only the deleted mode, and makes the first remaining mode default", async () => {
		const { core, task, otherTask, controlled, storage } = await fixture();
		const deleted = await core.sessionApplication.newSession(task.id, "build");
		const retained = await core.sessionApplication.newSession(task.id, "plan");
		const otherDeleted = await core.sessionApplication.newSession(otherTask.id, "build");
		const providerConfiguration = structuredClone((await loadAgentConfiguration(core, "project"))?.presets);
		await expect(core.deleteMode("build", { confirmed: true })).resolves.toEqual({
			deletedModeId: "build",
			taskIds: [otherTask.id, task.id].sort(),
		});
		expect(controlled.stopped).toEqual(expect.arrayContaining([deleted.record.id, otherDeleted.record.id]));
		expect(controlled.stopped).not.toContain(retained.record.id);
		expect((await storage.sessionStore().read(task.id)).modes.build).toBeUndefined();
		expect((await storage.sessionStore().read(task.id)).modes.plan?.sessions.map((session) => session.id)).toEqual([
			retained.record.id,
		]);
		const catalog = await core.getProjectModeCatalog();
		expect(catalog.defaultModeId).toBe("plan");
		expect((await loadAgentConfiguration(core, "project"))?.presets).toEqual(providerConfiguration);
	});

	it("reports sessions stopped before a later stop failure without discarding either history", async () => {
		const { core, task, controlled, storage } = await fixture();
		const first = await core.sessionApplication.newSession(task.id, "build");
		const second = await core.sessionApplication.newSession(task.id, "build");
		controlled.stopFailures.add(first.record.id);
		await expect(core.deleteMode("build", { confirmed: true })).rejects.toThrow(second.record.id);
		expect(controlled.stopped).toEqual([second.record.id, first.record.id]);
		expect(
			(await storage.sessionStore().read(task.id)).modes.build?.sessions.map((session) => session.id).sort(),
		).toEqual([first.record.id, second.record.id].sort());
	});

	it("preserves v1 and destination-based journals byte-for-byte and performs no deletion", async () => {
		const { root, core } = await fixture();
		const path = join(root, ".agentic-workspace", "agent-workspace", "mode-deletion.json");
		await mkdir(join(root, ".agentic-workspace", "agent-workspace"), { recursive: true });
		for (const journal of [
			'{"version":1,"source":"build","destination":"plan","phase":"prepared","tasks":[]}',
			'{"version":2,"operationId":"old","source":"build","destination":"plan","phase":"prepared","tasks":[]}',
		]) {
			await writeFile(path, journal);
			const before = await core.getProjectModeCatalog();
			await expect(core.deleteMode("build", { confirmed: true })).rejects.toThrow("Mode deletion failed");
			expect(await readFile(path, "utf8")).toBe(journal);
			expect(await core.getProjectModeCatalog()).toEqual(before);
		}
	});
});
