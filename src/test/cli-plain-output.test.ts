import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let SUBTASKS: Array<{ id: string; title: string }> = [];
const CLI_COMMAND = ["agentic-workspace"];

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

describe("CLI plain output for AI agents", () => {
	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-plain-output");
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git repo first using shell API (same pattern as other tests)

		// Initialize agentic-workspace project using Core (same pattern as other tests)
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Plain Output Test Project");

		// Create a test task
		await core.createTask({
			id: "task-1",
			title: "Test task for plain output",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-18",
			labels: [],
			dependencies: [],
			description: "Test description",
		});

		const { task: subtask1 } = await core.createTaskFromInput({
			title: "Child task A",
			parentTaskId: "task-1",
		});

		const { task: subtask2 } = await core.createTaskFromInput({
			title: "Child task B",
			parentTaskId: "task-1",
		});

		// Preserve order for assertions
		SUBTASKS = [subtask1, subtask2];

		// Create a second task without subtasks
		await core.createTask({
			id: "task-2",
			title: "Standalone task for plain output",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-19",
			labels: [],
			dependencies: [],
			description: "Standalone description",
		});

		// Create a test draft through the canonical create path
		await core.createTaskFromInput({
			title: "Test draft for plain output",
			status: "Draft",
			description: "Test draft description",
		});
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("should output plain text with task view --plain", async () => {
		const result = await $`${CLI_COMMAND} task view 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("task-1/task.md");
		// Should contain the formatted task output
		expect(result.stdout.toString()).toContain("Task TASK-1 - Test task for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ To Do");
		expect(result.stdout.toString()).toContain("Created: 2025-06-18 (UTC)");
		expect(result.stdout.toString()).toContain("Subtasks (2):");
		const [subtask1, subtask2] = SUBTASKS;
		if (subtask1 && subtask2) {
			const output = result.stdout.toString();
			expect(output).toContain(`- ${subtask1.id} - ${subtask1.title}`);
			expect(output).toContain(`- ${subtask2.id} - ${subtask2.title}`);
			expect(output.indexOf(subtask1.id)).toBeLessThan(output.indexOf(subtask2.id));
		}
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test description");
		expect(result.stdout.toString()).not.toContain("Agent Summary:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");

		const taskFile = await readFile(join(TEST_DIR, "agentic-workspace/tasks/task-1/task.md"), "utf8");
		expect(taskFile).toContain("created_date: '2025-06-18'");
		expect(taskFile).not.toContain("(UTC)");
	});

	it("should output plain text with task <id> --plain shortcut", async () => {
		// Verify task exists before running CLI command
		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");
		expect(task).not.toBeNull();
		expect(task?.id).toBe("TASK-1");

		const result = await $`${CLI_COMMAND} task 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("task-1/task.md");
		// Should contain the formatted task output
		expect(result.stdout.toString()).toContain("Task TASK-1 - Test task for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ To Do");
		expect(result.stdout.toString()).toContain("Created: 2025-06-18 (UTC)");
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test description");
		expect(result.stdout.toString()).not.toContain("Agent Summary:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");
	});

	it("should not include a subtask list when none exist", async () => {
		const result = await $`${CLI_COMMAND} task view 2 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Task TASK-2 - Standalone task for plain output");
		expect(result.stdout.toString()).not.toContain("Subtasks (");
		expect(result.stdout.toString()).not.toContain("Subtasks:");
	});

	it("should output plain text with draft view --plain", async () => {
		const result = await $`${CLI_COMMAND} draft view 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("draft-1/task.md");
		// Should contain the formatted draft output
		expect(result.stdout.toString()).toContain("Task DRAFT-1 - Test draft for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ Draft");
		expect(result.stdout.toString()).toMatch(/Created:\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC\)/);
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test draft description");
		expect(result.stdout.toString()).not.toContain("Agent Summary:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");
	});

	it("should output plain text with draft <id> --plain shortcut", async () => {
		// Verify draft exists before running CLI command
		const core = new Core(TEST_DIR);
		const draft = await core.filesystem.loadDraft("draft-1");
		expect(draft).not.toBeNull();
		expect(draft?.id).toBe("DRAFT-1");

		const result = await $`${CLI_COMMAND} draft 1 --plain`.cwd(TEST_DIR).quiet();

		if (result.exitCode !== 0) {
			console.error("STDOUT:", result.stdout.toString());
			console.error("STDERR:", result.stderr.toString());
		}

		expect(result.exitCode).toBe(0);
		// Should contain the file path as first line
		expect(result.stdout.toString()).toContain("File: ");
		expect(result.stdout.toString()).toContain("draft-1/task.md");
		// Should contain the formatted draft output
		expect(result.stdout.toString()).toContain("Task DRAFT-1 - Test draft for plain output");
		expect(result.stdout.toString()).toContain("Status: ○ Draft");
		expect(result.stdout.toString()).toMatch(/Created:\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(UTC\)/);
		expect(result.stdout.toString()).toContain("Description:");
		expect(result.stdout.toString()).toContain("Test draft description");
		expect(result.stdout.toString()).not.toContain("Agent Summary:");
		// Should not contain TUI escape codes
		expect(result.stdout.toString()).not.toContain("[?1049h");
		expect(result.stdout.toString()).not.toContain("\x1b");
	});

	// Task list already has --plain support and works correctly
});
