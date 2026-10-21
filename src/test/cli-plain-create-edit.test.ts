import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { hasEditFieldFlags } from "../cli/features/task/edit-fields.ts";
import { buildTaskUpdateInput } from "../cli/task-edit-builder.ts";
import { Core } from "../index.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI task create/edit descriptions", () => {
	it("distinguishes omitted, explicit empty, and blank-only label lists", () => {
		expect(buildTaskUpdateInput({})).not.toHaveProperty("labels");
		expect(buildTaskUpdateInput({ labels: [] }).labels).toEqual([]);
		expect(buildTaskUpdateInput({ labels: [" "] })).not.toHaveProperty("labels");
	});

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-plain-create-edit");
		await mkdir(TEST_DIR, { recursive: true });

		// Initialize git repo first using shell API (same as other tests)

		// Initialize agentic-workspace project using Core
		const core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Plain Create/Edit Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("creates and edits a task description", async () => {
		expect(
			(await runInProcessCli(["task", "create", "Example", "--description", "Hello"], { cwd: TEST_DIR })).exitCode,
		).toBe(0);
		const core = new Core(TEST_DIR);
		expect((await coreFileSystem(core).loadTask("task-1"))?.description).toBe("Hello");

		expect(
			(await runInProcessCli(["task", "edit", "task-1", "--description", "Updated description"], { cwd: TEST_DIR }))
				.exitCode,
		).toBe(0);
		expect((await coreFileSystem(core).loadTask("task-1"))?.description).toBe("Updated description");
	});

	it("passes repeated create labels through registration into task input", async () => {
		expect(
			(await runInProcessCli(["task", "create", "Labeled", "--label", "alpha", "--label", "beta"], { cwd: TEST_DIR }))
				.exitCode,
		).toBe(0);
		expect((await coreFileSystem(new Core(TEST_DIR)).loadTask("task-1"))?.labels).toEqual(["alpha", "beta"]);
	});

	it("uses exact configured priorities and leaves priority unchanged on title/description edit", async () => {
		const core = new Core(TEST_DIR);
		const config = await coreFileSystem(core).loadConfig();
		if (!config) throw new Error("Expected initialized configuration");
		await coreFileSystem(core).saveConfig({ ...config, priorities: ["Urgent"] });

		expect(
			(await runInProcessCli(["task", "create", "Priority", "--priority", "Urgent"], { cwd: TEST_DIR })).exitCode,
		).toBe(0);
		expect((await coreFileSystem(core).loadTask("task-1"))?.priority).toBe("Urgent");
		for (const priority of [" urgent ", "urgent"]) {
			expect(
				(await runInProcessCli(["task", "create", "Invalid priority", "--priority", priority], { cwd: TEST_DIR }))
					.exitCode,
			).not.toBe(0);
		}
		expect(
			(
				await runInProcessCli(
					["task", "edit", "task-1", "--title", "Updated", "--description", "Updated description"],
					{ cwd: TEST_DIR },
				)
			).exitCode,
		).toBe(0);
		expect(await coreFileSystem(core).loadTask("task-1")).toMatchObject({
			title: "Updated",
			description: "Updated description",
			priority: "Urgent",
		});
		expect(
			(await runInProcessCli(["task", "edit", "task-1", "--priority", "Urgent"], { cwd: TEST_DIR })).exitCode,
		).not.toBe(0);
	});

	it("treats a task edit with no field options as an interactive edit", () => {
		expect(hasEditFieldFlags({})).toBe(false);
		expect(hasEditFieldFlags({ label: undefined, dependsOn: undefined })).toBe(false);
	});
});
