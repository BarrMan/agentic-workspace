import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../index.ts";
import { Storage } from "../storage/storage.ts";
import { runInProcessCli } from "./in-process-cli.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestProject, safeCleanup } from "./test-utils.ts";

/** Every case owns its project directory. */
async function setupPreservation(): Promise<{ dir: string; core: Core }> {
	const dir = createUniqueTestDir("test-task-edit-preservation");
	await mkdir(dir, { recursive: true });

	// Initialize agentic-workspace project using Core
	const core = new Core(dir);
	await initializeFilesystemTestProject(core, "Task Edit Preservation Test");
	return { dir, core };
}

describe("Task edit section preservation", () => {
	it("preserves a generic working artifact and description during edits", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with both content fields
			await Storage.open(dir).createTask({
				id: "task-1",
				title: "Full task test",
				done: false,
				status: "To Do",
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Original description",
			});

			const artifactPath = join(coreFileSystem(core).tasksDir, "task-1", "working-state.md");
			await Bun.write(artifactPath, "Opaque working state.\n");

			// Update just the description
			const edit = await runInProcessCli(["task", "edit", "TASK-1", "--description", "UPDATED description"], {
				cwd: dir,
			});
			expect(edit.exitCode).toBe(0);

			const viewed = await runInProcessCli(["task", "view", "TASK-1", "--plain"], { cwd: dir });
			expect(viewed.exitCode).toBe(0);
			const result = viewed.stdout;

			expect(result).toContain("UPDATED description");
			expect(await Bun.file(artifactPath).text()).toBe("Opaque working state.\n");
			expect(await Bun.file(join(coreFileSystem(core).tasksDir, "task-1", "task.md")).text()).not.toContain(
				"agent_summary",
			);
		} finally {
			await safeCleanup(dir);
		}
	});

	it("preserves description and working artifact across repeated edits", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with a description
			await Storage.open(dir).createTask({
				id: "task-2",
				title: "Agent summary update test",
				done: false,
				status: "To Do",
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Test description",
			});

			const artifactPath = join(coreFileSystem(core).tasksDir, "task-2", "working-state.md");
			await Bun.write(artifactPath, "Working notes remain opaque.\n");
			expect(
				(await runInProcessCli(["task", "edit", "TASK-2", "--description", "Updated description"], { cwd: dir }))
					.exitCode,
			).toBe(0);

			// Verify the task description and independent artifact survive canonical saves.
			const viewed = await runInProcessCli(["task", "view", "TASK-2", "--plain"], { cwd: dir });
			expect(viewed.exitCode).toBe(0);
			const result = viewed.stdout;

			expect(result).toContain("Updated description");
			expect(await Bun.file(artifactPath).text()).toBe("Working notes remain opaque.\n");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("does not create summary metadata when editing task fields", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with a description
			await Storage.open(dir).createTask({
				id: "task-3",
				title: "Agent summary replace test",
				done: false,
				status: "To Do",
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Test description",
			});

			expect(
				(await runInProcessCli(["task", "edit", "TASK-3", "--description", "Updated description"], { cwd: dir }))
					.exitCode,
			).toBe(0);

			const viewed = await runInProcessCli(["task", "view", "TASK-3", "--plain"], { cwd: dir });
			expect(viewed.exitCode).toBe(0);
			const result = viewed.stdout;
			const taskContent = await Bun.file(join(coreFileSystem(core).tasksDir, "task-3", "task.md")).text();

			expect(result).toContain("Updated description");
			expect(taskContent).not.toContain("agent_summary");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("keeps a generic artifact independent from the task description", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with a description
			await Storage.open(dir).createTask({
				id: "task-4",
				title: "Agent summary clear test",
				done: false,
				status: "To Do",
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Test description",
			});

			const artifactPath = join(coreFileSystem(core).tasksDir, "task-4", "working-state.md");
			await Bun.write(artifactPath, "Pending work.\n");
			expect(
				(await runInProcessCli(["task", "edit", "TASK-4", "--description", "Updated description"], { cwd: dir }))
					.exitCode,
			).toBe(0);

			const viewed = await runInProcessCli(["task", "view", "TASK-4", "--plain"], { cwd: dir });
			expect(viewed.exitCode).toBe(0);
			const result = viewed.stdout;

			expect(result).toContain("Updated description");
			expect(await Bun.file(artifactPath).text()).toBe("Pending work.\n");
		} finally {
			await safeCleanup(dir);
		}
	});

	it("should handle tasks with minimal content", async () => {
		const { dir, core } = await setupPreservation();
		try {
			// Create a task with just description
			await Storage.open(dir).createTask({
				id: "task-5",
				title: "Minimal task test",
				done: false,
				status: "To Do",
				createdDate: "2025-07-04",
				labels: [],
				dependencies: [],
				description: "Minimal description",
			});

			// Update description
			expect(
				(
					await runInProcessCli(["task", "edit", "TASK-5", "--description", "Updated minimal description"], {
						cwd: dir,
					})
				).exitCode,
			).toBe(0);

			const viewed = await runInProcessCli(["task", "view", "TASK-5", "--plain"], { cwd: dir });
			expect(viewed.exitCode).toBe(0);
			const result = viewed.stdout;
			const taskContent = await Bun.file(join(coreFileSystem(core).tasksDir, "task-5", "task.md")).text();

			expect(result).toContain("Updated minimal description");
			expect(result).toContain("Artifacts: None");
			expect(taskContent).not.toContain("agent_summary");
		} finally {
			await safeCleanup(dir);
		}
	});
});
