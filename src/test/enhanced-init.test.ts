import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { initializeProject } from "../controller/init.ts";
import type { AgenticWorkspaceConfig } from "../model/types.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "./test-utils.ts";

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
		const initialConfig = await coreFileSystem(core).loadConfig();
		expect(initialConfig).toBeNull();

		// Initialize project
		await initializeTestProject(core, "New Project");

		// Verify config was created with defaults
		const config = await coreFileSystem(core).loadConfig();
		expect(config).toBeTruthy();
		expect(config?.projectName).toBe("New Project");
		expect(config?.statuses).toEqual(["To Do", "In Progress", "Done"]);
		expect(config?.dateFormat).toBe("yyyy-MM-dd");
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
			dateFormat: "dd/MM/yyyy",
			maxColumnWidth: 30,
			agenticWorkspaceDirectory: "agentic-workspace",
			prefixes: { task: "WORK" },
		};

		await coreFileSystem(core).ensureAgenticWorkspaceStructure();
		await coreFileSystem(core).saveConfig(customConfig);

		// Simulate re-initialization by loading existing config
		const existingConfig = await coreFileSystem(core).loadConfig();
		expect(existingConfig).toBeTruthy();

		const result = await initializeProject(core, {
			projectName: "Custom Project Updated",
			existingConfig,
			advancedConfig: { taskPrefix: "IGNORED" },
		});

		expect(result.config.projectName).toBe("Custom Project Updated");
		expect(result.config.statuses).toEqual(["Backlog", "In Progress", "Review", "Done"]);
		expect(result.config.labels).toEqual(["bug", "feature", "enhancement"]);
		expect(result.config.dateFormat).toBe("dd/MM/yyyy");
		expect(result.config.maxColumnWidth).toBe(30);
		expect(result.config.prefixes?.task).toBe("WORK");

		const reloaded = await coreFileSystem(core).loadConfig();
		expect(reloaded?.statuses).toEqual(["Backlog", "In Progress", "Review", "Done"]);
		expect(reloaded?.labels).toEqual(["bug", "feature", "enhancement"]);
		expect(reloaded?.dateFormat).toBe("dd/MM/yyyy");
		expect(reloaded?.maxColumnWidth).toBe(30);
	});

	test("should preserve non-init-managed config fields during re-initialization", async () => {
		const core = new Core(tmpDir);

		const initialConfig: AgenticWorkspaceConfig = {
			projectName: "Preserve Fields Project",
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["bug"],
			defaultStatus: "To Do",
			dateFormat: "yyyy-MM-dd",
			defaultReporter: "@bot",
			includeDateTimeInDates: true,
			onStatusChange: "echo changed",
		};

		await coreFileSystem(core).ensureAgenticWorkspaceStructure();
		await coreFileSystem(core).saveConfig(initialConfig);

		const existingConfig = await coreFileSystem(core).loadConfig();
		if (!existingConfig) throw new Error("Expected existing config");

		await initializeProject(core, {
			projectName: "Preserve Fields Project Updated",
			existingConfig,
		});

		const reloaded = await coreFileSystem(core).loadConfig();
		expect(reloaded?.projectName).toBe("Preserve Fields Project Updated");
		expect(reloaded?.defaultReporter).toBe("@bot");
		expect(reloaded?.includeDateTimeInDates).toBe(true);
		expect(reloaded?.onStatusChange).toBe("echo changed");
	});

	test("initializeProject should preserve an existing configured task prefix on re-init", async () => {
		const core = new Core(tmpDir);
		await initializeProject(core, {
			projectName: "Historical Reserved Prefix",
			advancedConfig: { taskPrefix: "JIRA" },
		});
		const existingConfig = await coreFileSystem(core).loadConfig();
		if (!existingConfig) throw new Error("Missing test config");
		existingConfig.prefixes = { task: "OPS" };
		await coreFileSystem(core).saveConfig(existingConfig);

		const result = await initializeProject(core, {
			projectName: "Historical Reserved Prefix",
			existingConfig,
			advancedConfig: { taskPrefix: "task" },
		});

		expect(result.config.prefixes?.task).toBe("OPS");
		const loadedConfig = await coreFileSystem(core).loadConfig();
		expect(loadedConfig?.prefixes?.task).toBe("OPS");
	});

	test("initializeProject should use custom taskPrefix from advancedConfig", async () => {
		const core = new Core(tmpDir);

		// Initialize project with custom prefix via initializeProject function
		const result = await initializeProject(core, {
			projectName: "JIRA Init Test",
			advancedConfig: {
				taskPrefix: "JIRA",
			},
		});

		expect(result.success).toBe(true);
		expect(result.config.prefixes?.task).toBe("JIRA");

		// Verify it was saved
		const loadedConfig = await coreFileSystem(core).loadConfig();
		expect(loadedConfig?.prefixes?.task).toBe("JIRA");
	});

	test("initializeProject should preserve existing prefix on re-init", async () => {
		const core = new Core(tmpDir);

		// First init with custom prefix
		await initializeProject(core, {
			projectName: "Re-Init Test",
			advancedConfig: {
				taskPrefix: "ISSUE",
			},
		});

		// Verify initial prefix
		const initialConfig = await coreFileSystem(core).loadConfig();
		expect(initialConfig?.prefixes?.task).toBe("ISSUE");

		// Re-initialize (simulating re-init with different taskPrefix - should be ignored)
		const result = await initializeProject(core, {
			projectName: "Re-Init Test Updated",
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
		});

		expect(result.success).toBe(true);
		expect(result.config.prefixes?.task).toBe("task");
	});

	test("prefixes should persist to disk and reload correctly with new Core instance", async () => {
		const core1 = new Core(tmpDir);

		// Initialize with custom prefix
		await initializeProject(core1, {
			projectName: "Disk Persistence Test",
			advancedConfig: {
				taskPrefix: "PERSIST",
			},
		});

		// Create a NEW Core instance to bypass any in-memory cache
		// This simulates what happens when a user runs a new command in a new process
		const core2 = new Core(tmpDir);
		const loadedConfig = await coreFileSystem(core2).loadConfig();

		// This test would fail if prefixes aren't properly serialized/parsed from disk
		expect(loadedConfig?.prefixes?.task).toBe("PERSIST");
	});

	test("initializeProject should create .agentic-workspace when selected", async () => {
		const core = new Core(tmpDir);

		await initializeProject(core, {
			projectName: "Hidden AgenticWorkspace Init",
			agenticWorkspaceDirectory: ".agentic-workspace",
			agenticWorkspaceDirectorySource: ".agentic-workspace",
		});

		const configExists = await Bun.file(join(tmpDir, ".agentic-workspace", "config.yml")).exists();
		expect(configExists).toBe(true);
		expect(coreFileSystem(new Core(tmpDir)).agenticWorkspaceDirName).toBe(".agentic-workspace");
	});

	test("initializeProject should honor .agentic-workspace source when agenticWorkspaceDirectory is omitted", async () => {
		const core = new Core(tmpDir);

		await initializeProject(core, {
			projectName: "Hidden AgenticWorkspace Source Only",
			agenticWorkspaceDirectorySource: ".agentic-workspace",
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
		});

		const rootConfigPath = join(tmpDir, "agentic-workspace.config.yml");
		const rootConfig = await Bun.file(rootConfigPath).text();
		const configExists = await Bun.file(rootConfigPath).exists();
		const freshCore = new Core(tmpDir);
		const freshConfig = await coreFileSystem(freshCore).loadConfig();

		expect(configExists).toBe(true);
		expect(rootConfig).toContain('agentic_workspace_directory: "planning/agentic-workspace-data"');
		expect(coreFileSystem(freshCore).agenticWorkspaceDirName).toBe("planning/agentic-workspace-data");
		expect(freshConfig?.projectName).toBe("Custom AgenticWorkspace Init");
		expect(coreFileSystem(freshCore).agenticWorkspaceDirName).toBe("planning/agentic-workspace-data");
	});

	test("initializeProject should default custom agentic-workspace directories to root config when configLocation is omitted", async () => {
		const core = new Core(tmpDir);
		await initializeProject(core, {
			projectName: "Custom AgenticWorkspace Default Root",
			agenticWorkspaceDirectory: "planning/agentic-workspace-data",
			agenticWorkspaceDirectorySource: "custom",
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
			}),
		).rejects.toThrow("AgenticWorkspace directory source and directory value must agree.");
	});
});
