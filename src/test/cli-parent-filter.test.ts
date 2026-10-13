import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../utils/task-path.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const cliCommand = ["agenticworkspace"];

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
 * Builds a fresh parent/child project in its own directory. Cases that mutate the project (completing
 * the parent, seeding a duplicate file) each get their own copy, so the whole group runs concurrently.
 */
async function createParentFilterProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-parent-filter");
	await mkdir(dir, { recursive: true });

	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Parent Filter Test Project");

	// Create a parent task
	await core.createTask({
		id: "task-1",
		title: "Parent task",
		status: "To Do",
		assignee: [],
		createdDate: "2025-06-18",
		labels: [],
		dependencies: [],
		description: "Parent task description",
	});

	// Create child tasks
	await core.createTask({
		id: "task-1.1",
		title: "Child task 1",
		status: "To Do",
		assignee: [],
		createdDate: "2025-06-18",
		labels: [],
		dependencies: [],
		description: "Child task 1 description",
		parentTaskId: "task-1",
	});

	await core.createTask({
		id: "task-1.2",
		title: "Child task 2",
		status: "In Progress",
		assignee: [],
		createdDate: "2025-06-18",
		labels: [],
		dependencies: [],
		description: "Child task 2 description",
		parentTaskId: "task-1",
	});

	// Create another standalone task
	await core.createTask({
		id: "task-2",
		title: "Standalone task",
		status: "To Do",
		assignee: [],
		createdDate: "2025-06-18",
		labels: [],
		dependencies: [],
		description: "Standalone task description",
	});

	return { dir, core };
}

describe("CLI parent task filtering", () => {
	it("should filter tasks by parent with full task ID", async () => {
		const { dir } = await createParentFilterProject();
		try {
			const result = await $`${cliCommand} task list --parent task-1 --plain`.cwd(dir).quiet();

			const exitCode = result.exitCode;

			if (exitCode !== 0) {
				console.error("STDOUT:", result.stdout.toString());
				console.error("STDERR:", result.stderr.toString());
			}

			expect(exitCode).toBe(0);
			// Should contain only child tasks
			expect(result.stdout.toString()).toContain("TASK-1.1 - Child task 1");
			expect(result.stdout.toString()).toContain("TASK-1.2 - Child task 2");
			// Should not contain parent or standalone tasks
			expect(result.stdout.toString()).not.toContain("TASK-1 - Parent task");
			expect(result.stdout.toString()).not.toContain("TASK-2 - Standalone task");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("should filter tasks by parent with short task ID", async () => {
		const { dir } = await createParentFilterProject();
		try {
			const result = await $`${cliCommand} task list --parent 1 --plain`.cwd(dir).quiet();

			const exitCode = result.exitCode;

			if (exitCode !== 0) {
				console.error("STDOUT:", result.stdout.toString());
				console.error("STDERR:", result.stderr.toString());
			}

			expect(exitCode).toBe(0);
			// Should contain only child tasks
			expect(result.stdout.toString()).toContain("TASK-1.1 - Child task 1");
			expect(result.stdout.toString()).toContain("TASK-1.2 - Child task 2");
			// Should not contain parent or standalone tasks
			expect(result.stdout.toString()).not.toContain("TASK-1 - Parent task");
			expect(result.stdout.toString()).not.toContain("TASK-2 - Standalone task");
		} finally {
			await safeCleanup(dir);
		}
	});

	// One ID must not be a filterable parent for one command and a missing task for another, so the
	// filter resolves the parent through the same working-copy lookup as task view and task create.
	it("keeps the parent filter, task view, and create --parent in agreement about a completed parent", async () => {
		const { dir, core } = await createParentFilterProject();
		try {
			await core.editTask("task-1", { status: "Done" });
			expect(await core.completeTask("task-1")).toBe(true);

			const view = await $`${cliCommand} task view 1 --plain`.cwd(dir).nothrow().quiet();
			const filtered = await $`${cliCommand} task list --parent 1 --plain`.cwd(dir).nothrow().quiet();
			expect(view.exitCode).toBe(0);
			expect(view.stdout.toString()).toContain("Parent task");

			expect(filtered.exitCode).toBe(0);
			expect(filtered.stdout.toString()).toContain("TASK-1.1 - Child task 1");
			expect(filtered.stdout.toString()).toContain("TASK-1.2 - Child task 2");
			expect(filtered.stdout.toString()).not.toContain("TASK-2 - Standalone task");

			const created = await $`${cliCommand} task create ${"Late child"} --parent 1`.cwd(dir).nothrow().quiet();
			expect(created.exitCode).toBe(0);
			expect((await core.filesystem.loadTask("task-1.3"))?.parentTaskId).toBe("TASK-1");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("filters by the exact unpadded parent when a padded sibling exists", async () => {
		const { dir, core } = await createParentFilterProject();
		try {
			const tasksDir = core.filesystem.tasksDir;
			await mkdir(join(tasksDir, "task-01"), { recursive: true });
			await Bun.write(
				join(tasksDir, "task-01", "task.md"),
				(await Bun.file(join(tasksDir, "task-1", "task.md")).text()).replace("id: TASK-1", "id: TASK-01"),
			);

			const result = await $`${cliCommand} task list --parent 1 --plain`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).toBe(0);
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;
			expect(output).not.toContain("is ambiguous");
			expect(result.stdout.toString()).toContain("TASK-1.1 - Child task 1");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("should show error for non-existent parent task", async () => {
		const { dir } = await createParentFilterProject();
		try {
			const result = await $`${cliCommand} task list --parent task-999 --plain`.cwd(dir).nothrow().quiet();

			const exitCode = result.exitCode;

			expect(exitCode).toBe(1); // CLI exits with error for non-existent parent
			expect(result.stderr.toString()).toContain("Parent task TASK-999 not found.");
			expect(result.stderr.toString()).toContain(LOCAL_TASK_LOOKUP_HINT);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("should show message when parent has no children", async () => {
		const { dir } = await createParentFilterProject();
		try {
			const result = await $`${cliCommand} task list --parent task-2 --plain`.cwd(dir).quiet();

			const exitCode = result.exitCode;

			if (exitCode !== 0) {
				console.error("STDOUT:", result.stdout.toString());
				console.error("STDERR:", result.stderr.toString());
			}

			expect(exitCode).toBe(0);
			expect(result.stdout.toString()).toContain("No child tasks found for parent task TASK-2.");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("should work with -p shorthand flag", async () => {
		const { dir } = await createParentFilterProject();
		try {
			const result = await $`${cliCommand} task list -p task-1 --plain`.cwd(dir).quiet();

			const exitCode = result.exitCode;

			if (exitCode !== 0) {
				console.error("STDOUT:", result.stdout.toString());
				console.error("STDERR:", result.stderr.toString());
			}

			expect(exitCode).toBe(0);
			// Should contain only child tasks
			expect(result.stdout.toString()).toContain("TASK-1.1 - Child task 1");
			expect(result.stdout.toString()).toContain("TASK-1.2 - Child task 2");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("should combine parent filter with status filter", async () => {
		const { dir } = await createParentFilterProject();
		try {
			const result = await $`${cliCommand} task list --parent task-1 --status "To Do" --plain`.cwd(dir).quiet();

			const exitCode = result.exitCode;

			if (exitCode !== 0) {
				console.error("STDOUT:", result.stdout.toString());
				console.error("STDERR:", result.stderr.toString());
			}

			expect(exitCode).toBe(0);
			// Should contain only child task with "To Do" status
			expect(result.stdout.toString()).toContain("TASK-1.1 - Child task 1");
			// Should not contain child task with "In Progress" status
			expect(result.stdout.toString()).not.toContain("TASK-1.2 - Child task 2");
		} finally {
			await safeCleanup(dir);
		}
	});
});
