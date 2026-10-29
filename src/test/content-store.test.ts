import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { FileSystem } from "../storage/file-system.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestWorkspace, safeCleanup } from "./test-utils.ts";

const directories: string[] = [];
const cores: Core[] = [];

function task(id: string, title: string): Task {
	return { id, title, status: "To Do", done: false, labels: [], dependencies: [], createdDate: "2026-09-30" };
}

async function createProject(name: string): Promise<{ core: Core; filesystem: FileSystem }> {
	const root = createUniqueTestDir(name);
	directories.push(root);
	const core = new Core(root);
	cores.push(core);
	await initializeFilesystemTestWorkspace(coreFileSystem(core));
	await coreFileSystem(core).saveConfig({
		projectName: name,
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
	});
	return { core, filesystem: new FileSystem(root) };
}

afterEach(async () => {
	for (const core of cores.splice(0)) core.tasks.dispose();
	await Promise.all(directories.splice(0).map(safeCleanup));
});

describe("persistent task reads", () => {
	it("reads the initialized task corpus and applies external changes", async () => {
		const { core, filesystem } = await createProject("task-reads");
		const filePath = await filesystem.saveTask(task("TASK-1", "Before"), { create: true });
		await core.tasks.init();
		expect(core.tasks.getActiveTasks().map((entry) => entry.title)).toEqual(["Before"]);

		await filesystem.saveTask({ ...task("TASK-1", "After"), filePath });
		for (let attempt = 0; attempt < 500 && core.tasks.getActiveTasks()[0]?.title !== "After"; attempt++)
			await Bun.sleep(2);
		expect(core.tasks.getActiveTasks().map((entry) => entry.title)).toEqual(["After"]);
	});

	it("reads distinct padded task identities from their own containers", async () => {
		const { core, filesystem } = await createProject("persistent-task-identity");
		await Bun.write(join(filesystem.tasksDir, "task-1", "task.md"), serializeTask(task("TASK-1", "First")));
		await Bun.write(join(filesystem.tasksDir, "task-01", "task.md"), serializeTask(task("TASK-01", "Second")));
		await core.tasks.init();

		expect(await core.tasks.getTask("TASK-1")).toMatchObject({ id: "TASK-1", title: "First" });
		expect(await core.tasks.getTask("TASK-01")).toMatchObject({ id: "TASK-01", title: "Second" });
	});
});
