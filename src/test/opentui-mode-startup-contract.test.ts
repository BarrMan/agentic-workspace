import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import type { Core } from "../controller/agentic-workspace.ts";
import type { WorkspaceStateService } from "../controller/workspace-state.ts";
import type { AgentConfiguration, TaskSessions } from "../model/session/types.ts";
import type { Task } from "../model/types.ts";
import type { OpenTuiHost } from "../renderer/opentui/host.ts";
import { createWorkspaceFilters, type SharedWorkspaceState } from "../renderer/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "../renderer/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../renderer/opentui/workspace-controller.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog, requireProjectModeCatalog } from "../storage/config.ts";

const task: Task = {
	id: "BACK-1",
	title: "Startup contract",
	status: "To Do",
	createdDate: "2026-10-10",
	labels: [],
	dependencies: [],
};

function customConfiguration(): AgentConfiguration {
	return {
		...getBuiltInAgentConfiguration(),
		modes: {
			version: 1,
			defaultModeId: "review",
			order: ["ship", "review"],
			profiles: {
				ship: {
					name: "SHIP",
					model: { kind: "default" },
					prompt: "Ship the change",
					permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "allowed" },
					artifacts: [],
				},
				review: {
					name: "REVIEW",
					model: { kind: "default" },
					prompt: "Review the change",
					permissions: { repository: "read", task: "read", artifacts: "read", subagents: "disabled" },
					artifacts: [],
				},
			},
		},
	};
}

/** Directory metadata also detects transient create/delete writes, beyond final file bytes. */
function snapshot(root: string): Record<string, { bytes?: string; mtime: number; ctime: number }> {
	const entries: ReturnType<typeof snapshot> = {};
	const visit = (path: string): void => {
		const stat = statSync(path);
		entries[relative(root, path) || "."] = {
			...(stat.isFile() ? { bytes: readFileSync(path).toString("base64") } : {}),
			mtime: stat.mtimeMs,
			ctime: stat.ctimeMs,
		};
		if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(join(path, name));
	};
	visit(root);
	return entries;
}

function project(configuration?: AgentConfiguration) {
	const rootDir = mkdtempSync(join(tmpdir(), "agentic-workspace-mode-startup-contract-"));
	const agenticWorkspaceDir = join(rootDir, ".agentic-workspace");
	mkdirSync(join(agenticWorkspaceDir, "tasks"), { recursive: true });
	mkdirSync(join(agenticWorkspaceDir, "sessions", task.id), { recursive: true });
	writeFileSync(join(agenticWorkspaceDir, "config.yml"), "project_name: Startup contract\nstatuses: [To Do]\n");
	writeFileSync(
		join(agenticWorkspaceDir, "tasks", "back-1.md"),
		"---\nid: BACK-1\ntitle: Startup contract\nstatus: To Do\n---\nKeep task bytes.\n",
	);
	writeFileSync(
		join(agenticWorkspaceDir, "sessions", task.id, "state.json"),
		'{"version":1,"taskId":"BACK-1","sessions":[]}\n',
	);
	if (configuration)
		writeFileSync(
			join(agenticWorkspaceDir, "agentic-workspace.config.yml"),
			`agent_configuration: ${JSON.stringify(configuration)}\n`,
		);
	let currentConfiguration = configuration;
	const core = {
		getStoredConfig: async () => ({ agentConfiguration: currentConfiguration }),
		getProjectModeCatalog: async () => {
			if (!currentConfiguration?.modes)
				currentConfiguration = { ...(currentConfiguration ?? {}), modes: getDefaultModeCatalog() };
			return requireProjectModeCatalog(currentConfiguration);
		},
		loadTasks: async () => [task],
		loadMilestones: async () => [],
		loadArchivedMilestones: async () => [],
		loadTaskSnapshot: async () => ({
			tasks: [task],
			activeTasks: [task],
			config: { statuses: ["To Do"] },
			identityIndex: { getTasks: () => [task], getContestedIds: () => new Set<string>() },
		}),
		watchTasks: () => ({ stop() {} }),
		watchConfig: () => ({ stop() {} }),
		filesystem: {
			rootDir,
			projectRoot: rootDir,
			agenticWorkspaceDir,
			loadConfig: async () => ({
				projectName: "Startup contract",
				statuses: ["To Do"],
				agentConfiguration: currentConfiguration,
			}),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
	return { rootDir, core, configuration: () => currentConfiguration };
}

function stores(selectedMode?: string) {
	const current: SharedWorkspaceState = {
		filters: createWorkspaceFilters(),
		detailsVisible: true,
		selectedTaskId: task.id,
		...(selectedMode ? { selectedModeByTask: { [task.id]: selectedMode } } : {}),
	};
	return {
		viewStateStore: {
			current,
			origin: "startup-contract",
			update: mock(async () => {}),
			subscribe: mock(() => () => {}),
			recheck: async () => {},
			close() {},
		},
		groupStore: {
			current: { groups: [], membership: {} },
			update: mock(async () => {}),
			subscribe: mock(() => () => {}),
			close() {},
		},
	};
}

function workspace() {
	const listModeSessions = mock(async (_taskId: string, _modeId: string) => ({ sessions: [] }));
	const service = {
		sessionApplication: { projectInventory: async () => [] },
		listTasks: mock(async () => [task]),
		listAllSessions: mock(async () => new Map<string, TaskSessions>()),
		listSessions: mock(async () => ({ taskId: task.id, sessions: [] })),
		listModeSessions,
		liveSession: async () => undefined,
	} as unknown as WorkspaceStateService;
	return { service, listModeSessions };
}

describe("public controller.run project mode startup contract", () => {
	for (const initialView of ["workspace", "board"] as const) {
		for (const missing of ["project configuration", "modes in mode-less project configuration"] as const) {
			it(`initializes absent ${missing} and reaches the host (${initialView})`, async () => {
				const fixture = project(missing === "project configuration" ? undefined : getBuiltInAgentConfiguration());
				const supplied = stores();
				const createHost = mock(async (): Promise<OpenTuiHost> => {
					throw new Error("Reached host creation");
				});
				const controller = new OpenTuiWorkspaceController(fixture.core, {
					initialView,
					workspaceState: workspace().service,
					...supplied,
					runtime: { createHost },
				});
				try {
					const error = await controller.run().then(
						() => undefined,
						(error: unknown) => error,
					);
					expect(error).toBeInstanceOf(Error);
					expect((error as Error).message).toBe("Reached host creation");
					expect(createHost).toHaveBeenCalledTimes(1);
					expect(fixture.configuration()?.modes?.order).toEqual(["plan", "build"]);
				} finally {
					controller.destroy();
					rmSync(fixture.rootDir, { recursive: true, force: true });
				}
			});
		}
	}

	for (const selected of [undefined, "deleted-mode", "ship"]) {
		it(`uses the authoritative custom catalog with ${selected ?? "no persisted selection"}`, async () => {
			const fixture = project(customConfiguration());
			const supplied = stores(selected);
			const originalState = structuredClone(supplied.viewStateStore.current);
			const before = snapshot(fixture.rootDir);
			const state = workspace();
			const createHost = mock(
				async () =>
					({
						renderer: new EventEmitter(),
						root: {},
						async destroy() {},
					}) as unknown as OpenTuiHost,
			);
			let mounted: OpenTuiWorkspaceOptions | undefined;
			const controller = new OpenTuiWorkspaceController(fixture.core, {
				...supplied,
				workspaceState: state.service,
				runtime: {
					createHost,
					mountWorkspace: (_renderer, _root, options) => {
						mounted = options;
						return { update() {}, setIndication() {}, dispose() {} };
					},
					createActivityProbe: () => ({ probe: async () => new Map() }),
				},
			});
			const running = controller.run();
			let runError: unknown;
			void running.catch((error: unknown) => {
				runError = error;
			});
			try {
				for (let attempts = 0; !mounted && !runError && attempts < 500; attempts++) await Bun.sleep(1);
				if (runError) throw runError;
				expect(mounted).toBeDefined();
				const expectedMode = selected === "ship" ? "ship" : "review";
				expect(createHost).toHaveBeenCalledTimes(1);
				expect(mounted?.selectedModeId).toBe(expectedMode);
				expect(mounted?.modeProjectionByTask?.(task.id)).toEqual({
					modeLabel: expectedMode === "ship" ? "SHIP" : "REVIEW",
					approved: false,
				});
				expect(state.listModeSessions.mock.calls.length).toBeGreaterThan(0);
				for (const [, modeId] of state.listModeSessions.mock.calls) expect(modeId).toBe(expectedMode);
				expect(supplied.viewStateStore.current).toEqual(originalState);
				expect(snapshot(fixture.rootDir)).toEqual(before);
			} finally {
				controller.destroy();
				await running.catch(() => {});
				rmSync(fixture.rootDir, { recursive: true, force: true });
			}
		});
	}
});

describe("source entrypoint mode startup contract", () => {
	for (const modeLessConfiguration of [false, true]) {
		it(`initializes ${modeLessConfiguration ? "configuration without modes" : "missing project configuration"}`, async () => {
			const fixture = project(modeLessConfiguration ? getBuiltInAgentConfiguration() : undefined);
			const stdout = new Writable({
				write: (_chunk, _encoding, done) => {
					done();
				},
			});
			const stderr = new Writable({
				write: (_chunk, _encoding, done) => {
					done();
				},
			});
			try {
				await runCli(["workspace"], { cwd: fixture.rootDir, stdout, stderr });
				const saved = readFileSync(join(fixture.rootDir, ".agentic-workspace", "config.yml"), "utf8");
				expect(saved).toContain('"plan"');
				expect(saved).toContain('"build"');
			} finally {
				rmSync(fixture.rootDir, { recursive: true, force: true });
			}
		});
	}
});
