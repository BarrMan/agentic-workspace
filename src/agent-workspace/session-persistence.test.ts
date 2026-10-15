import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LifecycleCheckpoint, SessionCreationIdentity } from "./session-contracts.ts";
import { createSessionPersistence } from "./session-persistence.ts";
import type { ProcessRunner } from "./session-process.ts";
import { SessionStore } from "./session-store.ts";
import type { AgentSession } from "./types.ts";

class InertRunner implements ProcessRunner {
	async run(): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		return { exitCode: 1, stdout: "", stderr: "not used" };
	}
}

const record = (id: string, changes: Partial<AgentSession> = {}): AgentSession => ({
	id,
	taskId: "TASK-1",
	preset: "agent",
	tmuxName: `pane-${id}`,
	cwd: "/work",
	createdAt: "2026-10-14T00:00:00.000Z",
	status: "starting",
	outputPath: `/tmp/${id}.log`,
	bootstrapPath: `/tmp/${id}.md`,
	...changes,
});

describe("session checkpoint persistence", () => {
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

	async function fixture() {
		const root = await mkdtemp(join(tmpdir(), "session-persistence-"));
		roots.push(root);
		const store = new SessionStore(root, new InertRunner());
		return { store, persistence: createSessionPersistence(store) };
	}

	function checkpoint(
		phase: LifecycleCheckpoint["phase"],
		recordValue: AgentSession,
		creation: SessionCreationIdentity,
		expected: LifecycleCheckpoint["expectedMembership"] = {
			kind: phase === "reservation" ? "absent" : "present",
			taskId: creation.taskId,
			modeId: creation.modeId,
			sessionId: creation.provisionalSessionId,
		},
	): LifecycleCheckpoint {
		if (phase === "update") {
			const prior = recordValue;
			return {
				phase,
				reason: "stop",
				origin: {
					kind: "session",
					taskId: creation.taskId,
					modeId: creation.modeId,
					sessionId: creation.provisionalSessionId,
				},
				expectedMembership: {
					kind: "present",
					taskId: creation.taskId,
					modeId: creation.modeId,
					sessionId: creation.provisionalSessionId,
				},
				previous: prior,
				record: recordValue,
			};
		}
		return {
			phase,
			origin: { kind: "creation", creation },
			expectedMembership: expected,
			record: recordValue,
		};
	}

	it("publishes reservation and identity deltas without losing independent records or usage", async () => {
		const { store, persistence } = await fixture();
		const creation = { taskId: "TASK-1", modeId: "plan", provisionalSessionId: "new" };
		const provisional = record("new");
		await persistence.checkpoint(checkpoint("reservation", provisional, creation));
		await store.mutateMode("TASK-1", "build", async (history) => {
			history.sessions.push(record("other", { status: "running", useCount: 7 }));
			history.activeSessionId = "other";
		});
		await persistence.checkpoint(
			checkpoint("identity", { ...provisional, nativeProvider: "opencode", nativeSessionId: "ses_native" }, creation),
		);
		await store.mutateSession("TASK-1", "new", async (current) => {
			current.useCount = 3;
			current.lastUsedAt = "2026-10-14T01:00:00.000Z";
		});
		await persistence.checkpoint(
			checkpoint(
				"ready",
				{ ...provisional, nativeProvider: "opencode", nativeSessionId: "ses_native", status: "running" },
				creation,
			),
		);
		expect(await store.readMode("TASK-1", "plan")).toMatchObject({
			activeSessionId: "new",
			sessions: [
				{
					id: "new",
					nativeSessionId: "ses_native",
					status: "running",
					useCount: 3,
					lastUsedAt: "2026-10-14T01:00:00.000Z",
				},
			],
		});
		expect(await store.readMode("TASK-1", "build")).toMatchObject({
			activeSessionId: "other",
			sessions: [{ id: "other", useCount: 7 }],
		});
	});

	it("updates only an existing membership and never moves its active pointer", async () => {
		const { store, persistence } = await fixture();
		const creation = { taskId: "TASK-1", modeId: "plan", provisionalSessionId: "member" };
		const starting = record("member");
		await persistence.checkpoint(checkpoint("reservation", starting, creation));
		await store.mutateMode("TASK-1", "plan", async (history) => {
			history.sessions.push(record("other", { status: "stopped" }));
			history.activeSessionId = "other";
		});
		const updated = { ...starting, status: "stopped" as const, endedAt: "now", ownerPid: undefined };
		await persistence.checkpoint({
			phase: "update",
			reason: "stop",
			origin: {
				kind: "session",
				taskId: creation.taskId,
				modeId: creation.modeId,
				sessionId: creation.provisionalSessionId,
			},
			expectedMembership: {
				kind: "present",
				taskId: creation.taskId,
				modeId: creation.modeId,
				sessionId: creation.provisionalSessionId,
			},
			previous: starting,
			record: updated,
		});
		expect(await store.readMode("TASK-1", "plan")).toMatchObject({
			activeSessionId: "other",
			sessions: [{ id: "member", status: "stopped", endedAt: "now" }, { id: "other" }],
		});
		await store.remove("TASK-1", "member");
		await expect(
			persistence.checkpoint({
				phase: "update",
				reason: "finish",
				origin: {
					kind: "session",
					taskId: creation.taskId,
					modeId: creation.modeId,
					sessionId: creation.provisionalSessionId,
				},
				expectedMembership: {
					kind: "present",
					taskId: creation.taskId,
					modeId: creation.modeId,
					sessionId: creation.provisionalSessionId,
				},
				previous: updated,
				record: updated,
			}),
		).rejects.toThrow(/membership changed/);
		expect((await store.readMode("TASK-1", "plan")).activeSessionId).toBe("other");
	});

	it("rejects stale, replaced, and wrong-origin checkpoints without resurrecting membership", async () => {
		const { store, persistence } = await fixture();
		const creation = { taskId: "TASK-1", modeId: "plan", provisionalSessionId: "new" };
		const provisional = record("new");
		await persistence.checkpoint(checkpoint("reservation", provisional, creation));
		await store.mutate("TASK-1", async (state) => {
			const history = state.modes?.plan;
			if (history) history.sessions[0] = record("new", { createdAt: "2026-10-15T00:00:00.000Z" });
		});
		await expect(persistence.checkpoint(checkpoint("identity", provisional, creation))).rejects.toThrow(/replaced/);
		await store.remove("TASK-1", "new");
		await expect(persistence.checkpoint(checkpoint("ready", provisional, creation))).rejects.toThrow(
			/membership changed/,
		);
		await expect(
			persistence.checkpoint(
				checkpoint("reservation", provisional, creation, {
					kind: "absent",
					taskId: "TASK-1",
					modeId: "build",
					sessionId: "new",
				}),
			),
		).rejects.toThrow(/identity/);
		expect((await store.readMode("TASK-1", "plan")).sessions).toEqual([]);
	});

	it("removes a provisional record on durable rollback and preserves a newer active selection", async () => {
		const { store, persistence } = await fixture();
		const prior = record("prior", { status: "stopped" });
		const creation = {
			taskId: "TASK-1",
			modeId: "plan",
			provisionalSessionId: "new",
			previousActiveSessionId: "prior",
		};
		const provisional = record("new");
		await store.mutateMode("TASK-1", "plan", async (history) => {
			history.sessions.push(prior);
			history.activeSessionId = prior.id;
		});
		await persistence.checkpoint(checkpoint("reservation", provisional, creation));
		await store.mutateMode("TASK-1", "plan", async (history) => {
			const newer = record("newer");
			history.sessions.unshift(newer);
			history.activeSessionId = newer.id;
		});
		await persistence.checkpoint(checkpoint("rollback", provisional, creation));
		expect(await store.readMode("TASK-1", "plan")).toMatchObject({
			activeSessionId: "newer",
			sessions: [{ id: "newer" }, { id: "prior" }],
		});
	});

	it("surfaces reservation and publication failures without erasing recovery evidence", async () => {
		const { store, persistence } = await fixture();
		const invalid = record("bad", { pathContext: { projectDir: "relative", worktreeDir: "/work", taskDir: "/task" } });
		const creation = { taskId: "TASK-1", modeId: "plan", provisionalSessionId: "bad" };
		await expect(persistence.checkpoint(checkpoint("reservation", invalid, creation))).rejects.toThrow(/invalid state/);
		expect((await store.readMode("TASK-1", "plan")).sessions).toEqual([]);
		const valid = record("live");
		const liveCreation = { ...creation, provisionalSessionId: "live" };
		await persistence.checkpoint(checkpoint("reservation", valid, liveCreation));
		const { statePath } = await store.paths("TASK-1");
		await Bun.write(statePath, "invalid-json");
		await expect(
			persistence.checkpoint(checkpoint("ready", { ...valid, status: "running" }, liveCreation)),
		).rejects.toThrow(/not valid JSON/);
		expect(await Bun.file(statePath).text()).toBe("invalid-json");
	});

	it("retains evidence and the newer selection when rollback publication is stale", async () => {
		const { store, persistence } = await fixture();
		const creation = { taskId: "TASK-1", modeId: "plan", provisionalSessionId: "provisional" };
		const provisional = record("provisional");
		await persistence.checkpoint(checkpoint("reservation", provisional, creation));
		const replacement = record("provisional", { createdAt: "2026-10-15T00:00:00.000Z" });
		const newer = record("newer", { status: "running" });
		await store.mutateMode("TASK-1", "plan", async (history) => {
			history.sessions[0] = replacement;
			history.sessions.unshift(newer);
			history.activeSessionId = newer.id;
		});
		await expect(persistence.checkpoint(checkpoint("rollback", provisional, creation))).rejects.toThrow(/replaced/);
		expect(await store.readMode("TASK-1", "plan")).toMatchObject({
			activeSessionId: "newer",
			sessions: [{ id: "newer" }, { id: "provisional", createdAt: replacement.createdAt }],
		});
	});

	it("synchronizes legacy flat pointers and rejects non-creation rollback and conflicting native IDs", async () => {
		const { store, persistence } = await fixture();
		const creation = { taskId: "TASK-1", modeId: "build", provisionalSessionId: "new" };
		const provisional = record("new");
		await persistence.checkpoint(checkpoint("reservation", provisional, creation));
		expect(await store.read("TASK-1")).toMatchObject({
			activeSessionId: "new",
			modes: { build: { activeSessionId: "new" } },
		});
		const identity = { ...provisional, nativeProvider: "opencode" as const, nativeSessionId: "ses_first" };
		await persistence.checkpoint(checkpoint("identity", identity, creation));
		await expect(
			persistence.checkpoint(checkpoint("identity", { ...identity, nativeSessionId: "ses_other" }, creation)),
		).rejects.toThrow(/native identity conflicts/);
		await expect(
			persistence.checkpoint({
				...checkpoint("rollback", provisional, creation),
				origin: {
					kind: "session",
					taskId: creation.taskId,
					modeId: creation.modeId,
					sessionId: creation.provisionalSessionId,
				},
			}),
		).rejects.toThrow(/creation origin/);
		expect(await store.read("TASK-1")).toMatchObject({
			activeSessionId: "new",
			modes: { build: { activeSessionId: "new", sessions: [{ nativeSessionId: "ses_first" }] } },
		});
		await persistence.checkpoint(checkpoint("rollback", identity, creation));
		expect(await store.read("TASK-1")).toMatchObject({ sessions: [], modes: { build: { sessions: [] } } });
		expect((await store.read("TASK-1")).activeSessionId).toBeUndefined();
	});
});
