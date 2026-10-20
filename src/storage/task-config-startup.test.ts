import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createUniqueTestDir, safeCleanup } from "../test/test-utils.ts";
import { FileSystem } from "./file-system.ts";
import { resolveProjectStateRoot } from "./session-store.ts";
import { Storage } from "./storage.ts";

const roots: string[] = [];
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
afterEach(async () => {
	for (const root of roots.splice(0)) await safeCleanup(root);
	if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
});

describe("explicit task/config migration", () => {
	it("runs through Storage only when explicitly awaited", async () => {
		const root = createUniqueTestDir("task-config-maintenance");
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config-home");
		const filesystem = new FileSystem(root);
		await filesystem.ensureAgenticWorkspaceStructure();
		const configPath = filesystem.configFilePath;
		await writeFile(configPath, "default_assignee: alice\n");
		const taskPath = join(filesystem.tasksDir, "task-a", "task.md");
		await mkdir(dirname(taskPath), { recursive: true });
		await writeFile(taskPath, "---\nid: TASK-A\nassignee: alice\npriority: Normal\n---\nbody\n");

		const storage = new Storage(filesystem);
		expect(await readFile(configPath, "utf8")).toContain("default_assignee:");
		expect(await readFile(taskPath, "utf8")).toContain("assignee: alice");
		const report = await storage.migrateTaskAndConfig();
		expect(await readFile(configPath, "utf8")).not.toContain("default_assignee:");
		expect(await readFile(taskPath, "utf8")).not.toContain("assignee:");
		expect(report.migratedFiles).toContain(configPath);
		expect(report.migratedFiles).toContain(taskPath);
	});

	it("does not create state or manifest for a no-op; maintenance script requires a target and reports results", async () => {
		const root = createUniqueTestDir("task-config-noop");
		roots.push(root);
		process.env.XDG_CONFIG_HOME = join(root, "config-home");
		const filesystem = new FileSystem(root);
		await filesystem.ensureAgenticWorkspaceStructure();
		const stateRoot = await resolveProjectStateRoot(root);
		const storage = new Storage(filesystem);
		const report = await storage.migrateTaskAndConfig();
		expect(report).toEqual({ migratedFiles: [], skippedFiles: [], issues: [] });
		await expect(stat(stateRoot)).rejects.toMatchObject({ code: "ENOENT" });

		const script = new URL("../../scripts/migrate-task-config.ts", import.meta.url).pathname;
		const missingTarget = Bun.spawnSync([process.execPath, script], { cwd: root });
		expect(missingTarget.exitCode).toBe(1);
		expect(missingTarget.stderr.toString()).toContain("project target");
		const invocation = Bun.spawnSync([process.execPath, script, root], {
			cwd: root,
			env: { ...process.env, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME },
		});
		expect(invocation.exitCode).toBe(0);
		expect(invocation.stdout.toString()).toContain('"migratedFiles": []');
	});
});
