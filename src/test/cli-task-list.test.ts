import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_COMMAND = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.startsWith('"agentic-workspace"')) return shell(parts, ...values);
	const args =
		source
			.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g)
			?.map((arg) =>
				arg.startsWith('"') ? (JSON.parse(arg) as string) : arg.startsWith("'") ? arg.slice(1, -1) : arg,
			) ?? [];
	const config: { cwd?: string; env?: Record<string, string | undefined>; nothrow?: boolean } = {};
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
		const originalEnv = config.env
			? Object.fromEntries(Object.keys(config.env).map((key) => [key, process.env[key]]))
			: undefined;
		if (config.env)
			for (const [key, value] of Object.entries(config.env)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
		let exitCode: number;
		try {
			exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
		} finally {
			if (originalEnv)
				for (const [key, value] of Object.entries(originalEnv)) {
					if (value === undefined) delete process.env[key];
					else process.env[key] = value;
				}
		}
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) throw new Error(value.stderr || `CLI exited with ${value.exitCode}`);
		return value;
	};
	const chain = {
		cwd(value: string) {
			config.cwd = value;
			return chain;
		},
		env(value: Record<string, string | undefined>) {
			config.env = value;
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

	describe("task list command", () => {
		beforeEach(async () => {
			// Set up a git repository and initialize agentic-workspace
			await $`git init -b main`.cwd(TEST_DIR).quiet();

			const core = new Core(TEST_DIR);
			await initializeTestProject(core, "List Test Project");
		});

		it("should show 'No tasks found' when no tasks exist", async () => {
			const result = await $`${CLI_COMMAND} task list --plain`.cwd(TEST_DIR).quiet();

			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toContain("No tasks found");
		});

		it("should list tasks grouped by status", async () => {
			const core = new Core(TEST_DIR);

			// Create test tasks with different statuses
			await core.createTask({
				id: "task-1",
				title: "First Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "First test task",
			});

			await core.createTask({
				id: "task-2",
				title: "Second Task",
				status: "Done",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Second test task",
			});

			await core.createTask({
				id: "task-3",
				title: "Third Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Third test task",
			});

			const tasks = await core.filesystem.listTasks();
			expect(tasks).toHaveLength(3);

			// Verify tasks are grouped correctly by status
			const todoTasks = tasks.filter((t) => t.status === "To Do");
			const doneTasks = tasks.filter((t) => t.status === "Done");

			expect(todoTasks).toHaveLength(2);
			expect(doneTasks).toHaveLength(1);
			expect(todoTasks.map((t) => t.id)).toEqual(["TASK-1", "TASK-3"]); // IDs normalized to uppercase
			expect(doneTasks.map((t) => t.id)).toEqual(["TASK-2"]); // IDs normalized to uppercase
		});

		it("should respect config status order", async () => {
			const core = new Core(TEST_DIR);

			// Load and verify default config status order
			const config = await core.filesystem.loadConfig();
			expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
		});
	});
});
