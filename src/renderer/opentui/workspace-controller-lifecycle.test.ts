import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { upsertAgentConfiguration } from "../../controller/agent-configuration.ts";
import { Core } from "../../controller/agentic-workspace.ts";
import type { ObservedSession } from "../../controller/session-application.ts";
import type { AgentSession, TerminalAttachment } from "../../model/session/types.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog } from "../../storage/config.ts";
import { initializeTestProject } from "../../test/test-utils.ts";
import type { OpenTuiHost } from "./host.ts";
import type { mountOpenTuiSessionPicker } from "./session-picker.ts";
import { createWorkspaceFilters } from "./workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "./workspace.ts";
import { OpenTuiWorkspaceController } from "./workspace-controller.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const waitFor = async (condition: () => boolean): Promise<void> => {
	for (let attempt = 0; attempt < 500; attempt++) {
		if (condition()) return;
		await Bun.sleep(2);
	}
	throw new Error("Timed out waiting for workspace lifecycle event.");
};

async function fixture(
	options: {
		deferSuccessorAttach?: boolean;
		failPredecessorDetach?: boolean;
		deferStartup?: boolean;
		deferShutdown?: boolean;
		workingSessions?: boolean;
		confirmResult?: boolean;
		secondTask?: boolean;
		deferResume?: boolean;
	} = {},
) {
	const root = await mkdtemp(join(tmpdir(), "workspace-controller-lifecycle-"));
	roots.push(root);
	const core = new Core(root);
	let taskCallbacks!: Parameters<Core["watchTasks"]>[0];
	core.watchTasks = (callbacks) => {
		taskCallbacks = callbacks;
		return { stop() {} } as ReturnType<Core["watchTasks"]>;
	};
	await initializeTestProject(core, "Lifecycle");
	await upsertAgentConfiguration(core, "project", {
		...getBuiltInAgentConfiguration(),
		modes: getDefaultModeCatalog(),
	});
	const { task } = await core.createTaskFromInput({ title: "Handoff task", status: "To Do" });
	const tasks = [task];
	if (options.secondTask) tasks.push((await core.createTaskFromInput({ title: "Other task", status: "To Do" })).task);
	let deferModeHistory = false;
	let historyStarted = false;
	let finishModeHistory: (() => void) | undefined;
	let pickerMounts = 0;
	const disposedPickers = new Set<number>();
	let resumeAttempts = 0;
	let rejectResume: ((error: Error) => void) | undefined;
	let pickerOptions: Parameters<typeof mountOpenTuiSessionPicker>[2] | undefined;
	const attached: string[] = [];
	const detached: string[] = [];
	let stops = 0;
	let rejectStartup: ((error: Error) => void) | undefined;
	let startupStarted = false;
	let detachFailures = 0;
	let attachmentDetaches = 0;
	let finishShutdown: ((error?: Error) => void) | undefined;
	let shutdowns = 0;
	let prompts = 0;
	let polls = 0;
	let deliverRequest: (() => void) | undefined;
	let requestPending = false;
	const adopted: string[] = [];
	let successorAttach: (() => void) | undefined;
	let successorAttachStarted!: () => void;
	const successorAttachStartedPromise = new Promise<void>((resolve) => (successorAttachStarted = resolve));
	const history: AgentSession[] = [];
	const observed = (record: AgentSession): ObservedSession => ({
		record,
		snapshot: { state: "running", activity: "idle", idleSince: null },
	});
	const makeRecord = (id: string): AgentSession => ({
		id,
		taskId: task.id,
		preset: "claude",
		tmuxName: `tmux-${id}`,
		cwd: root,
		createdAt: new Date().toISOString(),
		outputPath: join(root, `${id}.log`),
		bootstrapPath: join(root, `${id}.sh`),
	});
	if (options.deferResume) history.push(makeRecord("saved"));
	const sessionApplication = {
		projectInventory: async () =>
			options.deferShutdown || options.workingSessions !== undefined
				? [
						{
							sessions: history.map((record) => ({
								...observed(record),
								snapshot: {
									state: "running",
									activity: (options.workingSessions ?? options.deferShutdown) ? "working" : "idle",
								},
							})),
						},
					]
				: [],
		pendingRequests: async () => {
			polls++;
			if (options.deferShutdown && polls === 1) {
				await new Promise<void>(
					(resolve) =>
						(deliverRequest = () => {
							requestPending = true;
							resolve();
						}),
				);
			}
			return requestPending ? [{ taskId: task.id, sessionId: "request" }] : [];
		},
		adoptRequest: async (_taskId: string, sessionId: string) => {
			adopted.push(sessionId);
			requestPending = false;
			const record = makeRecord(sessionId);
			history.push(record);
			return observed(record);
		},
		readObserved: async (_taskId: string, sessionId: string) =>
			options.deferResume && sessionId === "saved"
				? { record: makeRecord(sessionId), snapshot: { state: "stopped", activity: "unknown" } }
				: observed(makeRecord(sessionId)),
		resumeSession: async (_taskId: string, sessionId: string) => {
			resumeAttempts++;
			if (options.deferResume && resumeAttempts === 1)
				await new Promise<void>((_resolve, reject) => (rejectResume = reject));
			return observed(makeRecord(sessionId));
		},
		newSession: async () => {
			const record = makeRecord("predecessor");
			history.push(record);
			return observed(record);
		},
		handoff: async () => {
			const record = makeRecord("successor");
			history.push(record);
			return observed(record);
		},
		stopSession: async () => {
			stops++;
		},
		shutdown: async () => {
			shutdowns++;
			if (options.deferShutdown)
				await new Promise<void>((resolve, reject) => {
					finishShutdown = (error) => (error ? reject(error) : resolve());
				});
		},
	} as never;
	const workspaceState = {
		sessionApplication,
		listTasks: async () => tasks,
		listAllSessions: async () =>
			new Map([[task.id, { taskId: task.id, sessions: [...history], activeSessionId: history.at(-1)?.id }]]),
		listSessions: async () => ({ taskId: task.id, sessions: history }),
		listModeSessions: async (taskId: string, modeId: string) => {
			if (deferModeHistory) {
				deferModeHistory = false;
				historyStarted = true;
				await new Promise<void>((resolve) => (finishModeHistory = resolve));
			}
			return { taskId, modeId, sessions: [...history], activeSessionId: history.at(-1)?.id };
		},
		findSessionMode: async () => "plan",
		liveSession: async () => undefined,
	} as never;
	let workspace: OpenTuiWorkspaceOptions | undefined;
	const renderer = Object.assign(new EventEmitter(), { width: 120, height: 40 });
	const host = { renderer, root: {}, destroy() {} } as unknown as OpenTuiHost;
	const viewStateStore = {
		current: { filters: createWorkspaceFilters(), detailsVisible: false, selectedTaskId: task.id },
		origin: "test",
		async update(patch: (state: unknown) => unknown) {
			viewStateStore.current = patch(viewStateStore.current) as typeof viewStateStore.current;
		},
		subscribe: () => () => {},
		async recheck() {},
		close() {},
	};
	const controller = new OpenTuiWorkspaceController(core, {
		workspaceState,
		viewStateStore: viewStateStore as never,
		runtime: {
			createHost: async () => host,
			mountWorkspace: (_renderer: unknown, _root: unknown, next: OpenTuiWorkspaceOptions) => {
				workspace = next;
				return {
					update: (value: OpenTuiWorkspaceOptions) => (workspace = value),
					dispose() {},
					setIndication() {},
				};
			},
			mountBoard: () => ({ dispose() {} }),
			mountSessionPicker: (
				_renderer: unknown,
				_root: unknown,
				next: Parameters<typeof mountOpenTuiSessionPicker>[2],
			) => {
				pickerMounts++;
				const index = pickerMounts;
				pickerOptions = next;
				return {
					dispose() {
						disposedPickers.add(index);
					},
				};
			},
			mountConfirm: () => {
				prompts++;
				return { result: Promise.resolve(options.confirmResult ?? true), dispose() {} };
			},
			createActivityProbe: () => ({ probe: async () => new Map() }),
			createExistingAgentHost: (args: { paneId: string }) => ({
				alive: async () => true,
				async start() {
					if (options.deferStartup && !startupStarted) {
						startupStarted = true;
						await new Promise<void>((_resolve, reject) => (rejectStartup = reject));
					}
				},
				async stop() {
					stops++;
				},
				async detach() {
					detached.push(args.paneId);
					if (detachFailures-- > 0) throw new Error("attachment detach failed");
					if (args.paneId === "pane-predecessor" && options.failPredecessorDetach)
						throw new Error("predecessor detach failed");
					return "retained" as const;
				},
				async resize() {},
				sendBytes() {},
				inputTransport: () => ({ transport: "send-keys-fork" as const, detail: "test" }),
				inputStats: () => undefined,
				async flushInput() {},
			}),
			createWorkspaceAgent: () => ({
				isDestroyed: false,
				destroy() {
					this.isDestroyed = true;
				},
				write() {},
				resize() {},
			}),
			isAgentAlive: async () => true,
		} as never,
		sessionRuntime: {
			async attach(record: AgentSession): Promise<TerminalAttachment> {
				attached.push(record.id);
				if (record.id === "successor" && options.deferSuccessorAttach) {
					successorAttachStarted();
					await new Promise<void>((resolve) => (successorAttach = resolve));
				}
				return {
					record,
					paneId: `pane-${record.id}`,
					server: {} as never,
					exec: {} as never,
					outputPath: record.outputPath,
					bootstrap: "claude",
				};
			},
			async detach() {
				attachmentDetaches++;
			},
		} as never,
	} as never);
	const running = controller.run();
	await waitFor(() => workspace !== undefined);
	return {
		controller,
		running,
		task,
		tasks,
		attached,
		detached,
		get stops() {
			return stops;
		},
		get prompts() {
			return prompts;
		},
		get shutdowns() {
			return shutdowns;
		},
		get workspace() {
			if (!workspace) throw new Error("Workspace is not mounted.");
			return workspace;
		},
		successorAttachStartedPromise,
		finishSuccessorAttach: () => successorAttach?.(),
		waitForStartup: () => waitFor(() => startupStarted),
		failStartup: () => rejectStartup?.(new Error("host startup failed")),
		failDetaches: (count: number) => (detachFailures = count),
		removeTask: () => taskCallbacks.onTaskRemoved?.(task.id),
		get attachmentDetaches() {
			return attachmentDetaches;
		},
		adopted,
		waitForPoll: (count: number) => waitFor(() => polls >= count),
		deliverRequest: () => deliverRequest?.(),
		waitForShutdown: (count: number) => waitFor(() => shutdowns >= count),
		finishShutdown: (error?: Error) => finishShutdown?.(error),
		deferNextModeHistory: () => {
			deferModeHistory = true;
		},
		waitForModeHistory: () => waitFor(() => historyStarted),
		finishModeHistory: () => finishModeHistory?.(),
		get pickerMounts() {
			return pickerMounts;
		},
		get pickerOptions() {
			return pickerOptions;
		},
		disposedPickers,
		waitForResume: () => waitFor(() => resumeAttempts > 0),
		failResume: () => rejectResume?.(new Error("resume failed")),
		externalViewChange: () =>
			viewStateStore.update((state) => ({ ...(state as typeof viewStateStore.current), detailsVisible: true })),
	};
}

describe("workspace controller attachment lifecycle", () => {
	it.each([
		"navigation",
		"view-state",
	] as const)("releases a pending resume picker after stale %s failure", async (change) => {
		const test = await fixture({ secondTask: true, deferResume: true });
		try {
			const first = test.workspace.tasks[0];
			const second = test.workspace.tasks[1];
			if (!first || !second) throw new Error("Fixture tasks missing.");
			test.workspace.onSessionRequest?.(first);
			await waitFor(() => test.pickerOptions !== undefined);
			const resuming = Promise.resolve(test.pickerOptions?.onResume?.("saved"));
			void resuming.catch(() => undefined);
			await test.waitForResume();
			if (change === "navigation") test.workspace.onTaskSelect?.(second);
			else await test.externalViewChange();
			test.failResume();
			await expect(resuming).rejects.toThrow("resume failed");
			expect(test.disposedPickers.has(1)).toBe(true);
			await test.controller.refresh();
			test.workspace.onSessionRequest?.(change === "navigation" ? second : first);
			await waitFor(() => test.pickerMounts === 2);
			expect(test.pickerOptions?.taskId).toBe(change === "navigation" ? second.id : first.id);
		} finally {
			test.failResume();
			test.controller.destroy();
			await test.running;
		}
	});

	it("retains the same-context resume picker for a successful retry", async () => {
		const test = await fixture({ deferResume: true });
		try {
			const task = test.workspace.tasks[0];
			if (!task) throw new Error("Fixture task missing.");
			test.workspace.onSessionRequest?.(task);
			await waitFor(() => test.pickerOptions !== undefined);
			const picker = test.pickerOptions;
			const resuming = Promise.resolve(picker?.onResume?.("saved"));
			void resuming.catch(() => undefined);
			await test.waitForResume();
			test.failResume();
			await expect(resuming).rejects.toThrow("resume failed");
			expect(test.disposedPickers.has(1)).toBe(false);
			test.workspace.onSessionRequest?.(task);
			expect(test.pickerMounts).toBe(1);
			await picker?.onResume?.("saved");
			expect(test.attached).toEqual(["saved"]);
		} finally {
			test.failResume();
			test.controller.destroy();
			await test.running;
		}
	});

	it("rejects a stale picker history after navigation and permits a picker for the new selection", async () => {
		const test = await fixture({ secondTask: true });
		try {
			const first = test.workspace.tasks[0];
			const second = test.workspace.tasks[1];
			if (!first || !second) throw new Error("Fixture tasks missing.");
			test.deferNextModeHistory();
			test.workspace.onSessionRequest?.(first);
			await test.waitForModeHistory();
			test.workspace.onTaskSelect?.(second);
			test.finishModeHistory();
			await test.controller.refresh();
			expect(test.pickerMounts).toBe(0);
			test.workspace.onSessionRequest?.(second);
			await waitFor(() => test.pickerMounts === 1);
			expect(test.pickerOptions?.taskId).toBe(second.id);
			expect(test.attached).toEqual([]);
		} finally {
			test.finishModeHistory();
			test.controller.destroy();
			await test.running;
		}
	});

	it.each([
		["detaches without shutdown when the user declines force close", true, false, 1],
		["detaches without prompting or shutdown when no sessions are working", false, true, 0],
	] as const)("%s", async (_name, workingSessions, confirmResult, expectedPrompts) => {
		const test = await fixture({ workingSessions, confirmResult });
		try {
			const task = test.workspace.tasks[0];
			if (!task) throw new Error("Fixture task missing.");
			await test.workspace.onAgentStart?.(task, 80, 24);
			await test.controller.refresh();
			await test.workspace.onQuit?.();
			await test.running;
			expect(test.prompts).toBe(expectedPrompts);
			expect(test.shutdowns).toBe(0);
			expect(test.stops).toBe(0);
			expect(test.detached).toEqual(["pane-predecessor"]);
			expect(test.attachmentDetaches).toBe(1);
		} finally {
			test.controller.destroy();
			await test.running;
		}
	});

	it("blocks request admission during force shutdown and admits it again after failure", async () => {
		const test = await fixture({ deferShutdown: true });
		try {
			const task = test.workspace.tasks[0];
			if (!task) throw new Error("Fixture task missing.");
			await test.workspace.onAgentStart?.(task, 80, 24);
			await test.controller.refresh();
			await test.waitForPoll(1);
			const quitting = test.workspace.onQuit?.();
			await test.waitForShutdown(1);
			test.deliverRequest();
			await test.waitForPoll(2);
			expect(test.adopted).toEqual([]);
			expect(test.attached).toEqual(["predecessor"]);
			test.finishShutdown(new Error("shutdown failed"));
			await quitting;
			await waitFor(() => test.workspace.notice?.includes("shutdown failed") === true);
			await waitFor(() => test.attached.includes("request"));
			expect(test.adopted).toEqual(["request"]);
			const retry = test.workspace.onQuit?.();
			await test.waitForShutdown(2);
			test.finishShutdown();
			await retry;
			await test.running;
			expect(test.detached).toContain("pane-predecessor");
			expect(test.detached).toContain("pane-request");
		} finally {
			test.deliverRequest();
			test.finishShutdown();
			test.controller.destroy();
			await test.running;
		}
	});

	it("reports startup and detach failures during task invalidation and retains cleanup for close", async () => {
		const test = await fixture({ deferStartup: true });
		try {
			const task = test.workspace.tasks[0];
			if (!task) throw new Error("Fixture task missing.");
			const starting = test.workspace.onAgentStart?.(task, 80, 24);
			await test.waitForStartup();
			test.failDetaches(2);
			const removal = Promise.resolve(test.removeTask());
			void removal.catch(() => undefined);
			test.failStartup();
			await expect(removal).rejects.toThrow(/host startup failed[\s\S]*attachment detach failed/);
			await starting;
			expect(test.detached).toEqual(["pane-predecessor", "pane-predecessor"]);
			expect(test.attachmentDetaches).toBe(0);
			expect(test.stops).toBe(0);
		} finally {
			test.failStartup();
			test.controller.destroy();
			await test.running;
		}
		expect(test.detached).toEqual(["pane-predecessor", "pane-predecessor", "pane-predecessor"]);
		expect(test.attachmentDetaches).toBe(1);
	});

	it("settles a handoff attachment and predecessor release before ordinary close", async () => {
		const test = await fixture({ deferSuccessorAttach: true });
		try {
			const task = test.workspace.tasks[0];
			if (!task) throw new Error("Fixture task missing.");
			await test.workspace.onAgentStart?.(task, 80, 24);
			expect(test.attached).toEqual(["predecessor"]);
			test.workspace.onHandoffRequest?.(task);
			await test.successorAttachStartedPromise;
			let closed = false;
			void test.running.then(() => (closed = true));
			test.controller.destroy();
			await Bun.sleep(10);
			expect(closed).toBe(false);
			expect(test.detached).toEqual([]);
			test.finishSuccessorAttach();
			await test.running;
			expect(test.attached).toEqual(["predecessor", "successor"]);
			expect(test.detached).toContain("pane-predecessor");
			expect(test.detached).toContain("pane-successor");
			expect(test.stops).toBe(0);
		} finally {
			test.finishSuccessorAttach();
			test.controller.destroy();
			await test.running;
		}
	});

	it("surfaces predecessor detach failure after the successor starts", async () => {
		const test = await fixture({ failPredecessorDetach: true });
		try {
			const task = test.workspace.tasks[0];
			if (!task) throw new Error("Fixture task missing.");
			await test.workspace.onAgentStart?.(task, 80, 24);
			test.workspace.onHandoffRequest?.(task);
			await waitFor(() => test.workspace.notice?.includes("predecessor cleanup failed") === true);
			expect(test.attached).toEqual(["predecessor", "successor"]);
			expect(test.stops).toBe(0);
		} finally {
			test.controller.destroy();
			await test.running;
		}
	});
});
