import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { FileSystem } from "../storage/file-system.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem, createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const directories: string[] = [];

function task(id: string, title: string): Task {
	return { id, title, status: "To Do", assignee: [], labels: [], dependencies: [], createdDate: "2026-09-30" };
}

async function createProject(name: string): Promise<{ core: Core; filesystem: FileSystem }> {
	const root = createUniqueTestDir(name);
	directories.push(root);
	const core = new Core(root);
	await coreFileSystem(core).ensureAgenticWorkspaceStructure();
	await coreFileSystem(core).saveConfig({
		projectName: name,
		statuses: ["To Do", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
	});
	return { core, filesystem: new FileSystem(root) };
}

afterEach(async () => {
	await Promise.all(directories.splice(0).map(safeCleanup));
});

describe("persistent task reads", () => {
	it("reads disk changes on the next snapshot without retaining a corpus", async () => {
		const { core, filesystem } = await createProject("persistent-task-read");
		await filesystem.saveTask(task("TASK-1", "Before"));
		expect((await core.loadTaskSnapshot()).tasks.map((entry) => entry.title)).toEqual(["Before"]);

		await filesystem.saveTask(task("TASK-1", "After"));
		expect((await core.loadTaskSnapshot()).tasks.map((entry) => entry.title)).toEqual(["After"]);
	});

	it("reads distinct padded task identities from their own containers", async () => {
		const { core, filesystem } = await createProject("persistent-task-identity");
		await Bun.write(join(filesystem.tasksDir, "task-1", "task.md"), serializeTask(task("TASK-1", "First")));
		await Bun.write(join(filesystem.tasksDir, "task-01", "task.md"), serializeTask(task("TASK-01", "Second")));

		expect(await core.getTask("TASK-1")).toMatchObject({ id: "TASK-1", title: "First" });
		expect(await core.getTask("TASK-01")).toMatchObject({ id: "TASK-01", title: "Second" });
	});
});
