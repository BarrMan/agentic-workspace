import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { generateKanbanBoardWithMetadata } from "../board.ts";
import { runCli } from "../cli/register.ts";
import { Core, exportKanbanBoardToFile } from "../index.ts";
import { serializeTask } from "../markdown/serializer.ts";
import type { Decision, Document } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.includes("agentic-workspace")) return shell(parts, ...values);
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
		const exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
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

function concurrentTest(name: string, body: () => Promise<void>): void {
	it(name, body);
}

/** Every case owns its project directory independently. */
async function setupDocProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-cli");
	await mkdir(dir, { recursive: true });
	await $`git init -b main`.cwd(dir).quiet();

	const core = new Core(dir);
	await initializeTestProject(core, "Doc Test Project");
	return { dir, core };
}

async function setupBoardProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-cli");
	await mkdir(dir, { recursive: true });
	await $`git init -b main`.cwd(dir).quiet();

	const core = new Core(dir);
	await initializeTestProject(core, "Board Test Project", true);
	return { dir, core };
}

describe("CLI Integration", () => {
	describe("doc and decision commands", () => {
		concurrentTest("should create and list documents", async () => {
			const { dir, core } = await setupDocProject();
			try {
				const doc: Document = {
					id: "doc-1",
					title: "Guide",
					type: "guide",
					createdDate: "2025-06-08",
					rawContent: "Content",
				};
				await core.createDocument(doc);

				const docs = await core.filesystem.listDocuments();
				expect(docs).toHaveLength(1);
				expect(docs[0]?.title).toBe("Guide");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should create documents in a subpath and print the persisted path", async () => {
			const { dir, core } = await setupDocProject();
			try {
				const result = await $`${CLI_COMMAND} doc create "Setup Guide" -p guides/setup`.cwd(dir).quiet();
				expect(result.exitCode).toBe(0);
				const stdout = result.stdout.toString();
				expect(stdout).toContain("Created document doc-1");
				expect(stdout).toContain("Path: agentic-workspace/docs/guides/setup/doc-1 - Setup-Guide.md");

				const docs = await core.filesystem.listDocuments();
				expect(docs[0]?.path).toBe("guides/setup/doc-1 - Setup-Guide.md");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should accept --plain on doc create and print the plain result", async () => {
			const { dir } = await setupDocProject();
			try {
				const result = await $`${CLI_COMMAND} doc create "Setup Guide" --plain`.cwd(dir).nothrow().quiet();
				expect(result.exitCode).toBe(0);
				expect(result.stderr.toString()).not.toContain("unknown option");
				const stdout = result.stdout.toString();
				expect(stdout).toContain("Created document doc-1");
				expect(stdout).toContain("Path: agentic-workspace/docs/doc-1 - Setup-Guide.md");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should reject unsafe document paths", async () => {
			const { dir } = await setupDocProject();
			try {
				const result = await $`${CLI_COMMAND} doc create "Unsafe" -p ../outside`.cwd(dir).nothrow().quiet();
				expect(result.exitCode).not.toBe(0);
				expect(result.stderr.toString()).toContain("Document path cannot include traversal segments.");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should update document content and metadata", async () => {
			const { dir, core } = await setupDocProject();
			try {
				await core.createDocument(
					{
						id: "doc-1",
						title: "Setup Guide",
						type: "guide",
						createdDate: "2025-06-08",
						rawContent: "Old content",
						tags: ["setup"],
					},
					"guides/setup",
				);

				const updatedContent = "# Updated\n\nRun install steps.";
				const result =
					await $`${CLI_COMMAND} doc update doc-1 --title "Install Runbook" --content ${updatedContent} -t design --tags ops,runbook -p runbooks`
						.cwd(dir)
						.quiet();
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString()).toContain("Updated document doc-1");
				expect(result.stdout.toString()).toContain("Path: agentic-workspace/docs/runbooks/doc-1 - Install-Runbook.md");

				const docs = await core.filesystem.listDocuments();
				const updated = docs.find((doc) => doc.id === "doc-1");
				expect(updated?.title).toBe("Install Runbook");
				expect(updated?.type as string).toBe("design");
				expect(updated?.tags).toEqual(["ops", "runbook"]);
				expect(updated?.path).toBe("runbooks/doc-1 - Install-Runbook.md");
				expect(updated?.rawContent.trimEnd()).toBe(updatedContent);
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should preserve omitted document fields when updating", async () => {
			const { dir, core } = await setupDocProject();
			try {
				await core.createDocument(
					{
						id: "doc-1",
						title: "Setup Guide",
						type: "guide",
						createdDate: "2025-06-08",
						rawContent: "Keep this content",
						tags: ["setup", "guide"],
					},
					"guides",
				);

				await $`${CLI_COMMAND} doc update doc-1 --title "Setup Handbook"`.cwd(dir).quiet();

				const docs = await core.filesystem.listDocuments();
				const updated = docs.find((doc) => doc.id === "doc-1");
				expect(updated?.title).toBe("Setup Handbook");
				expect(updated?.type).toBe("guide");
				expect(updated?.tags).toEqual(["setup", "guide"]);
				expect(updated?.path).toBe("guides/doc-1 - Setup-Handbook.md");
				expect(updated?.rawContent.trimEnd()).toBe("Keep this content");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should reject invalid document update inputs", async () => {
			const { dir, core } = await setupDocProject();
			try {
				await core.createDocument({
					id: "doc-1",
					title: "Setup Guide",
					type: "guide",
					createdDate: "2025-06-08",
					rawContent: "Content",
				});

				// All three rejections are independent and leave the store untouched.
				const missing = await $`${CLI_COMMAND} doc update doc-404 --content "Nope"`.cwd(dir).nothrow().quiet();
				const invalidType = await $`${CLI_COMMAND} doc update doc-1 --content "Nope" -t invalid`
					.cwd(dir)
					.nothrow()
					.quiet();
				const unsafePath = await $`${CLI_COMMAND} doc update doc-1 --content "Nope" -p ../outside`
					.cwd(dir)
					.nothrow()
					.quiet();
				expect(missing.exitCode).not.toBe(0);
				expect(missing.stderr.toString()).toContain("Document not found: doc-404");

				expect(invalidType.exitCode).not.toBe(0);
				expect(invalidType.stderr.toString()).toContain(
					"Document type must be one of: guide, reference, design, other.",
				);

				expect(unsafePath.exitCode).not.toBe(0);
				expect(unsafePath.stderr.toString()).toContain("Document path cannot include traversal segments.");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should create and list decisions", async () => {
			const { dir, core } = await setupDocProject();
			try {
				const decision: Decision = {
					id: "decision-1",
					title: "Choose Stack",
					date: "2025-06-08",
					status: "accepted",
					context: "context",
					decision: "decide",
					consequences: "conseq",
					rawContent: "",
				};
				await core.createDecision(decision);
				const decisions = await core.filesystem.listDecisions();
				expect(decisions).toHaveLength(1);
				expect(decisions[0]?.title).toBe("Choose Stack");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should accept --plain when creating a decision", async () => {
			const { dir, core } = await setupDocProject();
			try {
				const result = await $`${CLI_COMMAND} decision create "Choose Stack" --plain`.cwd(dir).nothrow().quiet();
				expect(result.exitCode).toBe(0);
				expect(result.stderr.toString()).toBe("");

				const stdout = result.stdout.toString();
				expect(stdout.trim()).toBe("Created decision decision-1");
				expect(stdout.includes("[")).toBe(false);

				const decisions = await core.filesystem.listDecisions();
				expect(decisions).toHaveLength(1);
				expect(decisions[0]?.title).toBe("Choose Stack");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should list decisions with id, title, and status as plain text", async () => {
			const { dir } = await setupDocProject();
			try {
				await $`${CLI_COMMAND} decision create "Choose Stack" -s accepted`.cwd(dir).quiet();
				await $`${CLI_COMMAND} decision create "Adopt Free Form Status" -s "Under Review"`.cwd(dir).quiet();

				const result = await $`${CLI_COMMAND} decision list --plain`.cwd(dir).quiet();
				expect(result.exitCode).toBe(0);
				const lines = result.stdout.toString().trim().split("\n");
				expect(lines).toEqual([
					"decision-1 - Choose Stack (accepted)",
					"decision-2 - Adopt Free Form Status (Under Review)",
				]);
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should default to text output when stdout is not a TTY", async () => {
			const { dir } = await setupDocProject();
			try {
				await $`${CLI_COMMAND} decision create "Choose Stack"`.cwd(dir).quiet();

				const result = await $`${CLI_COMMAND} decision list`.cwd(dir).quiet();
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString().trim()).toBe("decision-1 - Choose Stack (proposed)");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should report an empty decision log in both output modes", async () => {
			const { dir } = await setupDocProject();
			try {
				const plain = await $`${CLI_COMMAND} decision list --plain`.cwd(dir).quiet();
				const json = await $`${CLI_COMMAND} decision list --json`.cwd(dir).quiet();
				expect(plain.exitCode).toBe(0);
				expect(plain.stdout.toString().trim()).toBe("No decisions found.");

				expect(json.exitCode).toBe(0);
				expect(JSON.parse(json.stdout.toString())).toEqual({
					schemaVersion: 1,
					kind: "decision-list",
					decisions: [],
				});
			} finally {
				await safeCleanup(dir);
			}
		});
	});

	describe("board view command", () => {
		concurrentTest("should print the configured project name in the piped board header", async () => {
			const { dir, core } = await setupBoardProject();
			try {
				await core.createTask({
					id: "task-1",
					title: "Todo Task",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A task in todo",
				});

				// Piping makes stdout a non-TTY, which is the plain-text board fallback.
				const result = await $`${CLI_COMMAND} board`.cwd(dir).nothrow().quiet();
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString()).toContain("Project: Board Test Project");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should display kanban board with tasks grouped by status", async () => {
			const { dir, core } = await setupBoardProject();
			try {
				// Create test tasks with different statuses
				await core.createTask({
					id: "task-1",
					title: "Todo Task",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A task in todo",
				});

				await core.createTask({
					id: "task-2",
					title: "Progress Task",
					status: "In Progress",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A task in progress",
				});

				await core.createTask({
					id: "task-3",
					title: "Done Task",
					status: "Done",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "A completed task",
				});

				const tasks = await core.filesystem.listTasks();
				expect(tasks).toHaveLength(3);

				const config = await core.filesystem.loadConfig();
				const statuses = config?.statuses || [];
				expect(statuses).toEqual(["To Do", "In Progress", "Done"]);

				// Test the kanban board generation
				const board = generateKanbanBoardWithMetadata(tasks, statuses, "Test Project");

				// Verify board contains all statuses and tasks (now on separate lines)
				expect(board).toContain("To Do");
				expect(board).toContain("In Progress");
				expect(board).toContain("Done");
				expect(board).toContain("TASK-1");
				expect(board).toContain("Todo Task");
				expect(board).toContain("TASK-2");
				expect(board).toContain("Progress Task");
				expect(board).toContain("TASK-3");
				expect(board).toContain("Done Task");

				// Verify board structure (now includes metadata header)
				const lines = board.split("\n");
				expect(board).toContain("# Kanban Board Export");
				expect(board).toContain("To Do");
				expect(board).toContain("In Progress");
				expect(board).toContain("Done");
				expect(board).toContain("|"); // Table structure
				expect(lines.length).toBeGreaterThan(5); // Should have content rows
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should handle empty project with default statuses", async () => {
			const { dir, core } = await setupBoardProject();
			try {
				const tasks = await core.filesystem.listTasks();
				expect(tasks).toHaveLength(0);

				const config = await core.filesystem.loadConfig();
				const statuses = config?.statuses || [];

				const board = generateKanbanBoardWithMetadata(tasks, statuses, "Test Project");

				// Should return board with metadata, configured status columns, and empty-state message
				expect(board).toContain("# Kanban Board Export");
				expect(board).toContain("| To Do | In Progress | Done |");
				expect(board).toContain("No tasks found");
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should accept --vertical and --layout vertical on the board command", async () => {
			const { dir, core } = await setupBoardProject();
			try {
				await core.createTask({
					id: "task-1",
					title: "Shortcut Task",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-09",
					labels: [],
					dependencies: [],
					rawContent: "Testing vertical shortcut",
				});

				// The piped board path renders the same board for both spellings of the layout option;
				// this guards that the flags stay registered and do not break the render.
				const results = [
					await $`${CLI_COMMAND} board --vertical`.cwd(dir).nothrow().quiet(),
					await $`${CLI_COMMAND} board --layout vertical`.cwd(dir).nothrow().quiet(),
				];
				for (const result of results) {
					expect(result.exitCode).toBe(0);
					const board = result.stdout.toString();
					expect(board).toContain("# Kanban Board Export");
					expect(board).toContain("To Do");
					expect(board).toContain("TASK-1");
					expect(board).toContain("Shortcut Task");
				}
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should default to view when no subcommand is provided", async () => {
			const { dir, core } = await setupBoardProject();
			try {
				await core.createTask({
					id: "task-99",
					title: "Default Cmd Task",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-10",
					labels: [],
					dependencies: [],
					rawContent: "test",
				});

				const resultDefault = await $`${CLI_COMMAND} board`.cwd(dir).quiet();
				const resultView = await $`${CLI_COMMAND} board view`.cwd(dir).quiet();

				expect(resultDefault.exitCode).toBe(0);
				expect(resultView.exitCode).toBe(0);
				expect(resultDefault.stdout).toContain("TASK-99");

				// The two runs stamp their own wall-clock time, so pin only that line and compare
				// every other line byte-for-byte.
				const contentOnly = (board: string) => board.replace(/^Generated on: .*$/m, "Generated on: <timestamp>");
				expect(resultDefault.stdout).toMatch(/^Generated on: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/m);
				expect(resultView.stdout).toMatch(/^Generated on: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/m);
				expect(contentOnly(resultDefault.stdout)).toBe(contentOnly(resultView.stdout));
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("should export kanban board to file", async () => {
			const { dir, core } = await setupBoardProject();
			try {
				// Create test tasks
				await core.createTask({
					id: "task-1",
					title: "Export Test Task",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-09",
					labels: [],
					dependencies: [],
					rawContent: "Testing board export",
				});

				const outputPath = join(dir, "test-export.md");
				const tasks = await core.filesystem.listTasks();
				const config = await core.filesystem.loadConfig();
				const statuses = config?.statuses || [];

				await exportKanbanBoardToFile(tasks, statuses, outputPath, "TestProject");

				// Verify file was created and contains expected content
				const content = await Bun.file(outputPath).text();
				expect(content).toContain("To Do");
				expect(content).toContain("TASK-1");
				expect(content).toContain("Export Test Task");
				expect(content).toContain("# Kanban Board Export (powered by AgenticWorkspace)");
				expect(content).toContain("Project: TestProject");

				// Test overwrite behavior
				await exportKanbanBoardToFile(tasks, statuses, outputPath, "TestProject");
				const overwrittenContent = await Bun.file(outputPath).text();
				const occurrences = overwrittenContent.split("TASK-1").length - 1;
				expect(occurrences).toBe(1); // Should appear once after overwrite
			} finally {
				await safeCleanup(dir);
			}
		});

		concurrentTest("blocks board export when duplicate task IDs exist", async () => {
			const { dir, core } = await setupBoardProject();
			try {
				const task = {
					id: "TASK-7",
					title: "Duplicate task",
					status: "To Do",
					assignee: [],
					createdDate: "2026-01-01",
					labels: [],
					dependencies: [],
				};
				await core.createTask(task);
				const completedPath = join(core.filesystem.completedDir, "task-7", "task.md");
				await mkdir(join(completedPath, ".."), { recursive: true });
				await Bun.write(completedPath, serializeTask({ ...task, title: "Completed duplicate" }));

				const outputPath = join(dir, "Collision-board.md");
				await Bun.write(outputPath, "sentinel board content");
				const result = await $`${CLI_COMMAND} board export Collision-board.md --force`.cwd(dir).nothrow().quiet();
				expect(result.exitCode).toBe(1);
				expect(result.stderr).toContain("Task ID TASK-7 is ambiguous; review the duplicate records manually:");
				expect(result.stderr).toContain("agentic-workspace/tasks/task-7/task.md");
				expect(result.stderr).toContain("agentic-workspace/completed/task-7/task.md");
				expect(await Bun.file(outputPath).text()).toBe("sentinel board content");
			} finally {
				await safeCleanup(dir);
			}
		});
	});
});
