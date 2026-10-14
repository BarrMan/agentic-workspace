import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveAgenticWorkspaceDirectory } from "../utils/agentic-workspace-directory.ts";

describe("resolveAgenticWorkspaceDirectory", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `agentic-workspace-directory-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	it("prefers root agentic-workspace.config.yml with agentic_workspace_directory for custom folders", async () => {
		await mkdir(join(testDir, "planning", "agentic-workspace-data", "tasks"), { recursive: true });
		await writeFile(
			join(testDir, "agentic-workspace.config.yml"),
			'project_name: "Test"\nagentic_workspace_directory: "planning/agentic-workspace-data"\n',
		);

		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.source).toBe("custom");
		expect(resolution.configSource).toBe("root");
		expect(resolution.agenticWorkspaceDir).toBe("planning/agentic-workspace-data");
		expect(resolution.configPath).toBe(join(testDir, "agentic-workspace.config.yml"));
	});

	it("keeps root agentic-workspace.config.yml canonical even when the configured agentic-workspace directory does not exist yet", async () => {
		await writeFile(
			join(testDir, "agentic-workspace.config.yml"),
			'project_name: "Test"\nagentic_workspace_directory: "planning/agentic-workspace-data"\n',
		);

		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.source).toBe("custom");
		expect(resolution.configSource).toBe("root");
		expect(resolution.agenticWorkspaceDir).toBe("planning/agentic-workspace-data");
		expect(resolution.agenticWorkspacePath).toBe(join(testDir, "planning", "agentic-workspace-data"));
		expect(resolution.configPath).toBe(join(testDir, "agentic-workspace.config.yml"));
	});

	it("uses root agentic-workspace.config.yml with built-in agentic-workspace folder when agentic_workspace_directory is omitted", async () => {
		await mkdir(join(testDir, "agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, "agentic-workspace.config.yml"), 'project_name: "Test"\n');

		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.source).toBe("agentic-workspace");
		expect(resolution.configSource).toBe("root");
		expect(resolution.agenticWorkspaceDir).toBe("agentic-workspace");
		expect(resolution.configPath).toBe(join(testDir, "agentic-workspace.config.yml"));
	});

	it("falls back to folder-local config when root agentic-workspace.config.yml is absent", async () => {
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), 'project_name: "Test"\n');

		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.source).toBe(".agentic-workspace");
		expect(resolution.configSource).toBe("folder");
		expect(resolution.agenticWorkspaceDir).toBe(".agentic-workspace");
		expect(resolution.configPath).toBe(join(testDir, ".agentic-workspace", "config.yml"));
	});

	it("falls back to folder-local config when root agentic-workspace.config.yml is invalid", async () => {
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), 'project_name: "Test"\n');
		await writeFile(join(testDir, "agentic-workspace.config.yml"), 'name: "placeholder"\n');

		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.source).toBe(".agentic-workspace");
		expect(resolution.configSource).toBe("folder");
		expect(resolution.agenticWorkspaceDir).toBe(".agentic-workspace");
		expect(resolution.configPath).toBe(join(testDir, ".agentic-workspace", "config.yml"));
	});

	it("prefers the built-in agentic-workspace folder that has a config marker", async () => {
		await mkdir(join(testDir, "agentic-workspace"), { recursive: true });
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), 'project_name: "Test"\n');

		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.source).toBe(".agentic-workspace");
		expect(resolution.configSource).toBe("folder");
		expect(resolution.agenticWorkspaceDir).toBe(".agentic-workspace");
		expect(resolution.configPath).toBe(join(testDir, ".agentic-workspace", "config.yml"));
	});
});
