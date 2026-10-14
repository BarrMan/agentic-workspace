import { describe, expect, it } from "bun:test";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import { taskTypeScenarios, taskTypeScenarioTasks } from "./task-type-filter-scenarios.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const cliCommand = ["agentic-workspace"];

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

async function setupFiltering(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("task-type-filtering");
	const core = new Core(dir);

	await initializeFilesystemTestProject(core, "Task Type Filtering");
	const config = await core.filesystem.loadConfig();
	if (!config) throw new Error("Expected test config");
	await core.filesystem.saveConfig({ ...config, types: ["Bug", "Feature", "Spike"] });

	for (const task of taskTypeScenarioTasks) await core.filesystem.saveTask(task);

	return { dir, core };
}

describe("task type filtering", () => {
	it("applies literal type-filter scenarios through Core", async () => {
		const { dir, core } = await setupFiltering();
		try {
			for (const scenario of taskTypeScenarios) {
				const results = await core.queryTasks({
					...(scenario.query && { query: scenario.query }),
					filters: scenario.filters,
					includeCrossBranch: false,
				});
				expect(results.map((task) => task.id).sort(), scenario.name).toEqual([...scenario.expectedIds].sort());
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	it("uses the same type semantics in direct filesystem and persistent search helpers", async () => {
		const { dir, core } = await setupFiltering();
		try {
			const filesystemTasks = await core.filesystem.listTasks({ type: ["feature", "SPIKE"] });
			expect(filesystemTasks.map((task) => task.id).sort()).toEqual(["TASK-2", "TASK-3"]);

			const persistentMatches = await core.searchPersistently({
				query: "Shared API",
				types: ["task"],
				filters: { type: ["Bug", "Spike"] },
			});
			expect(persistentMatches.flatMap((result) => (result.type === "task" ? [result.task.id] : [])).sort()).toEqual([
				"TASK-1",
				"TASK-3",
			]);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("filters CLI task list with repeated and comma-separated canonicalized values", async () => {
		const { dir } = await setupFiltering();
		try {
			const comma = await $`${cliCommand} task list --type bug,spike --plain`.cwd(dir).quiet();
			const repeated = await $`${cliCommand} task list --type BUG --type Spike --plain`.cwd(dir).quiet();

			for (const result of [comma, repeated]) {
				expect(result.exitCode).toBe(0);
				const output = result.stdout.toString();
				expect(output).toContain("Shared API failure");
				expect(output).toContain("Shared API exploration");
				expect(output).not.toContain("Shared API capability");
				expect(output).not.toContain("Shared legacy task");
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	it("filters CLI search by task type and composes with existing filters", async () => {
		const { dir } = await setupFiltering();
		try {
			const search =
				await $`${cliCommand} search "Shared API" --task-type bug,feature --status "To Do" --priority high --plain`
					.cwd(dir)
					.quiet();
			const typeOnly = await $`${cliCommand} search --task-type Feature --plain`.cwd(dir).quiet();
			expect(search.exitCode).toBe(0);
			const output = search.stdout.toString();
			expect(output).toContain("Shared API failure");
			expect(output).not.toContain("Shared API capability");
			expect(output).not.toContain("Shared API exploration");

			expect(typeOnly.stdout.toString()).toContain("Shared API capability");
			expect(typeOnly.stdout.toString()).not.toContain("Documents:");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("rejects invalid configured task types clearly", async () => {
		const { dir } = await setupFiltering();
		try {
			const list = await $`${cliCommand} task list --type chore --plain`.cwd(dir).nothrow().quiet();
			const search = await $`${cliCommand} search --task-type chore --plain`.cwd(dir).nothrow().quiet();
			expect(list.exitCode).toBe(1);
			expect(list.stderr.toString()).toContain("Invalid type: chore. Valid types are: Bug, Feature, Spike");

			expect(search.exitCode).toBe(1);
			expect(search.stderr.toString()).toContain("Invalid task-type: chore. Valid types are: Bug, Feature, Spike");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("documents configured task-type filters without changing search result-type semantics", async () => {
		const { dir, core } = await setupFiltering();
		try {
			const config = await core.filesystem.loadConfig();
			if (!config) throw new Error("Expected test config");
			await core.filesystem.saveConfig({ ...config, types: ["Bug", "Epic"] });

			const completionLines = ["agentic-workspace task list --type ", "agentic-workspace search --task-type "];
			const unsupportedLines = [
				"agentic-workspace task create --task-type ",
				"agentic-workspace task list --task-type ",
			];
			const listHelp = await $`${cliCommand} task list --help`.cwd(dir).text();
			const searchHelp = await $`${cliCommand} search --help`.cwd(dir).text();
			const taskCreationGuide = await $`${cliCommand} instructions task-creation`.cwd(dir).text();
			const advertisedList = await $`${cliCommand} task list --type Bug --plain`.cwd(dir).quiet();
			const advertisedSearch = await $`${cliCommand} search "Shared API" --task-type Bug --plain`.cwd(dir).quiet();
			const completions = [];
			for (const line of completionLines)
				completions.push(await $`${cliCommand} completion __complete ${line} ${String(line.length)}`.cwd(dir).quiet());
			const unsupported = [];
			for (const line of unsupportedLines)
				unsupported.push(await $`${cliCommand} completion __complete ${line} ${String(line.length)}`.cwd(dir).quiet());
			const incompatible = await $`${cliCommand} search --type document --task-type Bug --plain`
				.cwd(dir)
				.nothrow()
				.quiet();

			expect(listHelp).toContain("--type <type>");
			expect(listHelp).toContain("type: one or more of configured task types: Bug, Epic");
			expect(searchHelp).toContain("--type <type>");
			expect(searchHelp).toContain("--task-type <type>");
			expect(searchHelp).toContain("task-type: one or more of configured task types: Bug, Epic");

			expect(taskCreationGuide).toContain('agentic-workspace task list --type "Bug" --plain');
			expect(taskCreationGuide).not.toContain("--type bug,spike");

			expect(advertisedList.exitCode).toBe(0);
			expect(advertisedSearch.exitCode).toBe(0);

			for (const completion of completions) {
				expect(completion.stdout.toString().trim().split("\n")).toEqual(["Bug", "Epic"]);
			}
			for (const completion of unsupported) {
				expect(completion.stdout.toString().trim()).toBe("");
			}

			expect(incompatible.exitCode).toBe(1);
			expect(incompatible.stderr.toString()).toContain(
				"--task-type filters task results. Include --type task or omit --type.",
			);
		} finally {
			await safeCleanup(dir);
		}
	});
});
