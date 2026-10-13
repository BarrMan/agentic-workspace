import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { findCrossBranchDuplicateTaskIds, findLocalDuplicateTaskIds } from "../core/duplicate-task-detection.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { AmbiguousTaskIdError } from "../utils/task-path.ts";
import { createUniqueTestDir, initGitRepo, safeCleanup } from "./test-utils.ts";

let testDir: string;
let core: Core;

function makeTask(id: string, title: string): Task {
	return {
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2026-01-01",
		labels: [],
		dependencies: [],
		description: `${title} body`,
		rawContent: `## Description\n\n${title} body\n\nCustom content for ${title}.`,
	};
}

async function writeTask(directory: string, task: Task, container = task.id.toLowerCase()): Promise<string> {
	const path = join(directory, container, "task.md");
	await mkdir(join(directory, container), { recursive: true });
	await Bun.write(path, serializeTask(task));
	return path;
}

beforeEach(async () => {
	testDir = createUniqueTestDir("duplicate-task-detection");
	core = new Core(testDir);
	await core.filesystem.ensureBacklogStructure();
	await core.filesystem.saveConfig({
		projectName: "Duplicate detection",
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

describe("duplicate task diagnosis", () => {
	it("skips unreadable records while still detecting well-formed duplicates", async () => {
		await mkdir(join(core.filesystem.tasksDir, "task-7"), { recursive: true });
		await mkdir(join(core.filesystem.completedDir, "task-7"), { recursive: true });
		await Bun.write(join(core.filesystem.tasksDir, "task-7", "task.md"), serializeTask(makeTask("TASK-7", "Alpha")));
		await Bun.write(join(core.filesystem.completedDir, "task-7", "task.md"), serializeTask(makeTask("TASK-7", "Beta")));
		await mkdir(join(core.filesystem.completedDir, "task-99"), { recursive: true });
		await Bun.write(
			join(core.filesystem.completedDir, "task-99", "task.md"),
			"---\nid: TASK-99\ntitle: [broken\n---\n",
		);
		const warning = spyOn(console, "warn").mockImplementation(() => {});
		try {
			const groups = await findLocalDuplicateTaskIds(core);
			expect(groups.map(({ id }) => id)).toEqual(["TASK-7"]);
			expect(warning).toHaveBeenCalledWith(expect.stringContaining("backlog/completed/task-99/task.md"));
		} finally {
			warning.mockRestore();
		}
	});

	it("detects three-way duplicate claims while ignoring archive reuse", async () => {
		await writeTask(core.filesystem.tasksDir, makeTask("TASK-7", "Alpha"));
		await writeTask(core.filesystem.tasksDir, makeTask("TASK-7", "Beta"), "task-7 - Beta");
		await writeTask(core.filesystem.completedDir, makeTask("TASK-7", "Gamma"));
		await writeTask(core.filesystem.archiveTasksDir, makeTask("TASK-2", "Archived"));
		await writeTask(core.filesystem.tasksDir, makeTask("TASK-2", "Reused"));

		const groups = await findLocalDuplicateTaskIds(core);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.id).toBe("TASK-7");
		expect(groups[0]?.tasks).toHaveLength(3);
		expect(groups[0]?.tasks.map((task) => task.filePath)).toEqual([
			"backlog/completed/task-7/task.md",
			"backlog/tasks/task-7 - Beta/task.md",
			"backlog/tasks/task-7/task.md",
		]);
	});

	it("fails closed when an exact ID lookup matches active and completed files", async () => {
		await writeTask(core.filesystem.tasksDir, makeTask("TASK-7", "Active"));
		await writeTask(core.filesystem.completedDir, makeTask("TASK-7", "Completed"));
		await expect(core.filesystem.loadTask("TASK-7")).rejects.toBeInstanceOf(AmbiguousTaskIdError);
		try {
			await core.filesystem.loadTask("TASK-7");
		} catch (error) {
			const message = String(error).replaceAll("\\", "/");
			expect(message).toContain("backlog/tasks/task-7/task.md");
			expect(message).toContain("backlog/completed/task-7/task.md");
			expect(message).toContain("backlog doctor");
		}
	});

	it("detects frontmatter IDs that collide even when a container name differs", async () => {
		await writeTask(core.filesystem.tasksDir, makeTask("TASK-7", "Alpha"));
		await mkdir(join(core.filesystem.tasksDir, "task-2"), { recursive: true });
		await Bun.write(join(core.filesystem.tasksDir, "task-2", "task.md"), serializeTask(makeTask("TASK-7", "Misnamed")));
		const groups = await findLocalDuplicateTaskIds(core);
		expect(groups).toHaveLength(1);
		expect(groups[0]?.tasks).toHaveLength(2);
	});

	it("does not overwrite either file through the low-level save path when lookup is ambiguous", async () => {
		const alphaPath = await writeTask(core.filesystem.tasksDir, makeTask("TASK-7", "Alpha"));
		const betaPath = await writeTask(core.filesystem.completedDir, makeTask("TASK-7", "Beta"));
		const before = await Promise.all([alphaPath, betaPath].map(async (path) => await Bun.file(path).text()));
		await expect(core.filesystem.saveTask(makeTask("TASK-7", "Replacement"))).rejects.toBeInstanceOf(
			AmbiguousTaskIdError,
		);
		expect(await Promise.all([alphaPath, betaPath].map(async (path) => await Bun.file(path).text()))).toEqual(before);
	});

	it("reports path-distinct cross-branch collisions", async () => {
		initGitRepo(testDir, "main");
		const config = await core.filesystem.loadConfig();
		if (!config) throw new Error("Missing test config");
		config.checkActiveBranches = true;
		config.activeBranchDays = 30;
		config.remoteOperations = false;
		await core.filesystem.saveConfig(config);
		const alphaPath = await writeTask(core.filesystem.tasksDir, makeTask("TASK-1", "Alpha"));
		await $`git add .`.cwd(testDir).quiet();
		await $`git commit -m "main task"`.cwd(testDir).quiet();
		await $`git switch -c feature`.cwd(testDir).quiet();
		await unlink(alphaPath);
		await writeTask(core.filesystem.completedDir, makeTask("TASK-1", "Beta"));
		await $`git add -A`.cwd(testDir).quiet();
		await $`git commit -m "feature task"`.cwd(testDir).quiet();
		await $`git switch main`.cwd(testDir).quiet();

		const findings = await findCrossBranchDuplicateTaskIds(core);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.id).toBe("TASK-1");
		expect(findings[0]?.locations.map((location) => location.branch).sort()).toEqual(["feature", "main"]);
	});
});
