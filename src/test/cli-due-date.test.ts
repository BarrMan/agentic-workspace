import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/agentic-workspace.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

async function runCommand(args: string[], cwd: string) {
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
	const exitCode = await runCli(args, { cwd, stdout: out, stderr: err });
	return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
}

async function setupDueDateProject(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("cli-due-date");
	await mkdir(dir, { recursive: true });
	const core = new Core(dir);
	await initializeTestProject(core, "CLI due dates");
	return { dir, core };
}

describe("CLI due dates", () => {
	it("creates, lists, edits, and clears task due dates", async () => {
		const { dir } = await setupDueDateProject();
		try {
			const created = (await runCommand(["task", "create", "Ship release", "--due-date", "2026-08-10", "--plain"], dir))
				.stdout;
			// A due date names a day, so it is shown as written with no time and no (UTC) marker.
			expect(created).toContain("Due: 2026-08-10");
			expect(created).not.toContain("Due: 2026-08-10 ");

			const listed = (await runCommand(["task", "list", "--plain"], dir)).stdout;
			expect(listed).toContain("due 2026-08-10)");

			const edited = (await runCommand(["task", "edit", "1", "--due-date", "2026-08-12", "--plain"], dir)).stdout;
			expect(edited).toContain("Due: 2026-08-12");

			await runCommand(["task", "edit", "1", "--clear-due-date"], dir);
			const task = await new Core(dir).filesystem.loadTask("task-1");
			expect(task?.dueDate).toBeUndefined();
		} finally {
			await safeCleanup(dir);
		}
	});

	it("rejects invalid and conflicting task due date flags", async () => {
		const { dir } = await setupDueDateProject();
		try {
			const invalid = await runCommand(["task", "create", "Invalid due", "--due-date", "10/08/2026"], dir);
			expect(invalid.exitCode).toBe(1);
			expect(invalid.stderr).toContain("YYYY-MM-DD");
			await runCommand(["task", "create", "Valid task"], dir);

			const conflict = await runCommand(["task", "edit", "1", "--due-date", "2026-08-10", "--clear-due-date"], dir);
			expect(conflict.exitCode).toBe(1);
			expect(conflict.stderr).toContain("Cannot use --due-date and --clear-due-date together");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("supports milestone due dates through add and rename", async () => {
		const { dir } = await setupDueDateProject();
		try {
			const added = (await runCommand(["milestone", "add", "Release", "--due-date", "2026-09-01"], dir)).stdout;
			expect(added).toContain("Due: 2026-09-01");

			await runCommand(["milestone", "rename", "Release", "Release", "--due-date", "2026-09-02"], dir);
			let milestone = await new Core(dir).filesystem.loadMilestone("m-0");
			expect(milestone?.dueDate).toBe("2026-09-02");

			await runCommand(["milestone", "rename", "Release", "Release", "--clear-due-date"], dir);
			milestone = await new Core(dir).filesystem.loadMilestone("m-0");
			expect(milestone?.dueDate).toBeUndefined();
		} finally {
			await safeCleanup(dir);
		}
	});
});
