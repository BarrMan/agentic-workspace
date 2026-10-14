import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agentic-workspace"];
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
			const exitCode = await runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err });
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

/** Every case owns its project directory, so the cases can run concurrently in one process. */
async function setupProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-cli-task-project");
	await mkdir(dir, { recursive: true });

	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "CLI Task Project Project");
	return { dir, core };
}

async function setupConfiguredProjects(): Promise<{ dir: string; core: Core }> {
	const project = await setupProject();
	const config = await project.core.filesystem.loadConfig();
	if (!config) throw new Error("Expected test config");
	config.projects = ["Web", "API"];
	await project.core.filesystem.saveConfig(config);
	return project;
}

describe("CLI task projects", () => {
	it.concurrent("fails closed when no projects are configured", async () => {
		const { dir } = await setupProject();
		try {
			const [created, createHelp, getOutput] = await Promise.all([
				$`${CLI_COMMAND} task create "Web task" --project web`.cwd(dir).nothrow().quiet(),
				$`${CLI_COMMAND} task create --help`.cwd(dir).text(),
				$`${CLI_COMMAND} config get projects`.cwd(dir).text(),
			]);
			expect(created.exitCode).toBe(1);
			expect(created.stderr.toString()).toContain("No projects are configured. Add a 'projects:' list to");

			expect(createHelp).toContain("no projects configured; add a 'projects:' list to the project config file");

			// `config get <list key>` stays machine-readable: an unset list prints nothing, the same
			// as labels or definitionOfDone, so scripts can test it for emptiness.
			expect(getOutput.trim()).toBe("");
		} finally {
			await safeCleanup(dir);
		}
	});

	describe("with configured projects", () => {
		it.concurrent("creates and edits projected tasks with configured canonical casing", async () => {
			const { dir, core } = await setupConfiguredProjects();
			try {
				const created = await $`${CLI_COMMAND} task create "Projected task" --project aPi --plain`.cwd(dir).quiet();
				expect(created.exitCode).toBe(0);
				expect(created.stdout.toString()).toContain("Project: API");
				expect((await core.filesystem.loadTask("TASK-1"))?.project).toBe("API");
				const viewed = await $`${CLI_COMMAND} task view TASK-1 --plain`.cwd(dir).quiet();
				expect(viewed.stdout.toString()).toContain("Project: API");

				const edited = await $`${CLI_COMMAND} task edit TASK-1 --project WEB --plain`.cwd(dir).quiet();
				expect(edited.exitCode).toBe(0);
				expect(edited.stdout.toString()).toContain("Project: Web");
				expect((await core.filesystem.loadTask("TASK-1"))?.project).toBe("Web");

				await $`${CLI_COMMAND} task edit TASK-1 --title "Still projected"`.cwd(dir).quiet();
				expect((await core.filesystem.loadTask("TASK-1"))?.project).toBe("Web");

				const cleared = await $`${CLI_COMMAND} task edit TASK-1 --project "" --plain`.cwd(dir).quiet();
				expect(cleared.stdout.toString()).not.toContain("Project:");
				expect((await core.filesystem.loadTask("TASK-1"))?.project).toBeUndefined();
			} finally {
				await safeCleanup(dir);
			}
		});

		it.concurrent("rejects invalid values and keeps unprojected tasks unprojected", async () => {
			const { dir, core } = await setupConfiguredProjects();
			try {
				const invalidCreatePromise = $`${CLI_COMMAND} task create "Invalid project" --project mobile`
					.cwd(dir)
					.nothrow()
					.quiet();
				const unprojectedPromise = $`${CLI_COMMAND} task create "Unprojected task"`.cwd(dir).quiet();
				const [invalidCreate] = await Promise.all([invalidCreatePromise, unprojectedPromise]);
				expect(invalidCreate.exitCode).toBe(1);
				expect(invalidCreate.stderr.toString()).toContain("Invalid project: mobile. Valid projects are: Web, API");

				const invalidEdit = await $`${CLI_COMMAND} task edit TASK-1 --project mobile`.cwd(dir).nothrow().quiet();
				expect(invalidEdit.exitCode).toBe(1);
				expect(invalidEdit.stderr.toString()).toContain("Invalid project: mobile. Valid projects are: Web, API");

				const edited = await $`${CLI_COMMAND} task edit TASK-1 --title "Still unprojected" --plain`.cwd(dir).quiet();
				expect(edited.stdout.toString()).not.toContain("Project:");
				expect((await core.filesystem.loadTask("TASK-1"))?.project).toBeUndefined();
			} finally {
				await safeCleanup(dir);
			}
		});

		it.concurrent("documents configured values and exposes them through read-only config commands", async () => {
			const { dir } = await setupConfiguredProjects();
			try {
				const [getOutput, listOutput, createHelp, editHelp] = await Promise.all([
					$`${CLI_COMMAND} config get projects`.cwd(dir).text(),
					$`${CLI_COMMAND} config list`.cwd(dir).text(),
					$`${CLI_COMMAND} task create --help`.cwd(dir).text(),
					$`${CLI_COMMAND} task edit --help`.cwd(dir).text(),
				]);
				expect(getOutput.trim()).toBe("Web, API");
				expect(listOutput).toContain("projects: [Web, API]");

				for (const output of [createHelp, editHelp]) {
					expect(output).toContain("--project <project>");
					expect(output).toContain("project: one of configured projects: Web, API");
				}
			} finally {
				await safeCleanup(dir);
			}
		});

		it.concurrent("rejects setting projects directly through config set", async () => {
			const { dir } = await setupConfiguredProjects();
			try {
				const result = await $`${CLI_COMMAND} config set projects "Web,API"`.cwd(dir).nothrow().quiet();
				expect(result.exitCode).toBe(1);
				expect(result.stderr.toString()).toContain(
					"projects cannot be set directly. View current values with 'agentic-workspace config get projects'.",
				);
			} finally {
				await safeCleanup(dir);
			}
		});

		it.concurrent("completes configured project values for create, edit, list, and search", async () => {
			const { dir } = await setupConfiguredProjects();
			try {
				const lines = [
					"agentic-workspace task create --project ",
					"agentic-workspace task edit TASK-1 --project ",
					"agentic-workspace task list --project ",
					"agentic-workspace search --project ",
				];
				const results = await Promise.all(
					lines.map((line) => $`${CLI_COMMAND} completion __complete ${line} ${String(line.length)}`.cwd(dir).quiet()),
				);
				for (const result of results) {
					expect(result.stdout.toString().trim().split("\n")).toEqual(["Web", "API"]);
				}
			} finally {
				await safeCleanup(dir);
			}
		});
	});
});
