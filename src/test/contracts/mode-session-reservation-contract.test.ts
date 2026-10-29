import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSession } from "../../model/session/types.ts";
import { SessionStore } from "../../storage/session-store.ts";

function record(id: string, _modeId: string, _cwd: string): AgentSession {
	return {
		id,
		taskId: "TASK-23",
		preset: "original",
		tmuxName: `pane-${id}`,
		createdAt: "2026-10-10T12:00:00.000Z",
		outputPath: `/logs/${id}.log`,
		bootstrapPath: `/logs/${id}.md`,
		pathContext: { projectDir: "/repo", taskDir: "/repo/tasks/TASK-23" },
	};
}

describe("mode session reservation and adoption contract", () => {
	const roots: string[] = [];
	afterEach(async () => await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

	async function fixture() {
		const root = await mkdtemp(join(tmpdir(), "mode-session-contract-"));
		roots.push(root);
		await mkdir(join(root, ".agentic-workspace"), { recursive: true });
		const store = new SessionStore(root);
		await store.insertTask("TASK-23");
		return { root, store };
	}

	it("starts a fresh PLAN history empty and keeps direct BUILD history independent", async () => {
		const { store, root } = await fixture();
		expect(await store.readMode("TASK-23", "plan")).toEqual({ sessions: [] });
		expect(await store.readMode("TASK-23", "build")).toEqual({ sessions: [] });
		await expect(readFile(join(root, "tasks", "TASK-23", "sessions.json"), "utf8")).rejects.toMatchObject({
			code: "ENOENT",
		});
		const build = record("build-run", "build", root);
		await store.reserveSession("TASK-23", "build", build, build.id);
		expect(await store.readMode("TASK-23", "plan")).toEqual({ sessions: [] });
		expect(await store.readMode("TASK-23", "build")).toMatchObject({ activeSessionId: build.id, sessions: [build] });
	});

	it("serializes same-task mutations across modes behind the shared state lock", async () => {
		const { store, root } = await fixture();
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const first = store.mutate("TASK-23", async (state) => {
			const history = state.modes.plan ?? { sessions: [] };
			state.modes.plan = history;
			history.sessions.push(record("plan-first", "plan", root));
			history.activeSessionId = "plan-first";
			entered.resolve();
			await release.promise;
		});
		await entered.promise;

		// The store holds one shared state.json lock for the whole callback, so a different-mode
		// mutation of the same task queues behind it and cannot complete while `first` is in flight.
		const duplicate = store.mutate("TASK-23", async (state) => {
			const history = state.modes.plan;
			if (!history) throw new Error("Expected reserved plan history.");
			if (history.sessions.some((session) => session.id === "plan-first")) throw new Error("already reserved");
			history.sessions.push(record("plan-second", "plan", root));
			history.activeSessionId = "plan-second";
		});
		const build = store.mutate("TASK-23", async (state) => {
			const history = state.modes.build ?? { sessions: [] };
			state.modes.build = history;
			history.sessions.push(record("build-first", "build", root));
			history.activeSessionId = "build-first";
		});
		let buildCompleted = false;
		void build.then(
			() => {
				buildCompleted = true;
			},
			() => {},
		);
		await Promise.resolve();
		await Promise.resolve();

		// Release before awaiting any queued mutation: holding a proper-lockfile lock (5s update
		// heartbeat) across a never-settling await spins Bun's event loop at ~100% CPU, which is
		// what turned a missed release into a hang instead of a bounded timeout. The finally keeps
		// the release ordering even if the pre-release assertion fails.
		try {
			expect(buildCompleted).toBe(false);
		} finally {
			release.resolve();
		}

		await first;
		await expect(duplicate).rejects.toThrow("already reserved");
		await build;

		expect(buildCompleted).toBe(true);
		expect((await store.readMode("TASK-23", "plan")).sessions.map(({ id }) => id)).toEqual(["plan-first"]);
		expect((await store.readMode("TASK-23", "build")).sessions.map(({ id }) => id)).toEqual(["build-first"]);
	});

	it("keeps active selection mode-scoped and canonical paths unchanged", async () => {
		const { store, root } = await fixture();
		const historical = record("old-plan", "plan", root);
		const selected = record("selected-plan", "plan", root);
		const otherMode = record("active-build", "build", root);
		await store.reserveSession("TASK-23", "plan", historical, historical.id);
		await store.reserveSession("TASK-23", "plan", selected, selected.id);
		await store.reserveSession("TASK-23", "build", otherMode, otherMode.id);
		const before = selected.pathContext;
		await store.mutate("TASK-23", async (state) => {
			const history = state.modes.plan;
			if (!history) throw new Error("Expected plan history.");
			const current = history.sessions.find(({ id }) => id === selected.id);
			if (!current) throw new Error("selected history disappeared");
			current.lastUsedAt = "2026-10-10T12:30:00.000Z";
			history.activeSessionId = current.id;
		});
		expect((await store.readMode("TASK-23", "plan")).activeSessionId).toBe(selected.id);
		expect((await store.readMode("TASK-23", "build")).activeSessionId).toBe(otherMode.id);
		expect(
			(await store.readMode("TASK-23", "plan")).sessions.find(({ id }) => id === selected.id)?.pathContext,
		).toEqual(before);
	});

	it("resolves a calling UUID by its current mode membership rather than a selected UI mode", async () => {
		const { store } = await fixture();
		const caller = record("caller-uuid", "build", "/work");
		const plan = record("plan-uuid", "plan", "/work");
		await store.reserveSession("TASK-23", "build", caller, caller.id);
		await store.reserveSession("TASK-23", "plan", plan, plan.id);
		const current = await store.read("TASK-23");
		const membership = Object.entries(current.modes ?? {}).find(([, history]) =>
			history.sessions.some(({ id }) => id === caller.id),
		);
		expect(membership?.[0]).toBe("build");
		expect(membership?.[1].sessions[0]?.id).toBe(caller.id);
	});
});
