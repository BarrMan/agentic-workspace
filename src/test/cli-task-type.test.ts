import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agenticworkspace"];
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
async function setupTypes(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-cli-task-type");
	await mkdir(dir, { recursive: true });

	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "CLI Task Type Project");
	const config = await core.filesystem.loadConfig();
	if (!config) throw new Error("Expected test config");
	config.types = ["Bug", "Epic"];
	await core.filesystem.saveConfig(config);
	return { dir, core };
}

describe("CLI task types", () => {
	it.concurrent("creates and edits typed tasks with configured canonical casing", async () => {
		const { dir, core } = await setupTypes();
		try {
			const created = await $`${CLI_COMMAND} task create "Typed task" --type ePiC --plain`.cwd(dir).quiet();
			expect(created.exitCode).toBe(0);
			expect(created.stdout.toString()).toContain("Type: Epic");
			expect((await core.filesystem.loadTask("TASK-1"))?.type).toBe("Epic");
			const viewed = await $`${CLI_COMMAND} task view TASK-1 --plain`.cwd(dir).quiet();
			expect(viewed.stdout.toString()).toContain("Type: Epic");

			const edited = await $`${CLI_COMMAND} task edit TASK-1 --type BUG --plain`.cwd(dir).quiet();
			expect(edited.exitCode).toBe(0);
			expect(edited.stdout.toString()).toContain("Type: Bug");
			expect((await core.filesystem.loadTask("TASK-1"))?.type).toBe("Bug");

			await $`${CLI_COMMAND} task edit TASK-1 --title "Still typed"`.cwd(dir).quiet();
			expect((await core.filesystem.loadTask("TASK-1"))?.type).toBe("Bug");

			const cleared = await $`${CLI_COMMAND} task edit TASK-1 --type "" --plain`.cwd(dir).quiet();
			expect(cleared.stdout.toString()).not.toContain("Type:");
			expect((await core.filesystem.loadTask("TASK-1"))?.type).toBeUndefined();
		} finally {
			await safeCleanup(dir);
		}
	});

	it.concurrent("rejects invalid values and keeps untyped tasks untyped", async () => {
		const { dir, core } = await setupTypes();
		try {
			const invalidCreatePromise = $`${CLI_COMMAND} task create "Invalid type" --type feature`
				.cwd(dir)
				.nothrow()
				.quiet();
			const untypedPromise = $`${CLI_COMMAND} task create "Untyped task"`.cwd(dir).quiet();
			const [invalidCreate] = await Promise.all([invalidCreatePromise, untypedPromise]);
			expect(invalidCreate.exitCode).toBe(1);
			expect(invalidCreate.stderr.toString()).toContain("Invalid type: feature. Valid types are: Bug, Epic");

			const invalidEdit = await $`${CLI_COMMAND} task edit TASK-1 --type feature`.cwd(dir).nothrow().quiet();
			expect(invalidEdit.exitCode).toBe(1);
			expect(invalidEdit.stderr.toString()).toContain("Invalid type: feature. Valid types are: Bug, Epic");

			const edited = await $`${CLI_COMMAND} task edit TASK-1 --title "Still untyped" --plain`.cwd(dir).quiet();
			expect(edited.stdout.toString()).not.toContain("Type:");
			expect((await core.filesystem.loadTask("TASK-1"))?.type).toBeUndefined();
		} finally {
			await safeCleanup(dir);
		}
	});

	it.concurrent("shows type badges in plain task lists and omits them for untyped tasks", async () => {
		const { dir } = await setupTypes();
		try {
			await $`${CLI_COMMAND} task create "Typed list task" --type epic --priority high`.cwd(dir).quiet();
			await $`${CLI_COMMAND} task create "Untyped list task"`.cwd(dir).quiet();

			const [result, sortedResult] = await Promise.all([
				$`${CLI_COMMAND} task list --plain`.cwd(dir).quiet(),
				$`${CLI_COMMAND} task list --plain --sort priority`.cwd(dir).quiet(),
			]);
			const output = result.stdout.toString();
			expect(output).toContain("[HIGH] [Epic] TASK-1 - Typed list task");
			expect(output).toContain("  TASK-2 - Untyped list task");

			const sortedOutput = sortedResult.stdout.toString();
			expect(sortedOutput).toContain("[HIGH] [Epic] TASK-1 - Typed list task (To Do)");
			expect(sortedOutput).toContain("  TASK-2 - Untyped list task (To Do)");
		} finally {
			await safeCleanup(dir);
		}
	});

	it.concurrent("documents configured values and exposes them through read-only config commands", async () => {
		const { dir } = await setupTypes();
		try {
			const [getOutput, listOutput, createHelp, editHelp] = await Promise.all([
				$`${CLI_COMMAND} config get types`.cwd(dir).text(),
				$`${CLI_COMMAND} config list`.cwd(dir).text(),
				$`${CLI_COMMAND} task create --help`.cwd(dir).text(),
				$`${CLI_COMMAND} task edit --help`.cwd(dir).text(),
			]);
			expect(getOutput.trim()).toBe("Bug, Epic");
			expect(listOutput).toContain("types: [Bug, Epic]");

			for (const output of [createHelp, editHelp]) {
				expect(output).toContain("--type <type>");
				expect(output).toContain("type: one of configured task types: Bug, Epic");
			}
			expect(createHelp).toContain('agenticworkspace task create "Fix session expiry" --type "Bug"');
			expect(editHelp).toContain('agenticworkspace task edit TASK-1 --type "Bug"');
			expect(createHelp).not.toContain("--type bug");
			expect(editHelp).not.toContain("--type feature");
		} finally {
			await safeCleanup(dir);
		}
	});

	it.concurrent("completes configured task types only for task type flags", async () => {
		const { dir } = await setupTypes();
		try {
			const lines = ["agenticworkspace task create --type ", "agenticworkspace task edit TASK-1 --type "];
			const results = await Promise.all(
				lines.map((line) => $`${CLI_COMMAND} completion __complete ${line} ${String(line.length)}`.cwd(dir).quiet()),
			);
			for (const result of results) {
				expect(result.stdout.toString().trim().split("\n")).toEqual(["Bug", "Epic"]);
			}

			const searchLine = "agenticworkspace search --type ";
			const searchResult = await $`${CLI_COMMAND} completion __complete ${searchLine} ${String(searchLine.length)}`
				.cwd(dir)
				.quiet();
			expect(searchResult.stdout.toString()).not.toContain("Epic");
		} finally {
			await safeCleanup(dir);
		}
	});
});
