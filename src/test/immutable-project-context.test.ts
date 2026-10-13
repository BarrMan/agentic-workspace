import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { FileSystem } from "../file-system/operations.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map(safeCleanup));
});

describe("immutable Core project binding", () => {
	it("keeps an in-flight read on its initial backlog after root configuration selects another one", async () => {
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
		const rootConfig = (backlogDirectory: string) =>
			[
				`project_name: ${config.projectName}`,
				`backlog_directory: ${backlogDirectory}`,
				"statuses:",
				"  - To Do",
				"  - Done",
				"labels: []",
				"milestones: []",
				"date_format: YYYY-MM-DD",
				"remote_operations: false",
				"check_active_branches: false",
			].join("\n");
		await Bun.write(join(root, "backlog.config.yml"), rootConfig("a"));
		const initializer = new FileSystem(root, { backlogDirectory: "a", configLocation: "root" });
		await initializer.ensureBacklogStructure();
		await initializer.saveTask({
			id: "task-1",
			title: "A",
			status: "To Do",
			assignee: [],
			createdDate: "2026-01-01",
			labels: [],
			dependencies: [],
		});
		const replacement = new FileSystem(root, { backlogDirectory: "b", configLocation: "root" });
		await replacement.ensureBacklogStructure();
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
		expect(core.filesystem.backlogDir).toBe(join(root, "a"));
		expect((await core.queryTasks()).map((task) => task.id)).toEqual(["TASK-1"]);
		const originalListTasks = core.filesystem.listTasks.bind(core.filesystem);
		let release: (() => void) | undefined;
		const paused = new Promise<void>((resolve) => {
			release = resolve;
		});
		let started: (() => void) | undefined;
		const reading = new Promise<void>((resolve) => {
			started = resolve;
		});
		core.filesystem.listTasks = async () => {
			started?.();
			await paused;
			return await originalListTasks();
		};

		const read = core.queryTasks();
		await reading;
		await Bun.write(join(root, "backlog.config.yml"), rootConfig("b"));
		release?.();

		expect((await read).map((task) => task.id)).toEqual(["TASK-1"]);
		expect((await new Core(root).queryTasks()).map((task) => task.id)).toEqual(["TASK-2"]);
	});

	it("keeps local task reads off branch discovery", async () => {
		const root = createUniqueTestDir("immutable-project-local-read");
		directories.push(root);
		const filesystem = new FileSystem(root);
		await filesystem.ensureBacklogStructure();
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
