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
	#updateWaiters: (() => void)[] = [];
	async update(patch: (state: GroupState) => GroupState): Promise<void> {
		this.current = patch(this.current);
		this.updates.push(this.current);
		for (const resolve of this.#updateWaiters.splice(0)) resolve();
	}
	waitForUpdate(): Promise<void> {
		return new Promise((resolve) => this.#updateWaiters.push(resolve));
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
	let resolveMounted!: () => void;
	const mountedPromise = new Promise<void>((resolve) => (resolveMounted = resolve));
	const projectionWaiters: { predicate: (options: OpenTuiWorkspaceOptions) => boolean; resolve: () => void }[] = [];
	const publish = (options: OpenTuiWorkspaceOptions): void => {
		mounted = options;
		resolveMounted();
		for (const waiter of [...projectionWaiters]) {
			if (!waiter.predicate(options)) continue;
			projectionWaiters.splice(projectionWaiters.indexOf(waiter), 1);
			waiter.resolve();
		}
	};
	const renderer = new EventEmitter();
	const host = { renderer, root: {}, async destroy() {} } as unknown as OpenTuiHost;
	const runtime = {
		async createHost() {
			return host;
		},
		mountWorkspace(_renderer: unknown, _root: unknown, options: OpenTuiWorkspaceOptions) {
			publish(options);
			return {
				update(next: OpenTuiWorkspaceOptions) {
					publish(next);
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
		getProjectModeCatalog: async () => getDefaultModeCatalog(),
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
		watchTasks: () => ({ stop() {} }),
		watchConfig: () => ({ stop() {} }),
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
		sessionApplication: { projectInventory: async () => [] },
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
		waitForMounted: () => mountedPromise,
		waitForProjection: (predicate: (options: OpenTuiWorkspaceOptions) => boolean) => {
			if (mounted && predicate(mounted)) return Promise.resolve();
			return new Promise<void>((resolve) => projectionWaiters.push({ predicate, resolve }));
		},
	};
}

describe("workspace controller group deletion", () => {
	it("continues without groups and publishes the store error when group data is corrupt", async () => {
		const workspace = setup(undefined);
		writeFileSync(join(workspace.agenticWorkspaceDir, "groups.json"), "{");
		const run = workspace.controller.run();
		try {
			await workspace.waitForMounted();
			expect(workspace.mounted.notice).toContain("JSON");
			expect(workspace.mounted.groups).toEqual([]);
			expect(workspace.mounted.groupMembership).toEqual({});
		} finally {
			workspace.controller.destroy();
			await run;
		}
	});

	it("confirms empty groups", async () => {
		const emptyStore = new Groups({
			groups: [{ id: "empty", name: "Empty", parentId: null, order: 0, collapsed: false }],
			membership: {},
		});
		let confirmed!: () => void;
		let resolveConfirmMounted!: () => void;
		const confirmMounted = new Promise<void>((resolve) => (resolveConfirmMounted = resolve));
		const empty = setup(emptyStore, {
			mountConfirm: () => {
				const result = new Promise<boolean>((resolve) => {
					confirmed = () => resolve(true);
				});
				resolveConfirmMounted();
				return { result, dispose() {} };
			},
		});
		const emptyRun = empty.controller.run();
		try {
			await empty.waitForMounted();
			empty.mounted.onGroupDelete?.({ id: "empty", name: "Empty" });
			await confirmMounted;
			const update = emptyStore.waitForUpdate();
			confirmed();
			await update;
			expect(emptyStore.current.groups).toEqual([]);
		} finally {
			empty.controller.destroy();
			await emptyRun;
		}
	});

	it.each([
		["another group", "other", { T1: "other", T2: "parent" }, "other"],
		["ungrouped root", null, { T2: "parent" }, null],
	] as const)("moves populated group contents to %s while preserving child order", async (_destination, destination, membership, parentId) => {
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
		let resolveModal!: () => void;
		const modalMounted = new Promise<void>((resolve) => (resolveModal = resolve));
		const moving = setup(store, {
			mountGroupDelete: (_renderer: unknown, _root: unknown, options: Record<string, unknown>) => {
				modalOptions = options;
				resolveModal();
				return { dispose() {} };
			},
		});
		const movingRun = moving.controller.run();
		try {
			await moving.waitForMounted();
			moving.mounted.onGroupDelete?.({ id: "doomed", name: "Doomed" });
			await modalMounted;
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
			await onConfirm(destination);
			expect(store.updates).toHaveLength(1);
			expect(store.current.membership).toEqual(membership);
			const movedChildren = store.current.groups.filter((group) => group.id === "child-b" || group.id === "child-a");
			expect(movedChildren.map((group) => group.id)).toEqual(["child-b", "child-a"]);
			expect(movedChildren.map((group) => group.parentId)).toEqual([parentId, parentId]);
			expect(store.current.groups.find((group) => group.id === "grandchild")?.parentId).toBe("child-b");
			expect(store.current.groups.map((group) => group.id)).not.toContain("doomed");
			const updatedProjection = moving.waitForProjection((options) =>
				destination === null ? options.groupMembership?.T1 === undefined : options.groupMembership?.T1 === destination,
			);
			await updatedProjection;
			expect(moving.mounted.groupMembership).toEqual(membership);
			expect(moving.mounted.groups?.map((group) => group.id)).not.toContain("doomed");
		} finally {
			moving.controller.destroy();
			await movingRun;
		}
	});

	it("cancels populated-group deletion without changing its projection or contents", async () => {
		const store = new Groups({
			groups: [
				{ id: "parent", name: "Parent", parentId: null, order: 0, collapsed: false },
				{ id: "doomed", name: "Doomed", parentId: "parent", order: 0, collapsed: false },
				{ id: "child", name: "Child", parentId: "doomed", order: 0, collapsed: false },
			],
			membership: { T1: "doomed" },
		});
		let modalOptions: Record<string, unknown> | undefined;
		let resolveModal!: () => void;
		const modalMounted = new Promise<void>((resolve) => (resolveModal = resolve));
		const workspace = setup(store, {
			mountGroupDelete: (_renderer: unknown, _root: unknown, options: Record<string, unknown>) => {
				modalOptions = options;
				resolveModal();
				return { dispose() {} };
			},
		});
		const run = workspace.controller.run();
		try {
			await workspace.waitForMounted();
			const originalGroups = workspace.mounted.groups;
			const originalMembership = workspace.mounted.groupMembership;
			workspace.mounted.onGroupDelete?.({ id: "doomed", name: "Doomed" });
			await modalMounted;
			(modalOptions as { onCancel: () => void }).onCancel();
			expect(store.updates).toHaveLength(0);
			expect(store.current).toEqual({
				groups: [
					{ id: "parent", name: "Parent", parentId: null, order: 0, collapsed: false },
					{ id: "doomed", name: "Doomed", parentId: "parent", order: 0, collapsed: false },
					{ id: "child", name: "Child", parentId: "doomed", order: 0, collapsed: false },
				],
				membership: { T1: "doomed" },
			});
			expect(workspace.mounted.groups).toEqual(originalGroups);
			expect(workspace.mounted.groupMembership).toEqual(originalMembership);
		} finally {
			workspace.controller.destroy();
			await run;
		}
	});
});
