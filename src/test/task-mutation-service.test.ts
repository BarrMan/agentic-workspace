import { describe, expect, it } from "bun:test";
import { ProjectTaskMutations } from "../core/task-mutation-service.ts";
import type { Task } from "../types/index.ts";

describe("ProjectTaskMutations", () => {
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
});
