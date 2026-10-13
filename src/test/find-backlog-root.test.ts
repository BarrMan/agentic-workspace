import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { findBacklogRoot } from "../utils/find-backlog-root.ts";
import { initGitRepo } from "./test-utils.ts";

describe("findBacklogRoot", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = join(tmpdir(), `backlog-root-test-${Date.now()}`);
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
		await mkdir(join(root, "backlog", "tasks"), { recursive: true });
		await writeFile(join(root, "backlog", "config.yml"), "project_name: Test\n");
	}

	it("prefers main tasks over a stale linked checkout", async () => {
		const { main, linked } = await createWorktree();
		await addMarker(main);
		await addMarker(linked);
		await writeFile(join(main, "backlog", "tasks", "task-1.md"), "Main-only task");
		expect(await findBacklogRoot(linked)).toBe(main);
		expect(await findBacklogRoot(main)).toBe(main);
	});

	it("finds main from a nested linked directory with no local config", async () => {
		const { main, linked } = await createWorktree();
		await addMarker(main);
		const nested = join(linked, "src", "deep");
		await mkdir(nested, { recursive: true });
		expect(await findBacklogRoot(linked)).toBe(main);
		expect(await findBacklogRoot(nested)).toBe(main);
	});

	it("resolves a detached linked worktree to main", async () => {
		const { main, linked } = await createWorktree(true);
		await addMarker(main);
		expect(await findBacklogRoot(linked)).toBe(main);
	});

	it("falls back locally when main has no marker and returns null when neither does", async () => {
		const { linked } = await createWorktree();
		expect(await findBacklogRoot(linked)).toBeNull();
		await addMarker(linked);
		expect(await findBacklogRoot(linked)).toBe(linked);
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
		expect(await findBacklogRoot(nested)).toBe(mainPackage);
		await rm(join(linkedPackage, "backlog"), { recursive: true });
		await rm(join(main, "backlog"), { recursive: true });
		await addMarker(testDir);
		expect(await findBacklogRoot(nested)).toBe(mainPackage);
		await rm(join(mainPackage, "backlog"), { recursive: true });
		expect(await findBacklogRoot(nested)).toBe(await realpath(testDir));
	});

	for (const marker of [".backlog/config.yml", "backlog.config.yml"]) {
		it(`redirects to main with the ${marker} marker`, async () => {
			const { main, linked } = await createWorktree();
			await mkdir(join(main, ".backlog"), { recursive: true });
			await writeFile(join(main, marker), 'project_name: Test\nbacklog_directory: "planning/backlog"\n');
			expect(await findBacklogRoot(linked)).toBe(main);
		});
	}

	it("does not redirect linked worktrees to retired backlog.json-only projects", async () => {
		const { main, linked } = await createWorktree();
		await writeFile(join(main, "backlog.json"), "{}");
		await writeFile(join(linked, "backlog.json"), "{}");
		expect(await findBacklogRoot(main)).toBeNull();
		expect(await findBacklogRoot(linked)).toBeNull();
	});

	it("should find root when backlog/ directory with config exists at start dir", async () => {
		await mkdir(join(testDir, "backlog", "tasks"), { recursive: true });
		await writeFile(join(testDir, "backlog", "config.yml"), "project_name: Test\n");

		const result = await findBacklogRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should find root when .backlog/ directory with config exists at start dir", async () => {
		await mkdir(join(testDir, ".backlog", "tasks"), { recursive: true });
		await writeFile(join(testDir, ".backlog", "config.yml"), "project_name: Test\n");

		const result = await findBacklogRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should NOT find root for bare backlog/ directory without config", async () => {
		await mkdir(join(testDir, "backlog", "tasks"), { recursive: true });

		const result = await findBacklogRoot(testDir);
		expect(result).toBeNull();
	});

	it("ignores retired backlog.json-only markers without changing the file", async () => {
		await writeFile(join(testDir, "backlog.json"), JSON.stringify({ name: "Test" }));

		const result = await findBacklogRoot(testDir);
		expect(result).toBeNull();
		expect(await Bun.file(join(testDir, "backlog.json")).json()).toEqual({ name: "Test" });
	});

	it("should find root from a subfolder", async () => {
		await mkdir(join(testDir, "backlog", "tasks"), { recursive: true });
		await writeFile(join(testDir, "backlog", "config.yml"), "project_name: Test\n");

		const subfolder = join(testDir, "src", "components", "ui");
		await mkdir(subfolder, { recursive: true });

		const result = await findBacklogRoot(subfolder);
		expect(result).toBe(testDir);
	});

	it("should find root from deeply nested subfolder", async () => {
		await writeFile(join(testDir, "backlog.config.yml"), "project_name: Test\nbacklog_directory: backlog\n");

		// Create deeply nested subfolder
		const deepFolder = join(testDir, "a", "b", "c", "d", "e", "f");
		await mkdir(deepFolder, { recursive: true });

		const result = await findBacklogRoot(deepFolder);
		expect(result).toBe(testDir);
	});

	it("should return null when no backlog project found", async () => {
		// Create a folder with no backlog setup
		const emptyFolder = join(testDir, "empty");
		await mkdir(emptyFolder, { recursive: true });

		const result = await findBacklogRoot(emptyFolder);
		expect(result).toBeNull();
	});

	it("should prefer backlog/ directory over git root", async () => {
		initGitRepo(testDir);

		// Create backlog with config in a subfolder (simulating monorepo)
		const projectFolder = join(testDir, "packages", "my-project");
		await mkdir(join(projectFolder, "backlog", "tasks"), { recursive: true });
		await writeFile(join(projectFolder, "backlog", "config.yml"), "project_name: Test\n");

		const searchDir = join(projectFolder, "src");
		await mkdir(searchDir, { recursive: true });

		const result = await findBacklogRoot(searchDir);
		expect(result).toBe(projectFolder);
	});

	it("should find git root with backlog as fallback", async () => {
		initGitRepo(testDir);
		await mkdir(join(testDir, "backlog", "tasks"), { recursive: true });
		await writeFile(join(testDir, "backlog", "config.yml"), "project_name: Test\n");

		const subfolder = join(testDir, "packages", "lib");
		await mkdir(subfolder, { recursive: true });

		const result = await findBacklogRoot(subfolder);
		expect(result).toBe(testDir);
	});

	it("should not use git root if it has no backlog setup", async () => {
		// Initialize git repo WITHOUT backlog
		initGitRepo(testDir);

		// Create subfolder
		const subfolder = join(testDir, "src");
		await mkdir(subfolder, { recursive: true });

		const result = await findBacklogRoot(subfolder);
		expect(result).toBeNull();
	});

	it("should handle nested git repos - find nearest backlog root", async () => {
		initGitRepo(testDir);
		await mkdir(join(testDir, "backlog", "tasks"), { recursive: true });
		await writeFile(join(testDir, "backlog", "config.yml"), "project_name: Outer\n");

		const innerProject = join(testDir, "packages", "inner");
		await mkdir(innerProject, { recursive: true });
		initGitRepo(innerProject);
		await mkdir(join(innerProject, "backlog", "tasks"), { recursive: true });
		await writeFile(join(innerProject, "backlog", "config.yml"), "project_name: Inner\n");

		const innerSrc = join(innerProject, "src");
		await mkdir(innerSrc, { recursive: true });

		const result = await findBacklogRoot(innerSrc);
		expect(result).toBe(innerProject);
	});

	it("should handle backlog/ with config.yaml", async () => {
		// Create backlog structure with config.yaml instead of tasks/
		await mkdir(join(testDir, "backlog"), { recursive: true });
		await writeFile(join(testDir, "backlog", "config.yaml"), "name: Test");

		const result = await findBacklogRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should find root when project root backlog.config.yml points to a custom backlog directory", async () => {
		await mkdir(join(testDir, "planning", "backlog", "tasks"), { recursive: true });
		await writeFile(
			join(testDir, "backlog.config.yml"),
			'project_name: "Test"\nbacklog_directory: "planning/backlog"\n',
		);

		const result = await findBacklogRoot(testDir);
		expect(result).toBe(testDir);
	});

	it("should ignore placeholder backlog.config.yml files that do not look like Backlog config", async () => {
		await writeFile(join(testDir, "backlog.config.yml"), 'name: "placeholder"\n');

		const result = await findBacklogRoot(testDir);
		expect(result).toBeNull();
	});

	it("should not stop at nested custom backlog directories without a config marker", async () => {
		await mkdir(join(testDir, "planning", "backlog", "tasks"), { recursive: true });
		await writeFile(
			join(testDir, "backlog.config.yml"),
			'project_name: "Test"\nbacklog_directory: "planning/backlog"\n',
		);

		const nestedStart = join(testDir, "planning", "backlog", "tasks");
		const result = await findBacklogRoot(nestedStart);
		expect(result).toBe(testDir);
	});
});
