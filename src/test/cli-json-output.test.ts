import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const createdDirs: string[] = [];

async function runCommand(args: string[], cwd: string, env?: Record<string, string | undefined>) {
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
	const originalEnv = env ? Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]])) : undefined;
	if (env)
		for (const [key, value] of Object.entries(env)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	let exitCode: number;
	try {
		exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	} finally {
		if (originalEnv)
			for (const [key, value] of Object.entries(originalEnv)) {
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
	}
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

/** Builds the shared JSON-output fixture in an isolated directory for one test. */
async function makeProject() {
	const TEST_DIR = createUniqueTestDir("test-cli-json-output");
	await mkdir(TEST_DIR, { recursive: true });

	const core = new Core(TEST_DIR);
	await initializeFilesystemTestProject(core, "JSON Output Test");
	await core.createTask({
		id: "task-1",
		title: "JSON task",
		status: "In Progress",
		type: "enhancement",
		priority: "high",
		assignee: ["@alex"],
		reporter: "@sam",
		createdDate: "2026-07-14 09:30",
		updatedDate: "2026-07-14 10:45",
		dueDate: "2026-08-10",
		labels: ["cli", "json"],
		milestone: "m-1",
		dependencies: ["TASK-2"],
		references: ["https://example.com/issue"],
		documentation: ["doc-1"],
		modifiedFiles: ["src/cli.ts"],
		description: "Machine-readable output",
		ordinal: 1000,
		branch: "secret-branch",
		rawContent: "internal markdown",
		source: "local",
		onStatusChange: "echo secret",
	});

	await core.filesystem.saveDocument({
		id: "doc-1",
		title: "JSON guide",
		type: "guide",
		createdDate: "2026-07-13",
		updatedDate: "2026-07-14 08:00",
		rawContent: "JSON task documentation",
		tags: ["cli"],
		path: "guides/json.md",
	});

	await core.filesystem.saveDecision({
		id: "decision-1",
		title: "Use stable JSON",
		date: "2026-07-12",
		status: "accepted",
		context: "JSON task consumers need stability",
		decision: "Publish curated fields",
		consequences: "Version the contract",
		rawContent: "JSON task decision",
	});
	createdDirs.push(TEST_DIR);
	return { dir: TEST_DIR, runCli: (args: string[], cwd = TEST_DIR) => runCommand(args, cwd) };
}

// runCli temporarily mutates process globals, so invocations in this suite stay serial.
describe("CLI JSON output", () => {
	afterAll(async () => {
		await Promise.all(createdDirs.map((dir) => safeCleanup(dir)));
	});

	it("returns a compact versioned task-list envelope", async () => {
		const { runCli } = await makeProject();
		const result = await runCli(["task", "list", "--json"]);
		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe("");
		expect(result.stdout.toString().endsWith("\n")).toBe(true);

		const output = JSON.parse(result.stdout.toString());
		expect(output).toEqual({
			schemaVersion: 1,
			kind: "task-list",
			tasks: [
				{
					id: "TASK-1",
					title: "JSON task",
					status: "In Progress",
					type: "enhancement",
					priority: "high",
					project: null,
					assignees: ["@alex"],
					reporter: "@sam",
					labels: ["cli", "json"],
					milestone: "m-1",
					parentTaskId: null,
					references: ["https://example.com/issue"],
					modifiedFiles: ["src/cli.ts"],
					ordinal: 1000,
					createdAt: "2026-07-14T09:30:00Z",
					updatedAt: "2026-07-14T10:45:00Z",
					dueDate: "2026-08-10",
					// TASK-2 is not a task anything can resolve, so the verdict fails closed.
					isReady: false,
				},
			],
		});
		expect(result.stdout.toString()).not.toContain("rawContent");
		expect(result.stdout.toString()).not.toContain("secret-branch");
		expect(result.stdout.toString()).not.toContain("onStatusChange");
	});

	it("emits empty reference and modified-file arrays for tasks without them", async () => {
		const { dir: TEST_DIR, runCli } = await makeProject();
		const core = new Core(TEST_DIR);
		await core.createTask({
			id: "TASK-3",
			title: "Bare task",
			status: "To Do",
			assignee: [],
			createdDate: "2026-07-15 08:00",
			labels: [],
			dependencies: [],
			rawContent: "",
		});
		const result = await runCli(["task", "list", "--json"]);
		expect(result.exitCode).toBe(0);
		const bare = JSON.parse(result.stdout.toString()).tasks.find((t: { id: string }) => t.id === "TASK-3");
		expect(bare.references).toEqual([]);
		expect(bare.modifiedFiles).toEqual([]);
	});

	it("returns a compact versioned decision-list envelope", async () => {
		const { runCli } = await makeProject();
		const result = await runCli(["decision", "list", "--json"]);
		expect(result.exitCode).toBe(0);
		expect(result.stderr.toString()).toBe("");
		expect(result.stdout.toString().endsWith("\n")).toBe(true);

		expect(JSON.parse(result.stdout.toString())).toEqual({
			schemaVersion: 1,
			kind: "decision-list",
			decisions: [
				{
					id: "decision-1",
					title: "Use stable JSON",
					status: "accepted",
					date: "2026-07-12",
				},
			],
		});
		expect(result.stdout.toString()).not.toContain("rawContent");
		expect(result.stdout.toString()).not.toContain("Publish curated fields");
	});

	it("returns curated task details for view and shorthand", async () => {
		const { runCli } = await makeProject();
		for (const args of [
			["task", "view", "1", "--json"],
			["task", "1", "--json"],
		]) {
			const result = await runCli(args);
			expect(result.exitCode).toBe(0);
			const output = JSON.parse(result.stdout.toString());
			expect(output.schemaVersion).toBe(1);
			expect(output.kind).toBe("task-view");
			expect(output.task.path).toBe("backlog/tasks/task-1/task.md");
			expect(output.task.description).toBe("Machine-readable output");
			expect(output.task.dependencies).toEqual(["TASK-2"]);
			// The summary verdict and the detail explanation behind it, from the same derivation.
			expect(output.task.isReady).toBe(false);
			expect(output.task.readiness).toEqual({
				isReady: false,
				isBlocked: true,
				blockingDependencies: [],
				missingDependencies: ["TASK-2"],
			});
			expect(output.task).not.toHaveProperty("agentSummary");
			expect(output.task.subtasks).toEqual([]);
			expect(output.task.dueDate).toBe("2026-08-10");
			expect(output.task.rawContent).toBeUndefined();
			expect(output.task.filePath).toBeUndefined();
			expect(output.task.branch).toBeUndefined();
		}
	});

	it("serializes an absent description as null and preserves Markdown verbatim", async () => {
		const { runCli } = await makeProject();
		const withoutDescription = await runCli(["task", "create", "No description", "--plain"]);
		expect(withoutDescription.exitCode).toBe(0);
		const withMarkdown = await runCli([
			"task",
			"create",
			"Markdown description",
			"--description",
			"First line\n\n- item with `code`",
			"--plain",
		]);
		expect(withMarkdown.exitCode).toBe(0);

		const absent = await runCli(["task", "view", "2", "--json"]);
		expect(absent.exitCode).toBe(0);
		expect(JSON.parse(absent.stdout.toString()).task.description).toBeNull();

		const markdown = await runCli(["task", "view", "3", "--json"]);
		expect(markdown.exitCode).toBe(0);
		expect(JSON.parse(markdown.stdout.toString()).task.description).toBe("First line\n\n- item with `code`");
	});

	it("preserves heterogeneous search rank and omits scores", async () => {
		const { runCli } = await makeProject();
		const result = await runCli(["search", "JSON task", "--json"]);
		expect(result.exitCode).toBe(0);
		const output = JSON.parse(result.stdout.toString());
		expect(output.schemaVersion).toBe(1);
		expect(output.kind).toBe("search");
		expect(output.results.map((entry: { type: string }) => entry.type)).toEqual(["task", "document", "decision"]);
		expect(output.results[0].data.id).toBe("TASK-1");
		// Task results carry the same verdict the task list publishes.
		expect(output.results[0].data.isReady).toBe(false);
		expect(output.results[1].data).toEqual({
			id: "doc-1",
			title: "JSON guide",
			type: "guide",
			path: "backlog/docs/doc-1 - JSON-guide.md",
			tags: ["cli"],
			createdAt: "2026-07-13",
			updatedAt: "2026-07-14T08:00:00Z",
		});
		expect(output.results[2].data).toEqual({
			id: "decision-1",
			title: "Use stable JSON",
			status: "accepted",
			date: "2026-07-12",
		});
		for (const entry of output.results) {
			expect(entry.score).toBeUndefined();
		}
	});

	it("reads no task corpus for a search that matched no task", async () => {
		const { dir: TEST_DIR } = await makeProject(); // A completed record that cannot be parsed is never cached, so it is re-read and re-logged
		// under DEBUG on every load of the completed corpus. Counting those lines counts the corpus
		// reads one command makes.
		await mkdir(join(TEST_DIR, "backlog", "completed", "task-99"), { recursive: true });
		await writeFile(
			join(TEST_DIR, "backlog", "completed", "task-99", "task.md"),
			"---\nid: TASK-99\ntitle: [unclosed\nstatus: Done\n---\n\nbroken\n",
		);
		const corpusReads = async (args: string[]) => {
			const result = await runCommand(args, TEST_DIR, { DEBUG: "1" });
			expect(result.exitCode).toBe(0);
			return {
				stdout: result.stdout,
				reads: result.stderr.split("\n").filter((line) => line.startsWith("Failed to parse completed task file"))
					.length,
			};
		};

		const asJson = await corpusReads(["search", "JSON", "--type", "document", "--json"]);
		const asPlain = await corpusReads(["search", "JSON", "--type", "document", "--plain"]);
		expect(JSON.parse(asJson.stdout).results.every((entry: { type: string }) => entry.type === "document")).toBe(true);
		// Nothing in that payload carries readiness, so nothing loads the corpus it comes from.
		expect(asJson.reads).toBe(asPlain.reads);
	});

	it("uses the configured project-relative docs directory in search paths", async () => {
		const { runCli } = await makeProject();
		const customTestDir = createUniqueTestDir("test-cli-json-output-custom-dir");
		try {
			await mkdir(customTestDir, { recursive: true });

			const core = new Core(customTestDir);
			await initializeFilesystemTestProject(core, "Custom JSON Output Test", "planning/backlog-data");
			await new Core(customTestDir).filesystem.saveDocument({
				id: "doc-1",
				title: "Custom guide",
				type: "guide",
				createdDate: "2026-07-15",
				rawContent: "Custom directory JSON documentation",
			});

			const result = await runCli(["search", "Custom directory JSON", "--json"], customTestDir);
			expect(result.exitCode).toBe(0);
			expect(result.stderr.toString()).toBe("");
			const output = JSON.parse(result.stdout.toString());
			expect(output.results).toHaveLength(1);
			expect(output.results[0].data.path).toBe("planning/backlog-data/docs/doc-1 - Custom-guide.md");
		} finally {
			await safeCleanup(customTestDir);
		}
	});

	it("returns successful empty envelopes", async () => {
		const { runCli } = await makeProject();
		const list = await runCli(["task", "list", "--status", "Done", "--json"]);
		expect(JSON.parse(list.stdout.toString())).toEqual({ schemaVersion: 1, kind: "task-list", tasks: [] });

		const search = await runCli(["search", "no-such-content", "--json"]);
		expect(JSON.parse(search.stdout.toString())).toEqual({ schemaVersion: 1, kind: "search", results: [] });
	});

	it("rejects conflicting output modes without stdout", async () => {
		const { runCli } = await makeProject();
		for (const args of [
			["task", "list", "--json", "--plain"],
			["task", "view", "1", "--json", "--plain"],
			["task", "1", "--json", "--plain"],
			["search", "JSON", "--json", "--plain"],
			["decision", "list", "--json", "--plain"],
		]) {
			const result = await runCli(args);
			expect(result.exitCode).toBe(1);
			expect(result.stdout.toString()).toBe("");
			expect(result.stderr.toString()).toContain("--json cannot be combined with --plain");
		}
	});

	it("treats output-looking search terms after -- as literal queries", async () => {
		const { runCli } = await makeProject();
		const json = await runCli(["search", "--json", "--", "--plain"]);
		expect(json.exitCode).toBe(0);
		expect(json.stderr.toString()).toBe("");
		expect(JSON.parse(json.stdout.toString())).toEqual({ schemaVersion: 1, kind: "search", results: [] });

		const plain = await runCli(["search", "--plain", "--", "--json"]);
		expect(plain.exitCode).toBe(0);
		expect(plain.stderr.toString()).toBe("");
		expect(plain.stdout.toString()).toContain("TASK-1 - JSON task");
	});

	it("rejects --json on unsupported task subcommands", async () => {
		const { runCli } = await makeProject();
		for (const args of [
			["task", "archive", "999", "--json"],
			["task", "--json", "archive", "999"],
		]) {
			const result = await runCli(args);
			expect(result.exitCode).toBe(1);
			expect(result.stdout.toString()).toBe("");
			expect(result.stderr.toString()).toContain("--json");
			expect(result.stderr.toString()).not.toContain("Task 999 not found");
		}
	});

	it("uses stderr and a nonzero exit for JSON errors", async () => {
		const { runCli } = await makeProject();
		for (const args of [
			["task", "view", "999", "--json"],
			["task", "999", "--json"],
			["task", "list", "--limit", "0", "--json"],
		]) {
			const result = await runCli(args);
			expect(result.exitCode).toBe(1);
			expect(result.stdout.toString()).toBe("");
			expect(result.stderr.toString().length).toBeGreaterThan(0);
		}
	});

	it("is parseable through a shell pipe", async () => {
		const { runCli } = await makeProject();
		const result = await runCli(["task", "list", "--json"]);
		expect(result.exitCode).toBe(0);
		const parser = Bun.spawn(["bun", "-e", "const value = await Bun.stdin.json(); console.log(value.kind);"], {
			stdin: "pipe",
			stdout: "pipe",
		});
		parser.stdin.write(result.stdout);
		parser.stdin.end();
		expect(await parser.exited).toBe(0);
		expect(await new Response(parser.stdout).text()).toBe("task-list\n");
	});

	it("documents JSON mode in command help", async () => {
		const { runCli } = await makeProject();
		for (const args of [
			["task", "list", "--help"],
			["task", "view", "--help"],
			["task", "--help"],
			["search", "--help"],
			["decision", "list", "--help"],
		]) {
			const result = await runCli(args);
			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toContain("--json");
		}
	});
});
