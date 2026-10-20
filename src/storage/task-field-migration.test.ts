import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { coreFileSystem, createUniqueTestDir, safeCleanup } from "../test/test-utils.ts";
import { parseFrontmatter } from "./markdown/frontmatter.ts";
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

function task(id: string, fields: string): string {
	return `---\ntask_schema_version: 3\nid: ${id}\ntitle: ${id}\nstatus: To Do\nassignee: []\ncreated_date: 2026-10-01\nlabels: []\n${fields}---\n\nPreserve this body.\n`;
}

describe("task assignee and priority migration", () => {
	it("migrates all task states while preserving arrays, exact values, unknown fields, and bodies", async () => {
		const fs = coreFileSystem(core);
		const paths = [
			join(fs.tasksDir, "active", "task.md"),
			join(fs.completedDir, "completed", "task.md"),
			join(await fs.getArchiveTasksDir(), "archived", "task.md"),
		];
		const documents = [
			task("ACTIVE", "assignee: '  @alice  '\npriority: '  VERY   HIGH '\ncustom_field: preserve\n"),
			task("COMPLETED", "assignee: [bob, '@bob', bob]\npriority: 'P1 Urgent'\n"),
			task("ARCHIVED", "assignee: ''\npriority: 'Mystery   Tier'\n"),
		];
		await writeFile(fs.configFilePath, "priorities: ['P1 Urgent']\n");
		for (let i = 0; i < paths.length; i++) {
			await mkdir(join(paths[i]!, ".."), { recursive: true });
			await writeFile(paths[i]!, documents[i]!);
		}
		const storage = new Storage(fs);
		await storage.migrateTaskAssigneesAndPriority();
		const migrated = await Promise.all(paths.map((path) => readFile(path, "utf8")));
		expect(parseFrontmatter(migrated[0]!).data).toMatchObject({
			assignee: ["  @alice  "],
			priority: "very high",
			custom_field: "preserve",
		});
		expect(parseFrontmatter(migrated[1]!).data).toMatchObject({
			assignee: ["bob", "@bob", "bob"],
			priority: "p1 urgent",
		});
		expect(parseFrontmatter(migrated[2]!).data).toMatchObject({ assignee: [], priority: "mystery tier" });
		for (const content of migrated) expect(content).toContain("Preserve this body.");
	});

	it("reports partial writes and safely resumes on rerun", async () => {
		const fs = coreFileSystem(core);
		const paths = [join(fs.tasksDir, "a", "task.md"), join(fs.completedDir, "b", "task.md")];
		for (const [index, path] of paths.entries()) {
			await mkdir(join(path, ".."), { recursive: true });
			await writeFile(path, task(`TASK-${index}`, "assignee: alice\npriority: HIGH\n"));
		}
		const storage = new Storage(fs);
		const replace = storage["replaceMigrationFile"].bind(storage);
		let writes = 0;
		storage["replaceMigrationFile"] = async (path, content) => {
			if (++writes === 2) throw new Error("simulated write failure");
			await replace(path, content);
		};
		await expect(storage.migrateTaskAssigneesAndPriority()).rejects.toThrow("partially completed (1 files)");
		expect(parseFrontmatter(await readFile(paths[0]!, "utf8")).data.assignee).toEqual(["alice"]);
		expect(parseFrontmatter(await readFile(paths[1]!, "utf8")).data.assignee).toBe("alice");
		storage["replaceMigrationFile"] = replace;
		expect(await storage.migrateTaskAssigneesAndPriority()).toEqual({ migratedFiles: [paths[1]!] });
		expect(await storage.migrateTaskAssigneesAndPriority()).toEqual({ migratedFiles: [] });
	});

	it("converts previously readable null and non-string assignee entries", async () => {
		const fs = coreFileSystem(core);
		const nullPath = join(fs.tasksDir, "null-assignee", "task.md");
		const mixedPath = join(fs.tasksDir, "mixed-assignee", "task.md");
		for (const path of [nullPath, mixedPath]) await mkdir(dirname(path), { recursive: true });
		await writeFile(nullPath, task("NULL", "assignee: null\n"));
		await writeFile(mixedPath, task("MIXED", "assignee: [alice, 42, null, true]\n"));
		await new Storage(fs).migrateTaskAssigneesAndPriority();
		expect(parseFrontmatter(await readFile(nullPath, "utf8")).data.assignee).toEqual([]);
		expect(parseFrontmatter(await readFile(mixedPath, "utf8")).data.assignee).toEqual(["alice", "42", "null", "true"]);
	});

	it("does not acquire task locks for already-migrated records", async () => {
		const fs = coreFileSystem(core);
		const path = join(fs.tasksDir, "current", "task.md");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, task("CURRENT", "priority: high\n"));
		const storage = new Storage(fs);
		let lockAcquisitions = 0;
		storage.withTaskLock = async (_task, operation) => {
			lockAcquisitions++;
			return await operation();
		};
		await storage.migrateTaskAssigneesAndPriority();
		expect(lockAcquisitions).toBe(0);
	});

	it("leaves a task unchanged when a concurrent editor holds its lock", async () => {
		const fs = coreFileSystem(core);
		const path = join(fs.tasksDir, "locked", "task.md");
		const original = task("LOCKED", "assignee: alice\npriority: HIGH\n");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, original);
		const storage = new Storage(fs);
		await storage.withTaskLock({ id: "LOCKED", filePath: path }, async () => {
			await expect(storage.migrateTaskAssigneesAndPriority()).resolves.toEqual({ migratedFiles: [] });
			expect(await readFile(path, "utf8")).toBe(original);
		});
	});

	it("allows concurrent startups to migrate the same legacy tasks", async () => {
		const fs = coreFileSystem(core);
		const paths = ["one", "two", "three"].map((id) => join(fs.tasksDir, id, "task.md"));
		for (const [index, path] of paths.entries()) {
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, task(`TASK-${index}`, "assignee: alice\npriority: HIGH\n"));
		}
		const results = await Promise.all(
			Array.from({ length: 8 }, () => new Storage(fs).migrateTaskAssigneesAndPriority()),
		);
		expect(results).toHaveLength(8);
		for (const path of paths) {
			expect(parseFrontmatter(await readFile(path, "utf8")).data).toMatchObject({
				assignee: ["alice"],
				priority: "high",
			});
		}
	});

	it("skips malformed archived frontmatter and migrates healthy tasks", async () => {
		const fs = coreFileSystem(core);
		const healthy = join(fs.tasksDir, "healthy", "task.md");
		const malformed = join(await fs.getArchiveTasksDir(), "broken", "task.md");
		await mkdir(dirname(healthy), { recursive: true });
		await mkdir(dirname(malformed), { recursive: true });
		await writeFile(healthy, task("HEALTHY", "assignee: alice\n"));
		await writeFile(malformed, "---\nid: BROKEN\nassignee: [unterminated\n---\n");
		await expect(new Storage(fs).migrateTaskAssigneesAndPriority()).resolves.toMatchObject({
			migratedFiles: [healthy],
		});
		expect(await readFile(malformed, "utf8")).toContain("[unterminated");
		expect(parseFrontmatter(await readFile(healthy, "utf8")).data.assignee).toEqual(["alice"]);
	});

	it("gates task reads on both startup migrations", async () => {
		const fs = coreFileSystem(core);
		const path = join(fs.tasksDir, "task-a", "task.md");
		await mkdir(join(path, ".."), { recursive: true });
		await writeFile(path, task("TASK-A", "assignee: alice\npriority: HIGH\n"));
		const storage = new Storage(fs);
		const migration = storage.startAgentPresetCommandMigration();
		await migration;
		await expect(storage.loadTasks()).resolves.toHaveLength(1);
	});
});
