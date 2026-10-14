import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { findLocalDuplicateTaskIds } from "../core/duplicate-task-detection.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let testDir: string;
let core: Core;

function task(id: string, title: string): Task {
	return {
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
		description: `${title} description`,
		rawContent: `## Description\n\n${title} description\n\nKeep this body intact.`,
	};
}

async function put(path: string, content: string): Promise<void> {
	await mkdir(join(path, ".."), { recursive: true });
	await Bun.write(path, content);
}

beforeEach(async () => {
	testDir = createUniqueTestDir("container-duplicate-detection-contract");
	core = new Core(testDir);
	await core.filesystem.ensureAgenticWorkspaceStructure();
	await core.filesystem.saveConfig({
		projectName: "Container duplicate detection",
		statuses: ["To Do", "In Progress", "Done"],
		labels: [],
		milestones: [],
		dateFormat: "YYYY-MM-DD",
		remoteOperations: false,
		checkActiveBranches: false,
	});
});

afterEach(async () => {
	await safeCleanup(testDir);
});

describe("container duplicate detection contract", () => {
	it("detects duplicate canonical containers without altering their contents", async () => {
		const firstTask = join(core.filesystem.tasksDir, "task-7", "task.md");
		const secondTask = join(core.filesystem.completedDir, "task-7", "task.md");
		await put(firstTask, serializeTask(task("TASK-7", "First container")));
		await put(secondTask, serializeTask(task("TASK-7", "Second container")));

		const groups = await findLocalDuplicateTaskIds(core);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.id).toBe("TASK-7");
		expect(groups[0]?.tasks.map(({ title }) => title).sort()).toEqual(["First container", "Second container"]);
		expect(await Bun.file(firstTask).text()).toContain("id: TASK-7");
		expect(await Bun.file(secondTask).text()).toContain("id: TASK-7");
	});
});
