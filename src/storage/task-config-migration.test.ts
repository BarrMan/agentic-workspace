import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createUniqueTestDir, safeCleanup } from "../test/test-utils.ts";
import { migrateTaskAndConfigFiles, type TaskConfigMigrationOptions } from "./task-config-migration.ts";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
});

async function setup() {
	const root = createUniqueTestDir("task-config-migration");
	roots.push(root);
	const tasks = [join(root, "tasks"), join(root, "completed"), join(root, "archive", "tasks")] as const;
	for (const directory of tasks) await mkdir(directory, { recursive: true });
	return {
		root,
		tasks,
		options: {
			tasksDirectories: tasks,
			rootConfigPath: join(root, "root.yml"),
			projectConfigPath: join(root, "project.yml"),
			manifestPath: join(root, "manifest.json"),
		} satisfies TaskConfigMigrationOptions,
	};
}

describe("standalone task/config migration", () => {
	it("preserves opaque task content while removing assignee and mapping priority", async () => {
		const options = await setup();
		const path = join(options.tasks[0], "one", "task.md");
		await mkdir(dirname(path), { recursive: true });
		const original =
			"---\nid: ONE\nproject: alpha\nassignee: alice\npriority: 'urgent'\ncustom: keep\ndefault_assignee: task-owner\ndate_format: yyyy-mm-dd\napprovals: [yes]\ncreated_date: 2020-01-01\n---\n\nOpaque body.\n";
		await writeFile(path, original);
		await writeFile(
			options.options.projectConfigPath,
			"priorities: [Urgent, Normal]\ndefault_assignee: alice\ncustom: untouched\ndate_format: 'yyyy-mm-dd'\n",
		);
		const result = await migrateTaskAndConfigFiles({
			...options.options,
			priorityLabelsByProject: { alpha: ["Urgent", "Normal"] },
		});
		const migrated = await readFile(path, "utf8");
		expect(migrated).not.toMatch(/^assignee:/m);
		expect(migrated).toContain('priority: "Urgent"');
		expect(migrated).toContain("default_assignee: task-owner");
		expect(migrated).toContain("date_format: yyyy-mm-dd");
		expect(migrated).toContain("Opaque body.");
		expect(migrated).toContain("approvals: [yes]");
		const config = await readFile(options.options.projectConfigPath, "utf8");
		expect(config).not.toContain("default_assignee:");
		expect(config).toContain('date_format: "yyyy-MM-dd"');
		expect(result.migratedFiles).toContain(path);
		expect((await migrateTaskAndConfigFiles(options.options)).migratedFiles).toEqual([]);
	});

	it("preserves task-owned custom fields byte-for-byte and reports prototype-like config values", async () => {
		const options = await setup();
		const taskPath = join(options.tasks[0], "one", "task.md");
		await mkdir(dirname(taskPath), { recursive: true });
		const task = "---\nid: ONE\ndate_format: toString\ndefault_assignee: constructor\n---\nOpaque body.\n";
		await writeFile(taskPath, task);
		const rootConfig = "date_format: constructor\n";
		const projectConfig = "date_format: toString\n";
		await writeFile(options.options.rootConfigPath, rootConfig);
		await writeFile(options.options.projectConfigPath, projectConfig);

		const result = await migrateTaskAndConfigFiles(options.options);

		expect(await readFile(taskPath, "utf8")).toBe(task);
		expect(await readFile(options.options.rootConfigPath, "utf8")).toBe(rootConfig);
		expect(await readFile(options.options.projectConfigPath, "utf8")).toBe(projectConfig);
		expect(result.issues.filter(({ field }) => field === "date_format")).toHaveLength(2);
	});

	it("converts supported date-only legacy formats and reports mixed time formats unchanged", async () => {
		const options = await setup();
		await writeFile(options.options.rootConfigPath, "date_format: yyyy-mm-dd\n");
		await writeFile(options.options.projectConfigPath, "date_format: 'yyyy-mm-ddThh:mm:ss'\n");
		const result = await migrateTaskAndConfigFiles(options.options);

		expect(await readFile(options.options.rootConfigPath, "utf8")).toContain('date_format: "yyyy-MM-dd"');
		expect(await readFile(options.options.projectConfigPath, "utf8")).toBe("date_format: 'yyyy-mm-ddThh:mm:ss'\n");
		expect(result.issues.filter(({ field }) => field === "date_format")).toHaveLength(1);
	});

	it("reports unsupported date formats and leaves their fields unchanged", async () => {
		const options = await setup();
		const original = "date_format: 'yyyy-mm-dd hh:mm:ss Z'\n";
		await writeFile(options.options.rootConfigPath, original);
		await writeFile(options.options.projectConfigPath, "date_format: 'yyyy-mm-dd at hh:mm'\n");

		const result = await migrateTaskAndConfigFiles(options.options);

		expect(await readFile(options.options.rootConfigPath, "utf8")).toBe(original);
		expect(await readFile(options.options.projectConfigPath, "utf8")).toBe("date_format: 'yyyy-mm-dd at hh:mm'\n");
		expect(result.issues.filter(({ field }) => field === "date_format")).toHaveLength(2);
		expect(result.issues.filter(({ field }) => field === "date_format").map(({ reason }) => reason)).toEqual([
			"unsupported or ambiguous legacy date format",
			"unsupported or ambiguous legacy date format",
		]);
	});

	it("reports unmatched and ambiguous values without altering those fields", async () => {
		const options = await setup();
		const path = join(options.tasks[1], "one", "task.md");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, "---\nid: ONE\nproject: alpha\npriority: urgent\nassignee: bob\n---\nbody\n");
		const migration = { ...options.options, priorityLabelsByProject: { alpha: ["Urgent", "urgent"] } };
		const result = await migrateTaskAndConfigFiles(migration);
		expect(result.issues).toContainEqual(
			expect.objectContaining({ field: "priority", reason: "ambiguous configured label" }),
		);
		expect(await readFile(path, "utf8")).toContain("priority: urgent");
	});

	it("writes independent migrations concurrently", async () => {
		const first = await setup();
		const second = await setup();
		await Promise.all([
			writeFile(first.options.rootConfigPath, "date_format: yyyy-mm-dd\n"),
			writeFile(second.options.rootConfigPath, "date_format: yyyy-mm-dd\n"),
		]);

		const results = await Promise.all([
			migrateTaskAndConfigFiles(first.options),
			migrateTaskAndConfigFiles(second.options),
		]);

		expect(results.map(({ migratedFiles }) => migratedFiles)).toEqual([
			[first.options.rootConfigPath],
			[second.options.rootConfigPath],
		]);
	});
});
