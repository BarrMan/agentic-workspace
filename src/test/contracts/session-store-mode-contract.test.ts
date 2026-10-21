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
		cwd: "/work/TASK-23",
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
		return { root, store, ...(await store.paths("TASK-23")) };
	}

	it("stores only the preset name for configuration identity", async () => {
		const { store } = await fixture();
		await store.mutateMode("TASK-23", "plan", async (history) => {
			history.sessions.push(session("preset-only"));
			history.activeSessionId = "preset-only";
		});
		expect((await store.readMode("TASK-23", "plan")).sessions[0]).toEqual(session("preset-only"));
	});

	it("rejects incomplete or non-absolute persisted path contexts", async () => {
		const { store } = await fixture();
		await expect(
			store.mutateMode("TASK-23", "plan", async (history) => {
				history.sessions.push(
					session("bad-path-context", {
						pathContext: {
							projectDir: "relative/project",
							worktreeDir: "/work/TASK-23",
							taskDir: "/project/tasks/task-23",
						},
					}),
				);
			}),
		).rejects.toThrow("invalid state");
		expect((await store.readMode("TASK-23", "plan")).sessions).toEqual([]);
	});

	it("keeps independent histories and active pointers through concurrent mode writes and reopen", async () => {
		const { root, store, statePath } = await fixture();
		const planner = session("plan-uuid", {
			nativeSessionId: "native-plan",
			pathContext: {
				projectDir: "/project",
				worktreeDir: "/work/plan",
				taskDir: "/project/agentic-workspace/tasks/task-23",
			},
		});
		const builder = session("build-uuid", {
			nativeSessionId: "native-build",
		});

		await Promise.all([
			store.mutateMode("TASK-23", "plan", async (history) => {
				await new Promise((resolve) => setTimeout(resolve, 12));
				history.sessions.push(planner);
				history.activeSessionId = planner.id;
			}),
			store.mutateMode("TASK-23", "build", async (history) => {
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
		await store.mutateMode("TASK-23", "plan", async () => undefined);
		await expectMetadata();
		await store.mutateSession("TASK-23", "metadata-plan", async () => undefined);
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

	it("returns an empty mode without creating state, then persists a selected session", async () => {
		const { store, statePath } = await fixture();
		expect(await store.readMode("TASK-23", "research")).toEqual({ sessions: [] });
		await expect(readFile(statePath)).rejects.toMatchObject({ code: "ENOENT" });

		await store.mutateMode("TASK-23", "research", async (history) => {
			history.sessions.push(session("research-uuid"));
			history.activeSessionId = "research-uuid";
		});
		expect(await store.readMode("TASK-23", "research")).toEqual({
			sessions: [session("research-uuid")],
			activeSessionId: "research-uuid",
		});
	});

	it("finds the current UUID owner under lock and leaves unrelated mode history and pointers intact", async () => {
		const { store } = await fixture();
		await store.mutateMode("TASK-23", "plan", async (history) => {
			history.sessions.push(session("relocated"));
			history.activeSessionId = "relocated";
		});
		await store.mutateMode("TASK-23", "plan", async (history) => {
			history.sessions = [];
			delete history.activeSessionId;
		});
		const other = session("other-mode-session");
		await store.mutateMode("TASK-23", "design", async (history) => {
			history.sessions.push(other);
			history.activeSessionId = other.id;
		});
		await store.mutateMode("TASK-23", "build", async (history) => {
			history.sessions.push(session("relocated"));
			history.activeSessionId = "relocated";
		});

		const owners: string[] = [];
		await store.mutateSession("TASK-23", "relocated", async (record, history, owner) => {
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

	it("rejects duplicate UUID membership and dangling active pointers without replacing saved bytes", async () => {
		const { store, statePath } = await fixture();
		const first = session("shared-id");
		await store.mutateMode("TASK-23", "plan", async (history) => {
			history.sessions.push(first);
			history.activeSessionId = first.id;
		});
		const before = await readFile(statePath, "utf8");
		await expect(
			store.mutateMode("TASK-23", "build", async (history) => {
				history.sessions.push(session("shared-id"));
			}),
		).rejects.toThrow(/invalid state/i);
		expect(await readFile(statePath, "utf8")).toBe(before);

		await expect(
			store.mutateMode("TASK-23", "plan", async (history) => {
				history.activeSessionId = "does-not-exist";
			}),
		).rejects.toThrow(/invalid state/i);
		expect(await readFile(statePath, "utf8")).toBe(before);
	});

	it("refuses removed snapshot fields without losing the prior session", async () => {
		const { store, statePath } = await fixture();
		const retained = session("preset-only");
		await store.mutateMode("TASK-23", "plan", async (history) => {
			history.sessions.push(retained);
			history.activeSessionId = retained.id;
		});
		const before = await readFile(statePath, "utf8");
		expect((await store.readMode("TASK-23", "plan")).sessions[0]).toEqual(retained);

		await expect(
			store.mutateMode("TASK-23", "plan", async (history) => {
				const existing = history.sessions[0];
				if (!existing) throw new Error("Missing fixture session");
				Object.assign(existing, { createdWith: {} });
			}),
		).rejects.toThrow(/invalid state/i);
		expect(await readFile(statePath, "utf8")).toBe(before);
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
			() => store.mutateMode("TASK-23", "plan", async (history) => history.sessions.push(session("mode-write"))),
			() =>
				store.mutateSession("TASK-23", "old-id", async (record) => {
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
				store.mutateMode("TASK-23", "plan", async (history) => history.sessions.push(session("never-saved"))),
				label,
			).rejects.toThrow();
			expect(await readFile(statePath, "utf8"), `${label} file must survive failed mutation`).toBe(bytes);
		}
	});
});
