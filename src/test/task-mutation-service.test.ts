import { describe, expect, it } from "bun:test";
import { ProjectTaskMutations } from "../controller/task-mutation-service.ts";
import type { Task } from "../model/types.ts";

describe("ProjectTaskMutations", () => {
	it("rejects whitespace-only priority updates without clearing the existing priority", async () => {
		const task = {
			id: "TASK-1",
			title: "Priority task",
			status: "To Do",
			priority: "High",
			labels: [],
			dependencies: [],
			createdDate: "2025-01-01",
			rawContent: "",
		} as Task;
		const storage = {
			loadConfig: async () => ({ statuses: ["To Do"], priorities: ["High"] }),
		};
		const mutations = new ProjectTaskMutations(
			storage as never,
			async () => null,
			async () => [],
		);

		await expect(mutations.applyTaskUpdateInput(task, { priority: " " })).rejects.toThrow("Invalid priority");
		expect(task.priority).toBe("High");
		const result = await mutations.applyTaskUpdateInput(task, { priority: "" });
		expect(result.task.priority).toBeUndefined();
	});

	it("does not touch the dependency store for an unrelated edit", async () => {
		const task = {
			id: "TASK-1",
			title: "Before",
			status: "To Do",
			labels: [],
			dependencies: [],
			createdDate: "2025-01-01",
			rawContent: "",
		} as Task;
		const mutations = new ProjectTaskMutations(
			{ loadConfig: async () => ({ statuses: ["To Do"] }) } as never,
			async () => null,
			async () => [],
		);

		const result = await mutations.applyTaskUpdateInput(task, { title: "After" });

		expect(result.task.title).toBe("After");
	});

	it("requires an exact loaded milestone ID for ordinary edits", async () => {
		const task = {
			id: "TASK-1",
			title: "Milestone task",
			status: "To Do",
			labels: [],
			dependencies: [],
			createdDate: "2025-01-01",
			rawContent: "",
		} as Task;
		const mutations = new ProjectTaskMutations(
			{
				loadConfig: async () => ({ statuses: ["To Do"] }),
				loadMilestones: async () => [{ id: "M-1", title: "Release One", description: "" }],
			} as never,
			async () => null,
			async () => [],
		);

		await expect(mutations.applyTaskUpdateInput(task, { milestone: "Release One" })).rejects.toThrow(
			"Unknown milestone ID",
		);
		expect(task.milestone).toBeUndefined();
		await expect(mutations.applyTaskUpdateInput(task, { milestone: "M-1" })).resolves.toMatchObject({
			task: { milestone: "M-1" },
		});
	});

	it("falls back to the filesystem task when the working-copy index has no match", async () => {
		const task = { id: "task-1", title: "Filesystem task" } as Task;
		const storage = {
			loadCompletedTasks: async () => [],
			loadConfig: async () => ({ statuses: ["To Do"] }),
			loadTask: async (id: string) => (id === task.id ? task : null),
			activeTaskIdentityRecord: () => ({}),
			projectCompletedTaskIdentityRecord: () => ({}),
			taskIdentityContext: () => ({}),
		};
		const mutations = new ProjectTaskMutations(
			storage as never,
			async () => null,
			async () => [],
		);

		expect(await mutations.loadWorkingCopyTask(task.id, false, [])).toEqual(task);
	});

	it("marks Done through a status-only task mutation", async () => {
		const task = {
			id: "TASK-1",
			title: "Done task",
			status: "To Do",
			labels: [],
			dependencies: [],
			createdDate: "2025-01-01",
			rawContent: "",
			worktreePolicy: "enabled" as const,
		};
		let saved: Task | undefined;
		const storage = {
			loadConfig: async () => ({ statuses: ["To Do", "Done"] }),
			loadTask: async () => task,
			withTaskLock: async (_task: Task, operation: () => Promise<unknown>) => await operation(),
			saveTask: async (next: Task) => {
				saved = next;
				return "";
			},
		};
		const mutations = new ProjectTaskMutations(
			storage as never,
			async () => task,
			async () => [],
		);

		const result = await mutations.markDone(task.id);

		expect(result).toMatchObject({ changed: true, task: { status: "Done", worktreePolicy: "enabled" } });
		expect(saved).toMatchObject({ status: "Done", worktreePolicy: "enabled" });
	});
});
