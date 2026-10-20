import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { coreFileSystem, createUniqueTestDir, safeCleanup } from "../test/test-utils.ts";
import { Storage } from "./storage.ts";

let root: string;
let core: Core;

beforeEach(async () => {
	root = createUniqueTestDir("task-field-migration");
	core = new Core(root);
	await coreFileSystem(core).ensureAgenticWorkspaceStructure();
	await core.getConfig();
});

afterEach(async () => await safeCleanup(root));

describe("task field startup migration", () => {
	it("preserves stored assignee and priority values and task content", async () => {
		const fs = coreFileSystem(core);
		const path = join(fs.tasksDir, "task-a", "task.md");
		const original =
			"---\ntask_schema_version: 3\nid: TASK-A\ntitle: TASK-A\nstatus: To Do\nassignee: '  @alice  '\npriority: '  VERY   HIGH '\ncustom_field: preserve\ncreated_date: 2026-10-01\nlabels: []\n---\n\nPreserve this body.\n";
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, original);

		const storage = new Storage(fs);
		await storage.startAgentPresetCommandMigration();
		await storage.loadTasks();

		expect(await readFile(path, "utf8")).toBe(original);
	});
});
