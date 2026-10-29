import { describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import type { OpenTuiHost } from "../renderer/opentui/host.ts";
import { createWorkspaceFilters } from "../renderer/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "../renderer/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../renderer/opentui/workspace-controller.ts";
import { getDefaultModeCatalog } from "../storage/config.ts";
import { openViewStateStore } from "../storage/view-state-store.ts";

let removed: ((id: string) => void | Promise<void>) | undefined;
mock.module("../storage/watchers/task-watcher.ts", () => ({
	watchTaskRecords: (_storage: unknown, callbacks: { onTaskRemoved?: (id: string) => void | Promise<void> }) => {
		removed = callbacks.onTaskRemoved;
		return { stop() {} };
	},
}));

const task: Task = {
	id: "TASK-1",
	title: "Removal lifecycle",
	status: "To Do",
	done: false,
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
};

function assertValidModeMap(value: unknown): asserts value is Record<string, string> {
	expect(value).toBeDefined();
	expect(typeof value).toBe("object");
	expect(value).not.toBeNull();
	for (const modeId of Object.values(value as Record<string, unknown>)) {
		expect(typeof modeId).toBe("string");
	}
}

describe("final task removal mode state", () => {
	it("prunes only final deletion, while browsing and archive/completion changes preserve selection", async () => {
		const directory = mkdtempSync(join(tmpdir(), "agentic-workspace-mode-final-removal-"));
		const modes = getDefaultModeCatalog();
		const agentConfiguration = {
			selectedPreset: "opencode",
			presets: {
				opencode: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode", resumeFlag: "--session" },
			},
			modes,
		};
		mkdirSync(join(directory, ".agentic-workspace", ".locks"), { recursive: true });
		writeFileSync(
			join(directory, ".agentic-workspace", "agentic-workspace.config.yml"),
			`agent_configuration: ${JSON.stringify(agentConfiguration)}\n`,
		);
		const store = await openViewStateStore(
			directory,
			() =>
				({
					filters: createWorkspaceFilters(),
					detailsVisible: true,
					selectedModeByTask: { [task.id]: "build", "TASK-OTHER": "plan" },
				}) as never,
		);
		let mounted: OpenTuiWorkspaceOptions | undefined;
		let taskList = [task];
		const renderer = Object.assign(new EventEmitter(), { width: 120, height: 40 });
		const host = { renderer, root: {}, async destroy() {} } as unknown as OpenTuiHost;
		const core = {
			getProjectModeCatalog: async () => modes,
			tasks: {
				loadSnapshot: async () => ({
					tasks: taskList,
					activeTasks: taskList,
					config: { statuses: ["To Do", "Done"] },
					identityIndex: { getTasks: () => [], getContestedIds: () => new Set() },
				}),
			},
			projectInventory: async () => taskList.map((task) => ({ task, sessions: [] })),
			filesystem: {
				agenticWorkspaceDir: join(directory, ".agentic-workspace"),
				tasksDir: join(directory, ".agentic-workspace", "tasks"),
				projectRoot: directory,
				configFilePath: "",
				loadConfig: async () => ({ projectName: "Test", statuses: ["To Do", "Done"], agentConfiguration }),
				listMilestones: async () => [],
				listArchivedMilestones: async () => [],
			},
			storage: {
				loadTasks: async () => taskList,
				loadConfig: async () => ({ projectName: "Test", statuses: ["To Do", "Done"], agentConfiguration }),
				loadMilestones: async () => [],
				loadArchivedMilestones: async () => [],
				watchConfig: () => ({ stop() {} }),
			},
		} as unknown as Core;
		const controller = new OpenTuiWorkspaceController(core, {
			selectedTaskId: task.id,
			workspaceState: {
				listSessions: async (taskId: string, modeId?: string) => ({
					taskId,
					...(modeId ? { modeId } : {}),
					sessions: [],
					activeSessionId: undefined,
				}),
				listAllSessions: async () => new Map(),
				liveSession: async () => undefined,
			} as never,
			viewStateStore: store,
			runtime: {
				async createHost() {
					return host;
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
			} as never,
		} as never);
		const running = controller.run();
		try {
			for (let i = 0; i < 300 && !mounted; i++) await Bun.sleep(1);
			expect(mounted?.selectedModeId).toBe("build");
			mounted?.onCycleMode?.();
			const deadline = Date.now() + 2_000;
			while (
				(store.current as { selectedModeByTask?: Record<string, string> }).selectedModeByTask?.[task.id] !== "plan" &&
				Date.now() < deadline
			) {
				await Bun.sleep(1);
			}
			const afterCycle: unknown = (store.current as { selectedModeByTask?: unknown }).selectedModeByTask;
			assertValidModeMap(afterCycle);
			const modeAfterCycle = afterCycle[task.id];
			expect(modeAfterCycle).toBe("plan");
			// Completion and archive are ordinary task changes; neither is final removal.
			taskList = [{ ...task, status: "Done" }];
			await store.update((state) => state);
			const afterCompletion: unknown = (store.current as { selectedModeByTask?: unknown }).selectedModeByTask;
			assertValidModeMap(afterCompletion);
			const modeAfterCompletion = afterCompletion[task.id];
			expect(modeAfterCompletion).toBe("plan");
			taskList = [];
			await removed?.(task.id);
			const afterFinalRemoval: unknown = (store.current as { selectedModeByTask?: unknown }).selectedModeByTask;
			assertValidModeMap(afterFinalRemoval);
			const remainingModes = afterFinalRemoval;
			expect(remainingModes).toEqual({ "TASK-OTHER": "plan" });
		} finally {
			controller.destroy();
			await Promise.race([running, Bun.sleep(1000)]);
			store.close();
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
