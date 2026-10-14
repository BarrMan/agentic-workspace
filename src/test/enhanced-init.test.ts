import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Core } from "../core/agentic-workspace.ts";
import { initializeProject } from "../core/init.ts";
import type { AgenticWorkspaceConfig } from "../types/index.ts";
import { createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

describe("Enhanced init command", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = createUniqueTestDir("test-enhanced-init");
	});

	afterEach(async () => {
		await safeCleanup(tmpDir);
	});

	test("should create default config for new project initialization", async () => {
		const core = new Core(tmpDir);

		// Check that no config exists initially
		const initialConfig = await core.filesystem.loadConfig();
		expect(initialConfig).toBeNull();

		// Initialize project
		await initializeTestProject(core, "New Project");

		// Verify config was created with defaults
		const config = await core.filesystem.loadConfig();
		expect(config).toBeTruthy();
		expect(config?.projectName).toBe("New Project");
		expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
		expect(config?.dateFormat).toBe("yyyy-mm-dd");
	});

	test("should preserve existing statuses and labels during re-initialization", async () => {
		const core = new Core(tmpDir);

		// Initialize with custom config
		const customConfig = {
			projectName: "Custom Project",
			statuses: ["Backlog", "In Progress", "Review", "Done"],
			labels: ["bug", "feature", "enhancement"],
			milestones: ["v1.0", "v2.0"],
			defaultStatus: "Backlog",
			dateFormat: "dd/mm/yyyy",
			maxColumnWidth: 30,
			agenticWorkspaceDirectory: "agentic-workspace",
			prefixes: { task: "WORK" },
		};

		await core.filesystem.ensureAgenticWorkspaceStructure();
		await core.filesystem.saveConfig(customConfig);

		// Simulate re-initialization by loading existing config
		const existingConfig = await core.filesystem.loadConfig();
		expect(existingConfig).toBeTruthy();

		const result = await initializeProject(core, {
			projectName: "Custom Project Updated",
			integrationMode: "none",
			existingConfig,
			advancedConfig: { taskPrefix: "IGNORED" },
		});

		expect(result.config.projectName).toBe("Custom Project Updated");
		expect(result.config.statuses).toEqual(["Backlog", "In Progress", "Review", "Done"]);
		expect(result.config.labels).toEqual(["bug", "feature", "enhancement"]);
		expect(result.config.dateFormat).toBe("dd/mm/yyyy");
		expect(result.config.maxColumnWidth).toBe(30);
		expect(result.config.prefixes?.task).toBe("WORK");

		const reloaded = await core.filesystem.loadConfig();
		expect(reloaded?.statuses).toEqual(["Backlog", "In Progress", "Review", "Done"]);
		expect(reloaded?.labels).toEqual(["bug", "feature", "enhancement"]);
		expect(reloaded?.dateFormat).toBe("dd/mm/yyyy");
		expect(reloaded?.maxColumnWidth).toBe(30);
	});

	test("should preserve non-init-managed config fields during re-initialization", async () => {
		const core = new Core(tmpDir);

		const initialConfig: AgenticWorkspaceConfig = {
			projectName: "Preserve Fields Project",
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["bug"],
			defaultStatus: "To Do",
			dateFormat: "yyyy-mm-dd",
			defaultAssignee: ["@alex"],
			defaultReporter: "@bot",
			includeDateTimeInDates: true,
			onStatusChange: "echo changed",
			mcp: {
				http: {
					host: "127.0.0.1",
					port: 7777,
					auth: { type: "none" },
				},
			},
		};

		await core.filesystem.ensureAgenticWorkspaceStructure();
		await core.filesystem.saveConfig(initialConfig);

		const existingConfig = await core.filesystem.loadConfig();
		if (!existingConfig) throw new Error("Expected existing config");

		await initializeProject(core, {
			projectName: "Preserve Fields Project Updated",
			integrationMode: "none",
			existingConfig,
		});

		const reloaded = await core.filesystem.loadConfig();
		expect(reloaded?.projectName).toBe("Preserve Fields Project Updated");
		expect(reloaded?.defaultAssignee).toEqual(["@alex"]);
		expect(reloaded?.defaultReporter).toBe("@bot");
		expect(reloaded?.includeDateTimeInDates).toBe(true);
		expect(reloaded?.onStatusChange).toBe("echo changed");
		expect(reloaded?.mcp?.http?.host).toBe("127.0.0.1");
		expect(reloaded?.mcp?.http?.port).toBe(7777);
	});

	test("initializeProject should reject reserved task prefixes", async () => {
		for (const taskPrefix of ["draft", "DOC", "Decision"]) {
			const core = new Core(tmpDir);
			await expect(
				initializeProject(core, {
					projectName: "Reserved Prefix Init",
					integrationMode: "none",
					advancedConfig: { taskPrefix },
				}),
			).rejects.toThrow(/reserved for drafts, docs, or decisions/);
			expect(await Bun.file(join(tmpDir, "agentic-workspace", "config.yml")).exists()).toBe(false);
		}
	});

	test("initializeProject should preserve an existing reserved prefix on re-init", async () => {
		const core = new Core(tmpDir);
		await initializeProject(core, {
			projectName: "Legacy Reserved Prefix",
			integrationMode: "none",
			advancedConfig: { taskPrefix: "JIRA" },
		});
		const existingConfig = await core.filesystem.loadConfig();
		if (!existingConfig) throw new Error("Missing test config");
		existingConfig.prefixes = { task: "draft" };
		await core.filesystem.saveConfig(existingConfig);

		const result = await initializeProject(core, {
			projectName: "Legacy Reserved Prefix",
			integrationMode: "none",
			existingConfig,
			advancedConfig: { taskPrefix: "task" },
		});

		expect(result.config.prefixes?.task).toBe("draft");
		const loadedConfig = await core.filesystem.loadConfig();
		expect(loadedConfig?.prefixes?.task).toBe("draft");

		// Re-init cannot introduce a reserved prefix either.
		await expect(
			initializeProject(core, {
				projectName: "Legacy Reserved Prefix",
				integrationMode: "none",
				existingConfig,
				advancedConfig: { taskPrefix: "doc" },
			}),
		).rejects.toThrow(/reserved for drafts, docs, or decisions/);
	});

	test("initializeProject should use custom taskPrefix from advancedConfig", async () => {
		const core = new Core(tmpDir);

		// Initialize project with custom prefix via initializeProject function
		const result = await initializeProject(core, {
			projectName: "JIRA Init Test",
			integrationMode: "none",
			advancedConfig: {
				taskPrefix: "JIRA",
			},
		});

		expect(result.success).toBe(true);
		expect(result.config.prefixes?.task).toBe("JIRA");

		// Verify it was saved
		const loadedConfig = await core.filesystem.loadConfig();
		expect(loadedConfig?.prefixes?.task).toBe("JIRA");
	});

	test("initializeProject should preserve existing prefix on re-init", async () => {
		const core = new Core(tmpDir);

		// First init with custom prefix
		await initializeProject(core, {
			projectName: "Re-Init Test",
			integrationMode: "none",
			advancedConfig: {
				taskPrefix: "ISSUE",
			},
		});

		// Verify initial prefix
		const initialConfig = await core.filesystem.loadConfig();
		expect(initialConfig?.prefixes?.task).toBe("ISSUE");

		// Re-initialize (simulating re-init with different taskPrefix - should be ignored)
		const result = await initializeProject(core, {
			projectName: "Re-Init Test Updated",
			integrationMode: "none",
			existingConfig: initialConfig,
			advancedConfig: {
				taskPrefix: "CHANGED", // This should be ignored since existingConfig has prefixes
			},
		});

		// Verify prefix was preserved from existingConfig
		expect(result.config.prefixes?.task).toBe("ISSUE");
	});

	test("initializeProject should use default prefix when not specified", async () => {
		const core = new Core(tmpDir);

		// Initialize without custom prefix
		const result = await initializeProject(core, {
			projectName: "Default Prefix Init",
			integrationMode: "none",
		});

		expect(result.success).toBe(true);
		expect(result.config.prefixes?.task).toBe("task");
	});

	test("prefixes should persist to disk and reload correctly with new Core instance", async () => {
		const core1 = new Core(tmpDir);

		// Initialize with custom prefix
		await initializeProject(core1, {
			projectName: "Disk Persistence Test",
			integrationMode: "none",
			advancedConfig: {
				taskPrefix: "PERSIST",
			},
		});

		// Create a NEW Core instance to bypass any in-memory cache
		// This simulates what happens when a user runs a new command in a new process
		const core2 = new Core(tmpDir);
		const loadedConfig = await core2.filesystem.loadConfig();

		// This test would fail if prefixes aren't properly serialized/parsed from disk
		expect(loadedConfig?.prefixes?.task).toBe("PERSIST");
	});

	test("initializeProject should create .agentic-workspace when selected", async () => {
		const core = new Core(tmpDir);

		await initializeProject(core, {
			projectName: "Hidden AgenticWorkspace Init",
			agenticWorkspaceDirectory: ".agentic-workspace",
			agenticWorkspaceDirectorySource: ".agentic-workspace",
			integrationMode: "none",
		});

		const configExists = await Bun.file(join(tmpDir, ".agentic-workspace", "config.yml")).exists();
		expect(configExists).toBe(true);
		expect(new Core(tmpDir).filesystem.agenticWorkspaceDirName).toBe(".agentic-workspace");
	});

	test("initializeProject should honor .agentic-workspace source when agenticWorkspaceDirectory is omitted", async () => {
		const core = new Core(tmpDir);

		await initializeProject(core, {
			projectName: "Hidden AgenticWorkspace Source Only",
			agenticWorkspaceDirectorySource: ".agentic-workspace",
			integrationMode: "none",
		});

		expect(await Bun.file(join(tmpDir, ".agentic-workspace", "config.yml")).exists()).toBe(true);
		expect(await Bun.file(join(tmpDir, "agentic-workspace", "config.yml")).exists()).toBe(false);
	});

	test("initializeProject should create a root agentic-workspace.config.yml for custom agentic-workspace directories", async () => {
		const core = new Core(tmpDir);
		await initializeProject(core, {
			projectName: "Custom AgenticWorkspace Init",
			agenticWorkspaceDirectory: "planning/agentic-workspace-data",
			agenticWorkspaceDirectorySource: "custom",
			configLocation: "root",
			integrationMode: "none",
		});

		const rootConfigPath = join(tmpDir, "agentic-workspace.config.yml");
		const rootConfig = await Bun.file(rootConfigPath).text();
		const configExists = await Bun.file(rootConfigPath).exists();
		const freshCore = new Core(tmpDir);
		const freshConfig = await freshCore.filesystem.loadConfig();

		expect(configExists).toBe(true);
		expect(rootConfig).toContain('agentic_workspace_directory: "planning/agentic-workspace-data"');
		expect(freshCore.filesystem.agenticWorkspaceDirName).toBe("planning/agentic-workspace-data");
		expect(freshConfig?.projectName).toBe("Custom AgenticWorkspace Init");
		expect(freshCore.filesystem.agenticWorkspaceDirName).toBe("planning/agentic-workspace-data");
	});

	test("initializeProject should default custom agentic-workspace directories to root config when configLocation is omitted", async () => {
		const core = new Core(tmpDir);
		await initializeProject(core, {
			projectName: "Custom AgenticWorkspace Default Root",
			agenticWorkspaceDirectory: "planning/agentic-workspace-data",
			agenticWorkspaceDirectorySource: "custom",
			integrationMode: "none",
		});

		const rootConfigPath = join(tmpDir, "agentic-workspace.config.yml");
		const rootConfig = await Bun.file(rootConfigPath).text();
		expect(await Bun.file(rootConfigPath).exists()).toBe(true);
		expect(rootConfig).toContain('agentic_workspace_directory: "planning/agentic-workspace-data"');
		expect(await Bun.file(join(tmpDir, "planning", "agentic-workspace-data", "config.yml")).exists()).toBe(false);
	});

	test("initializeProject should infer custom source from agenticWorkspaceDirectory when source is omitted", async () => {
		const core = new Core(tmpDir);
		await initializeProject(core, {
			projectName: "Custom AgenticWorkspace Inferred Source",
			agenticWorkspaceDirectory: "planning/agentic-workspace-data",
			integrationMode: "none",
		});

		const rootConfigPath = join(tmpDir, "agentic-workspace.config.yml");
		const rootConfig = await Bun.file(rootConfigPath).text();
		expect(await Bun.file(rootConfigPath).exists()).toBe(true);
		expect(rootConfig).toContain('agentic_workspace_directory: "planning/agentic-workspace-data"');
		expect(await Bun.file(join(tmpDir, "planning", "agentic-workspace-data", "config.yml")).exists()).toBe(false);
	});

	test("initializeProject should reject custom agentic-workspace directories with folder config location", async () => {
		const core = new Core(tmpDir);
		await expect(
			initializeProject(core, {
				projectName: "Invalid Custom Folder Config",
				agenticWorkspaceDirectory: "planning/agentic-workspace-data",
				agenticWorkspaceDirectorySource: "custom",
				configLocation: "folder",
				integrationMode: "none",
			}),
		).rejects.toThrow("Custom AgenticWorkspace directories require root config discovery.");
	});

	test("initializeProject should reject mismatched built-in source and custom agentic-workspace path", async () => {
		const core = new Core(tmpDir);
		await expect(
			initializeProject(core, {
				projectName: "Mismatched AgenticWorkspace Source",
				agenticWorkspaceDirectory: "planning/agentic-workspace-data",
				agenticWorkspaceDirectorySource: ".agentic-workspace",
				integrationMode: "none",
			}),
		).rejects.toThrow("AgenticWorkspace directory source and directory value must agree.");
	});
});
