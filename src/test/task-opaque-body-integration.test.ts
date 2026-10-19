import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { Core } from "../controller/agentic-workspace.ts";
import { toTaskDetail } from "../controller/task-detail.ts";
import { formatTaskPlainText } from "../renderer/formatters/task-plain-text.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

describe("opaque task body integration", () => {
	let testDir: string;
	let core: Core;

	beforeEach(async () => {
		testDir = createUniqueTestDir("task-opaque-body");
		await mkdir(testDir, { recursive: true });
		core = new Core(testDir);
		await initializeFilesystemTestProject(core, "Opaque task body");
	});

	afterEach(async () => {
		await safeCleanup(testDir);
	});

	it("preserves a free-form body while rendering the stored content fields", async () => {
		await core.createTask({
			id: "task-1",
			title: "Opaque body",
			status: "To Do",
			assignee: [],
			createdDate: "2026-09-30 12:00",
			labels: [],
			dependencies: [],
			description: "Stored description",
			rawContent: "## Example\n\n- [~] This is free-form body text.",
		});

		const task = await coreFileSystem(core).loadTask("task-1");
		if (!task) throw new Error("Expected created task");
		expect(task.rawContent).toContain("- [~] This is free-form body text.");
		expect(task.description).toBe("Stored description");

		const output = formatTaskPlainText(toTaskDetail(task, { tasks: [task], completedTasks: [], statuses: ["To Do"] }));
		expect(output).toContain("Description:");
		expect(output).toContain("Stored description");
	});
});
