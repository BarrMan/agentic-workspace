import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { runCli } from "../cli/register.ts";
import { Core } from "../controller/agentic-workspace.ts";
import { parseTask } from "../storage/markdown/parser.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

async function cli(args: string[], cwd: string) {
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

const malformedDependencies = [
	["mapping entry", "dependencies:\n  - id: TASK-1\n    anchor: tenancy"],
	["nested list", "dependencies:\n  - [TASK-1, TASK-3]"],
	["mapping field", "dependencies: { id: TASK-1 }"],
] as const;

function taskMarkdown(dependencies: string, id = "TASK-2"): string {
	return `---
task_schema_version: 3
id: ${id}
title: dependent
status: To Do
assignee: []
created_date: '2026-09-27'
labels: []
${dependencies}
---

Keep this body, including its trailing newline.
`;
}

describe("task dependency structure", () => {
	it.each(malformedDependencies)("rejects a %s on every parse", (_label, dependencies) => {
		const content = taskMarkdown(dependencies);
		for (let attempt = 0; attempt < 2; attempt++) {
			expect(() => parseTask(content)).toThrow("Invalid dependencies in task TASK-2");
		}
	});

	it("identifies the malformed entry after valid task IDs", () => {
		expect(() => parseTask(taskMarkdown("dependencies: [TASK-1, { id: TASK-3 }]"))).toThrow("entry 2");
	});

	it("preserves existing scalar coercion and absent-field defaults", () => {
		expect(parseTask(taskMarkdown("dependencies: [task-001, BACK-2.3, 4, true, null]")).dependencies).toEqual([
			"task-001",
			"BACK-2.3",
			"4",
			"true",
			"null",
		]);
		for (const field of ["", "dependencies: []", "dependencies: null", "dependencies: true", "dependencies: 4"]) {
			expect(parseTask(taskMarkdown(field)).dependencies).toEqual([]);
		}
	});
});

describe("malformed dependencies cannot be rewritten by unrelated edits", () => {
	let testDir: string;
	let core: Core;
	let taskPath: string;

	beforeEach(async () => {
		testDir = createUniqueTestDir("test-malformed-dependencies");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Malformed dependencies");
		taskPath = join(coreFileSystem(core).tasksDir, "task-2", "task.md");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it.each(malformedDependencies)("CLI rejects a %s without changing source bytes", async (_label, dependencies) => {
		const original = taskMarkdown(dependencies);
		await Bun.write(taskPath, original);
		const filenames = await readdir(coreFileSystem(core).tasksDir);

		const edited = await cli(["task", "edit", "TASK-2", "--title", "dependent v2"], testDir);

		expect(edited.exitCode).toBe(1);
		expect(edited.stderr.toString()).toContain("Invalid dependencies in task TASK-2");
		expect(edited.stderr.toString()).not.toContain("not found");
		expect(edited.stdout.toString()).not.toContain("Updated task");
		expect(await Bun.file(taskPath).text()).toBe(original);
		expect(await readdir(coreFileSystem(core).tasksDir)).toEqual(filenames);
	});

	it.each([
		false,
		true,
	])("shared mutation rejects malformed source with cross-branch reads=%s", async (includeCrossBranch) => {
		await Bun.write(taskPath, taskMarkdown("dependencies: [TASK-1]"));
		expect((await core.getTask("TASK-2"))?.title).toBe("dependent");
		const original = taskMarkdown(malformedDependencies[0][1]);
		await Bun.write(taskPath, original);

		await expect(core.updateTaskFromInput("TASK-2", { title: "dependent v2" }, { includeCrossBranch })).rejects.toThrow(
			"Invalid dependencies in task TASK-2",
		);
		expect(await Bun.file(taskPath).text()).toBe(original);
	});

	it("refuses to save a stale task after the source becomes malformed", async () => {
		await Bun.write(taskPath, taskMarkdown("dependencies: [TASK-1]"));
		const stale = await core.getTask("TASK-2");
		expect(stale).not.toBeNull();
		if (!stale) throw new Error("Expected the initial task");
		const original = taskMarkdown(malformedDependencies[1][1]);
		await Bun.write(taskPath, original);

		await expect(core.updateTask({ ...stale, title: "dependent v2" })).rejects.toThrow(
			"Invalid dependencies in task TASK-2",
		);
		expect(await Bun.file(taskPath).text()).toBe(original);
	});

	it("skips malformed corpus records while explicit loads and their mutations stay strict", async () => {
		const original = taskMarkdown(malformedDependencies[0][1]);
		await Bun.write(taskPath, original);
		await Bun.write(
			join(coreFileSystem(core).tasksDir, "task-1", "task.md"),
			taskMarkdown("dependencies: []", "TASK-1"),
		);

		expect((await coreFileSystem(core).listTasks()).map((task) => task.id)).toEqual(["TASK-1"]);
		await expect(coreFileSystem(core).loadTask("TASK-2")).rejects.toThrow("Invalid dependencies in task TASK-2");
		await expect(core.loadTaskById("TASK-2", { includeCrossBranch: false })).rejects.toThrow(
			"Invalid dependencies in task TASK-2",
		);
		await expect(core.getTask("TASK-2")).rejects.toThrow("Invalid dependencies in task TASK-2");
		await core.updateTaskFromInput("TASK-1", { title: "Healthy edit" }, { includeCrossBranch: false });
		expect((await coreFileSystem(core).loadTask("TASK-1"))?.title).toBe("Healthy edit");
		expect(await Bun.file(taskPath).text()).toBe(original);
	});

	it("allows unrelated CLI edits without changing valid dependency values", async () => {
		await Bun.write(taskPath, taskMarkdown("dependencies: [task-001, BACK-2.3, 4]"));
		const edited = await cli(["task", "edit", "TASK-2", "--title", "dependent v2"], testDir);

		expect(edited.exitCode).toBe(0);
		expect(edited.stdout.toString()).toContain("Updated task TASK-2");
		const task = await coreFileSystem(core).loadTask("TASK-2");
		expect(task?.title).toBe("dependent v2");
		expect(task?.dependencies).toEqual(["task-001", "BACK-2.3", "4"]);
	});
});
