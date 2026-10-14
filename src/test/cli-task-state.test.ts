import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_COMMAND = ["agentic-workspace"];
let cliQueue = Promise.resolve();

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
	const result = () => {
		const execution = cliQueue.then(async () => {
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
			const exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
			const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
			if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
			return value;
		});
		cliQueue = execution.then(
			() => undefined,
			() => undefined,
		);
		return execution;
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

describe("CLI Integration", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli");
		await mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("task archive and state transition commands", () => {
		beforeEach(async () => {
			// Set up a git repository and initialize agentic-workspace

			const core = new Core(TEST_DIR);
			await initializeFilesystemTestProject(core, "Archive Test Project");
		});

		it("should archive a task", async () => {
			const core = new Core(TEST_DIR);

			// Create a test task
			await core.createTask({
				id: "task-1",
				title: "Archive Test Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["canceled"],
				dependencies: [],
				rawContent: "Task ready for archiving",
			});

			// Archive the task
			const { success } = await core.archiveTask("task-1");
			expect(success).toBe(true);

			// Verify task is no longer in tasks directory
			const task = await core.filesystem.loadTask("task-1");
			expect(task).toBeNull();

			// Verify task exists in archive
			const { readdir } = await import("node:fs/promises");
			const archiveFiles = await readdir(join(TEST_DIR, "agentic-workspace", "archive", "tasks"));
			expect(archiveFiles.some((f) => f.startsWith("task-1"))).toBe(true);
		});

		it("should handle archiving non-existent task", async () => {
			const core = new Core(TEST_DIR);

			const { success } = await core.archiveTask("task-999");
			expect(success).toBe(false);
		});

		it("refuses to archive a Done task through the CLI archive command", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-5",
				title: "Done CLI Archive Test Task",
				status: "Done",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["archive"],
				dependencies: [],
				rawContent: "Terminal-status task should be completed, not archived",
			});

			const result = await $`${CLI_COMMAND} task archive task-5`.cwd(TEST_DIR).nothrow().quiet();
			const output = result.stdout.toString() + result.stderr.toString();

			expect(result.exitCode).not.toBe(0);
			expect(output).toContain("Task TASK-5 is Done.");
			expect(output).toContain("Use: agentic-workspace task complete TASK-5");
			expect(await core.filesystem.loadTask("task-5")).not.toBeNull();

			const archivedTasks = await core.filesystem.listArchivedTasks();
			expect(archivedTasks.some((task) => task.id === "TASK-5")).toBe(false);
		});

		it("completes a Done task through the CLI cleanup command", async () => {
			const core = new Core(TEST_DIR);
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Failed to load config");
			await core.filesystem.saveConfig({ ...config, prefixes: { ...config.prefixes, task: "BACK" } });

			await core.createTask({
				id: "BACK-3",
				title: "Complete CLI Test Task",
				status: "Done",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["cleanup"],
				dependencies: [],
				rawContent: "Task ready for cleanup completion",
			});

			const result = await $`${CLI_COMMAND} task complete BACK-3`.cwd(TEST_DIR).nothrow().quiet();
			const output = result.stdout.toString() + result.stderr.toString();
			const completedTask = (await core.filesystem.listCompletedTasks()).find((task) => task.id === "BACK-3");
			if (!completedTask?.filePath) throw new Error("Completed task file was not found");

			expect(result.exitCode).toBe(0);
			expect(output).toContain("Completed task BACK-3.");
			expect(output.split("\n").find((line) => line.startsWith("File: "))).toBe(`File: ${completedTask.filePath}`);
			expect(await Bun.file(completedTask.filePath).exists()).toBe(true);
			expect(await core.filesystem.loadTask("BACK-3")).toBeNull();

			const completedTasks = await core.filesystem.listCompletedTasks();
			expect(completedTasks.some((task) => task.id === "BACK-3")).toBe(true);
		});

		it("refuses to complete a non-Done task through the CLI cleanup command", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-4",
				title: "Not Done CLI Test Task",
				status: "Not Done",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["cleanup"],
				dependencies: [],
				rawContent: "Task not ready for cleanup completion",
			});

			const result = await $`${CLI_COMMAND} task complete task-4`.cwd(TEST_DIR).nothrow().quiet();
			const output = result.stdout.toString() + result.stderr.toString();

			expect(result.exitCode).not.toBe(0);
			expect(output).toContain("Task TASK-4 is not Done.");
			expect(output).toContain('agentic-workspace task edit TASK-4 -s "Done"');
			expect(output).toContain("before cleanup");
			expect((await core.filesystem.loadTask("task-4"))?.status).toBe("Not Done");

			const completedTasks = await core.filesystem.listCompletedTasks();
			expect(completedTasks.some((task) => task.id === "TASK-4")).toBe(false);
		});

		it("should demote task to drafts", async () => {
			const core = new Core(TEST_DIR);

			// Create a test task
			await core.createTask({
				id: "task-2",
				title: "Demote Test Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["needs-revision"],
				dependencies: [],
				rawContent: "Task that needs to go back to drafts",
			});

			// Demote the task
			const { success } = await core.demoteTask("task-2");
			expect(success).toBe(true);

			// Verify task is no longer in tasks directory
			const task = await core.filesystem.loadTask("task-2");
			expect(task).toBeNull();

			// Verify demoted draft has new draft- ID
			const { readdir } = await import("node:fs/promises");
			const draftsFiles = await readdir(join(TEST_DIR, "agentic-workspace", "drafts"));
			expect(draftsFiles.some((f) => f.startsWith("draft-"))).toBe(true);

			// Verify draft can be loaded with draft- ID
			const demotedDraft = await core.filesystem.loadDraft("draft-1");
			expect(demotedDraft?.title).toBe("Demote Test Task");
		});

		it("should promote draft to tasks", async () => {
			const core = new Core(TEST_DIR);

			// Create a test draft through the canonical create path
			const { task: draft } = await core.createTaskFromInput({
				title: "Promote Test Draft",
				status: "Draft",
				labels: ["ready"],
				rawContent: "Draft ready for promotion",
			});

			// Promote the draft
			const success = await core.promoteDraft(draft.id);
			expect(success).toBe(true);

			// Verify draft is no longer in drafts directory
			const loadedDraft = await core.filesystem.loadDraft(draft.id);
			expect(loadedDraft).toBeNull();

			// Verify promoted task has new task- ID
			const { readdir } = await import("node:fs/promises");
			const tasksFiles = await readdir(join(TEST_DIR, "agentic-workspace", "tasks"));
			expect(tasksFiles.some((f) => f.startsWith("task-"))).toBe(true);

			// Verify task can be loaded with task- ID
			const promotedTask = await core.filesystem.loadTask("task-1");
			expect(promotedTask?.title).toBe("Promote Test Draft");
		});

		it("should archive a draft", async () => {
			const core = new Core(TEST_DIR);

			// Create a test draft through the canonical create path
			const { task: draft } = await core.createTaskFromInput({
				title: "Archive Test Draft",
				status: "Draft",
				labels: ["cancelled"],
				rawContent: "Draft that should be archived",
			});

			// Archive the draft
			const success = await core.archiveDraft(draft.id);
			expect(success).toBe(true);

			// Verify draft is no longer in drafts directory
			const loadedDraft = await core.filesystem.loadDraft(draft.id);
			expect(loadedDraft).toBeNull();

			// Verify draft exists in archive
			const { readdir } = await import("node:fs/promises");
			const archiveFiles = await readdir(join(TEST_DIR, "agentic-workspace", "archive", "drafts"));
			expect(archiveFiles.some((f) => f.startsWith(draft.id.toLowerCase()))).toBe(true);
		});

		it("should handle promoting non-existent draft", async () => {
			const core = new Core(TEST_DIR);

			const success = await core.promoteDraft("task-999");
			expect(success).toBe(false);
		});

		it("should handle demoting non-existent task", async () => {
			const core = new Core(TEST_DIR);

			const { success } = await core.demoteTask("task-999");
			expect(success).toBe(false);
		});

		it("should handle archiving non-existent draft", async () => {
			const core = new Core(TEST_DIR);

			const success = await core.archiveDraft("task-999");
			expect(success).toBe(false);
		});

		it("should commit archive operations automatically", async () => {
			const core = new Core(TEST_DIR);

			// Create and archive a task
			await core.createTask({
				id: "task-5",
				title: "Commit Archive Test",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Testing archive",
			});

			const { success } = await core.archiveTask("task-5");
			expect(success).toBe(true);

			// Verify operation completed successfully
			const task = await core.filesystem.loadTask("task-5");
			expect(task).toBeNull();
		});

		it("should preserve task content through state transitions", async () => {
			const core = new Core(TEST_DIR);

			// Create a task with rich content
			const originalTask = {
				id: "task-6",
				title: "Content Preservation Test",
				status: "In Progress",
				assignee: ["testuser"],
				createdDate: "2025-06-08",
				labels: ["important", "preservation-test"],
				dependencies: ["task-1", "task-2"],
				rawContent: "This task has rich metadata that should be preserved through transitions",
			};

			await core.createTask(originalTask);

			// Demote to draft - note: this generates a new draft ID
			await core.demoteTask("task-6");

			// Find the demoted draft (it will have a new draft- ID)
			const drafts = await core.filesystem.listDrafts();
			const asDraft = drafts.find((d) => d.title === originalTask.title);

			expect(asDraft?.title).toBe(originalTask.title);
			expect(asDraft?.assignee).toEqual(originalTask.assignee);
			expect(asDraft?.labels).toEqual(originalTask.labels);
			expect(asDraft?.dependencies).toEqual(originalTask.dependencies);
			expect(asDraft?.rawContent).toContain(originalTask.rawContent);

			// Promote back to task - use the draft's new ID
			expect(asDraft).toBeDefined();
			if (!asDraft) {
				throw new Error("Expected demoted draft to exist");
			}
			await core.promoteDraft(asDraft.id);

			// Find the promoted task (it will have a new task- ID)
			const tasks = await core.filesystem.listTasks();
			const backToTask = tasks.find((t) => t.title === originalTask.title);

			expect(backToTask?.title).toBe(originalTask.title);
			expect(backToTask?.assignee).toEqual(originalTask.assignee);
			expect(backToTask?.labels).toEqual(originalTask.labels);
			expect(backToTask?.dependencies).toEqual(originalTask.dependencies);
			expect(backToTask?.rawContent).toContain(originalTask.rawContent);
		});
	});
});
