import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ as shell } from "bun";
import { Core } from "../index.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

let testDir: string;
let configHome: string;
const previousConfigHome = process.env.XDG_CONFIG_HOME;

describe("CLI task view and edit", () => {
	beforeEach(async () => {
		testDir = createUniqueTestDir("cli-task-view-edit");
		configHome = await mkdtemp(`${tmpdir()}/cli-task-view-config-`);
		process.env.XDG_CONFIG_HOME = configHome;
		await mkdir(testDir, { recursive: true });
		await shell`git init -b main`.cwd(testDir).quiet();
		await initializeTestProject(new Core(testDir), "CLI task view");
	});
	afterEach(async () => {
		await safeCleanup(testDir);
		await rm(configHome, { recursive: true, force: true });
		if (previousConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
		else process.env.XDG_CONFIG_HOME = previousConfigHome;
	});

	it("edits only title and description without interpreting an opaque body", async () => {
		const core = new Core(testDir);
		await core.createTask({
			id: "task-1",
			title: "Original",
			status: "To Do",
			createdDate: "2026-09-30",
			labels: [],
			dependencies: [],
			rawContent: "## Description\n\nBody text",
		});
		const edit = await runInProcessCli(
			["task", "edit", "TASK-1", "--title", "Updated", "--description", "Structured description"],
			{ cwd: testDir },
		);
		expect(edit.exitCode).toBe(0);
		const task = await coreFileSystem(core).loadTask("task-1");
		expect(task).toMatchObject({
			title: "Updated",
			description: "Structured description",
			status: "To Do",
			rawContent: "## Description\n\nBody text",
		});
		expect(await Bun.file(task?.filePath ?? "").text()).toContain("task_schema_version: 3");
	});

	it("retains formatted plain task output", async () => {
		const created = await runInProcessCli(["task", "create", "Visible", "--description", "Description"], {
			cwd: testDir,
		});
		expect(created.exitCode).toBe(0);
		const result = await runInProcessCli(["task", "view", "TASK-1", "--plain"], { cwd: testDir });
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("Task TASK-1 - Visible");
		expect(result.stdout).toContain("Description:");
	});

	it("ignores flat records without modifying their bytes", async () => {
		const content =
			"---\nid: TASK-2\ntitle: Historical\nstatus: To Do\ncreated_date: '2026-10-01'\nlabels: []\ndependencies: []\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nPreserved\n<!-- SECTION:DESCRIPTION:END -->\n";
		const first = join(coreFileSystem(new Core(testDir)).tasksDir, "task-2 - First.md");
		await writeFile(first, content);
		const result = await runInProcessCli(["task", "view", "TASK-2", "--plain"], { cwd: testDir });
		expect(result.exitCode).toBe(1);
		expect(result.stderr).not.toContain("Manually convert");
		expect(await readFile(first, "utf8")).toBe(content);
	});
});
