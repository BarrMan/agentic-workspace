import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import { coreFileSystem, createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

describe("manual Git control", () => {
	let directory: string;
	let core: Core;
	let configContent: string;
	let head: string;
	let index: string;

	beforeEach(async () => {
		directory = createUniqueTestDir("manual-git-control");
		initGitRepo(directory, "main");
		core = new Core(directory);
		await initializeTestProject(core, "Manual Git", true);
		configContent = `${await Bun.file(coreFileSystem(core).configFilePath).text()}${["auto", "commit"].join("_")}: true\n`;
		await Bun.write(coreFileSystem(core).configFilePath, configContent);
		await Bun.write(join(directory, "unrelated.txt"), "User-staged content\n");
		await $`git add unrelated.txt`.cwd(directory).quiet();
		head = await $`git rev-parse HEAD`.cwd(directory).text();
		index = await $`git ls-files -s`.cwd(directory).text();
	});

	afterEach(async () => {
		await safeCleanup(directory);
	});

	async function expectUserGitState(): Promise<void> {
		expect(await $`git rev-parse HEAD`.cwd(directory).text()).toBe(head);
		expect(await $`git ls-files -s`.cwd(directory).text()).toBe(index);
		expect(await Bun.file(coreFileSystem(core).configFilePath).text()).toBe(configContent);
	}

	it("ignores unknown commit preferences without rewriting the config", async () => {
		const config = await coreFileSystem(core).loadConfig();
		expect(config?.projectName).toBe("Manual Git");
		expect(Object.hasOwn(config ?? {}, ["auto", "Commit"].join(""))).toBe(false);
		await expectUserGitState();
	});

	it("persists task transitions without committing or altering the index", async () => {
		const { task } = await core.tasks.create({ title: "Task" });
		await core.storage.withTaskLock(
			task.id,
			async (current) => await core.tasks.edit({ ...current, title: "Renamed", description: "Edited" }),
		);
		expect((await coreFileSystem(core).loadTask(task.id))?.description).toBe("Edited");
		await core.moveTasksToStatus({ taskIds: [task.id], targetStatus: "In Progress" });
		expect((await coreFileSystem(core).loadTask(task.id))?.status).toBe("In Progress");
		expect((await core.tasks.archive(task.id)).success).toBe(true);
		expect((await core.tasks.delete(task.id, { includeArchived: true })).success).toBe(true);
		const disposable = await core.tasks.create({ title: "Disposable" });
		expect((await core.tasks.delete(disposable.task.id)).success).toBe(true);
		const completed = await core.tasks.create({ title: "Finished", status: "Done" });
		expect((await core.tasks.archive(completed.task.id)).success).toBe(true);
		await expectUserGitState();
	});
});
