import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_COMMAND = ["agenticworkspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.startsWith('"agenticworkspace"')) return shell(parts, ...values);
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
			// Set up a git repository and initialize backlog
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

		it("should filter tasks by status", async () => {
			const core = new Core(TEST_DIR);

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

			const result = await $`${CLI_COMMAND} task list --plain --status Done`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("Done:");
			expect(out).toContain("TASK-2 - Second Task"); // IDs normalized to uppercase
			expect(out).not.toContain("TASK-1");
		});

		it("should filter tasks by status case-insensitively", async () => {
			const core = new Core(TEST_DIR);

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

			// "done" and "DoNe" cover lowercase and mixed-case folding; "DONE" repeated the same fold.
			const testCases = ["done", "DoNe"];

			for (const status of testCases) {
				const result = await $`${CLI_COMMAND} task list --plain --status ${status}`.cwd(TEST_DIR).quiet();
				const out = result.stdout.toString();
				expect(out).toContain("Done:");
				expect(out).toContain("TASK-2 - Second Task"); // IDs normalized to uppercase
				expect(out).not.toContain("TASK-1");
			}

			// Test with -s flag
			const resultShort = await $`${CLI_COMMAND} task list --plain -s done`.cwd(TEST_DIR).quiet();
			const outShort = resultShort.stdout.toString();
			expect(outShort).toContain("Done:");
			expect(outShort).toContain("TASK-2 - Second Task"); // IDs normalized to uppercase
			expect(outShort).not.toContain("TASK-1");
		});

		it("should filter tasks by assignee", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "Assigned Task",
				status: "To Do",
				assignee: ["alice"],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Assigned task",
			});
			await core.createTask({
				id: "task-2",
				title: "Unassigned Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Other task",
			});

			const result = await $`${CLI_COMMAND} task list --plain --assignee alice`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("TASK-1 - Assigned Task"); // IDs normalized to uppercase
			expect(out).not.toContain("TASK-2 - Unassigned Task");
		});

		it("should filter tasks without an assignee using --unassigned", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "Assigned Task",
				status: "To Do",
				assignee: ["alice"],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Assigned task",
			});
			await core.createTask({
				id: "task-2",
				title: "Unassigned Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Other task",
			});

			const result = await $`${CLI_COMMAND} task list --plain --unassigned`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("TASK-2 - Unassigned Task");
			expect(out).not.toContain("TASK-1 - Assigned Task");
		});

		it("should reject combining --unassigned with --assignee", async () => {
			const result = await $`${CLI_COMMAND} task list --plain --assignee alice --unassigned`
				.cwd(TEST_DIR)
				.nothrow()
				.quiet();
			expect(result.exitCode).toBe(1);
			expect(result.stderr.toString()).toContain("--unassigned cannot be combined with --assignee");
		});

		it("should filter tasks by labels requiring every requested label", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "UI Bug Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["UI", "Bug"],
				dependencies: [],
				rawContent: "UI bug task",
			});
			await core.createTask({
				id: "task-2",
				title: "UI Only Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["ui"],
				dependencies: [],
				rawContent: "UI only task",
			});
			await core.createTask({
				id: "task-3",
				title: "Bug Only Task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: ["bug"],
				dependencies: [],
				rawContent: "Bug only task",
			});

			const commaResult = await $`${CLI_COMMAND} task list --plain --labels ui,bug`.cwd(TEST_DIR).quiet();
			const repeatedResult = await $`${CLI_COMMAND} task list --plain --labels ui --labels bug`.cwd(TEST_DIR).quiet();

			for (const result of [commaResult, repeatedResult]) {
				const out = result.stdout.toString();
				expect(out).toContain("TASK-1 - UI Bug Task");
				expect(out).not.toContain("TASK-2 - UI Only Task");
				expect(out).not.toContain("TASK-3 - Bug Only Task");
			}
		});

		it("should filter tasks by search query", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "Billing Webhook",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				description: "Handle invoice payment callbacks.",
			});
			await core.createTask({
				id: "task-2",
				title: "Profile Settings",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				description: "Update account preferences.",
			});

			const result = await $`${CLI_COMMAND} task list --plain --search "invoice payment"`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("TASK-1 - Billing Webhook");
			expect(out).not.toContain("TASK-2 - Profile Settings");
		});

		it("should apply plain limit before regrouping sorted tasks by status", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "Low Priority First ID",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				priority: "low",
				rawContent: "Low priority task",
			});
			await core.createTask({
				id: "task-2",
				title: "High Priority Later ID",
				status: "Done",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				priority: "high",
				rawContent: "High priority task",
			});

			const result = await $`${CLI_COMMAND} task list --plain --limit 1`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("Done:");
			expect(out).toContain("[HIGH] TASK-2 - High Priority Later ID");
			expect(out).not.toContain("To Do:");
			expect(out).not.toContain("TASK-1 - Low Priority First ID");
		});

		it("should use configured custom priorities for create, list, search, and help", async () => {
			const core = new Core(TEST_DIR);
			const config = await core.filesystem.loadConfig();
			if (!config) {
				throw new Error("Expected test config to exist");
			}
			await core.filesystem.saveConfig({
				...config,
				priorities: ["Very High", "High", "Medium", "Low", "Very Low"],
			});

			// The two creates are unasserted setup; the real list/search/help contract is what this case
			// checks, so build the corpus in-process instead of paying for two more CLI processes.
			await core.createTask({
				id: "task-1",
				title: "Custom priority urgent task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				priority: "Very High",
				rawContent: "",
			});
			await core.createTask({
				id: "task-2",
				title: "Custom priority later task",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				priority: "Very Low",
				rawContent: "",
			});

			const listResult = await $`${CLI_COMMAND} task list --plain --priority "very high"`.cwd(TEST_DIR).quiet();
			const listOutput = listResult.stdout.toString();
			expect(listOutput).toContain("[VERY HIGH] TASK-1 - Custom priority urgent task");
			expect(listOutput).not.toContain("Custom priority later task");

			const searchResult = await $`${CLI_COMMAND} search "Custom priority" --priority "VERY HIGH" --plain`
				.cwd(TEST_DIR)
				.quiet();
			const searchOutput = searchResult.stdout.toString();
			expect(searchOutput).toContain("TASK-1 - Custom priority urgent task");
			expect(searchOutput).not.toContain("TASK-2 - Custom priority later task");

			const helpOutput = await $`${CLI_COMMAND} task create --help`.cwd(TEST_DIR).text();
			expect(helpOutput).toContain("priority: one of configured priorities: Very High, High, Medium, Low, Very Low");
		});

		it("should combine search, labels, and existing task list filters", async () => {
			const core = new Core(TEST_DIR);
			const milestone = await core.filesystem.createMilestone("Release Filters");

			await core.createTask({
				id: "task-1",
				title: "OAuth Parent",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-08",
				labels: [],
				dependencies: [],
				rawContent: "Parent task",
			});
			await core.createTask({
				id: "task-1.1",
				title: "OAuth Callback",
				status: "To Do",
				assignee: ["alice"],
				createdDate: "2025-06-08",
				labels: ["security", "api"],
				dependencies: [],
				description: "Implement token exchange callback.",
				milestone: milestone.id,
				parentTaskId: "task-1",
				priority: "high",
			});
			await core.createTask({
				id: "task-1.2",
				title: "OAuth Callback Missing Label",
				status: "To Do",
				assignee: ["alice"],
				createdDate: "2025-06-08",
				labels: ["security"],
				dependencies: [],
				description: "Implement token exchange callback.",
				milestone: milestone.id,
				parentTaskId: "task-1",
				priority: "high",
			});
			await core.createTask({
				id: "task-2",
				title: "OAuth Callback Other Parent",
				status: "To Do",
				assignee: ["alice"],
				createdDate: "2025-06-08",
				labels: ["security", "api"],
				dependencies: [],
				description: "Implement token exchange callback.",
				milestone: milestone.id,
				priority: "high",
			});

			const result =
				await $`${CLI_COMMAND} task list --plain --status ${"To Do"} --assignee alice --milestone "Release Filters" --parent TASK-1 --priority high --labels security,api --search "OAuth Callback"`
					.cwd(TEST_DIR)
					.quiet();
			const out = result.stdout.toString();
			expect(out).toContain("[HIGH] TASK-1.1 - OAuth Callback");
			expect(out).not.toContain("TASK-1.2 - OAuth Callback Missing Label");
			expect(out).not.toContain("TASK-2 - OAuth Callback Other Parent");
		});

		it("should filter tasks by readiness using --ready and --ready --json", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "Done Dep",
				status: "Done",
				assignee: [],
				labels: [],
				dependencies: [],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-2",
				title: "In Progress Dep",
				status: "In Progress",
				assignee: [],
				labels: [],
				dependencies: [],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-3",
				title: "Blocked Task",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: ["task-2"],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-4",
				title: "Ready Task",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: ["task-1"],
				createdDate: "2026-07-24",
				rawContent: "",
			});

			const plainResult = await $`${CLI_COMMAND} task list --plain --ready`.cwd(TEST_DIR).quiet();
			const plainOut = plainResult.stdout.toString();
			expect(plainOut).toContain("TASK-4 - Ready Task");
			expect(plainOut).toContain("TASK-2 - In Progress Dep");
			expect(plainOut).not.toContain("TASK-3 - Blocked Task");

			const jsonResult = await $`${CLI_COMMAND} task list --json --ready`.cwd(TEST_DIR).quiet();
			const json = JSON.parse(jsonResult.stdout.toString());
			const readyIds = json.tasks.map((t: { id: string }) => t.id);
			expect(readyIds).toContain("TASK-4");
			expect(readyIds).toContain("TASK-2");
			expect(readyIds).not.toContain("TASK-3");
			expect(readyIds).not.toContain("TASK-1");

			// Readiness must resolve against the whole graph, not the tasks left after --status.
			const scopedResult = await $`${CLI_COMMAND} task list --plain --ready --status "To Do"`.cwd(TEST_DIR).quiet();
			const scopedOut = scopedResult.stdout.toString();
			expect(scopedOut).toContain("TASK-4 - Ready Task");
			expect(scopedOut).not.toContain("TASK-3 - Blocked Task");
		});

		it("should resolve --ready dependencies that were completed and moved out of the active corpus", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "Completed Dep",
				status: "Done",
				assignee: [],
				labels: [],
				dependencies: [],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-2",
				title: "Depends On Completed",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: ["task-1"],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-3",
				title: "Depends On Nothing Known",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: ["task-404"],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			expect(await core.completeTask("task-1")).toBe(true);

			const result = await $`${CLI_COMMAND} task list --plain --ready`.cwd(TEST_DIR).quiet();
			const out = result.stdout.toString();
			expect(out).toContain("TASK-2 - Depends On Completed");
			// An unresolvable dependency fails closed instead of being treated as satisfied.
			expect(out).not.toContain("TASK-3 - Depends On Nothing Known");
		});

		it("reads no task corpus when the filters matched no task", async () => {
			const core = new Core(TEST_DIR);
			const createdDate = new Date().toISOString().slice(0, 10);
			await core.createTask({
				id: "task-1",
				title: "Only Task",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: [],
				createdDate,
				rawContent: "",
			});
			// A malformed completed record is skipped with one warning when the corpus is read.
			await mkdir(join(TEST_DIR, "backlog", "completed"), { recursive: true });
			await mkdir(join(TEST_DIR, "backlog", "completed", "task-99"), { recursive: true });
			await writeFile(
				join(TEST_DIR, "backlog", "completed", "task-99", "task.md"),
				"---\nid: TASK-99\ntask_schema_version: 3\ntitle: [unclosed\nstatus: Done\n---\n\nbroken\n",
			);
			const corpusReads = async (args: string[]) => {
				const result = await $`${[...CLI_COMMAND, "task", "list", ...args]}`
					.cwd(TEST_DIR)
					.env({ ...process.env, DEBUG: "1" })
					.quiet();
				expect(result.exitCode).toBe(0);
				return {
					stdout: result.stdout.toString(),
					warnings: result.stderr
						.toString()
						.split("\n")
						.filter((line) => line.startsWith("Warning: Skipping unparseable task file ")),
				};
			};

			const empty = await corpusReads(["--json", "--assignee", "@nobody"]);
			const baseline = await corpusReads(["--plain", "--assignee", "@nobody"]);
			expect(JSON.parse(empty.stdout).tasks).toEqual([]);
			// Nothing will carry a verdict, so nothing loads the corpus it would come from.
			expect(empty.warnings).toHaveLength(baseline.warnings.length);
		});

		it("serializes --ready --json from the readiness pass the filter used", async () => {
			const core = new Core(TEST_DIR);
			const createdDate = new Date().toISOString().slice(0, 10);
			await core.createTask({
				id: "task-1",
				title: "Ready Work",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: [],
				createdDate,
				rawContent: "",
			});
			await core.createTask({
				id: "task-2",
				title: "Blocked Work",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: ["task-1"],
				createdDate,
				rawContent: "",
			});

			// A malformed completed record is skipped with one warning when the corpus is read.
			await mkdir(join(TEST_DIR, "backlog", "completed"), { recursive: true });
			await mkdir(join(TEST_DIR, "backlog", "completed", "task-99"), { recursive: true });
			await writeFile(
				join(TEST_DIR, "backlog", "completed", "task-99", "task.md"),
				"---\nid: TASK-99\ntask_schema_version: 3\ntitle: [unclosed\nstatus: Done\n---\n\nbroken\n",
			);

			const runCounting = async (args: string[]) => {
				const result = await $`${[...CLI_COMMAND, "task", "list", ...args]}`
					.cwd(TEST_DIR)
					.env({ ...process.env, DEBUG: "1" })
					.quiet();
				expect(result.exitCode).toBe(0);
				return {
					stdout: result.stdout.toString(),
					warnings: result.stderr
						.toString()
						.split("\n")
						.filter((line) => line.startsWith("Warning: Skipping unparseable task file ")),
				};
			};

			const plainReady = await runCounting(["--plain", "--ready"]);
			const jsonReady = await runCounting(["--json", "--ready"]);

			// Publishing the verdict must not cost a second read of the corpus it came from.
			expect(jsonReady.warnings).toEqual(plainReady.warnings);
			expect(plainReady.warnings).toHaveLength(1);
			expect(plainReady.warnings[0]).toContain(
				`${join(TEST_DIR, "backlog", "completed", "task-99", "task.md")}: YAML Parse error: Unexpected token`,
			);

			const rows = JSON.parse(jsonReady.stdout).tasks as Array<{ id: string; isReady: boolean }>;
			expect(rows.map((row) => row.id)).toEqual(["TASK-1"]);
			// Every serialized row is one the filter selected, with the verdict that selected it.
			expect(rows.every((row) => row.isReady)).toBe(true);
			expect(plainReady.stdout).toContain("TASK-1 - Ready Work");
			expect(plainReady.stdout).not.toContain("TASK-2 - Blocked Work");
		});

		it("should keep --ready verdicts correct when display filters hide the dependencies", async () => {
			const core = new Core(TEST_DIR);

			await core.createTask({
				id: "task-1",
				title: "Someone Elses Blocker",
				status: "In Progress",
				assignee: ["@other"],
				labels: [],
				dependencies: [],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-2",
				title: "Someone Elses Finished Work",
				status: "Done",
				assignee: ["@other"],
				labels: [],
				dependencies: [],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-3",
				title: "Mine Blocked",
				status: "To Do",
				assignee: ["@me"],
				labels: [],
				dependencies: ["task-1"],
				createdDate: "2026-07-24",
				rawContent: "",
			});
			await core.createTask({
				id: "task-4",
				title: "Mine Ready",
				status: "To Do",
				assignee: ["@me"],
				labels: [],
				dependencies: ["task-2"],
				createdDate: "2026-07-24",
				rawContent: "",
			});

			// Both dependencies belong to @other, so --assignee @me removes them from the listing.
			// Readiness must still resolve them instead of calling them unknown.
			const assigneeResult = await $`${CLI_COMMAND} task list --plain --ready --assignee @me`.cwd(TEST_DIR).quiet();
			const assigneeOut = assigneeResult.stdout.toString();
			expect(assigneeOut).toContain("TASK-4 - Mine Ready");
			expect(assigneeOut).not.toContain("TASK-3 - Mine Blocked");
			expect(assigneeOut).not.toContain("TASK-1 - Someone Elses Blocker");

			const unassignedResult = await $`${CLI_COMMAND} task list --plain --ready --unassigned`.cwd(TEST_DIR).quiet();
			expect(unassignedResult.stdout.toString()).toContain("No tasks found.");
		});

		it("should reject invalid task list limit", async () => {
			const result = await $`${CLI_COMMAND} task list --plain --limit 0`.cwd(TEST_DIR).nothrow().quiet();
			const out = result.stdout.toString() + result.stderr.toString();

			expect(result.exitCode).toBe(1);
			expect(out).toContain("--limit must be a positive integer (1 or greater).");
			expect(out).toContain("Try 'agenticworkspace task list --help' for options.");
		});
	});
});
