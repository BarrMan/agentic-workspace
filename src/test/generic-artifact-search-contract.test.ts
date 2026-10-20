import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task, TaskSearchResult } from "../model/types.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const roots: string[] = [];

afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

describe("generic task artifact search contract", () => {
	it("searches ordinary UTF-8 artifacts without indexing filenames, metadata, or binary payloads", async () => {
		const root = createUniqueTestDir("generic-artifact-search");
		roots.push(root);
		const core = new Core(root);
		await initializeFilesystemTestProject(core, "Generic artifact search");
		const task: Task = {
			id: "TASK-1",
			title: "Unrelated task",
			status: "To Do",
			labels: [],
			dependencies: [],
			createdDate: "2026-10-10",
			description: "Task body is unrelated.",
			rawContent: "Task body is unrelated.",
		};
		await coreFileSystem(core).saveTask(task);

		const taskDirectory = await coreFileSystem(core).taskArtifacts.containerPath(task.id);
		const artifactsDirectory = join(taskDirectory, "artifacts");
		await mkdir(artifactsDirectory, { recursive: true });
		const artifactText = "uniqueordinaryartifactneedle";
		await writeFile(join(artifactsDirectory, "summary.md"), `${artifactText}\n`);
		await writeFile(join(artifactsDirectory, "notes.txt"), "plain text artifact content\n");
		await writeFile(join(artifactsDirectory, "notes"), "extensionless artifact content\n");
		await writeFile(join(artifactsDirectory, "payload.png"), Buffer.from("binarypayload\0notsearchtext", "utf8"));
		await writeFile(join(artifactsDirectory, ".artifacts.json"), JSON.stringify({ version: 1, approvals: {} }));

		const beforeTask = await readFile(join(taskDirectory, "task.md"), "utf8");
		const persistent = (await core.searchPersistently({ query: artifactText, types: ["task"] })).filter(
			(result): result is TaskSearchResult => result.type === "task",
		);
		expect(persistent.map(({ task: resultTask }) => resultTask.id)).toEqual([task.id]);
		expect((await core.queryTasks({ query: artifactText })).map(({ id }) => id)).toEqual([task.id]);
		for (const excluded of ["summary", "approvals", "binarypayload", "notsearchtext"]) {
			expect(await core.searchPersistently({ query: excluded, types: ["task"] })).toHaveLength(0);
			expect(await core.queryTasks({ query: excluded })).toHaveLength(0);
		}
		expect(await readFile(join(taskDirectory, "task.md"), "utf8")).toBe(beforeTask);
		expect(task).not.toHaveProperty("agentSummary");
	});
});
