import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BoxRenderable } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import { upsertAgentConfiguration } from "../../controller/agent-configuration.ts";
import { Core } from "../../controller/agentic-workspace.ts";
import { getBuiltInAgentConfiguration, getDefaultModeCatalog } from "../../storage/config.ts";
import type { GroupState, GroupStore } from "../../storage/group-store.ts";
import { initializeTestProject } from "../../test/test-utils.ts";
import { createWorkspaceFilters, type SharedWorkspaceState } from "./workspace/state.ts";
import type { OpenTuiWorkspaceOptions } from "./workspace.ts";
import { OpenTuiWorkspaceController } from "./workspace-controller.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

class Groups implements GroupStore {
	current: GroupState = {
		groups: [{ id: "group", name: "Group", parentId: null, order: 0, collapsed: false }],
		membership: {},
	};
	failures = 0;
	async update(patch: (state: GroupState) => GroupState): Promise<void> {
		if (this.failures-- > 0) throw new Error("group save failed");
		this.current = patch(this.current);
	}
	subscribe(): () => void {
		return () => {};
	}
	close(): void {}
}

async function fixture() {
	const directory = await mkdtemp(join(tmpdir(), "workspace-task-retry-"));
	cleanups.push(() => rm(directory, { recursive: true, force: true }));
	const core = new Core(directory);
	await initializeTestProject(core, "Task retries");
	await upsertAgentConfiguration(core, "project", {
		...getBuiltInAgentConfiguration(),
		modes: getDefaultModeCatalog(),
	});
	const groups = new Groups();
	const viewState = {
		current: { filters: createWorkspaceFilters(), detailsVisible: false } as SharedWorkspaceState,
		failures: 0,
		origin: "test",
		async update(patch: (state: SharedWorkspaceState) => SharedWorkspaceState) {
			if (viewState.failures-- > 0) throw new Error("selection save failed");
			viewState.current = patch(viewState.current);
		},
		subscribe: () => () => {},
		async recheck() {},
		close() {},
	};
	const setup = await createTestRenderer({ width: 140, height: 42, kittyKeyboard: true });
	const root = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" });
	setup.renderer.root.add(root);
	let workspace: OpenTuiWorkspaceOptions | undefined;
	const controller = new OpenTuiWorkspaceController(core, {
		groupStore: groups,
		viewStateStore: viewState,
		runtime: {
			createHost: async () => ({ renderer: setup.renderer, root, destroy: () => setup.renderer.destroy() }),
			mountWorkspace: (_renderer, _root, next) => {
				workspace = next;
				return {
					update(value) {
						workspace = value;
					},
					dispose() {},
					setIndication() {},
				};
			},
			createActivityProbe: () => ({ probe: async () => new Map() }),
		},
	});
	const running = controller.run();
	cleanups.push(async () => {
		controller.destroy();
		await running;
	});
	const waitFor = async (condition: () => boolean): Promise<void> => {
		for (let attempt = 0; attempt < 500; attempt++) {
			await setup.flush();
			if (condition()) return;
			await Bun.sleep(2);
		}
		throw new Error(
			`Timed out waiting for task workflow: ${setup
				.captureCharFrame()
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean)
				.join("\n")}`,
		);
	};
	await waitFor(() => workspace !== undefined);
	return {
		core,
		groups,
		viewState,
		setup,
		controller,
		waitFor,
		get workspace() {
			if (!workspace) throw new Error("Workspace not mounted.");
			return workspace;
		},
		frame: () => setup.captureCharFrame(),
		submit: () => setup.mockInput.pressKey("s", { ctrl: true }),
	};
}

describe("public workspace task operation retries", () => {
	it.each([
		"group",
		"selection",
	] as const)("retries a committed creation after %s failure without duplicating it", async (failure) => {
		const test = await fixture();
		const creating = spyOn(test.core.tasks, "create");
		test.workspace.onGroupSelect?.({ id: "group", name: "Group" });
		await test.controller.refresh();
		await test.workspace.onTaskCreate?.();
		await test.setup.flush();
		test.setup.mockInput.pressTab();
		await test.setup.mockInput.typeText("Created");
		if (failure === "group") test.groups.failures = 1;
		else test.viewState.failures = 1;
		test.submit();
		await test.waitFor(() => test.frame().includes(`${failure} save`));
		const committed = (await test.core.loadTasks())[0];
		if (!committed) throw new Error("Creation did not commit.");
		expect(test.frame()).toContain(committed.id);
		expect(test.frame()).toContain("was created");
		await test.setup.mockInput.typeText(" revised");
		test.submit();
		await test.waitFor(() => test.workspace.notice === `Created ${committed.id}`);
		expect(creating).toHaveBeenCalledTimes(1);
		expect((await test.core.loadTasks()).map((task) => [task.id, task.title])).toEqual([
			[committed.id, "Created revised"],
		]);
		expect(test.groups.current.membership[committed.id]).toBe("group");
		expect(test.viewState.current.selectedTaskId).toBe(committed.id);
		expect(test.viewState.current.selectedGroupId).toBeUndefined();
		expect(test.workspace.selectedGroupId).toBeUndefined();
		expect(test.workspace.tasks[test.workspace.selectedTaskIndex ?? -1]?.id).toBe(committed.id);
	});

	it("selects a task created from a group and clears the persisted group selection", async () => {
		const test = await fixture();
		test.workspace.onGroupSelect?.({ id: "group", name: "Group" });
		await test.controller.refresh();
		expect(test.workspace.selectedGroupId).toBe("group");
		await test.workspace.onTaskCreate?.();
		await test.setup.flush();
		test.setup.mockInput.pressTab();
		await test.setup.mockInput.typeText("Selected creation");
		test.submit();
		await test.waitFor(() => test.workspace.notice?.startsWith("Created ") === true);
		const committed = (await test.core.loadTasks())[0];
		if (!committed) throw new Error("Creation did not commit.");
		expect(test.viewState.current.selectedGroupId).toBeUndefined();
		expect(test.workspace.selectedGroupId).toBeUndefined();
		expect(test.workspace.tasks[test.workspace.selectedTaskIndex ?? -1]?.id).toBe(committed.id);
	});

	it.each([
		["without external changes", false],
		["with a real external change", true],
	] as const)("retries field/group save %s", async (_name, externalChange) => {
		const test = await fixture();
		const { task } = await test.core.tasks.create({ title: "Original", status: "To Do" });
		await test.controller.refresh();
		const entry = test.workspace.tasks.find((candidate) => candidate.id === task.id);
		if (!entry) throw new Error("Task not mounted.");
		test.workspace.onTaskAction?.(entry, "edit");
		await test.setup.flush();
		await test.setup.mockInput.typeText(" edited");
		// The editor's fifth field selects group membership.
		for (let index = 0; index < 4; index++) test.setup.mockInput.pressTab();
		test.setup.mockInput.pressArrow("right");
		test.groups.failures = 1;
		test.submit();
		await test.waitFor(() => test.frame().includes("group save failed"));
		expect(test.frame()).toContain("are saved");
		expect((await test.core.tasks.getTask(task.id))?.title).toBe("Original edited");
		expect(test.groups.current.membership[task.id]).toBeUndefined();
		if (externalChange)
			await test.core.storage.withTaskLock(
				task.id,
				async (current) => await test.core.tasks.edit({ ...current, title: "External title" }),
			);
		test.setup.mockInput.pressTab();
		await test.setup.mockInput.typeText(" again");
		test.submit();
		if (externalChange) {
			await test.waitFor(() => test.frame().includes("title changed outside this workspace"));
			expect((await test.core.tasks.getTask(task.id))?.title).toBe("External title");
			expect(test.groups.current.membership[task.id]).toBeUndefined();
		} else {
			await test.waitFor(() => test.workspace.notice === `Saved ${task.id}`);
			expect((await test.core.tasks.getTask(task.id))?.title).toBe("Original edited again");
			expect(test.groups.current.membership[task.id]).toBe("group");
		}
	});
});
