import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import { loadTaskDetail } from "../core/task-detail.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Task } from "../types/index.ts";
import { taskIdsEqual } from "../utils/task-id.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const cliCommand = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; nothrow?: boolean } = {};
	const result = async () => {
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
		const exitCode = await runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err });
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		nothrow() {
			config.nothrow = true;
			return chain;
		},
		quiet() {
			return result();
		},
		async text() {
			return (await result()).stdout;
		},
	};
	return chain;
}

/**
 * A reference left behind stops meaning what it said if the allocator gives its ID to an unrelated
 * task. Archived IDs stay reserved; demoted IDs leave the task namespace. Completion is the
 * deliberate exception - a completed dependency is exactly what readiness reads.
 */
async function createVacatedContext(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-vacated-references");
	await mkdir(dir, { recursive: true });
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Vacated References Project");
	return { dir, core };
}

const loadCompleted = async (core: Core, taskId: string) =>
	(await core.filesystem.listCompletedTasks()).find((task) => taskIdsEqual(task.id, taskId));

/**
 * Run `interleave` once, at the exact moment the operation asks for its task locks. The cleanup
 * set is scanned before that call, so this reproduces the window between the scan and the locks
 * without sleeping on or racing against anything.
 */
const interleaveAtLockAcquisition = (core: Core, interleave: () => Promise<void>) => {
	const filesystem = core.filesystem;
	const original = filesystem.withTaskLocks.bind(filesystem);
	let injected = false;
	filesystem.withTaskLocks = async (tasks, run) => {
		if (!injected) {
			injected = true;
			await interleave();
		}
		return await original(tasks, run);
	};
	return () => {
		filesystem.withTaskLocks = original;
	};
};

/** What the dependency graph actually resolves the stored references to. */
const dependencyTitles = async (core: Core, task: Task | undefined | null) => {
	if (!task) return null;
	const detail = await loadTaskDetail(core, task);
	return detail.dependencyGraph.nodes
		.filter((node) => node.dependencyDepth === 1)
		.map((node) => `${node.id} - ${node.title ?? node.state}`);
};

describe("references to a vacated task ID", () => {
	for (const status of ["Done", "Closed"] as const) {
		it(`rejects archiving ${status} work without changing records or incoming links`, async () => {
			const { dir, core } = await createVacatedContext();
			try {
				const config = await core.filesystem.loadConfig();
				if (!config) throw new Error("Missing test config");
				await core.filesystem.saveConfig({ ...config, statuses: ["To Do", "In Progress", status] });
				const { task: target } = await core.createTaskFromInput({ title: "Finished work", status });
				const { task: active } = await core.createTaskFromInput({
					title: "Active dependent",
					dependencies: [target.id],
					references: [target.id],
				});
				const { task: completed } = await core.createTaskFromInput({
					title: "Completed dependent",
					status,
					dependencies: [target.id],
					references: [target.id],
				});
				expect(await core.completeTask(completed.id)).toBe(true);
				const completedRecord = await loadCompleted(core, completed.id);
				const paths = [target.filePath, active.filePath, completedRecord?.filePath];
				const before = await Promise.all(paths.map((path) => Bun.file(path as string).text()));

				await expect(core.archiveTask(target.id)).rejects.toThrow(`Task ${target.id} is ${status}. Use Complete`);

				expect(await Promise.all(paths.map((path) => Bun.file(path as string).text()))).toEqual(before);
				expect(await core.filesystem.listArchivedTasks()).toEqual([]);
				expect(await dependencyTitles(core, await core.filesystem.loadTask(active.id))).toEqual([
					`${target.id} - Finished work`,
				]);
				expect(await dependencyTitles(core, await loadCompleted(core, completed.id))).toEqual([
					`${target.id} - Finished work`,
				]);
			} finally {
				await safeCleanup(dir);
			}
		});
	}

	it("does not let an archived ID rebind a completed dependent to the next created task", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Completed dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id] });
			expect(await core.completeTask(dependent.id)).toBe(true);

			const archived = await core.archiveTask(target.id);
			expect(archived.success).toBe(true);
			expect(archived.cleanedTaskIds).toEqual([dependent.id]);

			// Archived IDs remain reserved, so unrelated work cannot inherit the archived identity.
			const { task: unrelated } = await core.createTaskFromInput({ title: "Totally unrelated new task" });
			expect(taskIdsEqual(unrelated.id, target.id)).toBe(false);

			const completedDependent = await loadCompleted(core, dependent.id);
			expect(completedDependent?.dependencies ?? []).toEqual([]);
			expect(await dependencyTitles(core, completedDependent)).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("does not let a demoted ID rebind an active dependent to the next created task", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Active dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Demote target" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id] });

			const demotion = await core.demoteTask(target.id);
			expect(demotion.success).toBe(true);
			expect(demotion.cleanedTaskIds).toEqual([dependent.id]);

			const { task: unrelated } = await core.createTaskFromInput({ title: "Totally unrelated new task" });
			expect(taskIdsEqual(unrelated.id, target.id)).toBe(true);

			// The reference is removed, not rewritten to the draft the record became.
			const drafts = await core.filesystem.listDrafts();
			expect(drafts).toHaveLength(1);
			const updatedDependent = await core.filesystem.loadTask(dependent.id);
			expect(updatedDependent?.dependencies ?? []).toEqual([]);
			expect(await dependencyTitles(core, updatedDependent)).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("cleans references when an edit demotes a task into the Draft status", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Dependent of edited task" });
			const { task: target } = await core.createTaskFromInput({ title: "Edited into a draft" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id], references: [target.id] });

			const { task: demoted } = await core.editTaskOrDraft(target.id, { status: "Draft" });
			expect(demoted.id.startsWith("DRAFT-")).toBe(true);

			const updatedDependent = await core.filesystem.loadTask(dependent.id);
			expect(updatedDependent?.dependencies ?? []).toEqual([]);
			expect(updatedDependent?.references ?? []).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("removes archived references from the completed corpus and the working copy alike", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: activeDependent } = await core.createTaskFromInput({ title: "Active dependent" });
			const { task: completedDependent } = await core.createTaskFromInput({ title: "Completed dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });
			await core.updateTaskFromInput(activeDependent.id, { dependencies: [target.id] });
			await core.updateTaskFromInput(completedDependent.id, { references: [target.id] });
			expect(await core.completeTask(completedDependent.id)).toBe(true);

			const archived = await core.archiveTask(target.id);
			expect(archived.success).toBe(true);
			expect(archived.cleanedTaskIds).toEqual([activeDependent.id, completedDependent.id]);

			expect((await core.filesystem.loadTask(activeDependent.id))?.dependencies ?? []).toEqual([]);
			expect((await loadCompleted(core, completedDependent.id))?.references ?? []).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("keeps references to a completed task, because completion does not vacate its ID", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: predecessor } = await core.createTaskFromInput({ title: "Predecessor", status: "Done" });
			const { task: dependent } = await core.createTaskFromInput({
				title: "Dependent on a completed task",
				dependencies: [predecessor.id],
			});
			const { task: completedDependent } = await core.createTaskFromInput({
				title: "Completed dependent on a completed task",
				dependencies: [predecessor.id],
				status: "Done",
			});
			expect(await core.completeTask(completedDependent.id)).toBe(true);

			expect(await core.completeTask(predecessor.id)).toBe(true);

			expect((await core.filesystem.loadTask(dependent.id))?.dependencies).toEqual([predecessor.id]);
			expect((await loadCompleted(core, completedDependent.id))?.dependencies).toEqual([predecessor.id]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("rejects archiving a task marked Done before the archive lock is acquired", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: target } = await core.createTaskFromInput({ title: "Finishing work" });
			const { task: dependent } = await core.createTaskFromInput({
				title: "Dependent",
				dependencies: [target.id],
				references: [target.id],
			});
			const editor = new Core(dir);
			const restore = interleaveAtLockAcquisition(core, async () => {
				await editor.updateTaskFromInput(target.id, { status: "Done" });
			});
			try {
				await expect(core.archiveTask(target.id)).rejects.toThrow("Use Complete");
			} finally {
				restore();
			}
			expect((await core.filesystem.loadTask(target.id))?.status).toBe("Done");
			expect(await core.filesystem.listArchivedTasks()).toEqual([]);
			const unchanged = await core.filesystem.loadTask(dependent.id);
			expect(unchanged?.dependencies).toEqual([target.id]);
			expect(unchanged?.references).toEqual([target.id]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("keeps an edit made between the cleanup scan and the locks", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id] });

			const editor = new Core(dir);
			const restore = interleaveAtLockAcquisition(core, async () => {
				await editor.updateTaskFromInput(dependent.id, { title: "Renamed while archiving" });
			});

			try {
				const archived = await core.archiveTask(target.id);
				expect(archived.success).toBe(true);
				expect(archived.cleanedTaskIds).toEqual([dependent.id]);
			} finally {
				restore();
			}

			// A snapshot taken before the locks would have rewritten the file from pre-edit content.
			const updated = await core.filesystem.loadTask(dependent.id);
			expect(updated?.title).toBe("Renamed while archiving");
			expect(updated?.dependencies ?? []).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("cleans a dependent that starts referencing the ID between the scan and the locks", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: late } = await core.createTaskFromInput({ title: "Late dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });

			const editor = new Core(dir);
			const restore = interleaveAtLockAcquisition(core, async () => {
				await editor.updateTaskFromInput(late.id, { dependencies: [target.id] });
			});

			try {
				const archived = await core.archiveTask(target.id);
				expect(archived.success).toBe(true);
				expect(archived.cleanedTaskIds).toEqual([late.id]);
			} finally {
				restore();
			}

			const { task: unrelated } = await core.createTaskFromInput({ title: "Totally unrelated new task" });
			expect(taskIdsEqual(unrelated.id, target.id)).toBe(false);

			const updated = await core.filesystem.loadTask(late.id);
			expect(updated?.dependencies ?? []).toEqual([]);
			expect(await dependencyTitles(core, updated)).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("reports a demotion whose cleanup write failed as already moved", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Demote target" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id] });

			const filesystem = core.filesystem;
			const originalSaveTask = filesystem.saveTask.bind(filesystem);
			filesystem.saveTask = async (task) => {
				if (taskIdsEqual(task.id, dependent.id)) {
					throw new Error("dependent file is not writable");
				}
				return await originalSaveTask(task);
			};

			let failure: unknown;
			try {
				await core.demoteTask(target.id);
			} catch (error) {
				failure = error;
			} finally {
				filesystem.saveTask = originalSaveTask;
			}

			// The record is already a draft, so the caller must not be told the demotion did not happen.
			expect((failure as { demotionState?: string } | undefined)?.demotionState).toBe("moved");
			expect((failure as { demotionFailureCause?: string } | undefined)?.demotionFailureCause).toBe("cleanup");
			expect(await core.filesystem.loadTask(target.id)).toBeNull();
			expect(await core.filesystem.listDrafts()).toHaveLength(1);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("reads cleaned records from persistent storage as soon as the archive returns", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: activeDependent } = await core.createTaskFromInput({ title: "Active dependent" });
			const { task: completedDependent } = await core.createTaskFromInput({ title: "Completed dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });
			await core.updateTaskFromInput(activeDependent.id, { dependencies: [target.id] });
			await core.updateTaskFromInput(completedDependent.id, { dependencies: [target.id] });
			expect(await core.completeTask(completedDependent.id)).toBe(true);

			expect(
				(await core.loadTaskSnapshot()).activeTasks.find((task) => taskIdsEqual(task.id, activeDependent.id))
					?.dependencies,
			).toEqual([target.id]);

			expect((await core.archiveTask(target.id)).success).toBe(true);

			// A new persistent read must not still see the reference the archive removed.
			const snapshot = await core.loadTaskSnapshot();
			expect(
				snapshot.activeTasks.find((task) => taskIdsEqual(task.id, activeDependent.id))?.dependencies ?? [],
			).toEqual([]);
			expect(
				snapshot.completedTasks.find((task) => taskIdsEqual(task.id, completedDependent.id))?.dependencies,
			).toEqual([]);
			// Rewriting the completed file must not make it an active task.
			expect(snapshot.activeTasks.some((task) => taskIdsEqual(task.id, completedDependent.id))).toBe(false);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("removes the vacated ID from the demoted record's own references", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: target } = await core.createTaskFromInput({ title: "Self-referencing target" });
			await core.updateTaskFromInput(target.id, { references: [target.id, "docs/notes.md"] });

			expect((await core.demoteTask(target.id)).success).toBe(true);

			const drafts = await core.filesystem.listDrafts();
			expect(drafts).toHaveLength(1);
			expect(drafts[0]?.references ?? []).toEqual(["docs/notes.md"]);

			// The freed ID goes to the next task, which the draft must not have started naming.
			const { task: unrelated } = await core.createTaskFromInput({ title: "Totally unrelated new task" });
			expect(taskIdsEqual(unrelated.id, target.id)).toBe(true);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("removes the vacated ID from a record demoted by an edit into the Draft status", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: target } = await core.createTaskFromInput({ title: "Self-referencing target" });
			await core.updateTaskFromInput(target.id, { references: [target.id, "docs/notes.md"] });

			const { task: demoted } = await core.editTaskOrDraft(target.id, { status: "Draft" });
			expect(demoted.id.startsWith("DRAFT-")).toBe(true);
			expect(demoted.references ?? []).toEqual(["docs/notes.md"]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("preserves a distinct padded reference when the unpadded ID is demoted and reissued", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Padded reference holder" });
			const { task: target } = await core.createTaskFromInput({ title: "Demote target" });
			// This is a separate literal ID, not a reference to the unpadded target.
			const paddedSpelling = target.id.replace(/(\d+)$/, (digits) => `0${digits}`);
			await core.updateTaskFromInput(dependent.id, { references: [paddedSpelling] });
			expect((await core.filesystem.loadTask(dependent.id))?.references).toEqual([paddedSpelling]);

			const demotion = await core.demoteTask(target.id);
			expect(demotion.success).toBe(true);
			expect(demotion.cleanedTaskIds).toEqual([]);

			// The freed ID goes to the next task created, which the padded reference must not name.
			const { task: unrelated } = await core.createTaskFromInput({ title: "Totally unrelated new task" });
			expect(taskIdsEqual(unrelated.id, target.id)).toBe(true);

			const updated = await core.filesystem.loadTask(dependent.id);
			expect(updated?.references ?? []).toEqual([paddedSpelling]);
			expect((updated?.references ?? []).some((reference) => taskIdsEqual(reference, unrelated.id))).toBe(false);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("leaves a contested identity contested when it cleans a completed record", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });
			const { task: completedDependent } = await core.createTaskFromInput({ title: "Completed dependent" });
			await core.updateTaskFromInput(completedDependent.id, { dependencies: [target.id] });
			expect(await core.completeTask(completedDependent.id)).toBe(true);

			// A padded active ID is a separate identity from the completed record.
			const duplicateContainer = join(core.filesystem.tasksDir, "task-02");
			await mkdir(duplicateContainer, { recursive: true });
			const duplicatePath = join(duplicateContainer, "task.md");
			await Bun.write(
				duplicatePath,
				serializeTask({ ...completedDependent, id: "TASK-02", title: "Padded active task", dependencies: [] }),
			);

			expect((await core.loadTaskSnapshot()).activeTasks.some((task) => task.filePath === duplicatePath)).toBe(true);

			expect((await core.archiveTask(target.id)).success).toBe(true);

			const snapshot = await core.loadTaskSnapshot();
			expect(
				snapshot.activeTasks.filter((task) => taskIdsEqual(task.id, completedDependent.id)).map((t) => t.filePath),
			).toEqual([]);
			// ...and the completed record was still cleaned.
			expect(
				snapshot.completedTasks.find((task) => taskIdsEqual(task.id, completedDependent.id))?.dependencies ?? [],
			).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("cleans a dependent whose identity is contested by a completed record", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });
			const { task: dependent } = await core.createTaskFromInput({ title: "Active dependent" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id] });

			// A completed record claims the dependent's identity, so resolving it by ID is ambiguous.
			// The cleanup already chose the file, so it must write that file rather than ask again.
			const completedContainer = join(core.filesystem.completedDir, "task-02");
			await mkdir(completedContainer, { recursive: true });
			const completedPath = join(completedContainer, "task.md");
			await Bun.write(
				completedPath,
				serializeTask({ ...dependent, id: "TASK-02", title: "Completed collision", dependencies: [] }),
			);

			const archived = await core.archiveTask(target.id);
			expect(archived.success).toBe(true);
			expect(archived.cleanedTaskIds).toEqual([dependent.id]);

			const updated = await core.filesystem.listTasks();
			expect(updated.find((task) => task.filePath === dependent.filePath)?.dependencies ?? []).toEqual([]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("reports an archive whose cleanup write failed as already moved", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Archive target" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id] });

			const filesystem = core.filesystem;
			const originalSaveTask = filesystem.saveTask.bind(filesystem);
			filesystem.saveTask = async (task) => {
				if (taskIdsEqual(task.id, dependent.id)) {
					throw new Error("dependent file is not writable");
				}
				return await originalSaveTask(task);
			};

			let failure: unknown;
			try {
				await core.archiveTask(target.id);
			} catch (error) {
				failure = error;
			} finally {
				filesystem.saveTask = originalSaveTask;
			}

			// The task is in the archive, so the caller must not be told to try again.
			expect((failure as { archiveState?: string } | undefined)?.archiveState).toBe("moved");
			expect(await core.filesystem.loadTask(target.id)).toBeNull();
			expect(
				await Bun.file(
					join(core.filesystem.archiveTasksDir, basename(dirname(target.filePath ?? "")), "task.md"),
				).exists(),
			).toBe(true);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("reports an edit into the Draft status whose cleanup write failed as already moved", async () => {
		const { dir, core } = await createVacatedContext();
		try {
			const { task: dependent } = await core.createTaskFromInput({ title: "Dependent" });
			const { task: target } = await core.createTaskFromInput({ title: "Edited into a draft" });
			await core.updateTaskFromInput(dependent.id, { dependencies: [target.id] });

			const filesystem = core.filesystem;
			const originalSaveTask = filesystem.saveTask.bind(filesystem);
			filesystem.saveTask = async (task) => {
				if (taskIdsEqual(task.id, dependent.id)) {
					throw new Error("dependent file is not writable");
				}
				return await originalSaveTask(task);
			};

			let failure: unknown;
			try {
				await core.editTaskOrDraft(target.id, { status: "Draft" });
			} catch (error) {
				failure = error;
			} finally {
				filesystem.saveTask = originalSaveTask;
			}

			expect((failure as { demotionState?: string } | undefined)?.demotionState).toBe("moved");
			expect((failure as { demotionFailureCause?: string } | undefined)?.demotionFailureCause).toBe("cleanup");
			expect(await core.filesystem.loadTask(target.id)).toBeNull();
			expect(await core.filesystem.listDrafts()).toHaveLength(1);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("reports the cleaned tasks from the archive and demote commands", async () => {
		const { dir } = await createVacatedContext();
		try {
			// The three creates are independent; the two dependency edits follow them together.
			await $`${cliCommand} task create "Dependent one"`.cwd(dir).quiet();
			await $`${cliCommand} task create "Dependent two"`.cwd(dir).quiet();
			await $`${cliCommand} task create "Shared target"`.cwd(dir).quiet();
			await $`${cliCommand} task edit TASK-1 --dep TASK-3`.cwd(dir).quiet();
			await $`${cliCommand} task edit TASK-2 --dep TASK-3`.cwd(dir).quiet();

			const archived = await $`${cliCommand} task archive TASK-3`.cwd(dir).quiet();
			expect(archived.exitCode).toBe(0);
			expect(archived.stdout.toString()).toContain("Archived task TASK-3");
			expect(archived.stdout.toString()).toContain("Removed references to TASK-3 from TASK-1, TASK-2");

			await $`${cliCommand} task edit TASK-2 --dep TASK-1`.cwd(dir).quiet();
			const demoted = await $`${cliCommand} task demote TASK-1`.cwd(dir).quiet();
			expect(demoted.exitCode).toBe(0);
			expect(demoted.stdout.toString()).toContain("Demoted task TASK-1");
			expect(demoted.stdout.toString()).toContain("Removed references to TASK-1 from TASK-2");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("says nothing about cleanup when no other record referenced the task", async () => {
		const { dir } = await createVacatedContext();
		try {
			await $`${cliCommand} task create "Lonely target"`.cwd(dir).quiet();

			const archived = await $`${cliCommand} task archive TASK-1`.cwd(dir).quiet();
			expect(archived.exitCode).toBe(0);
			expect(archived.stdout.toString()).toContain("Archived task TASK-1");
			expect(archived.stdout.toString()).not.toContain("Removed references");
		} finally {
			await safeCleanup(dir);
		}
	});
});
