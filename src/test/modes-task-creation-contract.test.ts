import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Task } from "../model/types.ts";
import { FileSystem } from "../storage/file-system.ts";
import { initializeFilesystemTestWorkspace } from "./test-utils.ts";

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function project(prefix: string): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), `${prefix}-`));
	roots.push(root);
	return root;
}

function task(id: string, title: string): Task {
	return {
		id,
		title,
		status: "To Do",
		done: false,
		createdDate: "2026-10-10",
		labels: [],
		dependencies: [],
	};
}

describe("BACK-23 canonical task creation contract", () => {
	it("creates a lowercase-ID task container with required artifact storage, without runtime state", async () => {
		const root = await project("mode-task-create");
		const filesystem = new FileSystem(root);
		await initializeFilesystemTestWorkspace(filesystem);

		const savedPath = await filesystem.saveTask(task("BACK-23", "Canonical task"), { create: true });
		const container = join(filesystem.tasksDir, "back-23");
		expect(savedPath).toBe(join(container, "task.md"));
		expect((await readdir(container)).sort()).toEqual(["artifacts", "task.md"]);
		expect((await filesystem.listTasks()).map(({ id }) => id)).toEqual(["BACK-23"]);
		expect(await Bun.file(join(container, ".artifacts.json")).exists()).toBe(false);
		expect(await Bun.file(join(container, "spec.md")).exists()).toBe(false);
		expect(await Bun.file(join(filesystem.agenticWorkspaceDir, "sessions")).exists()).toBe(false);
	});

	it("updates task content in its stable container without merging or removing sibling artifacts", async () => {
		const root = await project("mode-task-update");
		const filesystem = new FileSystem(root);
		await initializeFilesystemTestWorkspace(filesystem);
		const originalPath = await filesystem.saveTask(task("BACK-23", "Before rename"), { create: true });
		const artifactPath = join(filesystem.tasksDir, "back-23", "notes", "kept.md");
		await Bun.write(artifactPath, "existing artifact");

		const updatedPath = await filesystem.saveTask({ ...task("BACK-23", "After rename"), filePath: originalPath });
		expect(updatedPath).toBe(originalPath);
		expect((await filesystem.loadTask("BACK-23"))?.title).toBe("After rename");
		expect(await readFile(artifactPath, "utf8")).toBe("existing artifact");
		expect(await Bun.file(join(filesystem.tasksDir, "back-23", ".artifacts.json")).exists()).toBe(false);
	});

	it("rejects occupied containers without a task and updates matching IDs without merging artifacts", async () => {
		const root = await project("mode-task-collision");
		const filesystem = new FileSystem(root);
		await initializeFilesystemTestWorkspace(filesystem);
		const occupiedContainer = join(filesystem.tasksDir, "back-23");
		const occupiedArtifact = join(occupiedContainer, "plan.md");
		await mkdir(occupiedContainer, { recursive: true });
		await Bun.write(occupiedArtifact, "do not merge");

		await expect(filesystem.saveTask(task("BACK-23", "Replacement"), { create: true })).rejects.toThrow(
			/already in use|already exists/i,
		);
		expect(await readFile(occupiedArtifact, "utf8")).toBe("do not merge");

		const taskPath = await filesystem.saveTask(task("BACK-24", "Original"), { create: true });
		const artifactPath = join(filesystem.tasksDir, "back-24", "plan.md");
		await Bun.write(artifactPath, "keep during update");
		const updatedPath = await filesystem.saveTask({ ...task("BACK-24", "Replacement"), filePath: taskPath });
		expect(updatedPath).toBe(taskPath);
		expect((await filesystem.loadTask("BACK-24"))?.title).toBe("Replacement");
		expect(await readFile(artifactPath, "utf8")).toBe("keep during update");
		expect(await readFile(taskPath, "utf8")).toContain("Replacement");
	});

	it("creates tasks under the explicitly configured agentic-workspace root", async () => {
		const root = await project("mode-task-configured-root");
		const filesystem = new FileSystem(root, {
			agenticWorkspaceDirectory: "work/agentic-workspace",
			configLocation: "folder",
		});
		await initializeFilesystemTestWorkspace(filesystem);

		const savedPath = await filesystem.saveTask(task("BACK-23", "Configured root task"), { create: true });
		expect(savedPath).toBe(join(await realpath(root), "work", "agentic-workspace", "tasks", "back-23", "task.md"));
		expect((await filesystem.listTasks()).map(({ title }) => title)).toEqual(["Configured root task"]);
		expect(await Bun.file(join(root, ".agentic-workspace", "tasks", "back-23", "task.md")).exists()).toBe(false);
	});
});
