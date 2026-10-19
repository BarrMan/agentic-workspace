import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, utimes } from "node:fs/promises";
import { dirname, join } from "node:path";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import {
	commitSamePathBranchTaskVariant,
	coreFileSystem,
	createUniqueTestDir,
	initGitRepo,
	initializeTestProject,
	safeCleanup,
} from "./test-utils.ts";

let TEST_DIR: string;

async function writeTaskFixture(path: string, task: Task): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await Bun.write(path, serializeTask(task));
}

// Branch records are only visible inside the rolling activeBranchDays window,
// so commit dates must stay relative to the test run, never absolute.
function recentCommitDate(minutesAgo: number): string {
	return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

describe("Core", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-core");
		core = new Core(TEST_DIR);
		await coreFileSystem(core).ensureAgenticWorkspaceStructure();

		initGitRepo(TEST_DIR);
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("initialization", () => {
		it("should initialize project with default config", async () => {
			await initializeTestProject(core, "Test Project", true);

			const config = await coreFileSystem(core).loadConfig();
			expect(config?.projectName).toBe("Test Project");
			expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
			expect(config?.defaultStatus).toBe("To Do");
		});

		it("should use root agentic-workspace.config.yml for custom agentic-workspace directories", async () => {
			await initializeTestProject(core, "Custom Root Project", false, "planning/agentic-workspace-data");

			expect(await Bun.file(join(TEST_DIR, "agentic-workspace.config.yml")).exists()).toBe(true);
			expect(await Bun.file(join(TEST_DIR, "planning", "agentic-workspace-data", "config.yml")).exists()).toBe(false);

			const freshCore = new Core(TEST_DIR);
			const config = await coreFileSystem(freshCore).loadConfig();
			expect(config?.projectName).toBe("Custom Root Project");
			expect(coreFileSystem(freshCore).agenticWorkspaceDirName).toBe("planning/agentic-workspace-data");
		});
	});

	describe("task operations", () => {
		const sampleTask: Task = {
			id: "task-1",
			title: "Test Task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-07",
			labels: ["test"],
			dependencies: [],
			description: "This is a test task",
		};

		beforeEach(async () => {
			await initializeTestProject(core, "Test Project");
		});

		async function commitPaddedTaskLifecycleVariant(type: "archived" | "completed"): Promise<void> {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				taskResolutionStrategy: "most_progressed",
				prefixes: { ...config.prefixes, task: "back" },
			});

			const taskPath = await coreFileSystem(core).saveTask({
				...sampleTask,
				id: "BACK-1",
				title: "Local task version",
				status: "To Do",
			});
			const localDate = recentCommitDate(3);
			await $`git add . && GIT_AUTHOR_DATE="${localDate}" GIT_COMMITTER_DATE="${localDate}" git commit -m "Add local task"`
				.cwd(TEST_DIR)
				.quiet();

			await $`git switch -c progressed-task-variant`.cwd(TEST_DIR).quiet();
			await Bun.write(
				taskPath,
				serializeTask({
					...sampleTask,
					id: "BACK-001",
					title: "Progressed branch version",
					status: "Done",
				}),
			);
			const progressedDate = recentCommitDate(2);
			await $`git add . && GIT_AUTHOR_DATE="${progressedDate}" GIT_COMMITTER_DATE="${progressedDate}" git commit -m "Progress padded task variant"`
				.cwd(TEST_DIR)
				.quiet();

			await $`git switch -c ${`${type}-task-variant`}`.cwd(TEST_DIR).quiet();
			const destinationDir =
				type === "archived" ? coreFileSystem(core).archiveTasksDir : coreFileSystem(core).completedDir;
			const destinationPath = join(destinationDir, "back-1 - Local-task-version.md");
			await $`git mv -- ${taskPath} ${destinationPath}`.cwd(TEST_DIR).quiet();
			const lifecycleDate = recentCommitDate(1);
			await $`GIT_AUTHOR_DATE="${lifecycleDate}" GIT_COMMITTER_DATE="${lifecycleDate}" git commit -m ${`${type} padded task variant`}`
				.cwd(TEST_DIR)
				.quiet();

			await $`git switch main`.cwd(TEST_DIR).quiet();
			await utimes(taskPath, new Date(localDate), new Date(localDate));
		}

		it("should create task without committing", async () => {
			await core.createTask(sampleTask);

			const loadedTask = await coreFileSystem(core).loadTask("task-1");
			expect(loadedTask?.id).toBe("TASK-1");
			expect(loadedTask?.title).toBe("Test Task");
		});

		it("reads a completed-only task while keeping it unavailable to mutations", async () => {
			await core.createTask(sampleTask);
			expect(await coreFileSystem(core).completeTask(sampleTask.id)).toBe(true);

			const completed = await core.getTask(sampleTask.id);

			expect(completed?.id).toBe("TASK-1");
			expect(completed?.source).toBe("completed");
			await expect(core.updateTaskFromInput(sampleTask.id, { title: "Must not change" })).rejects.toThrow(
				"Task not found",
			);
		});

		it("updates a resolved task without rescanning padded identities", async () => {
			await core.createTask(sampleTask);
			const activePath = (await coreFileSystem(core).loadTask(sampleTask.id))?.filePath;
			if (!activePath) throw new Error("Expected active task path");
			const completedPath = join(coreFileSystem(core).completedDir, "task-01", "task.md");
			await mkdir(join(coreFileSystem(core).completedDir, "task-01"), { recursive: true });
			await Bun.write(completedPath, serializeTask({ ...sampleTask, id: "TASK-01", title: "Completed collision" }));

			const originalListTasks = coreFileSystem(core).listTasks.bind(coreFileSystem(core));
			const originalListCompletedTasks = coreFileSystem(core).listCompletedTasks.bind(coreFileSystem(core));
			let activeLoads = 0;
			let completedLoads = 0;
			coreFileSystem(core).listTasks = async (...args) => {
				activeLoads += 1;
				return await originalListTasks(...args);
			};
			coreFileSystem(core).listCompletedTasks = async (...args) => {
				completedLoads += 1;
				return await originalListCompletedTasks(...args);
			};

			try {
				await expect(core.updateTaskFromInput(sampleTask.id, { title: "Updated active" })).resolves.toMatchObject({
					title: "Updated active",
				});
			} finally {
				coreFileSystem(core).listTasks = originalListTasks;
				coreFileSystem(core).listCompletedTasks = originalListCompletedTasks;
			}

			expect(activeLoads).toBe(2);
			expect(completedLoads).toBe(2);
			expect(await Bun.file(activePath).text()).toContain("Updated active");
			expect((await coreFileSystem(core).listCompletedTasks()).find((task) => task.id === "TASK-01")?.title).toBe(
				"Completed collision",
			);
		});

		it("makes completed lifecycle state visible to the next persistent read", async () => {
			await core.createTask(sampleTask);
			expect(await core.completeTask(sampleTask.id)).toBe(true);
			const snapshot = await core.loadTaskSnapshot();
			expect(await core.getTask(sampleTask.id)).toMatchObject({ id: "TASK-1", source: "completed" });
			expect(snapshot.activeTasks).toEqual([]);
			expect(snapshot.completedTasks.map((task) => task.id)).toEqual(["TASK-1"]);
		});

		it("makes archived lifecycle state unavailable to the next persistent read", async () => {
			await core.createTask(sampleTask);
			expect((await core.archiveTask(sampleTask.id)).success).toBe(true);
			expect(await core.getTask(sampleTask.id)).toBeNull();
			expect((await core.loadTaskSnapshot()).activeTasks).toEqual([]);
		});

		it("rejects a canonical task container whose folder differs from its frontmatter ID", async () => {
			const taskPath = join(coreFileSystem(core).tasksDir, "task-999", "task.md");
			await writeTaskFixture(taskPath, { ...sampleTask, id: "TASK-1", status: "Done" });
			expect(await core.getTask("TASK-1")).toBeNull();
			expect(await core.completeTask("TASK-1")).toBe(false);
			expect(await Bun.file(taskPath).exists()).toBe(true);
		});

		it("does not archive a canonical task container whose folder differs from its frontmatter ID", async () => {
			const taskPath = join(coreFileSystem(core).tasksDir, "task-999", "task.md");
			await writeTaskFixture(taskPath, { ...sampleTask, id: "TASK-1" });
			expect(await core.getTask("TASK-1")).toBeNull();
			expect((await core.archiveTask("TASK-1")).success).toBe(false);
			expect(await Bun.file(taskPath).exists()).toBe(true);
		});

		it("does not update a longer numeric sibling for a shorter numeric ID", async () => {
			await core.createTask({ ...sampleTask, id: "BACK-12", title: "Longer sibling" });

			await expect(core.updateTaskFromInput("BACK-1", { title: "Wrong target" })).rejects.toThrow(
				"Task not found: BACK-1",
			);
			expect((await coreFileSystem(core).loadTask("BACK-12"))?.title).toBe("Longer sibling");
		});

		it("resolves lowercase prefixed IDs without changing the exact numeric segment", async () => {
			await core.createTask({ ...sampleTask, id: "TASK-01", title: "Padded" });
			expect(await core.getTask("task-01")).toMatchObject({ id: "TASK-01", title: "Padded" });
			expect(await core.getTask("TASK-1")).toBeNull();
		});

		it("returns the local task when merge policy selects a same-path padded ID variant", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				taskResolutionStrategy: "most_progressed",
				prefixes: { ...config.prefixes, task: "back" },
			});

			const localTask: Task = {
				...sampleTask,
				id: "BACK-1",
				title: "Local task version",
				status: "To Do",
			};
			await commitSamePathBranchTaskVariant(core, localTask, {
				...localTask,
				id: "BACK-001",
				title: "Progressed branch version",
				status: "Done",
			});

			const loaded = await core.getTask("BACK-1");
			expect(loaded?.id).toBe("BACK-1");
			expect(loaded?.title).toBe("Local task version");
			expect(loaded?.status).toBe("To Do");
		});

		it("resolves a padded ID variant at a different path as its own identity", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				taskResolutionStrategy: "most_progressed",
				prefixes: { ...config.prefixes, task: "back" },
			});

			const localTask: Task = {
				...sampleTask,
				id: "BACK-1",
				title: "Local task version",
				status: "To Do",
			};
			await commitSamePathBranchTaskVariant(
				core,
				localTask,
				{
					...localTask,
					id: "BACK-001",
					title: "Progressed branch version",
					status: "Done",
				},
				join(coreFileSystem(core).tasksDir, "back-001", "task.md"),
			);

			expect(await core.getTask("BACK-1")).toMatchObject({ id: "BACK-1", title: "Local task version" });
		});

		it("keeps branch-only padded ID variants distinct across paths", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				taskResolutionStrategy: "most_progressed",
				prefixes: { ...config.prefixes, task: "back" },
			});
			await $`git add . && git commit -m "Configure branch task loading"`.cwd(TEST_DIR).quiet();

			await $`git switch -c branch-task-one`.cwd(TEST_DIR).quiet();
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "back-1", "task.md"), {
				...sampleTask,
				id: "BACK-1",
				title: "Branch one",
				status: "To Do",
			});
			await $`git add . && git commit -m "Add first branch task"`.cwd(TEST_DIR).quiet();

			await $`git switch main && git switch -c branch-task-two`.cwd(TEST_DIR).quiet();
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "back-001", "task.md"), {
				...sampleTask,
				id: "BACK-001",
				title: "Branch two",
				status: "Done",
			});
			await $`git add . && git commit -m "Add second branch task"`.cwd(TEST_DIR).quiet();
			await $`git switch main`.cwd(TEST_DIR).quiet();

			const branchTasks = await core.loadTasks();
			expect(branchTasks.map((task) => task.id).sort()).toEqual(["BACK-001", "BACK-1"]);
		});

		it("refreshes branch identities before resolving a long-lived Core read", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Expected config to be loaded");
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				prefixes: { ...config.prefixes, task: "back" },
			});

			await coreFileSystem(core).saveTask({ ...sampleTask, id: "BACK-1", title: "Local identity" });
			await $`git add . && git commit -m "Add local identity"`.cwd(TEST_DIR).quiet();

			expect((await core.getTask("BACK-1"))?.title).toBe("Local identity");

			await $`git switch -c late-distinct-identity`.cwd(TEST_DIR).quiet();
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "back-001", "task.md"), {
				...sampleTask,
				id: "BACK-001",
				title: "Late distinct identity",
			});
			await $`git add . && git commit -m "Add late distinct identity"`.cwd(TEST_DIR).quiet();
			await $`git switch main`.cwd(TEST_DIR).quiet();

			expect(await core.getTask("BACK-1")).toMatchObject({ id: "BACK-1", title: "Local identity" });
		});

		it("hydrates branch-only records whose canonical IDs normalize equal", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Expected config to be loaded");
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				prefixes: { ...config.prefixes, task: "back" },
			});
			await $`git add . && git commit -m "Configure branch identity loading"`.cwd(TEST_DIR).quiet();

			await $`git switch -c exact-id-active`.cwd(TEST_DIR).quiet();
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "back-1", "task.md"), {
				...sampleTask,
				id: "BACK-1",
				title: "Active branch identity",
			});
			await $`git add . && git commit -m "Add active branch identity"`.cwd(TEST_DIR).quiet();

			await $`git switch main && git switch -c exact-id-completed`.cwd(TEST_DIR).quiet();
			await writeTaskFixture(join(coreFileSystem(core).completedDir, "back-001", "task.md"), {
				...sampleTask,
				id: "BACK-001",
				title: "Completed branch identity",
				status: "Done",
			});
			await $`git add . && git commit -m "Add completed branch identity"`.cwd(TEST_DIR).quiet();
			await $`git switch main`.cwd(TEST_DIR).quiet();

			const included = await core.loadTasks(undefined, undefined, { includeCompleted: true });
			expect(included.map((task) => task.title).sort()).toEqual([
				"Active branch identity",
				"Completed branch identity",
			]);
			core.git.listRecentBranches = async () => {
				throw new Error("Statistics must not use the retired local-branch loader");
			};
			core.git.listRecentRemoteBranches = async () => {
				throw new Error("Statistics must not use the retired remote-branch loader");
			};
			const statistics = (await core.loadAllTasksForStatistics()).tasks;
			expect(statistics.map((task) => task.title).sort()).toEqual([
				"Active branch identity",
				"Completed branch identity",
			]);
		});

		it("loads other local branches while the current branch is unborn", async () => {
			const currentConfig = await coreFileSystem(core).loadConfig();
			if (!currentConfig) throw new Error("Expected config to be loaded");
			const branchConfig = {
				...currentConfig,
				checkActiveBranches: true,
				remoteOperations: false,
			};
			await coreFileSystem(core).saveConfig(branchConfig);
			await $`git add . && git commit -m "Configure orphan branch loading"`.cwd(TEST_DIR).quiet();

			await $`git switch -c feature/unborn-source`.cwd(TEST_DIR).quiet();
			await coreFileSystem(core).saveTask({ ...sampleTask, id: "TASK-2", title: "Task on another branch" });
			await $`git add . && git commit -m "Add branch-only task"`.cwd(TEST_DIR).quiet();
			await $`git switch main && git switch --orphan blank`.cwd(TEST_DIR).quiet();
			await coreFileSystem(core).ensureAgenticWorkspaceStructure();
			await coreFileSystem(core).saveConfig(branchConfig);

			expect((await core.loadTasks()).map((task) => task.title)).toEqual(["Task on another branch"]);
		});

		it("keeps padded active paths distinct when an archive snapshot is present", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				prefixes: { ...config.prefixes, task: "back" },
			});

			const localTaskPath = await coreFileSystem(core).saveTask({
				...sampleTask,
				id: "BACK-1",
				title: "Local active path",
			});
			await $`git add . && git commit -m "Add local active task"`.cwd(TEST_DIR).quiet();

			await $`git switch -c distinct-active-path && git rm -- ${localTaskPath}`.cwd(TEST_DIR).quiet();
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "back-001", "task.md"), {
				...sampleTask,
				id: "BACK-001",
				title: "Distinct branch path",
			});
			const activeDate = recentCommitDate(2);
			await $`git add . && GIT_AUTHOR_DATE="${activeDate}" GIT_COMMITTER_DATE="${activeDate}" git commit -m "Move task to a distinct active path"`
				.cwd(TEST_DIR)
				.quiet();

			await $`git switch -c archive-shadow`.cwd(TEST_DIR).quiet();
			await Bun.write(
				join(coreFileSystem(core).archiveTasksDir, "back-1 - Local-active-path.md"),
				serializeTask({ ...sampleTask, id: "BACK-1", title: "Archived local path" }),
			);
			const archiveDate = recentCommitDate(1);
			await $`git add . && GIT_AUTHOR_DATE="${archiveDate}" GIT_COMMITTER_DATE="${archiveDate}" git commit -m "Archive the original path"`
				.cwd(TEST_DIR)
				.quiet();
			await $`git switch main`.cwd(TEST_DIR).quiet();
			const localMtime = new Date(recentCommitDate(3));
			await utimes(localTaskPath, localMtime, localMtime);

			expect(await core.getTask("BACK-1")).toMatchObject({ id: "BACK-1", title: "Local active path" });
		});

		it("keeps an ID occupied when equal-time branch records are active and archived", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				prefixes: { ...config.prefixes, task: "back" },
			});
			await $`git add . && git commit -m "Configure identity loading"`.cwd(TEST_DIR).quiet();

			await $`git switch -c equal-time-states`.cwd(TEST_DIR).quiet();
			await Bun.write(
				join(coreFileSystem(core).archiveTasksDir, "back-1 - Archived-version.md"),
				serializeTask({ ...sampleTask, id: "BACK-1", title: "Archived version" }),
			);
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "back-001", "task.md"), {
				...sampleTask,
				id: "BACK-001",
				title: "Active version",
			});
			const commitDate = recentCommitDate(3);
			await $`git add . && GIT_AUTHOR_DATE="${commitDate}" GIT_COMMITTER_DATE="${commitDate}" git commit -m "Add equal-time states"`
				.cwd(TEST_DIR)
				.quiet();
			await $`git switch main`.cwd(TEST_DIR).quiet();

			expect(await core.generateNextId()).toBe("BACK-2");
		});

		it("keeps active and completed identities at distinct paths when completed tasks are included", async () => {
			const activePath = await coreFileSystem(core).saveTask({
				...sampleTask,
				id: "TASK-1",
				title: "Active identity",
			});
			const completedPath = join(coreFileSystem(core).completedDir, "task-001", "task.md");
			await writeTaskFixture(completedPath, {
				...sampleTask,
				id: "TASK-001",
				title: "Completed identity",
				status: "Done",
			});

			const tasks = await core.loadTasks(undefined, undefined, { includeCompleted: true });
			expect(tasks.map((task) => task.title).sort()).toEqual(["Active identity", "Completed identity"]);
			expect((await core.loadTasks()).map((task) => task.title)).toEqual(["Active identity"]);
			const statisticsTasks = (await core.loadAllTasksForStatistics()).tasks;
			expect(statisticsTasks.map((task) => task.title).sort()).toEqual(["Active identity", "Completed identity"]);
			expect(activePath).not.toBe(completedPath);
			expect(await core.getTask("TASK-1")).toMatchObject({ id: "TASK-1", title: "Active identity" });
			expect(await core.getTask("TASK-001")).toMatchObject({ id: "TASK-001", title: "Completed identity" });
		});

		it("normalizes local and Git paths for a nested project with a custom agentic-workspace directory", async () => {
			const nestedRoot = join(TEST_DIR, "packages", "app");
			const nestedCore = new Core(nestedRoot);
			await initializeTestProject(nestedCore, "Nested Project", false, "planning/agentic-workspace-data");
			const configuredCore = new Core(nestedRoot);
			const config = await coreFileSystem(configuredCore).loadConfig();
			if (!config) {
				throw new Error("Expected nested config to be loaded");
			}
			await coreFileSystem(configuredCore).saveConfig({
				...config,
				checkActiveBranches: true,
				remoteOperations: false,
				prefixes: { ...config.prefixes, task: "back" },
			});

			const taskPath = await coreFileSystem(configuredCore).saveTask({
				...sampleTask,
				id: "BACK-1",
				title: "Nested local version",
			});
			await $`git add . && git commit -m "Add nested local task"`.cwd(TEST_DIR).quiet();
			await $`git switch -c nested-task-version`.cwd(TEST_DIR).quiet();
			await Bun.write(
				taskPath,
				serializeTask({
					...sampleTask,
					id: "BACK-001",
					title: "Nested branch version",
					status: "Done",
				}),
			);
			await $`git add . && git commit -m "Progress nested task"`.cwd(TEST_DIR).quiet();
			await $`git switch main`.cwd(TEST_DIR).quiet();

			const loaded = await new Core(nestedRoot).getTask("BACK-1");
			expect(loaded?.id).toBe("BACK-1");
			expect(loaded?.title).toBe("Nested local version");
		});

		it("keeps the working-copy task active when a branch archives the same padded identity path", async () => {
			await commitPaddedTaskLifecycleVariant("archived");

			const tasks = await core.loadTasks();
			const task = tasks.find((candidate) => candidate.id === "BACK-1" || candidate.id === "BACK-001");
			expect(task?.id).toBe("BACK-1");
			expect(task?.source).toBe("local");
			expect(await core.generateNextId()).toBe("BACK-2");
		});

		it("keeps the working-copy task active when a branch completes the same padded identity path", async () => {
			await commitPaddedTaskLifecycleVariant("completed");

			const tasks = await core.loadTasks(undefined, undefined, { includeCompleted: true });
			const task = tasks.find((candidate) => candidate.id === "BACK-1" || candidate.id === "BACK-001");
			expect(task?.id).toBe("BACK-1");
			expect(task?.source).toBe("local");
		});

		it("rejects unsupported alphanumeric task IDs", async () => {
			await mkdir(join(coreFileSystem(core).tasksDir, "task-prefixed"), { recursive: true });
			await Bun.write(
				join(coreFileSystem(core).tasksDir, "task-prefixed", "task.md"),
				serializeTask({ ...sampleTask, id: "TASK-PREFIXED", title: "Historical task" }),
			);

			expect(await core.getTask("task-prefixed")).toBeNull();
		});

		it("resolves distinct padded task IDs from their own canonical containers", async () => {
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "task-1", "task.md"), {
				...sampleTask,
				id: "TASK-1",
				title: "First",
			});
			await writeTaskFixture(join(coreFileSystem(core).tasksDir, "task-01", "task.md"), {
				...sampleTask,
				id: "TASK-01",
				title: "Second",
			});

			expect(await core.getTask("TASK-1")).toMatchObject({ id: "TASK-1", title: "First" });
			expect(await core.getTask("TASK-01")).toMatchObject({ id: "TASK-01", title: "Second" });
		});

		it("assigns ordinal 1000 to the first created task when none exist", async () => {
			const { task } = await core.createTaskFromInput({ title: "First ordinal task" });
			expect(task.ordinal).toBe(1000);

			const loadedTask = await coreFileSystem(core).loadTask(task.id);
			expect(loadedTask?.ordinal).toBe(1000);
		});

		it("assigns the next tail ordinal when existing tasks already have ordinals", async () => {
			await core.createTask({
				...sampleTask,
				id: "task-10",
				title: "Seed 1000",
				ordinal: 1000,
			});
			await core.createTask({
				...sampleTask,
				id: "task-11",
				title: "Seed 4000",
				ordinal: 4000,
			});

			const { task } = await core.createTaskFromInput({ title: "Appended ordinal task" });
			expect(task.ordinal).toBe(5000);
		});

		it("preserves explicit ordinals on create input", async () => {
			const { task } = await core.createTaskFromInput({
				title: "Explicit ordinal task",
				ordinal: 2750,
			});
			expect(task.ordinal).toBe(2750);
		});

		it("rejects non-finite ordinals on create input", async () => {
			await expect(
				core.createTaskFromInput({
					title: "Invalid ordinal task",
					ordinal: Number.POSITIVE_INFINITY,
				}),
			).rejects.toThrow("Ordinal must be a non-negative number.");
		});

		it("ignores tasks without ordinals when computing the next tail ordinal", async () => {
			await core.createTask({
				...sampleTask,
				id: "task-20",
				title: "No ordinal seed",
			});
			await core.createTask({
				...sampleTask,
				id: "task-21",
				title: "Ordinal seed",
				ordinal: 3000,
			});

			const { task } = await core.createTaskFromInput({ title: "Mixed ordinal task" });
			expect(task.ordinal).toBe(4000);
		});

		it("preserves no-ordinal ordering when no existing tasks have ordinals", async () => {
			await core.createTask({
				...sampleTask,
				id: "task-20",
				title: "Historical no ordinal seed",
			});

			const { task } = await core.createTaskFromInput({ title: "Historical appended task" });
			expect(task.ordinal).toBeUndefined();

			const loadedTask = await coreFileSystem(core).loadTask(task.id);
			expect(loadedTask?.ordinal).toBeUndefined();
		});

		it("rejects non-finite ordinals on update input", async () => {
			const { task } = await core.createTaskFromInput({ title: "Ordinal update target" });

			await expect(core.updateTaskFromInput(task.id, { ordinal: Number.POSITIVE_INFINITY })).rejects.toThrow(
				"Ordinal must be a non-negative number.",
			);
		});

		it("should NOT match numeric ID with typos when using custom prefix (BACK-364)", async () => {
			// Configure custom prefix
			const config = await coreFileSystem(core).loadConfig();
			if (!config) {
				throw new Error("Expected config to be loaded");
			}
			await coreFileSystem(core).saveConfig({
				...config,
				prefixes: { task: "back" },
			});

			// Create task with custom prefix
			const task: Task = { ...sampleTask, id: "back-358", title: "Custom Prefix Task" };
			await core.createTask(task);

			// Typos should NOT match (prevent parseInt coercion bug)
			const withTypo = await core.getTask("358a");
			expect(withTypo).toBeNull();

			const withTypo2 = await core.getTask("35x8");
			expect(withTypo2).toBeNull();
		});

		it("should return false when archiving non-existent task", async () => {
			const archived = await core.archiveTask("non-existent");
			expect(archived.success).toBe(false);
		});

		it("should apply default status when task has empty status", async () => {
			const taskWithoutStatus: Task = {
				...sampleTask,
				status: "",
			};

			await core.createTask(taskWithoutStatus);

			const loadedTask = await coreFileSystem(core).loadTask("task-1");
			expect(loadedTask?.status).toBe("To Do"); // Should use default from config
		});

		it("should not override existing status", async () => {
			const taskWithStatus: Task = {
				...sampleTask,
				status: "In Progress",
			};

			await core.createTask(taskWithStatus);

			const loadedTask = await coreFileSystem(core).loadTask("task-1");
			expect(loadedTask?.status).toBe("In Progress");
		});

		it("stores description in frontmatter without adding body markers", async () => {
			const taskNoHeader: Task = {
				...sampleTask,
				id: "task-2",
				description: "Just text",
			};

			await core.createTask(taskNoHeader);
			const loaded = await coreFileSystem(core).loadTask("task-2");
			expect(loaded?.description).toBe("Just text");
			const body = await core.getTaskContent("task-2");
			expect(body).toContain("description: Just text");
			expect(body).not.toContain("## Description");
		});

		it("keeps body content opaque when description resembles a heading", async () => {
			const taskWithHeader: Task = {
				...sampleTask,
				id: "task-3",
				description: "Existing",
				rawContent: "## Description\n\nFree-form note",
			};

			await core.createTask(taskWithHeader);
			const body = await core.getTaskContent("task-3");
			expect(body).toEndWith("## Description\n\nFree-form note");
		});

		it("should handle task creation without committing when git fails", async () => {
			// Create task in directory without git
			const nonGitCore = new Core(join(TEST_DIR, "no-git"));
			await coreFileSystem(nonGitCore).ensureAgenticWorkspaceStructure();

			// This should succeed even without git
			await nonGitCore.createTask(sampleTask);

			const loadedTask = await coreFileSystem(nonGitCore).loadTask("task-1");
			expect(loadedTask?.id).toBe("TASK-1");
		});

		it("should preserve assignee arrays when creating tasks", async () => {
			const arrayTask: Task = {
				...sampleTask,
				id: "task-3",
				title: "Array Assignee",
				assignee: ["@bob"],
			};
			await core.createTask(arrayTask);
			const loadedArray = await coreFileSystem(core).loadTask("task-3");
			expect(loadedArray?.assignee).toEqual(["@bob"]);
		});

		it("should replace assignee arrays when updating tasks", async () => {
			await core.createTask(sampleTask);

			await core.updateTaskFromInput("task-1", { assignee: ["@carol"] });
			let loaded = await coreFileSystem(core).loadTask("task-1");
			expect(loaded?.assignee).toEqual(["@carol"]);

			await core.updateTaskFromInput("task-1", { assignee: ["@dave"] });
			loaded = await coreFileSystem(core).loadTask("task-1");
			expect(loaded?.assignee).toEqual(["@dave"]);
		});

		it("matches labels by trimmed case-insensitive identity when adding and removing", async () => {
			await core.createTask({ ...sampleTask, labels: [" UI "] });

			await core.updateTaskFromInput("task-1", { addLabels: ["ui"] });
			expect((await coreFileSystem(core).loadTask("task-1"))?.labels).toEqual([" UI "]);

			await core.updateTaskFromInput("task-1", { removeLabels: ["  Ui  "] });
			expect((await coreFileSystem(core).loadTask("task-1"))?.labels).toEqual([]);
		});

		it("should create sub-tasks with proper hierarchical IDs", async () => {
			await initializeTestProject(core, "Subtask Project", true);

			// Create parent task
			const { task: parent } = await core.createTaskFromInput({
				title: "Parent Task",
				status: "To Do",
			});
			expect(parent.id).toBe("TASK-1");

			// Create first sub-task
			const { task: child1 } = await core.createTaskFromInput({
				title: "First Child",
				parentTaskId: parent.id,
				status: "To Do",
			});
			expect(child1.id).toBe("TASK-1.1");
			expect(child1.parentTaskId).toBe("TASK-1");

			// Create second sub-task
			const { task: child2 } = await core.createTaskFromInput({
				title: "Second Child",
				parentTaskId: parent.id,
				status: "To Do",
			});
			expect(child2.id).toBe("TASK-1.2");
			expect(child2.parentTaskId).toBe("TASK-1");

			// Create another parent task to ensure sequential numbering still works
			const { task: parent2 } = await core.createTaskFromInput({
				title: "Second Parent",
				status: "To Do",
			});
			expect(parent2.id).toBe("TASK-2");
		});
	});

	describe("draft operations", () => {
		beforeEach(async () => {
			await initializeTestProject(core, "Draft Project");
		});

		it("should create draft without committing", async () => {
			const { task: draft } = await core.createTaskFromInput({
				title: "Draft Task",
				status: "Draft",
				description: "Draft task",
			});

			const loaded = await coreFileSystem(core).loadDraft(draft.id);
			expect(loaded?.id).toBe("DRAFT-1");
		});

		it("should preserve draft metadata through the canonical create path", async () => {
			const { task: draft } = await core.createTaskFromInput({
				title: "Draft Array",
				status: "Draft",
				description: "Draft task",
				assignee: ["@frank"],
				labels: ["draft"],
			});

			const loaded = await coreFileSystem(core).loadDraft(draft.id);
			expect(loaded?.assignee).toEqual(["@frank"]);
			expect(loaded?.labels).toEqual(["draft"]);
		});
	});

	describe("integration with config", () => {
		it("should use custom default status from config", async () => {
			// Initialize with custom config
			await initializeTestProject(core, "Custom Project");

			// Update config with custom default status
			const config = await coreFileSystem(core).loadConfig();
			if (config) {
				config.defaultStatus = "Custom Status";
				await coreFileSystem(core).saveConfig(config);
			}

			const taskWithoutStatus: Task = {
				id: "task-990",
				title: "Custom Task",
				status: "",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task without status",
			};

			await core.createTask(taskWithoutStatus);

			const loadedTask = await coreFileSystem(core).loadTask("task-990");
			expect(loadedTask?.status).toBe("Custom Status");
		});

		it("should fall back to To Do when config has no default status", async () => {
			// Initialize project
			await initializeTestProject(core, "Fallback Project");

			// Update config to remove default status
			const config = await coreFileSystem(core).loadConfig();
			if (config) {
				config.defaultStatus = undefined;
				await coreFileSystem(core).saveConfig(config);
			}

			const taskWithoutStatus: Task = {
				id: "task-991",
				title: "Fallback Task",
				status: "",
				assignee: [],
				createdDate: "2025-06-07",
				labels: [],
				dependencies: [],
				description: "Task without status",
			};

			await core.createTask(taskWithoutStatus);

			const loadedTask = await coreFileSystem(core).loadTask("task-991");
			expect(loadedTask?.status).toBe("To Do");
		});

		// createTaskFromInput is the shared create path for every surface (CLI, wizard, TUI, Web),
		// so applying defaultAssignee here is what keeps the surfaces consistent.
		it("should apply defaultAssignee to tasks and drafts created without an assignee", async () => {
			await initializeTestProject(core, "Default Assignee Project");
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Expected config");
			config.defaultAssignee = ["@alice", "@bob"];
			await coreFileSystem(core).saveConfig(config);

			const { task } = await core.createTaskFromInput({ title: "Inherits default" });
			expect(task.assignee).toEqual(["@alice", "@bob"]);

			const { task: draft } = await core.createTaskFromInput({ title: "Draft inherits default", status: "Draft" });
			expect(draft.assignee).toEqual(["@alice", "@bob"]);
		});

		it("should let an explicit assignee replace defaultAssignee entirely", async () => {
			await initializeTestProject(core, "Override Assignee Project");
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Expected config");
			config.defaultAssignee = ["@alice", "@bob"];
			await coreFileSystem(core).saveConfig(config);

			const { task } = await core.createTaskFromInput({ title: "Explicit assignee", assignee: ["@carol"] });
			expect(task.assignee).toEqual(["@carol"]);
		});

		// An explicit empty list is how every surface says "unassigned": CLI/draft `-a ""`,
		// The Web edit payload also reaches this method that way.
		it("should let an explicit empty assignee override defaultAssignee", async () => {
			await initializeTestProject(core, "Explicit Unassign Project");
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Expected config");
			config.defaultAssignee = ["@alice", "@bob"];
			await coreFileSystem(core).saveConfig(config);

			const { task } = await core.createTaskFromInput({ title: "Explicitly unassigned", assignee: [] });
			expect(task.assignee).toEqual([]);

			const { task: draft } = await core.createTaskFromInput({
				title: "Explicitly unassigned draft",
				status: "Draft",
				assignee: [],
			});
			expect(draft.assignee).toEqual([]);
		});

		it("should leave new tasks unassigned when defaultAssignee is empty", async () => {
			await initializeTestProject(core, "Empty Assignee Project");
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Expected config");
			config.defaultAssignee = [];
			await coreFileSystem(core).saveConfig(config);

			const { task } = await core.createTaskFromInput({ title: "No default assignee" });
			expect(task.assignee).toEqual([]);
		});
	});
});
