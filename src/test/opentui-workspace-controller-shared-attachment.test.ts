import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog } from "../agent-workspace/config.ts";
import type { TmuxServer } from "../agent-workspace/session-process.ts";
import type { SharedAgentAttachment } from "../agent-workspace/sessions.ts";
import type { AgentSession } from "../agent-workspace/types.ts";
import type { WorkspaceStateService } from "../agent-workspace/workspace-state.ts";
import type { Core } from "../core/agentic-workspace.ts";
import type { Task } from "../types/index.ts";
import type { OpenTuiHost } from "../ui/opentui/host.ts";
import { createWorkspaceFilters } from "../ui/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "../ui/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const task: Task = {
	id: "T1",
	title: "T1",
	status: "To Do",
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
};

function fixture(
	overrides: {
		prepare?: () => Promise<SharedAgentAttachment>;
		host?: (callbacks: Record<string, unknown>) => unknown;
		stopError?: Error;
	} = {},
) {
	const root = mkdtempSync(join(tmpdir(), "controller-shared-attachment-"));
	roots.push(root);
	writeFileSync(
		join(root, "agentic-workspace.config.yml"),
		`agent_configuration: ${JSON.stringify({ ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() })}\n`,
	);
	const agentConfiguration = { ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() };
	const core = {
		loadTasks: async () => [task],
		loadTaskSnapshot: async () => ({
			tasks: [task],
			activeTasks: [task],
			config: { statuses: ["To Do"] },
			identityIndex: { getTasks: () => [task], getContestedIds: () => new Set() },
		}),
		filesystem: {
			rootDir: root,
			agenticWorkspaceDir: root,
			loadTask: async () => task,
			loadConfig: async () => ({ projectName: "Test", agentConfiguration }),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
	const record = {
		id: "session-1",
		taskId: task.id,
		preset: "agent",
		tmuxName: "agentic-workspace-task-1-session-1",
		cwd: root,
		bootstrapPath: join(root, "bootstrap.md"),
		status: "running",
		nativeWorkspace: true,
		createdAt: "2026-01-01",
		outputPath: join(root, "output.log"),
	} satisfies AgentSession;
	const server = {
		async newSession() {
			return {};
		},
		async panes() {
			return [];
		},
		async cmd() {
			return [];
		},
	} satisfies TmuxServer;
	const attachment = {
		record,
		server,
		exec: { run: async () => ({ exitCode: 0, stdout: "", stderr: "", durationMs: 0 }) },
		paneId: "%1",
		bootstrap: "pi",
	} satisfies SharedAgentAttachment;
	let stopCalls = 0;
	let stoppedSessionId: string | undefined;
	const state = {
		listTasks: async () => [task],
		listSessions: async () => ({ taskId: task.id, sessions: [] }),
		listModeSessions: async () => ({ taskId: task.id, sessions: [], activeSessionId: undefined }),
		listAllSessions: async () => new Map(),
		liveSession: async () => undefined,
		prepareSession: overrides.prepare ?? (async () => attachment),
		prepareNewSession: async () => ({
			...attachment,
			record: { ...record, id: "session-2", tmuxName: "agentic-workspace-task-1-session-2" },
		}),
		activateSession: async () => undefined,
		finalizeHandoff: async (_taskId: string, _successor: AgentSession, handoff: { predecessor?: { id: string } }) => {
			if (handoff.predecessor) await state.stopSession(_taskId, handoff.predecessor.id);
		},
		stopSession: async (_taskId: string, sessionId: string) => {
			stopCalls++;
			stoppedSessionId = sessionId;
			if (overrides.stopError) throw overrides.stopError;
		},
	} as unknown as WorkspaceStateService;
	let mounted!: OpenTuiWorkspaceOptions;
	const hosts: Array<{
		operations: string[];
		writes: number;
		detaches: number;
		start(): Promise<void>;
		stop(): Promise<void>;
		detach(): Promise<string>;
		resize(columns: number, rows: number): Promise<void>;
		write(value: Uint8Array): void;
	}> = [];
	const runtime = {
		async createHost() {
			return {
				renderer: Object.assign(new EventEmitter(), { width: 80, height: 24 }),
				root: {},
				async destroy() {},
			} as unknown as OpenTuiHost;
		},
		mountWorkspace(_renderer: unknown, _root: unknown, options: OpenTuiWorkspaceOptions) {
			mounted = options;
			return {
				update(next: OpenTuiWorkspaceOptions) {
					mounted = next;
				},
				dispose() {},
				setIndication() {},
			};
		},
		mountBoard() {
			return { dispose() {} };
		},
		createActivityProbe: () => ({ probe: async () => new Map() }),
		createAgentHost() {
			throw new Error("createAgentHost must not be used");
		},
		createExistingAgentHost(callbacks: Record<string, unknown>) {
			return (
				overrides.host?.(callbacks) ??
				(() => {
					const operations: string[] = [];
					const value = {
						operations,
						writes: 0,
						detaches: 0,
						async start() {
							operations.push("start");
						},
						async stop() {},
						async resize() {
							operations.push("resize");
						},
						async detach() {
							value.detaches++;
							return "retained";
						},
						write() {
							value.writes++;
						},
					};
					hosts.push(value);
					return value;
				})()
			);
		},
		createWorkspaceAgent(_renderer: unknown, _host: unknown) {
			return { write() {}, destroy() {}, isDestroyed: false };
		},
		watchTasks: () => () => {},
		watchConfig: () => () => {},
	} as never;
	const store = {
		current: { filters: createWorkspaceFilters(), detailsVisible: true },
		origin: "test",
		async update() {},
		subscribe() {
			return () => {};
		},
		async recheck() {},
		close() {},
	} as never;
	const controller = new OpenTuiWorkspaceController(core, {
		workspaceState: state,
		viewStateStore: store,
		runtime,
		activityPollIntervalMs: 60_000,
	} as never);
	return {
		controller,
		get mounted() {
			return mounted;
		},
		hosts,
		state,
		attachment,
		get stopCalls() {
			return stopCalls;
		},
		get stoppedSessionId() {
			return stoppedSessionId;
		},
	};
}

async function start(f: ReturnType<typeof fixture>): Promise<void> {
	const running = f.controller.run();
	while (!f.mounted) await Bun.sleep(1);
	f.mounted.onAgentStart?.(
		{
			id: task.id,
			title: task.title,
			status: task.status,
			description: "",
			assignees: [],
			labels: [],
			priority: undefined,
		},
		80,
		18,
	);
	for (let tries = 0; tries < 100 && f.hosts.length === 0; tries++) await Bun.sleep(1);
	void running;
}

describe("shared session controller attachment", () => {
	it("allows both controllers to attach writable observers without stopping one another", async () => {
		const first = fixture();
		const second = fixture();
		await start(first);
		await start(second);
		expect(first.hosts).toHaveLength(1);
		expect(second.hosts).toHaveLength(1);
		expect(first.hosts[0]?.operations).toEqual(["start", "resize"]);
		first.hosts[0]?.write(new Uint8Array([1]));
		first.controller.destroy();
		second.hosts[0]?.write(new Uint8Array([2]));
		expect(second.hosts[0]?.writes).toBe(1);
		expect(second.hosts).toHaveLength(1);
		expect(first.stopCalls).toBe(0);
		second.controller.destroy();
	});

	it("does not roll back an attachment if the workspace closes while preparation is pending", async () => {
		let release!: (value: SharedAgentAttachment) => void;
		const f = fixture({
			prepare: () =>
				new Promise((resolve) => {
					release = resolve;
				}),
		});
		const running = f.controller.run();
		while (!f.mounted) await Bun.sleep(1);
		f.mounted.onAgentStart?.(
			{
				id: task.id,
				title: task.title,
				status: task.status,
				description: "",
				assignees: [],
				labels: [],
				priority: undefined,
			},
			80,
			18,
		);
		while (!release) await Bun.sleep(1);
		f.controller.destroy();
		release(f.attachment);
		await running;
		expect(f.hosts).toHaveLength(1);
		expect(f.hosts[0]?.detaches).toBe(1);
	});

	it("detaches a closing observer after gated startup without stopping shared work or publishing state", async () => {
		let releaseStart!: () => void;
		let releaseDetach!: () => void;
		let startReached!: () => void;
		let detachReached!: () => void;
		const started = new Promise<void>((resolve) => (startReached = resolve));
		const detached = new Promise<void>((resolve) => (detachReached = resolve));
		const f = fixture({
			host: () => ({
				start: () => {
					startReached();
					return new Promise<void>((resolve) => (releaseStart = resolve));
				},
				async stop() {},
				detach: async () => {
					detachReached();
					await new Promise<void>((resolve) => (releaseDetach = resolve));
					return "retained" as const;
				},
				async resize() {},
				write() {},
			}),
		});
		const running = f.controller.run();
		while (!f.mounted) await Bun.sleep(1);
		f.mounted.onAgentStart?.(
			{
				id: task.id,
				title: task.title,
				status: task.status,
				description: "",
				assignees: [],
				labels: [],
				priority: undefined,
			},
			80,
			18,
		);
		await started;
		f.controller.destroy();
		releaseStart();
		await detached;
		releaseDetach();
		await running;
		expect(f.stopCalls).toBe(0);
		expect(f.mounted.activeAgentSession).toBeUndefined();
	});

	it("keeps observer startup failures local and propagates explicit stop failures", async () => {
		const failure = new Error("host start failed");
		let detached = 0;
		const f = fixture({
			host: (callbacks) => ({
				async start() {
					(callbacks.onError as (error: Error) => void)(failure);
				},
				async stop() {},
				async detach() {
					detached++;
					return "retained";
				},
				alive: async () => true,
			}),
		});
		await start(f);
		expect(f.stopCalls).toBe(0);
		expect(detached).toBe(1);
		f.controller.destroy();
	});

	it("calls the service stop with the exact record and retains it when stop fails", async () => {
		const stopError = new Error("service stop failed");
		const f = fixture({ stopError });
		await start(f);
		f.mounted.onHandoffRequest?.({
			id: task.id,
			title: task.title,
			status: task.status,
			description: "",
			assignees: [],
			labels: [],
			priority: undefined,
		});
		for (let tries = 0; tries < 100 && f.stopCalls === 0; tries++) await Bun.sleep(1);
		expect(f.stopCalls).toBe(1);
		expect(f.stoppedSessionId).toBe("session-1");
		f.controller.destroy();
	});

	it("retries an explicit service stop after the first service failure", async () => {
		let failures = 1;
		const f = fixture();
		const originalStop = f.state.stopSession;
		f.state.stopSession = async (taskId: string, sessionId: string) => {
			if (failures-- > 0) throw new Error("retry once");
			await originalStop(taskId, sessionId);
		};
		await start(f);
		const request = {
			id: task.id,
			title: task.title,
			status: task.status,
			description: "",
			assignees: [],
			labels: [],
			priority: undefined,
		};
		f.mounted.onHandoffRequest?.(request);
		for (let tries = 0; tries < 100 && f.stopCalls === 0; tries++) await Bun.sleep(1);
		expect(f.stopCalls).toBe(0);
		f.mounted.onHandoffRequest?.(request);
		for (let tries = 0; tries < 100 && f.stopCalls === 0; tries++) await Bun.sleep(1);
		expect(f.stopCalls).toBe(1);
		f.controller.destroy();
	});
});
