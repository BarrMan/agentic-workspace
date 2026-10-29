import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import {
	coreFileSystem,
	createUniqueTestDir,
	initializeFilesystemTestProject,
	initializeFilesystemTestWorkspace,
	safeCleanup,
} from "./test-utils.ts";

let TEST_DIR: string;

describe("Cleanup functionality", () => {
	let core: Core;

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cleanup");
		core = new Core(TEST_DIR);
		await initializeFilesystemTestProject(core, "Cleanup Test Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("should create completed directory in agentic-workspace structure", async () => {
		await initializeFilesystemTestWorkspace(coreFileSystem(core));
		expect(coreFileSystem(core).completedDir).toBe(join(coreFileSystem(core).agenticWorkspaceDir, "completed"));
	});

	it("should return no completed tasks when the directory is empty", async () => {
		expect(await coreFileSystem(core).listCompletedTasks()).toHaveLength(0);
	});
});
