import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

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

let TEST_DIR: string;
let ID_MILESTONE_ID: string;

// runCli mutates process globals, so CLI calls in this suite remain serial.
describe("CLI milestone filtering", () => {
	const cliCommand = CLI_COMMAND;

	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-milestone-filter");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Milestone Filter Test Project");
		const newMilestone = await core.filesystem.createMilestone("New Milestones UI");
		ID_MILESTONE_ID = newMilestone.id;

		await core.createTask({
			id: "task-1",
			title: "Milestone task one",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-18",
			labels: [],
			dependencies: [],
			description: "Task in release milestone",
			milestone: "Release-1",
		});

		await core.createTask({
			id: "task-2",
			title: "Milestone task two",
			status: "In Progress",
			assignee: [],
			createdDate: "2025-06-18",
			labels: [],
			dependencies: [],
			description: "Task in same milestone with different case",
			milestone: "release-1",
		});

		await core.createTask({
			id: "task-3",
			title: "Other milestone task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-18",
			labels: [],
			dependencies: [],
			description: "Task in different milestone",
			milestone: "Release-2",
		});

		await core.createTask({
			id: "task-4",
			title: "No milestone task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-18",
			labels: [],
			dependencies: [],
			description: "Task without milestone",
		});

		await core.createTask({
			id: "task-5",
			title: "Roadmap milestone task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-18",
			labels: [],
			dependencies: [],
			description: "Task in roadmap milestone",
			milestone: "Roadmap Alpha",
		});

		await core.createTask({
			id: "task-6",
			title: "ID milestone task",
			status: "To Do",
			assignee: [],
			createdDate: "2025-06-18",
			labels: [],
			dependencies: [],
			description: "Task with milestone stored as ID",
			milestone: newMilestone.id,
		});
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("filters by milestone with case-insensitive matching", async () => {
		const result = await $`${cliCommand} task list --milestone RELEASE-1 --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("TASK-1 - Milestone task one");
		expect(output).toContain("TASK-2 - Milestone task two");
		expect(output).not.toContain("TASK-3 - Other milestone task");
		expect(output).not.toContain("TASK-4 - No milestone task");
		expect(output).not.toContain("TASK-5 - Roadmap milestone task");
		expect(output).not.toContain("TASK-6 - ID milestone task");
	});

	it("supports -m shorthand and combines milestone with status filter", async () => {
		const result = await $`${cliCommand} task list -m release-1 --status "To Do" --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("TASK-1 - Milestone task one");
		expect(output).not.toContain("TASK-2 - Milestone task two");
		expect(output).not.toContain("TASK-3 - Other milestone task");
		expect(output).not.toContain("TASK-4 - No milestone task");
		expect(output).not.toContain("TASK-5 - Roadmap milestone task");
		expect(output).not.toContain("TASK-6 - ID milestone task");
	});

	it("matches closest milestone for partial and typo inputs", async () => {
		const typoResult = await $`${cliCommand} task list --milestone releas-1 --plain`.cwd(TEST_DIR).quiet();
		const partialResult = await $`${cliCommand} task list --milestone roadmp --plain`.cwd(TEST_DIR).quiet();
		expect(typoResult.exitCode).toBe(0);
		expect(partialResult.exitCode).toBe(0);
		const typoOutput = typoResult.stdout.toString();
		const partialOutput = partialResult.stdout.toString();

		expect(typoOutput).toContain("TASK-1 - Milestone task one");
		expect(typoOutput).toContain("TASK-2 - Milestone task two");
		expect(typoOutput).not.toContain("TASK-3 - Other milestone task");
		expect(typoOutput).not.toContain("TASK-4 - No milestone task");
		expect(typoOutput).not.toContain("TASK-5 - Roadmap milestone task");

		expect(partialOutput).toContain("TASK-5 - Roadmap milestone task");
		expect(partialOutput).not.toContain("TASK-1 - Milestone task one");
		expect(partialOutput).not.toContain("TASK-2 - Milestone task two");
		expect(partialOutput).not.toContain("TASK-3 - Other milestone task");
		expect(partialOutput).not.toContain("TASK-4 - No milestone task");
		expect(partialOutput).not.toContain("TASK-6 - ID milestone task");
	});

	it("matches milestone title when tasks store milestone IDs", async () => {
		const result = await $`${cliCommand} task list -m new --plain`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("TASK-6 - ID milestone task");
		expect(output).not.toContain("TASK-1 - Milestone task one");
		expect(output).not.toContain("TASK-2 - Milestone task two");
		expect(output).not.toContain("TASK-3 - Other milestone task");
		expect(output).not.toContain("TASK-4 - No milestone task");
		expect(output).not.toContain("TASK-5 - Roadmap milestone task");
	});

	it("matches tasks by milestone ID when tasks store milestone IDs", async () => {
		const numericId = ID_MILESTONE_ID.replace(/^m-/i, "");
		const queries = [numericId, ID_MILESTONE_ID, ID_MILESTONE_ID.toUpperCase()];

		const results = [];
		for (const query of queries) {
			results.push(await $`${cliCommand} task list --milestone ${query} --plain`.cwd(TEST_DIR).quiet());
			results.push(await $`${cliCommand} task list --milestone ${query} --json`.cwd(TEST_DIR).quiet());
		}

		for (let index = 0; index < queries.length; index++) {
			const plainResult = results[index * 2];
			const jsonResult = results[index * 2 + 1];
			if (!plainResult || !jsonResult) throw new Error("Expected one plain and one JSON result for every query.");
			expect(plainResult.exitCode).toBe(0);
			const output = plainResult.stdout.toString();

			expect(output).toContain("TASK-6 - ID milestone task");
			expect(output).not.toContain("TASK-1 - Milestone task one");
			expect(output).not.toContain("TASK-2 - Milestone task two");
			expect(output).not.toContain("TASK-3 - Other milestone task");
			expect(output).not.toContain("TASK-4 - No milestone task");
			expect(output).not.toContain("TASK-5 - Roadmap milestone task");

			expect(jsonResult.exitCode).toBe(0);
			const parsed = JSON.parse(jsonResult.stdout.toString()) as { tasks: Array<{ id: string }> };
			expect(parsed.tasks.map((task) => task.id)).toEqual(["TASK-6"]);
		}
	}, 10_000);

	it("returns no tasks when the milestone query matches no milestone", async () => {
		const result = await $`${cliCommand} task list --milestone zzz-unrelated-milestone --plain`.cwd(TEST_DIR).quiet();
		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("No tasks found");
		expect(output).not.toContain("TASK-1 - Milestone task one");
		expect(output).not.toContain("TASK-6 - ID milestone task");
	});

	it("preserves existing listing behavior when milestone filter is omitted", async () => {
		const result = await $`${cliCommand} task list --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();

		expect(output).toContain("TASK-1 - Milestone task one");
		expect(output).toContain("TASK-2 - Milestone task two");
		expect(output).toContain("TASK-3 - Other milestone task");
		expect(output).toContain("TASK-4 - No milestone task");
		expect(output).toContain("TASK-5 - Roadmap milestone task");
		expect(output).toContain("TASK-6 - ID milestone task");
	});
});
