import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../index.ts";
import { serializeTask } from "../markdown/serializer.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const CLI_COMMAND = ["agenticworkspace"];
let runQueue = Promise.resolve();

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
		const invocation = runQueue.then(() =>
			runCli(args.slice(CLI_COMMAND.length), { cwd: config.cwd, stdout: out, stderr: err }),
		);
		runQueue = invocation.then(
			() => undefined,
			() => undefined,
		);
		const exitCode = await invocation;
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

async function createTask(core: Core, id: string, title: string) {
	await core.createTask({
		id,
		title,
		status: "To Do",
		assignee: [],
		createdDate: "2025-06-08",
		labels: [],
		dependencies: [],
		rawContent: title,
	});
}

// The real CLI is expensive to start and gets slower when many copies run at once (the runner
// already fans out files), so in-file parallelism stays capped. Each case still owns its directory.
const CONCURRENCY = 4;
let activeCases = 0;
const waitingCases: Array<() => void> = [];

function concurrentTest(name: string, body: () => Promise<void>): void {
	it.concurrent(name, async () => {
		if (activeCases >= CONCURRENCY) await new Promise<void>((resolve) => waitingCases.push(resolve));
		activeCases += 1;
		try {
			await body();
		} finally {
			activeCases -= 1;
			waitingCases.shift()?.();
		}
	});
}

/** Every case owns its project directory, so the cases can run concurrently in one process. */
async function setupBatch(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-batch-edit");
	await mkdir(dir, { recursive: true });
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Batch Edit Project");
	await createTask(core, "task-1", "First");
	await createTask(core, "task-2", "Second");
	await createTask(core, "task-3", "Third");
	return { dir, core };
}

describe("task edit with several task IDs", () => {
	concurrentTest("moves every listed task to the target status", async () => {
		const { dir, core } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 task-2 task-3 -s "In Progress"`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).toBe(0);

			for (const id of ["task-1", "task-2", "task-3"]) {
				const task = await core.filesystem.loadTask(id);
				expect(task?.status).toBe("In Progress");
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("moves the tasks that succeed and names the ones that fail", async () => {
		const { dir, core } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 task-999 task-3 -s "In Progress"`
				.cwd(dir)
				.nothrow()
				.quiet();

			expect(result.exitCode).not.toBe(0);
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;
			expect(output).toContain("task-999");

			expect((await core.filesystem.loadTask("task-1"))?.status).toBe("In Progress");
			expect((await core.filesystem.loadTask("task-3"))?.status).toBe("In Progress");
			expect((await core.filesystem.loadTask("task-2"))?.status).toBe("To Do");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("rejects a per-task flag when the user passes more than one ID", async () => {
		const { dir, core } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 task-2 -t "New title"`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).not.toBe(0);
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;
			expect(output).toContain("--title");

			expect((await core.filesystem.loadTask("task-1"))?.title).toBe("First");
			expect((await core.filesystem.loadTask("task-2"))?.title).toBe("Second");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("keeps the shared flags available for a batch", async () => {
		const { dir, core } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 task-2 --priority high --add-label triage`
				.cwd(dir)
				.nothrow()
				.quiet();

			expect(result.exitCode).toBe(0);

			for (const id of ["task-1", "task-2"]) {
				const task = await core.filesystem.loadTask(id);
				expect(task?.priority).toBe("high");
				expect(task?.labels).toContain("triage");
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("prints one outcome line per task with --plain", async () => {
		const { dir } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 task-2 -s Done --plain`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).toBe(0);
			const lines = result.stdout
				.toString()
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0);
			expect(lines).toHaveLength(2);
			expect(lines[0]).toContain("TASK-1");
			expect(lines[1]).toContain("TASK-2");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("keeps the single-ID output unchanged", async () => {
		const { dir } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 -s Done`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).toBe(0);
			expect(result.stdout.toString()).toContain("Updated task TASK-1");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("refuses several IDs with no field flag instead of editing only the first", async () => {
		const { dir, core } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 task-2 task-3`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).not.toBe(0);
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;
			expect(output).toContain("Cannot edit 3 tasks without any field flag");
			expect(output).toContain("--status");

			// The wizard would have edited task-1 alone and dropped the rest; nothing may change here.
			for (const id of ["task-1", "task-2", "task-3"]) {
				expect((await core.filesystem.loadTask(id))?.status).toBe("To Do");
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("treats --plain alone as an output choice, not a change to apply to the batch", async () => {
		const { dir } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 task-2 --plain`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).not.toBe(0);
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;
			expect(output).toContain("Cannot edit 2 tasks without any field flag");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("edits exact IDs when one has a padded sibling", async () => {
		const { dir, core } = await setupBatch();
		try {
			// The padded sibling is a separate identity and must not make TASK-1 ambiguous.
			const duplicatePath = join(core.filesystem.tasksDir, "task-01", "task.md");
			await mkdir(join(core.filesystem.tasksDir, "task-01"), { recursive: true });
			await Bun.write(
				duplicatePath,
				serializeTask({
					id: "TASK-01",
					title: "Padded duplicate",
					status: "To Do",
					assignee: [],
					createdDate: "2025-06-08",
					labels: [],
					dependencies: [],
					rawContent: "Padded duplicate",
				}),
			);

			const result = await $`${CLI_COMMAND} task edit task-1 task-2 -s Done`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).toBe(0);
			expect((await core.filesystem.loadTask("task-1"))?.status).toBe("Done");
			expect((await core.filesystem.loadTask("task-2"))?.status).toBe("Done");
			expect((await core.filesystem.loadTask("TASK-01"))?.title).toBe("Padded duplicate");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("counts a repeated ID once", async () => {
		const { dir, core } = await setupBatch();
		try {
			const result = await $`${CLI_COMMAND} task edit task-1 TASK-1 -s Done`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).toBe(0);
			const lines = result.stdout
				.toString()
				.split("\n")
				.filter((line) => line.includes("Updated task"));
			expect(lines).toHaveLength(1);
			expect((await core.filesystem.loadTask("task-1"))?.status).toBe("Done");
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("rejects removed agent summary flags without persisting summary data", async () => {
		const { dir, core } = await setupBatch();
		try {
			const summaryFlags = ["--agent-summary", "--append-agent-summary", "--clear-agent-summary"];
			const results = await Promise.all(
				summaryFlags.map((flag) =>
					$`${CLI_COMMAND} task edit task-1 ${flag} "Same summary"`.cwd(dir).nothrow().quiet(),
				),
			);

			for (const result of results) {
				expect(result.exitCode).not.toBe(0);
			}

			for (const id of ["task-1", "task-2"]) {
				const task = await core.filesystem.loadTask(id);
				expect(task).not.toHaveProperty("agentSummary");
				expect(task?.rawContent).not.toContain("Same summary");
			}
		} finally {
			await safeCleanup(dir);
		}
	});

	concurrentTest("keeps a bare number and an explicitly prefixed ID distinct", async () => {
		const { dir, core } = await setupBatch();
		try {
			// A bare "1" means TASK-1, so it must not swallow JIRA-1 (or the other way round): the
			// prefixed ID stays in the batch and reports its own failure.
			const result = await $`${CLI_COMMAND} task edit 1 JIRA-1 -s Done`.cwd(dir).nothrow().quiet();

			expect(result.exitCode).not.toBe(0);
			const output = `${result.stdout.toString()}${result.stderr.toString()}`;
			expect(output).toContain("JIRA-1");
			expect((await core.filesystem.loadTask("task-1"))?.status).toBe("Done");
		} finally {
			await safeCleanup(dir);
		}
	});
});
