import { describe, expect, it } from "bun:test";
import { Core } from "../controller/agentic-workspace.ts";
import { cleanupTaskWorktreeSessions, withoutSelectedModeForTask } from "../filesystem/git/task-worktree-cleanup.ts";
import type { AgentSession, TaskSessions } from "../model/session/types.ts";
import { BunRunner } from "../runtime/session-process.ts";
import { AgentSessionService, type ProcessRunner, type TmuxServer } from "../runtime/sessions.ts";
import { SessionStore } from "../storage/session-store.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

function session(id: string, status: AgentSession["status"], _modeId?: string): AgentSession {
	return {
		id,
		taskId: "TASK-1",
		preset: "opencode",
		tmuxName: `tmux-${id}`,
		nativeSessionId: `native-${id}`,
		nativeWorkspace: true,
		cwd: "/task/worktree",
		createdAt: "2026-10-01T00:00:00.000Z",
		status,
		outputPath: `/tmp/${id}.log`,
		bootstrapPath: `/tmp/${id}.md`,
	};
}

describe("all-mode task cleanup contract", () => {
	it.each([
		{
			name: "successful cleanup and failed releases",
			cleanupFails: false,
			cleanupError: undefined,
			releaseFails: true,
		},
		{
			name: "failed cleanup and releases",
			cleanupFails: true,
			cleanupError: new Error("cleanup failed"),
			releaseFails: true,
		},
		{
			name: "undefined cleanup failure and failed releases",
			cleanupFails: true,
			cleanupError: undefined,
			releaseFails: true,
		},
		{ name: "undefined cleanup failure alone", cleanupFails: true, cleanupError: undefined, releaseFails: false },
		{ name: "successful cleanup and releases", cleanupFails: false, cleanupError: undefined, releaseFails: false },
	])("releases every cleanup claim and preserves errors: $name", async ({
		cleanupFails,
		cleanupError,
		releaseFails,
	}) => {
		const records = [session("a", "running"), session("b", "running"), session("c", "running")].map((record) => ({
			...record,
			nativeWorkspace: false,
		}));
		const released: string[] = [];
		const cleaned: string[] = [];
		const releaseErrors = [new Error("release c failed"), new Error("release b failed")];
		const service: AgentSessionService = Object.assign(Object.create(AgentSessionService.prototype), {
			store: {
				read: async () => ({
					taskId: "TASK-1",
					sessions: records,
					modes: { build: { sessions: records, activeSessionId: "a" } },
				}),
				claimSession: async (_taskId: string, id: string) => () => {
					released.push(id);
					if (releaseFails && id === "c") throw releaseErrors[0];
					if (releaseFails && id === "b") return Promise.reject(releaseErrors[1]);
					return Promise.resolve();
				},
				mutateSession: async () => {},
			},
			process: {
				nativeRuntimeClassification: async () => ({ status: "live" as const, paneId: "%mock" }),
				kill: async (record: AgentSession) => {
					cleaned.push(record.id);
					if (cleanupFails) throw cleanupError;
				},
			},
		});
		const outcome = await service.stopAllTaskSessions("TASK-1").then(
			() => ({ status: "fulfilled" as const }),
			(error: unknown) => ({ status: "rejected" as const, error }),
		);
		expect(released).toEqual(["c", "b", "a"]);
		expect(cleaned).toEqual(cleanupFails ? ["a"] : ["a", "b", "c"]);
		if (releaseFails) {
			expect(outcome.status).toBe("rejected");
			if (outcome.status !== "rejected") throw new Error("Expected cleanup rejection");
			expect(outcome.error).toBeInstanceOf(AggregateError);
			const aggregate = outcome.error as AggregateError;
			expect(aggregate.errors).toEqual(cleanupFails ? [cleanupError, ...releaseErrors] : releaseErrors);
			expect(aggregate.cause).toBe(cleanupFails ? cleanupError : releaseErrors[0]);
		} else if (cleanupFails) {
			expect(outcome).toEqual({ status: "rejected", error: cleanupError });
		} else {
			expect(outcome).toEqual({ status: "fulfilled" });
		}
	});

	it("cleans running histories across modes once by UUID and preserves exact native identity", async () => {
		const plan = session("plan-running", "running", "plan");
		const build = session("build-running", "running", "build");
		const merged = session("queued-running", "starting");
		const state: TaskSessions = {
			taskId: "TASK-1",
			sessions: [merged],
			modes: {
				plan: { sessions: [plan] },
				build: { sessions: [build, merged] },
			},
		};
		const cleaned: AgentSession[] = [];
		await cleanupTaskWorktreeSessions("TASK-1", {
			listAllSessions: async () => new Map([["TASK-1", state]]),
			cleanup: async (record) => {
				cleaned.push(record);
			},
		});

		expect(cleaned.map(({ id }) => id)).toEqual(["queued-running", "plan-running", "build-running"]);
		expect(cleaned.map(({ nativeSessionId }) => nativeSessionId)).toEqual([
			"native-queued-running",
			"native-plan-running",
			"native-build-running",
		]);
	});

	it("does not treat parked sessions as live cleanup targets", async () => {
		const parked = session("parked", "parked", "plan");
		let cleanups = 0;
		await cleanupTaskWorktreeSessions("TASK-1", {
			listAllSessions: async () =>
				new Map([["TASK-1", { taskId: "TASK-1", sessions: [], modes: { plan: { sessions: [parked] } } }]]),
			cleanup: async () => {
				cleanups += 1;
			},
		});
		expect(cleanups).toBe(0);
	});

	it("runs cleanup through Core before completed/deleted task storage and worktree removal", async () => {
		const root = createUniqueTestDir("all-mode-cleanup");
		const worktreeHome = createUniqueTestDir("all-mode-cleanup-home");
		const priorHome = process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
		process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = worktreeHome;
		try {
			const core = new Core(root);
			await initializeFilesystemTestProject(core, "All mode cleanup");
			await coreFileSystem(core).loadConfig();
			const task = await core.createTaskFromInput({ title: "Lifecycle cleanup" });
			const events: string[] = [];
			const sessions = (
				core as unknown as { sessions: { cleanupTaskWorktreeSessions?: (id: string) => Promise<void> } }
			).sessions;
			if (sessions?.cleanupTaskWorktreeSessions) {
				const original = sessions.cleanupTaskWorktreeSessions.bind(sessions);
				sessions.cleanupTaskWorktreeSessions = async (id) => {
					events.push(`cleanup:${id}`);
					await original(id);
				};
			}
			await core.completeTask(task.task.id);
			expect(events).toContain(`cleanup:${task.task.id}`);
		} finally {
			if (priorHome === undefined) delete process.env.AGENTIC_WORKSPACE_WORKTREE_HOME;
			else process.env.AGENTIC_WORKSPACE_WORKTREE_HOME = priorHome;
			await safeCleanup(worktreeHome);
			await safeCleanup(root);
		}
	});

	it("holds the completion task lock through cleanup and the completed-container move", async () => {
		const root = createUniqueTestDir("complete-session-admission-lock");
		try {
			const core = new Core(root);
			await initializeFilesystemTestProject(core, "Completion admission lock");
			const created = await core.createTaskFromInput({ title: "Complete with session" });
			const taskId = created.task.id;
			const store = new SessionStore(root, new BunRunner());
			const sessionId = "parked-during-completion";
			await store.mutate(taskId, async (state) => {
				state.modes.build ??= { sessions: [] };
				const history = state.modes.build;
				history.sessions.push({ ...session(sessionId, "parked"), taskId });
				history.activeSessionId = sessionId;
			});
			const cleanup = core.sessions.cleanupTaskWorktreeSessions.bind(core.sessions);
			core.sessions.cleanupTaskWorktreeSessions = async (id) => {
				expect(id).toBe(taskId);
				await store.mutateSession(id, sessionId, async (current) => {
					current.status = "stopped";
				});
				await cleanup(id);
			};
			const enteredMove = Promise.withResolvers<void>();
			const releaseMove = Promise.withResolvers<void>();
			const move = coreFileSystem(core).completeTask.bind(coreFileSystem(core));
			coreFileSystem(core).completeTask = async (id, alreadyLocked = false) => {
				if (id === taskId) {
					enteredMove.resolve();
					await releaseMove.promise;
				}
				return await move(id, alreadyLocked);
			};

			const completing = core.completeTask(taskId);
			await enteredMove.promise;
			let processCalls = 0;
			const runner: ProcessRunner = {
				run: async () => {
					processCalls += 1;
					return { exitCode: 0, stdout: "", stderr: "" };
				},
			};
			const server: TmuxServer = {
				newSession: async () => {
					processCalls += 1;
					throw new Error("Unexpected agent host creation");
				},
				panes: async () => [],
				cmd: async () => {
					processCalls += 1;
					return [];
				},
			};
			const contender = new AgentSessionService(new Core(root), { runner, tmuxServer: server });
			await expect(contender.start(taskId)).rejects.toThrow();
			expect(processCalls).toBe(0);
			expect((await store.read(taskId)).modes.build?.sessions.map((record) => record.id)).toEqual([sessionId]);
			expect((await store.read(taskId)).modes.build?.sessions[0]?.status).toBe("stopped");

			releaseMove.resolve();
			expect(await completing).toBe(true);
			expect((await coreFileSystem(core).listCompletedTasks()).some((task) => task.id === taskId)).toBe(true);
			expect(processCalls).toBe(0);
		} finally {
			await safeCleanup(root);
		}
	});

	it("keeps worktree/state intact when cleanup fails", async () => {
		const task = "TASK-1";
		const state = { selectedModeByTask: { [task]: "plan", other: "build" } as Record<string, string> };
		expect(withoutSelectedModeForTask(state, task)).toEqual({ selectedModeByTask: { other: "build" } });
		expect(withoutSelectedModeForTask(state, "missing")).toBe(state);
		const marker = new Error("native stop failed");
		await expect(
			cleanupTaskWorktreeSessions(task, {
				listAllSessions: async () => new Map([[task, { taskId: task, sessions: [session("live", "running")] }]]),
				cleanup: async () => {
					throw marker;
				},
			}),
		).rejects.toBe(marker);
	});
});
