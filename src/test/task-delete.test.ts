import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { BunRunner } from "../runtime/session-process.ts";
import { AgentSessionService, type ProcessRunner, type TmuxServer } from "../runtime/sessions.ts";
import { workspaceRequestDir } from "../runtime/workspace-context.ts";
import { getDefaultModeCatalog } from "../storage/config.ts";
import { SessionStore } from "../storage/session-store.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject } from "./test-utils.ts";

describe("Permanent task deletion", () => {
	let testDir: string;
	let core: Core;

	beforeEach(async () => {
		testDir = createUniqueTestDir("task-delete");
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	function sampleTask(id: string, overrides: Partial<Task> = {}): Task {
		return {
			id,
			title: "Test Task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-07-07",
			labels: [],
			dependencies: [],
			description: "Test description",
			...overrides,
		};
	}

	async function observeSessionsDead(taskId: string): Promise<void> {
		const store = new SessionStore(testDir, new BunRunner());
		const state = await store.read(taskId);
		const sessions = Object.values(state.modes).flatMap(({ sessions }) => sessions);
		const server: TmuxServer = {
			newSession: async () => ({}),
			panes: async () => [],
			cmd: async (_command, args) => {
				const target = args?.find((argument) => argument.startsWith("="));
				const session = sessions.find(({ tmuxName }) => target === `=${tmuxName}:`);
				return session ? [`${session.tmuxName}\t${testDir}\t${taskId}\t${session.id}\tlive-preview\t%1\t1`] : [];
			},
		};
		(core as unknown as { agentSessions: AgentSessionService }).agentSessions = new AgentSessionService(core, {
			runner: { run: async () => ({ exitCode: 0, stdout: "", stderr: "" }) },
			tmuxServer: server,
		});
	}

	it("removes the task markdown file", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Delete task");
		const { task } = await core.createTaskFromInput({ title: "Delete me" });
		const taskPath = task.filePath ?? (await core.findTaskRecordPath(task.id));
		expect(taskPath).toBeTruthy();
		expect(existsSync(taskPath as string)).toBe(true);

		const result = await core.deleteTask(task.id);

		expect(result).toEqual({ success: true, cleanedTaskIds: [] });
		expect(existsSync(taskPath as string)).toBe(false);
		expect(await coreFileSystem(core).loadTask(task.id)).toBeNull();
	});

	it("purges uppercase stored session state through a lowercase padded task ID", async () => {
		core = new Core(testDir);
		const store = new SessionStore(testDir, new BunRunner());
		await store.mutate("TASK-404", async (state) => {
			state.modes.build ??= { sessions: [] };
		});
		expect((await store.read(" task-404 ")).taskId).toBe("TASK-404");

		await core.sessions.purge(" task-404 ");

		const { taskDir } = await store.paths("TASK-404");
		expect(existsSync(taskDir)).toBe(false);
	});

	it("retains the task when native-session liveness cannot be established", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Delete task");
		const { task } = await core.createTaskFromInput({ title: "Keep me" });
		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(task.id);
		await store.mutate(task.id, async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push({
				id: "native-running",
				taskId: task.id,
				preset: "opencode",
				tmuxName: `agentic-workspace-${task.id.toLowerCase()}-native-running`,
				nativeWorkspace: true,
				ownerPid: 12345,
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "running",
				outputPath: join(taskDir, "native-running.log"),
				bootstrapPath: join(taskDir, "native-running.md"),
			});
			history.activeSessionId = "native-running";
		});

		await expect(core.deleteTask(task.id)).rejects.toThrow(
			"Could not inspect tmux instance for session native-running",
		);
		expect(await coreFileSystem(core).loadTask(task.id)).not.toBeNull();
		expect((await store.read(task.id)).modes.build?.sessions.map(({ id }) => id)).toEqual(["native-running"]);
	});

	it("refuses mixed-mode deletion when runtime ownership cannot be established", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Mixed session forget");
		const { task } = await core.createTaskFromInput({ title: "Forget mixed sessions" });
		const { task: otherTask } = await core.createTaskFromInput({ title: "Keep unrelated sessions" });
		let externalCalls = 0;
		const runner: ProcessRunner = {
			run: async () => {
				externalCalls += 1;
				return { exitCode: 0, stdout: "", stderr: "" };
			},
		};
		const server: TmuxServer = {
			newSession: async () => {
				externalCalls += 1;
				return {};
			},
			panes: async () => {
				externalCalls += 1;
				return [];
			},
			cmd: async () => {
				externalCalls += 1;
				return [];
			},
		};
		(core as unknown as { agentSessions: AgentSessionService }).agentSessions = new AgentSessionService(core, {
			runner,
			tmuxServer: server,
		});
		const store = new SessionStore(testDir, runner);
		const { taskDir } = await store.paths(task.id);
		const catalog = getDefaultModeCatalog();
		const modes = catalog.order;
		const fixtures = [
			{ id: "owned-running", modeId: modes[0], status: "running" as const, nativeWorkspace: true },
			{ id: "foreign-running", modeId: modes[1], status: "running" as const, nativeWorkspace: false },
			{ id: "queued-starting", modeId: modes[0], status: "starting" as const, nativeWorkspace: true },
			{ id: "owned-parked", modeId: modes[1], status: "parked" as const, nativeWorkspace: true },
			{ id: "foreign-stopped", modeId: modes[0], status: "stopped" as const, nativeWorkspace: false },
		];
		if (fixtures.some((fixture) => !fixture.modeId)) throw new Error("Expected at least two catalog modes.");
		await store.mutate(task.id, async (state) => {
			state.modes ??= {};
			for (const fixture of fixtures) {
				const record = {
					id: fixture.id,
					taskId: task.id,
					preset: "opencode",
					tmuxName: `agentic-workspace-${task.id.toLowerCase()}-${fixture.id}`,
					nativeWorkspace: fixture.nativeWorkspace,
					cwd: testDir,
					createdAt: "2026-10-12T00:00:00.000Z",
					status: fixture.status,
					outputPath: join(taskDir, `${fixture.id}.log`),
					bootstrapPath: join(taskDir, `${fixture.id}.md`),
				};
				const mode = state.modes[fixture.modeId as string] ?? { sessions: [] };
				mode.sessions.push(record);
				mode.activeSessionId = record.id;
				state.modes[fixture.modeId as string] = mode;
				await Bun.write(record.outputPath, `output:${fixture.id}`);
				await Bun.write(record.bootstrapPath, `bootstrap:${fixture.id}`);
				if (fixture.id === "queued-starting") {
					await mkdir(workspaceRequestDir(testDir), { recursive: true });
					await Bun.write(join(workspaceRequestDir(testDir), `${fixture.id}.json`), "{}\n");
				}
			}
		});
		const unrelatedTaskDir = (await store.paths(otherTask.id)).taskDir;
		const unrelatedRecord = {
			id: "unrelated-running",
			taskId: otherTask.id,
			preset: "opencode",
			tmuxName: `agentic-workspace-${otherTask.id.toLowerCase()}-unrelated-running`,
			cwd: testDir,
			createdAt: "2026-10-12T00:00:00.000Z",
			status: "running" as const,
			outputPath: join(unrelatedTaskDir, "unrelated-running.log"),
			bootstrapPath: join(unrelatedTaskDir, "unrelated-running.md"),
		};
		await store.mutate(otherTask.id, async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push(unrelatedRecord);
			history.activeSessionId = unrelatedRecord.id;
		});
		const providerData = join(testDir, "provider-conversation.json");
		await Bun.write(providerData, "preserve provider data\n");
		const taskPath = task.filePath ?? (await core.findTaskRecordPath(task.id));
		if (!taskPath) throw new Error("Expected deleted task path.");

		await expect(core.deleteTask(task.id)).rejects.toThrow("expected exactly one pane");

		expect(await coreFileSystem(core).loadTask(task.id)).not.toBeNull();
		expect(existsSync(taskPath)).toBe(true);
		const retained = await store.read(task.id);
		expect(
			Object.values(retained.modes)
				.flatMap(({ sessions }) => sessions.map(({ id }) => id))
				.sort(),
		).toEqual(fixtures.map(({ id }) => id).sort());
		for (const fixture of fixtures) {
			expect(existsSync(join(taskDir, `${fixture.id}.log`))).toBe(true);
			expect(existsSync(join(taskDir, `${fixture.id}.md`))).toBe(true);
		}
		expect(existsSync(join(workspaceRequestDir(testDir), "queued-starting.json"))).toBe(true);
		expect((await store.read(otherTask.id)).modes.build?.sessions).toEqual([unrelatedRecord]);
		expect(await Bun.file(providerData).text()).toBe("preserve provider data\n");
		expect(externalCalls).toBeGreaterThan(0);
	});

	it("distinguishes failure before forget from failure after the task container is removed", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Deletion failure boundaries");
		const { task } = await core.createTaskFromInput({ title: "Failure boundaries" });
		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(task.id);
		const record = {
			id: "boundary-session",
			taskId: task.id,
			preset: "test",
			tmuxName: `agentic-workspace-${task.id.toLowerCase()}-boundary-session`,
			cwd: testDir,
			createdAt: "2026-10-12T00:00:00.000Z",
			status: "stopped" as const,
			outputPath: join(taskDir, "boundary-session.log"),
			bootstrapPath: join(taskDir, "boundary-session.md"),
		};
		await store.mutate(task.id, async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push(record);
			history.activeSessionId = record.id;
		});
		await Bun.write(record.outputPath, "retained until task removal\n");
		await observeSessionsDead(task.id);
		const originalForget = core.sessions.forgetTaskSessions.bind(core.sessions);
		core.sessions.forgetTaskSessions = async () => {
			throw new Error("forget preflight failed");
		};
		await expect(core.deleteTask(task.id)).rejects.toThrow("forget preflight failed");
		expect(await coreFileSystem(core).loadTask(task.id)).not.toBeNull();
		expect((await store.read(task.id)).modes.build?.sessions).toEqual([record]);
		expect(await Bun.file(record.outputPath).text()).toBe("retained until task removal\n");

		core.sessions.forgetTaskSessions = originalForget;
		await observeSessionsDead(task.id);
		const deleteContainer = coreFileSystem(core).deleteTaskContainer.bind(coreFileSystem(core));
		coreFileSystem(core).deleteTaskContainer = async (
			...args: Parameters<ReturnType<typeof coreFileSystem>["deleteTaskContainer"]>
		) => {
			await deleteContainer(...args);
			throw new Error("post-removal failure");
		};
		await expect(core.deleteTask(task.id)).rejects.toThrow("post-removal failure");
		expect(await coreFileSystem(core).loadTask(task.id)).toBeNull();
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);
		expect(existsSync(record.outputPath)).toBe(false);
	});

	it("awaits locked session forgetting before removing the task file", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Delete task");
		const { task } = await core.createTaskFromInput({ title: "Await cleanup" });
		const taskPath = task.filePath ?? (await core.findTaskRecordPath(task.id));
		const { promise, resolve } = Promise.withResolvers<void>();
		let cleanupStarted = false;
		core.sessions.forgetTaskSessions = async () => {
			cleanupStarted = true;
			expect(existsSync(taskPath as string)).toBe(true);
			await promise;
		};

		const deletion = core.deleteTask(task.id);
		while (!cleanupStarted) await new Promise((done) => setTimeout(done, 0));
		expect(existsSync(taskPath as string)).toBe(true);
		resolve();
		await deletion;
		expect(existsSync(taskPath as string)).toBe(false);
	});

	it("deletion removes the task's AgenticWorkspace session associations", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Delete task");
		const { task } = await core.createTaskFromInput({ title: "Purge after delete" });
		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(task.id);
		await store.mutate(task.id, async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push({
				id: "stopped-session",
				taskId: task.id,
				preset: "opencode",
				tmuxName: `agentic-workspace-${task.id.toLowerCase()}-stopped-session`,
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "stopped",
				outputPath: join(taskDir, "stopped-session.log"),
				bootstrapPath: join(taskDir, "stopped-session.md"),
			});
			history.activeSessionId = "stopped-session";
		});
		await Bun.write(join(taskDir, "stopped-session.log"), "output\n");
		expect(existsSync(taskDir)).toBe(true);
		await observeSessionsDead(task.id);

		await core.deleteTask(task.id);
		expect(await coreFileSystem(core).loadTask(task.id)).toBeNull();
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);
		expect(existsSync(join(taskDir, "stopped-session.log"))).toBe(false);
		expect(existsSync(join(taskDir, "stopped-session.md"))).toBe(false);
	});

	it("refuses to purge a session sidecar outside its task container without deleting anything", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Delete task");
		const { task } = await core.createTaskFromInput({ title: "Keep sidecars safe" });
		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(task.id);
		const outputPath = join(taskDir, "safe-output.log");
		const sentinel = join(testDir, "outside-sentinel.md");
		await Bun.write(outputPath, "must remain until full preflight passes\n");
		await Bun.write(sentinel, "outside-owned data\n");
		await store.mutate(task.id, async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push({
				id: "tampered-session",
				taskId: task.id,
				preset: "opencode",
				tmuxName: `agentic-workspace-${task.id.toLowerCase()}-tampered-session`,
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "stopped",
				outputPath,
				bootstrapPath: sentinel,
			});
			history.activeSessionId = "tampered-session";
		});

		await expect(core.sessions.purge(task.id)).rejects.toThrow("outside its task session directory");
		expect(await coreFileSystem(core).loadTask(task.id)).not.toBeNull();
		expect((await store.read(task.id)).modes.build?.sessions[0]?.bootstrapPath).toBe(sentinel);
		expect(existsSync(outputPath)).toBe(true);
		expect(existsSync(sentinel)).toBe(true);
	});

	it("refuses session admissions under deletion's lock and rejects retries after deletion", async () => {
		const releaseDelete = Promise.withResolvers<void>();
		let deletion: Promise<unknown> | undefined;
		let testError: unknown;
		let failed = false;
		try {
			core = new Core(testDir);
			await initializeFilesystemTestProject(core, "Delete task");
			const { task } = await core.createTaskFromInput({ title: "Admission lock" });
			const store = new SessionStore(testDir, new BunRunner());
			const sessionId = "existing-stopped";
			const { taskDir } = await store.paths(task.id);
			await store.mutate(task.id, async (state) => {
				state.modes.build ??= { sessions: [] };
				const history = state.modes.build;
				history.sessions.push({
					id: sessionId,
					taskId: task.id,
					preset: "test",
					tmuxName: `agentic-workspace-${task.id.toLowerCase()}-${sessionId}`,
					nativeSessionId: "native-existing",
					nativeWorkspace: true,
					cwd: testDir,
					createdAt: new Date().toISOString(),
					status: "stopped",
					outputPath: join(taskDir, `${sessionId}.log`),
					bootstrapPath: join(taskDir, `${sessionId}.md`),
				});
				history.activeSessionId = sessionId;
			});
			await observeSessionsDead(task.id);
			const enteredDelete = Promise.withResolvers<void>();
			const deleteContainer = coreFileSystem(core).deleteTaskContainer.bind(coreFileSystem(core));
			coreFileSystem(core).deleteTaskContainer = async (
				...args: Parameters<ReturnType<typeof coreFileSystem>["deleteTaskContainer"]>
			) => {
				enteredDelete.resolve();
				await releaseDelete.promise;
				await deleteContainer(...args);
			};
			deletion = core.deleteTask(task.id);
			await enteredDelete.promise;

			let externalProcessCalls = 0;
			const runner: ProcessRunner = {
				run: async () => {
					externalProcessCalls += 1;
					return { exitCode: 0, stdout: "", stderr: "" };
				},
			};
			const server: TmuxServer = {
				newSession: async () => {
					externalProcessCalls += 1;
					return {};
				},
				panes: async () => [],
				cmd: async () => {
					externalProcessCalls += 1;
					return [];
				},
			};
			const secondCore = new Core(testDir);
			const contender = new AgentSessionService(secondCore, { runner, tmuxServer: server });
			const context = {
				v: 2 as const,
				paneId: "%42",
				rootDir: testDir,
			};
			const attempts = [
				contender.start(task.id),
				contender.prepareNativeSession(task.id, sessionId),
				contender.registerPendingSession(task.id, {}, context),
				contender.ask(task.id, "test question", { sessionId }),
			];
			const lockedOutcomes = await Promise.allSettled(attempts);
			expect(lockedOutcomes.every((result) => result.status === "rejected")).toBe(true);
			expect(externalProcessCalls).toBe(0);
			expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);

			releaseDelete.resolve();
			await deletion;
			const results = await Promise.allSettled([
				contender.start(task.id),
				contender.prepareNativeSession(task.id, sessionId),
				contender.registerPendingSession(task.id, {}, context),
				contender.ask(task.id, "test question", { sessionId }),
			]);
			expect(results.every((result) => result.status === "rejected")).toBe(true);
			expect(
				results.every((result) => result.status === "rejected" && /Locally editable task/.test(String(result.reason))),
			).toBe(true);
			expect(externalProcessCalls).toBe(0);
			expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);
		} catch (error) {
			failed = true;
			testError = error;
		} finally {
			releaseDelete.resolve();
			if (deletion) {
				try {
					await deletion;
				} catch (error) {
					if (!failed) {
						failed = true;
						testError = error;
					}
				}
			}
		}
		if (failed) throw testError;
	});

	it("does not delete a task when its native runtime ownership is uncertain", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Owned native deletion lock");
		const { task } = await core.createTaskFromInput({ title: "Owned host delete" });
		const store = new SessionStore(testDir, new BunRunner());
		const sessionId = "owned-running";
		const { taskDir } = await store.paths(task.id);
		await store.mutate(task.id, async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push({
				id: sessionId,
				taskId: task.id,
				preset: "test",
				tmuxName: `agentic-workspace-${task.id.toLowerCase()}-${sessionId}`,
				nativeSessionId: "native-owned",
				nativeWorkspace: true,
				ownerPid: process.pid,
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "running",
				outputPath: join(taskDir, `${sessionId}.log`),
				bootstrapPath: join(taskDir, `${sessionId}.md`),
			});
			history.activeSessionId = sessionId;
		});
		await expect(core.deleteTask(task.id)).rejects.toThrow("Could not inspect tmux instance");
		expect(await coreFileSystem(core).loadTask(task.id)).not.toBeNull();
		expect((await store.read(task.id)).modes.build?.sessions.map(({ id }) => id)).toEqual([sessionId]);
	});

	it("strips dependency links and references from a second task", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Delete task");
		const target = sampleTask("task-1", { title: "Delete target" });
		const dependent = sampleTask("task-2", {
			title: "Dependent task",
			dependencies: ["task-1"],
			references: ["TASK-1", "https://example.com/tasks/task-1"],
		});
		await core.createTask(target);
		await core.createTask(dependent);

		const result = await core.deleteTask("task-1");

		expect(result.success).toBe(true);
		expect(result.cleanedTaskIds).toEqual(["TASK-2"]);
		const updated = await coreFileSystem(core).loadTask("task-2");
		expect(updated?.dependencies).toEqual([]);
		expect(updated?.references).toEqual(["https://example.com/tasks/task-1"]);
	});

	it("removes the task's known session sidecars", async () => {
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Delete task");
		const { task } = await core.createTaskFromInput({ title: "Session task" });
		const store = new SessionStore(testDir, new BunRunner());
		const { taskDir } = await store.paths(task.id);
		const sessionId = "session-1";
		const outputPath = join(taskDir, `${sessionId}.log`);
		const bootstrapPath = join(taskDir, `${sessionId}.md`);
		await Bun.write(outputPath, "session output\n");
		await Bun.write(bootstrapPath, "# bootstrap\n");
		await store.mutate(task.id, async (state) => {
			state.modes.build ??= { sessions: [] };
			const history = state.modes.build;
			history.sessions.push({
				id: sessionId,
				taskId: task.id,
				preset: "opencode",
				tmuxName: `agentic-workspace-${task.id.toLowerCase()}-${sessionId}`,
				cwd: testDir,
				createdAt: new Date().toISOString(),
				status: "stopped",
				outputPath,
				bootstrapPath,
			});
			history.activeSessionId = sessionId;
		});
		await observeSessionsDead(task.id);
		expect(existsSync(taskDir)).toBe(true);

		await core.deleteTask(task.id);

		expect(existsSync(outputPath)).toBe(false);
		expect(existsSync(bootstrapPath)).toBe(false);
		expect(Object.values((await store.read(task.id)).modes).flatMap(({ sessions }) => sessions)).toEqual([]);
	});
});
