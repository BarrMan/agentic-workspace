import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultModeCatalog } from "../agent-workspace/config.ts";
import type { Core } from "../core/agentic-workspace.ts";
import type { Task } from "../types/index.ts";
import type { OpenTuiHost } from "../ui/opentui/host.ts";
import { createWorkspaceFilters } from "../ui/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "../ui/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";

const task: Task = {
	id: "TASK-1",
	title: "Mode navigation",
	status: "To Do",
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
};

function setup() {
	const directory = mkdtempSync(join(tmpdir(), "agentic-workspace-mode-navigation-"));
	let mounted: OpenTuiWorkspaceOptions | undefined;
	const updates: OpenTuiWorkspaceOptions[] = [];
	let persistedState = {
		filters: createWorkspaceFilters(),
		detailsVisible: true,
		selectedModeByTask: {} as Record<string, string>,
	};
	const renderer = Object.assign(new EventEmitter(), { width: 120, height: 40 });
	const host = { renderer, root: {}, async destroy() {} } as unknown as OpenTuiHost;
	const modes = getDefaultModeCatalog();
	modes.order.push("review");
	modes.profiles.review = structuredClone(modes.profiles.build!);
	modes.profiles.review.name = "Review";
	mkdirSync(join(directory, ".agentic-workspace"), { recursive: true });
	writeFileSync(
		join(directory, ".agentic-workspace", "agentic-workspace.config.yml"),
		`agent_configuration: ${JSON.stringify({
			selectedPreset: "opencode",
			presets: {
				opencode: { command: "opencode", env: {}, prepare: "", bootstrap: "opencode", resumeFlag: "--session" },
			},
			modes,
		})}\n`,
	);
	const core = {
		loadTasks: async () => [task],
		loadMilestones: async () => [],
		loadArchivedMilestones: async () => [],
		loadTaskSnapshot: async () => ({
			tasks: [task],
			activeTasks: [task],
			config: { statuses: ["To Do"] },
			identityIndex: { getTasks: () => [task], getContestedIds: () => new Set() },
		}),
		filesystem: {
			agenticWorkspaceDir: join(directory, ".agentic-workspace"),
			projectRoot: directory,
			loadConfig: async () => ({
				projectName: "Test",
				agentConfiguration: {
					selectedPreset: "opencode",
					presets: {
						opencode: {
							command: "opencode",
							env: {},
							prepare: "",
							bootstrap: "opencode",
							resumeFlag: "--session",
						},
					},
					modes,
				},
			}),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
	const workspace = {
		listTasks: async () => [task],
		listSessions: async (taskId: string) => ({ taskId, sessions: [] }),
		listModeSessions: async (taskId: string, modeId: string) => ({
			taskId,
			modeId,
			sessions: [],
			activeSessionId: undefined,
		}),
		listAllSessions: async () => new Map(),
		liveSession: async () => undefined,
	};
	const runtime = {
		async createHost() {
			return host;
		},
		mountWorkspace(_renderer: unknown, _root: unknown, options: OpenTuiWorkspaceOptions) {
			mounted = options;
			updates.push(options);
			return {
				update(next: OpenTuiWorkspaceOptions) {
					mounted = next;
					updates.push(next);
				},
				dispose() {},
				setIndication() {},
			};
		},
		mountBoard() {
			return { dispose() {} };
		},
		createActivityProbe: () => ({ probe: async () => new Map() }),
	};
	const controller = new OpenTuiWorkspaceController(core, {
		selectedTaskId: task.id,
		workspaceState: workspace as never,
		viewStateStore: {
			get current() {
				return persistedState;
			},
			origin: "test",
			async update(patch: (state: typeof persistedState) => typeof persistedState) {
				persistedState = patch(persistedState);
			},
			subscribe() {
				return () => {};
			},
			async recheck() {},
			close() {},
		} as never,
		runtime: runtime as never,
	} as never);
	return {
		controller,
		renderer,
		directory,
		get mounted() {
			return mounted;
		},
		get selectedModeByTask() {
			return persistedState.selectedModeByTask;
		},
		updates,
	};
}

describe("OpenTui independent mode navigation contract", () => {
	it("exposes the selected mode in public workspace options and cycles persisted catalog order without launching", async () => {
		const harness = setup();
		const running = harness.controller.run();
		try {
			while (!harness.mounted) await Bun.sleep(1);
			expect(harness.mounted.selectedModeId).toBe("plan");
			const before = harness.updates.length;
			harness.mounted.onCycleMode?.();
			await Bun.sleep(30);
			expect(harness.selectedModeByTask[task.id]).toBe("build");
			expect(harness.updates.at(-1)?.selectedModeId).toBe("build");
			expect(harness.updates.length).toBeGreaterThan(before);
			// Mode cycling is selection-only: browsing does not start an agent session.
			expect(harness.mounted.onAgentStart).toBeDefined();
		} finally {
			harness.controller.destroy();
			await running;
			rmSync(harness.directory, { recursive: true, force: true });
		}
	});
});
