import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/agentic-workspace.ts";
import { createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

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
		configContent = `${await Bun.file(core.filesystem.configFilePath).text()}${["auto", "commit"].join("_")}: true\n`;
		await Bun.write(core.filesystem.configFilePath, configContent);
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
		expect(await Bun.file(core.filesystem.configFilePath).text()).toBe(configContent);
	}

	it("ignores unknown commit preferences without rewriting the config", async () => {
		const config = await core.filesystem.loadConfig();
		expect(config?.projectName).toBe("Manual Git");
		expect(Object.hasOwn(config ?? {}, ["auto", "Commit"].join(""))).toBe(false);
		await expectUserGitState();
	});

	it("persists task and draft transitions without committing or altering the index", async () => {
		const { task } = await core.createTaskFromInput({ title: "Task" });
		await core.updateTaskFromInput(task.id, { title: "Renamed", description: "Edited" });
		expect((await core.filesystem.loadTask(task.id))?.description).toBe("Edited");
		await core.moveTasksToStatus({ taskIds: [task.id], targetStatus: "In Progress" });
		expect((await core.filesystem.loadTask(task.id))?.status).toBe("In Progress");
		expect((await core.demoteTask(task.id)).success).toBe(true);
		const draft = (await core.filesystem.listDrafts())[0];
		expect(draft).toBeDefined();
		if (!draft) throw new Error("Expected a demoted draft");
		await core.updateDraft({ ...draft, title: "Edited draft" });
		expect(await core.promoteDraft(draft.id)).toBe(true);
		const promoted = (await core.filesystem.listTasks())[0];
		if (!promoted) throw new Error("Expected a promoted task");
		expect((await core.archiveTask(promoted.id)).success).toBe(true);
		expect((await core.deleteTask(promoted.id)).success).toBe(true);
		const disposable = await core.createTaskFromInput({ title: "Disposable" });
		expect((await core.deleteTask(disposable.task.id)).success).toBe(true);
		const completed = await core.createTaskFromInput({ title: "Finished", status: "Done" });
		expect(await core.completeTask(completed.task.id)).toBe(true);
		const archivedDraft = await core.createTaskFromInput({ title: "Archived draft", status: "Draft" });
		expect(await core.archiveDraft(archivedDraft.task.id)).toBe(true);
		await expectUserGitState();
	});

	it("persists documents and decisions without committing", async () => {
		const document = await core.createDocumentFromInput({ title: "Guide", content: "Original", path: "guides" });
		await core.updateDocumentFromInput({
			id: document.id,
			title: "Renamed guide",
			content: "Updated",
			path: "runbooks",
		});
		expect((await core.getDocument(document.id))?.path).toContain("runbooks/");
		const decision = await core.createDecisionWithTitle("Decision");
		await core.updateDecisionFromContent(decision.id, "---\ntitle: Updated decision\n---\nUpdated content\n");
		expect((await core.filesystem.loadDecision(decision.id))?.title).toBe("Updated decision");
		await expectUserGitState();
	});
});
