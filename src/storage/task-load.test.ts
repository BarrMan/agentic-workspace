import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import {
	coreFileSystem,
	createUniqueTestDir,
	initializeFilesystemTestProject,
	safeCleanup,
} from "../test/test-utils.ts";
import { Storage } from "./storage.ts";

let root: string;
let core: Core;

beforeEach(async () => {
	root = createUniqueTestDir("task-load");
	core = new Core(root);
	await initializeFilesystemTestProject(core, "Task Load");
});

afterEach(async () => await safeCleanup(root));

describe("task loading", () => {
	it("preserves stored assignee and priority values and task content without rewriting", async () => {
		const fs = coreFileSystem(core);
		const path = join(fs.tasksDir, "task-1", "task.md");
		const original =
			"---\ntask_schema_version: 3\nid: TASK-1\ntitle: TASK-1\nstatus: To Do\nassignee: '  @alice  '\npriority: '  VERY   HIGH '\ncustom_field: preserve\ncreated_date: 2026-10-01\nlabels: []\n---\n\nPreserve this body.\n";
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, original);

		const loaded = await new Storage(fs).loadTasks();

		expect(loaded).toMatchObject([{ id: "TASK-1", title: "TASK-1" }]);
		expect(await readFile(path, "utf8")).toBe(original);
	});
});
