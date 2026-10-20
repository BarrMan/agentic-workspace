import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { findLocalDuplicateTaskIds } from "../controller/duplicate-task-detection.ts";
import { AmbiguousTaskIdError } from "../model/errors/task-id.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem, createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let testDir: string;
let core: Core;

function makeTask(id: string, title: string): Task {
	return {
		id,
		title,
		status: "To Do",
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
		description: `${title} body`,
		rawContent: `## Description\n\n${title} body\n\nCustom content for ${title}.`,
	};
}

async function writeTask(directory: string, task: Task, container = task.id.toLowerCase()): Promise<string> {
	const path = join(directory, container, "task.md");
	await mkdir(join(directory, container), { recursive: true });
	await Bun.write(path, serializeTask(task));
	return path;
}

beforeEach(async () => {
	testDir = createUniqueTestDir("duplicate-task-detection");
	core = new Core(testDir);
	await coreFileSystem(core).ensureAgenticWorkspaceStructure();
	await coreFileSystem(core).saveConfig({
		projectName: "Duplicate detection",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
	});
});

afterEach(async () => {
	await safeCleanup(testDir);
});

describe("duplicate task diagnosis", () => {
	it("skips unreadable records while still detecting well-formed duplicates", async () => {
		await mkdir(join(coreFileSystem(core).tasksDir, "task-7"), { recursive: true });
		await mkdir(join(coreFileSystem(core).completedDir, "task-7"), { recursive: true });
		await Bun.write(
			join(coreFileSystem(core).tasksDir, "task-7", "task.md"),
			serializeTask(makeTask("TASK-7", "Alpha")),
		);
		await Bun.write(
			join(coreFileSystem(core).completedDir, "task-7", "task.md"),
			serializeTask(makeTask("TASK-7", "Beta")),
		);
		await mkdir(join(coreFileSystem(core).completedDir, "task-99"), { recursive: true });
		await Bun.write(
			join(coreFileSystem(core).completedDir, "task-99", "task.md"),
			"---\nid: TASK-99\ntitle: [broken\n---\n",
		);
		const warning = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const groups = await findLocalDuplicateTaskIds(core);
			expect(groups.map(({ id }) => id)).toEqual(["TASK-7"]);
			expect(warning).toHaveBeenCalledWith(expect.stringContaining("agentic-workspace/completed/task-99/task.md"));
		} finally {
			warning.mockRestore();
		}
	});

	it("detects three-way duplicate claims while ignoring archive reuse", async () => {
		await writeTask(coreFileSystem(core).tasksDir, makeTask("TASK-7", "Alpha"));
		await writeTask(coreFileSystem(core).tasksDir, makeTask("TASK-7", "Beta"), "task-7 - Beta");
		await writeTask(coreFileSystem(core).completedDir, makeTask("TASK-7", "Gamma"));
		await writeTask(coreFileSystem(core).archiveTasksDir, makeTask("TASK-2", "Archived"));
		await writeTask(coreFileSystem(core).tasksDir, makeTask("TASK-2", "Reused"));

		const groups = await findLocalDuplicateTaskIds(core);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.id).toBe("TASK-7");
		expect(groups[0]?.tasks).toHaveLength(3);
		expect(groups[0]?.tasks.map((task) => task.filePath)).toEqual([
			"agentic-workspace/completed/task-7/task.md",
			"agentic-workspace/tasks/task-7 - Beta/task.md",
			"agentic-workspace/tasks/task-7/task.md",
		]);
	});

	it("fails closed when an exact ID lookup matches active and completed files", async () => {
		await writeTask(coreFileSystem(core).tasksDir, makeTask("TASK-7", "Active"));
		await writeTask(coreFileSystem(core).completedDir, makeTask("TASK-7", "Completed"));
		await expect(coreFileSystem(core).loadTask("TASK-7")).rejects.toBeInstanceOf(AmbiguousTaskIdError);
		try {
			await coreFileSystem(core).loadTask("TASK-7");
		} catch (error) {
			const message = String(error).replaceAll("\\", "/");
			expect(message).toContain("agentic-workspace/tasks/task-7/task.md");
			expect(message).toContain("agentic-workspace/completed/task-7/task.md");
			expect(message).toContain("Remove the conflicting files, then retry.");
		}
	});

	it("detects frontmatter IDs that collide even when a container name differs", async () => {
		await writeTask(coreFileSystem(core).tasksDir, makeTask("TASK-7", "Alpha"));
		await mkdir(join(coreFileSystem(core).tasksDir, "task-2"), { recursive: true });
		await Bun.write(
			join(coreFileSystem(core).tasksDir, "task-2", "task.md"),
			serializeTask(makeTask("TASK-7", "Misnamed")),
		);
		const groups = await findLocalDuplicateTaskIds(core);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.tasks).toHaveLength(2);
	});

	it("does not overwrite either file through the low-level save path when lookup is ambiguous", async () => {
		const alphaPath = await writeTask(coreFileSystem(core).tasksDir, makeTask("TASK-7", "Alpha"));
		const betaPath = await writeTask(coreFileSystem(core).completedDir, makeTask("TASK-7", "Beta"));
		const before = await Promise.all([alphaPath, betaPath].map(async (path) => await Bun.file(path).text()));
		await expect(coreFileSystem(core).saveTask(makeTask("TASK-7", "Replacement"))).rejects.toBeInstanceOf(
			AmbiguousTaskIdError,
		);
		expect(await Promise.all([alphaPath, betaPath].map(async (path) => await Bun.file(path).text()))).toEqual(before);
	});

	it("checks duplicates on create but skips the collection scan for canonical updates", async () => {
		await writeTask(coreFileSystem(core).tasksDir, makeTask("TASK-7", "Active"));
		await writeTask(coreFileSystem(core).completedDir, makeTask("TASK-7", "Completed"));
		await expect(coreFileSystem(core).saveTask(makeTask("TASK-7", "Replacement"))).rejects.toBeInstanceOf(
			AmbiguousTaskIdError,
		);

		const taskPath = await coreFileSystem(core).saveTask(makeTask("TASK-8", "Update target"));
		const filesystem = coreFileSystem(core);
		const listTasks = spyOn(filesystem, "listTasks");
		const listCompletedTasks = spyOn(filesystem, "listCompletedTasks");
		try {
			await filesystem.saveTask({ ...makeTask("TASK-8", "Updated"), filePath: taskPath });
			expect(listTasks).not.toHaveBeenCalled();
			expect(listCompletedTasks).not.toHaveBeenCalled();
		} finally {
			listTasks.mockRestore();
			listCompletedTasks.mockRestore();
		}
	});
});
