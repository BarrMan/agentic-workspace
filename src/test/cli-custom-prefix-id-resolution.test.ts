import { afterAll, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../utils/task-path.ts";
import {
	commitSamePathBranchTaskVariant,
	createUniqueTestDir,
	initializeFilesystemTestProject,
	initializeTestProject,
	safeCleanup,
} from "./test-utils.ts";

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

/** Creates an empty isolated project directory for one test and remembers it for cleanup. */
async function makeDir(): Promise<string> {
	const dir = createUniqueTestDir("test-custom-prefix-id-resolution");
	await mkdir(dir, { recursive: true });
	createdDirs.push(dir);
	return dir;
}

/**
 * Every command that takes a task or draft ID must resolve it through the same identity path,
 * so a bare numeric ID works wherever a prefixed ID works - including under a custom ID prefix.
 */
async function initCustomPrefixProject(dir: string): Promise<Core> {
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Custom Prefix ID Resolution");
	const config = await core.filesystem.loadConfig();
	if (!config) throw new Error("Expected config to be loaded");
	await core.filesystem.saveConfig({ ...config, prefixes: { ...config.prefixes, task: "BACK" } });
	return core;
}

async function createTask(
	core: Core,
	id: string,
	title: string,
	extra: { status?: string; parentTaskId?: string } = {},
): Promise<void> {
	await core.filesystem.saveTask({
		id,
		title,
		status: extra.status ?? "To Do",
		assignee: [],
		labels: [],
		dependencies: [],
		createdDate: "2026-08-08",
		rawContent: "",
		...(extra.parentTaskId ? { parentTaskId: extra.parentTaskId } : {}),
	});
}

async function createDraft(core: Core, id: string, title: string): Promise<void> {
	await core.filesystem.saveDraft({
		id,
		title,
		status: "Draft",
		assignee: [],
		labels: [],
		dependencies: [],
		createdDate: "2026-08-08",
		rawContent: "",
	});
}

/** One case per ID-accepting command, run once with a bare numeric ID and once with a prefixed ID. */
interface IdCommandCase {
	name: string;
	/** Receives the ID form under test and returns the CLI arguments to run. */
	args: (id: string) => string[];
	/** Fresh fixtures, because most of these commands move or rewrite the task they target. */
	setup: (core: Core) => Promise<void>;
	/** Expected on stdout for both ID forms. */
	expected: string;
}

const idCommandCases: IdCommandCase[] = [
	{
		name: "task <id>",
		args: (id) => ["task", id, "--plain"],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "BACK-1 - Target task",
	},
	{
		name: "task view",
		args: (id) => ["task", "view", id, "--plain"],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "BACK-1 - Target task",
	},
	{
		name: "task edit",
		args: (id) => ["task", "edit", id, "-s", "In Progress"],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "Updated task BACK-1",
	},
	{
		name: "task archive",
		args: (id) => ["task", "archive", id],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "Archived task BACK-1",
	},
	{
		name: "task complete",
		args: (id) => ["task", "complete", id],
		setup: async (core) => createTask(core, "BACK-1", "Target task", { status: "Done" }),
		expected: "Completed task BACK-1.",
	},
	{
		name: "task demote",
		args: (id) => ["task", "demote", id],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "Demoted task BACK-1",
	},
	{
		name: "task list --parent",
		args: (id) => ["task", "list", "--parent", id, "--plain"],
		setup: async (core) => {
			await createTask(core, "BACK-1", "Target task");
			await createTask(core, "BACK-1.1", "Child task", { parentTaskId: "BACK-1" });
		},
		expected: "BACK-1.1 - Child task",
	},
	{
		name: "task create --parent",
		args: (id) => ["task", "create", "Child", "--parent", id],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "Created task BACK-1.1",
	},
	{
		name: "task create --dep",
		args: (id) => ["task", "create", "Dependent", "--dep", id],
		setup: async (core) => createTask(core, "BACK-1", "Target task"),
		expected: "Created task BACK-2",
	},
	{
		name: "task edit --dep",
		args: (id) => ["task", "edit", "BACK-2", "--dep", id],
		setup: async (core) => {
			await createTask(core, "BACK-1", "Target task");
			await createTask(core, "BACK-2", "Dependent task");
		},
		expected: "Updated task BACK-2",
	},
];

const draftCommandCases: IdCommandCase[] = [
	{
		name: "draft <id>",
		args: (id) => ["draft", id, "--plain"],
		setup: async (core) => createDraft(core, "DRAFT-1", "Target draft"),
		expected: "DRAFT-1 - Target draft",
	},
	{
		name: "draft view",
		args: (id) => ["draft", "view", id, "--plain"],
		setup: async (core) => createDraft(core, "DRAFT-1", "Target draft"),
		expected: "DRAFT-1 - Target draft",
	},
	{
		name: "draft archive",
		args: (id) => ["draft", "archive", id],
		setup: async (core) => createDraft(core, "DRAFT-1", "Target draft"),
		expected: "Archived draft DRAFT-1",
	},
	{
		name: "draft promote",
		args: (id) => ["draft", "promote", id],
		setup: async (core) => createDraft(core, "DRAFT-1", "Target draft"),
		expected: "Promoted draft DRAFT-1",
	},
];

// Every test owns its project directory, so the suite runs its tests concurrently.
describe("CLI task ID resolution with a custom ID prefix", () => {
	afterAll(async () => {
		await Promise.all(createdDirs.map((dir) => safeCleanup(dir)));
	});

	for (const testCase of idCommandCases) {
		for (const [form, id] of [
			["bare numeric", "1"],
			["prefixed", "BACK-1"],
		] as const) {
			it(`resolves a ${form} ID for ${testCase.name}`, async () => {
				const TEST_DIR = await makeDir();
				const core = await initCustomPrefixProject(TEST_DIR);
				await testCase.setup(core);

				const result = await $`${CLI_COMMAND} ${testCase.args(id)}`.cwd(TEST_DIR).nothrow().quiet();

				expect(result.stderr.toString()).not.toContain("not found");
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString()).toContain(testCase.expected);
			});
		}
	}

	for (const testCase of draftCommandCases) {
		for (const [form, id] of [
			["bare numeric", "1"],
			["prefixed", "DRAFT-1"],
		] as const) {
			it(`resolves a ${form} ID for ${testCase.name}`, async () => {
				const TEST_DIR = await makeDir();
				const core = await initCustomPrefixProject(TEST_DIR);
				await testCase.setup(core);

				const result = await $`${CLI_COMMAND} ${testCase.args(id)}`.cwd(TEST_DIR).nothrow().quiet();

				expect(result.stderr.toString()).not.toContain("not found");
				expect(result.exitCode).toBe(0);
				expect(result.stdout.toString()).toContain(testCase.expected);
			});
		}
	}

	it("stores one dependency when equivalent ID forms name the same task", async () => {
		const TEST_DIR = await makeDir();
		const core = await initCustomPrefixProject(TEST_DIR);
		await createTask(core, "BACK-1", "Target task");
		await createTask(core, "BACK-2", "Dependent task");

		const edited = await $`${CLI_COMMAND} task edit 2 --dep 1,BACK-1`.cwd(TEST_DIR).nothrow().quiet();
		expect(edited.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("BACK-2"))?.dependencies).toEqual(["BACK-1"]);

		const created = await $`${CLI_COMMAND} task create Dependent --dep BACK-1,1`.cwd(TEST_DIR).nothrow().quiet();
		expect(created.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("BACK-3"))?.dependencies).toEqual(["BACK-1"]);
		const padded = await $`${CLI_COMMAND} task create PaddedDependent --dep BACK-001`.cwd(TEST_DIR).nothrow().quiet();
		expect(padded.exitCode).not.toBe(0);
		expect(`${padded.stdout.toString()}${padded.stderr.toString()}`).toContain("BACK-001");
	});

	it("edits a task once when a bare number and the prefixed ID alias it in one batch", async () => {
		const TEST_DIR = await makeDir();
		const core = await initCustomPrefixProject(TEST_DIR);
		await createTask(core, "BACK-1", "Target task");

		// "1" only becomes BACK-1 at resolution time, so the batch must collapse on the resolved
		// identity instead of saving the same task twice.
		const result = await $`${CLI_COMMAND} task edit 1 BACK-1 -s Done`.cwd(TEST_DIR).nothrow().quiet();

		expect(result.exitCode).toBe(0);
		const updates = result.stdout
			.toString()
			.split("\n")
			.filter((line) => line.includes("Updated task"));
		expect(updates).toHaveLength(1);
		expect((await core.filesystem.loadTask("BACK-1"))?.status).toBe("Done");
	});

	it("does not confuse a padded task ID with its unpadded dependency", async () => {
		const TEST_DIR = await makeDir();
		const core = await initCustomPrefixProject(TEST_DIR);
		await createTask(core, "BACK-1", "Target task");
		await createTask(core, "BACK-2", "Dependent task");
		// BACK-01 is a separate identity; it must not make a reference to BACK-1 ambiguous.
		const tasksDir = core.filesystem.tasksDir;
		await Bun.write(
			join(tasksDir, "back-01", "task.md"),
			(await Bun.file(join(tasksDir, "back-1", "task.md")).text()).replace("id: BACK-1", "id: BACK-01"),
		);

		for (const args of [
			["task", "edit", "2", "--dep", "1"],
			["task", "edit", "2", "--dep", "BACK-1"],
			["task", "create", "Dependent", "--dep", "1"],
		]) {
			const result = await $`${CLI_COMMAND} ${args}`.cwd(TEST_DIR).nothrow().quiet();

			expect(result.exitCode).toBe(0);
		}

		expect((await core.filesystem.loadTask("BACK-2"))?.dependencies).toEqual(["BACK-1"]);
		expect((await core.filesystem.loadTask("BACK-3"))?.dependencies).toEqual(["BACK-1"]);
	});

	// A zero-padded sibling occupies its own distinct ID and canonical directory.
	for (const [shape, twinFile, rewrite] of [
		["a zero-padded identity", "back-01/task.md", (text: string) => text.replace("id: BACK-1", "id: BACK-01")],
	] as const) {
		it(`keeps parent resolution exact with ${shape}`, async () => {
			const TEST_DIR = await makeDir();
			const core = await initCustomPrefixProject(TEST_DIR);
			await createTask(core, "BACK-1", "Target task");
			await createTask(core, "BACK-1.1", "Child task", { parentTaskId: "BACK-1" });
			const tasksDir = core.filesystem.tasksDir;
			await Bun.write(join(tasksDir, twinFile), rewrite(await Bun.file(join(tasksDir, "back-1", "task.md")).text()));

			for (const parent of ["1", "BACK-1"]) {
				const result = await $`${CLI_COMMAND} task list --parent ${parent} --plain`.cwd(TEST_DIR).nothrow().quiet();

				expect(result.exitCode).toBe(0);
				const output = `${result.stdout.toString()}${result.stderr.toString()}`;
				expect(output).not.toContain("Task ID BACK-1 is ambiguous");
				expect(result.stdout.toString()).toContain("BACK-1.1 - Child task");
			}
		});
	}

	it("keeps the parent filter local when another branch has a canonical ID variant", async () => {
		const TEST_DIR = await makeDir(); // A branch variant spelling BACK-1 as BACK-001 sits at its own path. The cross-branch corpus
		// therefore holds two entries for identity BACK-1 while the local corpus holds one, so the
		// parent filter must not resolve from a cross-branch list: whichever corpus a mode used would
		// otherwise decide whether the same argument is accepted.
		const core = new Core(TEST_DIR);
		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
		await $`git config user.name Test`.cwd(TEST_DIR).quiet();
		await initializeTestProject(core, "Cross Branch Parent Filter");
		const config = await core.filesystem.loadConfig();
		if (!config) throw new Error("Expected config to be loaded");
		await core.filesystem.saveConfig({
			...config,
			prefixes: { ...config.prefixes, task: "BACK" },
			checkActiveBranches: true,
			remoteOperations: false,
		});
		await createTask(core, "BACK-1.1", "Child task", { parentTaskId: "BACK-1" });
		await commitSamePathBranchTaskVariant(
			core,
			{
				id: "BACK-1",
				title: "Parent local",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: [],
				createdDate: "2026-08-09",
				rawContent: "",
			},
			{
				id: "BACK-001",
				title: "Parent branch variant",
				status: "To Do",
				assignee: [],
				labels: [],
				dependencies: [],
				createdDate: "2026-08-09",
				rawContent: "",
			},
			join(core.filesystem.tasksDir, "back-001", "task.md"),
		);

		// The corpus the resolver reads sees one BACK-1; a cross-branch corpus would see two.
		const localMatches = (await core.queryTasks({ includeCrossBranch: false })).filter((task) =>
			["BACK-1", "BACK-001"].includes(task.id),
		);
		const crossBranchMatches = (await core.queryTasks()).filter((task) => ["BACK-1", "BACK-001"].includes(task.id));
		expect(localMatches).toHaveLength(1);
		expect(crossBranchMatches.length).toBeGreaterThan(1);

		// Parent filtering is a local task-list operation, so the branch variant must neither block
		// the command nor change which local children are displayed.
		const result = await $`${CLI_COMMAND} task list --parent 1 --plain`.cwd(TEST_DIR).nothrow().quiet();
		const output = `${result.stdout.toString()}${result.stderr.toString()}`;
		expect(result.exitCode).toBe(0);
		expect(output).not.toContain("Task ID BACK-1 is ambiguous");
		expect(output).not.toContain("Parent task BACK-1 not found.");
		expect(result.stdout.toString()).toContain("BACK-1.1 - Child task");
	});

	it("archives and promotes the draft file named by the argument, not by its frontmatter ID", async () => {
		const TEST_DIR = await makeDir(); // A drifted draft file (filename draft-1, frontmatter DRAFT-2) alongside a real draft-2 must
		// not redirect the mutation onto the other file.
		const core = await initCustomPrefixProject(TEST_DIR);
		await createDraft(core, "DRAFT-2", "Two");
		const draftsDir = await core.filesystem.getDraftsDir();
		await mkdir(join(draftsDir, "draft-1"), { recursive: true });
		await Bun.write(
			join(draftsDir, "draft-1", "task.md"),
			(await Bun.file(join(draftsDir, "draft-2", "task.md")).text()).replace("title: Two", "title: One"),
		);

		const archived = await $`${CLI_COMMAND} draft archive 1`.cwd(TEST_DIR).nothrow().quiet();
		expect(archived.exitCode).toBe(0);
		expect(archived.stdout.toString()).toContain("Archived draft DRAFT-1");
		expect(await Bun.file(join(draftsDir, "draft-1", "task.md")).exists()).toBe(false);
		expect(await Bun.file(join(draftsDir, "draft-2", "task.md")).exists()).toBe(true);

		// Same for promote: the remaining draft-2 file must be the one promoted when asked for 2.
		const promoted = await $`${CLI_COMMAND} draft promote 2`.cwd(TEST_DIR).nothrow().quiet();
		expect(promoted.exitCode).toBe(0);
		expect(promoted.stdout.toString()).toContain("Promoted draft DRAFT-2");
		expect(await Bun.file(join(draftsDir, "draft-2", "task.md")).exists()).toBe(false);
	});

	it("fails closed when a bare dependency ID matches both a task and a draft", async () => {
		const TEST_DIR = await makeDir();
		const core = await initCustomPrefixProject(TEST_DIR);
		await createTask(core, "BACK-1", "Target task");
		await createTask(core, "BACK-2", "Dependent task");
		// Task and draft IDs come from separate counters, so a bare 1 names two different tasks.
		await createDraft(core, "DRAFT-1", "Target draft");

		const ambiguous = await $`${CLI_COMMAND} task edit 2 --dep 1`.cwd(TEST_DIR).nothrow().quiet();
		expect(ambiguous.exitCode).not.toBe(0);
		const output = `${ambiguous.stdout.toString()}${ambiguous.stderr.toString()}`;
		expect(output).toContain("Dependency ID 1 is ambiguous");
		expect(output).toContain("back-1/task.md");
		expect(output).toContain("draft-1/task.md");
		expect((await core.filesystem.loadTask("BACK-2"))?.dependencies ?? []).toEqual([]);

		// A fully qualified ID still names exactly one of them, in either namespace.
		const onTask = await $`${CLI_COMMAND} task edit 2 --dep BACK-1`.cwd(TEST_DIR).nothrow().quiet();
		expect(onTask.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("BACK-2"))?.dependencies).toEqual(["BACK-1"]);

		const onDraft = await $`${CLI_COMMAND} task edit 2 --dep DRAFT-1`.cwd(TEST_DIR).nothrow().quiet();
		expect(onDraft.exitCode).toBe(0);
		expect((await core.filesystem.loadTask("BACK-2"))?.dependencies).toEqual(["DRAFT-1"]);
	});

	it("rejects a blank parent filter instead of listing every task", async () => {
		const TEST_DIR = await makeDir();
		const core = await initCustomPrefixProject(TEST_DIR);
		await createTask(core, "BACK-1", "Target task");
		await createTask(core, "BACK-2", "Other task");

		for (const parent of ["   ", ""]) {
			const result = await $`${CLI_COMMAND} task list --parent ${parent} --plain`.cwd(TEST_DIR).nothrow().quiet();

			expect(result.exitCode).toBe(1);
			expect(result.stderr.toString()).toContain(
				"Cannot use an empty value with --parent. Omit the flag to list every task.",
			);
			expect(result.stdout.toString()).not.toContain("BACK-2 - Other task");
		}

		// Omitting the flag still lists everything.
		const unfiltered = await $`${CLI_COMMAND} task list --plain`.cwd(TEST_DIR).nothrow().quiet();
		expect(unfiltered.exitCode).toBe(0);
		expect(unfiltered.stdout.toString()).toContain("BACK-2 - Other task");
	});

	it("reports missing IDs with the configured prefix instead of the default one", async () => {
		const TEST_DIR = await makeDir();
		const core = await initCustomPrefixProject(TEST_DIR);
		await createTask(core, "BACK-1", "Target task");

		const parentFilter = await $`${CLI_COMMAND} task list --parent 999 --plain`.cwd(TEST_DIR).nothrow().quiet();
		expect(parentFilter.exitCode).toBe(1);
		expect(parentFilter.stderr.toString()).toContain("Parent task BACK-999 not found.");
		expect(parentFilter.stderr.toString()).toContain(LOCAL_TASK_LOOKUP_HINT);

		const parentCreate = await $`${CLI_COMMAND} task create Child --parent 999`.cwd(TEST_DIR).nothrow().quiet();
		expect(parentCreate.exitCode).toBe(1);
		expect(parentCreate.stderr.toString()).toContain("Parent task BACK-999 not found.");
		expect(parentCreate.stderr.toString()).toContain(LOCAL_TASK_LOOKUP_HINT);
	});

	it("accepts exact IDs when a padded sibling exists", async () => {
		const TEST_DIR = await makeDir();
		const core = await initCustomPrefixProject(TEST_DIR);
		await createTask(core, "BACK-1", "Target task");
		// The padded sibling is a separate ID and must not make BACK-1 ambiguous.
		const tasksDir = core.filesystem.tasksDir;
		await Bun.write(
			join(tasksDir, "back-01", "task.md"),
			(await Bun.file(join(tasksDir, "back-1", "task.md")).text()).replace("id: BACK-1", "id: BACK-01"),
		);

		for (const args of [
			["task", "1", "--plain"],
			["task", "view", "1", "--plain"],
		]) {
			const result = await $`${CLI_COMMAND} ${args}`.cwd(TEST_DIR).nothrow().quiet();

			expect(result.exitCode).toBe(0);
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;
			expect(output).not.toContain("is ambiguous");
		}

		// Both exact IDs remain independently stored.
		expect(await Bun.file(join(tasksDir, "back-1", "task.md")).exists()).toBe(true);
		expect(await Bun.file(join(tasksDir, "back-01", "task.md")).exists()).toBe(true);
	});
});
