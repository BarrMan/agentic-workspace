import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../controller/agentic-workspace.ts";
import type { AgenticWorkspaceConfig } from "../model/types.ts";
import { Storage } from "../storage/storage.ts";
import { coreFileSystem, initGitRepo } from "./test-utils.ts";

describe("Offline Integration Tests", () => {
	let tempDir: string;
	let core: Core;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "agentic-workspace-offline-integration-"));

		// Initialize a git repo without remote
		initGitRepo(tempDir);

		// Create initial commit
		await writeFile(join(tempDir, "README.md"), "# Test Project");
		await $`git add README.md`.cwd(tempDir).quiet();
		await $`git commit -m "Initial commit"`.cwd(tempDir).quiet();

		// Create basic agentic-workspace structure
		const agenticWorkspaceDir = join(tempDir, "agentic-workspace");
		await mkdir(agenticWorkspaceDir, { recursive: true });
		await mkdir(join(agenticWorkspaceDir, "tasks"), { recursive: true });

		// Create config with remote operations disabled
		const config: AgenticWorkspaceConfig = {
			projectName: "Offline Test Project",
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["bug", "feature"],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		};

		await writeFile(
			join(tempDir, "agentic-workspace.config.yml"),
			`project_name: "${config.projectName}"
statuses: ["To Do", "In Progress", "Done"]
labels: ["bug", "feature"]
date_format: YYYY-MM-DD
agentic_workspace_directory: "agentic-workspace"
remote_operations: false
`,
		);

		core = new Core(tempDir);
		await new Storage(coreFileSystem(core)).initializeWorkspace(config, {
			agenticWorkspaceDirectory: "agentic-workspace",
			configLocation: "root",
		});
	});

	afterEach(async () => {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	it("should work in offline mode without remote", async () => {
		const config = await coreFileSystem(core).loadConfig();
		expect(config?.remoteOperations).toBe(false);

		// Create a task - this should work without any remote operations
		const task = {
			id: "task-1",
			title: "Test task in offline mode",
			description: "This task should be created without remote operations",
			status: "To Do",
			done: false,
			createdDate: new Date().toISOString().split("T")[0] ?? "",
			updatedDate: new Date().toISOString().split("T")[0] ?? "",
			labels: ["feature"],
			dependencies: [],
			priority: "medium" as const,
		};

		const filepath = await new Storage(coreFileSystem(core)).saveTask(task, { create: true });
		expect(filepath).toContain("task-1");

		// List tasks should work without remote operations
		const tasks = await core.tasks.query({});
		expect(tasks).toHaveLength(1);
		expect(tasks[0]?.id).toBe("TASK-1");
		expect(tasks[0]?.title).toBe("Test task in offline mode");
	});

	it("should handle repository without remote origin gracefully", async () => {
		// Try to verify that git operations don't fail when there's no remote
		// This simulates a local-only git repository

		// Get git operations instance
		const gitOps = await core.getGitOps();

		// These operations should not fail even without remote
		try {
			await gitOps.fetch();
			// Should complete without error due to remoteOperations: false
		} catch (error) {
			// If it does error, it should be handled gracefully
			expect(error).toBeUndefined();
		}

		// Verify that we can still work with local git operations
		const lastCommit = await gitOps.getLastCommitMessage();
		// Should be empty or the initial commit
		expect(typeof lastCommit).toBe("string");
	});

	it("should work with config command to set remoteOperations", async () => {
		// Load initial config
		const initialConfig = await coreFileSystem(core).loadConfig();
		expect(initialConfig?.remoteOperations).toBe(false);

		// Simulate config set command
		if (!initialConfig) throw new Error("Config not loaded");
		const updatedConfig: AgenticWorkspaceConfig = { ...initialConfig, remoteOperations: true };
		await coreFileSystem(core).saveConfig(updatedConfig);

		// Verify config was updated
		const newConfig = await coreFileSystem(core).loadConfig();
		expect(newConfig?.remoteOperations).toBe(true);

		// Test changing it back
		if (!newConfig) throw new Error("Config not loaded");
		const finalConfig: AgenticWorkspaceConfig = { ...newConfig, remoteOperations: false };
		await coreFileSystem(core).saveConfig(finalConfig);

		const verifyConfig = await coreFileSystem(core).loadConfig();
		expect(verifyConfig?.remoteOperations).toBe(false);
	});
});
