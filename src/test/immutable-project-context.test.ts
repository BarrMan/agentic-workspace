import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { FileSystem } from "../storage/file-system.ts";
import { coreFileSystem, createUniqueTestDir, initializeFilesystemTestWorkspace, safeCleanup } from "./test-utils.ts";

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
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		};
		const rootConfig = (agenticWorkspaceDirectory: string) =>
			[
				`project_name: ${config.projectName}`,
				`agentic_workspace_directory: ${agenticWorkspaceDirectory}`,
				"statuses:",
				"  - To Do",
				"  - Done",
				"labels: []",
				"date_format: YYYY-MM-DD",
				"remote_operations: false",
				"check_active_branches: false",
			].join("\n");
		const initializer = new FileSystem(root, { agenticWorkspaceDirectory: "a", configLocation: "root" });
		await initializeFilesystemTestWorkspace(initializer);
		await initializer.saveTask(
			{
				id: "task-1",
				title: "A",
				done: false,
				status: "To Do",
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
			},
			{ create: true },
		);
		const replacement = new FileSystem(root, { agenticWorkspaceDirectory: "b", configLocation: "root" });
		await initializeFilesystemTestWorkspace(replacement);
		await replacement.saveTask(
			{
				id: "task-2",
				title: "B",
				done: false,
				status: "To Do",
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
			},
			{ create: true },
		);

		await Bun.write(join(root, "agentic-workspace.config.yml"), rootConfig("a"));
		const core = new Core(root);
		expect(coreFileSystem(core).agenticWorkspaceDir).toBe(join(root, "a"));
		expect((await core.tasks.query({})).map((task) => task.id)).toEqual(["TASK-1"]);
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

		const read = core.tasks.query({});
		await reading;
		await Bun.write(join(root, "agentic-workspace.config.yml"), rootConfig("b"));
		release?.();

		expect((await read).map((task) => task.id)).toEqual(["TASK-1"]);
		expect((await new Core(root).tasks.query({})).map((task) => task.id)).toEqual(["TASK-2"]);
	});

	it("keeps local task reads off branch discovery", async () => {
		const root = createUniqueTestDir("immutable-project-local-read");
		directories.push(root);
		const filesystem = new FileSystem(root);
		await initializeFilesystemTestWorkspace(filesystem);
		await filesystem.saveConfig({
			projectName: "Local read",
			statuses: ["To Do", "Done"],
			labels: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: true,
		});
		await filesystem.saveTask(
			{
				id: "task-1",
				title: "Local",
				done: false,
				status: "To Do",
				createdDate: "2026-01-01",
				labels: [],
				dependencies: [],
			},
			{ create: true },
		);
		const core = new Core(root);
		core.git.listRecentBranchTips = async () => {
			throw new Error("local read must not discover branches");
		};

		expect((await core.tasks.getTask("TASK-1", {}))?.title).toBe("Local");
		expect(await core.tasks.getTask("TASK-2", {})).toBeNull();
	});
});
