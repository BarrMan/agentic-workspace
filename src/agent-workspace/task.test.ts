import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task as TaskRecord } from "../types/index.ts";
import type { RunningExecution, RunningExecutionEvent } from "./harness.ts";
import { Session } from "./session.ts";
import type { ProcessRunner } from "./session-process.ts";
import { SessionStore } from "./session-store.ts";
import type { TaskHydrationInput } from "./task.ts";
import { Task } from "./task.ts";
import type { AgentSession, ModeProfile, ResolvedAgentConfiguration } from "./types.ts";

const profile: ModeProfile = {
	name: "Mode",
	model: { kind: "default" },
	prompt: "",
	permissions: { repository: "read", task: "read", artifacts: "read", subagents: "disabled" },
	artifacts: [],
};
const configuration: ResolvedAgentConfiguration = { scope: "project", config: { selectedPreset: "x", presets: {} } };

function fixture(overrides: Partial<TaskHydrationInput> = {}) {
	let provisions = 0;
	const createSession: TaskHydrationInput["createSession"] = ({ taskId, modeId }) => {
		provisions++;
		const record: AgentSession = {
			id: `s${provisions}`,
			taskId,
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "now",
			status: "starting",
			outputPath: "",
			bootstrapPath: "",
		};
		return new Session(record, modeId);
	};
	const dto: TaskRecord = {
		id: "T-1",
		title: "title",
		status: "To Do",
		assignee: [],
		createdDate: "today",
		labels: [],
		dependencies: [],
		source: "remote",
		rawContent: "body",
	};
	const task = new Task({
		task: dto,
		modes: { a: profile, b: profile },
		configuration,
		sessionRecords: {},
		selectedModeId: "a",
		createSession,
		...overrides,
	});
	return {
		task,
		get provisions() {
			return provisions;
		},
		dto,
	};
}

describe("Task", () => {
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

	it("sets and clears approval on its held task record", () => {
		const { task } = fixture();
		task.setModeApproval("a");
		task.setModeApproval("b");
		expect(task.serialize().modeApprovals).toEqual({ a: true, b: true });
		task.clearModeApproval("a");
		expect(task.serialize().modeApprovals).toEqual({ b: true });
		task.clearModeApproval("b");
		expect(task.serialize().modeApprovals).toBeUndefined();
		expect(() => task.setModeApproval(" ")).toThrow("Mode ID must not be empty");
	});

	it("persists one Task reservation before real Session startup and readiness", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-session-store-"));
		roots.push(root);
		const runner: ProcessRunner = { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) };
		const store = new SessionStore(root, runner);
		const { task } = fixture();
		let session: Session | undefined;
		let creation: ReturnType<Task["reserveSession"]>["creation"] | undefined;
		await store.mutate("T-1", async (state) => {
			({ session, creation } = task.reserveSession("a"));
			state.modes = task.serializeSessions();
			state.sessions = state.modes.build?.sessions ?? [];
			state.activeSessionId = state.modes.build?.activeSessionId;
		});
		if (!session || !creation) throw new Error("reservation was not created");
		const reservedSession = session;
		const creationIdentity = creation;
		const calls: string[] = [];
		const running: RunningExecution = {
			identity: {
				taskId: "T-1",
				modeId: "a",
				sessionId: reservedSession.id,
				executionId: "launch",
				nativeSessionId: "native",
			},
			providerConversationId: "native",
			events: {
				turnCompleted: "unsupported",
				permissionWait: "unsupported",
				executionExit: "unsupported",
				activity: "unsupported",
			},
			input: async () => {},
			sendKey: async () => {},
			stop: async () => {},
			observe: (_listener: (event: RunningExecutionEvent) => void) => () => {},
			teardownListeners: () => {},
		};
		await reservedSession.start({
			context: { taskId: "T-1", modeId: "a", sessionId: reservedSession.id, record: reservedSession.record } as never,
			harness: {
				launch: async () => {
					const persisted = await store.readMode("T-1", "a");
					expect(persisted.sessions.map(({ id }) => id)).toEqual([reservedSession.id]);
					calls.push("launch");
					return running;
				},
				resume: async () => running,
			},
			checkpoint: async ({ phase }) => {
				calls.push(phase);
				if (phase === "identity" || phase === "ready") {
					await store.mutate("T-1", async (state) => {
						const history = state.modes.a;
						if (!history) throw new Error("missing reservation");
						history.sessions[0] = reservedSession.serialize();
					});
				}
			},
		});
		expect(calls).toEqual(["launch", "identity", "ready"]);
		expect((await store.readMode("T-1", "a")).sessions).toHaveLength(1);
		expect(creationIdentity.createdAt).toBe(reservedSession.record.createdAt);
	});

	it("retains each selected mode across A→B→A", () => {
		const { task } = fixture();
		expect(task.cycleMode()).toBe("b");
		expect(task.cycleMode()).toBe("a");
		expect(task.selectedModeId).toBe("a");
	});

	it("rejects an invalid mode before provisioning", () => {
		const f = fixture();
		expect(() => f.task.reserveSession("missing")).toThrow("Unknown mode");
		expect(f.provisions).toBe(0);
	});

	it("reserves synchronously exactly once in the requested mode", () => {
		const { task } = fixture();
		const { session, creation } = task.reserveSession("b");
		expect(task.modes.a?.sessions).toHaveLength(0);
		expect(task.modes.b?.sessions.map(({ id }) => id)).toEqual([session.id]);
		expect(task.modes.b?.activeSessionId).toBe(session.id);
		expect(creation).toEqual({
			taskId: "T-1",
			modeId: "b",
			provisionalSessionId: session.id,
			createdAt: session.record.createdAt,
		});
		for (const history of Object.values(task.modes)) {
			expect(
				history.activeSessionId === undefined || history.sessions.some(({ id }) => id === history.activeSessionId),
			).toBe(true);
		}
	});

	it("prepends one reservation and reloads the same selected session", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-reservation-reload-"));
		roots.push(root);
		const store = new SessionStore(root, { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) });
		const previous = {
			id: "previous",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "then",
			status: "stopped" as const,
			outputPath: "",
			bootstrapPath: "",
		};
		const { task } = fixture({ sessionRecords: { a: { sessions: [previous], activeSessionId: previous.id } } });
		const { session } = task.reserveSession("a");
		expect(task.modes.a?.sessions.map(({ id }) => id)).toEqual([session.id, previous.id]);
		expect(task.modes.a?.activeSessionId).toBe(session.id);
		await store.mutate("T-1", async (state) => {
			state.modes = task.serializeSessions();
		});
		const reloaded = await store.readMode("T-1", "a");
		expect(reloaded.sessions.map(({ id }) => id)).toEqual([session.id, previous.id]);
		expect(reloaded.activeSessionId).toBe(session.id);
	});

	it("rehydrates creation identity and preserves a newer selection during rollback", () => {
		const { task: original } = fixture();
		const task = original;
		const { creation } = task.reserveSession("a");
		const newer = task.reserveSession("a").session.record;
		const history = task.modes.a;
		if (!history) throw new Error("missing mode");
		const rehydrated = fixture({ sessionRecords: { a: structuredClone(history) } }).task;
		rehydrated.rollbackSession(creation);
		expect(rehydrated.modes.a?.sessions.map(({ id }) => id)).toEqual([newer.id]);
		expect(rehydrated.modes.a?.activeSessionId).toBe(newer.id);
	});

	it("restores the previous pointer only while rolling back the selected creation", () => {
		const prior = {
			id: "prior",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "prior-time",
			status: "stopped" as const,
			outputPath: "",
			bootstrapPath: "",
		};
		const { task } = fixture({ sessionRecords: { a: { sessions: [prior], activeSessionId: prior.id } } });
		const { creation, session } = task.reserveSession("a");
		task.rollbackSession(creation);
		expect(task.modes.a?.activeSessionId).toBe(prior.id);
		expect(task.modes.a?.sessions.map(({ id }) => id)).toEqual([prior.id]);

		const noPrevious = fixture({
			sessionRecords: {
				a: { sessions: [prior, { ...prior, id: "survivor", createdAt: "survivor-time" }], activeSessionId: prior.id },
			},
		}).task;
		const { creation: firstCreation } = noPrevious.reserveSession("a");
		noPrevious.removeSession("a", prior.id);
		noPrevious.rollbackSession(firstCreation);
		expect(noPrevious.modes.a?.activeSessionId).toBe("survivor");
		expect(noPrevious.modes.a?.sessions.map(({ id }) => id)).toEqual(["survivor"]);
		expect(task.modes.a?.sessions.some(({ id }) => id === session.id)).toBe(false);
	});

	it("rejects rollback of a same-id replacement incarnation", () => {
		const { task } = fixture();
		const { creation } = task.reserveSession("a");
		const history = task.modes.a;
		if (!history) throw new Error("missing mode");
		const provisional = history.sessions[0];
		if (!provisional) throw new Error("missing provisional session");
		history.sessions[0] = { ...provisional, createdAt: "replacement" };
		expect(() => task.rollbackSession(creation)).toThrow(/incarnation changed/);
	});

	it("updates only an existing same-incarnation record without changing relationships", () => {
		const sessions = ["one", "two"].map((id) => ({
			id,
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: id,
			status: "stopped" as const,
			outputPath: "",
			bootstrapPath: "",
		}));
		const { task } = fixture({ sessionRecords: { a: { sessions, activeSessionId: "two" } } });
		const first = sessions[0];
		if (!first) throw new Error("missing fixture session");
		expect(() => task.updateSessionRecord("a", { ...first, id: "missing" })).toThrow("membership");
		expect(() => task.updateSessionRecord("a", { ...first, taskId: "foreign" })).toThrow("another task");
		task.updateSessionRecord("a", { ...first, status: "running" });
		expect(task.modes.a?.sessions.map(({ id }) => id)).toEqual(["one", "two"]);
		expect(task.modes.a?.activeSessionId).toBe("two");
		expect(task.modes.a?.sessions[0]?.status).toBe("running");
	});

	it("registers durable records without launching and repairs removal selection", () => {
		const { task, provisions } = fixture();
		const record: AgentSession = {
			id: "adopted",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "then",
			status: "stopped",
			outputPath: "",
			bootstrapPath: "",
		};
		task.registerSession("a", record);
		expect(task.modes.a?.activeSessionId).toBe("adopted");
		expect(provisions).toBe(0);
		task.registerSession("a", { ...record, id: "other", createdAt: "later" });
		task.selectSession("a", "adopted");
		task.removeSession("a", "adopted");
		expect(task.modes.a?.activeSessionId).toBe("other");
	});

	it("selects a survivor only when stopping the active session", async () => {
		const { task } = fixture();
		const one = task.reserveSession("a").session.record;
		const two = task.reserveSession("a").session.record;
		task.selectSession("a", one.id);
		task.selectSurvivorAfterStop("a", two.id);
		expect(task.modes.a?.activeSessionId).toBe(one.id);
		const root = await mkdtemp(join(tmpdir(), "task-stop-selection-reload-"));
		roots.push(root);
		const store = new SessionStore(root, { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) });
		await store.mutate("T-1", async (state) => {
			state.modes = task.serializeSessions();
		});
		expect((await store.readMode("T-1", "a")).activeSessionId).toBe(one.id);
		task.selectSession("a", two.id);
		task.selectSurvivorAfterStop("a", two.id);
		expect(task.modes.a?.activeSessionId).toBe(one.id);
		const only = fixture().task;
		const sole = only.reserveSession("a").session.record;
		only.selectSurvivorAfterStop("a", sole.id);
		expect(only.modes.a?.activeSessionId).toBe(sole.id);
	});

	it("refuses deleting a mode with session history and removes an empty mode", () => {
		const { task } = fixture();
		task.registerSession("a", {
			id: "only-a",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "then",
			status: "stopped",
			outputPath: "",
			bootstrapPath: "",
		});
		expect(() => task.removeMode("a")).toThrow(/with sessions/);
		task.removeSession("a", "only-a");
		task.removeMode("a");
		expect(task.modes.a).toBeUndefined();
		expect(task.modes.b?.sessions).toEqual([]);
	});

	it("preserves hydrated identity/source and serializes only task DTO fields", () => {
		const { task, dto } = fixture();
		expect(task.id).toBe(dto.id);
		expect(task.task.source).toBe("remote");
		expect(task.editable).toBe(false);
		expect(task.serialize()).toEqual(dto);
		expect(JSON.stringify(task.serialize())).not.toContain("createSession");
	});

	it("preserves a valid persisted active session and repairs a stale pointer", () => {
		const sessions = [
			{
				id: "first",
				taskId: "T-1",
				preset: "x",
				tmuxName: "",
				cwd: "/",
				createdAt: "now",
				status: "stopped" as const,
				outputPath: "",
				bootstrapPath: "",
			},
			{
				id: "second",
				taskId: "T-1",
				preset: "x",
				tmuxName: "",
				cwd: "/",
				createdAt: "now",
				status: "stopped" as const,
				outputPath: "",
				bootstrapPath: "",
			},
		];
		const valid = fixture({ sessionRecords: { a: { sessions, activeSessionId: "second" } } }).task;
		expect(valid.modes.a?.activeSessionId).toBe("second");
		expect(valid.activeSession?.id).toBe("second");
		const stale = fixture({ sessionRecords: { a: { sessions, activeSessionId: "missing" } } }).task;
		expect(stale.modes.a?.activeSessionId).toBe("first");
	});

	it("round-trips uncatalogued histories, usage, and their active selection from reloaded state", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-hidden-mode-round-trip-"));
		roots.push(root);
		const store = new SessionStore(root, { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) });
		const hidden: AgentSession = {
			id: "hidden-session",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "then",
			status: "stopped",
			outputPath: "",
			bootstrapPath: "",
			useCount: 4,
			lastUsedAt: "2026-10-15T00:00:00.000Z",
		};
		const task = fixture({ sessionRecords: { hidden: { sessions: [hidden], activeSessionId: hidden.id } } }).task;
		expect(task.selectedModeId).toBe("a");
		await store.mutate("T-1", async (state) => {
			state.modes = task.serializeSessions();
		});
		const reloaded = await store.read("T-1");
		expect(reloaded.modes.hidden).toEqual({ sessions: [hidden], activeSessionId: hidden.id });
	});

	it("publishes a record update while preserving unrelated histories, counters, and selection", async () => {
		const root = await mkdtemp(join(tmpdir(), "task-publication-preserves-history-"));
		roots.push(root);
		const store = new SessionStore(root, { run: async () => ({ exitCode: 1, stdout: "", stderr: "unused" }) });
		const selected = {
			id: "selected",
			taskId: "T-1",
			preset: "x",
			tmuxName: "",
			cwd: "/",
			createdAt: "one",
			status: "stopped" as const,
			outputPath: "",
			bootstrapPath: "",
		};
		const other = { ...selected, id: "other", createdAt: "two", useCount: 7 };
		const hidden = { ...selected, id: "hidden", createdAt: "three", useCount: 4, lastUsedAt: "recent" };
		const task = fixture({
			sessionRecords: {
				a: { sessions: [selected, other], activeSessionId: selected.id },
				b: { sessions: [{ ...selected, id: "mode-b" }], activeSessionId: "mode-b" },
				hidden: { sessions: [hidden], activeSessionId: hidden.id },
			},
		}).task;
		const updated = { ...selected, status: "running" as const };
		task.updateSessionRecord("a", updated);
		task.selectSession("a", other.id);
		await store.mutate("T-1", async (state) => {
			state.modes = task.serializeSessions();
		});
		const reloaded = await store.read("T-1");
		expect(reloaded.modes.a).toMatchObject({
			activeSessionId: other.id,
			sessions: [
				{ id: selected.id, status: "running" },
				{ id: other.id, useCount: 7 },
			],
		});
		expect(reloaded.modes.b).toMatchObject({ activeSessionId: "mode-b", sessions: [{ id: "mode-b" }] });
		expect(reloaded.modes.hidden).toEqual({ sessions: [hidden], activeSessionId: hidden.id });
	});
});
