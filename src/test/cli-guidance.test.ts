import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { CLI_AGENT_NUDGE } from "../index.ts";
import { BACKLOG_CWD_ENV } from "../utils/runtime-cwd.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const normalizeCliOutput = (output: string) => output.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

let TEST_DIR: string;
const CLI_COMMAND = ["agenticworkspace"];

function $(parts: TemplateStringsArray, ...values: unknown[]) {
	const source = parts.reduce((text, part, index) => `${text}${part}${values[index] ?? ""}`, "");
	const args =
		source.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map((arg) => arg.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2")) ?? [];
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

	describe("root command", () => {
		it("prints the root entry when --plain is passed without a subcommand", async () => {
			const result = await $`${CLI_COMMAND} --plain`.cwd(TEST_DIR).nothrow().quiet();
			const output = result.stdout.toString() + result.stderr.toString();

			expect(result.exitCode).toBe(0);
			expect(output).toContain("AgenticWorkspace v");
			expect(output).toContain("Local instructions:");
			expect(output).toContain("agenticworkspace instructions overview");
			expect(output).not.toContain("unknown option '--plain'");
			expect(output).not.toContain("\u001B[");
			expect(output).not.toContain("\u001B]");
		});
	});

	describe("agenticworkspace instructions command", () => {
		it("prints the guide index by default", async () => {
			const output = await $`${CLI_COMMAND} instructions`.cwd(TEST_DIR).text();

			expect(output).toContain("AgenticWorkspace instructions");
			expect(output).toContain("Start here:");
			expect(output).toMatch(
				/'agenticworkspace instructions overview'\s+Required first read before answering any user request/,
			);
			expect(output).not.toMatch(/^\s+'agenticworkspace instructions'\s+List workflow guides/m);
			expect(output).toContain("task-creation");
			expect(output).toContain("task-execution");
			expect(output).toContain("task-finalization");
			expect(output).toContain("init-required");
			expect(output).toContain("How to verify, summarize, and finish work");
			expect(output).not.toContain("mark work Done");
			expect(output).not.toContain("--plain");
			expect(output).not.toContain("\u001B[");
			expect(output).not.toContain("MCP Tools Quick Reference");
			expect(output).not.toContain("task_search");
			expect(output).not.toContain("backlog://workflow/");
			expect(output).not.toContain("Always operate through MCP tools");
		});

		it("lists available instruction guides", async () => {
			const output = await $`${CLI_COMMAND} instructions --list`.cwd(TEST_DIR).text();

			expect(output).toContain("overview");
			expect(output).toContain("task-creation");
			expect(output).toContain("task-execution");
			expect(output).toContain("task-finalization");
			expect(output).toContain("init-required");
		});

		it("prints selected instruction guides", async () => {
			// Guides render the configured task prefix, so the fixture owns a project with the prefix the
			// assertions below spell out instead of inheriting whatever project sits above the test dir.
			await $`${CLI_COMMAND} init GuideProj --defaults --integration-mode none --no-git --task-prefix back`
				.cwd(TEST_DIR)
				.quiet();
			const overview = normalizeCliOutput(await $`${CLI_COMMAND} instructions overview`.cwd(TEST_DIR).text());
			const taskCreation = normalizeCliOutput(await $`${CLI_COMMAND} instructions task-creation`.cwd(TEST_DIR).text());
			const taskExecution = normalizeCliOutput(
				await $`${CLI_COMMAND} instructions task-execution`.cwd(TEST_DIR).text(),
			);
			const taskFinalization = normalizeCliOutput(
				await $`${CLI_COMMAND} instructions task-finalization`.cwd(TEST_DIR).text(),
			);
			const initRequired = normalizeCliOutput(await $`${CLI_COMMAND} instructions init-required`.cwd(TEST_DIR).text());

			expect(overview).toContain("## AgenticWorkspace Overview (CLI)");
			expect(overview).toContain("### When to Use Backlog");
			expect(overview).not.toContain("MCP Tools Quick Reference");
			expect(overview).not.toContain("backlog://workflow/");
			// The overview is served whole and stays distinct from the detailed guides.
			expect(overview).not.toContain("## Task Creation Guide");
			expect(overview).not.toContain("## Task Execution Guide");
			expect(overview).not.toContain("## Task Finalization Guide");
			expect(taskCreation).toContain("## Task Creation Guide");
			expect(taskCreation).toContain('agenticworkspace task create "Add project search"');
			expect(taskCreation).toContain(
				"- A short description that captures why the task exists: the problem, trigger, or user need behind it, plus any context a future agent cannot recover from the code. Keep it a user-friendly overview of what the task is about, not detailed working state.",
			);
			expect(taskCreation).toContain(
				'-d "Finding anything means running three separate commands, and matches in the ones you skip are missed silently. One search command covers tasks, docs, and decisions."',
			);
			expect(taskCreation).toContain(
				'Too thin: `-d "Users can search tasks, docs, and decisions from one CLI command."` states the change but not the need,\nso a future agent cannot weigh scope or alternatives.',
			);
			expect(taskCreation).toContain('agenticworkspace search "desktop app" --plain');
			expect(taskCreation).toContain(
				'agenticworkspace task list --search "desktop app" --labels frontend,bug --limit 20 --plain',
			);
			expect(taskCreation).toContain('agenticworkspace task list --status "<active status>" --plain');
			expect(taskCreation).toContain('agenticworkspace task list --exclude-status "<terminal status>" --plain');
			expect(taskCreation).toContain(
				"Repeat `--exclude-status` or pass comma-separated configured statuses to exclude multiple states.",
			);
			expect(taskCreation).toContain("omitting it applies the project's configured `defaultAssignee` when one is set");
			expect(taskCreation).not.toContain('agenticworkspace task list --status "In Progress" --plain');
			expect(taskCreation).toContain(
				"Do not pass milestone IDs such as `m-0` to `--parent`; assign a task to a milestone with `--milestone`/`-m`.",
			);
			expect(taskCreation).toContain(
				"If the user asks for changes, update tasks through `agenticworkspace task edit`.",
			);
			expect(taskCreation).toContain("Only the user marks a task Done.");
			expect(taskCreation).toContain(
				"For future work, do **not** add detailed implementation state during task creation",
			);
			expect(taskCreation).toContain(
				"The narrow exception is already-started work being created directly in a configured active status",
			);
			expect(taskExecution).toContain(
				'agenticworkspace task list --status "<active status>" --assignee @your-name --labels backend --search "auth" --limit 20 --plain',
			);
			expect(taskExecution).toContain('agenticworkspace task edit BACK-123 -s "<active status>" -a @your-name');
			expect(taskExecution).not.toContain('agenticworkspace task edit BACK-123 -s "In Progress" -a @your-name');
			expect(taskExecution).toContain(
				"Research the current system, including relevant code, tests, conventions, and recent changes",
			);
			expect(taskExecution).toContain("Put durable project artifacts in their canonical paths");
			expect(taskExecution).toContain("do not use a task field as a working log");
			expect(taskExecution).toContain("ask the user whether to add scope to the current task or create follow-up work");
			const viewIndex = taskExecution.indexOf("agenticworkspace task view BACK-123 --plain");
			const eligibilityIndex = taskExecution.indexOf("Review its current status");
			const activateIndex = taskExecution.indexOf(
				'agenticworkspace task edit BACK-123 -s "<active status>" -a @your-name',
			);
			const researchIndex = taskExecution.indexOf("Research the current system");
			const artifactsIndex = taskExecution.indexOf("Put durable project artifacts in their canonical paths");
			const implementIndex = taskExecution.indexOf("### Execution Workflow");
			expect(viewIndex).toBeGreaterThan(-1);
			expect(eligibilityIndex).toBeGreaterThan(viewIndex);
			expect(activateIndex).toBeGreaterThan(eligibilityIndex);
			expect(researchIndex).toBeGreaterThan(activateIndex);
			expect(artifactsIndex).toBeGreaterThan(researchIndex);
			expect(implementIndex).toBeGreaterThan(artifactsIndex);
			expect(taskExecution).toContain("Do not move the task to the terminal status from this guide alone.");
			expect(taskFinalization).toContain("terminal status");
			expect(taskFinalization).toContain("Check accepted statuses with `agenticworkspace task edit --help`");
			expect(taskFinalization).toContain('agenticworkspace task edit BACK-123 -s "<terminal status>"');
			expect(taskFinalization).not.toContain("agenticworkspace task edit BACK-123 -s Done");
			expect(taskFinalization).toContain(
				"Identify evidence for every requirement in the task description and durable working state.",
			);
			expect(taskFinalization).toContain("task's canonical durable working-state artifacts");
			expect(taskFinalization).toContain(
				"Do not impose plan approval or other workflow gates unless the user requests them.",
			);
			expect(taskFinalization).toContain("Hand off in the same mode as the previous ask");
			expect(taskFinalization).toContain("Only the user moves a task to `Done`.");
			expect(taskFinalization).toContain(
				"For UI or interactive work, exercise the behavior through a browser, DOM script, test runner, or documented manual interaction.",
			);
			expect(taskFinalization).toContain(
				"Code presence, grep output, and implementation intent are not verification evidence.",
			);
			expect(taskCreation).not.toContain("task_create");
			expect(taskCreation).not.toContain("task_search");
			expect(taskCreation).toContain("### Shell Quoting for Literal Backticks");
			expect(taskCreation).toContain("agenticworkspace task create 'Document `agenticworkspace init` setup'");
			expect(taskCreation).toContain(
				"AgenticWorkspace cannot recover the original text after the shell has already executed it",
			);
			expect(initRequired).toContain("This directory does not have AgenticWorkspace initialized.");
			expect(initRequired).toContain("agenticworkspace init --defaults");

			// Completion is described as periodic cleanup in both the overview and the finalization
			// guide, so assert it against the guides already fetched above instead of re-spawning them.
			for (const guide of [overview, taskFinalization]) {
				expect(guide).toContain("periodic cleanup");
				expect(guide).toContain("agenticworkspace task complete");
				expect(guide).toContain("record and dependency links");
				expect(guide).toContain("canceled, duplicate, or invalid work");
				expect(guide).toContain("incoming dependencies and task references");
			}
			expect(CLI_AGENT_NUDGE).not.toContain("task complete");
		}, 15_000);

		it("renders task ID examples with the configured task prefix", async () => {
			await mkdir(join(TEST_DIR, "backlog"), { recursive: true });
			await Bun.write(
				join(TEST_DIR, "backlog", "config.yml"),
				[
					'project_name: "Prefix Project"',
					'statuses: ["To Do", "In Progress", "Done"]',
					"labels: []",
					"date_format: yyyy-mm-dd",
					'task_prefix: "feat"',
					"",
				].join("\n"),
			);

			const overview = await $`${CLI_COMMAND} instructions overview`.cwd(TEST_DIR).text();
			const taskCreation = await $`${CLI_COMMAND} instructions task-creation`.cwd(TEST_DIR).text();
			const createHelp = await $`${CLI_COMMAND} task create --help`.cwd(TEST_DIR).text();
			const listHelp = await $`${CLI_COMMAND} task list --help`.cwd(TEST_DIR).text();
			const editHelp = await $`${CLI_COMMAND} task edit --help`.cwd(TEST_DIR).text();

			expect(overview).toContain("agenticworkspace task view FEAT-123 --plain");
			expect(taskCreation).toContain('agenticworkspace task create -p FEAT-10 "Set up shell"');
			expect(taskCreation).toContain('agenticworkspace task create "Add bulk update UI" --dep FEAT-21');
			expect(createHelp).toContain('agenticworkspace task create -p FEAT-1 "Add tests"');
			expect(createHelp).toContain("specify existing parent task ID, not a");
			expect(createHelp).toContain("milestone ID");
			expect(listHelp).toContain("-p, --parent <taskId>");
			expect(editHelp).toContain('agenticworkspace task edit FEAT-1 --status "<active status>" -a @sara');
			for (const output of [overview, taskCreation, createHelp, listHelp, editHelp]) {
				expect(output).not.toContain("BACK-");
			}
		}, 15_000);

		it("renders help and instruction examples from BACKLOG_CWD", async () => {
			await mkdir(join(TEST_DIR, "backlog"), { recursive: true });
			await Bun.write(
				join(TEST_DIR, "backlog", "config.yml"),
				[
					'project_name: "Runtime Cwd Schema Project"',
					'statuses: ["Ready", "Review", "Closed"]',
					"labels: []",
					"date_format: yyyy-mm-dd",
					'task_prefix: "feat"',
					"",
				].join("\n"),
			);
			const outsideDir = join(TEST_DIR, "outside");
			await mkdir(outsideDir, { recursive: true });
			const env = { ...process.env, [BACKLOG_CWD_ENV]: TEST_DIR };

			const overview = await $`${CLI_COMMAND} instructions overview`.cwd(outsideDir).env(env).text();
			const createHelp = await $`${CLI_COMMAND} task create --help`.cwd(outsideDir).env(env).text();
			const editHelp = await $`${CLI_COMMAND} task edit --help`.cwd(outsideDir).env(env).text();

			expect(overview).toContain("agenticworkspace task view FEAT-123 --plain");
			expect(createHelp).toContain("status: one of configured statuses: Draft, Ready, Review, Closed");
			expect(createHelp).toContain('agenticworkspace task create -p FEAT-1 "Add tests"');
			expect(editHelp).toContain("status: one of configured statuses: Ready, Review, Closed");
			expect(editHelp).toContain('agenticworkspace task edit FEAT-1 --status "<active status>" -a @sara');
			for (const output of [overview, createHelp, editHelp]) {
				expect(output).not.toContain("BACK-");
			}
		}, 10_000);

		it("rejects unknown instruction guides with valid options", async () => {
			const result = await $`${CLI_COMMAND} instructions does-not-exist`.cwd(TEST_DIR).nothrow().quiet();
			const output = result.stdout.toString() + result.stderr.toString();

			expect(result.exitCode).toBe(1);
			expect(output).toContain("Unknown instruction guide: does-not-exist");
			expect(output).toContain("Valid guides:");
			expect(output).toContain("agenticworkspace instructions");
		});
	});

	describe("command help input schemas", () => {
		it("shows input schema details for init and instructions", async () => {
			const initHelp = await $`${CLI_COMMAND} init --help`.cwd(TEST_DIR).text();
			const instructionsHelp = await $`${CLI_COMMAND} instructions --help`.cwd(TEST_DIR).text();

			expect(initHelp).toContain("Input schema:");
			expect(initHelp).toContain("projectName: String");
			expect(initHelp).toContain("--integration-mode: one of: cli, mcp, none");
			expect(initHelp).toContain("(default: cli)");
			expect(initHelp).toContain("CLI instructions are recommended");
			expect(initHelp).toContain('agenticworkspace init "My Project" --defaults --integration-mode cli');
			expect(initHelp).not.toContain("agenticworkspace init --integration-mode mcp");
			expect(initHelp).toContain("Writes:");
			expect(instructionsHelp).toContain(
				"guide: one of: overview, task-creation, task-execution, task-finalization, init-required",
			);
			expect(instructionsHelp).toContain("Output:");
		});

		it("shows task command field types and multiline Markdown notes in help", async () => {
			const createHelp = await $`${CLI_COMMAND} task create --help`.cwd(TEST_DIR).text();
			const listHelp = await $`${CLI_COMMAND} task list --help`.cwd(TEST_DIR).text();
			const editHelp = await $`${CLI_COMMAND} task edit --help`.cwd(TEST_DIR).text();
			const createHelpCompact = createHelp.replace(/\s+/g, " ");
			const editHelpCompact = editHelp.replace(/\s+/g, " ");
			const completeHelp = await $`${CLI_COMMAND} task complete --help`.cwd(TEST_DIR).text();
			const docHelp = await $`${CLI_COMMAND} doc update --help`.cwd(TEST_DIR).text();
			const docCreateHelp = await $`${CLI_COMMAND} doc create --help`.cwd(TEST_DIR).text();
			const milestoneHelp = await $`${CLI_COMMAND} milestone add --help`.cwd(TEST_DIR).text();
			const draftHelp = (await $`${CLI_COMMAND} draft create --help`.cwd(TEST_DIR).text()).replace(/\s+/g, " ");

			expect(createHelp).toContain("title: String");
			expect(createHelp).toContain("description: Markdown");
			expect(createHelp).toContain("status: one of configured statuses: Draft, To Do, In Progress, Done");
			expect(createHelp).toContain("priority: one of configured priorities: High, Medium, Low");
			expect(createHelp).toContain("ordinal: Integer");
			expect(createHelpCompact).toContain(
				"assignee: Comma-separated strings - Assign one or more @names; repeat -a or use @name1,@name2; omitting it applies the configured defaultAssignee",
			);
			expect(createHelpCompact).toContain(
				'assign task to one or more @names (comma-separated or repeatable); pass "" to leave it unassigned',
			);
			expect(editHelpCompact).toContain(
				'replace all task assignees with one or more @names (comma-separated or repeatable); pass "" to clear them',
			);
			expect(createHelpCompact).not.toContain("agent-summary");
			expect(createHelp).not.toContain("agent-summary");
			expect(listHelp).toContain("status: one or more of configured statuses: To Do, In Progress, Done");
			expect(listHelp).not.toContain("status: one of configured statuses: Draft, To Do, In Progress, Done");
			expect(listHelp).toContain("priority: one of configured priorities: High, Medium, Low");
			expect(listHelp).toContain("labels: Comma-separated strings");
			expect(listHelp).toContain("search: String");
			expect(listHelp).toContain("limit: Positive integer");
			expect(listHelp).toContain("sort: one of: priority, id, ordinal, newest");
			expect(listHelp).toContain("-l, --labels <labels>");
			expect(listHelp).toContain("--search <query>");
			expect(listHelp).toContain("--plain");
			expect(editHelp).toContain("taskIds: Task IDs");
			expect(editHelp).toContain("status: one of configured statuses: To Do, In Progress, Done");
			expect(editHelp).not.toContain("status: one of configured statuses: Draft, To Do, In Progress, Done");
			expect(editHelp).toContain(
				"assignee: Comma-separated strings - Replace all assignees; repeat -a or use @name1,@name2",
			);
			expect(editHelpCompact).toContain(
				"replace all task assignees with one or more @names (comma-separated or repeatable)",
			);
			expect(editHelp).toContain(
				"label: Comma-separated strings - Replace all labels; repeat --label or use label1,label2",
			);
			expect(editHelp).toContain(
				"add-label: Comma-separated strings - Add labels; repeat --add-label or use label1,label2",
			);
			expect(editHelp).toContain(
				"remove-label: Comma-separated strings - Remove labels; repeat --remove-label or use label1,label2",
			);
			expect(editHelp).toContain("clear-labels: Boolean - Remove all labels; cannot combine with other label flags");
			expect(editHelpCompact).toContain("replace all task labels");
			expect(editHelpCompact).toContain("add task labels without replacing existing labels");
			expect(editHelpCompact).toContain("remove task labels without replacing others");
			expect(editHelpCompact).toContain("remove all task labels");
			expect(editHelp).not.toContain("agent-summary");
			expect(editHelp).toContain("Writes:");
			expect(completeHelp).toContain("During periodic cleanup");
			expect(completeHelp).toContain("off the board to completed storage");
			expect(completeHelp).toContain("preserving its record and dependency links");
			expect(completeHelp).not.toContain("cleanup/archive");

			// Every multiline-Markdown note is asserted against the same help outputs fetched above;
			// this is one real fetch per command, not one per assertion group.
			for (const help of [createHelp, editHelp]) {
				expect(help).toContain("Markdown fields:");
				expect(help).toContain("Multi-line values need real newlines; a literal \\n is stored as text");
				expect(help).toContain("Example (bash/zsh): --description $'First line\\nSecond line'");
			}
			for (const field of ["description"]) {
				expect(createHelp).toContain(`${field}: Markdown`);
			}
			for (const field of ["description"]) {
				expect(editHelp).toContain(`${field}: Markdown`);
			}

			// The shared note replaces the per-option copy instead of repeating it.
			expect(createHelp).not.toContain("multi-line: include real newlines");
			expect(editHelp).not.toContain("multi-line: include real newlines");
			// draft create has no input schema, so its option string keeps the note.
			expect(draftHelp).toContain("task description (multi-line: include real newlines inside the quoted string)");

			// The example always names a flag the command actually accepts.
			expect(docHelp).toContain("Example (bash/zsh): --content $'First line\\nSecond line'");
			expect(milestoneHelp).toContain("Markdown fields:");
			expect(milestoneHelp).toContain("Example (bash/zsh): --description $'First line\\nSecond line'");
			// Commands without Markdown fields stay unchanged.
			expect(listHelp).not.toContain("Markdown fields:");
			expect(docCreateHelp).not.toContain("Markdown fields:");
		}, 15_000);

		it("shows configured status values in task help", async () => {
			await mkdir(join(TEST_DIR, "backlog"), { recursive: true });
			await Bun.write(
				join(TEST_DIR, "backlog", "config.yml"),
				[
					'project_name: "Schema Project"',
					'statuses: ["Ready", "Review", "Closed"]',
					"labels: []",
					"date_format: yyyy-mm-dd",
					"",
				].join("\n"),
			);

			const createHelp = await $`${CLI_COMMAND} task create --help`.cwd(TEST_DIR).text();
			const listHelp = await $`${CLI_COMMAND} task list --help`.cwd(TEST_DIR).text();
			const searchHelp = await $`${CLI_COMMAND} search --help`.cwd(TEST_DIR).text();
			const editHelp = await $`${CLI_COMMAND} task edit --help`.cwd(TEST_DIR).text();

			expect(createHelp).toContain("status: one of configured statuses: Draft, Ready, Review, Closed");
			expect(listHelp).toContain("status: one or more of configured statuses: Ready, Review, Closed");
			expect(searchHelp).toContain("status: one or more of configured statuses: Ready, Review, Closed");
			expect(editHelp).toContain("status: one of configured statuses: Ready, Review, Closed");
			for (const output of [listHelp, searchHelp, editHelp]) {
				expect(output).not.toContain("status: one of configured statuses: Draft, Ready, Review, Closed");
			}
		});

		it("shows document, config, search, and cleanup schemas in help", async () => {
			const docHelp = await $`${CLI_COMMAND} doc update --help`.cwd(TEST_DIR).text();
			const configHelp = await $`${CLI_COMMAND} config set --help`.cwd(TEST_DIR).text();
			const searchHelp = await $`${CLI_COMMAND} search --help`.cwd(TEST_DIR).text();
			const cleanupHelp = await $`${CLI_COMMAND} cleanup --help`.cwd(TEST_DIR).text();

			expect(docHelp).toContain("content: Markdown");
			expect(docHelp).toContain("path: Docs-relative path");
			expect(docHelp).toContain("type: one of: readme, guide, specification, other");
			expect(configHelp).toContain("key: one of: defaultEditor, projectName, defaultAssignee, defaultStatus");
			expect(configHelp).toContain("value: String");
			expect(searchHelp).toContain("type: one or more of: task, document, decision");
			expect(searchHelp).toContain("status: one or more of configured statuses: To Do, In Progress, Done");
			expect(searchHelp).not.toContain("status: one of configured statuses: Draft, To Do, In Progress, Done");
			expect(searchHelp).toContain("priority: one of configured priorities: High, Medium, Low");
			expect(searchHelp).toContain("modified-file: Project-root-relative path");
			expect(cleanupHelp).toContain("Writes:");
		});
	});

	describe("self-correcting CLI errors", () => {
		it("suggests likely commands and options", async () => {
			const unknownCommand = await $`${CLI_COMMAND} tesk list`.cwd(TEST_DIR).nothrow().quiet();
			const unknownOption = await $`${CLI_COMMAND} task list --statuz To Do`.cwd(TEST_DIR).nothrow().quiet();
			const commandOutput = unknownCommand.stdout.toString() + unknownCommand.stderr.toString();
			const optionOutput = unknownOption.stdout.toString() + unknownOption.stderr.toString();

			expect(unknownCommand.exitCode).not.toBe(0);
			expect(commandOutput).toContain("unknown command 'tesk'");
			expect(commandOutput).toContain("Did you mean task?");
			expect(commandOutput).toContain("Run with --help");
			expect(unknownOption.exitCode).not.toBe(0);
			expect(optionOutput).toContain("unknown option '--statuz'");
			expect(optionOutput).toContain("Did you mean --status?");
			expect(optionOutput).toContain("Run with --help");
		});

		it("points missing required arguments to help", async () => {
			const result = await $`${CLI_COMMAND} task view`.cwd(TEST_DIR).nothrow().quiet();
			const output = result.stdout.toString() + result.stderr.toString();

			expect(result.exitCode).not.toBe(0);
			expect(output).toContain("missing required argument 'taskId'");
			expect(output).toContain("Run with --help");
		});

		it("keeps validation errors concise and actionable", async () => {
			await $`${CLI_COMMAND} init ErrorProj --defaults --integration-mode none --no-git`.cwd(TEST_DIR).quiet();

			const priority = await $`${CLI_COMMAND} task list --priority urgent`.cwd(TEST_DIR).nothrow().quiet();
			const docPath = await $`${CLI_COMMAND} doc create "Unsafe" -p ../outside`.cwd(TEST_DIR).nothrow().quiet();
			const priorityOutput = priority.stdout.toString() + priority.stderr.toString();
			const docPathOutput = docPath.stdout.toString() + docPath.stderr.toString();

			expect(priority.exitCode).not.toBe(0);
			expect(priorityOutput).toContain("Invalid priority: urgent. Valid values are: High, Medium, Low");
			expect(priorityOutput).not.toContain("Error:");
			expect(docPath.exitCode).not.toBe(0);
			expect(docPathOutput).toContain("Document path cannot include traversal segments.");
			expect(docPathOutput).not.toContain("Error:");
		});
	});
});
