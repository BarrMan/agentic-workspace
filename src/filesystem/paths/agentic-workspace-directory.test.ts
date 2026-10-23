import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	normalizeProjectAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectory,
	resolveAgenticWorkspaceDirectoryFromRootConfig,
} from "./agentic-workspace-directory.ts";

describe("resolveAgenticWorkspaceDirectory", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `agentic-workspace-directory-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
		testDir = await realpath(testDir);
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

	it("ignores an old folder and selects the default folder without changing either folder", async () => {
		await mkdir(join(testDir, "agentic-workspace", "tasks"), { recursive: true });
		const oldFile = join(testDir, "agentic-workspace", "tasks", "keep");
		await writeFile(oldFile, "user data");
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		const defaultFile = join(testDir, ".agentic-workspace", "tasks", "keep");
		await writeFile(defaultFile, "default data");
		await writeFile(join(testDir, "agentic-workspace.config.yml"), 'project_name: "Test"\n');
		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.agenticWorkspaceDir).toBe(".agentic-workspace");
		expect(resolution.agenticWorkspacePath).toBe(join(await realpath(testDir), ".agentic-workspace"));
		expect(await readFile(oldFile, "utf8")).toBe("user data");
		expect(await readFile(defaultFile, "utf8")).toBe("default data");
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

	it("discovers the contracted default folder", async () => {
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), 'project_name: "Test"\n');

		const resolution = resolveAgenticWorkspaceDirectory(testDir);
		expect(resolution.source).toBe(".agentic-workspace");
		expect(resolution.configSource).toBe("folder");
		expect(resolution.agenticWorkspaceDir).toBe(".agentic-workspace");
		expect(resolution.configPath).toBe(join(testDir, ".agentic-workspace", "config.yml"));
	});

	it("accepts selected relative and absolute paths and rejects Git metadata spelling", () => {
		expect(normalizeProjectAgenticWorkspaceDirectory("../data")).toBe("../data");
		expect(normalizeProjectAgenticWorkspaceDirectory("/tmp/data")).toBe("/tmp/data");
		expect(normalizeProjectAgenticWorkspaceDirectory(String.raw`.git\workspace-data`)).toBeNull();
		expect(normalizeProjectAgenticWorkspaceDirectory("planning/data")).toBe("planning/data");
	});

	it("allows an explicitly selected external directory through a symlink", async () => {
		const outside = join(testDir, "..", `agentic-workspace-outside-${Date.now()}`);
		await mkdir(outside, { recursive: true });
		try {
			await Bun.write(
				join(testDir, "agentic-workspace.config.yml"),
				"project_name: Test\nagentic_workspace_directory: linked\n",
			);
			await symlink(outside, join(testDir, "linked"));
			expect(resolveAgenticWorkspaceDirectory(testDir).agenticWorkspacePath).toBe(await realpath(outside));
		} finally {
			await rm(outside, { recursive: true, force: true });
		}
	});

	it("resolves default, external, parent-relative and project-specific user storage", async () => {
		const root = await realpath(testDir);
		expect(resolveAgenticWorkspaceDirectoryFromRootConfig(testDir, undefined).agenticWorkspacePath).toBe(
			join(root, ".agentic-workspace"),
		);
		for (const path of [join(root, "..", "external"), "../external"])
			expect(resolveAgenticWorkspaceDirectoryFromRootConfig(testDir, path).agenticWorkspacePath).toBe(
				join(root, "..", "external"),
			);
		const hash = createHash("sha256").update(root).digest("hex").slice(0, 16);
		expect(resolveAgenticWorkspaceDirectoryFromRootConfig(testDir, "user:").agenticWorkspacePath).toBe(
			join(homedir(), ".agentic-workspace", hash),
		);
	});

	it("rejects canonical metadata aliases including a separate git-dir", async () => {
		const metadata = join(testDir, "metadata");
		expect(
			await Bun.spawn(["git", "init", "--separate-git-dir", metadata, testDir], { stdout: "ignore", stderr: "pipe" })
				.exited,
		).toBe(0);
		await symlink(metadata, join(testDir, "alias"));
		for (const path of [".git/data", "metadata/data", "alias/data", join(metadata, "data")])
			expect(() => resolveAgenticWorkspaceDirectoryFromRootConfig(testDir, path)).toThrow(
				/Git metadata|Invalid task-data/,
			);
	});
});
