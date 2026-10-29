import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../index.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { Storage } from "../storage/storage.ts";
import { coreFileSystem, initializeFilesystemTestProject } from "./test-utils.ts";

const roots: string[] = [];
let root: string;
let core: Core;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "task-container-lifecycle-"));
	roots.push(root);
	core = new Core(root);
	await initializeFilesystemTestProject(core, "Lifecycle contract");
});

afterEach(async () => {
	for (const path of roots.splice(0)) await rm(path, { recursive: true, force: true });
});

function task(id: string, title: string, status = "To Do"): Task {
	return {
		id,
		title,
		status,
		done: false,
		createdDate: "2026-10-10",
		labels: [],
		dependencies: [],
		rawContent: "Lifecycle contract task",
	};
}

function container(location: string, id: string): string {
	return join(coreFileSystem(core).agenticWorkspaceDir, location, id.toLowerCase());
}

async function addArtifacts(id: string): Promise<void> {
	const artifacts = coreFileSystem(core).taskArtifacts;
	await artifacts.write(id, "design/plan.md", new TextEncoder().encode("the plan\n"));
	await artifacts.write(id, "evidence/result.bin", new Uint8Array([0, 12, 255, 3]));
}

async function expectArtifacts(id: string, location: string): Promise<void> {
	const repository = coreFileSystem(core).taskArtifacts;
	expect(new TextDecoder().decode(await repository.read(id, "design/plan.md", location as never))).toBe("the plan\n");
	expect(await repository.read(id, "evidence/result.bin", location as never)).toEqual(new Uint8Array([0, 12, 255, 3]));
}

describe("MAIN task-container lifecycle contract", () => {
	it("moves the complete task container into archive storage", async () => {
		await Storage.open(root).createTask(task("task-1", "Move me"));
		await addArtifacts("task-1");
		const source = container("tasks", "task-1");
		expect((await lstat(join(source, "task.md"))).isFile()).toBe(true);

		expect((await core.tasks.archive("task-1")).success).toBe(true);
		await expectArtifacts("task-1", "archive/tasks");
		expect(await Bun.file(join(source, "artifacts", "design", "plan.md")).exists()).toBe(false);
	});

	it("keeps the container stable on title changes and refuses an archive destination collision without merging or losing either container", async () => {
		await Storage.open(root).createTask(task("task-1", "Before"));
		await addArtifacts("task-1");
		const original = container("tasks", "task-1");
		await core.storage.withTaskLock(
			"task-1",
			async (current) => await core.tasks.edit({ ...current, title: "After rename" }),
		);
		expect(await readdir(original)).toContain("task.md");
		await expectArtifacts("task-1", "tasks");

		const target = container("archive/tasks", "task-1");
		await mkdir(join(target, "collision"), { recursive: true });
		await writeFile(join(target, "task.md"), serializeTask(task("TASK-1", "Existing archive target")));
		await writeFile(join(target, "collision", "target-only.txt"), "keep target");
		await expect(core.tasks.archive("task-1")).rejects.toThrow();
		expect(await readFile(join(original, "artifacts", "design", "plan.md"), "utf8")).toBe("the plan\n");
		expect(await readFile(join(target, "collision", "target-only.txt"), "utf8")).toBe("keep target");
	});

	it("deletes the task record and its complete container", async () => {
		await Storage.open(root).createTask(task("task-1", "Delete me"));
		await addArtifacts("task-1");
		const source = container("tasks", "task-1");
		expect((await core.tasks.delete("task-1")).success).toBe(true);
		await expect(lstat(source)).rejects.toMatchObject({ code: "ENOENT" });
	});
});
