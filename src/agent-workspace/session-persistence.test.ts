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
		expect(await store.readMode("TASK-1", "plan")).toMatchObject({
			activeSessionId: "new",
			sessions: [{ id: "new", nativeSessionId: "ses_native" }],
		});
		expect(await store.readMode("TASK-1", "build")).toMatchObject({
			activeSessionId: "other",
			sessions: [{ id: "other", useCount: 7 }],
		});
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
			history.sessions.push(newer);
			history.activeSessionId = newer.id;
		});
		await persistence.checkpoint(checkpoint("rollback", provisional, creation));
		expect(await store.readMode("TASK-1", "plan")).toMatchObject({
			activeSessionId: "newer",
			sessions: [{ id: "prior" }, { id: "newer" }],
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
			history.sessions.push(newer);
			history.activeSessionId = newer.id;
		});
		await expect(persistence.checkpoint(checkpoint("rollback", provisional, creation))).rejects.toThrow(/replaced/);
		expect(await store.readMode("TASK-1", "plan")).toMatchObject({
			activeSessionId: "newer",
			sessions: [{ id: "provisional", createdAt: replacement.createdAt }, { id: "newer" }],
		});
	});
});
