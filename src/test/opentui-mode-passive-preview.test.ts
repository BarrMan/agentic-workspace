import { describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultModeCatalog } from "../agent-workspace/config.ts";
import type { Core } from "../core/backlog.ts";
import type { Task } from "../types/index.ts";
import type { OpenTuiHost } from "../ui/opentui/host.ts";
import { createWorkspaceFilters } from "../ui/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "../ui/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../ui/opentui/workspace-controller.ts";

const task: Task = {
	id: "TASK-1",
	title: "Passive mode preview",
	status: "To Do",
	assignee: [],
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
};

describe("OpenTui passive mode preview contract", () => {
	it("switches to a parked and then absent mode history without preparing, resuming, or changing session status", async () => {
		const directory = mkdtempSync(join(tmpdir(), "backlog-mode-passive-"));
		let mounted: OpenTuiWorkspaceOptions | undefined;
		const updates: OpenTuiWorkspaceOptions[] = [];
		let persistedState = {
			filters: createWorkspaceFilters(),
			detailsVisible: true,
			selectedModeByTask: {} as Record<string, string>,
		};
		const parked = { id: "parked-build", status: "parked" as const };
		const calls = { prepareSession: 0, resumeSession: 0, statusWrites: 0 };
		const renderer = Object.assign(new EventEmitter(), { width: 120, height: 40 });
		const host = { renderer, root: {}, async destroy() {} } as unknown as OpenTuiHost;
		const modes = getDefaultModeCatalog();
		modes.order.push("review");
		modes.profiles.review = structuredClone(modes.profiles.build!);
		modes.profiles.review.name = "Review";
		delete modes.profiles.review.textColor;
		mkdirSync(join(directory, ".backlog"), { recursive: true });
		writeFileSync(
			join(directory, ".backlog", "agents.json"),
			JSON.stringify({
				selectedPreset: "opencode",
				presets: {
					opencode: { command: "opencode", env: {}, prepare: "", bootstrap: "opencode", resumeFlag: "--session" },
				},
				modes,
			}),
		);
		const core = {
			loadTasks: async () => [task],
			loadTaskSnapshot: async () => ({
				tasks: [task],
				activeTasks: [task],
				config: { statuses: ["To Do"] },
				identityIndex: { getTasks: () => [task], getContestedIds: () => new Set() },
			}),
			filesystem: {
				backlogDir: join(directory, ".backlog"),
				projectRoot: directory,
				loadConfig: async () => ({ projectName: "Test" }),
				listMilestones: async () => [],
				listArchivedMilestones: async () => [],
			},
		} as unknown as Core;
		const workspace = {
			listTasks: async () => [task],
			listSessions: async (taskId: string) => ({ taskId, sessions: [parked] }),
			listModeSessions: async (taskId: string, modeId: string) => ({
				taskId,
				modeId,
				sessions: modeId === "build" ? [parked] : [],
				activeSessionId: modeId === "build" ? parked.id : undefined,
			}),
			listAllSessions: async () => new Map(),
			liveSession: async () => undefined,
			prepareSession: async () => {
				calls.prepareSession += 1;
			},
			resumeSession: async () => {
				calls.resumeSession += 1;
			},
			updateSessionStatus: async () => {
				calls.statusWrites += 1;
			},
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
		const running = controller.run();
		try {
			for (let attempt = 0; attempt < 300 && !mounted; attempt += 1) await Bun.sleep(1);
			expect(mounted).toBeDefined();
			expect(mounted?.selectedModeId).toBe("plan");
			expect(mounted?.modeProjectionByTask?.(task.id)?.modeColor).toBe("green");
			mounted?.onCycleMode?.();
			for (let attempt = 0; attempt < 300 && mounted?.selectedModeId !== "build"; attempt += 1) await Bun.sleep(1);
			expect(mounted?.selectedModeId).toBe("build");
			expect(mounted?.modeProjectionByTask?.(task.id)?.modeColor).toBe("blue");
			expect(mounted?.activeAgentSession).toBeUndefined();
			mounted?.onCycleMode?.();
			for (let attempt = 0; attempt < 300 && mounted?.selectedModeId !== "review"; attempt += 1) await Bun.sleep(1);
			expect(mounted?.selectedModeId).toBe("review");
			expect(mounted?.modeProjectionByTask?.(task.id)?.modeColor).toBeUndefined();
			const catalogPath = join(directory, ".backlog", "agents.json");
			const editedConfiguration = JSON.parse(readFileSync(catalogPath, "utf8"));
			editedConfiguration.modes.profiles.plan.name = "Project planning";
			editedConfiguration.modes.profiles.plan.textColor = "magenta";
			writeFileSync(catalogPath, JSON.stringify(editedConfiguration));
			mounted?.onCycleMode?.();
			for (let attempt = 0; attempt < 300 && mounted?.selectedModeId !== "plan"; attempt += 1) await Bun.sleep(1);
			expect(mounted?.modeProjectionByTask?.(task.id)).toMatchObject({
				modeLabel: "Project planning",
				modeColor: "magenta",
			});
			expect(updates.length).toBeGreaterThan(1);
			expect(calls).toEqual({ prepareSession: 0, resumeSession: 0, statusWrites: 0 });
			expect(parked.status).toBe("parked");
		} finally {
			controller.destroy();
			await Promise.race([running, Bun.sleep(1000)]);
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
