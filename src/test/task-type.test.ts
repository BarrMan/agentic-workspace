import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Core } from "../controller/agentic-workspace.ts";
import { DEFAULT_TASK_TYPES } from "../model/constants.ts";
import type { Task } from "../model/types.ts";
import { parseTask } from "../storage/markdown/parser.ts";
import { serializeTask } from "../storage/markdown/serializer.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("task type field", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-task-type");
		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Type Test Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	describe("persistence round-trip", () => {
		it("should persist type on create and read it back", async () => {
			const { task } = await core.createTaskFromInput({ title: "Typed task", type: "feature" });
			expect(task.type).toBe("feature");

			const loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.type).toBe("feature");
		});

		it("should update and clear type through edit input", async () => {
			const { task } = await core.createTaskFromInput({ title: "Typed task", type: "feature" });

			await core.updateTaskFromInput(task.id, { type: "bug" });
			let loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.type).toBe("bug");
			expect(loaded?.updatedDate).toBeDefined();

			await core.updateTaskFromInput(task.id, { type: "" });
			loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.type).toBeUndefined();
		});

		it("should normalize type casing against the allowed set", async () => {
			const { task } = await core.createTaskFromInput({ title: "Typed task", type: "BUG" });
			expect(task.type).toBe("bug");
		});

		it("should serialize type to frontmatter and parse it back", () => {
			const task: Task = {
				id: "task-1",
				title: "Round trip",
				status: "To Do",
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
				type: "chore",
			};

			const serialized = serializeTask(task);
			expect(serialized).toContain("type: chore");
			expect(parseTask(serialized).type).toBe("chore");
		});
	});

	describe("validation", () => {
		it("should reject unknown type on create with allowed values in the error", async () => {
			await expect(core.createTaskFromInput({ title: "Bad type", type: "banana" })).rejects.toThrow(
				`Invalid type: banana. Valid types are: ${DEFAULT_TASK_TYPES.join(", ")}`,
			);
		});

		it("should reject unknown type on edit", async () => {
			const { task } = await core.createTaskFromInput({ title: "Typed task" });
			await expect(core.updateTaskFromInput(task.id, { type: "banana" })).rejects.toThrow("Invalid type: banana");
		});
	});

	describe("config override", () => {
		it("should validate against configured types and preserve configured casing", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Config not found");
			config.types = ["Bug", "Epic"];
			await coreFileSystem(core).saveConfig(config);

			const { task } = await core.createTaskFromInput({ title: "Custom type", type: "epic" });
			expect(task.type).toBe("Epic");

			await expect(core.createTaskFromInput({ title: "Default type", type: "feature" })).rejects.toThrow(
				"Invalid type: feature. Valid types are: Bug, Epic",
			);
		});

		it("should round-trip the types config key", async () => {
			const config = await coreFileSystem(core).loadConfig();
			if (!config) throw new Error("Config not found");
			config.types = ["bug", "epic"];
			await coreFileSystem(core).saveConfig(config);

			const reloaded = await coreFileSystem(new Core(TEST_DIR)).loadConfig();
			expect(reloaded?.types).toEqual(["bug", "epic"]);
		});

		it("should leave types undefined when the config key is absent", async () => {
			const config = await coreFileSystem(core).loadConfig();
			expect(config?.types).toBeUndefined();
		});
	});

	describe("back-compat for untyped tasks", () => {
		it("should keep tasks without type untyped", async () => {
			const { task } = await core.createTaskFromInput({ title: "Untyped task" });
			const loaded = await coreFileSystem(core).loadTask(task.id);
			expect(loaded?.type).toBeUndefined();
		});

		it("should not write a type key for untyped tasks", async () => {
			const { task } = await core.createTaskFromInput({ title: "Untyped task" });
			await core.updateTaskFromInput(task.id, { title: "Still untyped" });

			const loaded = await coreFileSystem(core).loadTask(task.id);
			if (!loaded) throw new Error("Task not found");
			expect(loaded.type).toBeUndefined();
			expect(serializeTask(loaded)).not.toContain("type:");
		});
	});
});
