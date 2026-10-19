import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { FileSystem } from "../storage/file-system.ts";
import { coreFileSystem, createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map(safeCleanup));
});

describe("immutable Core project binding", () => {
	it("keeps an in-flight read on its initial agentic-workspace after root configuration selects another one", async () => {
		const root = createUniqueTestDir("immutable-project-context");
		directories.push(root);
		const config = {
			projectName: "Immutable context",
			statuses: ["To Do", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			checkActiveBranches: false,
		};
		const rootConfig = (agenticWorkspaceDirectory: string) =>
			[
				`project_name: ${config.projectName}`,
				`agentic_workspace_directory: ${agenticWorkspaceDirectory}`,
				"statuses:",
				"  - To Do",
				"  - Done",
				"labels: []",
				"milestones: []",
				"date_format: YYYY-MM-DD",
				"remote_operations: false",
				"check_active_branches: false",
			].join("\n");
		await Bun.write(join(root, "agentic-workspace.config.yml"), rootConfig("a"));
		const initializer = new FileSystem(root, { agenticWorkspaceDirectory: "a", configLocation: "root" });
		await initializer.ensureAgenticWorkspaceStructure();
		await initializer.saveTask({
			id: "task-1",
			title: "A",
			status: "To Do",
			assignee: [],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
		});
		const replacement = new FileSystem(root, { agenticWorkspaceDirectory: "b", configLocation: "root" });
		await replacement.ensureAgenticWorkspaceStructure();
		await replacement.saveTask({
			id: "task-2",
			title: "B",
			status: "To Do",
			assignee: [],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
		});

		const core = new Core(root);
		expect(coreFileSystem(core).agenticWorkspaceDir).toBe(join(root, "a"));
		expect((await core.queryTasks()).map((task) => task.id)).toEqual(["TASK-1"]);
		const originalListTasks = coreFileSystem(core).listTasks.bind(coreFileSystem(core));
		let release: (() => void) | undefined;
		const paused = new Promise<void>((resolve) => {
			release = resolve;
		});
		let started: (() => void) | undefined;
		const reading = new Promise<void>((resolve) => {
			started = resolve;
		});
		coreFileSystem(core).listTasks = async () => {
			started?.();
			await paused;
			return await originalListTasks();
		};

		const read = core.queryTasks();
		await reading;
		await Bun.write(join(root, "agentic-workspace.config.yml"), rootConfig("b"));
		release?.();

		expect((await read).map((task) => task.id)).toEqual(["TASK-1"]);
		expect((await new Core(root).queryTasks()).map((task) => task.id)).toEqual(["TASK-2"]);
	});

	it("keeps local task reads off branch discovery", async () => {
		const root = createUniqueTestDir("immutable-project-local-read");
		directories.push(root);
		const filesystem = new FileSystem(root);
		await filesystem.ensureAgenticWorkspaceStructure();
		await filesystem.saveConfig({
			projectName: "Local read",
			statuses: ["To Do", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: true,
			checkActiveBranches: true,
		});
		await filesystem.saveTask({
			id: "task-1",
			title: "Local",
			status: "To Do",
			assignee: [],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
		});
		const core = new Core(root);
		core.git.listRecentBranchTips = async () => {
			throw new Error("local read must not discover branches");
		};

		expect((await core.getTask("TASK-1", { includeCrossBranch: false }))?.title).toBe("Local");
		expect(await core.getTask("TASK-2", { includeCrossBranch: false })).toBeNull();
	});
});
