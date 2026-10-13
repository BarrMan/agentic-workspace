import { describe, expect, it } from "bun:test";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

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
			core.finalizeCreatedTask = async (_task, _isDraft) => {
				throw new Error("injected finalize failure");
			};
			await expect(core.createTaskFromInput({ title: "Recover task", status: "To Do" })).rejects.toThrow(
				"injected finalize failure",
			);
			const tasksDir = join(dir, "backlog", "tasks");
			const taskContainer = join(tasksDir, "task-1");
			expect(await Bun.file(join(taskContainer, "task.md")).exists()).toBe(false);
			expect((await readdir(tasksDir)).filter((entry) => entry === "task-1")).toEqual([]);

			core.finalizeCreatedTask = finalize;
			const { task } = await core.createTaskFromInput({ title: "Recover task", status: "To Do" });
			expect(task.id).toBe("TASK-1");
			expect((await core.filesystem.listTasks()).filter((item) => item.id === task.id)).toHaveLength(1);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("preserves concurrent user artifacts when a draft finalize fails", async () => {
		const { dir, core } = await setup();
		try {
			core.finalizeCreatedTask = async (_task, _isDraft) => {
				const container = join(dir, "backlog", "drafts", "draft-1");
				await writeFile(join(container, "notes.txt"), "user-owned bytes");
				throw new Error("injected finalize failure");
			};
			await expect(core.createTaskFromInput({ title: "Recover draft", status: "Draft" })).rejects.toThrow(
				"injected finalize failure",
			);
			const container = join(dir, "backlog", "drafts", "draft-1");
			expect(await Bun.file(join(container, "task.md")).exists()).toBe(false);
			expect(await readFile(join(container, "notes.txt"), "utf8")).toBe("user-owned bytes");
			expect(await readdir(container)).toEqual(["notes.txt"]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("refuses to merge into an occupied task identity", async () => {
		const { dir, core } = await setup();
		try {
			const occupied = join(dir, "backlog", "tasks", "task-1");
			await mkdir(occupied, { recursive: true });
			await writeFile(join(occupied, "notes.txt"), "keep me");
			await expect(core.createTaskFromInput({ title: "Occupied", status: "To Do" })).rejects.toThrow(
				/already exists|refusing to merge/i,
			);
			expect(await readFile(join(occupied, "notes.txt"), "utf8")).toBe("keep me");
			expect(await Bun.file(join(occupied, "task.md")).exists()).toBe(false);
		} finally {
			await safeCleanup(dir);
		}
	});
});
