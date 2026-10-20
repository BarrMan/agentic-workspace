import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Core } from "../controller/agentic-workspace.ts";
import type { WorkspaceStateService } from "../controller/workspace-state.ts";
import type { Task } from "../model/types.ts";
import type { OpenTuiHost } from "../renderer/opentui/host.ts";
import { createWorkspaceFilters } from "../renderer/opentui/workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "../renderer/opentui/workspace.ts";
import { OpenTuiWorkspaceController } from "../renderer/opentui/workspace-controller.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog } from "../storage/config.ts";
import type { GroupState, GroupStore } from "../storage/group-store.ts";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

class Groups implements GroupStore {
	constructor(public current: GroupState) {}
	readonly updates: GroupState[] = [];
	async update(patch: (state: GroupState) => GroupState): Promise<void> {
		this.current = patch(this.current);
		this.updates.push(this.current);
	}
	subscribe(): () => void {
		return () => {};
	}
	close(): void {}
}

const tasks: Task[] = ["T1", "T2"].map((id) => ({
	id,
	title: id,
	status: "To Do",
	createdDate: "2026-01-01",
	labels: [],
	dependencies: [],
}));

function setup(groups: Groups | undefined, runtimeOverrides: Record<string, unknown> = {}) {
	const agenticWorkspaceDir = mkdtempSync(join(tmpdir(), "agentic-workspace-workspace-controller-groups-"));
	roots.push(agenticWorkspaceDir);
	writeFileSync(
		join(agenticWorkspaceDir, "agentic-workspace.config.yml"),
		`agent_configuration: ${JSON.stringify({ ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() })}\n`,
	);
	let mounted!: OpenTuiWorkspaceOptions;
	const renderer = new EventEmitter();
	const host = { renderer, root: {}, async destroy() {} } as unknown as OpenTuiHost;
	const runtime = {
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
		...runtimeOverrides,
	} as never;
	const core = {
		workspaceDirectory: agenticWorkspaceDir,
		getStoredConfig: async () => ({
			agentConfiguration: { ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() },
		}),
		loadTasks: async () => tasks,
		loadMilestones: async () => [],
		loadArchivedMilestones: async () => [],
		loadTaskSnapshot: async () => ({
			tasks,
			activeTasks: tasks,
			config: { statuses: ["To Do"] },
			identityIndex: { getTasks: () => tasks, getContestedIds: () => new Set() },
		}),
		filesystem: {
			agenticWorkspaceDir,
			loadConfig: async () => ({
				projectName: "Test",
				agentConfiguration: { ...getBuiltInAgentConfiguration(), modes: getDefaultModeCatalog() },
			}),
			listMilestones: async () => [],
			listArchivedMilestones: async () => [],
		},
	} as unknown as Core;
	const workspace = {
		listTasks: async () => tasks,
		listSessions: async (taskId: string) => ({ taskId, sessions: [] }),
		listModeSessions: async (taskId: string, modeId: string) => ({
			taskId,
			modeId,
			sessions: [],
			activeSessionId: undefined,
		}),
		listAllSessions: async () => new Map(),
		liveSession: async () => undefined,
	} as unknown as WorkspaceStateService;
	const controller = new OpenTuiWorkspaceController(core, {
		...(groups ? { groupStore: groups } : {}),
		workspaceState: workspace,
		viewStateStore: {
			current: { filters: createWorkspaceFilters(), detailsVisible: true },
			origin: "test",
			async update() {},
			subscribe() {
				return () => {};
			},
			async recheck() {},
			close() {},
		} as never,
		runtime,
	} as never);
	return {
		controller,
		agenticWorkspaceDir,
		get mounted() {
			return mounted;
		},
	};
}

describe("workspace controller group deletion", () => {
	it("continues without groups and publishes the store error when group data is corrupt", async () => {
		const workspace = setup(undefined);
		writeFileSync(join(workspace.agenticWorkspaceDir, "groups.json"), "{");
		const run = workspace.controller.run();
		try {
			while (!workspace.mounted) await Bun.sleep(1);
			expect(workspace.mounted.notice).toContain("JSON");
			expect(workspace.mounted.groups).toEqual([]);
			expect(workspace.mounted.groupMembership).toEqual({});
		} finally {
			workspace.controller.destroy();
			await run;
		}
	});

	it("confirms empty groups and moves direct contents while preserving child order", async () => {
		const emptyStore = new Groups({
			groups: [{ id: "empty", name: "Empty", parentId: null, order: 0, collapsed: false }],
			membership: {},
		});
		let confirmed!: () => void;
		const empty = setup(emptyStore, {
			mountConfirm: () => ({
				result: new Promise<boolean>((resolve) => {
					confirmed = () => resolve(true);
				}),
				dispose() {},
			}),
		});
		const emptyRun = empty.controller.run();
		try {
			while (!empty.mounted) await Bun.sleep(1);
			empty.mounted.onGroupDelete?.({ id: "empty", name: "Empty" });
			await Bun.sleep(0);
			confirmed();
			await Bun.sleep(20);
			expect(emptyStore.current.groups).toEqual([]);
		} finally {
			empty.controller.destroy();
			await emptyRun;
		}

		const store = new Groups({
			groups: [
				{ id: "parent", name: "Parent", parentId: null, order: 0, collapsed: false },
				{ id: "doomed", name: "Doomed", parentId: "parent", order: 0, collapsed: false },
				{ id: "child-b", name: "Child B", parentId: "doomed", order: 2, collapsed: false },
				{ id: "grandchild", name: "Grandchild", parentId: "child-b", order: 0, collapsed: false },
				{ id: "child-a", name: "Child A", parentId: "doomed", order: 1, collapsed: false },
				{ id: "other", name: "Other", parentId: null, order: 1, collapsed: false },
			],
			membership: { T1: "doomed", T2: "parent" },
		});
		let modalOptions: Record<string, unknown> | undefined;
		const moving = setup(store, {
			mountGroupDelete: (_renderer: unknown, _root: unknown, options: Record<string, unknown>) => {
				modalOptions = options;
				return { dispose() {} };
			},
		});
		const movingRun = moving.controller.run();
		try {
			while (!moving.mounted) await Bun.sleep(1);
			moving.mounted.onGroupDelete?.({ id: "doomed", name: "Doomed" });
			await Bun.sleep(0);
			expect(modalOptions).toMatchObject({
				taskCount: 1,
				childGroupCount: 2,
				defaultDestinationId: "parent",
				destinationOptions: [
					{ label: "Parent", value: "parent" },
					{ label: "Other", value: "other" },
				],
			});
			const onConfirm = (modalOptions as { onConfirm: (destination: string | null) => Promise<void> }).onConfirm;
			await onConfirm("other");
			expect(store.updates).toHaveLength(1);
			expect(store.current.membership).toEqual({ T1: "other", T2: "parent" });
			expect(store.current.groups.filter((group) => group.parentId === "other").map((group) => group.id)).toEqual([
				"child-b",
				"child-a",
			]);
			expect(store.current.groups.find((group) => group.id === "grandchild")?.parentId).toBe("child-b");
			expect(store.current.groups.map((group) => group.id)).not.toContain("doomed");
		} finally {
			moving.controller.destroy();
			await movingRun;
		}
	});
});
