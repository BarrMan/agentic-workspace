import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const cliCommand = ["agentic-workspace"];
let runQueue = Promise.resolve();

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
		const invocation = runQueue.then(() =>
			runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err }),
		);
		runQueue = invocation.then(
			() => undefined,
			() => undefined,
		);
		const exitCode = await invocation;
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

describe("CLI search command", () => {
	beforeAll(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-search");
		await mkdir(TEST_DIR, { recursive: true });

		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Search Command Project");

		await core.createTask({
			id: "task-1",
			title: "Central search integration",
			status: "To Do",
			assignee: ["@codex"],
			createdDate: "2025-09-18",
			labels: ["search"],
			dependencies: [],
			rawContent: "Implements central search module",
			description: "Implements central search module",
			modifiedFiles: ["src/web/App.tsx"],
		});

		await core.createTask({
			id: "task-2",
			title: "High priority follow-up",
			status: "In Progress",
			assignee: ["@codex"],
			createdDate: "2025-09-18",
			labels: ["search"],
			dependencies: [],
			rawContent: "Follow-up work",
			description: "Follow-up work",
			priority: "high",
			modifiedFiles: ["src/core/search-service.ts"],
		});
	});

	afterAll(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("returns matching tasks in plain output", async () => {
		const result = await $`${cliCommand} search central --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("Tasks:");
		expect(stdout).toContain("TASK-1 - Central search integration");
	});

	it("honors status and priority filters for task results", async () => {
		const statusResult = await $`${cliCommand} search follow-up --type task --status "In Progress" --plain`
			.cwd(TEST_DIR)
			.quiet();
		expect(statusResult.exitCode).toBe(0);
		const statusStdout = statusResult.stdout.toString();
		expect(statusStdout).toContain("TASK-2 - High priority follow-up");
		expect(statusStdout).not.toContain("TASK-1 - Central search integration");

		const priorityResult = await $`${cliCommand} search follow-up --type task --priority high --plain`
			.cwd(TEST_DIR)
			.quiet();
		expect(priorityResult.exitCode).toBe(0);
		const priorityStdout = priorityResult.stdout.toString();
		expect(priorityStdout).toContain("TASK-2 - High priority follow-up");
	});

	it("rejects pagination and result-limit options", async () => {
		const result = await $`${cliCommand} search search --plain --limit 1`.cwd(TEST_DIR).nothrow().quiet();
		const output = result.stdout.toString() + result.stderr.toString();

		expect(result.exitCode).toBe(1);
		expect(output).toContain("unknown option '--limit'");
		const help = await $`${cliCommand} search --help`.cwd(TEST_DIR).text();
		expect(help).not.toContain("--max-count");
		expect(help).not.toContain("--skip");
		expect(help).not.toContain("--limit");
	});

	it("finds tasks by modified file path", async () => {
		const queryResult = await $`${cliCommand} search "src/web/App.tsx" --type task --plain`.cwd(TEST_DIR).quiet();
		expect(queryResult.exitCode).toBe(0);
		const queryStdout = queryResult.stdout.toString();
		expect(queryStdout).toContain("TASK-1 - Central search integration");

		const filterResult = await $`${cliCommand} search --modified-file core/search-service --plain`
			.cwd(TEST_DIR)
			.quiet();
		expect(filterResult.exitCode).toBe(0);
		const filterStdout = filterResult.stdout.toString();
		expect(filterStdout).toContain("TASK-2 - High priority follow-up");
		expect(filterStdout).not.toContain("TASK-1 - Central search integration");
	});
});
