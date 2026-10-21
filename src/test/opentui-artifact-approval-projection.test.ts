import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import type { OpenTuiHost } from "../renderer/opentui/host.ts";
import { createWorkspaceFilters } from "../renderer/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "../renderer/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../renderer/opentui/workspace-controller.ts";
import { TaskArtifactRepository } from "../storage/task-artifact-repository.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const task: Task = {
	id: "BACK-23",
	title: "Approval projection",
	status: "To Do",
	createdDate: "2026-10-10",
	labels: [],
	dependencies: [],
};

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function setup() {
	const root = await createUniqueTestDir("artifact-approval-projection");
	roots.push(root);
	const agenticWorkspaceDir = join(root, ".agentic-workspace");
	const container = join(agenticWorkspaceDir, "tasks", "back-23");
	await mkdir(container, { recursive: true });
	await writeFile(
		join(container, "task.md"),
		"---\ntask_schema_version: 3\nid: BACK-23\ntitle: Approval projection\nstatus: To Do\ncreated_date: 2026-10-10\nlabels: []\ndependencies: []\n---\n\ntask record\n",
	);
	const artifactsDir = join(container, "artifacts");
	await mkdir(artifactsDir, { recursive: true });
	const planPath = join(artifactsDir, "plan.md");
	await writeFile(planPath, "plan v1\n");
	const repository = new TaskArtifactRepository({ agenticWorkspaceDirectory: agenticWorkspaceDir });
	const modes = {
		version: 1 as const,
		defaultModeId: "plan",
		order: ["plan", "build", "custom", "spec"],
		profiles: {
			plan: {
				name: "PLAN",
				textColor: "green" as const,
				model: { kind: "default" as const },
				prompt: "",
				permissions: {
					repository: "read" as const,
					task: "read" as const,
					artifacts: "read-write" as const,
					subagents: "allowed" as const,
				},
				artifacts: [],
			},
			build: {
				name: "BUILD",
				textColor: "blue" as const,
				model: { kind: "default" as const },
				prompt: "",
				permissions: {
					repository: "read-write" as const,
					task: "read-write" as const,
					artifacts: "read-write" as const,
					subagents: "allowed" as const,
				},
				artifacts: [],
			},
			custom: {
				name: "CUSTOM",
				model: { kind: "default" as const },
				prompt: "",
				permissions: {
					repository: "read" as const,
					task: "read" as const,
					artifacts: "read-write" as const,
					subagents: "allowed" as const,
				},
				artifacts: [],
			},
			spec: {
				name: "SPEC",
				model: { kind: "default" as const },
				prompt: "",
				permissions: {
					repository: "read" as const,
					task: "read" as const,
					artifacts: "read-write" as const,
					subagents: "allowed" as const,
				},
				artifacts: [],
			},
		},
	};
	await mkdir(join(artifactsDir, "design"), { recursive: true });
	await writeFile(join(artifactsDir, "design", "review.md"), "custom review\n");
	await writeFile(join(artifactsDir, "spec.md"), "spec\n");
	await writeFile(
		join(agenticWorkspaceDir, "agentic-workspace.config.yml"),
		`agent_configuration: ${JSON.stringify({
			selectedPreset: "opencode",
			presets: {
				opencode: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode", resumeFlag: "--session" },
			},
			modes,
		})}\n`,
	);
	let options: OpenTuiWorkspaceOptions | undefined;
	const renderer = Object.assign(new EventEmitter(), { width: 120, height: 40 });
	const host = { renderer, root: {}, async destroy() {} } as unknown as OpenTuiHost;
	let state = {
		filters: createWorkspaceFilters(),
		detailsVisible: true,
		selectedModeByTask: {} as Record<string, string>,
	};
	const projectConfig = {
		projectName: "Test",
		agentConfiguration: {
			selectedPreset: "opencode",
			presets: {
				opencode: {
					command: ["opencode"],
					env: {},
					prepare: "",
					bootstrap: "opencode",
					resumeFlag: "--session",
				},
			},
			modes,
		},
	};
	const controller = new OpenTuiWorkspaceController(
		{
			getProjectModeCatalog: async () => modes,
			loadTasks: async () => [task],
			getStoredConfig: async () => projectConfig,
			loadMilestones: async () => [],
			loadArchivedMilestones: async () => [],
			loadTaskSnapshot: async () => ({
				tasks: [task],
				activeTasks: [task],
				config: { statuses: ["To Do"] },
				identityIndex: { getTasks: () => [task], getContestedIds: () => new Set() },
			}),
			filesystem: {
				rootDir: root,
				agenticWorkspaceDir,
				tasksDir: join(agenticWorkspaceDir, "tasks"),
				taskArtifacts: repository,
				loadConfig: async () => ({
					projectName: "Test",
					agentConfiguration: {
						selectedPreset: "opencode",
						presets: {
							opencode: {
								command: ["opencode"],
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
		} as unknown as Core,
		{
			selectedTaskId: task.id,
			workspaceState: {
				sessionApplication: { projectInventory: async () => [] },
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
			} as never,
			viewStateStore: {
				get current() {
					return state;
				},
				origin: "approval-projection-test",
				async update(patch: (current: typeof state) => typeof state) {
					state = patch(state);
				},
				subscribe() {
					return () => {};
				},
				async recheck() {},
				close() {},
			} as never,
			runtime: {
				async createHost() {
					return host;
				},
				mountWorkspace(_renderer: unknown, _root: unknown, next: OpenTuiWorkspaceOptions) {
					options = next;
					return {
						update(updated: OpenTuiWorkspaceOptions) {
							options = updated;
						},
						dispose() {},
						setIndication() {},
					};
				},
				mountBoard() {
					return { dispose() {} };
				},
				createActivityProbe: () => ({ probe: async () => new Map() }),
				watchTasks: () => ({ stop() {} }),
				watchConfig: () => ({ stop() {} }),
			},
		} as never,
	);
	const run = controller.run();
	while (!options) await Bun.sleep(1);
	return {
		root,
		container,
		planPath,
		repository,
		controller,
		run,
		get options() {
			return options as OpenTuiWorkspaceOptions;
		},
		async selectMode(modeId: string) {
			for (let step = 0; step < modes.order.length && options?.selectedModeId !== modeId; step++) {
				const previousMode = options?.selectedModeId;
				options?.onCycleMode?.();
				const deadline = Date.now() + 5_000;
				while (options?.selectedModeId === previousMode) {
					if (Date.now() >= deadline) throw new Error(`Mode cycle did not advance from ${previousMode}`);
					await Bun.sleep(2);
				}
			}
			expect(options?.selectedModeId).toBe(modeId);
		},
	};
}

async function projection(harness: Awaited<ReturnType<typeof setup>>) {
	await harness.controller.refresh();
	return harness.options.modeProjectionByTask?.(task.id);
}

describe("controller artifact approval projection", () => {
	it("projects mode labels and colors across modes", async () => {
		const harness = await setup();
		try {
			expect(await projection(harness)).toMatchObject({ modeLabel: "PLAN", modeColor: "green" });
			await harness.selectMode("build");
			expect(await projection(harness)).toMatchObject({ modeLabel: "BUILD", modeColor: "blue" });
			await harness.selectMode("custom");
			expect(await projection(harness)).toMatchObject({ modeLabel: "CUSTOM" });
			await harness.selectMode("spec");
			expect(await projection(harness)).toMatchObject({ modeLabel: "SPEC" });
		} finally {
			harness.controller.destroy();
			await harness.run;
			await safeCleanup(harness.root);
			roots.splice(roots.indexOf(harness.root), 1);
		}
	});

	it("keeps projection observational and does not create sessions or change task status", async () => {
		const harness = await setup();
		try {
			expect(await projection(harness)).toMatchObject({ modeLabel: "PLAN" });
			expect(await Bun.file(join(harness.container, "artifacts", "plan.md")).exists()).toBe(true);
			expect(await Bun.file(join(harness.container, "artifacts", ".artifacts.json")).exists()).toBe(false);
		} finally {
			harness.controller.destroy();
			await harness.run;
			await safeCleanup(harness.root);
			roots.splice(roots.indexOf(harness.root), 1);
		}
	});
});
