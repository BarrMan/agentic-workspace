import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { $ as shell } from "bun";
import { runCli } from "../cli/register.ts";
import { CLI_AGENT_NUDGE, Core } from "../index.ts";
import { BACKLOG_CWD_ENV } from "../utils/runtime-cwd.ts";
import { LOCAL_TASK_LOOKUP_HINT } from "../utils/task-path.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let INIT_FIXTURE_DIR: string;
let CREATE_FIXTURE_DIR: string;
let initFixtureDirectoryNumber = 0;
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
			exitCode = await runCli(args.slice(CLI_COMMAND.length), {
				cwd: config.env?.[BACKLOG_CWD_ENV] ? undefined : config.cwd,
				stdout: out,
				stderr: err,
			});
		} finally {
			if (originalEnv)
				for (const [key, value] of Object.entries(originalEnv)) {
					if (value === undefined) delete process.env[key];
					else process.env[key] = value;
				}
		}
		const value = { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
		if (value.exitCode && !config.nothrow) {
			const error = new Error(value.stderr || `CLI exited with ${value.exitCode}`) as Error & {
				stdout: string;
				stderr: string;
			};
			Object.assign(error, { stdout: value.stdout, stderr: value.stderr });
			throw error;
		}
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
	// Every CLI invocation below shares this process's environment. A BACKLOG_CWD exported in
	// the developer's shell would otherwise pin them to a real board outside the test directory,
	// so it is removed here and restored afterwards; tests that need it set it explicitly.
	let originalBacklogCwd: string | undefined;

	beforeAll(() => {
		originalBacklogCwd = process.env[BACKLOG_CWD_ENV];
		delete process.env[BACKLOG_CWD_ENV];
	});

	afterAll(() => {
		if (originalBacklogCwd === undefined) {
			delete process.env[BACKLOG_CWD_ENV];
		} else {
			process.env[BACKLOG_CWD_ENV] = originalBacklogCwd;
		}
	});

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli");
		await mkdir(TEST_DIR, { recursive: true });
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("agenticworkspace init command", () => {
		beforeAll(async () => {
			INIT_FIXTURE_DIR = createUniqueTestDir("test-cli-init");
			await mkdir(INIT_FIXTURE_DIR, { recursive: true });
			await $`git init -b main`.cwd(INIT_FIXTURE_DIR).quiet();
		});

		beforeEach(async () => {
			await safeCleanup(TEST_DIR);
			TEST_DIR = join(INIT_FIXTURE_DIR, `${++initFixtureDirectoryNumber}`);
			await mkdir(TEST_DIR, { recursive: true });
		});

		afterAll(async () => {
			await safeCleanup(INIT_FIXTURE_DIR);
		});

		it("should create all required directories", async () => {
			const core = new Core(TEST_DIR);
			await initializeTestProject(core, "Directory Test");

			// Check all expected directories exist
			const expectedDirs = [
				"backlog",
				"backlog/tasks",
				"backlog/drafts",
				"backlog/archive",
				"backlog/archive/tasks",
				"backlog/archive/drafts",
				"backlog/archive/milestones",
				"backlog/milestones",
				"backlog/docs",
				"backlog/decisions",
			];

			for (const dir of expectedDirs) {
				try {
					const stats = await stat(join(TEST_DIR, dir));
					expect(stats.isDirectory()).toBe(true);
				} catch {
					// If stat fails, directory doesn't exist
					expect(false).toBe(true);
				}
			}
		});

		it("should handle project names with special characters", async () => {
			const core = new Core(TEST_DIR);
			const specialProjectName = "My-Project_2024 (v1.0)";
			await initializeTestProject(core, specialProjectName);

			const config = await core.filesystem.loadConfig();
			expect(config?.projectName).toBe(specialProjectName);
		});

		// One real init run proves both the 'none' skip and the minimal summary; the two used to run
		// byte-identical commands in fresh directories.
		it("should allow skipping agent instructions with 'none' selection and print a minimal summary", async () => {
			const output = await $`${CLI_COMMAND} init SummaryProj --defaults --agent-instructions none`.cwd(TEST_DIR).text();

			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			const claudeFile = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
			expect(agentsFile).toBe(false);
			expect(claudeFile).toBe(false);
			expect(output).toContain("AI Integration: CLI instructions");
			expect(output).toContain("Skipping agent instruction files per selection.");

			expect(output).toContain("Initialization Summary");
			expect(output).toContain("Project Name: SummaryProj");
			expect(output).toContain("AI Integration: CLI instructions");
			expect(output).toContain("Advanced settings: unchanged");
			expect(output).not.toContain("Remote operations:");
			expect(output).not.toContain("Zero-padded IDs:");
		});

		it("should support MCP integration mode via flag", async () => {
			const output = await $`${CLI_COMMAND} init McpProj --defaults --integration-mode mcp`.cwd(TEST_DIR).text();

			expect(output).toContain("AI Integration: MCP connector");
			expect(output).toContain("Agent instruction files: guidance is provided through the MCP connector.");
			expect(output).toContain("MCP server name: agenticworkspace");
			expect(output).toContain("MCP client setup: skipped (non-interactive)");
			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			const claudeFile = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
			expect(agentsFile).toBe(false);
			expect(claudeFile).toBe(false);
		});

		it("should default to CLI instructions when no mode is specified", async () => {
			const output = await $`${CLI_COMMAND} init DefaultCliProj --defaults`.cwd(TEST_DIR).text();

			expect(output).toContain("AI Integration: CLI instructions");
			expect(output).toContain("Agent instructions: AGENTS.md");
			const agents = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();
			expect(agents).toContain(CLI_AGENT_NUDGE);
			expect(agents).not.toContain("`backlog instructions` to list available guides");
			expect(agents).not.toContain("# Instructions for the usage of Backlog.md CLI Tool");
		});

		it("maps Cursor to AGENTS.md while preserving existing instructions and user Cursor rules", async () => {
			await Bun.write(join(TEST_DIR, "AGENTS.md"), "Existing team instructions\n");
			await mkdir(join(TEST_DIR, ".cursor", "rules"), { recursive: true });
			const userRulePath = join(TEST_DIR, ".cursor", "rules", "team-owned.mdc");
			await Bun.write(userRulePath, "User-managed Cursor rule\n");

			const firstOutput = await $`${CLI_COMMAND} init CursorProj --defaults --agent-instructions cursor`
				.cwd(TEST_DIR)
				.text();
			const secondOutput = await $`${CLI_COMMAND} init CursorProj --defaults --agent-instructions cursor`
				.cwd(TEST_DIR)
				.text();

			const agents = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();
			expect(firstOutput).toContain("Agent instructions: AGENTS.md");
			expect(secondOutput).toContain("Unchanged: AGENTS.md");
			expect(agents).toContain("Existing team instructions");
			expect(agents).toContain(CLI_AGENT_NUDGE);
			expect((agents.match(/<!-- BACKLOG\.MD GUIDELINES START -->/g) || []).length).toBe(1);
			expect(await Bun.file(userRulePath).text()).toBe("User-managed Cursor rule\n");
			expect(await Bun.file(join(TEST_DIR, ".cursorrules")).exists()).toBe(false);
			expect(await Bun.file(join(TEST_DIR, ".cursor", "rules", "backlog.mdc")).exists()).toBe(false);
		});

		it("deduplicates Cursor and agents in combined instruction selections", async () => {
			const output = await $`${CLI_COMMAND} init CombinedCursor --defaults --agent-instructions cursor,claude,agents`
				.cwd(TEST_DIR)
				.text();

			expect(output).toContain("Agent instructions: AGENTS.md, CLAUDE.md");
			expect(await Bun.file(join(TEST_DIR, "AGENTS.md")).exists()).toBe(true);
			expect(await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists()).toBe(true);
			expect(await Bun.file(join(TEST_DIR, ".cursor", "rules", "backlog.mdc")).exists()).toBe(false);
		});

		// Both help assertions read the same output, so fetch `init --help` once.
		it("documents the Cursor AGENTS.md target and reserved task prefixes in init help", async () => {
			const help = await $`${CLI_COMMAND} init --help`.cwd(TEST_DIR).text();

			expect(help).toContain("cursor (writes AGENTS.md)");
			expect(help).toContain("cursor writes AGENTS.md");
			expect(help).toContain("--task-prefix");
			expect(help).toContain("draft, doc, and decision are reserved");
		});

		it("should label created and updated agent instruction files separately", async () => {
			await Bun.write(join(TEST_DIR, "AGENTS.md"), "Existing instructions\n");

			const output = await $`${CLI_COMMAND} init MixedAgentFiles --defaults --agent-instructions agents,claude`
				.cwd(TEST_DIR)
				.text();

			expect(output).toContain("Created: CLAUDE.md");
			expect(output).toContain("Updated: AGENTS.md");
			expect(output).not.toContain("Created: AGENTS.md");
			const agents = await Bun.file(join(TEST_DIR, "AGENTS.md")).text();
			const claude = await Bun.file(join(TEST_DIR, "CLAUDE.md")).text();
			expect(agents).toContain("Existing instructions");
			expect(agents).toContain(CLI_AGENT_NUDGE);
			expect(claude).toContain(CLI_AGENT_NUDGE);
		});

		it("should allow skipping AI integration via flag", async () => {
			const output = await $`${CLI_COMMAND} init SkipProj --defaults --integration-mode none`.cwd(TEST_DIR).text();

			expect(output).not.toContain("AI Integration:");
			expect(output).toContain("AI integration: skipped");
			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			const claudeFile = await Bun.file(join(TEST_DIR, "CLAUDE.md")).exists();
			expect(agentsFile).toBe(false);
			expect(claudeFile).toBe(false);
		});

		it("should support non-interactive .backlog selection via --backlog-dir", async () => {
			const output = await $`${CLI_COMMAND} init HiddenProj --defaults --integration-mode none --backlog-dir .backlog`
				.cwd(TEST_DIR)
				.text();

			expect(output).toContain("Backlog directory: .backlog");
			expect(await Bun.file(join(TEST_DIR, ".backlog", "config.yml")).exists()).toBe(true);
			expect(await Bun.file(join(TEST_DIR, "backlog", "config.yml")).exists()).toBe(false);
		});

		it("should store custom non-interactive backlog dir in root backlog.config.yml", async () => {
			const output =
				await $`${CLI_COMMAND} init CustomProj --defaults --integration-mode none --backlog-dir planning/backlog-data`
					.cwd(TEST_DIR)
					.text();

			expect(output).toContain("Backlog directory: planning/backlog-data");
			expect(output).toContain("Config location: backlog.config.yml");
			expect(await Bun.file(join(TEST_DIR, "backlog.config.yml")).exists()).toBe(true);
			const rootConfig = await Bun.file(join(TEST_DIR, "backlog.config.yml")).text();
			expect(rootConfig).toContain('backlog_directory: "planning/backlog-data"');
		});

		it("should reject invalid --backlog-dir values", async () => {
			const result =
				await $`${CLI_COMMAND} init InvalidDirProj --defaults --integration-mode none --backlog-dir ../outside`
					.cwd(TEST_DIR)
					.nothrow()
					.quiet();
			const output = result.stdout.toString() + result.stderr.toString();
			expect(result.exitCode).toBe(1);
			expect(output).toContain("Invalid --backlog-dir value");
		});

		it("should reject --backlog-dir during re-initialization", async () => {
			await $`${CLI_COMMAND} init ReinitProj --defaults --integration-mode none`.cwd(TEST_DIR).quiet();

			const result = await $`${CLI_COMMAND} init ReinitProj --defaults --integration-mode none --backlog-dir .backlog`
				.cwd(TEST_DIR)
				.nothrow()
				.quiet();
			const output = result.stdout.toString() + result.stderr.toString();
			expect(result.exitCode).toBe(1);
			expect(output).toContain("fixed after initialization");
		});

		it("should reject MCP integration when agent instruction flags are provided", async () => {
			let failed = false;
			let combinedOutput = "";
			try {
				await $`${CLI_COMMAND} init ConflictProj --defaults --integration-mode mcp --agent-instructions claude`
					.cwd(TEST_DIR)
					.text();
			} catch (err) {
				failed = true;
				const e = err as { stdout?: unknown; stderr?: unknown };
				combinedOutput = String(e.stdout ?? "") + String(e.stderr ?? "");
			}

			expect(failed).toBe(true);
			expect(combinedOutput).toContain("cannot be combined");
		});

		it("should ignore 'none' when other agent instructions are provided", async () => {
			await $`${CLI_COMMAND} init TestProj --defaults --agent-instructions agents,none`.cwd(TEST_DIR).quiet();

			const agentsFile = await Bun.file(join(TEST_DIR, "AGENTS.md")).exists();
			expect(agentsFile).toBe(true);
		});

		describe("BACKLOG_CWD", () => {
			async function createSiblingRepos(): Promise<{ pinnedDir: string; processDir: string }> {
				const pinnedDir = join(TEST_DIR, "pinned");
				const processDir = join(TEST_DIR, "process-dir");
				await mkdir(pinnedDir, { recursive: true });
				await mkdir(processDir, { recursive: true });
				return { pinnedDir, processDir };
			}

			it("initializes the pinned directory and leaves the process directory untouched", async () => {
				const { pinnedDir, processDir } = await createSiblingRepos();

				const output = await $`${CLI_COMMAND} init PinnedProj --defaults --agent-instructions agents`
					.cwd(processDir)
					.env({ ...process.env, [BACKLOG_CWD_ENV]: pinnedDir })
					.text();

				expect(output).toContain("Initialized backlog project: PinnedProj");
				expect(await Bun.file(join(pinnedDir, "backlog", "config.yml")).exists()).toBe(true);
				expect(await Bun.file(join(pinnedDir, "AGENTS.md")).exists()).toBe(true);
				expect(await Bun.file(join(processDir, "backlog", "config.yml")).exists()).toBe(false);
				expect(await Bun.file(join(processDir, "AGENTS.md")).exists()).toBe(false);
			});

			it("initializes the process directory when the override is absent", async () => {
				const { pinnedDir, processDir } = await createSiblingRepos();

				const output = await $`${CLI_COMMAND} init ProcessProj --defaults --agent-instructions agents`
					.cwd(processDir)
					.text();

				expect(output).toContain("Initialized backlog project: ProcessProj");
				expect(await Bun.file(join(processDir, "backlog", "config.yml")).exists()).toBe(true);
				expect(await Bun.file(join(processDir, "AGENTS.md")).exists()).toBe(true);
				expect(await Bun.file(join(pinnedDir, "backlog", "config.yml")).exists()).toBe(false);
			});

			it("fails without initializing anything when the override points at a missing directory", async () => {
				const { processDir } = await createSiblingRepos();
				const missingDir = join(TEST_DIR, "missing");

				const result = await $`${CLI_COMMAND} init MissingProj --defaults --integration-mode none`
					.cwd(processDir)
					.env({ ...process.env, [BACKLOG_CWD_ENV]: missingDir })
					.nothrow()
					.quiet();
				const output = result.stdout.toString() + result.stderr.toString();

				expect(result.exitCode).toBe(1);
				expect(output).toContain(`Invalid directory from ${BACKLOG_CWD_ENV}`);
				expect(await Bun.file(join(processDir, "backlog", "config.yml")).exists()).toBe(false);
			});
		});

		it("should error on invalid agent instruction value", async () => {
			let failed = false;
			try {
				await $`${CLI_COMMAND} init InvalidProj --defaults --agent-instructions notreal`.cwd(TEST_DIR).quiet();
			} catch (e) {
				failed = true;
				const err = e as { stdout?: unknown; stderr?: unknown };
				const out = String(err.stdout ?? "") + String(err.stderr ?? "");
				expect(out).toContain("Invalid agent instruction: notreal");
				expect(out).toContain("Valid options are: cursor, claude, agents, gemini, copilot, none");
			}

			expect(failed).toBe(true);
		});

		// One mixed-case word proves case folding; the other two reserved words prove the word list.
		// "Doc" and "DECISION" only repeated a case variant already covered by "DRAFT".
		for (const reservedPrefix of ["draft", "DRAFT", "doc", "decision"]) {
			it(`should reject reserved --task-prefix value ${reservedPrefix}`, async () => {
				const result = await $`${CLI_COMMAND} init ReservedPrefixProj --defaults --task-prefix ${reservedPrefix}`
					.cwd(TEST_DIR)
					.nothrow()
					.quiet();
				const output = result.stdout.toString() + result.stderr.toString();

				expect(result.exitCode).toBe(1);
				expect(output).toContain("is reserved for drafts, docs, or decisions");
				expect(await Bun.file(join(TEST_DIR, "backlog", "config.yml")).exists()).toBe(false);
			});
		}

		it("should reject a padded --task-prefix instead of persisting the padding", async () => {
			// init writes --task-prefix into task_prefix verbatim, so accepting " JIRA " produced
			// a config of task_prefix: " JIRA " and task files named ' jira -jira -1 - Title.md'.
			const result = await $`${CLI_COMMAND} init PaddedPrefixProj --defaults --task-prefix ${" JIRA "}`
				.cwd(TEST_DIR)
				.nothrow()
				.quiet();
			const output = result.stdout.toString() + result.stderr.toString();

			expect(result.exitCode).toBe(1);
			expect(output).toContain("Task prefix must contain only letters (a-z, A-Z).");
			expect(await Bun.file(join(TEST_DIR, "backlog", "config.yml")).exists()).toBe(false);
		});
	});

	describe("git integration", () => {
		beforeEach(async () => {
			// Set up a git repository
			await $`git init -b main`.cwd(TEST_DIR).quiet();
		});

		it("should create initial commit with backlog structure", async () => {
			const core = new Core(TEST_DIR);
			await initializeTestProject(core, "Git Integration Test", true);

			const lastCommit = await core.git.getLastCommitMessage();
			expect(lastCommit).toBe("backlog: Initialize backlog project: Git Integration Test");

			// Verify git status is clean after initialization
			const isClean = await core.git.isClean();
			expect(isClean).toBe(true);
		});
	});

	describe("create commands", () => {
		beforeAll(async () => {
			CREATE_FIXTURE_DIR = createUniqueTestDir("test-cli-create");
			await mkdir(CREATE_FIXTURE_DIR, { recursive: true });
			await $`git init -b main`.cwd(CREATE_FIXTURE_DIR).quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			await initializeTestProject(core, "Create Command Test", true);
		});

		afterAll(async () => {
			await safeCleanup(CREATE_FIXTURE_DIR);
		});

		it("should split comma-separated assignees on task create", async () => {
			await $`${CLI_COMMAND} task create "Comma assignee task" -a "@alice,@bob"`.cwd(CREATE_FIXTURE_DIR).quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			const task = await core.filesystem.loadTask("task-1");
			expect(task?.assignee).toEqual(["@alice", "@bob"]);
		});

		it("should collect repeated assignee flags on task create", async () => {
			await $`${CLI_COMMAND} task create "Repeated assignee task" -a @alice -a @bob,@carol`
				.cwd(CREATE_FIXTURE_DIR)
				.quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			const task = await core.filesystem.loadTask("task-2");
			expect(task?.assignee).toEqual(["@alice", "@bob", "@carol"]);
		});

		it("should split comma-separated labels on task create", async () => {
			await $`${CLI_COMMAND} task create "Comma label task" -l "ui,bug"`.cwd(CREATE_FIXTURE_DIR).quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			const task = await core.filesystem.loadTask("task-3");
			expect(task?.labels).toEqual(["ui", "bug"]);
		});

		it("should collect repeated label flags on task create", async () => {
			await $`${CLI_COMMAND} task create "Repeated label task" -l ui -l bug,api`.cwd(CREATE_FIXTURE_DIR).quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			const task = await core.filesystem.loadTask("task-4");
			expect(task?.labels).toEqual(["ui", "bug", "api"]);
		});

		it("should apply the configured defaultAssignee when task create has no -a", async () => {
			await $`${CLI_COMMAND} config set defaultAssignee ${"@alice,@bob"}`.cwd(CREATE_FIXTURE_DIR).quiet();
			await $`${CLI_COMMAND} task create "Default assignee task"`.cwd(CREATE_FIXTURE_DIR).quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			const task = await core.filesystem.loadTask("task-5");
			expect(task?.assignee).toEqual(["@alice", "@bob"]);
		});

		it("should let an explicit -a override the configured defaultAssignee on task create", async () => {
			await $`${CLI_COMMAND} task create "Explicit assignee task" -a @carol`.cwd(CREATE_FIXTURE_DIR).quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			const task = await core.filesystem.loadTask("task-6");
			expect(task?.assignee).toEqual(["@carol"]);
		});

		it("should leave a task unassigned when -a is empty while defaultAssignee is set", async () => {
			await $`${CLI_COMMAND} task create "Explicitly unassigned task" -a ""`.cwd(CREATE_FIXTURE_DIR).quiet();

			const core = new Core(CREATE_FIXTURE_DIR);
			const task = await core.filesystem.loadTask("task-7");
			expect(task?.assignee).toEqual([]);
		});

		// Dependency validation shares the working-copy corpus with every other task lookup, so a
		// dependency the CLI could never resolve afterwards is refused up front.
		it("should reject dependencies that exist only on another active branch", async () => {
			const core = new Core(CREATE_FIXTURE_DIR);

			const remoteDir = join(CREATE_FIXTURE_DIR, "remote.git");
			await $`git init --bare -b main ${remoteDir}`.quiet();
			await $`git remote add origin ${remoteDir}`.cwd(CREATE_FIXTURE_DIR).quiet();
			await $`git push -u origin main`.cwd(CREATE_FIXTURE_DIR).quiet();

			await $`git checkout -b feature`.cwd(CREATE_FIXTURE_DIR).quiet();
			await core.createTask({
				id: "task-100",
				title: "Cross-branch dependency target",
				status: "To Do",
				assignee: [],
				createdDate: "2025-06-09",
				labels: [],
				dependencies: [],
				rawContent: "Created on feature branch",
			});
			await $`git add backlog/tasks`.cwd(CREATE_FIXTURE_DIR).quiet();
			await $`git commit -m "Add cross-branch dependency fixture"`.cwd(CREATE_FIXTURE_DIR).quiet();
			await $`git push -u origin feature`.cwd(CREATE_FIXTURE_DIR).quiet();
			await $`git remote update origin --prune`.cwd(CREATE_FIXTURE_DIR).quiet();
			await $`git checkout main`.cwd(CREATE_FIXTURE_DIR).quiet();
			await core.git.fetch();

			const visibleTasks = await core.queryTasks();
			expect(visibleTasks.some((task) => task.id === "TASK-100")).toBe(true);
			expect((await core.filesystem.listTasks()).some((task) => task.id === "TASK-100")).toBe(false);

			const result = await $`${CLI_COMMAND} task create "Depends on feature task" --depends-on task-100`
				.cwd(CREATE_FIXTURE_DIR)
				.nothrow()
				.quiet();
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;

			expect(result.exitCode).toBe(1);
			expect(output).toContain("The following dependencies do not exist: task-100");
			expect(output).toContain(LOCAL_TASK_LOOKUP_HINT);
			expect(await core.filesystem.loadTask("task-8")).toBeNull();
		});
	});
});
