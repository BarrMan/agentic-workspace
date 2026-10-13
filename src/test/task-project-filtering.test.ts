import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
let core: Core;

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

describe("task project filtering", () => {
	beforeAll(async () => {
		testDir = createUniqueTestDir("task-project-filtering");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);

		await initializeFilesystemTestProject(core, "Task Project Filtering");
		const config = await core.filesystem.loadConfig();
		if (!config) throw new Error("Expected test config");
		await core.filesystem.saveConfig({ ...config, projects: ["Web", "API", "Mobile"] });

		await core.createTaskFromInput({
			title: "Shared Web failure",
			project: "web",
			status: "To Do",
			priority: "high",
			labels: ["ui", "urgent"],
		});
		await core.createTaskFromInput({
			title: "Shared API capability",
			project: "api",
			status: "In Progress",
			priority: "medium",
			labels: ["ui"],
		});
		await core.createTaskFromInput({
			title: "Shared Mobile exploration",
			project: "mobile",
			status: "To Do",
			priority: "low",
			labels: ["research"],
		});
		await core.createTaskFromInput({ title: "Shared unprojected task", status: "To Do" });
	});

	afterAll(async () => {
		await safeCleanup(testDir);
	});

	it("applies OR project semantics through Core queries with and without search text", async () => {
		const webTasks = await core.queryTasks({ filters: { project: "web" }, includeCrossBranch: false });
		expect(webTasks.map((task) => task.title)).toEqual(["Shared Web failure"]);

		const webAndMobile = await core.queryTasks({
			query: "Shared",
			filters: { project: ["WEB", "mobile"] },
			includeCrossBranch: false,
		});
		expect(webAndMobile.map((task) => task.title).sort()).toEqual(["Shared Mobile exploration", "Shared Web failure"]);
		expect(webAndMobile.some((task) => task.project === undefined)).toBe(false);
	});

	it("composes project with status, priority, labels, and exclude-status filters", async () => {
		const tasks = await core.queryTasks({
			filters: {
				project: ["Web", "API"],
				status: "To Do",
				excludeStatus: "Done",
				priority: "high",
				labels: ["urgent"],
			},
			includeCrossBranch: false,
		});
		expect(tasks.map((task) => task.title)).toEqual(["Shared Web failure"]);
	});

	it("uses the same project semantics in direct filesystem and persistent search helpers", async () => {
		const filesystemTasks = await core.filesystem.listTasks({ project: ["api", "MOBILE"] });
		expect(filesystemTasks.map((task) => task.title).sort()).toEqual([
			"Shared API capability",
			"Shared Mobile exploration",
		]);

		const persistentMatches = await core.searchPersistently({
			query: "Shared",
			types: ["task"],
			filters: { project: ["Web", "Mobile"] },
		});
		expect(persistentMatches.flatMap((result) => (result.type === "task" ? [result.task.title] : [])).sort()).toEqual([
			"Shared Mobile exploration",
			"Shared Web failure",
		]);
	});

	it("filters CLI task list with repeated and comma-separated canonicalized values", async () => {
		const comma = await $`${cliCommand} task list --project web,mobile --plain`.cwd(testDir).quiet();
		const repeated = await $`${cliCommand} task list --project WEB --project Mobile --plain`.cwd(testDir).quiet();

		for (const result of [comma, repeated]) {
			expect(result.exitCode).toBe(0);
			const output = result.stdout.toString();
			expect(output).toContain("Shared Web failure");
			expect(output).toContain("Shared Mobile exploration");
			expect(output).not.toContain("Shared API capability");
			expect(output).not.toContain("Shared unprojected task");
		}
	});

	it("filters CLI search by project and composes with existing filters", async () => {
		const search = await $`${cliCommand} search "Shared" --project web,api --status "To Do" --priority high --plain`
			.cwd(testDir)
			.quiet();
		const projectOnly = await $`${cliCommand} search --project API --plain`.cwd(testDir).quiet();
		expect(search.exitCode).toBe(0);
		const output = search.stdout.toString();
		expect(output).toContain("Shared Web failure");
		expect(output).not.toContain("Shared API capability");
		expect(output).not.toContain("Shared Mobile exploration");

		expect(projectOnly.stdout.toString()).toContain("Shared API capability");
		expect(projectOnly.stdout.toString()).not.toContain("Documents:");
	});

	it("rejects invalid configured projects clearly", async () => {
		const list = await $`${cliCommand} task list --project desktop --plain`.cwd(testDir).nothrow().quiet();
		const search = await $`${cliCommand} search --project desktop --plain`.cwd(testDir).nothrow().quiet();
		expect(list.exitCode).toBe(1);
		expect(list.stderr.toString()).toContain("Invalid project: desktop. Valid projects are: Web, API, Mobile");

		expect(search.exitCode).toBe(1);
		expect(search.stderr.toString()).toContain("Invalid project: desktop. Valid projects are: Web, API, Mobile");
	});

	it("fails closed on project filters when no projects are configured", async () => {
		// This case depends on a project with no configured projects, so it stays isolated from the
		// shared fixture.
		const isolatedDir = createUniqueTestDir("task-project-filtering-none");
		try {
			await mkdir(isolatedDir, { recursive: true });
			const isolatedCore = new Core(isolatedDir);
			await initializeFilesystemTestProject(isolatedCore, "Task Project Filtering None");
			const isolatedConfig = await isolatedCore.filesystem.loadConfig();
			if (!isolatedConfig) throw new Error("Expected test config");
			await isolatedCore.filesystem.saveConfig({ ...isolatedConfig, projects: [] });

			const list = await $`${cliCommand} task list --project web --plain`.cwd(isolatedDir).nothrow().quiet();
			const search = await $`${cliCommand} search --project web --plain`.cwd(isolatedDir).nothrow().quiet();
			expect(list.exitCode).toBe(1);
			expect(list.stderr.toString()).toContain("No projects are configured. Add a 'projects:' list to");

			expect(search.exitCode).toBe(1);
			expect(search.stderr.toString()).toContain("No projects are configured. Add a 'projects:' list to");
		} finally {
			await safeCleanup(isolatedDir);
		}
	});

	it("documents configured project filters and completes their values", async () => {
		const listHelp = await $`${cliCommand} task list --help`.cwd(testDir).text();
		const searchHelp = await $`${cliCommand} search --help`.cwd(testDir).text();
		expect(listHelp).toContain("--project <project>");
		expect(listHelp).toContain("project: one or more of configured projects: Web, API, Mobile");
		expect(searchHelp).toContain("--project <project>");
		expect(searchHelp).toContain("project: one or more of configured projects: Web, API, Mobile");

		const completionLines = ["agenticworkspace task list --project ", "agenticworkspace search --project "];
		const completions = [];
		for (const line of completionLines)
			completions.push(
				await $`${cliCommand} completion __complete ${line} ${String(line.length)}`.cwd(testDir).quiet(),
			);
		for (const completion of completions) {
			expect(completion.stdout.toString().trim().split("\n")).toEqual(["Web", "API", "Mobile"]);
		}
	});
});
