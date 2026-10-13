import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("--desc alias functionality", () => {
	const cli = async (args: string[], cwd: string) => {
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
		if (exitCode) throw new Error(stderr.join("") || `CLI exited with ${exitCode}`);
		return stdout.join("");
	};

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-desc-alias");
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize backlog project using Core
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Desc Alias Test Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("should create task with --desc alias", async () => {
		await cli(["task", "create", "Test --desc alias", "--desc", "Created with --desc"], TEST_DIR);

		// Check that command succeeded (no exception thrown)
		const output = await cli(["task", "1", "--plain"], TEST_DIR);
		expect(output).toContain("Test --desc alias");
		expect(output).toContain("Created with --desc");
	});

	it("should verify task created with --desc has correct description", async () => {
		// Create task with --desc
		await cli(["task", "create", "Test task", "--desc", "Description via --desc"], TEST_DIR);

		// Verify the task was created with correct description
		const core = new Core(TEST_DIR);
		const task = await core.filesystem.loadTask("task-1");

		expect(task).not.toBeNull();
		expect(task?.description).toContain("Description via --desc");
	});

	it("should edit task description with --desc alias", async () => {
		// Create initial task
		const core = new Core(TEST_DIR);
		await core.createTask({
			id: "task-1",
			title: "Edit test task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-07-04",
			labels: [],
			dependencies: [],
			description: "Original description",
		});

		// Edit with --desc
		await cli(["task", "edit", "1", "--desc", "Updated via --desc"], TEST_DIR);

		// Command succeeded without throwing

		// Verify the description was updated
		const updatedTask = await core.filesystem.loadTask("task-1");
		expect(updatedTask?.description).toContain("Updated via --desc");
	});

	it("should verify draft created with --desc has correct description", async () => {
		// Create draft with --desc
		await cli(["draft", "create", "Test draft", "--desc", "Draft via --desc"], TEST_DIR);

		// Verify the draft was created with correct description
		const core = new Core(TEST_DIR);
		const draft = await core.filesystem.loadDraft("draft-1");

		expect(draft).not.toBeNull();
		expect(draft?.description).toContain("Draft via --desc");
	});

	it("should show --desc in help text", async () => {
		const result = await cli(["task", "create", "--help"], TEST_DIR);

		expect(result).toContain("-d, --description <text>");
		expect(result).toContain("--desc <text>");
		expect(result).toContain("alias for --description");
	});
});
