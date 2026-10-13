import { describe, expect, it, spyOn } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { AmbiguousTaskIdError, LOCAL_TASK_LOOKUP_HINT } from "../utils/task-path.ts";
import { createUniqueTestDir, initGitRepo, initializeTestProject, safeCleanup } from "./test-utils.ts";

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
	assignee: [],
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

	const config = await core.filesystem.loadConfig();
	if (!config) throw new Error("Expected initialized config");
	await core.filesystem.saveConfig({
		...config,
		checkActiveBranches: true,
		remoteOperations: true,
	});

	await core.filesystem.saveTask(parentTask);
	await core.filesystem.saveTask({
		...parentTask,
		id: "TASK-1.1",
		title: "Local child",
		parentTaskId: parentTask.id,
		description: "Child content",
	});
	await core.filesystem.saveTask({
		...parentTask,
		id: "TASK-2",
		title: "Unrelated local task",
		description: "No matching search content",
	});

	return { dir, core };
}

function installCrossBranchTripwires(coreUnderTest: Core) {
	const error = new Error("Local task command crossed the branch-loading boundary");
	const loadTasks = spyOn(coreUnderTest, "loadTasks").mockRejectedValue(error);
	const fetch = spyOn(coreUnderTest.git, "fetch").mockRejectedValue(error);
	const listRecentBranchTips = spyOn(coreUnderTest.git, "listRecentBranchTips").mockRejectedValue(error);
	const listRecentBranches = spyOn(coreUnderTest.git, "listRecentBranches").mockRejectedValue(error);
	const getRepositoryRoot = spyOn(coreUnderTest.git, "getRepositoryRoot").mockRejectedValue(error);

	return {
		expectUntouched() {
			expect(loadTasks).toHaveBeenCalledTimes(0);
			expect(fetch).toHaveBeenCalledTimes(0);
			expect(listRecentBranchTips).toHaveBeenCalledTimes(0);
			expect(listRecentBranches).toHaveBeenCalledTimes(0);
			expect(getRepositoryRoot).toHaveBeenCalledTimes(0);
		},
		restore() {
			loadTasks.mockRestore();
			fetch.mockRestore();
			listRecentBranchTips.mockRestore();
			listRecentBranches.mockRestore();
			getRepositoryRoot.mockRestore();
		},
	};
}

// Every case owns an isolated working copy.
describe("local task command performance boundaries", () => {
	it("lists and searches working-copy tasks without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await core.filesystem.saveTask({
				...parentTask,
				id: "TASK-0007.0024",
				title: "Padded task identity",
				description: "No matching search content",
			});
			const tripwires = installCrossBranchTripwires(core);
			try {
				const listed = await core.queryTasks({ includeCrossBranch: false });
				const searched = await core.queryTasks({
					query: "local-search-token",
					includeCrossBranch: false,
				});
				const searchedByPaddedSegment = await core.queryTasks({
					query: "7",
					includeCrossBranch: false,
				});

				expect(listed.map((task) => task.id).sort()).toEqual(["TASK-0007.0024", "TASK-1", "TASK-1.1", "TASK-2"]);
				expect(searched.map((task) => task.id)).toEqual(["TASK-1"]);
				expect(searchedByPaddedSegment.map((task) => task.id)).toContain("TASK-0007.0024");
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	it("loads one working-copy task and its subtasks without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			const tripwires = installCrossBranchTripwires(core);
			try {
				const loaded = await core.loadTaskById(parentTask.id, { includeCrossBranch: false });
				const withSubtasks = await core.getTaskWithSubtasks(parentTask.id, undefined, {
					includeCrossBranch: false,
				});

				expect(loaded?.title).toBe(parentTask.title);
				expect(withSubtasks?.subtaskSummaries).toEqual([{ id: "TASK-1.1", title: "Local child" }]);
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	it("archives, completes, and demotes working-copy tasks without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			const tripwires = installCrossBranchTripwires(core);
			try {
				expect((await core.archiveTask("TASK-1", { includeCrossBranch: false })).success).toBe(true);
				expect(await core.completeTask("TASK-1.1", { includeCrossBranch: false })).toBe(true);
				expect((await core.demoteTask("TASK-2", { includeCrossBranch: false })).success).toBe(true);
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	it("keeps CLI reads, parent resolution, and dependency validation scoped to the working copy", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await $`git add .`.cwd(dir).quiet();
			await $`git commit -m ${"Commit working copy"}`.cwd(dir).quiet();
			await $`git switch -c branch-only`.cwd(dir).quiet();
			await core.filesystem.saveTask({
				...parentTask,
				id: "TASK-99",
				title: "Branch-only task",
			});
			await $`git add .`.cwd(dir).quiet();
			await $`git commit -m ${"Commit branch-only task"}`.cwd(dir).quiet();
			await $`git switch main`.cwd(dir).quiet();

			// TASK-99 exists only on another branch, so every command below must miss it locally.
			const view = await cli(["task", "view", "TASK-99", "--plain"], dir);
			const shorthand = await cli(["task", "TASK-99", "--plain"], dir);
			const edit = await cli(["task", "edit", "TASK-99", "--title", "Must remain absent", "--plain"], dir);
			const archive = await cli(["task", "archive", "TASK-99"], dir);
			const complete = await cli(["task", "complete", "TASK-99"], dir);
			const demote = await cli(["task", "demote", "TASK-99"], dir);
			const parentFilter = await cli(["task", "list", "--parent", "TASK-99", "--plain"], dir);
			const parentCreate = await cli(["task", "create", "Child of a branch task", "--parent", "TASK-99"], dir);
			const dependencyEdit = await cli(["task", "edit", "TASK-1", "--dep", "TASK-99", "--plain"], dir);

			const outputOf = (result: { stdout: string; stderr: string }) => `${result.stdout}${result.stderr}`;
			// Every local miss names the working copy as the corpus it searched, so a task parked on
			// another branch reads as scope rather than as a missing task.
			for (const result of [
				view,
				shorthand,
				edit,
				archive,
				complete,
				demote,
				parentFilter,
				parentCreate,
				dependencyEdit,
			]) {
				expect(result.exitCode).not.toBe(0);
				expect(outputOf(result)).toContain(LOCAL_TASK_LOOKUP_HINT);
			}
			for (const result of [view, shorthand, edit, archive, complete, demote]) {
				expect(outputOf(result)).toContain("Task TASK-99 not found.");
			}
			for (const result of [parentFilter, parentCreate]) {
				expect(outputOf(result)).toContain("Parent task TASK-99 not found.");
			}
			expect(outputOf(dependencyEdit)).toContain("The following dependencies do not exist: TASK-99");

			expect(await core.filesystem.loadTask("TASK-99")).toBeNull();
			expect(await core.filesystem.loadTask("TASK-99.1")).toBeNull();
			expect((await core.filesystem.loadTask("TASK-1"))?.dependencies ?? []).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("resolves a create parent from the working copy without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			const tripwires = installCrossBranchTripwires(core);
			try {
				await expect(
					core.createTaskFromInput({ title: "Child of a missing parent", parentTaskId: "TASK-99" }),
				).rejects.toThrow("Parent task TASK-99 not found.");
				// The parent is rejected before an ID is allocated, which is the only step that may
				// legitimately look beyond the working copy.
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}

			const child = await core.createTaskFromInput({ title: "Child of a local parent", parentTaskId: "1" });
			expect(child.task.id).toBe("TASK-1.2");
			expect(child.task.parentTaskId).toBe("TASK-1");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("validates dependencies against the working copy without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			const tripwires = installCrossBranchTripwires(core);
			try {
				const updated = await core.updateTaskFromInput(
					"TASK-1",
					{ addDependencies: ["2"] },
					{
						includeCrossBranch: false,
					},
				);
				expect(updated.dependencies).toEqual(["TASK-2"]);

				await expect(
					core.updateTaskFromInput("TASK-1", { dependencies: ["TASK-99"] }, { includeCrossBranch: false }),
				).rejects.toThrow("The following dependencies do not exist: TASK-99");
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}

			expect((await core.filesystem.loadTask("TASK-1"))?.dependencies).toEqual(["TASK-2"]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("fails closed only when the exact parent and dependency IDs are duplicated", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await mkdir(join(core.filesystem.completedDir, "task-2"), { recursive: true });
			await Bun.write(
				join(core.filesystem.completedDir, "task-2", "task.md"),
				serializeTask({
					...parentTask,
					id: "TASK-2",
					title: "Completed collision",
					status: "Done",
				}),
			);
			const tripwires = installCrossBranchTripwires(core);
			try {
				await expect(
					core.createTaskFromInput({ title: "Child of an ambiguous parent", parentTaskId: "2" }),
				).rejects.toBeInstanceOf(AmbiguousTaskIdError);
				await expect(
					core.updateTaskFromInput("TASK-1", { addDependencies: ["2"] }, { includeCrossBranch: false }),
				).rejects.toBeInstanceOf(AmbiguousTaskIdError);
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}

			expect((await core.filesystem.loadTask("TASK-1"))?.dependencies ?? []).toEqual([]);
			expect(await core.filesystem.loadTask("TASK-2.1")).toBeNull();
		} finally {
			await safeCleanup(dir);
		}
	});

	it("edits a working-copy task without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			const tripwires = installCrossBranchTripwires(core);
			try {
				const updated = await core.updateTaskFromInput(
					parentTask.id,
					{ title: "Renamed locally" },
					{
						includeCrossBranch: false,
					},
				);

				expect(updated.title).toBe("Renamed locally");
				expect((await core.filesystem.listTasks()).find((task) => task.id === parentTask.id)?.title).toBe(
					"Renamed locally",
				);
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	it("resolves padded active and unpadded completed IDs independently without loading branches", async () => {
		const { dir, core } = await setupLocalTaskProject();
		try {
			await mkdir(join(core.filesystem.completedDir, "task-01"), { recursive: true });
			await Bun.write(
				join(core.filesystem.completedDir, "task-01", "task.md"),
				serializeTask({
					...parentTask,
					id: "TASK-01",
					title: "Completed collision",
					status: "Done",
				}),
			);
			const tripwires = installCrossBranchTripwires(core);
			try {
				expect((await core.loadTaskById(parentTask.id, { includeCrossBranch: false }))?.id).toBe("TASK-1");
				expect((await core.loadTaskById("TASK-01", { includeCrossBranch: false }))?.id).toBe("TASK-01");
				expect((await core.getTaskWithSubtasks(parentTask.id, undefined, { includeCrossBranch: false }))?.id).toBe(
					"TASK-1",
				);
				expect(
					(
						await core.updateTaskFromInput(
							parentTask.id,
							{ title: "Updated unpadded identity" },
							{ includeCrossBranch: false },
						)
					).title,
				).toBe("Updated unpadded identity");
				tripwires.expectUntouched();
			} finally {
				tripwires.restore();
			}

			expect((await core.filesystem.listCompletedTasks()).find((task) => task.id === "TASK-01")?.title).toBe(
				"Completed collision",
			);
			expect(await core.generateNextId()).toBe("TASK-3");
			expect((await core.filesystem.listTasks()).filter((task) => task.id === "TASK-1")).toHaveLength(1);
		} finally {
			await safeCleanup(dir);
		}
	});
});
