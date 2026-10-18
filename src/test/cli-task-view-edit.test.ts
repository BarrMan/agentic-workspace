import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
let configHome: string;
const previousConfigHome = process.env.XDG_CONFIG_HOME;
const cliCommand = ["agentic-workspace"];
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
			const exitCode = await runCli(args.slice(cliCommand.length), { cwd: config.cwd, stdout: out, stderr: err });
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

describe("CLI task view and edit", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("cli-task-view-edit");
		configHome = await mkdtemp(`${tmpdir()}/cli-task-view-config-`);
		process.env.XDG_CONFIG_HOME = configHome;
		await mkdir(testDir, { recursive: true });
		await shell`git init -b main`.cwd(testDir).quiet();
		await initializeTestProject(new Core(testDir), "CLI task view");
	});
	afterEach(async () => {
		await safeCleanup(testDir);
		await rm(configHome, { recursive: true, force: true });
		if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = previousConfigHome;
	});

	it("edits only title and description without interpreting an opaque body", async () => {
		const core = new Core(testDir);
		await core.createTask({
			id: "task-1",
			title: "Original",
			status: "To Do",
			assignee: [],
			createdDate: "2026-09-30",
			labels: [],
			dependencies: [],
			rawContent: "## Description\n\nBody text",
		});
		await $`${[...cliCommand, "task", "edit", "TASK-1", "--title", "Updated", "--description", "Structured description"]}`
			.cwd(testDir)
			.quiet();
		const task = await core.filesystem.loadTask("task-1");
		expect(task).toMatchObject({
			title: "Updated",
			description: "Structured description",
			status: "To Do",
			rawContent: "## Description\n\nBody text",
		});
		expect(await Bun.file(task?.filePath ?? "").text()).toContain("task_schema_version: 3");
	});

	it("retains formatted plain task output", async () => {
		await $`${[...cliCommand, "task", "create", "Visible", "--description", "Description"]}`.cwd(testDir).quiet();
		const result = await $`${[...cliCommand, "task", "view", "TASK-1", "--plain"]}`.cwd(testDir).quiet();
		expect(result.stdout.toString()).toContain("Task TASK-1 - Visible");
		expect(result.stdout.toString()).toContain("Description:");
	});

	it("ignores flat records without modifying their bytes", async () => {
		const content =
			"---\nid: TASK-2\ntitle: Historical\nstatus: To Do\nassignee: []\ncreated_date: '2026-10-01'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nPreserved\n<!-- SECTION:DESCRIPTION:END -->\n";
		const first = `${testDir}/agentic-workspace/tasks/task-2 - First.md`;
		await writeFile(first, content);
		const result = await $`${[...cliCommand, "task", "view", "TASK-2", "--plain"]}`.cwd(testDir).nothrow().quiet();
		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).not.toContain("Manually convert");
		expect(await readFile(first, "utf8")).toBe(content);
	});
});
