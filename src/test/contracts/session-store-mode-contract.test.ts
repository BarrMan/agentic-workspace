import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSession } from "../../model/session/types.ts";
import { SessionStore } from "../../storage/session-store.ts";

function session(id: string, changes: Partial<AgentSession> = {}): AgentSession {
	return {
		id,
		taskId: "TASK-23",
		preset: "agent",
		tmuxName: `pane-${id}`,
		createdAt: "2026-10-10T12:00:00.000Z",
		outputPath: `/logs/${id}.log`,
		bootstrapPath: `/logs/${id}.prompt`,
		...changes,
	};
}

describe("SessionStore mode persistence contract", () => {
	const roots: string[] = [];
	afterEach(async () => {
		await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
	});

	async function fixture() {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-session-mode-contract-"));
		roots.push(root);
		const store = new SessionStore(root);
		await store.insertTask("TASK-23");
		return { root, store, ...(await store.paths("TASK-23")) };
	}

	it("stores only the preset name for configuration identity", async () => {
		const { store } = await fixture();
		await store.reserveSession("TASK-23", "plan", session("preset-only"), "preset-only");
		expect((await store.readMode("TASK-23", "plan")).sessions[0]).toEqual(session("preset-only"));
	});

	it("keeps independent histories and active pointers through concurrent mode writes and reopen", async () => {
		const { root, store, statePath } = await fixture();
		const planner = session("plan-uuid", {
			nativeSessionId: "native-plan",
			pathContext: { projectDir: "/project", taskDir: "/project/agentic-workspace/tasks/task-23" },
		});
		const builder = session("build-uuid", {
			nativeSessionId: "native-build",
		});

		await Promise.all([
			store.mutate("TASK-23", async (state) => {
				const history = state.modes.plan ?? { sessions: [] };
				state.modes.plan = history;
				await new Promise((resolve) => setTimeout(resolve, 12));
				history.sessions.push(planner);
				history.activeSessionId = planner.id;
			}),
			store.mutate("TASK-23", async (state) => {
				const history = state.modes.build ?? { sessions: [] };
				state.modes.build = history;
				history.sessions.push(builder);
				history.activeSessionId = builder.id;
			}),
		]);

		const reopened = new SessionStore(root);
		expect(await reopened.readMode("TASK-23", "plan")).toEqual({ sessions: [planner], activeSessionId: planner.id });
		expect((await reopened.readMode("TASK-23", "plan")).sessions[0]?.pathContext).toEqual(planner.pathContext);
		expect(await reopened.readMode("TASK-23", "build")).toEqual({ sessions: [builder], activeSessionId: builder.id });
		expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({ version: 2, taskId: "TASK-23" });
	});

	it("preserves and validates v2 task metadata through every mutation API", async () => {
		const { store, statePath } = await fixture();
		await mkdir(join(statePath, ".."), { recursive: true });
		const envelope = {
			version: 2,
			taskId: "TASK-23",
			worktreePath: "/worktree/TASK-23",
			hasSuccessfulSession: true,
			modes: {
				build: { activeSessionId: "metadata-build", sessions: [session("metadata-build")] },
				plan: { activeSessionId: "metadata-plan", sessions: [session("metadata-plan")] },
			},
		};
		await writeFile(statePath, JSON.stringify(envelope));
		const expectMetadata = async () =>
			expect(await store.read("TASK-23")).toMatchObject({
				worktreePath: envelope.worktreePath,
				hasSuccessfulSession: true,
			});
		await expectMetadata();
		await store.mutate("TASK-23", async () => undefined);
		await expectMetadata();
		await store.mutate("TASK-23", async () => undefined);
		await expectMetadata();
		await store.mutate("TASK-23", async () => undefined);
		await expectMetadata();
		for (const [key, invalid] of [
			["worktreePath", false],
			["hasSuccessfulSession", "yes"],
		] as const) {
			const malformed = JSON.parse(await readFile(statePath, "utf8"));
			malformed[key] = invalid;
			await writeFile(statePath, JSON.stringify(malformed));
			await expect(store.read("TASK-23")).rejects.toThrow(/invalid session data/i);
		}
	});

	it("rejects a v2 record that only has the removed flat history", async () => {
		const { store, statePath } = await fixture();
		const selected = session("selected");
		await mkdir(join(statePath, ".."), { recursive: true });
		const bytes = JSON.stringify({
			version: 2,
			taskId: "TASK-23",
			sessions: [selected],
			activeSessionId: selected.id,
		});
		await writeFile(statePath, bytes);
		await expect(store.read("TASK-23")).rejects.toThrow(/invalid session data/i);
		expect(await readFile(statePath, "utf8")).toBe(bytes);
	});

	it("rejects obsolete session records without writing during read", async () => {
		const { store, statePath } = await fixture();
		await mkdir(join(statePath, ".."), { recursive: true });
		const invalidSession = (id: string) => ({ ...session(id), predecessorId: "old-task" });
		const bytes = JSON.stringify({
			version: 2,
			taskId: "TASK-23",
			modes: { build: { sessions: [invalidSession("old-build")] }, plan: { sessions: [invalidSession("old-plan")] } },
		});
		await writeFile(statePath, bytes);
		await expect(store.read("TASK-23")).rejects.toThrow(/invalid session data/i);
		expect(await readFile(statePath, "utf8")).toBe(bytes);
	});

	it("returns an empty mode in provisioned state, then persists a selected session", async () => {
		const { store } = await fixture();
		expect(await store.readMode("TASK-23", "research")).toEqual({ sessions: [] });

		await store.reserveSession("TASK-23", "research", session("research-uuid"), "research-uuid");
		expect(await store.readMode("TASK-23", "research")).toEqual({
			sessions: [session("research-uuid")],
			activeSessionId: "research-uuid",
		});
	});

	it("finds the current UUID owner under lock and leaves unrelated mode history and pointers intact", async () => {
		const { store } = await fixture();
		await store.reserveSession("TASK-23", "plan", session("relocated"), "relocated");
		await store.mutate("TASK-23", async (state) => {
			const history = state.modes.plan;
			if (!history) throw new Error("Expected plan history.");
			history.sessions = [];
			delete history.activeSessionId;
		});
		const other = session("other-mode-session");
		await store.reserveSession("TASK-23", "design", other, other.id);
		await store.reserveSession("TASK-23", "build", session("relocated"), "relocated");

		const owners: string[] = [];
		await store.mutate("TASK-23", async (state) => {
			const membership = Object.entries(state.modes).find(([, history]) =>
				history.sessions.some(({ id }) => id === "relocated"),
			);
			if (!membership) throw new Error("Expected relocated session.");
			const [owner, history] = membership;
			const record = history.sessions.find(({ id }) => id === "relocated");
			if (!record) throw new Error("Expected relocated record.");
			owners.push(owner);
			record.lastUsedAt = "2026-10-10T12:30:00.000Z";
			history.activeSessionId = record.id;
		});
		expect(owners).toEqual(["build"]);
		expect(await store.readMode("TASK-23", "plan")).toEqual({ sessions: [] });
		expect(await store.readMode("TASK-23", "design")).toEqual({ sessions: [other], activeSessionId: other.id });
		expect(await store.readMode("TASK-23", "build")).toMatchObject({
			activeSessionId: "relocated",
			sessions: [{ id: "relocated", lastUsedAt: "2026-10-10T12:30:00.000Z" }],
		});
	});

	it("rejects v1 state without rewriting it or allowing writes", async () => {
		const { store, statePath } = await fixture();
		await mkdir(join(statePath, ".."), { recursive: true });
		const unsupported = {
			version: 1,
			taskId: "TASK-23",
			activeSessionId: "old-id",
			sessions: [session("old-id", { nativeSessionId: "native-old" })],
		};
		const bytes = `${JSON.stringify(unsupported, null, 2)}\n`;
		await writeFile(statePath, bytes);
		await expect(store.readMode("TASK-23", "build")).rejects.toThrow(/unsupported format version 1/i);

		const ordinaryWrites = [
			() =>
				store.mutate("TASK-23", async (state) => {
					state.modes.plan ??= { sessions: [] };
					state.modes.plan.sessions.push(session("plan-write"));
				}),
			() =>
				store.mutate("TASK-23", async (state) => {
					const history = state.modes.plan ?? { sessions: [] };
					state.modes.plan = history;
					history.sessions.push(session("mode-write"));
				}),
			() =>
				store.mutate("TASK-23", async (state) => {
					const record = state.modes.build?.sessions.find(({ id }) => id === "old-id");
					if (!record) throw new Error("Expected old session.");
					record.lastUsedAt = "2026-10-10T12:30:00.000Z";
				}),
		];
		for (const operation of ordinaryWrites) {
			await expect(operation()).rejects.toThrow(/unsupported format version 1/i);
			expect(await readFile(statePath, "utf8")).toBe(bytes);
		}
	});

	it("reports corrupt, unknown and future-version state without resetting its original contents", async () => {
		const { store, statePath } = await fixture();
		await mkdir(join(statePath, ".."), { recursive: true });
		for (const [label, bytes] of [
			["corrupt JSON", "{ this is not json"],
			["unknown version", JSON.stringify({ version: 77, taskId: "TASK-23", sessions: [] })],
			["future version", JSON.stringify({ version: 3, taskId: "TASK-23", modes: {} })],
		] as const) {
			await writeFile(statePath, bytes);
			const readError = await store.read("TASK-23").catch((error: unknown) => error);
			expect(readError, label).toBeInstanceOf(Error);
			expect((readError as Error).message, `${label} must not advise destructive reset`).not.toMatch(/reset it with/i);
			expect(await readFile(statePath, "utf8"), `${label} file must survive failed read`).toBe(bytes);
			await expect(
				store.mutate("TASK-23", async (state) => {
					const history = state.modes.plan ?? { sessions: [] };
					state.modes.plan = history;
					history.sessions.push(session("never-saved"));
				}),
				label,
			).rejects.toThrow();
			expect(await readFile(statePath, "utf8"), `${label} file must survive failed mutation`).toBe(bytes);
		}
	});
});
