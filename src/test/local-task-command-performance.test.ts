import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { Storage } from "../storage/storage.ts";
import {
	coreFileSystem,
	createUniqueTestDir,
	initGitRepo,
	initializeTestProject,
	safeCleanup,
	waitUntil,
} from "./test-utils.ts";

async function cli(args: string[], cwd: string) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const out = new Writable({
		write: (chunk, _encoding, done) => {
			stdout.push(chunk.toString());
			done();
		},
	});
	const err = new Writable({
		write: (chunk, _encoding, done) => {
			stderr.push(chunk.toString());
			done();
		},
	});
	const exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

const parentTask: Task = {
	id: "TASK-1",
	title: "Fast local task",
	status: "To Do",
	done: false,
	createdDate: "2026-08-10",
	labels: ["local"],
	dependencies: [],
	description: "Contains the distinctive local-search-token.",
};

/**
 * Builds a fresh working copy with the local-task fixture. Each case owns its own project because
 * every one of them archives, completes, demotes, or edits the same IDs.
 */
async function setupLocalTaskProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("local-task-command-performance");
	await mkdir(dir, { recursive: true });
	initGitRepo(dir, "main");
	const core = new Core(dir);
	await initializeTestProject(core, "Local task command performance");

	const config = await coreFileSystem(core).loadConfig();
	if (!config) throw new Error("Expected initialized config");
	await coreFileSystem(core).saveConfig({
		...config,
		remoteOperations: true,
	});

	await Storage.open(core.projectRoot).createTask({ ...parentTask });
	await Storage.open(core.projectRoot).createTask({
		...parentTask,
		id: "TASK-1.1",
		title: "Local child",
		parentTaskId: parentTask.id,
		description: "Child content",
	});
	await Storage.open(core.projectRoot).createTask({
		...parentTask,
		id: "TASK-2",
		title: "Unrelated local task",
		description: "No matching search content",
	});
	await core.tasks.init();

	return { dir, core };
}

// Every case owns an isolated working copy.
describe("local task command performance boundaries", () => {
	it("lists and searches working-copy tasks without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await Storage.open(core.projectRoot).createTask({
				...parentTask,
				id: "TASK-0007.0024",
				title: "Padded task identity",
				description: "No matching search content",
			});
			await waitUntil(
				() => core.tasks.getActiveTasks().some((task) => task.id === "TASK-0007.0024"),
				"padded task entering the loaded corpus",
			);
			const listed = await core.tasks.query({});
			const searched = await core.tasks.query({
				query: "local-search-token",
			});
			const searchedByPaddedSegment = await core.tasks.query({
				query: "7",
			});

			expect(listed.map((task) => task.id).sort()).toEqual(["TASK-0007.0024", "TASK-1", "TASK-1.1", "TASK-2"]);
			expect(searched.map((task) => task.id)).toEqual(["TASK-1"]);
			expect(searchedByPaddedSegment.map((task) => task.id)).toContain("TASK-0007.0024");
		} finally {
			core.tasks.dispose();
			await safeCleanup(dir);
		}
	});

	it("loads one task and its subtasks without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			const loaded = await core.tasks.getTask(parentTask.id, {});
			const withSubtasks = await core.getTaskWithSubtasks(parentTask.id, undefined, {});

			expect(loaded?.title).toBe(parentTask.title);
			expect(withSubtasks?.subtaskSummaries).toEqual([{ id: "TASK-1.1", title: "Local child" }]);
		} finally {
			core.tasks.dispose();
			await safeCleanup(dir);
		}
	});

	it("archives and completes working-copy tasks without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			expect((await core.tasks.archive("TASK-1", {})).success).toBe(true);
			expect((await core.tasks.archive("TASK-1.1", {})).success).toBe(true);
		} finally {
			core.tasks.dispose();
			await safeCleanup(dir);
		}
	});

	it("keeps supported CLI reads and edits scoped to the working copy", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await $`git add .`.cwd(dir).quiet();
			await $`git commit -m ${"Commit working copy"}`.cwd(dir).quiet();
			await $`git switch -c branch-only`.cwd(dir).quiet();
			await Storage.open(core.projectRoot).createTask({
				...parentTask,
				id: "TASK-99",
				title: "Branch-only task",
			});
			await $`git add .`.cwd(dir).quiet();
			await $`git commit -m ${"Commit branch-only task"}`.cwd(dir).quiet();
			await $`git switch main`.cwd(dir).quiet();

			// TASK-99 exists only on another branch, so every command below must miss it locally.
			const view = await cli(["task", "view", "TASK-99", "--plain"], dir);
			const edit = await cli(["task", "edit", "TASK-99", "--title", "Must remain absent"], dir);
			const listed = await cli(["task", "list", "--plain"], dir);

			const outputOf = (result: { stdout: string; stderr: string }) => `${result.stdout}${result.stderr}`;
			// Every local miss names the working copy as the corpus it searched, so a task parked on
			// another branch reads as scope rather than as a missing task.
			for (const result of [view, edit]) {
				expect(result.exitCode).not.toBe(0);
			}
			for (const result of [view, edit]) {
				expect(outputOf(result)).toContain("Task TASK-99 not found.");
			}
			expect(listed.exitCode).toBe(0);
			expect(listed.stdout).not.toContain("TASK-99");

			expect(await coreFileSystem(core).loadTask("TASK-99")).toBeNull();
			expect(await coreFileSystem(core).loadTask("TASK-99.1")).toBeNull();
			expect((await coreFileSystem(core).loadTask("TASK-1"))?.dependencies ?? []).toEqual([]);
		} finally {
			core.tasks.dispose();
			await safeCleanup(dir);
		}
	});

	it("resolves a create parent from the working copy without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await expect(core.tasks.create({ title: "Child of a missing parent", parentTaskId: "TASK-99" })).rejects.toThrow(
				"Parent task TASK-99 not found.",
			);
			// The parent is rejected before an ID is allocated, which is the only step that may
			// legitimately look beyond the working copy.

			const child = await core.tasks.create({ title: "Child of a local parent", parentTaskId: "TASK-1" });
			expect(child.task.id).toBe("TASK-1.2");
			expect(child.task.parentTaskId).toBe("TASK-1");
		} finally {
			core.tasks.dispose();
			await safeCleanup(dir);
		}
	});

	it("edits a working-copy task without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			const updated = await core.storage.withTaskLock(parentTask.id, (current) =>
				core.tasks.edit({ ...current, title: "Renamed locally" }),
			);

			expect(updated.title).toBe("Renamed locally");
			expect((await coreFileSystem(core).listTasks()).find((task) => task.id === parentTask.id)?.title).toBe(
				"Renamed locally",
			);
		} finally {
			core.tasks.dispose();
			await safeCleanup(dir);
		}
	});

	it("resolves padded active and unpadded completed IDs independently without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await mkdir(join(coreFileSystem(core).completedDir, "task-01"), { recursive: true });
			await Bun.write(
				join(coreFileSystem(core).completedDir, "task-01", "task.md"),
				serializeTask({
					...parentTask,
					id: "TASK-01",
					title: "Completed collision",
					status: "Done",
					done: true,
				}),
			);
			await waitUntil(
				() => core.tasks.getCompletedTasks().some((task) => task.id === "TASK-01"),
				"completed task entering the loaded corpus",
			);
			expect((await core.tasks.getTask(parentTask.id, {}))?.id).toBe("TASK-1");
			expect((await core.tasks.getTask("TASK-01", {}))?.id).toBe("TASK-01");
			expect((await core.getTaskWithSubtasks(parentTask.id, undefined, {}))?.id).toBe("TASK-1");
			expect(
				(
					await core.storage.withTaskLock(parentTask.id, (current) =>
						core.tasks.edit({ ...current, title: "Updated unpadded identity" }),
					)
				).title,
			).toBe("Updated unpadded identity");

			expect((await coreFileSystem(core).listCompletedTasks()).find((task) => task.id === "TASK-01")?.title).toBe(
				"Completed collision",
			);
			expect(await core.tasks.generateNextId()).toBe("TASK-3");
			expect((await coreFileSystem(core).listTasks()).filter((task) => task.id === "TASK-1")).toHaveLength(1);
		} finally {
			core.tasks.dispose();
			await safeCleanup(dir);
		}
	});
});
