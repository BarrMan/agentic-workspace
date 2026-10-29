import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { getLabels, getStatuses, getTaskIds } from "../cli/completions/data-providers.ts";
import { CliRuntime } from "../cli/runtime.ts";
import { Core, createRuntimeCore } from "../controller/agentic-workspace.ts";
import { AGENTIC_WORKSPACE_CWD_ENV, resolveRuntimeCwd } from "../lib/runtime-cwd.ts";
import { Storage } from "../storage/storage.ts";
import { coreFileSystem, initGitRepo, initializeFilesystemTestProject } from "./test-utils.ts";

describe("resolveRuntimeCwd", () => {
	let testDir: string;
	let originalCwd: string;
	let originalAgenticWorkspaceCwd: string | undefined;

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), "agentic-workspace-runtime-cwd-"));
		originalCwd = process.cwd();
		originalAgenticWorkspaceCwd = process.env[AGENTIC_WORKSPACE_CWD_ENV];
		delete process.env[AGENTIC_WORKSPACE_CWD_ENV];
		process.chdir(testDir);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		if (originalAgenticWorkspaceCwd === undefined) {
			delete process.env[AGENTIC_WORKSPACE_CWD_ENV];
		} else {
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = originalAgenticWorkspaceCwd;
		}
		await rm(testDir, { recursive: true, force: true });
	});

	async function expectCanonicalPath(actualPath: string, expectedPath: string): Promise<void> {
		const [actualCanonical, expectedCanonical] = await Promise.all([realpath(actualPath), realpath(expectedPath)]);
		expect(actualCanonical).toBe(expectedCanonical);
	}

	it("uses process.cwd() when no override is provided", async () => {
		const result = await resolveRuntimeCwd();

		await expectCanonicalPath(result.cwd, testDir);
		expect(result.source).toBe("process");
	});

	it("uses AGENTIC_WORKSPACE_CWD when environment override is provided", async () => {
		const nestedDir = join(testDir, "workspace", "project");
		await mkdir(nestedDir, { recursive: true });
		process.env[AGENTIC_WORKSPACE_CWD_ENV] = nestedDir;

		const result = await resolveRuntimeCwd();

		await expectCanonicalPath(result.cwd, nestedDir);
		expect(result.source).toBe("env");
		expect(result.sourceLabel).toBe(AGENTIC_WORKSPACE_CWD_ENV);
	});

	it("keeps raw AGENTIC_WORKSPACE_CWD linked while CliRuntime discovers the main project", async () => {
		const main = join(testDir, "main");
		const linked = join(testDir, "linked");
		await mkdir(main);
		initGitRepo(main);
		await $`git -c user.name=Test -c user.email=test@example.com commit --allow-empty -m initial`.cwd(main).quiet();
		await $`git worktree add -b feature ${linked}`.cwd(main).quiet();
		await writeFile(
			join(main, "agentic-workspace.config.yml"),
			"project_name: Test\nagentic_workspace_directory: agentic-workspace\n",
		);
		process.env[AGENTIC_WORKSPACE_CWD_ENV] = linked;
		await expectCanonicalPath((await resolveRuntimeCwd()).cwd, linked);
		const runtime = new CliRuntime();
		await expectCanonicalPath(await runtime.cwd(), linked);
		await expectCanonicalPath((await runtime.findProjectRoot()) as string, main);
	});

	it("gives --cwd option precedence over AGENTIC_WORKSPACE_CWD", async () => {
		const envDir = join(testDir, "env-dir");
		const optionDir = join(testDir, "option-dir");
		await mkdir(envDir, { recursive: true });
		await mkdir(optionDir, { recursive: true });
		process.env[AGENTIC_WORKSPACE_CWD_ENV] = envDir;

		const result = await resolveRuntimeCwd({ cwd: optionDir });

		await expectCanonicalPath(result.cwd, optionDir);
		expect(result.source).toBe("option");
		expect(result.sourceLabel).toBe("--cwd");
	});

	it("supports relative override paths", async () => {
		await mkdir(join(testDir, "relative", "path"), { recursive: true });

		const result = await resolveRuntimeCwd({ cwd: "./relative/path" });

		await expectCanonicalPath(result.cwd, join(testDir, "relative", "path"));
		expect(result.source).toBe("option");
	});

	it("throws when override path is invalid", async () => {
		process.env[AGENTIC_WORKSPACE_CWD_ENV] = join(testDir, "missing");

		await expect(resolveRuntimeCwd()).rejects.toThrow(`Invalid directory from ${AGENTIC_WORKSPACE_CWD_ENV}`);
	});

	describe("createRuntimeCore", () => {
		it("binds the Core to process.cwd() when no override is provided", async () => {
			const core = await createRuntimeCore();

			await expectCanonicalPath(coreFileSystem(core).rootDir, testDir);
		});

		it("binds the Core to AGENTIC_WORKSPACE_CWD when the override is provided", async () => {
			const projectDir = join(testDir, "workspace", "project");
			await mkdir(projectDir, { recursive: true });
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = projectDir;

			const core = await createRuntimeCore();

			await expectCanonicalPath(coreFileSystem(core).rootDir, projectDir);
		});

		it("ascends to the project root when AGENTIC_WORKSPACE_CWD points at a subdirectory", async () => {
			const projectDir = join(testDir, "project");
			const nestedDir = join(projectDir, "packages", "web", "src");
			await initializeFilesystemTestProject(new Core(projectDir), "Nested Override Project");
			await mkdir(nestedDir, { recursive: true });
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = nestedDir;

			const core = await createRuntimeCore();

			await expectCanonicalPath(coreFileSystem(core).rootDir, projectDir);
		});

		it("ascends to the project root from a subdirectory of process.cwd()", async () => {
			const projectDir = join(testDir, "project");
			const nestedDir = join(projectDir, "docs", "guides");
			await initializeFilesystemTestProject(new Core(projectDir), "Nested Cwd Project");
			await mkdir(nestedDir, { recursive: true });
			process.chdir(nestedDir);

			const core = await createRuntimeCore();

			await expectCanonicalPath(coreFileSystem(core).rootDir, projectDir);
		});

		it("stays on the resolved directory when no project is found", async () => {
			const nestedDir = join(testDir, "no-project", "nested");
			await mkdir(nestedDir, { recursive: true });
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = nestedDir;

			const core = await createRuntimeCore();

			await expectCanonicalPath(coreFileSystem(core).rootDir, nestedDir);
		});

		it("fails closed when AGENTIC_WORKSPACE_CWD points at a missing directory", async () => {
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = join(testDir, "missing");

			await expect(createRuntimeCore()).rejects.toThrow(`Invalid directory from ${AGENTIC_WORKSPACE_CWD_ENV}`);
		});
	});

	describe("shell completion data providers", () => {
		it("reads the parent project when AGENTIC_WORKSPACE_CWD points at a subdirectory", async () => {
			const projectDir = join(testDir, "project");
			const nestedDir = join(projectDir, "packages", "cli");
			const core = new Core(projectDir);
			await initializeFilesystemTestProject(core, "Completion Project");
			await mkdir(nestedDir, { recursive: true });
			await core.tasks.create({ title: "Completion task", labels: ["ui"] });
			await new Storage(coreFileSystem(core)).createTask({
				id: "TASK-2",
				title: "Completion variant",
				status: "To Do",
				done: false,
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
				rawContent: "",
			});
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = nestedDir;

			expect(await getTaskIds()).toEqual(["TASK-1", "TASK-2"]);
			expect(await getLabels()).toEqual(["ui"]);
		});

		it("degrades to static fallbacks when no project is found", async () => {
			const nestedDir = join(testDir, "no-project", "nested");
			await mkdir(nestedDir, { recursive: true });
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = nestedDir;

			expect(await getTaskIds()).toEqual([]);
			expect(await getStatuses()).toEqual(["To Do", "In Progress", "Done"]);
		});

		it("degrades to static fallbacks when AGENTIC_WORKSPACE_CWD is invalid", async () => {
			process.env[AGENTIC_WORKSPACE_CWD_ENV] = join(testDir, "missing");

			expect(await getTaskIds()).toEqual([]);
			expect(await getStatuses()).toEqual(["To Do", "In Progress", "Done"]);
		});
	});
});
