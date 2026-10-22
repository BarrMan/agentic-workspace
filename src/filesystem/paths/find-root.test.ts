import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { initGitRepo } from "../../test/test-utils.ts";
import { findAgenticWorkspaceRoot } from "./find-root.ts";

describe("findAgenticWorkspaceRoot", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `agentic-workspace-root-test-${Date.now()}`);
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	async function createWorktree(detached = false): Promise<{ main: string; linked: string }> {
		const main = join(testDir, "main");
		const linked = join(testDir, "linked");
		await mkdir(main);
		initGitRepo(main, "trunk");
		await $`git -c user.name=Test -c user.email=test@example.com commit --allow-empty -m initial`.cwd(main).quiet();
		await $`git worktree add ${detached ? "--detach" : "-b"} ${detached ? linked : "feature"} ${detached ? "HEAD" : linked}`
			.cwd(main)
			.quiet();
		return { main: await realpath(main), linked: await realpath(linked) };
	}

	async function addMarker(root: string): Promise<void> {
		await mkdir(join(root, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(root, ".agentic-workspace", "config.yml"), "project_name: Test\n");
	}

	it("prefers main tasks over a stale linked checkout", async () => {
		const { main, linked } = await createWorktree();
		await addMarker(main);
		await addMarker(linked);
		await writeFile(join(main, ".agentic-workspace", "tasks", "task-1.md"), "Main-only task");
		expect(await findAgenticWorkspaceRoot(linked)).toBe(main);
		expect(await findAgenticWorkspaceRoot(main)).toBe(main);
	});

	it("finds main from a nested linked directory with no local config", async () => {
		const { main, linked } = await createWorktree();
		await addMarker(main);
		const nested = join(linked, "src", "deep");
		await mkdir(nested, { recursive: true });
		expect(await findAgenticWorkspaceRoot(linked)).toBe(main);
		expect(await findAgenticWorkspaceRoot(nested)).toBe(main);
	});

	it("resolves a detached linked worktree to main", async () => {
		const { main, linked } = await createWorktree(true);
		await addMarker(main);
		expect(await findAgenticWorkspaceRoot(linked)).toBe(main);
	});

	it("falls back locally when main has no marker and returns null when neither does", async () => {
		const { linked } = await createWorktree();
		expect(await findAgenticWorkspaceRoot(linked)).toBeNull();
		await addMarker(linked);
		expect(await findAgenticWorkspaceRoot(linked)).toBe(linked);
	});

	it("maps monorepo packages and bounds the main search at its worktree root", async () => {
		const { main, linked } = await createWorktree();
		const mainPackage = join(main, "packages", "foo");
		const linkedPackage = join(linked, "packages", "foo");
		await addMarker(main);
		await addMarker(mainPackage);
		await addMarker(linkedPackage);
		const nested = join(linkedPackage, "src");
		await mkdir(nested);
		expect(await findAgenticWorkspaceRoot(nested)).toBe(mainPackage);
		await rm(join(linkedPackage, ".agentic-workspace"), { recursive: true });
		await rm(join(main, ".agentic-workspace"), { recursive: true });
		await addMarker(testDir);
		expect(await findAgenticWorkspaceRoot(nested)).toBe(mainPackage);
		await rm(join(mainPackage, ".agentic-workspace"), { recursive: true });
		expect(await findAgenticWorkspaceRoot(nested)).toBe(await realpath(testDir));
	});

	for (const marker of [".agentic-workspace/config.yml", "agentic-workspace.config.yml"]) {
		it(`redirects to main with the ${marker} marker`, async () => {
			const { main, linked } = await createWorktree();
			await mkdir(join(main, ".agentic-workspace"), { recursive: true });
			await writeFile(
				join(main, marker),
				'project_name: Test\nagentic_workspace_directory: "planning/agentic-workspace"\n',
			);
			expect(await findAgenticWorkspaceRoot(linked)).toBe(main);
		});
	}

	it("does not redirect linked worktrees to retired agentic-workspace.json-only projects", async () => {
		const { main, linked } = await createWorktree();
		await writeFile(join(main, "agentic-workspace.json"), "{}");
		await writeFile(join(linked, "agentic-workspace.json"), "{}");
		expect(await findAgenticWorkspaceRoot(main)).toBeNull();
		expect(await findAgenticWorkspaceRoot(linked)).toBeNull();
	});

	it("should find root when an explicitly selected agentic-workspace directory exists at start dir", async () => {
		await mkdir(join(testDir, "agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, "agentic-workspace", "config.yml"), "project_name: Test\n");
		await writeFile(
			join(testDir, "agentic-workspace.config.yml"),
			'project_name: Test\nagentic_workspace_directory: "agentic-workspace"\n',
		);

		const result = await findAgenticWorkspaceRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should find root when .agentic-workspace/ directory with config exists at start dir", async () => {
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), "project_name: Test\n");

		const result = await findAgenticWorkspaceRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should NOT find root for a bare default task-data directory without config", async () => {
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });

		const result = await findAgenticWorkspaceRoot(testDir);
		expect(result).toBeNull();
	});

	it("ignores retired agentic-workspace.json-only markers without changing the file", async () => {
		await writeFile(join(testDir, "agentic-workspace.json"), JSON.stringify({ name: "Test" }));

		const result = await findAgenticWorkspaceRoot(testDir);
		expect(result).toBeNull();
		expect(await Bun.file(join(testDir, "agentic-workspace.json")).json()).toEqual({ name: "Test" });
	});

	it("should find root from a subfolder", async () => {
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), "project_name: Test\n");

		const subfolder = join(testDir, "src", "components", "ui");
		await mkdir(subfolder, { recursive: true });

		const result = await findAgenticWorkspaceRoot(subfolder);
		expect(result).toBe(testDir);
	});

	it("should find root from deeply nested subfolder", async () => {
		await writeFile(
			join(testDir, "agentic-workspace.config.yml"),
			"project_name: Test\nagentic_workspace_directory: agentic-workspace\n",
		);

		// Create deeply nested subfolder
		const deepFolder = join(testDir, "a", "b", "c", "d", "e", "f");
		await mkdir(deepFolder, { recursive: true });

		const result = await findAgenticWorkspaceRoot(deepFolder);
		expect(result).toBe(testDir);
	});

	it("should return null when no agentic-workspace project found", async () => {
		// Create a folder with no agentic-workspace setup
		const emptyFolder = join(testDir, "empty");
		await mkdir(emptyFolder, { recursive: true });

		const result = await findAgenticWorkspaceRoot(emptyFolder);
		expect(result).toBeNull();
	});

	it("should prefer a default task-data directory over git root", async () => {
		initGitRepo(testDir);

		// Create the default task-data directory with config in a subfolder (simulating monorepo)
		const projectFolder = join(testDir, "packages", "my-project");
		await mkdir(join(projectFolder, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(projectFolder, ".agentic-workspace", "config.yml"), "project_name: Test\n");

		const searchDir = join(projectFolder, "src");
		await mkdir(searchDir, { recursive: true });

		const result = await findAgenticWorkspaceRoot(searchDir);
		expect(result).toBe(projectFolder);
	});

	it("should find git root with the default task-data directory as fallback", async () => {
		initGitRepo(testDir);
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), "project_name: Test\n");

		const subfolder = join(testDir, "packages", "lib");
		await mkdir(subfolder, { recursive: true });

		const result = await findAgenticWorkspaceRoot(subfolder);
		expect(result).toBe(testDir);
	});

	it("should not use git root if it has no agentic-workspace setup", async () => {
		// Initialize git repo WITHOUT agentic-workspace
		initGitRepo(testDir);

		// Create subfolder
		const subfolder = join(testDir, "src");
		await mkdir(subfolder, { recursive: true });

		const result = await findAgenticWorkspaceRoot(subfolder);
		expect(result).toBeNull();
	});

	it("should handle nested git repos - find nearest agentic-workspace root", async () => {
		initGitRepo(testDir);
		await mkdir(join(testDir, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yml"), "project_name: Outer\n");

		const innerProject = join(testDir, "packages", "inner");
		await mkdir(innerProject, { recursive: true });
		initGitRepo(innerProject);
		await mkdir(join(innerProject, ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(join(innerProject, ".agentic-workspace", "config.yml"), "project_name: Inner\n");

		const innerSrc = join(innerProject, "src");
		await mkdir(innerSrc, { recursive: true });

		const result = await findAgenticWorkspaceRoot(innerSrc);
		expect(result).toBe(innerProject);
	});

	it("should handle the default task-data directory with config.yaml", async () => {
		// Create task-data structure with config.yaml instead of tasks/
		await mkdir(join(testDir, ".agentic-workspace"), { recursive: true });
		await writeFile(join(testDir, ".agentic-workspace", "config.yaml"), "name: Test");

		const result = await findAgenticWorkspaceRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should find root when project root agentic-workspace.config.yml points to a custom agentic-workspace directory", async () => {
		await mkdir(join(testDir, "planning", "agentic-workspace", "tasks"), { recursive: true });
		await writeFile(
			join(testDir, "agentic-workspace.config.yml"),
			'project_name: "Test"\nagentic_workspace_directory: "planning/agentic-workspace"\n',
		);

		const result = await findAgenticWorkspaceRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should ignore placeholder agentic-workspace.config.yml files that do not look like AgenticWorkspace config", async () => {
		await writeFile(join(testDir, "agentic-workspace.config.yml"), 'name: "placeholder"\n');

		const result = await findAgenticWorkspaceRoot(testDir);
		expect(result).toBeNull();
	});

	it("should not stop at a nested custom task-data directory without a config marker", async () => {
		await mkdir(join(testDir, "planning", ".agentic-workspace", "tasks"), { recursive: true });
		await writeFile(
			join(testDir, "agentic-workspace.config.yml"),
			'project_name: "Test"\nagentic_workspace_directory: "planning/.agentic-workspace"\n',
		);

		const nestedStart = join(testDir, "planning", ".agentic-workspace", "tasks");
		const result = await findAgenticWorkspaceRoot(nestedStart);
		expect(result).toBe(testDir);
	});
});
