import { afterAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agentic-workspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce(
		(text, part, index) =>
			`${text}${part}${Array.isArray(values[index]) ? values[index].map((value) => JSON.stringify(value)).join(" ") : values[index] === undefined ? "" : JSON.stringify(values[index])}`,
		"",
	);
	if (!source.includes("agentic-workspace")) return shell(parts, ...values);
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

const createdDirs: string[] = [];

/** Builds an isolated, initialized project for one test and remembers it for cleanup. */
async function makeProject(): Promise<{ testDir: string; core: Core }> {
	const testDir = createUniqueTestDir("test-cli-dependency");
	await mkdir(testDir, { recursive: true });
	const core = new Core(testDir);
	await initializeFilesystemTestProject(core, "CLI dependency options");
	createdDirs.push(testDir);
	return { testDir, core };
}

/** Seeds a task directly so a test only spends CLI processes on the surface it exercises. */
async function seedTask(core: Core, id: string, title: string, extra: Partial<Task> = {}): Promise<void> {
	await core.filesystem.saveTask({
		id,
		title,
		status: "To Do",
		assignee: [],
		labels: [],
		dependencies: [],
		createdDate: "2026-08-01",
		rawContent: "",
		...extra,
	});
}

// Every test owns its project directory, so the suite runs its tests concurrently.
describe("CLI dependency options", () => {
	afterAll(async () => {
		await Promise.all(createdDirs.map((dir) => safeCleanup(dir)));
	});

	it("creates and edits dependencies through both public flags", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task one");
		await seedTask(core, "TASK-2", "Base task two");

		const created = await $`${CLI_COMMAND} task create "Dependent task" --dep 1 --plain`.cwd(testDir).quiet();
		expect(created.stdout.toString()).toContain("Task TASK-3 - Dependent task");
		expect((await core.filesystem.loadTask("TASK-3"))?.dependencies).toEqual(["TASK-1"]);

		const edited = await $`${CLI_COMMAND} task edit 3 --depends-on TASK-1,TASK-2 --plain`.cwd(testDir).quiet();
		expect(edited.stdout.toString()).toContain("Task TASK-3 - Dependent task");
		expect((await core.filesystem.loadTask("TASK-3"))?.dependencies).toEqual(["TASK-1", "TASK-2"]);

		// Task detail shows the resolved graph instead of repeating the raw ID list.
		const viewed = await $`${CLI_COMMAND} task view 3 --plain`.cwd(testDir).quiet();
		expect(viewed.stdout.toString()).toContain("Dependency Graph:");
		expect(viewed.stdout.toString()).toContain("TASK-1");
		expect(viewed.stdout.toString()).toContain("TASK-2");
	});

	it("accumulates repeated dependency flags", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task one");
		await seedTask(core, "TASK-2", "Base task two");

		await $`${CLI_COMMAND} task create "Dependent task" --depends-on TASK-1 --depends-on TASK-2`.cwd(testDir).quiet();

		expect((await core.filesystem.loadTask("TASK-3"))?.dependencies).toEqual(["TASK-1", "TASK-2"]);
	});

	it("merges --depends-on and --dep on task create", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task one");
		await seedTask(core, "TASK-2", "Base task two");

		await $`${CLI_COMMAND} task create "Dependent task" --depends-on TASK-1 --dep TASK-2`.cwd(testDir).quiet();

		expect((await core.filesystem.loadTask("TASK-3"))?.dependencies).toEqual(["TASK-1", "TASK-2"]);
	});

	it("rejects empty dependency values on task create and draft create without creating anything", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task");

		const emptyDependsOn = await $`${CLI_COMMAND} task create "Empty depends-on" --depends-on ""`
			.cwd(testDir)
			.nothrow()
			.quiet();
		const emptyDep = await $`${CLI_COMMAND} task create "Empty dep" --dep ""`.cwd(testDir).nothrow().quiet();
		const emptyAlongsideValue = await $`${CLI_COMMAND} task create "Empty alongside value" --depends-on "" --dep TASK-1`
			.cwd(testDir)
			.nothrow()
			.quiet();
		const emptyDraftDep = await $`${CLI_COMMAND} task create "Empty draft dep" --draft --dep ""`
			.cwd(testDir)
			.nothrow()
			.quiet();

		expect(emptyDependsOn.exitCode).toBe(1);
		// Create has nothing to clear, so the empty value stays an error here even though task edit clears.
		expect(emptyDependsOn.stderr.toString()).toContain(
			"Cannot use an empty value with --depends-on or --dep. Omit the flag to leave task dependencies unset.",
		);

		expect(emptyDep.exitCode).toBe(1);
		expect(emptyDep.stderr.toString()).toContain("Cannot use an empty value with --depends-on or --dep");

		expect(emptyAlongsideValue.exitCode).toBe(1);
		expect(emptyAlongsideValue.stderr.toString()).toContain("Cannot use an empty value with --depends-on or --dep");

		expect(emptyDraftDep.exitCode).toBe(1);
		expect(emptyDraftDep.stderr.toString()).toContain("Cannot use an empty value with --depends-on or --dep");

		expect(await core.filesystem.loadTask("TASK-2")).toBeNull();
		expect(await core.filesystem.listDrafts()).toHaveLength(0);
	});

	it("clears dependencies with --clear-deps", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task");
		await seedTask(core, "TASK-2", "Dependent task", { dependencies: ["TASK-1"] });

		const result = await $`${CLI_COMMAND} task edit 2 --clear-deps --plain`.cwd(testDir).quiet();

		expect(result.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual([]);
	});

	// On edit an explicit empty value is the second spelling of --clear-deps, matching `-a ""`.
	it("clears dependencies with an explicit empty value", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task");
		await seedTask(core, "TASK-2", "Dependent task", { dependencies: ["TASK-1"] });

		const emptyDependsOn = await $`${CLI_COMMAND} task edit 2 --depends-on "" --plain`.cwd(testDir).nothrow().quiet();
		expect(emptyDependsOn.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual([]);

		await $`${CLI_COMMAND} task edit 2 --depends-on TASK-1`.cwd(testDir).quiet();
		const emptyDep = await $`${CLI_COMMAND} task edit 2 --dep "" --plain`.cwd(testDir).nothrow().quiet();
		expect(emptyDep.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual([]);
	});

	it("accepts an explicit empty value together with --clear-deps", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task");
		await seedTask(core, "TASK-2", "Dependent task", { dependencies: ["TASK-1"] });

		const result = await $`${CLI_COMMAND} task edit 2 --clear-deps --dep "" --plain`.cwd(testDir).nothrow().quiet();

		expect(result.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual([]);
	});

	// Blank values normalize away exactly as they do inside one value (`--dep "TASK-1,"`) and for `-a ""`,
	// so a real dependency alongside a blank one still sets that dependency.
	it("ignores an empty value when a dependency value is also given", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task");
		await seedTask(core, "TASK-2", "Dependent task");

		const result = await $`${CLI_COMMAND} task edit 2 --depends-on "" --dep TASK-1 --plain`
			.cwd(testDir)
			.nothrow()
			.quiet();

		expect(result.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual(["TASK-1"]);
	});

	it("rejects conflicting dependency edits without changing dependencies", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Base task");
		await seedTask(core, "TASK-2", "Dependent task", { dependencies: ["TASK-1"] });

		const conflicting = await $`${CLI_COMMAND} task edit 2 --clear-deps --depends-on TASK-1`
			.cwd(testDir)
			.nothrow()
			.quiet();
		expect(conflicting.exitCode).toBe(1);
		expect(conflicting.stderr.toString()).toContain("Cannot combine --clear-deps with --depends-on or --dep");

		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual(["TASK-1"]);
	});

	it("documents --clear-deps in task edit help", async () => {
		const { testDir } = await makeProject();
		const result = await $`${CLI_COMMAND} task edit --help`.cwd(testDir).quiet();

		expect(result.stdout.toString()).toContain("--clear-deps");
	});

	it("accepts a completed task as a dependency at create and edit time", async () => {
		const { testDir, core } = await makeProject();
		await seedTask(core, "TASK-1", "Done predecessor", { status: "Done" });
		await core.completeTask("TASK-1");

		const created = await $`${CLI_COMMAND} task create "Dependent task" --dep TASK-1`.cwd(testDir).nothrow().quiet();
		expect(created.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual(["TASK-1"]);

		await seedTask(core, "TASK-3", "Other target");
		const edited = await $`${CLI_COMMAND} task edit 2 --depends-on TASK-1,TASK-3`.cwd(testDir).nothrow().quiet();
		expect(edited.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("TASK-2"))?.dependencies).toEqual(["TASK-1", "TASK-3"]);
	});

	it("rejects a dependency that does not exist", async () => {
		const { testDir } = await makeProject();
		const result = await $`${CLI_COMMAND} task create "Dependent task" --dep TASK-999`.cwd(testDir).nothrow().quiet();

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain("The following dependencies do not exist: TASK-999");
	});
});
