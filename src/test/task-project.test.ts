import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Core } from "../controller/agentic-workspace.ts";
import type { Task } from "../model/types.ts";
import { parseTask } from "../storage/markdown/parser.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("task project field", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-task-project");
		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Project Test Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("unconfigured projects", () => {
		it("should allow creating tasks without a project when unconfigured", async () => {
			const { task } = await core.tasks.create({ title: "Untagged task" });
			const loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.project).toBeUndefined();
		});
	});

	describe("persistence round-trip", () => {
		beforeEach(async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Config not found");
			config.projects = ["web", "api", "mobile"];
			await coreFileSystem(core).saveConfig(config);
		});

		it("should persist project on create and read it back", async () => {
			const { task } = await core.tasks.create({ title: "Web task", project: "web" });
			expect(task.project).toBe("web");

			const loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.project).toBe("web");
		});

		it("should update and clear project", async () => {
			const { task } = await core.tasks.create({ title: "Web task", project: "web" });

			await core.storage.withTaskLock(task.id, (current) => core.tasks.edit({ ...current, project: "api" }));
			let loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.project).toBe("api");
			expect(loaded?.updatedDate).toBeDefined();

			await core.storage.withTaskLock(task.id, (current) => core.tasks.edit({ ...current, project: undefined }));
			loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.project).toBeUndefined();
		});

		it("should serialize project to frontmatter and parse it back", () => {
			const task: Task = {
				id: "task-1",
				title: "Round trip",
				status: "To Do",
				done: false,
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
				project: "api",
			};

			const serialized = serializeTask(task);
			expect(serialized).toContain("project: api");
			expect(parseTask(serialized).project).toBe("api");
		});
	});

	describe("config override", () => {
		it("should round-trip the projects config key", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Config not found");
			config.projects = ["web", "api"];
			await coreFileSystem(core).saveConfig(config);

			const reloaded = await coreFileSystem(new Core(TEST_DIR)).loadConfig();
			expect(reloaded?.projects).toEqual(["web", "api"]);
		});

		it("should leave projects undefined when the config key is absent", async () => {
			const config = await coreFileSystem(core).loadConfig();
			expect(config?.projects).toBeUndefined();
		});
	});

	describe("unassigned-project tasks", () => {
		it("should not write a project key for tasks without a project", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Config not found");
			config.projects = ["web"];
			await coreFileSystem(core).saveConfig(config);

			const { task } = await core.tasks.create({ title: "Untagged task" });
			await core.storage.withTaskLock(task.id, (current) => core.tasks.edit({ ...current, title: "Still untagged" }));

			const loaded = await coreFileSystem(core).loadTask(task.id);
			if (!loaded) throw new Error("Task not found");
			expect(loaded.project).toBeUndefined();
			expect(serializeTask(loaded)).not.toContain("project:");
		});
	});
});
