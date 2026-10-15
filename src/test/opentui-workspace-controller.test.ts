import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { BoxRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import type {
	ActivityProbe,
	ActivityProbeEvidence,
	ActivityProbeTarget,
} from "../agent-workspace/agent-status-probe.ts";
import {
	getBuiltInAgentConfiguration,
	getDefaultModeCatalog,
	upsertAgentConfiguration,
} from "../agent-workspace/config.ts";
import type { GroupState, GroupStore } from "../agent-workspace/group-store.ts";
import type { AgentHost } from "../agent-workspace/live/agent-host.ts";
import type { createExistingAgentHost } from "../agent-workspace/live/existing-agent-host.ts";
import { BunRunner, type TmuxServer } from "../agent-workspace/session-process.ts";
import { SessionStore } from "../agent-workspace/session-store.ts";
import { nativeSessionName } from "../agent-workspace/session-utils.ts";
import type { SharedAgentAttachment } from "../agent-workspace/sessions.ts";
import { AgentSessionService, ExactResumeUnavailableError } from "../agent-workspace/sessions.ts";
import type { AgentIndication, AgentSession, AgentSessionStatus, TaskSessions } from "../agent-workspace/types.ts";
import type { ViewStateEnvelope, ViewStateListener, ViewStateStore } from "../agent-workspace/view-state-store.ts";
import { workspaceRequestDir, writeWorkspaceRequest } from "../agent-workspace/workspace-context.ts";
import { WorkspaceStateService } from "../agent-workspace/workspace-state.ts";
import { Core } from "../core/agentic-workspace.ts";
import type { Task } from "../types/index.ts";
import type { OpenTuiBoardProps } from "../ui/opentui/board.ts";
import type { OpenTuiConfirmMount } from "../ui/opentui/confirm.ts";
import type { OpenTuiHost } from "../ui/opentui/host.ts";
import type { OpenTuiSessionPickerOptions } from "../ui/opentui/session-picker.ts";
import { createWorkspaceFilters, type SharedWorkspaceState } from "../ui/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceMount, OpenTuiWorkspaceOptions } from "../ui/opentui/workspace.ts";
import { mountOpenTuiWorkspace } from "../ui/opentui/workspace.ts";
import { createWorkspaceAgent } from "../ui/opentui/workspace-agent.ts";
import { modeSessionIndication, OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";
import { initializeTestProject, waitUntil as waitForCondition } from "./test-utils.ts";

class MemoryViewStateStore implements ViewStateStore<SharedWorkspaceState> {
	#state: SharedWorkspaceState;
	#revision = 0;
	#listeners = new Set<ViewStateListener<SharedWorkspaceState>>();
	readonly origin = "test-store";

	constructor(state: SharedWorkspaceState) {
		this.#state = state;
	}

	get current(): SharedWorkspaceState {
		return this.#state;
	}

	async update(patch: (state: SharedWorkspaceState) => SharedWorkspaceState): Promise<void> {
		this.#state = patch(this.#state);
		this.#revision += 1;
		const envelope: ViewStateEnvelope<SharedWorkspaceState> = {
			rev: this.#revision,
			origin: this.origin,
			state: this.#state,
		};
		for (const listener of [...this.#listeners]) listener(envelope);
	}

	subscribe(listener: ViewStateListener<SharedWorkspaceState>): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	async recheck(): Promise<void> {}

	close(): void {
		this.#listeners.clear();
	}
}

class DeferredFirstUpdateStore extends MemoryViewStateStore {
	#calls = 0;
	#firstUpdateStarted = false;
	#releaseFirstUpdate: () => void = () => undefined;
	readonly #firstUpdate = new Promise<void>((resolve) => {
		this.#releaseFirstUpdate = resolve;
	});

	get firstUpdateStarted(): boolean {
		return this.#firstUpdateStarted;
	}

	releaseFirstUpdate(): void {
		this.#releaseFirstUpdate();
	}

	override async update(patch: (state: SharedWorkspaceState) => SharedWorkspaceState): Promise<void> {
		this.#calls += 1;
		if (this.#calls === 1) {
			this.#firstUpdateStarted = true;
			await this.#firstUpdate;
		}
		await super.update(patch);
	}
}

class MountRecorder {
	readonly options: OpenTuiWorkspaceOptions[] = [];
	readonly boardOptions: OpenTuiBoardProps[] = [];
	readonly indication: Array<ReadonlyMap<string, AgentIndication>> = [];
	#disposedCount = 0;
	#mountCount = 0;
	#waiters: Array<() => void> = [];

	get disposed(): number {
		return this.#disposedCount;
	}

	get mounts(): number {
		return this.#mountCount;
	}

	#record(options: OpenTuiWorkspaceOptions): void {
		this.options.push(options);
		for (const resolve of this.#waiters.splice(0)) resolve();
	}

	mount(options: OpenTuiWorkspaceOptions): OpenTuiWorkspaceMount {
		this.#mountCount += 1;
		this.#record(options);
		return {
			update: (next) => this.#record(next),
			setIndication: (indication) => {
				this.indication.push(indication);
			},
			dispose: () => {
				this.#disposedCount += 1;
			},
		};
	}

	mountBoard(props: OpenTuiBoardProps): { dispose(): void } {
		this.boardOptions.push(props);
		return { dispose() {} };
	}

	async next(index: number): Promise<OpenTuiWorkspaceOptions> {
		while (!this.options[index]) {
			await new Promise<void>((resolve) => this.#waiters.push(resolve));
		}
		return this.options[index] as OpenTuiWorkspaceOptions;
	}
}

/** In-memory {@link GroupStore} that applies each patch and notifies, recording every committed state. */
class MemoryGroupStore implements GroupStore {
	#state: GroupState;
	readonly #listeners = new Set<(state: GroupState) => void>();
	readonly updates: GroupState[] = [];

	constructor(state: GroupState) {
		this.#state = state;
	}

	get current(): GroupState {
		return this.#state;
	}

	async update(patch: (state: GroupState) => GroupState): Promise<void> {
		this.#state = patch(this.#state);
		this.updates.push(this.#state);
		for (const listener of [...this.#listeners]) listener(this.#state);
	}

	subscribe(listener: (state: GroupState) => void): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	close(): void {
		this.#listeners.clear();
	}
}

function groupSeed(): GroupState {
	return {
		groups: [
			{ id: "g1", name: "G1", parentId: null, order: 0, collapsed: false },
			{ id: "g2", name: "G2", parentId: "g1", order: 0, collapsed: false },
		],
		membership: {},
	};
}

/** Core stub whose filesystem has a real agentic-workspace directory, so the task composer may open. */
function composerCore(agenticWorkspaceDir: string, created: Task): Core {
	mkdirSync(agenticWorkspaceDir, { recursive: true });
	writeFileSync(
		join(agenticWorkspaceDir, "agents.json"),
		JSON.stringify({ ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() }),
	);
	return {
		loadTasks: async () => [],
		createTaskFromInput: async () => ({ task: created }),
		filesystem: {
			rootDir: agenticWorkspaceDir,
			agenticWorkspaceDir,
			loadTask: async (id: string) => task(id),
			loadConfig: async () => ({ projectName: "Roadmap", statuses: ["To Do"], autoCommit: false }),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
}

function task(id: string, overrides: Partial<Task> = {}): Task {
	return {
		id,
		title: `Task ${id}`,
		status: "To Do",
		assignee: [],
		createdDate: "2026-10-05",
		labels: [],
		dependencies: [],
		...overrides,
	};
}

/** A grammar-valid tmux session name for a task's deterministic native identity. */
function agenticWorkspaceSessionName(taskId: string): string {
	return nativeSessionName(taskId, "deadbeef");
}

function session(taskId: string) {
	return {
		id: `session-${taskId}`,
		taskId,
		preset: "opencode",
		tmuxName: agenticWorkspaceSessionName(taskId),
		cwd: "/tmp",
		createdAt: "2026-10-05T00:00:00.000Z",
		status: "running",
		outputPath: "/tmp/output",
		bootstrapPath: "/tmp/bootstrap",
	} satisfies AgentSession;
}

function taskSessions(taskId: string, active = true): TaskSessions {
	const activeSession = session(taskId);
	const sessions = active ? [activeSession] : [];
	return {
		taskId,
		activeSessionId: active ? activeSession.id : undefined,
		sessions,
		modes: { plan: { sessions, activeSessionId: active ? activeSession.id : undefined } },
	};
}

function workspaceState(tasks: Task[], listSessions: (taskId: string) => Promise<TaskSessions>): WorkspaceStateService {
	return createWorkspaceState({
		listTasks: async () => tasks,
		listSessions,
		listAllSessions: async () =>
			new Map(await Promise.all(tasks.map(async (task) => [task.id, await listSessions(task.id)] as const))),
		liveSession: async () => undefined,
		removeTaskSessions: async () => {},
	} as unknown as WorkspaceStateService);
}

function createWorkspaceState(service: WorkspaceStateService): WorkspaceStateService {
	const defaultModeId = getDefaultModeCatalog().defaultModeId;
	const originalListModeSessions = service.listModeSessions?.bind(service);
	const normalize = (history: TaskSessions): TaskSessions => {
		const plan = history.modes?.[defaultModeId];
		return {
			...history,
			modes: {
				...history.modes,
				[defaultModeId]: plan ?? {
					sessions: history.sessions,
					activeSessionId: history.activeSessionId,
				},
			},
		};
	};
	const adapted = Object.create(service) as WorkspaceStateService;
	Object.assign(adapted, {
		listSessions: async (taskId: string) => normalize(await service.listSessions(taskId)),
		listAllSessions: async () => {
			const all = await service.listAllSessions();
			return new Map([...all].map(([taskId, history]) => [taskId, normalize(history)]));
		},
		listModeSessions: async (taskId: string, modeId: string) => {
			if (originalListModeSessions) return originalListModeSessions(taskId, modeId);
			const history = normalize(await service.listSessions(taskId));
			return history.modes?.[modeId] ?? { sessions: [], activeSessionId: undefined };
		},
	});
	return adapted;
}

type ControllerTestOptions = Omit<
	NonNullable<ConstructorParameters<typeof OpenTuiWorkspaceController>[1]>,
	"runtime"
> & {
	runtime?: NonNullable<ConstructorParameters<typeof OpenTuiWorkspaceController>[1]>["runtime"] & {
		createAgentHost?: TestAgentHostFactory;
	};
};

type TestAgentHostOptions = { sessionId: string; agentCommand: string };
type TestAgentHostFactory = (options: TestAgentHostOptions) => AgentHost;

function createController(core: Core, options: ControllerTestOptions = {}) {
	const supplied = options ?? {};
	// The controller now consults Core's session facade as well as the workspace projection. Fake
	// cores have no durable store, so resolve those lookups from the fixture's own session history.
	const workspaceState = supplied.workspaceState;
	if (workspaceState && !workspaceState.sessionApplication) {
		Object.assign(workspaceState, {
			sessionApplication: {
				newSession: async (taskId: string, modeId: string) => {
					const attachment = await workspaceState.prepareNewSession(taskId, modeId);
					return attachment.record;
				},
				resumeSession: async (taskId: string, sessionId: string) => {
					const history = await workspaceState.listSessions(taskId);
					const modeId =
						Object.entries(history.modes ?? {}).find(([, mode]) =>
							mode.sessions.some(({ id }) => id === sessionId),
						)?.[0] ?? getDefaultModeCatalog().defaultModeId;
					const attachment = await workspaceState.prepareSession(taskId, sessionId, modeId);
					return attachment.record;
				},
			},
		});
	}
	if (workspaceState && !core.sessions) {
		Object.defineProperty(core, "sessions", {
			configurable: true,
			value: {
				getSession: async (taskId: string, sessionId: string) => {
					const history = await workspaceState.listSessions(taskId);
					return history.sessions.find((candidate) => candidate.id === sessionId);
				},
			},
		});
	}
	const runtime = supplied.runtime;
	const injectedRuntime = runtime
		? {
				...runtime,
				createAgentHost: () => {
					throw new Error("Controller fake tests must use shared existing-agent attachments");
				},
				createExistingAgentHost:
					runtime.createExistingAgentHost ??
					((options: Parameters<typeof createExistingAgentHost>[0]) => {
						const legacyFakeHost = runtime.createAgentHost?.({
							sessionId: options.paneId.replace(/^%/, ""),
							agentCommand: "",
						} as TestAgentHostOptions) as AgentHost | undefined;
						return fakeExistingAgentHost(options, legacyFakeHost);
					}),
			}
		: undefined;
	return new OpenTuiWorkspaceController(core, {
		...supplied,
		...(workspaceState ? { workspaceState: createWorkspaceState(workspaceState) } : {}),
		...(injectedRuntime ? { runtime: injectedRuntime } : {}),
	});
}

function fakeExistingAgentHost(
	_options: Parameters<typeof createExistingAgentHost>[0],
	fake: AgentHost | undefined = undefined,
): ReturnType<typeof createExistingAgentHost> {
	let disposed = false;
	return {
		...fake,
		async start() {
			disposed = false;
			await fake?.start();
		},
		async stop() {
			await fake?.stop();
			disposed = true;
		},
		async detach(history?: import("../agent-workspace/activity-observer.ts").ActivityHistory) {
			if (fake && "detach" in fake && typeof fake.detach === "function") await fake.detach(history);
			disposed = true;
			return "retained" as const;
		},
		async resize(columns: number, rows: number) {
			if (!disposed) await fake?.resize?.(columns, rows);
		},
		sendBytes: (bytes: Uint8Array) => fake?.sendBytes(bytes),
		inputTransport: () => fake?.inputTransport() ?? { transport: "send-keys-fork", detail: "fake attachment" },
		inputStats: () => fake?.inputStats(),
		flushInput: async () => fake?.flushInput(),
		alive: async () => !disposed,
	} as ReturnType<typeof createExistingAgentHost>;
}

/** A promise a test resolves by hand, so a refresh can be held open while state changes. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve: () => void = () => undefined;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

/** Workspace state whose `listTasks` runs `beforeList` first, for holding a refresh mid-flight. */
function gatedWorkspaceState(tasks: Task[], beforeList: () => Promise<void>): WorkspaceStateService {
	return {
		listTasks: async () => {
			await beforeList();
			return tasks;
		},
		listSessions: async (taskId: string) => taskSessions(taskId, false),
		listAllSessions: async () => new Map(),
		liveSession: async () => undefined,
	} as unknown as WorkspaceStateService;
}

/** A corpus snapshot for the fake cores, so the controller's detail reads resolve against their tasks. */
function corpusSnapshot(tasks: Task[]) {
	return {
		activeTasks: tasks,
		tasks,
		config: { statuses: ["To Do", "In Progress", "Done"] },
		identityIndex: {
			getTasks: () => tasks,
			getContestedIds: () => new Set<string>(),
		},
	};
}

function projectConfiguration() {
	return { ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() };
}

function core(projectName = "Roadmap", tasks: Task[] = []): Core {
	const projectRoot = mkdtempSync(join(tmpdir(), "workspace-controller-project-"));
	const agenticWorkspaceDir = join(projectRoot, ".agentic-workspace");
	mkdirSync(agenticWorkspaceDir, { recursive: true });
	writeFileSync(join(agenticWorkspaceDir, "agents.json"), JSON.stringify(projectConfiguration()));
	return {
		loadTasks: async () => tasks,
		loadTaskSnapshot: async () => corpusSnapshot(tasks),
		filesystem: {
			projectRoot,
			agenticWorkspaceDir,
			loadTask: async (id: string) => task(id),
			loadConfig: async () => ({ projectName }),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
}

/** Same fake with a real project root, so the marker directory has somewhere to live. */
function coreWithRoot(rootDir: string, projectName = "Roadmap", tasks: Task[] = []): Core {
	const agenticWorkspaceDir = join(rootDir, ".agentic-workspace");
	mkdirSync(agenticWorkspaceDir, { recursive: true });
	writeFileSync(join(agenticWorkspaceDir, "agents.json"), JSON.stringify(projectConfiguration()));
	return {
		loadTasks: async () => tasks,
		loadTaskSnapshot: async () => corpusSnapshot(tasks),
		filesystem: {
			rootDir,
			projectRoot: rootDir,
			agenticWorkspaceDir,
			loadTask: async (id: string) => task(id),
			loadConfig: async () => ({ projectName }),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
}

function state(overrides: Partial<SharedWorkspaceState> = {}): SharedWorkspaceState {
	return {
		filters: createWorkspaceFilters(),
		detailsVisible: true,
		...overrides,
	};
}

function createRuntime(recorder: MountRecorder) {
	return {
		async createHost(): Promise<OpenTuiHost> {
			return {
				renderer: new EventEmitter(),
				root: {},
				async destroy(): Promise<void> {},
			} as unknown as OpenTuiHost;
		},
		mountWorkspace: (
			_renderer: OpenTuiHost["renderer"],
			_root: OpenTuiHost["root"],
			options: OpenTuiWorkspaceOptions,
		) => recorder.mount(options),
		mountBoard: (_renderer: OpenTuiHost["renderer"], _root: OpenTuiHost["root"], props: OpenTuiBoardProps) =>
			recorder.mountBoard(props),
		// No live agent by default: the poller never probes and never forks tmux in unit tests.
		createActivityProbe: () => ({ probe: async () => new Map<string, ActivityProbeEvidence>() }),
	};
}

function fakeAttachment(record: AgentSession) {
	const exec = {
		run: async () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 0 }),
	};
	const server = {
		newSession: async () => ({}),
		panes: async () => [],
		cmd: async () => [],
	} satisfies TmuxServer;
	const runtimeBootstrap: NonNullable<SharedAgentAttachment["bootstrap"]> = "claude";
	return {
		record,
		server,
		exec,
		paneId: `%${record.id}`,
		bootstrap: runtimeBootstrap,
	} satisfies SharedAgentAttachment;
}

/** Hands out confirmation mounts whose Y/N result the test settles by hand. */
function confirmQueue(): {
	mount: (options?: { title: string; message: string }) => OpenTuiConfirmMount;
	pending: Array<{ title?: string; message?: string; settle: (value: boolean) => void }>;
} {
	const pending: Array<{
		result: Promise<boolean>;
		settle: (value: boolean) => void;
		title?: string;
		message?: string;
	}> = [];
	return {
		mount(options?: { title: string; message: string }): OpenTuiConfirmMount {
			let settleValue: (value: boolean) => void = () => undefined;
			const result = new Promise<boolean>((resolve) => {
				settleValue = resolve;
			});
			const entry = { ...options, result, dispose: (): void => settleValue(false), settle: settleValue };
			pending.push(entry);
			return entry;
		},
		pending,
	};
}

/** Core stub exposing the task reads and mutations the workspace task actions exercise. */
function actionCore(
	tasks: Task[],
	handlers: {
		editTask?: (id: string, input: { status: string }) => void;
		deleteTask?: (id: string, options: { includeCrossBranch: false }) => void | Promise<void>;
	} = {},
): Core {
	const projectRoot = mkdtempSync(join(tmpdir(), "workspace-controller-actions-"));
	const agenticWorkspaceDir = join(projectRoot, ".agentic-workspace");
	mkdirSync(agenticWorkspaceDir, { recursive: true });
	writeFileSync(
		join(agenticWorkspaceDir, "agents.json"),
		JSON.stringify({ ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() }),
	);
	return {
		getTask: async (id: string) => tasks.find((task) => task.id === id),
		loadTasks: async () => tasks,
		loadTaskSnapshot: async () => corpusSnapshot(tasks),
		editTask: async (id: string, input: { status: string }) => {
			handlers.editTask?.(id, input);
			return tasks.find((task) => task.id === id);
		},
		deleteTask: async (id: string, options: { includeCrossBranch: false }) => {
			await handlers.deleteTask?.(id, options);
			return { success: true, cleanedTaskIds: [] };
		},
		filesystem: {
			projectRoot,
			agenticWorkspaceDir,
			loadTask: async (id: string) => task(id),
			loadConfig: async () => ({
				projectName: "Roadmap",
				statuses: ["To Do", "In Progress", "Done"],
			}),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
}

type NativeAgentCounters = { live: number; prepare: number; activate: number; finish: number };

/** A probe whose evidence a test controls, recording every batch of targets it is asked to probe. */
function controlledProbe(): {
	probe: ActivityProbe;
	calls: ActivityProbeTarget[][];
	setEvidence(evidence: Map<string, ActivityProbeEvidence>): void;
} {
	const calls: ActivityProbeTarget[][] = [];
	let evidence = new Map<string, ActivityProbeEvidence>();
	return {
		probe: {
			async probe(targets) {
				calls.push([...targets]);
				return new Map(evidence);
			},
		},
		calls,
		setEvidence: (next) => {
			evidence = next;
		},
	};
}

function nativeAgentService(
	tasks: Task[],
	record: AgentSession,
	counters: NativeAgentCounters,
	initiallyActive = true,
): WorkspaceStateService {
	let activeSessionId = initiallyActive ? record.id : undefined;
	return {
		listTasks: async () => tasks,
		listSessions: async () => ({ taskId: record.taskId, activeSessionId, sessions: [record] }),
		listAllSessions: async () =>
			new Map([[record.taskId, { taskId: record.taskId, activeSessionId, sessions: [record] }]]),
		liveSession: async () => {
			counters.live += 1;
			return undefined;
		},
		prepareSession: async () => {
			counters.prepare += 1;
			activeSessionId = record.id;
			record.status = "running";
			return fakeAttachment(record);
		},
		activateSession: async () => {
			counters.activate += 1;
			record.status = "running";
			activeSessionId = record.id;
		},
		finishSession: async () => {
			counters.finish += 1;
			record.status = "failed";
			activeSessionId = undefined;
		},
		stopSession: async (_taskId: string, _id: string) => {
			record.status = "stopped";
			activeSessionId = undefined;
		},
		parkSession: async () => {
			record.status = "parked";
			activeSessionId = undefined;
		},
	} as unknown as WorkspaceStateService;
}

function agentHostStub() {
	return {
		start: async () => {},
		stop: async () => {},
		resize: async () => {},
		sendBytes: () => {},
		inputTransport: () => ({ transport: "pipe-pane-socket" as const, detail: "test" }),
		inputStats: () => undefined,
		flushInput: async () => {},
	};
}

/** A pending `agent-session start` request owned by `ownerPid`, as the workspace would read it. */
function pendingRecord(taskId: string, id: string, ownerPid: number): AgentSession {
	return {
		...session(taskId),
		id,
		status: "starting",
		nativeWorkspace: true,
		ownerPid,
	};
}

type AdoptionCounters = {
	prepares: string[];
	activated: string[];
	finished: string[];
	preparedModes?: string[];
	applicationResumes?: string[];
	applicationStarts?: number;
};

/** Workspace state whose per-task sessions come from `sessionsByTask`, recording each prepared launch. */
function adoptionWorkspaceState(
	tasks: Task[],
	sessionsByTask: (taskId: string) => TaskSessions,
	counters: AdoptionCounters,
): WorkspaceStateService {
	const activeSessionIds = new Map<string, string | undefined>();
	const freshSessions = new Map<string, AgentSession[]>();
	const freshByMode = new Map<string, Map<string, AgentSession[]>>();
	let freshSequence = 0;
	const histories = (taskId: string): TaskSessions => {
		const history = sessionsByTask(taskId);
		return {
			...history,
			sessions: [...history.sessions, ...(freshSessions.get(taskId) ?? [])],
			activeSessionId:
				activeSessionIds.get(`${taskId}\u0000${getDefaultModeCatalog().defaultModeId}`) ?? history.activeSessionId,
		};
	};
	const activeModeSessionId = (taskId: string, modeId: string, fallback?: string) =>
		activeSessionIds.get(`${taskId}\u0000${modeId}`) ?? fallback;
	const service = {
		listTasks: async () => tasks,
		listSessions: async (taskId: string) => histories(taskId),
		listAllSessions: async () => new Map(tasks.map((task) => [task.id, histories(task.id)] as const)),
		listModeSessions: async (taskId: string, modeId: string) => {
			const history = sessionsByTask(taskId);
			const stored = history.modes?.[modeId];
			const fresh = freshByMode.get(taskId)?.get(modeId) ?? [];
			return {
				...stored,
				sessions: [
					...(stored?.sessions ?? (modeId === getDefaultModeCatalog().defaultModeId ? history.sessions : [])),
					...fresh,
				],
				activeSessionId: activeModeSessionId(
					taskId,
					modeId,
					stored?.activeSessionId ??
						(modeId === getDefaultModeCatalog().defaultModeId ? history.activeSessionId : undefined),
				),
			};
		},
		liveSession: async (taskId: string, id: string) => {
			const record = histories(taskId).sessions.find((candidate) => candidate.id === id);
			return record?.status === "running" ? fakeAttachment(record) : undefined;
		},
		prepareSession: async (taskId: string, id?: string, modeId?: string) => {
			const history = sessionsByTask(taskId);
			const sessionId = id ?? `fresh-${taskId}-${++freshSequence}`;
			counters.prepares.push(sessionId ?? "");
			counters.preparedModes?.push(modeId ?? "");
			const record =
				history.sessions.find((candidate) => candidate.id === sessionId) ??
				(id === undefined ? { ...session(taskId), id: sessionId, status: "starting" as const } : undefined);
			if (!record) throw new Error(`Missing test session ${sessionId}`);
			record.status = "running";
			if (id === undefined) {
				freshSessions.set(taskId, [...(freshSessions.get(taskId) ?? []), record]);
				const modes = freshByMode.get(taskId) ?? new Map<string, AgentSession[]>();
				const mode = modeId ?? getDefaultModeCatalog().defaultModeId;
				modes.set(mode, [...(modes.get(mode) ?? []), record]);
				freshByMode.set(taskId, modes);
				activeSessionIds.set(`${taskId}\u0000${mode}`, record.id);
			}
			// The service contract reserves the session and publishes its active pointer before
			// returning, so a concurrent workspace refresh can observe/adopt the handoff.
			activeSessionIds.set(`${taskId}\u0000${modeId ?? getDefaultModeCatalog().defaultModeId}`, record.id);
			return fakeAttachment(record);
		},
		adoptPendingSession: async (taskId: string, id: string) => {
			const history = sessionsByTask(taskId);
			const record = history.sessions.find((candidate) => candidate.id === id);
			if (!record) throw new Error(`Missing test session ${id}`);
			counters.prepares.push(id);
			const modeId =
				Object.entries(history.modes ?? {}).find(([, mode]) =>
					mode.sessions.some((candidate) => candidate.id === id),
				)?.[0] ?? getDefaultModeCatalog().defaultModeId;
			counters.preparedModes?.push(modeId);
			record.status = "running";
			return { ...fakeAttachment(record), modeId };
		},
		activateSession: async (_taskId: string, id: string) => {
			counters.activated.push(id);
			for (const task of tasks) {
				const record = histories(task.id).sessions.find((candidate) => candidate.id === id);
				if (record) record.status = "running";
			}
		},
		finishSession: async (taskId: string, id: string) => {
			counters.finished.push(`${taskId}:${id}`);
		},
		stopSession: async (_taskId: string, _id: string) => {},
		parkSession: async () => {},
		sessionApplication: undefined as unknown as WorkspaceStateService["sessionApplication"],
	};
	service.sessionApplication = {
		newSession: async (taskId: string, modeId: string) => {
			counters.applicationStarts = (counters.applicationStarts ?? 0) + 1;
			const record = { ...session(taskId), id: `fresh-${taskId}-${++freshSequence}`, status: "running" as const };
			freshSessions.set(taskId, [...(freshSessions.get(taskId) ?? []), record]);
			const modes = freshByMode.get(taskId) ?? new Map<string, AgentSession[]>();
			modes.set(modeId, [...(modes.get(modeId) ?? []), record]);
			freshByMode.set(taskId, modes);
			activeSessionIds.set(`${taskId}\u0000${modeId}`, record.id);
			return record;
		},
		resumeSession: async (taskId: string, id: string) => {
			counters.applicationResumes?.push(id);
			const modeId =
				[...(freshByMode.get(taskId) ?? new Map())].find(([, records]) =>
					records.some((candidate: AgentSession) => candidate.id === id),
				)?.[0] ??
				Object.entries(sessionsByTask(taskId).modes ?? {}).find(([, mode]) =>
					mode.sessions.some((candidate) => candidate.id === id),
				)?.[0] ??
				getDefaultModeCatalog().defaultModeId;
			const attachment = await service.prepareSession(taskId, id, modeId);
			return histories(taskId).sessions.find((candidate) => candidate.id === id) ?? attachment.record;
		},
	} as unknown as WorkspaceStateService["sessionApplication"];
	return service as unknown as WorkspaceStateService;
}

async function persistedPendingHostProject(root: string, title: string, modeIds: string[]) {
	const originalConfigHome = process.env.XDG_CONFIG_HOME;
	process.env.XDG_CONFIG_HOME = join(root, "config");
	const restoreConfigHome = () => {
		if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = originalConfigHome;
	};
	try {
		const core = new Core(root);
		await initializeTestProject(core, title);
		const { task: savedTask, filePath } = await core.createTaskFromInput({ title, status: "To Do" });
		if (!filePath) throw new Error("Expected the test task to have a persisted path.");
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "test",
			presets: { test: { command: "agent {prompt}", env: {}, prepare: "", bootstrap: "pi" } },
			modes: getDefaultModeCatalog(),
		});
		const sessions = new AgentSessionService(core);
		const state = new WorkspaceStateService(core, { sessions });
		const records = await Promise.all(
			modeIds.map((modeId) =>
				sessions.registerPendingSession(
					savedTask.id,
					{ modeId },
					{
						v: 2,
						paneId: "%workspace-test",
						rootDir: root,
					},
				),
			),
		);
		if (records.some((record) => !existsSync(join(workspaceRequestDir(root), `${record.id}.json`))))
			throw new Error("The real session service did not publish every pending request marker.");
		if (
			await Promise.all(
				records.map(async (record, index) => {
					const history = await state.listModeSessions(savedTask.id, modeIds[index] ?? "");
					return !history.sessions.some((candidate) => candidate.id === record.id && candidate.nativeWorkspace);
				}),
			).then((missing) => missing.some(Boolean))
		)
			throw new Error("The real session service did not persist every native pending record.");
		sessions.adoptPendingSession = async (taskId, sessionId) => {
			const index = records.findIndex((candidate) => candidate.id === sessionId);
			const modeId = modeIds[index];
			if (!modeId) throw new Error(`Missing mode for test session ${sessionId}`);
			const record = (await state.listModeSessions(taskId, modeId)).sessions.find(
				(candidate) => candidate.id === sessionId,
			);
			if (!record) throw new Error(`Missing test session ${sessionId}`);
			return { ...fakeAttachment(record), modeId };
		};
		return { core, task: savedTask, taskPath: dirname(filePath), sessions, state, records, restoreConfigHome };
	} catch (error) {
		restoreConfigHome();
		throw error;
	}
}

/** A runtime with a sized renderer and inert agent host, so adoption launches without tmux. */
function adoptionRuntime(recorder: MountRecorder) {
	return {
		...createRuntime(recorder),
		async createHost(): Promise<OpenTuiHost> {
			return {
				renderer: Object.assign(new EventEmitter(), { width: 120, height: 40 }),
				root: {},
				async destroy(): Promise<void> {},
			} as unknown as OpenTuiHost;
		},
		createAgentHost: (() => agentHostStub()) as unknown as TestAgentHostFactory,
		createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
	};
}

/** Launch one workspace-owned native agent whose activity is driven by `probe`. */
async function launchNativeAgent(
	probe: ActivityProbe,
	counters: NativeAgentCounters,
	intervalMs = 5,
	host: AgentHost = agentHostStub(),
) {
	const tasks = [task("TASK-1")];
	const fixtureDir = mkdtempSync(join(tmpdir(), "controller-native-agent-"));
	const bootstrapPath = join(fixtureDir, "bootstrap.md");
	writeFileSync(bootstrapPath, "Test agent bootstrap.\n");
	const record: AgentSession = {
		...session("TASK-1"),
		id: "exact-native",
		status: "starting",
	};
	const recorder = new MountRecorder();
	const prepareResults: unknown[] = [];
	const alerts: string[] = [];
	const controllerErrors: string[] = [];
	const workspaceState = nativeAgentService(tasks, record, counters, false);
	const originalPrepareSession = workspaceState.prepareSession;
	workspaceState.prepareSession = async (...args: Parameters<WorkspaceStateService["prepareSession"]>) => {
		try {
			const result = await originalPrepareSession(...args);
			prepareResults.push({
				record: result.record,
				paneId: result.paneId,
				bootstrap: result.bootstrap,
			});
			return result;
		} catch (error) {
			prepareResults.push({ error: error instanceof Error ? error.message : String(error) });
			throw error;
		}
	};
	const controller = createController(core(), {
		viewStateStore: new MemoryViewStateStore(state()),
		workspaceState,
		activityPollIntervalMs: intervalMs,
		runtime: {
			...createRuntime(recorder),
			createHost: async () =>
				({
					renderer: Object.assign(new EventEmitter(), { width: 120, height: 40 }),
					root: {},
					async destroy() {},
				}) as unknown as OpenTuiHost,
			createActivityProbe: () => probe,
			createAgentHost: (() => host) as unknown as TestAgentHostFactory,
			createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
		},
	});
	const running = controller.run();
	running.catch((error) =>
		controllerErrors.push(error instanceof Error ? (error.stack ?? error.message) : String(error)),
	);
	const mounted = await recorder.next(0);
	const entry = mounted.tasks[0];
	if (!entry) throw new Error("Expected task entry.");
	mounted.onAgentStart?.(entry, 80, 24);
	await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
	return {
		recorder,
		controller,
		running,
		record,
		entries: mounted,
		prepareResults,
		alerts,
		controllerErrors,
		bootstrapPath,
		fixtureDir,
	};
}

/** Yield to the macrotask queue `count` times, so a ready timer would have fired. */
async function drainTurns(count: number): Promise<void> {
	for (let index = 0; index < count; index += 1) await new Promise<void>((resolve) => setImmediate(resolve));
}

/** Delegates to the shared 15s sleep-based wait; the old 5s `setImmediate` spin starved under load. */
async function waitUntil(predicate: () => boolean): Promise<void> {
	await waitForCondition(predicate, "controller refresh");
}

describe("OpenTuiWorkspaceController", () => {
	it("does not indicate unconfirmed or failed sessions without live activity", () => {
		const starting = { ...session("TASK-1"), status: "starting" } satisfies AgentSession;
		const failed = { ...session("TASK-1"), status: "failed" } satisfies AgentSession;
		const parked = { ...session("TASK-1"), status: "parked" } satisfies AgentSession;

		expect(starting.status).toBe("starting");
		expect(modeSessionIndication(starting)).toBeUndefined();
		expect(modeSessionIndication(failed)).toBeUndefined();
		expect(modeSessionIndication(starting, "running")).toBe("working");
		expect(modeSessionIndication(parked)).toBeUndefined();
		expect(modeSessionIndication(parked, "idle")).toBe("parked");
		expect(modeSessionIndication(parked, "waiting")).toBe("waiting");
		expect(modeSessionIndication(parked, "error")).toBe("error");
		expect(modeSessionIndication({ ...parked, status: "stopped" }, "idle")).toBe("ended");
	});

	it("names the selected mode when its preview has no session", async () => {
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		const mount = mountOpenTuiWorkspace(setup.renderer, setup.renderer.root as unknown as BoxRenderable, {
			tasks: [{ id: "TASK-1", title: "No session task", status: "Todo" }],
			selectedModeId: "build",
			selectedTaskIndex: 0,
			modeProjectionByTask: () => ({ modeLabel: "BUILD", approved: false }),
		});
		try {
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("No session in BUILD");
		} finally {
			mount.dispose();
			setup.renderer.destroy();
		}
	});

	it("loads persisted filters and selection without selecting global active history", async () => {
		const tasks = [
			task("TASK-1"),
			task("TASK-2", {
				status: "In Progress",
				type: "feature",
				project: "CLI",
				priority: "high",
				labels: ["ui"],
				milestone: "Sprint 1",
			}),
		];
		const filters = {
			search: "",
			status: ["In Progress"],
			taskTypes: ["feature"],
			projects: ["CLI"],
			priority: "high",
			labels: ["ui"],
			milestone: "Sprint 1",
		};
		const store = new MemoryViewStateStore(state({ filters, selectedTaskId: "TASK-2", detailsVisible: false }));
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (taskId) => taskSessions(taskId)),
			runtime: createRuntime(recorder),
		});

		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			// The preview shows the selected mode's session regardless of lifecycle status, so a
			// shared running session is previewed read-only without becoming the global active history.
			expect(mounted).toMatchObject({
				projectName: "Roadmap",
				detailsVisible: false,
				selectedTaskIndex: 0,
				activeAgentSession: { id: "session-TASK-2", taskId: "TASK-2", status: "running" },
			});
			// Previewing never attaches, resumes, or writes status on selection.
			expect(mounted.liveAgent).toBeUndefined();
			expect(mounted.tasks.map((entry) => entry.id)).toEqual(["TASK-2"]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("indicates only selected-mode active sessions with activity evidence (or stopped history)", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3"), task("TASK-4"), task("TASK-5")];
		const sessions = new Map<string, TaskSessions>([
			[
				"TASK-1",
				{
					taskId: "TASK-1",
					activeSessionId: "stopped",
					sessions: [
						{ ...session("TASK-1"), id: "stopped", status: "stopped" },
						{ ...session("TASK-1"), id: "historical-running", status: "running" },
					],
				},
			],
			[
				"TASK-2",
				{
					taskId: "TASK-2",
					activeSessionId: "external-running",
					sessions: [
						{
							...session("TASK-2"),
							id: "external-running",
							nativeWorkspace: false,
							ownerPid: 42,
						},
					],
				},
			],
			[
				"TASK-3",
				{
					taskId: "TASK-3",
					activeSessionId: "handoff-starting",
					sessions: [
						{
							...session("TASK-3"),
							id: "handoff-starting",
							status: "starting",
							nativeWorkspace: true,
						},
					],
				},
			],
			[
				"TASK-4",
				{
					taskId: "TASK-4",
					activeSessionId: "will-fail",
					sessions: [{ ...session("TASK-4"), id: "will-fail" }],
				},
			],
			[
				"TASK-5",
				{
					taskId: "TASK-5",
					activeSessionId: "failed",
					sessions: [
						{ ...session("TASK-5"), id: "failed", status: "failed", error: "launch failed" },
						{ ...session("TASK-5"), id: "historical-running", status: "running" },
					],
				},
			],
		]);
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: workspaceState(tasks, async (taskId) => sessions.get(taskId) ?? taskSessions(taskId, false)),
			runtime: createRuntime(recorder),
		});

		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			// No event evidence means no fabricated blue baseline, regardless of durable starting/running/failed status.
			expect([...(mounted.indicationByTask?.keys() ?? [])].sort()).toEqual(["TASK-1"]);
			expect(mounted.indicationByTask?.get("TASK-1")).toBe("ended");
			expect(mounted.sessionTaskIds).toEqual(["TASK-1"]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("persists selection and details, then preserves visible selection after a failed refresh", async () => {
		const tasks = [task("TASK-1"), task("TASK-2")];
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		let selectedSessionReads = 0;
		let failNextSelectedSessionRead = false;
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (taskId) => {
				if (taskId === "TASK-2" && failNextSelectedSessionRead) {
					failNextSelectedSessionRead = false;
					selectedSessionReads += 1;
					throw new Error("transient session read failure");
				}
				return taskSessions(taskId);
			}),
			runtime: createRuntime(recorder),
		});

		const running = controller.run();
		try {
			const initial = await recorder.next(0);
			const secondTask = initial.tasks[1];
			if (!secondTask) throw new Error("Expected second task.");
			failNextSelectedSessionRead = true;
			initial.onTaskSelect?.(secondTask);
			await waitUntil(() => selectedSessionReads === 1);
			expect(store.current.selectedTaskId).toBe("TASK-2");

			await controller.refresh();
			const recovered = await recorder.next(1);
			expect(recovered.selectedTaskIndex).toBe(1);
			// The preview shows the selected mode's session regardless of lifecycle status,
			// read-only: no attach, resume, or status write on selection.
			expect(recovered.activeAgentSession?.id).toBe("session-TASK-2");
			expect(recovered.liveAgent).toBeUndefined();
			recovered.onToggleTaskPane?.(false);
			recovered.onToggleDetails?.(false);
			await waitUntil(() => recorder.options.some((options) => options.detailsVisible === false));
			const afterToggle = recorder.options.find((options) => options.detailsVisible === false);
			expect(store.current.detailsVisible).toBeFalse();
			expect(afterToggle?.detailsVisible).toBeFalse();
			expect(afterToggle?.taskPaneVisible).toBeFalse();
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("starts on the native board and retains an unfinished move across refresh and task handoff", async () => {
		const tasks = [task("TASK-1"), task("TASK-2")];
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		const controller = createController(core("Roadmap", tasks), {
			initialView: "board",
			boardMilestoneMode: true,
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (taskId) => taskSessions(taskId)),
			runtime: createRuntime(recorder),
		});

		const running = controller.run();
		try {
			await waitUntil(() => recorder.boardOptions.length === 1);
			const board = recorder.boardOptions[0];
			if (!board) throw new Error("Expected board mount.");
			expect(recorder.options).toEqual([]);
			expect(board.milestoneMode).toBe(true);
			expect(board.board.selectedTask?.id).toBe("TASK-1");
			expect(board.board.beginMove()).toBe("entered");
			const move = board.board.move;
			await controller.refresh();
			expect(recorder.boardOptions.at(-1)?.board.move).toEqual(move);
			board.board.cancelMove();
			const secondTask = tasks[1];
			if (!secondTask) throw new Error("Expected second task.");
			board.onWorkspaceHandoff?.(secondTask);
			const workspace = await recorder.next(0);
			expect(workspace.selectedTaskIndex).toBe(1);
			workspace.onBoardRequest?.();
			await waitUntil(() => recorder.boardOptions.at(-1)?.board.selectedTask?.id === "TASK-2");
			expect(recorder.boardOptions.at(-1)?.board.selectedTask?.id).toBe("TASK-2");
		} finally {
			controller.destroy();
			await running;
		}
	});
	it("opens the board on the newest task when no selection is persisted", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3")];
		const store = new MemoryViewStateStore(state());
		const recorder = new MountRecorder();
		const controller = createController(core("Roadmap", tasks), {
			initialView: "board",
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (taskId) => taskSessions(taskId)),
			runtime: createRuntime(recorder),
		});

		const running = controller.run();
		try {
			await waitUntil(() => recorder.boardOptions.length === 1);
			// Lanes render newest-first, so the opening selection must be the row the cursor shows first.
			expect(recorder.boardOptions[0]?.board.selectedTask?.id).toBe("TASK-3");
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("retains fullscreen across a refresh", async () => {
		const tasks = [task("TASK-1"), task("TASK-2", { status: "Done" })];
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (id) => taskSessions(id, false)),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			mounted.onFullscreenChange?.(true);
			await controller.refresh();
			expect(recorder.options.at(-1)).toMatchObject({ fullscreen: true });
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("serializes rapid selection persistence without remounting an older selection", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3")];
		const store = new DeferredFirstUpdateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (id) => taskSessions(id, false)),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const second = mounted.tasks[1];
			const third = mounted.tasks[2];
			if (!second || !third) throw new Error("Expected three task entries.");
			mounted.onTaskSelect?.(second);
			mounted.onTaskSelect?.(third);
			await waitUntil(() => store.firstUpdateStarted);
			store.releaseFirstUpdate();
			await waitUntil(() => store.current.selectedTaskId === "TASK-3");
			expect(store.current.selectedTaskId).toBe("TASK-3");
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("coalesces rapid task selections and settles on the latest task", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3"), task("TASK-4")];
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		const heldRefresh = deferred();
		let listCalls = 0;
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: gatedWorkspaceState(tasks, async () => {
				listCalls += 1;
				if (listCalls === 2) await heldRefresh.promise;
			}),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const second = mounted.tasks[1];
			const third = mounted.tasks[2];
			const fourth = mounted.tasks[3];
			if (!second || !third || !fourth) throw new Error("Expected four task entries.");
			mounted.onTaskSelect?.(second);
			await waitUntil(() => listCalls === 2);
			mounted.onTaskSelect?.(third);
			mounted.onTaskSelect?.(fourth);
			heldRefresh.resolve();
			await waitUntil(() => recorder.options.at(-1)?.selectedTaskIndex === 3);
			// The surface settles on the newest selection, not on a replayed older snapshot...
			expect(recorder.options.at(-1)?.selectedTaskIndex).toBe(3);
			expect(store.current.selectedTaskId).toBe("TASK-4");
			// ...and three rapid selections do not produce a remount per keystroke.
			expect(recorder.options.length).toBeLessThanOrEqual(3);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("retains the workspace task viewport across selection remounts", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3"), task("TASK-4")];
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (taskId) => taskSessions(taskId, false)),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			expect(mounted.firstVisibleTaskIndex).toBe(0);
			mounted.onTaskScrollChange?.(4);
			const third = mounted.tasks[2];
			if (!third) throw new Error("Expected three task entries.");
			mounted.onTaskSelect?.(third);
			await waitUntil(() => recorder.options.at(-1)?.selectedTaskIndex === 2);
			// The remount keeps the scrolled window the workspace reported instead of re-pinning the selection.
			expect(recorder.options.at(-1)?.firstVisibleTaskIndex).toBe(4);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("resolves an explicit refresh only after a cycle that observed the newest view state", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3")];
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		const heldRefresh = deferred();
		let listCalls = 0;
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: gatedWorkspaceState(tasks, async () => {
				listCalls += 1;
				if (listCalls === 2) await heldRefresh.promise;
			}),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			const pending = controller.refresh();
			await waitUntil(() => listCalls === 2);
			await store.update((current) => ({ ...current, selectedTaskId: "TASK-3" }));
			heldRefresh.resolve();
			await pending;
			expect(recorder.options.at(-1)?.selectedTaskIndex).toBe(2);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("refreshes when an external task or config change is observed", async () => {
		const tasks = [task("TASK-1")];
		const store = new MemoryViewStateStore(state());
		const recorder = new MountRecorder();
		let taskCallbacks: { onTaskChanged?: (task: Task) => void | Promise<void> } | undefined;
		let configChanged: (() => void | Promise<void>) | undefined;
		let taskStops = 0;
		let configStops = 0;
		const watchableCore = {
			...core(),
			filesystem: {
				...core().filesystem,
				tasksDir: "/tmp/agentic-workspace-tasks",
				configFilePath: "/tmp/agentic-workspace-config.yml",
				loadConfig: async () => ({ projectName: "Roadmap" }),
				listMilestones: async () => [],
				listArchivedMilestones: async () => [],
			},
		} as unknown as Core;
		const controller = createController(watchableCore, {
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async () => ({ taskId: "TASK-1", sessions: [] })),
			runtime: {
				...createRuntime(recorder),
				watchTasks: ((_core: Core, callbacks: typeof taskCallbacks) => {
					taskCallbacks = callbacks;
					return { stop: () => (taskStops += 1) };
				}) as unknown as typeof import("../utils/task-watcher.ts").watchTasks,
				watchConfig: ((_core: Core, callbacks: { onConfigChanged?: typeof configChanged }) => {
					configChanged = callbacks.onConfigChanged;
					return { stop: () => (configStops += 1) };
				}) as unknown as typeof import("../utils/config-watcher.ts").watchConfig,
			},
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			const before = recorder.options.length;
			await taskCallbacks?.onTaskChanged?.(tasks[0] as Task);
			await configChanged?.();
			await waitUntil(() => recorder.options.length > before);
			expect(recorder.options.length).toBeGreaterThan(before);
		} finally {
			controller.destroy();
			await running;
		}
		expect(taskStops).toBe(1);
		expect(configStops).toBe(1);
	});

	it("external final removal detaches every retained host without stopping", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-retained-hosts-"));
		const fixture = await persistedPendingHostProject(root, "Retained host removal", ["plan", "build"]);
		const recorder = new MountRecorder();
		let removed: ((taskId: string) => void | Promise<void>) | undefined;
		let created = 0;
		const stops = new Map<string, number>();
		const controller = createController(fixture.core, {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: fixture.task.id })),
			workspaceState: fixture.state,
			runtime: {
				...adoptionRuntime(recorder),
				watchTasks: ((_core: Core, callbacks: { onTaskRemoved?: (taskId: string) => void | Promise<void> }) => {
					removed = callbacks.onTaskRemoved;
					return { stop() {} };
				}) as unknown as typeof import("../utils/task-watcher.ts").watchTasks,
				createExistingAgentHost: (() => {
					const id = fixture.records[created++]?.id;
					return {
						...agentHostStub(),
						detach: async () => "retained" as const,
						stop: async () => {
							if (!id) throw new Error("Missing retained test host.");
							const count = (stops.get(id) ?? 0) + 1;
							stops.set(id, count);
							if (id === "retry-stop" && count === 1) throw new Error("stop failed once");
						},
					};
				}) as unknown as typeof createExistingAgentHost,
			},
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await waitUntil(() => created === 2);
			rmSync(fixture.taskPath, { recursive: true, force: true });
			expect(await fixture.state.listTasks()).toHaveLength(0);
			await expect(removed?.(fixture.task.id)).resolves.toBeUndefined();
			await waitUntil(() => recorder.options.at(-1)?.tasks.length === 0);
			expect(stops).toEqual(new Map());
		} finally {
			controller.destroy();
			await running;
			fixture.restoreConfigHome();
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("repeated external task removal is safe and never stops retained hosts", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-retained-hosts-repeat-"));
		const fixture = await persistedPendingHostProject(root, "Repeated retained host removal", ["plan", "build"]);
		const recorder = new MountRecorder();
		let removed: ((taskId: string) => void | Promise<void>) | undefined;
		let created = 0;
		const stops = new Map<string, number>();
		const controller = createController(fixture.core, {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: fixture.task.id })),
			workspaceState: fixture.state,
			runtime: {
				...adoptionRuntime(recorder),
				watchTasks: ((_core: Core, callbacks: { onTaskRemoved?: (taskId: string) => void | Promise<void> }) => {
					removed = callbacks.onTaskRemoved;
					return { stop() {} };
				}) as unknown as typeof import("../utils/task-watcher.ts").watchTasks,
				createExistingAgentHost: (() => {
					const id = fixture.records[created++]?.id;
					return {
						...agentHostStub(),
						detach: async () => "retained" as const,
						stop: async () => {
							if (!id) throw new Error("Missing retained test host.");
							stops.set(id, (stops.get(id) ?? 0) + 1);
							if (id === "still-running") throw new Error("host remains live");
						},
					};
				}) as unknown as typeof createExistingAgentHost,
			},
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await waitUntil(() => created === 2);
			rmSync(fixture.taskPath, { recursive: true, force: true });
			expect(await fixture.state.listTasks()).toHaveLength(0);
			await expect(removed?.(fixture.task.id)).resolves.toBeUndefined();
			await waitUntil(() => recorder.options.at(-1)?.tasks.length === 0);
			expect(stops).toEqual(new Map());
			await expect(removed?.(fixture.task.id)).resolves.toBeUndefined();
			expect(stops).toEqual(new Map());
		} finally {
			controller.destroy();
			await running;
			fixture.restoreConfigHome();
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("does not publish an old delayed attachment after same-ID task replacement", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-replaced-task-adoption-"));
		const fixture = await persistedPendingHostProject(root, "Replaced task adoption", ["plan"]);
		const originalRecord = structuredClone(fixture.records[0]);
		if (!originalRecord) throw new Error("Expected original pending attachment.");
		const store = new SessionStore(root, new BunRunner());
		const recorder = new MountRecorder();
		const hostStarted = deferred();
		const releaseHost = deferred();
		const hostDrained = deferred();
		const earlyDetachStarted = deferred();
		const releaseEarlyDetach = deferred();
		let starts = 0;
		let hostStartReached = false;
		let detaches = 0;
		let stops = 0;
		let transportResource = false;
		let resizeInvocations = 0;
		let releasedResources = 0;
		let removed: ((taskId: string) => void | Promise<void>) | undefined;
		fixture.sessions.adoptPendingSession = async () => ({
			...fakeAttachment(structuredClone(originalRecord)),
			modeId: "plan",
		});
		const controller = createController(fixture.core, {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: fixture.task.id })),
			workspaceState: fixture.state,
			runtime: {
				...adoptionRuntime(recorder),
				watchTasks: ((_core: Core, callbacks: { onTaskRemoved?: (taskId: string) => void | Promise<void> }) => {
					removed = callbacks.onTaskRemoved;
					return { stop() {} };
				}) as unknown as typeof import("../utils/task-watcher.ts").watchTasks,
				createExistingAgentHost: ((options: Parameters<typeof createExistingAgentHost>[0]) => {
					const host = fakeExistingAgentHost(options, {
						...agentHostStub(),
						start: async () => {
							if (options.paneId !== `%${originalRecord.id}`) return;
							starts += 1;
							hostStartReached = true;
							hostStarted.resolve();
							try {
								await releaseHost.promise;
								transportResource = true;
							} finally {
								hostDrained.resolve();
							}
						},
						detach: async () => {
							detaches += 1;
							if (detaches === 1) {
								earlyDetachStarted.resolve();
								await releaseEarlyDetach.promise;
							}
							if (transportResource) releasedResources += 1;
							transportResource = false;
							return "retained" as const;
						},
						stop: async () => {
							stops += 1;
						},
					});
					return new Proxy(host, {
						get(target, property, receiver) {
							if (property === "resize")
								return async (columns: number, rows: number) => {
									resizeInvocations += 1;
									await target.resize(columns, rows);
								};
							return Reflect.get(target, property, receiver);
						},
					});
				}) as unknown as typeof createExistingAgentHost,
			},
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await hostStarted.promise;
			expect(starts).toBe(1);
			await fixture.core.deleteTask(fixture.task.id);
			const removing = removed?.(fixture.task.id);
			await earlyDetachStarted.promise;
			releaseHost.resolve();
			await hostDrained.promise;
			expect(transportResource).toBe(true);
			expect(detaches).toBe(1);
			releaseEarlyDetach.resolve();
			await removing;
			await waitUntil(() => recorder.options.at(-1)?.tasks.length === 0);
			expect(transportResource).toBe(false);
			expect(releasedResources).toBe(1);
			expect((await store.read(fixture.task.id)).sessions).toEqual([]);

			const { filePath: _removedFilePath, ...replacementTask } = fixture.task;
			await fixture.core.createTask({ ...replacementTask, title: "Same-ID replacement" });
			const { taskDir } = await store.paths(fixture.task.id);
			const replacement = {
				...originalRecord,
				id: "replacement-stopped",
				createdAt: "2026-10-12T12:00:00.000Z",
				nativeSessionId: "ses_replacement_native_identity",
				status: "stopped" as const,
				outputPath: join(taskDir, "replacement-stopped.log"),
				bootstrapPath: join(taskDir, "replacement-stopped.md"),
			};
			await store.mutateMode(fixture.task.id, "plan", async (history) => {
				history.sessions.push(replacement);
				history.activeSessionId = replacement.id;
			});
			expect((await store.readMode(fixture.task.id, "plan")).sessions).toEqual([replacement]);
			await controller.refresh();
			expect((await store.readMode(fixture.task.id, "plan")).sessions).toEqual([replacement]);

			await controller.refresh();
			expect((await store.readMode(fixture.task.id, "plan")).sessions).toEqual([replacement]);
			expect(recorder.options.at(-1)?.liveAgent?.host).toBeUndefined();
			expect(detaches).toBe(2);
			expect(resizeInvocations).toBe(0);
			expect(stops).toBe(0);
			expect(originalRecord.id).not.toBe(replacement.id);
			expect((await store.readMode(fixture.task.id, "plan")).sessions[0]?.nativeSessionId).toBe(
				"ses_replacement_native_identity",
			);
		} finally {
			releaseHost.resolve();
			releaseEarlyDetach.resolve();
			try {
				if (hostStartReached) await hostDrained.promise;
				controller.destroy();
				await running;
			} finally {
				fixture.restoreConfigHome();
				rmSync(root, { recursive: true, force: true });
			}
		}
	});

	it("surfaces a failed refresh and still serves navigation requested afterwards", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3")];
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		let listCalls = 0;
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: gatedWorkspaceState(tasks, async () => {
				listCalls += 1;
				if (listCalls === 2) throw new Error("transient task list failure");
			}),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const third = mounted.tasks[2];
			if (!third) throw new Error("Expected a third task entry.");
			await expect(controller.refresh()).rejects.toThrow("transient task list failure");
			mounted.onTaskSelect?.(third);
			await waitUntil(() => recorder.options.at(-1)?.selectedTaskIndex === 2);
			expect(store.current.selectedTaskId).toBe("TASK-3");
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("does not mark a native session stopped when its host stop fails", async () => {
		const tasks = [task("TASK-1")];
		const record = { ...session("TASK-1"), id: "exact-native", status: "starting" as const };
		const recorder = new MountRecorder();
		let activated = 0;
		let finished = 0;
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => ({ taskId: "TASK-1", sessions: [] }),
			listAllSessions: async () => new Map([["TASK-1", { taskId: "TASK-1", sessions: [] }]]),
			liveSession: async () => undefined,
			prepareSession: async () => ({
				...fakeAttachment(record),
			}),
			activateSession: async () => {
				activated += 1;
			},
			finishSession: async () => {
				finished += 1;
			},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createAgentHost: () => ({
					start: async () => {},
					stop: async () => {
						throw new Error("tmux server still running");
					},
					resize: async () => {},
					sendBytes: () => {},
					inputTransport: () => ({ transport: "pipe-pane-socket", detail: "test" }),
					inputStats: () => undefined,
					flushInput: async () => {},
				}),
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => activated === 1);
			await drainTurns(10);
			expect(recorder.options.at(-1)?.indicationByTask?.has("TASK-1")).toBe(false);
		} finally {
			controller.destroy();
			await running;
		}
		expect(finished).toBe(0);
	});

	it("attaches the selected mode's running history session", async () => {
		const tasks = [task("TASK-1")];
		const record = { ...session("TASK-1"), id: "external-running" };
		const recorder = new MountRecorder();
		let activated = 0;
		let finished = 0;
		let stopped = 0;
		let prepared = 0;
		let attached = 0;
		const externalHost = {
			alive: async () => true,
			start: async () => {},
			stop: async () => {
				stopped += 1;
			},
			resize: async () => {},
			sendBytes: () => {},
			inputTransport: () => ({ transport: "send-keys-fork" as const, detail: "external test" }),
			inputStats: () => undefined,
			flushInput: async () => {},
		};
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => ({ taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }),
			listAllSessions: async () =>
				new Map([["TASK-1", { taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }]]),
			liveSession: async () => ({ record, server: {}, paneId: "%42" }),
			prepareSession: async () => {
				prepared += 1;
				throw new Error("External sessions must not be relaunched.");
			},
			activateSession: async () => {
				activated += 1;
			},
			finishSession: async () => {
				finished += 1;
			},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createExistingAgentHost: (() => {
					attached += 1;
					return externalHost;
				}) as unknown as typeof createExistingAgentHost,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await drainTurns(20);
			await waitUntil(() => attached === 1);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.terminal));
			expect(recorder.options.at(-1)?.liveAgent?.terminal).toBeDefined();
			expect(prepared).toBe(0);
			expect(activated).toBe(0);
		} finally {
			controller.destroy();
			await running;
		}
		expect({ prepared, activated, finished, stopped }).toEqual({ prepared: 0, activated: 0, finished: 0, stopped: 1 });
	});

	it("keeps same-task terminals and input selection independent by mode", async () => {
		const tasks = [task("TASK-1")];
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [], preparedModes: [] };
		const recorder = new MountRecorder();
		const writes = new Map<string, string[]>();
		const planActivation = deferred();
		const buildActivation = deferred();
		const activationRequests: string[] = [];
		const service = adoptionWorkspaceState(tasks, (taskId) => ({ taskId, sessions: [] }), counters);
		const activate = service.activateSession.bind(service);
		service.activateSession = async (taskId, id, origin) => {
			activationRequests.push(id);
			await (id === "fresh-TASK-1-1" ? planActivation.promise : buildActivation.promise);
			const originatingAttachment = { ...origin };
			return activate(taskId, id, originatingAttachment);
		};
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: {
				...adoptionRuntime(recorder),
				createAgentHost: ((options: TestAgentHostOptions) => {
					const output = writes.get(options.sessionId) ?? [];
					writes.set(options.sessionId, output);
					return {
						...agentHostStub(),
						sendBytes: (bytes: Uint8Array) => output.push(new TextDecoder().decode(bytes)),
					};
				}) as unknown as TestAgentHostFactory,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected selected task.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => activationRequests.includes("fresh-TASK-1-1"));
			recorder.options.at(-1)?.onCycleMode?.();
			await waitUntil(() => recorder.options.at(-1)?.selectedModeId === "build");
			recorder.options.at(-1)?.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => activationRequests.includes("fresh-TASK-1-2"));
			planActivation.resolve();
			buildActivation.resolve();
			await waitUntil(() => counters.activated.length === 2);
			const planId = "fresh-TASK-1-1";
			const buildId = "fresh-TASK-1-2";
			await waitUntil(() => {
				const agent = recorder.options.at(-1)?.liveAgent;
				return Boolean(agent?.host && recorder.options.at(-1)?.activeAgentSession?.id !== planId);
			});
			expect(counters.preparedModes).toEqual(["plan", "build"]);
			expect(recorder.options.at(-1)?.activeAgentSession?.id).toBe(buildId);
			const buildTerminal = recorder.options.at(-1)?.liveAgent?.terminal;
			recorder.options.at(-1)?.onCycleMode?.();
			await waitUntil(() => recorder.options.at(-1)?.selectedModeId === "plan");
			recorder.options.at(-1)?.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => recorder.options.at(-1)?.agentFocused === true);
			expect(recorder.options.at(-1)?.activeAgentSession?.id).toBe(planId);
			expect(recorder.options.at(-1)?.liveAgent?.terminal).not.toBe(buildTerminal);
			expect(counters.prepares).toHaveLength(2);
			recorder.options.at(-1)?.liveAgent?.host?.sendBytes(new TextEncoder().encode("plan-only"));
			expect(writes.get(planId)).toEqual(["plan-only"]);
			if (buildId) expect(writes.get(buildId)).toEqual([]);
		} finally {
			planActivation.resolve();
			buildActivation.resolve();
			controller.destroy();
			await running;
		}
	});

	it("does not auto-attach shared history without a local mode selection", async () => {
		const tasks = [task("TASK-1"), task("TASK-2")];
		const records = tasks.map((task, index) => ({
			...session(task.id),
			id: `supervised-${index}`,
			nativeWorkspace: true,
			preset: "claude",
			ownerPid: 42,
		}));
		let attached = 0;
		let detached = 0;
		const histories = (taskId: string) => ({
			taskId,
			activeSessionId: records.find((r) => r.taskId === taskId)?.id,
			sessions: records.filter((r) => r.taskId === taskId),
		});
		const service = {
			listTasks: async () => tasks,
			listSessions: async (id: string) => histories(id),
			listAllSessions: async () => new Map(tasks.map((task) => [task.id, histories(task.id)])),
			liveSession: async () => undefined,
			prepareSession: async () => {
				throw new Error("Must not prepare a duplicate agent");
			},
			activateSession: async () => {
				throw new Error("Passive reuse must not touch usage");
			},
			parkSession: async () => {
				throw new Error("Retained work must stay running");
			},
		} as unknown as WorkspaceStateService;
		const probe = controlledProbe();
		probe.setEvidence(
			new Map(
				records.map((record) => [
					record.id,
					{
						pane: "alive" as const,
						hook: { status: "running" as const, ageMs: 0 },
						chrome: undefined,
						captureEmpty: false,
					},
				]),
			),
		);
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			activityPollIntervalMs: 0,
			runtime: {
				...createRuntime(recorder),
				createActivityProbe: () => probe.probe,
				createExistingAgentHost: (options) => {
					expect(options.paneId).toBe("%supervised-0");
					expect(options.exec).toBeDefined();
					attached++;
					return {
						...agentHostStub(),
						alive: async () => true,
						detach: async () => {
							detached++;
							return "retained";
						},
					};
				},
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await drainTurns(20);
			expect(attached).toBe(0);
			expect(recorder.options.at(-1)?.liveAgent).toBeUndefined();
		} finally {
			controller.destroy();
			await running;
		}
		expect(detached).toBe(0);
		expect(records.every((record) => record.status === "running" && record.ownerPid === 42)).toBe(true);
	});

	it("notices an inconclusive probe for the selected running session", async () => {
		const tasks = [task("TASK-1")];
		const record = { ...session("TASK-1"), id: "native-live", nativeWorkspace: true, ownerPid: 9856 };
		let passiveChecks = 0;
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => ({ taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }),
			listAllSessions: async () =>
				new Map([["TASK-1", { taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }]]),
			liveSession: async () => {
				passiveChecks++;
				throw new Error("tmux transport unavailable");
			},
			prepareSession: async () => {
				throw new Error("Passive history inspection must not launch");
			},
			stopSession: async () => {
				throw new Error("View close must not stop shared work");
			},
		} as unknown as WorkspaceStateService;
		const recorder = new MountRecorder();
		const controller = createController(core("Roadmap", tasks), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.notice?.includes("tmux transport unavailable")));
			expect(passiveChecks).toBe(2);
			expect(recorder.options.at(-1)?.liveAgent).toBeUndefined();
		} finally {
			controller.destroy();
			await running;
		}
		expect(record.status).toBe("running");
	});

	it("switches exact retained terminal contents and keeps the current session when another launch fails", async () => {
		const tasks = [task("TASK-1")];
		const records = ["first", "second", "broken"].map((id) => ({
			...session("TASK-1"),
			id,
			nativeSessionId: `native-${id}`,
			status: "stopped" as const,
			outputPath: "/dev/null",
		}));
		let activeSessionId = "first";
		let picker: OpenTuiSessionPickerOptions | undefined;
		const getPicker = (): OpenTuiSessionPickerOptions => {
			if (!picker) throw new Error("Session picker has not opened.");
			return picker;
		};
		const requested: string[] = [];
		const launched: string[] = [];
		const activationOrigins: unknown[] = [];
		const deleted: Array<{ taskId: string; id: string; force: boolean | undefined }> = [];
		const recorder = new MountRecorder();
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => ({ taskId: "TASK-1", activeSessionId, sessions: records }),
			listAllSessions: async () => new Map([["TASK-1", { taskId: "TASK-1", activeSessionId, sessions: records }]]),
			liveSession: async (_taskId: string, id: string) => {
				const record = records.find((candidate) => candidate.id === id);
				return requested.includes(id) && record ? fakeAttachment(record) : undefined;
			},
			deleteSession: async (taskId: string, id: string, options?: { force?: boolean }) => {
				deleted.push({ taskId, id, force: options?.force });
			},
			prepareSession: async (_taskId: string, id: string) => {
				requested.push(id);
				const record = records.find((candidate) => candidate.id === id);
				if (!record) throw new Error("Missing test session");
				return fakeAttachment(record);
			},
			activateSession: async (_taskId: string, id: string, origin: unknown) => {
				activationOrigins.push(origin);
				activeSessionId = id;
				return { activated: true };
			},
			finishSession: async () => {},
			parkSession: async () => {},
			sessionApplication: {
				newSession: async () => {
					throw new Error("Unexpected new session");
				},
				resumeSession: async (taskId: string, id: string) => {
					await service.prepareSession(taskId, id);
					const record = records.find((candidate) => candidate.id === id);
					if (!record) throw new Error("Missing test session");
					return record;
				},
			},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				isAgentAlive: async () => true,
				mountSessionPicker: (_renderer, _root, options) => {
					picker = options;
					return { dispose: options.onClose };
				},
				createExistingAgentHost: (options) => {
					const id = options.paneId.slice(1);
					launched.push(id);
					return {
						...fakeExistingAgentHost(options),
						async start() {
							if (id === "broken") throw new Error("Exact session cannot resume");
							options.onOutput(new TextEncoder().encode(`native-${id}`));
						},
					};
				},
				createWorkspaceAgent: (() => {
					const terminal = {
						contents: "",
						write(bytes: Uint8Array) {
							this.contents += new TextDecoder().decode(bytes);
						},
						destroy() {},
					};
					return terminal;
				}) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const initial = await recorder.next(0);
			const entry = initial.tasks[0];
			if (!entry) throw new Error("Missing test task");
			recorder.options.at(-1)?.onSessionRequest?.(entry);
			await waitUntil(() => Boolean(picker));
			await getPicker().onResume("first");
			getPicker().onClose();
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.terminal));
			const first = recorder.options.at(-1)?.liveAgent;
			expect(first?.terminal).toMatchObject({ contents: expect.stringContaining("native-first") });
			await drainTurns(20);
			picker = undefined;
			recorder.options.at(-1)?.onSessionRequest?.(entry);
			await waitUntil(() => Boolean(picker));
			await getPicker().onDelete("broken");
			expect(deleted).toEqual([{ taskId: "TASK-1", id: "broken", force: true }]);
			await getPicker().onResume("second");
			getPicker().onClose();
			await waitUntil(() => activeSessionId === "second");
			await controller.refresh();
			expect(activeSessionId).toBe("second");
			expect(recorder.options.at(-1)?.liveAgent?.terminal).toMatchObject({
				contents: expect.stringContaining("native-second"),
			});
			picker = undefined;
			recorder.options.at(-1)?.onSessionRequest?.(entry);
			await waitUntil(() => picker?.activeSessionId === "second");
			await expect(getPicker().onResume("broken")).rejects.toThrow("Exact session cannot resume");
			expect(activeSessionId).toBe("second");
			await getPicker().onResume("first");
			getPicker().onClose();
			await controller.refresh();
			expect(recorder.options.at(-1)?.liveAgent).toBe(first);
			expect(activationOrigins.at(-1)).toBe(activationOrigins[0]);
			expect(requested).toEqual(["first", "second", "broken"]);
			expect(launched).toHaveLength(3);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("asks before starting fresh when exact resume is unavailable", async () => {
		const tasks = [task("TASK-1")];
		const original: AgentSession = {
			...session("TASK-1"),
			id: "resume-original",
			status: "failed",
			nativeProvider: "pi",
			nativeSessionId: "ses_original",
		};
		const fresh: AgentSession = { ...session("TASK-1"), id: "fresh-choice", status: "starting" };
		let activeSessionId = original.id;
		let picker: OpenTuiSessionPickerOptions | undefined;
		const getPicker = (): OpenTuiSessionPickerOptions => {
			if (!picker) throw new Error("Session picker has not opened.");
			return picker;
		};
		let freshStarts = 0;
		const application = {
			newSession: async () => {
				freshStarts++;
				activeSessionId = fresh.id;
				return fresh;
			},
			resumeSession: async () => {
				throw new ExactResumeUnavailableError("previous-resume-failed", "pi", "ses_original");
			},
			stopSession: async () => {},
		};
		let confirmationMessage = "";
		const confirms = confirmQueue();
		const history = (): TaskSessions => ({ taskId: "TASK-1", activeSessionId, sessions: [original, fresh] });
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => history(),
			listModeSessions: async () => history(),
			listAllSessions: async () => new Map([["TASK-1", history()]]),
			liveSession: async (_taskId: string, id: string) => (id === fresh.id ? fakeAttachment(fresh) : undefined),
			prepareSession: async () => {
				throw new ExactResumeUnavailableError("previous-resume-failed", "pi", "ses_original");
			},
			sessionApplication: application,
			prepareNewSession: async () => fakeAttachment(fresh),
			activateSession: async (_taskId: string, id: string) => {
				activeSessionId = id;
				if (id === fresh.id) fresh.status = "running";
				return { activated: true };
			},
			stopSession: async () => {},
			finishSession: async () => {},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const recorder = new MountRecorder();
		const controller = createController(core("Roadmap", tasks), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				mountSessionPicker: (_renderer, _root, options) => {
					picker = options;
					return { dispose: options.onClose };
				},
				mountConfirm: (_renderer, _root, options) => {
					confirmationMessage = options.message;
					return confirms.mount({ title: options.title ?? "", message: options.message });
				},
				createExistingAgentHost: (options) =>
					fakeExistingAgentHost(options, {
						start: async () => options.onOutput(new TextEncoder().encode("fresh")),
					} as unknown as AgentHost),
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Missing task entry");
			mounted.onSessionRequest?.(entry);
			await waitUntil(() => Boolean(picker));

			const declined = getPicker().onResume(original.id);
			await waitUntil(() => confirms.pending.length === 1);
			expect(confirms.pending[0]).toMatchObject({
				title: "Exact resume unavailable",
				message: expect.stringContaining("Start a fresh conversation instead?"),
			});
			expect(confirmationMessage).toContain("ses_original");
			confirms.pending[0]?.settle(false);
			await expect(declined).rejects.toMatchObject({ reason: "previous-resume-failed" });
			expect(activeSessionId).toBe(original.id);
			expect(freshStarts).toBe(0);

			const accepted = getPicker().onResume(original.id);
			await waitUntil(() => confirms.pending.length === 2);
			confirms.pending[1]?.settle(true);
			await accepted;
			await waitUntil(() => activeSessionId === fresh.id);
			expect(freshStarts).toBe(1);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("adopts a pending request this workspace owns exactly once across refreshes", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-adopt-request-"));
		const tasks = [task("TASK-1")];
		const pending = pendingRecord("TASK-1", "pending-1", process.pid);
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [] };
		const recorder = new MountRecorder();
		await writeWorkspaceRequest(root, { taskId: "TASK-1", sessionId: pending.id, pid: process.pid });
		const controller = createController(coreWithRoot(root), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: adoptionWorkspaceState(
				tasks,
				(taskId) => ({ taskId, sessions: taskId === "TASK-1" ? [pending] : [] }),
				counters,
			),
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await waitUntil(() => counters.prepares.length === 1);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			await controller.refresh();
			await drainTurns(10);
			expect(counters.prepares).toEqual(["pending-1"]);
			expect(counters.activated).toEqual([]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("does not overwrite a same-mode local start that finishes while adoption host startup is delayed", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-adopt-host-race-"));
		const pending = pendingRecord("TASK-1", "pending-race", process.pid);
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [], preparedModes: [] };
		const recorder = new MountRecorder();
		const startup = deferred();
		const releaseAdoption = deferred();
		const adoptionDrained = deferred();
		let adoptionStarted = false;
		await writeWorkspaceRequest(root, { taskId: "TASK-1", sessionId: pending.id, pid: process.pid });
		const controller = createController(coreWithRoot(root), {
			viewStateStore: new MemoryViewStateStore(
				state({ selectedTaskId: "TASK-1", selectedModeByTask: { "TASK-1": "plan" } }),
			),
			workspaceState: adoptionWorkspaceState(
				[task("TASK-1")],
				() => ({
					taskId: "TASK-1",
					sessions: [pending],
					modes: { plan: { sessions: [pending], activeSessionId: undefined } },
				}),
				counters,
			),
			runtime: {
				...adoptionRuntime(recorder),
				createExistingAgentHost: ((options: Parameters<typeof createExistingAgentHost>[0]) =>
					fakeExistingAgentHost(options, {
						...agentHostStub(),
						start: async () => {
							if (options.paneId !== `%${pending.id}`) return;
							adoptionStarted = true;
							startup.resolve();
							try {
								await releaseAdoption.promise;
							} finally {
								adoptionDrained.resolve();
							}
						},
					})) as unknown as typeof createExistingAgentHost,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			await startup.promise;
			const entry = mounted.tasks.find((candidate) => candidate.id === "TASK-1");
			if (!entry) throw new Error("Expected selected task entry.");
			recorder.options.at(-1)?.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => recorder.options.at(-1)?.activeAgentSession?.id === "fresh-TASK-1-1");
			releaseAdoption.resolve();
			await adoptionDrained.promise;
			await controller.refresh();
			expect(recorder.options.at(-1)?.selectedModeId).toBe("plan");
			expect(recorder.options.at(-1)?.activeAgentSession?.id).toBe("fresh-TASK-1-1");
			expect(counters.preparedModes).toEqual(["plan", "plan"]);
		} finally {
			releaseAdoption.resolve();
			if (adoptionStarted) await adoptionDrained.promise;
			controller.destroy();
			await running;
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("keeps a gated pending PLAN launch single while BUILD completes and its marker is polled", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-pending-mode-race-"));
		const tasks = [task("TASK-1")];
		const plan = pendingRecord("TASK-1", "pending-plan", process.pid);
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [], preparedModes: [] };
		const planGate = deferred();
		const recorder = new MountRecorder();
		const service = adoptionWorkspaceState(
			tasks,
			() => ({
				taskId: "TASK-1",
				activeSessionId: plan.id,
				sessions: [plan],
				modes: { plan: { sessions: [plan], activeSessionId: plan.id }, build: { sessions: [] } },
			}),
			counters,
		);
		const adopt = service.adoptPendingSession.bind(service);
		service.adoptPendingSession = async (...args) => {
			const result = await adopt(...args);
			if (args[1] === plan.id) await planGate.promise;
			return result;
		};
		await writeWorkspaceRequest(root, { taskId: "TASK-1", sessionId: plan.id, pid: process.pid });
		const controller = createController(coreWithRoot(root), {
			viewStateStore: new MemoryViewStateStore(
				state({ selectedTaskId: "TASK-1", selectedModeByTask: { "TASK-1": "build" } }),
			),
			workspaceState: service,
			activityPollIntervalMs: 5,
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			await waitUntil(() => counters.prepares.includes(plan.id));
			await waitUntil(() => recorder.options.at(-1)?.selectedModeId === "build");
			const entry = mounted.tasks.find((candidate) => candidate.id === "TASK-1");
			if (!entry) throw new Error("Expected selected task entry.");
			recorder.options.at(-1)?.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => counters.activated.includes("fresh-TASK-1-1"));
			await controller.refresh();
			await drainTurns(20);
			expect(counters.prepares).toEqual([plan.id, "fresh-TASK-1-1"]);
			expect(counters.preparedModes).toEqual(["plan", "build"]);
			expect(existsSync(join(workspaceRequestDir(root), `${plan.id}.json`))).toBe(true);
			planGate.resolve();
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			await controller.refresh();
			expect(recorder.options.at(-1)?.selectedModeId).toBe("build");
			expect(recorder.options.at(-1)?.activeAgentSession?.id).toBe("fresh-TASK-1-1");
			expect(counters.prepares.filter((id) => id === plan.id)).toHaveLength(1);
			expect(counters.activated.filter((id) => id === plan.id)).toHaveLength(0);
		} finally {
			planGate.resolve();
			controller.destroy();
			await running;
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("adopts a pending request regardless of informational requester PID", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-adopt-foreign-pid-"));
		const tasks = [task("TASK-1")];
		const foreign = pendingRecord("TASK-1", "foreign-1", process.pid + 1);
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [] };
		const recorder = new MountRecorder();
		await writeWorkspaceRequest(root, {
			taskId: "TASK-1",
			sessionId: foreign.id,
			pid: foreign.ownerPid ?? process.pid + 1,
		});
		const controller = createController(coreWithRoot(root), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: adoptionWorkspaceState(
				tasks,
				(taskId) => ({ taskId, sessions: taskId === "TASK-1" ? [foreign] : [] }),
				counters,
			),
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await drainTurns(20);
			await waitUntil(() => counters.prepares.length === 1);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			expect(counters.prepares).toEqual(["foreign-1"]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("adopts a pending request for a task the user has not selected", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-adopt-unselected-"));
		const tasks = [task("TASK-1"), task("TASK-2")];
		const pending = pendingRecord("TASK-2", "pending-2", process.pid);
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [] };
		const recorder = new MountRecorder();
		await writeWorkspaceRequest(root, { taskId: "TASK-2", sessionId: pending.id, pid: process.pid });
		const controller = createController(coreWithRoot(root), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: adoptionWorkspaceState(
				tasks,
				(taskId) => ({ taskId, sessions: taskId === "TASK-2" ? [pending] : [] }),
				counters,
			),
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await waitUntil(() => counters.prepares.includes("pending-2"));
			expect(counters.activated).toEqual([]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("adopts a registered request from the marker timer without any refresh", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-request-"));
		const tasks = [task("TASK-1")];
		const pending = pendingRecord("TASK-1", "pending-1", process.pid);
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [] };
		const recorder = new MountRecorder();
		await writeWorkspaceRequest(root, { taskId: "TASK-1", sessionId: "pending-1", pid: process.pid });
		// The snapshot scan cannot see the request (empty global map), so only the marker timer can
		// adopt it — which is exactly what an idle workspace relies on.
		const service = Object.assign(
			adoptionWorkspaceState(tasks, (taskId) => ({ taskId, sessions: taskId === "TASK-1" ? [pending] : [] }), counters),
			{ listAllSessions: async () => new Map<string, TaskSessions>() },
		);
		const controller = createController(coreWithRoot(root), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			activityPollIntervalMs: 5,
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await waitUntil(() => counters.prepares.length === 1);
			expect(counters.prepares).toEqual(["pending-1"]);
			expect(counters.activated).toEqual([]);
			expect(existsSync(join(workspaceRequestDir(root), "pending-1.json"))).toBeTrue();
		} finally {
			controller.destroy();
			await running;
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("does not create the request marker directory when it is absent", async () => {
		const root = mkdtempSync(join(tmpdir(), "workspace-nomarker-"));
		const tasks = [task("TASK-1")];
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [] };
		const recorder = new MountRecorder();
		const controller = createController(coreWithRoot(root), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: adoptionWorkspaceState(tasks, (taskId) => ({ taskId, sessions: [] }), counters),
			activityPollIntervalMs: 5,
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			await recorder.next(0);
			await drainTurns(20);
			expect(existsSync(workspaceRequestDir(root))).toBeFalse();
			expect(counters.prepares).toEqual([]);
		} finally {
			controller.destroy();
			await running;
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("probes a stale running session passively without resuming it", async () => {
		const tasks = [task("TASK-1")];
		const stale = { ...session("TASK-1"), id: "stale-running" };
		const settled = { ...stale, status: "stopped" as const, endedAt: "2026-10-05T00:00:00.000Z" };
		let reconciled = false;
		let probeOptions: { passive?: boolean } | undefined;
		const recorder = new MountRecorder();
		let prepared = 0;
		let activated = 0;
		let attached = 0;
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => ({
				taskId: "TASK-1",
				activeSessionId: stale.id,
				sessions: [reconciled ? settled : stale],
			}),
			listAllSessions: async () =>
				new Map([
					["TASK-1", { taskId: "TASK-1", activeSessionId: stale.id, sessions: [reconciled ? settled : stale] }],
				]),
			liveSession: async (_taskId: string, _sessionId: string, options?: { passive?: boolean }) => {
				// `liveSession` settles a stale durable status as a side effect of probing the pane.
				probeOptions = options;
				reconciled = true;
				return undefined;
			},
			prepareSession: async () => {
				prepared += 1;
				throw new Error("A stale session must not be resumed.");
			},
			activateSession: async () => {
				activated += 1;
			},
			finishSession: async () => {},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createExistingAgentHost: (() => {
					attached += 1;
					return { alive: async () => true, start: async () => {}, stop: async () => {} };
				}) as unknown as typeof createExistingAgentHost,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			expect(mounted.liveAgent).toBeUndefined();
			// The preview shows the selected mode's session regardless of lifecycle status, read-only.
			expect(mounted.activeAgentSession).toMatchObject({ id: "stale-running", taskId: "TASK-1", status: "stopped" });
			expect(mounted.notice).toBeUndefined();
			await waitUntil(() => probeOptions !== undefined);
			expect(probeOptions?.passive).toBe(true);
		} finally {
			controller.destroy();
			await running;
		}
		expect({ prepared, activated, attached, reconciled }).toEqual({
			prepared: 0,
			activated: 0,
			attached: 0,
			reconciled: true,
		});
	});

	it.each([
		false,
		true,
	])("real Enter waits for preparation and mount before focusing embedded preview (failure: %s)", async (fail) => {
		const tasks = [task("TASK-1", { title: "ENTER TASK ROW" })];
		const parked = { ...session("TASK-1"), id: "enter-exact", status: "stopped" as const };
		const counters: AdoptionCounters = {
			prepares: [],
			activated: [],
			finished: [],
			preparedModes: [],
			applicationResumes: [],
		};
		const recorder = new MountRecorder();
		const setup = await createTestRenderer({ width: 120, height: 40, exitOnCtrlC: false });
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const service = adoptionWorkspaceState(
			tasks,
			() => ({ taskId: "TASK-1", activeSessionId: parked.id, sessions: [parked] }),
			counters,
		);
		const failedResume = {
			...session("TASK-1"),
			id: "failed-resume",
			status: "stopped" as const,
			createdAt: "2026-10-06T00:00:00.000Z",
		};
		const listModeSessions = service.listModeSessions.bind(service);
		service.listModeSessions = async (taskId, modeId) => {
			const history = await listModeSessions(taskId, modeId);
			return modeId === "plan" ? { ...history, sessions: [...history.sessions, failedResume] } : history;
		};
		const activate = service.activateSession.bind(service);
		service.activateSession = async (...args) => {
			await activate(...args);
			const selectedTask = tasks[0];
			if (selectedTask) selectedTask.status = "In Progress";
			return { activated: true, status: "In Progress" };
		};
		let release = () => {};
		const preparing = new Promise<void>((resolve) => {
			release = resolve;
		});
		let requested = 0;
		const prepare = service.prepareSession.bind(service);
		service.prepareSession = async (...args) => {
			requested += 1;
			await preparing;
			if (fail) throw new Error("Preparation rejected");
			return prepare(...args);
		};
		const writes: string[] = [];
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: service,
			runtime: {
				...adoptionRuntime(recorder),
				createHost: async () => ({
					renderer: setup.renderer,
					root: setup.renderer.root as unknown as BoxRenderable,
					async destroy() {},
				}),
				mountWorkspace: (renderer, root, options) => {
					const recorded = recorder.mount(options);
					const mounted = mountOpenTuiWorkspace(renderer, root, options);
					return {
						...mounted,
						update(next) {
							recorded.update(next);
							mounted.update(next);
						},
					};
				},
				createWorkspaceAgent,
				isAgentAlive: async () => true,
				createAgentHost: () => ({
					...agentHostStub(),
					sendBytes: (bytes) => writes.push(new TextDecoder().decode(bytes)),
				}),
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks.find((candidate) => candidate.id === "TASK-1");
			if (!entry) throw new Error("Expected selected task entry.");
			await setup.flush();
			setup.mockInput.pressTab();
			await waitUntil(() => recorder.options.at(-1)?.selectedModeId === "build");
			setup.mockInput.pressTab();
			await waitUntil(() => recorder.options.at(-1)?.selectedModeId === "plan");
			expect(requested).toBe(0);
			setup.mockInput.pressEnter();
			await waitUntil(() => requested === 1);
			setup.mockInput.pressEnter();
			await drainTurns(10);
			await setup.flush();
			expect(requested).toBe(1);
			expect(setup.captureCharFrame()).toContain("ENTER TASK ROW");
			expect(recorder.options.at(-1)?.agentFocused).toBe(false);
			release();
			if (fail) {
				await waitUntil(() => Boolean(recorder.options.at(-1)?.notice?.includes("Preparation rejected")));
				await setup.flush();
				expect(setup.captureCharFrame()).toContain("ENTER TASK ROW");
				expect(recorder.options.at(-1)?.fullscreen).toBe(false);
				expect(recorder.options.at(-1)?.agentFocused).toBe(false);
				expect(counters.prepares).toEqual([]);
			} else {
				await waitUntil(() => recorder.options.at(-1)?.agentFocused === true);
				await setup.flush();
				const terminal = recorder.options.at(-1)?.liveAgent?.terminal;
				expect(terminal).toBeDefined();
				expect(setup.renderer.currentFocusedRenderable === terminal).toBe(true);
				expect(recorder.options.at(-1)?.fullscreen).toBe(false);
				expect(store.current.activeStatus).toBe("In Progress");
				expect(setup.captureCharFrame()).toContain("ENTER TASK ROW");
				recorder.options.at(-1)?.onSessionRequest?.(entry);
				await waitUntil(() => setup.captureCharFrame().includes("sessions"));
				setup.mockInput.pressArrow("up");
				await setup.flush();
				setup.mockInput.pressArrow("up");
				await setup.flush();
				expect(setup.captureCharFrame()).toContain("> 2026-10-06T00:00:00.000Z opencode stopped");
				setup.mockInput.pressKey("r");
				await waitUntil(() => setup.captureCharFrame().includes("Missing test session failed-resume"));
				expect(setup.captureCharFrame()).toContain("Missing test session failed-resume");
				expect(recorder.options.at(-1)?.liveAgent?.terminal).toBe(terminal);
				expect(setup.captureCharFrame()).toContain("failed-resume");
				setup.mockInput.pressArrow("down");
				await setup.flush();
				setup.mockInput.pressArrow("down");
				await setup.flush();
				setup.mockInput.pressEnter();
				await waitUntil(() => setup.renderer.currentFocusedRenderable === terminal);
				setup.mockInput.pressKey("p");
				expect(writes.join("")).toContain("p");
				setup.mockInput.pressTab();
				setup.mockInput.pressKey("a");
				expect(writes.join("")).toBe("p\ta");
				expect(store.current.selectedModeByTask?.["TASK-1"]).toBe("plan");
				setup.mockInput.pressKey("q", { ctrl: true });
				await setup.flush();
				expect(setup.captureCharFrame()).toContain("ENTER TASK ROW");
				expect(terminal?.focused).toBe(false);
				setup.mockInput.pressEnter();
				await waitUntil(() => counters.activated.length === 1);
				await waitUntil(() => setup.renderer.currentFocusedRenderable === terminal);
				await setup.flush();
				expect(setup.renderer.currentFocusedRenderable === terminal).toBe(true);
				expect(requested).toBe(2);
				expect(counters.prepares).toEqual([parked.id, "failed-resume"]);
				expect(counters.preparedModes).toEqual(["plan", "plan"]);
				expect(counters.applicationResumes).toEqual([parked.id, "failed-resume"]);
				expect(counters.applicationStarts).toBeUndefined();
				expect(counters.activated).toEqual([parked.id]);
				setup.mockInput.pressCtrlC();
				await setup.flush();
				expect(terminal?.focused).toBe(false);
				setup.mockInput.pressKey("f");
				await setup.flush();
				expect(terminal?.focused).toBe(true);
				expect(setup.captureCharFrame()).not.toContain("ENTER TASK ROW");
				setup.mockInput.pressKey("q", { ctrl: true });
				await setup.flush();
				expect(terminal?.focused).toBe(false);
				expect(setup.captureCharFrame()).toContain("ENTER TASK ROW");
			}
		} finally {
			release();
			controller.destroy();
			await running;
			setup.renderer.destroy();
		}
	});

	it("resumes the selected parked mode session automatically", async () => {
		const tasks = [task("TASK-1")];
		const parked = { ...session("TASK-1"), id: "parked-1", status: "parked" as const };
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [], preparedModes: [] };
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: adoptionWorkspaceState(
				tasks,
				() => ({ taskId: "TASK-1", activeSessionId: parked.id, sessions: [parked] }),
				counters,
			),
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			// The parked history is resumed as the mode's active conversation.
			await waitUntil(() => counters.prepares.length === 1);
			expect(counters.prepares).toEqual([parked.id]);
			const entry = mounted.tasks.find((candidate) => candidate.id === "TASK-1");
			if (!entry) throw new Error("Expected selected task entry.");
			expect(recorder.options.at(-1)?.liveAgent?.terminal).toBeDefined();
			expect(counters.preparedModes).toEqual(["plan"]);
			expect(counters.activated).toEqual([parked.id]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("prepares the active running session when no retained terminal is usable", async () => {
		const tasks = [task("TASK-1")];
		const active = { ...session("TASK-1"), id: "running-active", status: "running" as const };
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [], preparedModes: [] };
		const recorder = new MountRecorder();
		const service = adoptionWorkspaceState(
			tasks,
			() => ({ taskId: "TASK-1", activeSessionId: active.id, sessions: [active] }),
			counters,
		);
		service.liveSession = async () => undefined;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks.find((candidate) => candidate.id === "TASK-1");
			if (!entry) throw new Error("Expected selected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => counters.prepares.includes(active.id));
			await waitUntil(() => recorder.options.at(-1)?.liveAgent?.terminal !== undefined);
			expect(counters.prepares).toEqual([active.id]);
			expect(counters.applicationResumes ?? []).toEqual([]);
			expect(counters.applicationStarts).toBeUndefined();
			expect(recorder.options.at(-1)?.notice).toBeUndefined();
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("resumes a native session after its running pane is conclusively absent", async () => {
		const tasks = [task("TASK-1")];
		const stale = { ...session("TASK-1"), id: "stale-native-exact", nativeWorkspace: true, ownerPid: process.pid };
		const counters: AdoptionCounters = { prepares: [], activated: [], finished: [], preparedModes: [] };
		const recorder = new MountRecorder();
		let parked = false;
		const service = adoptionWorkspaceState(
			tasks,
			() => ({
				taskId: "TASK-1",
				activeSessionId: stale.id,
				sessions: [parked ? { ...stale, status: "parked", ownerPid: undefined } : stale],
			}),
			counters,
		);
		service.liveSession = async () => {
			parked = true;
			return undefined;
		};
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: adoptionRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			await drainTurns(20);
			// The preview shows the selected mode's session regardless of lifecycle status, read-only.
			expect(mounted.activeAgentSession).toMatchObject({ id: "stale-native-exact", taskId: "TASK-1" });
			await waitUntil(() => parked);
			expect(parked).toBe(true);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("does not probe shared starting or foreign history when changing tasks", async () => {
		const tasks = [task("TASK-1"), task("TASK-2")];
		const starting = { ...session("TASK-1"), id: "starting", status: "starting" as const };
		const native = {
			...session("TASK-2"),
			id: "native-running",
			nativeWorkspace: true,
			ownerPid: 42,
			ownerScope: "foreign",
		};
		let probes = 0;
		let attached = 0;
		const recorder = new MountRecorder();
		const sessionsFor = async (taskId: string) =>
			taskId === "TASK-1"
				? { taskId, activeSessionId: starting.id, sessions: [starting] }
				: { taskId, activeSessionId: native.id, sessions: [native] };
		const service = {
			listTasks: async () => tasks,
			listSessions: sessionsFor,
			listAllSessions: async () =>
				new Map(await Promise.all(tasks.map(async (task) => [task.id, await sessionsFor(task.id)] as const))),
			liveSession: async (_taskId: string, _sessionId: string, options?: { passive?: boolean }) => {
				expect(options?.passive).toBe(true);
				probes += 1;
				return undefined;
			},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createExistingAgentHost: (() => {
					attached += 1;
					return { alive: async () => true, start: async () => {}, stop: async () => {} };
				}) as unknown as typeof createExistingAgentHost,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			expect(mounted.liveAgent).toBeUndefined();
			// The preview shows the selected mode's session regardless of lifecycle status, read-only.
			expect(mounted.activeAgentSession).toMatchObject({ id: "starting", taskId: "TASK-1", status: "starting" });
			const second = mounted.tasks.find((entry) => entry.id === "TASK-2");
			if (!second) throw new Error("Expected TASK-2 entry.");
			mounted.onTaskSelect?.(second);
			await waitUntil(() => recorder.options.at(-1)?.selectedTaskIndex === 1);
			expect(recorder.options.at(-1)?.activeAgentSession).toMatchObject({ id: "native-running", taskId: "TASK-2" });
			expect(recorder.options.at(-1)?.liveAgent).toBeUndefined();
		} finally {
			controller.destroy();
			await running;
		}
		// Only the selected running session is probed; starting history is not inspected.
		expect({ probes, attached }).toEqual({ probes: 1, attached: 0 });
	});

	it("attaches foreign running history as a read-only terminal", async () => {
		const tasks = [task("TASK-1")];
		const record = { ...session("TASK-1"), id: "external-running" };
		const recorder = new MountRecorder();
		let attached = 0;
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => ({ taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }),
			listAllSessions: async () =>
				new Map([["TASK-1", { taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }]]),
			liveSession: async () => ({ record, server: {}, paneId: "%42" }),
			prepareSession: async () => {
				throw new Error("External sessions must not be relaunched.");
			},
			activateSession: async () => {},
			finishSession: async () => {},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createExistingAgentHost: (() => {
					attached += 1;
					return {
						alive: async () => true,
						start: async () => {},
						stop: async () => {},
						resize: async () => {},
						sendBytes: () => {},
						inputTransport: () => ({ transport: "send-keys-fork" as const, detail: "test" }),
						inputStats: () => undefined,
						flushInput: async () => {},
					};
				}) as unknown as typeof createExistingAgentHost,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const initial = await recorder.next(0);
			await controller.refresh();
			await waitUntil(() => attached === 1);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.terminal));
			expect(initial.activeAgentSession?.id).toBe(record.id);
			expect(recorder.options.at(-1)?.liveAgent?.terminal).toBeDefined();
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("surfaces an error when the selected running session cannot attach", async () => {
		const tasks = [task("TASK-1")];
		const record = { ...session("TASK-1"), id: "external-running" };
		const recorder = new MountRecorder();
		let attached = 0;
		let prepared = 0;
		let activated = 0;
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => ({ taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }),
			listAllSessions: async () =>
				new Map([["TASK-1", { taskId: "TASK-1", activeSessionId: record.id, sessions: [record] }]]),
			liveSession: async () => ({ record, server: {}, paneId: "%42" }),
			prepareSession: async () => {
				prepared += 1;
				throw new Error("External sessions must not be relaunched.");
			},
			activateSession: async () => {
				activated += 1;
			},
			finishSession: async () => {},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createExistingAgentHost: (() => {
					attached += 1;
					return {
						alive: async () => true,
						start: async () => {
							throw new Error("pane vanished");
						},
						stop: async () => {},
					};
				}) as unknown as typeof createExistingAgentHost,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			await controller.refresh();
			await waitUntil(() => Boolean(recorder.options.at(-1)?.notice?.includes("pane vanished")));
			expect(mounted.activeAgentSession?.id).toBe(record.id);
			expect(attached).toBe(1);
		} finally {
			controller.destroy();
			await running;
		}
		expect({ attached, prepared, activated }).toEqual({ attached: 1, prepared: 0, activated: 0 });
	});

	it("does not attach shared running history after selection moves on during its probe", async () => {
		const tasks = [task("TASK-1"), task("TASK-2")];
		const record = { ...session("TASK-1"), id: "external-running" };
		const recorder = new MountRecorder();
		let probes = 0;
		let attached = 0;
		const sessionsFor = async (taskId: string) =>
			taskId === "TASK-1"
				? { taskId, activeSessionId: record.id, sessions: [record] }
				: { taskId, activeSessionId: undefined, sessions: [] };
		const service = {
			listTasks: async () => tasks,
			listSessions: sessionsFor,
			listAllSessions: async () =>
				new Map(await Promise.all(tasks.map(async (task) => [task.id, await sessionsFor(task.id)] as const))),
			liveSession: async () => {
				probes += 1;
				throw new Error("History browsing must not inspect a running pane.");
			},
			prepareSession: async () => {
				throw new Error("A passive probe must not launch a session.");
			},
			activateSession: async () => {},
			finishSession: async () => {},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createExistingAgentHost: (() => {
					attached += 1;
					return {
						alive: async () => true,
						start: async () => {},
						stop: async () => {},
						resize: async () => {},
						sendBytes: () => {},
						inputTransport: () => ({ transport: "send-keys-fork" as const, detail: "test" }),
						inputStats: () => undefined,
						flushInput: async () => {},
					};
				}) as unknown as typeof createExistingAgentHost,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const second = mounted.tasks.find((entry) => entry.id === "TASK-2");
			if (!second) throw new Error("Expected TASK-2 entry.");
			mounted.onTaskSelect?.(second);
			await controller.refresh();
			await waitUntil(() => recorder.options.at(-1)?.selectedTaskIndex === 1);
			expect(recorder.options.at(-1)?.liveAgent).toBeUndefined();
		} finally {
			controller.destroy();
			await running;
		}
		expect({ probes, attached }).toEqual({ probes: 1, attached: 0 });
	});

	it("reuses the mounted workspace so a task selection never repaints a blank task list", async () => {
		const tasks = [task("TASK-1"), task("TASK-2"), task("TASK-3")];
		const setup = await createTestRenderer({ width: 120, height: 24, exitOnCtrlC: false });
		const painted: string[] = [];
		setup.renderer.setFrameCallback(async () => {
			painted.push(setup.captureCharFrame());
		});
		const host = {
			renderer: setup.renderer,
			root: setup.renderer.root as unknown as BoxRenderable,
			destroy() {},
		} as unknown as OpenTuiHost;
		let mounts = 0;
		let updates = 0;
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState: workspaceState(tasks, async (id) => taskSessions(id, false)),
			runtime: {
				async createHost() {
					return host;
				},
				mountWorkspace(renderer, root, options) {
					mounts += 1;
					const mount = mountOpenTuiWorkspace(renderer, root as BoxRenderable, options);
					return {
						update(next) {
							updates += 1;
							mount.update(next);
						},
						setIndication: (indication) => mount.setIndication(indication),
						dispose: () => mount.dispose(),
					};
				},
				mountBoard() {
					return { dispose() {} };
				},
			},
		});
		const running = controller.run();
		try {
			await waitUntil(() => mounts === 1);
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("TASK-1");
			painted.length = 0;
			setup.mockInput.pressArrow("down");
			// Let the selection refresh land and paint; a remount and an in-place update both settle here.
			for (let pass = 0; pass < 50 && mounts + updates < 2; pass += 1) {
				await new Promise<void>((resolve) => setImmediate(resolve));
				await setup.flush();
			}
			await setup.flush();
			// A reuse paints the full task list; a remount would paint a blank pre-layout frame.
			for (const frame of painted) expect(frame).toContain("TASK-1");
			// The refresh reused the live mount, so every node kept its identity and geometry.
			expect(mounts).toBe(1);
			expect(store.current.selectedTaskId).toBe("TASK-2");
			expect(painted.length).toBeGreaterThan(0);
		} finally {
			controller.destroy();
			await running;
			setup.renderer.destroy();
		}
	});

	it("derives activity from the status hook and updates the overlay without remounting", async () => {
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		const { recorder, controller, running, record } = await launchNativeAgent(fake.probe, counters, 0);
		try {
			await waitUntil(() => fake.calls.length > 0);
			expect(fake.calls.at(-1)?.[0]?.sessionId).toBe(record.id);
			expect(fake.calls.at(-1)?.[0]?.statusDir).toBeString();
			expect(fake.calls.at(-1)?.[0]?.bootstrap).toBe("claude");
			const mounts = recorder.mounts;
			const disposed = recorder.disposed;
			fake.setEvidence(
				new Map([
					[
						record.id,
						{ hook: { status: "running", ageMs: 100 }, pane: "alive", captureEmpty: false, chrome: undefined },
					],
				]),
			);
			await waitUntil(() => recorder.indication.some((overlay) => overlay.get("TASK-1") === "working"));
			// The indication rode setIndication: no dispose, no second mount.
			expect(recorder.mounts).toBe(mounts);
			expect(recorder.disposed).toBe(disposed);
			// An unchanged value is a no-op, so further polls add no repaint.
			const pushes = recorder.indication.length;
			const calls = fake.calls.length;
			await waitUntil(() => fake.calls.length >= calls + 3);
			expect(recorder.indication.length).toBe(pushes);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("releases working agents on close with their complete observation history without parking", async () => {
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		let history: import("../agent-workspace/activity-observer.ts").ActivityHistory | undefined;
		let stops = 0;
		const fixture = await launchNativeAgent(fake.probe, counters, 0, {
			...agentHostStub(),
			stop: async () => {
				stops++;
			},
			detach: async (value) => {
				history = value;
				return "retained";
			},
		});
		try {
			fake.setEvidence(
				new Map([
					[
						fixture.record.id,
						{ pane: "alive", hook: { status: "running", ageMs: 0 }, chrome: undefined, captureEmpty: false },
					],
				]),
			);
			await waitUntil(() => fixture.recorder.indication.at(-1)?.get("TASK-1") === "working");
			fixture.controller.destroy();
			await fixture.running;
			expect(history).toMatchObject({ activity: "running", hookSeen: true, unreachableConfirmed: true });
			expect(stops).toBe(0);
			expect(fixture.record.status).toBe("running");
			expect(counters.finish).toBe(0);
		} finally {
			fixture.controller.destroy();
			await fixture.running;
			rmSync(fixture.fixtureDir, { recursive: true, force: true });
		}
	});

	it("keeps shared session status running after local detach settles", async () => {
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		let acknowledge: (value: "gone") => void = () => {};
		const ack = new Promise<"gone">((resolve) => {
			acknowledge = resolve;
		});
		const fixture = await launchNativeAgent(fake.probe, counters, 0, { ...agentHostStub(), detach: () => ack });
		fixture.controller.destroy();
		await drainTurns(2);
		expect(fixture.record.status).toBe("running");
		acknowledge("gone");
		await fixture.running;
		expect(fixture.record.status).toBe("running");
		rmSync(fixture.fixtureDir, { recursive: true, force: true });
	});

	it("releases a launch that finishes after the workspace closes instead of rolling it back", async () => {
		const tasks = [task("TASK-1")];
		const record: AgentSession = { ...session("TASK-1"), status: "starting" };
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const service = nativeAgentService(tasks, record, counters, false);
		let finishStart: () => void = () => {};
		const startGate = new Promise<void>((resolve) => {
			finishStart = resolve;
		});
		let starting = false;
		let releases = 0;
		let stops = 0;
		let destroyed = 0;
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createAgentHost: () => ({
					...agentHostStub(),
					start: async () => {
						starting = true;
						await startGate;
					},
					stop: async () => {
						stops++;
					},
					detach: async () => {
						releases++;
						return "retained";
					},
				}),
				createWorkspaceAgent: (() => ({
					write() {},
					destroy() {
						destroyed++;
					},
				})) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		const mounted = await recorder.next(0);
		const entry = mounted.tasks[0];
		if (!entry) throw new Error("Expected task");
		mounted.onAgentStart?.(entry, 80, 24);
		await waitUntil(() => starting);
		controller.destroy();
		expect(releases).toBe(0);
		finishStart();
		await running;
		expect({ releases, stops, destroyed }).toEqual({ releases: 1, stops: 0, destroyed: 1 });
		expect(counters).toMatchObject({ activate: 0, finish: 0 });
		expect(record.status).toBe("running");
	});

	it("drops a late poll result for a session that is no longer live", async () => {
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		const { recorder, controller, running, record } = await launchNativeAgent(fake.probe, counters, 0);
		try {
			await waitUntil(() => fake.calls.length > 0);
			fake.setEvidence(
				new Map([
					[
						record.id,
						{ hook: { status: "waiting", ageMs: 100 }, pane: "alive", captureEmpty: true, chrome: undefined },
					],
				]),
			);
			await waitUntil(() => recorder.indication.some((overlay) => overlay.get("TASK-1") === "waiting"));
			// A late result for a session that is no longer a probe target is dropped silently.
			fake.setEvidence(
				new Map([
					["superseded", { hook: { status: "error", ageMs: 0 }, pane: "alive", captureEmpty: false, chrome: "error" }],
				]),
			);
			const calls = fake.calls.length;
			await waitUntil(() => fake.calls.length >= calls + 3);
			expect(recorder.indication.at(-1)?.get("TASK-1")).toBe("waiting");
			expect(recorder.indication.at(-1)?.has("superseded")).toBe(false);
			// Explicit stop settles the durable record without relying on observer teardown.
			const mounts = recorder.mounts;
			await recorder.options.at(-1)?.liveAgent?.host?.stop();
			await waitUntil(() => record.status === "stopped");
			expect(recorder.mounts).toBe(mounts);
			expect(recorder.disposed).toBe(0);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("projects the running activity event even when durable lifecycle is parked", async () => {
		const counters: NativeAgentCounters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		const tasks = [task("TASK-1")];
		const record: AgentSession = {
			...session("TASK-1"),
			id: "exact-native",
			status: "starting",
		};
		let durableStatus: AgentSessionStatus = "starting";
		const sessionsFor = (taskId: string): TaskSessions => ({
			taskId,
			activeSessionId: record.id,
			sessions: [{ ...record, status: durableStatus }],
		});
		const service = {
			...nativeAgentService(tasks, record, counters),
			listSessions: async (taskId: string) => sessionsFor(taskId),
			listAllSessions: async () => new Map(tasks.map((entry) => [entry.id, sessionsFor(entry.id)] as const)),
		} as unknown as WorkspaceStateService;
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			activityPollIntervalMs: 0,
			runtime: {
				...createRuntime(recorder),
				createActivityProbe: () => fake.probe,
				createAgentHost: (() => agentHostStub()) as unknown as TestAgentHostFactory,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => fake.calls.length > 0);
			fake.setEvidence(
				new Map([
					[
						record.id,
						{ hook: { status: "running", ageMs: 100 }, pane: "alive", captureEmpty: false, chrome: undefined },
					],
				]),
			);
			await waitUntil(() => recorder.indication.some((overlay) => overlay.get("TASK-1") === "working"));
			// The durable session parks. A later overlay of running must not turn the row green.
			durableStatus = "parked";
			await controller.refresh();
			expect(recorder.options.at(-1)?.indicationByTask?.get("TASK-1")).toBe("working");
			// A fresh overlay change renders its waiting event rather than durable lifecycle.
			fake.setEvidence(
				new Map([
					[
						record.id,
						{ hook: { status: "waiting", ageMs: 100 }, pane: "alive", captureEmpty: true, chrome: undefined },
					],
				]),
			);
			await waitUntil(() => recorder.indication.at(-1)?.get("TASK-1") === "waiting");
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("follows an agent start into the In Progress tab while keeping the started task selected", async () => {
		const tasks = [task("TASK-1"), task("TASK-2", { status: "In Progress" })];
		const record: AgentSession = {
			...session("TASK-1"),
			id: "follow-native",
			status: "starting",
		};
		const counters: NativeAgentCounters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const recorder = new MountRecorder();
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const workspaceState = {
			...nativeAgentService(tasks, record, counters),
			activateSession: async () => {
				counters.activate += 1;
				// The real service rewrites the task; mirror that so the selected task stays in view.
				tasks[0] = { ...tasks[0], status: "In Progress" } as Task;
				return { activated: true, status: "In Progress" };
			},
		} as unknown as WorkspaceStateService;
		const controller = createController(core(), {
			viewStateStore: store,
			workspaceState,
			runtime: {
				...createRuntime(recorder),
				createAgentHost: (() => agentHostStub()) as unknown as TestAgentHostFactory,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => recorder.options.at(-1)?.activeStatus === "In Progress");
			const opts = recorder.options.at(-1);
			const selected = opts && opts.selectedTaskIndex !== undefined ? opts.tasks[opts.selectedTaskIndex] : undefined;
			expect(selected?.id).toBe("TASK-1");
			expect(store.current.activeStatus).toBe("In Progress");
			expect(store.current.selectedTaskId).toBe("TASK-1");
			expect(counters.activate).toBe(1);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("pauses activity polling while a modal owns focus and resumes after it closes", async () => {
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		let picker: OpenTuiSessionPickerOptions | undefined;
		const tasks = [task("TASK-1")];
		const record: AgentSession = { ...session("TASK-1"), id: "exact-native", status: "starting" };
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: new MemoryViewStateStore(state()),
			workspaceState: nativeAgentService(tasks, record, counters),
			// A zero interval means the timer is always ready to fire, so an unpaused poller would
			// probe on many of the drained turns below; a paused one probes on none.
			activityPollIntervalMs: 0,
			runtime: {
				...createRuntime(recorder),
				createActivityProbe: () => fake.probe,
				createAgentHost: (() => agentHostStub()) as unknown as TestAgentHostFactory,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
				mountSessionPicker: (_renderer, _root, options) => {
					picker = options;
					return { dispose: options.onClose };
				},
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => fake.calls.length > 0);
			recorder.options.at(-1)?.onSessionRequest?.(entry);
			await waitUntil(() => Boolean(picker));
			const paused = fake.calls.length;
			await drainTurns(200);
			expect(fake.calls.length).toBe(paused);
			picker?.onClose();
			await waitUntil(() => fake.calls.length > paused);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("stops the activity poller on teardown so no timer survives", async () => {
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		const { recorder, controller, running } = await launchNativeAgent(fake.probe, counters, 0);
		await waitUntil(() => fake.calls.length > 0);
		expect(recorder.mounts).toBe(1);
		controller.destroy();
		await running;
		const settled = fake.calls.length;
		await drainTurns(200);
		expect(fake.calls.length).toBe(settled);
	});

	it("[D2] derives activity without any durable session write", async () => {
		const counters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const fake = controlledProbe();
		const { controller, running, record, recorder } = await launchNativeAgent(fake.probe, counters, 0);
		try {
			await waitUntil(() => fake.calls.length > 0);
			const baseline = { ...counters };
			const expected = { running: "working", waiting: "waiting", idle: "parked", error: "error" } as const;
			for (const status of ["running", "waiting", "idle", "error"] as const) {
				fake.setEvidence(
					new Map([
						[record.id, { hook: { status, ageMs: 100 }, pane: "alive", captureEmpty: true, chrome: undefined }],
					]),
				);
				await waitUntil(() => recorder.indication.at(-1)?.get("TASK-1") === expected[status]);
			}
			// The activity axis never probes, reconciles, resumes, or kills: no extra service calls.
			expect(counters).toEqual(baseline);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("marks the selected task done through the workspace action", async () => {
		const tasks = [task("TASK-1")];
		const recorder = new MountRecorder();
		const edits: Array<{ id: string; status: string }> = [];
		const controller = createController(
			actionCore(tasks, { editTask: (id, input) => edits.push({ id, status: input.status }) }),
			{
				viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
				workspaceState: workspaceState(tasks, async (id) => taskSessions(id, false)),
				runtime: createRuntime(recorder),
			},
		);
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onTaskAction?.(entry, "done");
			await waitUntil(() => edits.length === 1);
			expect(edits).toEqual([{ id: "TASK-1", status: "Done" }]);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Moved TASK-1 to Done");
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("deletes the selected task only after confirmation without a second session purge", async () => {
		const tasks = [task("TASK-1")];
		const recorder = new MountRecorder();
		const deleted: string[] = [];
		const purged: string[] = [];
		const confirms = confirmQueue();
		const workspace = workspaceState(tasks, async (id) => taskSessions(id, false));
		(workspace as unknown as { forgetTaskSessions: (id: string) => Promise<void> }).forgetTaskSessions = async (id) => {
			purged.push(id);
		};
		const controller = createController(
			actionCore(tasks, {
				deleteTask: async (id) => {
					deleted.push(id);
					await (workspace as unknown as { forgetTaskSessions: (taskId: string) => Promise<void> }).forgetTaskSessions(
						id,
					);
				},
			}),
			{
				viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
				workspaceState: workspace,
				runtime: { ...createRuntime(recorder), mountConfirm: () => confirms.mount() },
			},
		);
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");

			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 1);
			confirms.pending[0]?.settle(false);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Delete cancelled");
			expect(deleted).toEqual([]);

			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 2);
			confirms.pending[1]?.settle(true);
			await waitUntil(() => deleted.length === 1 && purged.length === 1);
			expect(deleted).toEqual(["TASK-1"]);
			expect(purged).toEqual(["TASK-1"]);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Deleted TASK-1");
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("task deletion forgets Core state without reentrant UI service stop", async () => {
		const tasks = [task("TASK-1")];
		const record: AgentSession = {
			...session("TASK-1"),
			id: "owned-native",
			status: "starting",
		};
		const counters: NativeAgentCounters = { live: 0, prepare: 0, activate: 0, finish: 0 };
		const service = nativeAgentService(tasks, record, counters, false);
		const activate = service.activateSession.bind(service);
		service.activateSession = async (...args: Parameters<WorkspaceStateService["activateSession"]>) => {
			const result = await activate(...args);
			record.nativeWorkspace = true;
			return result;
		};
		const events: string[] = [];
		service.parkSession = async () => {
			events.push("park");
			record.status = "parked";
		};
		service.finishSession = async (_taskId: string, id: string) => {
			events.push(`finish:${id}`);
			record.status = "stopped";
		};
		const workspace = service as unknown as WorkspaceStateService;
		(workspace as unknown as { forgetTaskSessions: (taskId: string) => Promise<void> }).forgetTaskSessions =
			async () => {
				events.push("forget");
			};
		const recorder = new MountRecorder();
		const confirms = confirmQueue();
		const controller = createController(
			actionCore(tasks, {
				deleteTask: async () => {
					await (workspace as unknown as { forgetTaskSessions: (taskId: string) => Promise<void> }).forgetTaskSessions(
						"TASK-1",
					);
					events.push("delete");
				},
			}),
			{
				viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
				workspaceState: workspace,
				runtime: {
					...adoptionRuntime(recorder),
					mountConfirm: () => confirms.mount(),
					createAgentHost: (() => ({
						...agentHostStub(),
						stop: async () => {
							events.push("stop");
						},
					})) as unknown as TestAgentHostFactory,
				},
			},
		);
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			await drainTurns(5);
			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 1);
			confirms.pending[0]?.settle(false);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Delete cancelled");
			expect(events).toEqual([]);

			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 2);
			confirms.pending[1]?.settle(true);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Deleted TASK-1");
			expect(recorder.options.at(-1)?.notice).toBe("Deleted TASK-1");
			expect(events).toEqual(["forget", "delete"]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("forgets a foreign running native session without stopping it", async () => {
		const tasks = [task("TASK-1")];
		const foreign = { ...session("TASK-1"), id: "foreign-native", status: "running" as const, nativeWorkspace: true };
		const recorder = new MountRecorder();
		const confirms = confirmQueue();
		const deleted: string[] = [];
		const stateForTask = { taskId: "TASK-1", sessions: [foreign], modes: { plan: { sessions: [foreign] } } };
		const workspace = workspaceState(tasks, async () => stateForTask);
		const controller = createController(
			actionCore(tasks, {
				deleteTask: async (id) => {
					deleted.push(id);
				},
			}),
			{
				viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
				workspaceState: workspace,
				runtime: { ...createRuntime(recorder), mountConfirm: () => confirms.mount() },
			},
		);
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 1);
			confirms.pending[0]?.settle(true);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Deleted TASK-1");
			expect(deleted).toEqual(["TASK-1"]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("lets stopped sessions with undefined ownerPid reach delete preflight unchanged", async () => {
		const tasks = [task("TASK-1")];
		const parked = {
			...session("TASK-1"),
			id: "parked-native",
			status: "stopped" as const,
			nativeWorkspace: true,
			ownerPid: undefined,
		};
		const recorder = new MountRecorder();
		const confirms = confirmQueue();
		const events: string[] = [];
		const service = workspaceState(tasks, async () => ({
			taskId: "TASK-1",
			sessions: [parked],
			modes: { plan: { sessions: [parked] } },
		}));
		service.finishSession = async () => {
			events.push("finish");
		};
		const controller = createController(
			actionCore(tasks, {
				deleteTask: () => {
					events.push(`delete:${parked.status}:${String(parked.ownerPid)}`);
				},
			}),
			{
				viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
				workspaceState: service,
				runtime: { ...createRuntime(recorder), mountConfirm: () => confirms.mount() },
			},
		);
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 1);
			confirms.pending[0]?.settle(true);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Deleted TASK-1");
			expect(events).toEqual(["delete:stopped:undefined"]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("does not run an unlocked post-delete session purge", async () => {
		const tasks = [task("TASK-1")];
		const recorder = new MountRecorder();
		const confirms = confirmQueue();
		const deleted: string[] = [];
		const service = workspaceState(tasks, async (id) => taskSessions(id, false));
		const controller = createController(
			actionCore(tasks, {
				deleteTask: (id) => {
					deleted.push(id);
				},
			}),
			{
				viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
				workspaceState: service,
				runtime: { ...createRuntime(recorder), mountConfirm: () => confirms.mount() },
			},
		);
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 1);
			confirms.pending[0]?.settle(true);
			await waitUntil(() => recorder.options.at(-1)?.notice === "Deleted TASK-1");
			expect(deleted).toEqual(["TASK-1"]);
			expect(recorder.options.at(-1)?.notice).toBe("Deleted TASK-1");
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("keeps the running session when core preflight fails before invoking owned stops", async () => {
		const tasks = [task("TASK-1")];
		const record: AgentSession = {
			...session("TASK-1"),
			id: "owned-failure",
			status: "starting",
			nativeWorkspace: true,
		};
		const service = nativeAgentService(tasks, record, { live: 0, prepare: 0, activate: 0, finish: 0 }, false);
		const events: string[] = [];
		service.parkSession = async () => {
			record.status = "parked";
		};
		service.finishSession = async () => {
			record.status = "stopped";
		};
		const workspace = service as unknown as WorkspaceStateService;
		workspace.removeTaskSessions = async () => {
			events.push("purge");
		};
		const recorder = new MountRecorder();
		const confirms = confirmQueue();
		const controller = createController(
			actionCore(tasks, {
				deleteTask: () => {
					throw new Error("cleanup probe failed");
				},
			}),
			{
				viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
				workspaceState: workspace,
				runtime: {
					...adoptionRuntime(recorder),
					mountConfirm: () => confirms.mount(),
					createAgentHost: (() => ({
						...agentHostStub(),
						stop: async () => {
							events.push("stop");
						},
					})) as unknown as TestAgentHostFactory,
				},
			},
		);
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			await drainTurns(5);
			mounted.onTaskAction?.(entry, "delete");
			await waitUntil(() => confirms.pending.length === 1);
			confirms.pending[0]?.settle(true);
			await waitUntil(() =>
				(recorder.options.at(-1)?.notice ?? "").includes("Could not delete TASK-1: cleanup probe failed"),
			);
			expect(tasks).toHaveLength(1);
			expect(record.status).toBe("running");
			expect(events).toEqual([]);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("task deletion does not stop or clean owned runtime resources", async () => {
		for (const failedStage of ["host", "prepared", "park"] as const) {
			const tasks = [task("TASK-1")];
			const record: AgentSession = { ...session("TASK-1"), id: `owned-${failedStage}`, status: "starting" };
			const service = nativeAgentService(tasks, record, { live: 0, prepare: 0, activate: 0, finish: 0 }, false);
			const activate = service.activateSession.bind(service);
			service.activateSession = async (...args: Parameters<WorkspaceStateService["activateSession"]>) => {
				const result = await activate(...args);
				record.nativeWorkspace = true;
				return result;
			};
			let hostStops = 0;
			let parks = 0;
			let deletes = 0;
			let purges = 0;
			service.parkSession = async () => {
				parks += 1;
				if (failedStage === "park" && parks === 1) throw new Error("park failed once");
				record.status = "parked";
			};
			service.finishSession = async () => {
				record.status = "stopped";
			};
			const workspace = service as unknown as WorkspaceStateService;
			(workspace as unknown as { forgetTaskSessions: (taskId: string) => Promise<void> }).forgetTaskSessions =
				async () => {
					purges += 1;
				};
			const recorder = new MountRecorder();
			const confirms = confirmQueue();
			const controller = createController(
				actionCore(tasks, {
					deleteTask: async () => {
						deletes += 1;
					},
				}),
				{
					viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
					workspaceState: workspace,
					runtime: {
						...adoptionRuntime(recorder),
						mountConfirm: () => confirms.mount(),
						createAgentHost: (() => ({
							...agentHostStub(),
							stop: async () => {
								hostStops += 1;
								if (failedStage === "host" && hostStops === 1) throw new Error("host stop failed once");
							},
						})) as unknown as TestAgentHostFactory,
					},
				},
			);
			const running = controller.run();
			try {
				const mounted = await recorder.next(0);
				const entry = mounted.tasks[0];
				if (!entry) throw new Error("Expected task entry.");
				mounted.onAgentStart?.(entry, 80, 24);
				await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
				await drainTurns(5);
				mounted.onTaskAction?.(entry, "delete");
				await waitUntil(() => confirms.pending.length === 1);
				confirms.pending[0]?.settle(true);
				await waitUntil(() => recorder.options.at(-1)?.notice === "Deleted TASK-1");
				expect(deletes).toBe(1);
				expect(purges).toBe(0);
				expect(hostStops).toBe(0);
				expect(parks).toBe(0);
				expect(record.status).toBe("running");
			} finally {
				controller.destroy();
				await running;
			}
		}
	});

	it.each([
		{ appOwned: true, failSuccessor: false },
		{ appOwned: false, failSuccessor: false },
		{ appOwned: true, failSuccessor: true },
		{ appOwned: true, failSuccessor: false, sharedSelection: true },
		{ appOwned: true, failSuccessor: true, sharedSelection: true },
	])("handoff starts the successor before retirement and preserves ownership", async ({
		appOwned,
		failSuccessor,
		sharedSelection = false,
	}) => {
		const previousConfigHome = process.env.XDG_CONFIG_HOME;
		const configHome = mkdtempSync(join(tmpdir(), "handoff-config-"));
		const agenticWorkspaceDir = mkdtempSync(join(tmpdir(), "handoff-"));
		writeFileSync(join(agenticWorkspaceDir, "agents.json"), JSON.stringify(projectConfiguration()));
		process.env.XDG_CONFIG_HOME = configHome;
		const tasks = [task("TASK-1")];
		const predecessor: AgentSession = {
			...session("TASK-1"),
			id: "predecessor",
			status: "running",
			nativeWorkspace: appOwned,
			outputPath: "/dev/null",
		};
		const successor: AgentSession = {
			...session("TASK-1"),
			id: "successor",
			preset: "opencode",
			outputPath: "/dev/null",
		};
		const gate = deferred();
		const activated: string[] = [];
		const hostStarts: boolean[] = [];
		const hostStops: boolean[] = [];
		const lifecycleOrder: string[] = [];
		let prepareCalls = 0;
		let hostCount = 0;
		let handoffStarted = false;
		let gateResolved = false;
		let activeSessionId = predecessor.id;
		const rollbackId = sharedSelection ? "other-client" : predecessor.id;
		const history = () => ({
			taskId: "TASK-1",
			activeSessionId,
			sessions: [predecessor, successor, { ...predecessor, id: "other-client" }],
		});
		const recorder = new MountRecorder();
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => history(),
			listModeSessions: async () => history(),
			listAllSessions: async () => new Map([["TASK-1", history()]]),
			liveSession: async () => undefined,
			prepareSession: async (_taskId: string, _id?: string) => {
				const call = prepareCalls++;
				if (call === 0) return fakeAttachment(predecessor);
				activeSessionId = successor.id;
				handoffStarted = true;
				lifecycleOrder.push("successor-preparing");
				await gate.promise;
				return fakeAttachment(successor);
			},
			prepareNewSession: async () => {
				prepareCalls++;
				activeSessionId = successor.id;
				handoffStarted = true;
				lifecycleOrder.push("successor-preparing");
				await gate.promise;
				if (failSuccessor) {
					activeSessionId = rollbackId;
					throw new Error("successor launch failed");
				}
				return fakeAttachment(successor);
			},
			finalizeHandoff: async (
				_taskId: string,
				next: AgentSession,
				handoff: { predecessor?: { id: string }; priorActiveSessionId?: string },
			) => {
				expect(next.id).toBe(successor.id);
				expect(handoff.predecessor?.id).toBe(predecessor.id);
				expect(handoff.priorActiveSessionId).toBe(rollbackId);
				if (!appOwned) return;
				lifecycleOrder.push(
					successor.status === "running" && activeSessionId === successor.id
						? "predecessor-ended"
						: "predecessor-ended-too-early",
				);
				predecessor.status = "stopped";
			},
			activateSession: async (_taskId: string, id: string) => {
				activated.push(id);
				if (id === successor.id) successor.status = "running";
			},
			finishSession: async () => {},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const handoffCore = {
			loadTasks: async () => tasks,
			loadTaskSnapshot: async () => corpusSnapshot(tasks),
			updateTask: async () => {},
			updateTaskFromInput: async () => {},
			filesystem: {
				rootDir: agenticWorkspaceDir,
				agenticWorkspaceDir,
				loadConfig: async () => ({ projectName: "Roadmap" }),
				listMilestones: async () => [],
				listArchivedMilestones: async () => [],
				loadTask: async (id: string) => tasks.find((candidate) => candidate.id === id),
				withTaskLock: async (_task: Task, run: () => Promise<void>) => run(),
			},
		} as unknown as Core;
		const controller = createController(handoffCore, {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createAgentHost: (() => {
					const index = hostCount++;
					return {
						start: async () => {
							hostStarts[index] = true;
						},
						stop: async () => {
							hostStops[index] = true;
							lifecycleOrder.push(index === 0 ? "predecessor-host-detached" : "successor-host-stopped");
						},
						resize: async () => {},
						sendBytes: () => {},
						inputTransport: () => ({ transport: "pipe-pane-socket" as const, detail: "test" }),
						inputStats: () => undefined,
						flushInput: async () => {},
					};
				}) as unknown as TestAgentHostFactory,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks.find((candidate) => candidate.id === "TASK-1");
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			await drainTurns(5);
			activeSessionId = rollbackId;
			recorder.options.at(-1)?.onHandoffRequest?.(entry);
			// Handoff starts a distinct successor directly, without opening a picker.
			await waitUntil(() => handoffStarted);
			// The existing host and durable session remain intact while the successor is gated.
			expect(hostStops[0]).toBeUndefined();
			expect(lifecycleOrder).toEqual(["successor-preparing"]);
			expect(activeSessionId).toBe(successor.id);
			// A competing start for the same task/mode remains blocked during the handoff.
			recorder.options.at(-1)?.onAgentStart?.(entry, 80, 24);
			await drainTurns(5);
			expect(prepareCalls).toBe(2);
			expect(hostStops[0]).toBeUndefined();
			await drainTurns(2);
			expect(gateResolved).toBe(false);
			// The starting live agent is visible while the selected mode is still preparing.
			await controller.refresh();
			expect(recorder.options.at(-1)?.liveAgent).toMatchObject({
				taskId: "TASK-1",
				label: "agent",
				status: "starting",
			});
			expect(recorder.options.at(-1)?.liveAgent?.host).toBeUndefined();
			gateResolved = true;
			gate.resolve();
			if (failSuccessor) {
				await waitUntil(() => recorder.options.at(-1)?.notice?.includes("successor launch failed") === true);
				expect(lifecycleOrder).toEqual(["successor-preparing"]);
				expect(activeSessionId).toBe(rollbackId);
				expect(predecessor.status).toBe("running");
				expect(hostStops[0]).toBeUndefined();
				return;
			}
			await waitUntil(() => recorder.options.at(-1)?.liveAgent?.label === "opencode");
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			expect(hostStarts).toEqual([true, true]);
			expect(activated.at(-1)).toBe(successor.id);
			if (appOwned) {
				await waitUntil(() => lifecycleOrder.includes("predecessor-ended"));
				expect(lifecycleOrder).toEqual(["successor-preparing", "predecessor-ended"]);
				expect(predecessor.status).toBe("stopped");
			} else {
				expect(lifecycleOrder).toEqual(["successor-preparing"]);
				expect(predecessor.status).toBe("running");
			}
			expect(hostStops[0]).toBeUndefined();
			expect(hostStops[1]).toBeUndefined();
		} finally {
			gate.resolve();
			controller.destroy();
			await running;
			rmSync(agenticWorkspaceDir, { recursive: true, force: true });
			rmSync(configHome, { recursive: true, force: true });
			if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
			else process.env.XDG_CONFIG_HOME = previousConfigHome;
		}
	});

	it("explicit session deletion stops only that session and preserves local selection", async () => {
		const tasks = [task("TASK-1")];
		const previous: AgentSession = { ...session("TASK-1"), id: "delete-previous", status: "stopped" };
		const newer: AgentSession = { ...session("TASK-1"), id: "delete-newer", status: "stopped" };
		const records = [previous, newer];
		let activeSessionId: string | undefined;
		const history = (): TaskSessions => ({
			taskId: "TASK-1",
			sessions: records,
			activeSessionId,
			modes: { plan: { sessions: records, activeSessionId } },
		});
		const stopEntered = deferred();
		const releaseDelete = deferred();
		let deletedSessionId: string | undefined;
		const prepared: string[] = [];
		const hosts = new Map<string, AgentHost>();
		const inputs = new Map<string, string[]>();
		const recorder = new MountRecorder();
		let picker: OpenTuiSessionPickerOptions | undefined;
		const getPicker = (): OpenTuiSessionPickerOptions => {
			if (!picker) throw new Error("Session picker has not opened.");
			return picker;
		};
		const service = {
			listTasks: async () => tasks,
			listSessions: async () => history(),
			listAllSessions: async () => new Map([["TASK-1", history()]]),
			listModeSessions: async () => ({ sessions: records, activeSessionId }),
			liveSession: async (_taskId: string, id: string) => {
				const record = records.find((candidate) => candidate.id === id);
				return prepared.includes(id) && record ? fakeAttachment(record) : undefined;
			},
			prepareSession: async (_taskId: string, id?: string) => {
				const record = records.find((candidate) => candidate.id === id);
				if (!record) throw new Error(`Missing local history ${id ?? "fresh"}`);
				prepared.push(record.id);
				return {
					...fakeAttachment(record),
				};
			},
			activateSession: async (_taskId: string, id: string) => {
				activeSessionId = id;
				return { activated: true };
			},
			deleteSession: async (_taskId: string, id: string) => {
				deletedSessionId = id;
				await hosts.get(id)?.stop();
				if (activeSessionId === id) activeSessionId = undefined;
				records.splice(
					records.findIndex((record) => record.id === id),
					1,
				);
			},
			finishSession: async () => {},
			parkSession: async () => {},
			sessionApplication: {
				newSession: async () => {
					throw new Error("Unexpected new session");
				},
				resumeSession: async (taskId: string, id: string) => {
					await service.prepareSession(taskId, id, "plan");
					const record = records.find((candidate) => candidate.id === id);
					if (!record) throw new Error(`Missing local history ${id}`);
					return record;
				},
			},
		} as unknown as WorkspaceStateService;
		const controller = createController(core("Roadmap", tasks), {
			viewStateStore: new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" })),
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				mountSessionPicker: (_renderer, _root, options) => {
					picker = options;
					return { dispose: options.onClose };
				},
				createAgentHost: ((options: TestAgentHostOptions) => {
					const id = options.sessionId;
					const host = {
						...agentHostStub(),
						sendBytes: (bytes: Uint8Array) => {
							const writes = inputs.get(id) ?? [];
							writes.push(new TextDecoder().decode(bytes));
							inputs.set(id, writes);
						},
						stop: async () => {
							if (id !== previous.id) return;
							stopEntered.resolve();
							await releaseDelete.promise;
						},
					};
					hosts.set(id, host as AgentHost);
					return host;
				}) as unknown as TestAgentHostFactory,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			for (const id of [previous.id, newer.id]) {
				picker = undefined;
				recorder.options.at(-1)?.onSessionRequest?.(entry);
				await waitUntil(() => Boolean(picker));
				const resume = getPicker().onResume(id);
				await waitUntil(() => prepared.includes(id));
				await waitUntil(() => activeSessionId === id);
				await resume;
			}
			// The session picker is a modal: while it is open the controller's refresh returns early,
			// so observe the resumed selection before occluding the workspace with the picker.
			await waitUntil(() => recorder.options.at(-1)?.activeAgentSession?.id === newer.id);
			picker = undefined;
			recorder.options.at(-1)?.onSessionRequest?.(entry);
			await waitUntil(() => Boolean(picker));
			expect(getPicker().localSessionIds?.has(previous.id)).toBe(true);
			getPicker().onFocusLocal(previous.id);
			const deleting = getPicker().onDelete(previous.id);
			await stopEntered.promise;
			expect(deletedSessionId).toBe(previous.id);
			expect(getPicker().localSessionIds?.has(newer.id)).toBe(true);
			getPicker().onFocusLocal(newer.id);
			releaseDelete.resolve();
			await deleting;
			await waitUntil(() => recorder.options.at(-1)?.activeAgentSession?.id === newer.id);
			expect(recorder.options.at(-1)?.activeAgentSession?.id).toBe(newer.id);
			expect(recorder.options.at(-1)?.liveAgent?.host).toBeDefined();
			recorder.options.at(-1)?.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => recorder.options.at(-1)?.agentFocused === true);
			expect(prepared).toEqual([previous.id, newer.id]);
			recorder.options.at(-1)?.liveAgent?.host?.sendBytes(new TextEncoder().encode("selected-newer"));
			expect(inputs.get(newer.id)).toEqual(["selected-newer"]);
		} finally {
			releaseDelete.resolve();
			controller.destroy();
			await running;
		}
	});

	it("activates a gated handoff session despite the selection drifting away", async () => {
		const previousConfigHome = process.env.XDG_CONFIG_HOME;
		const configHome = mkdtempSync(join(tmpdir(), "handoff-drift-config-"));
		const agenticWorkspaceDir = mkdtempSync(join(tmpdir(), "handoff-drift-"));
		writeFileSync(join(agenticWorkspaceDir, "agents.json"), JSON.stringify(projectConfiguration()));
		process.env.XDG_CONFIG_HOME = configHome;
		const tasks = [task("TASK-1")];
		const predecessor: AgentSession = {
			...session("TASK-1"),
			id: "predecessor",
			status: "running",
			nativeWorkspace: true,
			outputPath: "/dev/null",
		};
		const successor: AgentSession = {
			...session("TASK-1"),
			id: "successor",
			preset: "opencode",
			outputPath: "/dev/null",
		};
		const gate = deferred();
		const activated: string[] = [];
		const finished: string[] = [];
		const hostStarts: boolean[] = [];
		let prepareCalls = 0;
		let hostCount = 0;
		let handoffStarted = false;
		const recorder = new MountRecorder();
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		let activeSessionId = predecessor.id;
		const sessionsFor = (taskId: string): TaskSessions =>
			taskId === "TASK-1"
				? { taskId, activeSessionId, sessions: [predecessor, successor] }
				: taskSessions(taskId, false);
		const service = {
			listTasks: async () => tasks,
			listSessions: async (taskId: string) => sessionsFor(taskId),
			listModeSessions: async (taskId: string) => sessionsFor(taskId),
			listAllSessions: async () => new Map(tasks.map((entry) => [entry.id, sessionsFor(entry.id)] as const)),
			liveSession: async () => undefined,
			prepareSession: async (_taskId: string, _id?: string) => {
				const call = prepareCalls++;
				if (call === 0) return fakeAttachment(predecessor);
				activeSessionId = successor.id;
				handoffStarted = true;
				await gate.promise;
				return fakeAttachment(successor);
			},
			prepareNewSession: async () => {
				prepareCalls++;
				activeSessionId = successor.id;
				handoffStarted = true;
				await gate.promise;
				return fakeAttachment(successor);
			},
			activateSession: async (_taskId: string, id: string) => {
				activated.push(id);
				if (id === successor.id) successor.status = "running";
			},
			finishSession: async (taskId: string, id: string, error?: string) => {
				finished.push(`${taskId}:${id}:${error ?? ""}`);
			},
			finalizeHandoff: async () => {},
			parkSession: async () => {},
		} as unknown as WorkspaceStateService;
		const handoffCore = {
			loadTasks: async () => tasks,
			loadTaskSnapshot: async () => corpusSnapshot(tasks),
			updateTask: async () => {},
			updateTaskFromInput: async () => {},
			filesystem: {
				rootDir: agenticWorkspaceDir,
				agenticWorkspaceDir,
				loadConfig: async () => ({ projectName: "Roadmap" }),
				listMilestones: async () => [],
				listArchivedMilestones: async () => [],
				loadTask: async (id: string) => tasks.find((candidate) => candidate.id === id),
				withTaskLock: async (_task: Task, run: () => Promise<void>) => run(),
			},
		} as unknown as Core;
		const controller = createController(handoffCore, {
			viewStateStore: store,
			workspaceState: service,
			runtime: {
				...createRuntime(recorder),
				createAgentHost: (() => {
					const index = hostCount++;
					return {
						start: async () => {
							hostStarts[index] = true;
						},
						stop: async () => {},
						resize: async () => {},
						sendBytes: () => {},
						inputTransport: () => ({ transport: "pipe-pane-socket" as const, detail: "test" }),
						inputStats: () => undefined,
						flushInput: async () => {},
					};
				}) as unknown as TestAgentHostFactory,
				createWorkspaceAgent: (() => ({ write() {}, destroy() {} })) as unknown as typeof createWorkspaceAgent,
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			const entry = mounted.tasks[0];
			if (!entry) throw new Error("Expected task entry.");
			mounted.onAgentStart?.(entry, 80, 24);
			await waitUntil(() => Boolean(recorder.options.at(-1)?.liveAgent?.host));
			await drainTurns(5);
			recorder.options.at(-1)?.onHandoffRequest?.(entry);
			await waitUntil(() => handoffStarted);
			await drainTurns(2);
			// The user moves to another task while the successor session is still being prepared.
			tasks.push(task("TASK-2"));
			await store.update((current) => ({ ...current, selectedTaskId: "TASK-2" }));
			await controller.refresh();
			gate.resolve();
			await waitUntil(() => activated.includes(successor.id));
			expect(activated.at(-1)).toBe(successor.id);
			expect(hostStarts[1]).toBe(true);
			expect(finished.some((call) => call.includes("no longer selected"))).toBeFalse();
		} finally {
			controller.destroy();
			await running;
			rmSync(agenticWorkspaceDir, { recursive: true, force: true });
			rmSync(configHome, { recursive: true, force: true });
			if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
			else process.env.XDG_CONFIG_HOME = previousConfigHome;
		}
	});
});

describe("OpenTuiWorkspaceController group integration", () => {
	it("collapses a group and persists it, then collapses descendants on a second toggle", async () => {
		const tasks = [task("TASK-1")];
		const groupStore = new MemoryGroupStore(groupSeed());
		const recorder = new MountRecorder();
		const controller = createController(core("Roadmap", tasks), {
			viewStateStore: new MemoryViewStateStore(state()),
			groupStore,
			workspaceState: workspaceState(tasks, async (taskId) => taskSessions(taskId, false)),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			mounted.onGroupToggle?.("g1", "collapse");
			await waitUntil(() => groupStore.current.groups.find((group) => group.id === "g1")?.collapsed === true);
			expect(groupStore.current.groups.find((group) => group.id === "g2")?.collapsed).toBe(false);

			mounted.onGroupToggle?.("g1", "collapse");
			await waitUntil(() => groupStore.current.groups.find((group) => group.id === "g2")?.collapsed === true);
			expect(groupStore.current.groups.find((group) => group.id === "g1")?.collapsed).toBe(true);
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("selects a group, persists the selection, and clears the task selection", async () => {
		const tasks = [task("TASK-1")];
		const groupStore = new MemoryGroupStore(groupSeed());
		const store = new MemoryViewStateStore(state({ selectedTaskId: "TASK-1" }));
		const recorder = new MountRecorder();
		const controller = createController(core(), {
			viewStateStore: store,
			groupStore,
			workspaceState: workspaceState(tasks, async (taskId) => taskSessions(taskId, false)),
			runtime: createRuntime(recorder),
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			mounted.onGroupSelect?.({ id: "g1", name: "G1" });
			await waitUntil(() => store.current.selectedGroupId === "g1");
			expect(store.current.selectedTaskId).toBeUndefined();
		} finally {
			controller.destroy();
			await running;
		}
	});

	it("writes group membership when a task is created through the composer path", async () => {
		const agenticWorkspaceDir = mkdtempSync(join(tmpdir(), "workspace-group-create-"));
		const created = task("TASK-NEW", { title: "Grouped" });
		const groupStore = new MemoryGroupStore(groupSeed());
		const recorder = new MountRecorder();
		const setup = await createTestRenderer({ width: 120, height: 40, kittyKeyboard: true, exitOnCtrlC: false });
		const host = {
			renderer: setup.renderer,
			root: setup.renderer.root as unknown as BoxRenderable,
			destroy() {},
		} as unknown as OpenTuiHost;
		const controller = createController(composerCore(agenticWorkspaceDir, created), {
			viewStateStore: new MemoryViewStateStore(state()),
			groupStore,
			workspaceState: workspaceState([], async (taskId) => taskSessions(taskId, false)),
			runtime: {
				...createRuntime(recorder),
				async createHost() {
					return host;
				},
			},
		});
		const running = controller.run();
		try {
			const mounted = await recorder.next(0);
			mounted.onGroupSelect?.({ id: "g1", name: "G1" });
			await waitUntil(() => recorder.options.at(-1)?.selectedGroupId === "g1");
			recorder.options.at(-1)?.onTaskCreate?.();
			for (let pass = 0; pass < 50; pass += 1) {
				await setup.flush();
				if (setup.captureCharFrame().includes("Create Task")) break;
				await new Promise<void>((resolve) => setImmediate(resolve));
			}
			await setup.flush();
			expect(setup.captureCharFrame()).toContain("Create Task");
			setup.mockInput.pressTab();
			await setup.mockInput.typeText("Grouped");
			setup.mockInput.pressKey("s", { ctrl: true });
			await waitUntil(() => groupStore.current.membership["TASK-NEW"] === "g1");
			expect(groupStore.current.membership["TASK-NEW"]).toBe("g1");
		} finally {
			controller.destroy();
			await running;
			setup.renderer.destroy();
			rmSync(agenticWorkspaceDir, { recursive: true, force: true });
		}
	});
});
