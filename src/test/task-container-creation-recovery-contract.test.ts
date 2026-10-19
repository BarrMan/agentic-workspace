import { describe, expect, it } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

async function setup(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("task-container-creation-recovery");
	await mkdir(dir, { recursive: true });
	const core = new Core(dir);
	await initializeTestProject(core, "Task Container Recovery Contract");
	return { dir, core };
}

describe("task container creation recovery contract", () => {
	it("rolls back a failed task finalize and permits an unambiguous retry", async () => {
		const { dir, core } = await setup();
		try {
			const finalize = core.finalizeCreatedTask.bind(core);
			core.finalizeCreatedTask = async (_task) => {
				throw new Error("injected finalize failure");
			};
			await expect(core.createTaskFromInput({ title: "Recover task", status: "To Do" })).rejects.toThrow(
				"injected finalize failure",
			);
			const tasksDir = join(dir, "agentic-workspace", "tasks");
			const taskContainer = join(tasksDir, "task-1");
			expect(await Bun.file(join(taskContainer, "task.md")).exists()).toBe(false);
			expect((await readdir(tasksDir)).filter((entry) => entry === "task-1")).toEqual([]);

			core.finalizeCreatedTask = finalize;
			const { task } = await core.createTaskFromInput({ title: "Recover task", status: "To Do" });
			expect(task.id).toBe("TASK-2");
			expect((await coreFileSystem(core).listTasks()).filter((item) => item.id === task.id)).toHaveLength(1);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("skips an occupied task identity without merging its artifacts", async () => {
		const { dir, core } = await setup();
		try {
			const occupied = join(dir, "agentic-workspace", "tasks", "task-1");
			await mkdir(occupied, { recursive: true });
			await writeFile(join(occupied, "notes.txt"), "keep me");
			const { task } = await core.createTaskFromInput({ title: "Occupied", status: "To Do" });
			expect(task.id).toBe("TASK-2");
			expect(await readFile(join(occupied, "notes.txt"), "utf8")).toBe("keep me");
			expect(await Bun.file(join(occupied, "task.md")).exists()).toBe(false);
			expect(await Bun.file(join(dir, "agentic-workspace", "tasks", "task-2", "task.md")).exists()).toBe(true);
		} finally {
			await safeCleanup(dir);
		}
	});
});
