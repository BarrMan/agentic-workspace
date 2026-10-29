import { describe, expect, it, spyOn } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { Storage } from "../storage/storage.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

async function setup(): Promise<{ dir: string; core: Core; storage: Storage }> {
	const dir = createUniqueTestDir("task-container-creation-recovery");
	await mkdir(dir, { recursive: true });
	const storage = Storage.open(dir);
	const core = new Core(dir, { storage });
	await initializeTestProject(core, "Task Container Recovery Contract");
	return { dir, core, storage };
}

describe("task container creation recovery contract", () => {
	it("rolls back a failed post-create read and permits an unambiguous retry", async () => {
		const { dir, core, storage } = await setup();
		const load = spyOn(storage, "loadTask").mockRejectedValueOnce(new Error("injected post-create read failure"));
		try {
			await expect(core.tasks.create({ title: "Recover task", status: "To Do" })).rejects.toThrow(
				"injected post-create read failure",
			);
			const tasksDir = coreFileSystem(core).tasksDir;
			const taskContainer = join(tasksDir, "task-1");
			expect(await Bun.file(join(taskContainer, "task.md")).exists()).toBe(false);
			expect((await readdir(tasksDir)).filter((entry) => entry === "task-1")).toEqual([]);

			load.mockRestore();
			const { task } = await core.tasks.create({ title: "Recover task", status: "To Do" });
			expect(task.id).toBe("TASK-2");
			expect((await coreFileSystem(core).listTasks()).filter((item) => item.id === task.id)).toHaveLength(1);
		} finally {
			load.mockRestore();
			await safeCleanup(dir);
		}
	});

	it("retains a committed task when recovery receipt preparation fails", async () => {
		const { dir, core, storage } = await setup();
		const receipt = spyOn(storage, "prepareCreatedTaskWrite").mockRejectedValue(new Error("injected receipt failure"));
		try {
			await expect(core.tasks.create({ title: "Retained task", status: "To Do" })).rejects.toThrow(
				"injected receipt failure",
			);
			expect(await Bun.file(join(coreFileSystem(core).tasksDir, "task-1", "task.md")).exists()).toBe(true);
		} finally {
			receipt.mockRestore();
			await safeCleanup(dir);
		}
	});

	it("skips an occupied task identity without merging its artifacts", async () => {
		const { dir, core } = await setup();
		try {
			const occupied = join(coreFileSystem(core).tasksDir, "task-1");
			await mkdir(occupied, { recursive: true });
			await writeFile(join(occupied, "notes.txt"), "keep me");
			const { task } = await core.tasks.create({ title: "Occupied", status: "To Do" });
			expect(task.id).toBe("TASK-2");
			expect(await readFile(join(occupied, "notes.txt"), "utf8")).toBe("keep me");
			expect(await Bun.file(join(occupied, "task.md")).exists()).toBe(false);
			expect(await Bun.file(join(coreFileSystem(core).tasksDir, "task-2", "task.md")).exists()).toBe(true);
		} finally {
			await safeCleanup(dir);
		}
	});
});
