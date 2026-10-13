import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";

const roots: string[] = [];
const summary = " exact text\n ";

afterEach(async () => {
	for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("historical flat task read contract", () => {
	it("refuses v2 and unversioned local flat records without changing their bytes", async () => {
		const root = await mkdtemp(join(tmpdir(), "legacy-task-git-"));
		roots.push(root);
		const taskDir = join(root, "backlog", "tasks");
		await mkdir(taskDir, { recursive: true });
		const v2Path = join(taskDir, "task-1 - Historical.md");
		const unversionedPath = join(taskDir, "task-2 - Older.md");
		const legacy = (id: string, version = "") =>
			`---\n${version}id: TASK-${id}\ntitle: Historical ${id}\nstatus: To Do\nassignee: []\ncreated_date: '2026-10-01'\nlabels: []\ndependencies: []\nagent_summary: ${JSON.stringify(summary)}\n---\n\n## Description\n\n<!-- SECTION:DESCRIPTION:BEGIN -->\nHistorical body\n<!-- SECTION:DESCRIPTION:END -->\n\nOpaque legacy body tail\n`;
		await writeFile(v2Path, legacy("1", "task_schema_version: 2\n"));
		await writeFile(unversionedPath, legacy("2"));
		const filesystem = new FileSystem(root);
		await filesystem.ensureBacklogStructure();
		await expect(filesystem.listTasks()).rejects.toThrow(/unsupported flat task record.*manually convert/i);
		await expect(filesystem.loadTask("TASK-1")).rejects.toThrow(/unsupported flat task record.*manually convert/i);
		expect(await readFile(v2Path, "utf8")).toBe(legacy("1", "task_schema_version: 2\n"));
		expect(await readFile(unversionedPath, "utf8")).toBe(legacy("2"));
		expect((await readdir(taskDir)).sort()).toEqual(["task-1 - Historical.md", "task-2 - Older.md"]);
		expect(await Bun.file(join(taskDir, "task-1", "task.md")).exists()).toBe(false);
	});
});
