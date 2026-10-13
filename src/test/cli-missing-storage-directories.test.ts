import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

const cliCommand = ["agenticworkspace"];

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

describe("CLI mutations with missing storage directories", () => {
	let testDir: string;
	let core: Core;

	beforeEach(async () => {
		testDir = createUniqueTestDir("test-cli-missing-storage");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Missing Storage Project");

		// Git does not retain empty directories, including the archive parent directory.
		for (const directory of ["drafts", "decisions", "completed", "archive"]) {
			const path = join(testDir, "backlog", directory);
			await rm(path, { recursive: true });
			expect(existsSync(path)).toBe(false);
		}
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("creates a draft when its storage directory is absent", async () => {
		expect(existsSync(join(testDir, "backlog", "drafts"))).toBe(false);
		const result = await $`${cliCommand} draft create "First draft" -d "Keep this description"`
			.cwd(testDir)
			.nothrow()
			.quiet();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Created draft DRAFT-1");
		const draft = await core.filesystem.loadDraft("DRAFT-1");
		expect(draft?.title).toBe("First draft");
		expect(draft?.description).toBe("Keep this description");
	});

	it("creates a decision when its storage directory is absent", async () => {
		const result = await $`${cliCommand} decision create "First decision" -s accepted --plain`
			.cwd(testDir)
			.nothrow()
			.quiet();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Created decision decision-1");
		const decision = await core.filesystem.loadDecision("decision-1");
		expect(decision?.title).toBe("First decision");
		expect(decision?.status).toBe("accepted");
	});

	it.each([
		{ command: "archive", status: "To Do", destination: "archive/tasks" },
		{ command: "complete", status: "Done", destination: "completed" },
	])("$command creates its destination and preserves task content", async ({ command, status, destination }) => {
		const { task } = await core.createTaskFromInput({ title: "Move this task", status, description: "Keep this body" });
		const { task: dependent } = await core.createTaskFromInput({ title: "Dependent task", dependencies: [task.id] });
		if (!task.filePath) throw new Error("Expected the created task path");
		const content = await Bun.file(task.filePath).text();
		const destinationDir = join(testDir, "backlog", destination);
		expect(existsSync(destinationDir)).toBe(false);

		const result = await $`${cliCommand} task ${command} ${task.id}`.cwd(testDir).nothrow().quiet();
		expect(result.exitCode).toBe(0);
		expect(await Bun.file(task.filePath).exists()).toBe(false);
		expect(await Bun.file(join(destinationDir, task.id.toLowerCase(), "task.md")).text()).toBe(content);
		const updatedDependent = await core.filesystem.loadTask(dependent.id);
		expect(updatedDependent?.dependencies).toEqual(command === "archive" ? [] : [task.id]);
	});

	it("demotes a task when the drafts directory is absent", async () => {
		const { task } = await core.createTaskFromInput({
			title: "Move into drafts",
			status: "In Progress",
			description: "Keep this draft body",
		});
		const { task: dependent } = await core.createTaskFromInput({ title: "Dependent task", dependencies: [task.id] });
		if (!task.filePath) throw new Error("Expected the created task path");
		expect(existsSync(join(testDir, "backlog", "drafts"))).toBe(false);

		const result = await $`${cliCommand} task demote ${task.id}`.cwd(testDir).nothrow().quiet();
		expect(result.exitCode).toBe(0);
		expect(await Bun.file(task.filePath).exists()).toBe(false);
		const draft = await core.filesystem.loadDraft("DRAFT-1");
		expect(draft?.title).toBe(task.title);
		expect(draft?.description).toBe(task.description);
		expect(draft?.status).toBe("In Progress");
		expect((await core.filesystem.loadTask(dependent.id))?.dependencies).toEqual([]);
	});
});
