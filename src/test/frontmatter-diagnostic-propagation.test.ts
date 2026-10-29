import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Milestone, Task } from "../model/types.ts";
import {
	UnsupportedRecordFrontmatterSchemaError,
	UnsupportedTaskFrontmatterSchemaError,
} from "../storage/errors/frontmatter.ts";
import { serializeMilestone, serializeTask } from "../storage/markdown/serializer.ts";
import { MilestoneStore } from "../storage/milestones.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const task: Task = {
	id: "TASK-1",
	title: "Task",
	status: "To Do",
	done: false,
	createdDate: "2026-09-30",
	labels: [],
	dependencies: [],
	rawContent: "",
};
const milestone: Milestone = { id: "m-1", title: "Milestone", description: "", rawContent: "" };
function unsupported(content: string, schema: string): string {
	return content.replace(new RegExp(`${schema}: \\d+`), `${schema}: 99`);
}

describe("frontmatter diagnostic propagation", () => {
	it("propagates unsupported milestone schema diagnostics through list and load", async () => {
		const root = await mkdtemp(join(tmpdir(), "agentic-workspace-milestone-diagnostics-"));
		const active = join(root, "active");
		try {
			await mkdir(active);
			const store = new MilestoneStore({
				activeDirectory: async () => active,
				archiveDirectory: async () => join(root, "archive"),
				ensureDirectory: async () => {},
				withCreateLock: async (operation) => await operation(),
			});
			await Bun.write(
				join(active, "m-1 - Milestone.md"),
				unsupported(serializeMilestone(milestone), "milestone_schema_version"),
			);
			await expect(store.listActive()).rejects.toBeInstanceOf(UnsupportedRecordFrontmatterSchemaError);
			await expect(store.load("m-1")).rejects.toBeInstanceOf(UnsupportedRecordFrontmatterSchemaError);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("task frontmatter diagnostic propagation", () => {
	let testDirectory: string;
	let core: Core;

	beforeEach(async () => {
		testDirectory = createUniqueTestDir("task-diagnostics");
		await mkdir(testDirectory, { recursive: true });
		core = new Core(testDirectory);
		await initializeFilesystemTestProject(core, "Task diagnostics");
	});

	afterEach(async () => {
		await safeCleanup(testDirectory);
	});

	it("skips unsupported task schema in local list but keeps single-task load strict", async () => {
		const taskPath = join(coreFileSystem(core).tasksDir, "task-1", "task.md");
		await Bun.write(taskPath, unsupported(serializeTask(task), "task_schema_version"));
		const warning = spyOn(console, "warn").mockImplementation(() => {});
		try {
			expect(await coreFileSystem(core).listTasks()).toEqual([]);
			expect(warning).toHaveBeenCalledTimes(1);
			expect(warning.mock.calls[0]?.[0]).toBe(
				`Warning: Skipping unparseable task file ${taskPath}: Task TASK-1 uses unsupported task frontmatter schema version 99.`,
			);
		} finally {
			warning.mockRestore();
		}
		await expect(coreFileSystem(core).loadTask("TASK-1")).rejects.toBeInstanceOf(UnsupportedTaskFrontmatterSchemaError);
	});
});
