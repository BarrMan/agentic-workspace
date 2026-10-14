import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../index.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { initializeFilesystemTestProject } from "./test-utils.ts";

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
		assignee: [],
		createdDate: "2026-10-10",
		labels: [],
		dependencies: [],
		rawContent: "Lifecycle contract task",
	};
}

function container(location: string, id: string): string {
	return join(root, "agentic-workspace", location, id.toLowerCase());
}

async function addArtifacts(id: string): Promise<void> {
	const artifacts = core.filesystem.taskArtifacts;
	await artifacts.write(id, "design/plan.md", new TextEncoder().encode("the plan\n"));
	const plan = await artifacts.read(id, "design/plan.md");
	await artifacts.approveCurrentVersion(id, "design/plan.md", plan.status.sha256!);
	await artifacts.write(id, "evidence/result.bin", new Uint8Array([0, 12, 255, 3]));
}

async function expectArtifacts(id: string, location: string): Promise<void> {
	const repository = core.filesystem.taskArtifacts;
	const plan = await repository.read(id, "design/plan.md", location as never);
	expect(new TextDecoder().decode(plan.bytes)).toBe("the plan\n");
	expect(plan.status.state).toBe("approved");
	expect((await repository.read(id, "evidence/result.bin", location as never)).bytes).toEqual(
		new Uint8Array([0, 12, 255, 3]),
	);
}

describe("MAIN task-container lifecycle contract", () => {
	it("moves the complete task container through archive and completed storage", async () => {
		await core.createTask(task("task-1", "Move me"));
		await addArtifacts("task-1");
		const source = container("tasks", "task-1");
		expect((await lstat(join(source, "task.md"))).isFile()).toBe(true);

		expect((await core.archiveTask("task-1")).success).toBe(true);
		await expectArtifacts("task-1", "archive/tasks");
		expect(await Bun.file(join(source, "design", "plan.md")).exists()).toBe(false);

		await core.updateTaskFromInput("task-1", { status: "Done" });
		expect(await core.completeTask("task-1")).toBe(true);
		await expectArtifacts("task-1", "completed");
		expect(await Bun.file(join(container("archive/tasks", "task-1"), "design", "plan.md")).exists()).toBe(false);
	});

	it("promotes and demotes by moving the whole container while preserving artifact-relative paths and approvals", async () => {
		const { task: draft } = await core.createTaskFromInput({
			title: "Draft container",
			status: "Draft",
			rawContent: "draft",
		});
		await addArtifacts(draft.id);
		const draftContainer = container("drafts", draft.id);
		expect(await core.promoteDraft(draft.id)).toBe(true);
		const promoted = (await core.filesystem.listTasks()).find((item) => item.title === "Draft container");
		expect(promoted).toBeDefined();
		if (!promoted) return;
		await expectArtifacts(promoted.id, "tasks");
		expect(await Bun.file(join(draftContainer, "design", "plan.md")).exists()).toBe(false);

		expect((await core.demoteTask(promoted.id)).success).toBe(true);
		const demoted = (await core.filesystem.listDrafts()).find((item) => item.title === "Draft container");
		expect(demoted).toBeDefined();
		if (demoted) await expectArtifacts(demoted.id, "drafts");
	});

	it("keeps the container stable on title changes and refuses an archive destination collision without merging or losing either container", async () => {
		await core.createTask(task("task-1", "Before"));
		await addArtifacts("task-1");
		const original = container("tasks", "task-1");
		await core.updateTaskFromInput("task-1", { title: "After rename" });
		expect(await readdir(original)).toContain("task.md");
		await expectArtifacts("task-1", "tasks");

		const target = container("archive/tasks", "task-1");
		await mkdir(join(target, "collision"), { recursive: true });
		await writeFile(join(target, "task.md"), serializeTask(task("TASK-1", "Existing archive target")));
		await writeFile(join(target, "collision", "target-only.txt"), "keep target");
		await expect(core.archiveTask("task-1")).rejects.toThrow();
		expect(await readFile(join(original, "design", "plan.md"), "utf8")).toBe("the plan\n");
		expect(await readFile(join(target, "collision", "target-only.txt"), "utf8")).toBe("keep target");
	});

	it("carries artifacts through demotion and promotion IDs without leaking them when the vacated task ID is reused", async () => {
		await core.createTask(task("task-2", "Keep sequence ahead"));
		await core.createTask(task("task-1", "Change identity"));
		await addArtifacts("task-1");
		expect((await core.demoteTask("task-1")).success).toBe(true);
		const draft = (await core.filesystem.listDrafts()).find((item) => item.title === "Change identity");
		expect(draft).toBeDefined();
		if (!draft) return;
		await expectArtifacts(draft.id, "drafts");
		expect(await core.promoteDraft(draft.id)).toBe(true);
		const promoted = (await core.filesystem.listTasks()).find((item) => item.title === "Change identity");
		expect(promoted).toBeDefined();
		if (!promoted) return;
		await expectArtifacts(promoted.id, "tasks");

		await core.createTask(task("task-1", "Reused old ID"));
		const repository = core.filesystem.taskArtifacts;
		expect((await repository.list("task-1")).map(({ path }) => path)).toEqual([]);
	});

	it("deletes the task record and its complete container", async () => {
		await core.createTask(task("task-1", "Delete me"));
		await addArtifacts("task-1");
		const source = container("tasks", "task-1");
		expect((await core.deleteTask("task-1")).success).toBe(true);
		await expect(lstat(source)).rejects.toMatchObject({ code: "ENOENT" });
	});
});
