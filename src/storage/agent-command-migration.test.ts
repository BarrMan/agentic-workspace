import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { coreFileSystem, createUniqueTestDir, safeCleanup } from "../test/test-utils.ts";
import { rootConfigFilePath } from "./config.ts";
import { parseFrontmatter } from "./markdown/frontmatter.ts";
import { Storage } from "./storage.ts";

let root: string;
let priorXdg: string | undefined;
let core: Core;

beforeEach(async () => {
	root = createUniqueTestDir("agent-command-migration");
	priorXdg = process.env.XDG_CONFIG_HOME;
	process.env.XDG_CONFIG_HOME = join(root, "user-config");
	core = new Core(root);
	await coreFileSystem(core).ensureAgenticWorkspaceStructure();
	await core.getConfig();
});

afterEach(async () => {
	if (priorXdg === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = priorXdg;
	await safeCleanup(root);
});

function yaml(command: string, unrelated = "keep") {
	return `agent_configuration:\n  selectedPreset: custom\n  extra: ${unrelated}\n  presets:\n    custom:\n      command: ${JSON.stringify(command)}\n      env: { TOKEN: secret }\n      prepare: ''\n      bootstrap: pi\n`;
}

describe("agent preset command migration", () => {
	it("migrates agent-command argv during Core startup without rewriting task fields", async () => {
		const fs = coreFileSystem(core);
		await writeFile(fs.configFilePath, yaml("project-agent --flag"));
		const taskPath = join(fs.tasksDir, "startup-task", "task.md");
		await mkdir(join(taskPath, ".."), { recursive: true });
		await writeFile(
			taskPath,
			"---\ntask_schema_version: 3\nid: STARTUP-TASK\ntitle: Startup\nstatus: To Do\ncreated_date: 2026-10-01\nlabels: []\nassignee: alice\npriority: HIGH\nagentConfiguration:\n  presets:\n    custom:\n      command: \"task-agent --task\"\n      env: {}\n      prepare: ''\n      bootstrap: pi\n---\n\nBody.\n",
		);

		core = new Core(root);
		await core.getConfig();
		await core.loadStoredTasks();
		expect(Bun.YAML.parse(await readFile(fs.configFilePath, "utf8"))).toMatchObject({
			agent_configuration: { presets: { custom: { command: ["project-agent", "--flag"] } } },
		});
		expect(parseFrontmatter(await readFile(taskPath, "utf8")).data).toMatchObject({
			assignee: "alice",
			priority: "HIGH",
			task_schema_version: 3,
			status: "To Do",
			agentConfiguration: { presets: { custom: { command: ["task-agent", "--task"] } } },
		});
	});

	it("serializes concurrent process startup against a legacy config", async () => {
		const fs = coreFileSystem(core);
		await writeFile(fs.configFilePath, yaml("parallel-agent --flag"));
		const script = `import { Core } from ${JSON.stringify(new URL("../controller/agentic-workspace.ts", import.meta.url).href)}; await new Core(process.argv[1]).getConfig();`;
		const children = Array.from({ length: 8 }, () =>
			Bun.spawn([process.execPath, "-e", script, root], {
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env, XDG_CONFIG_HOME: join(root, "user-config") },
			}),
		);
		const results = await Promise.all(
			children.map(async (child) => ({
				status: await child.exited,
				stdout: await new Response(child.stdout).text(),
				stderr: await new Response(child.stderr).text(),
			})),
		);
		expect(results).toEqual(results.map(() => expect.objectContaining({ status: 0, stdout: "", stderr: "" })));
		expect(Bun.YAML.parse(await readFile(fs.configFilePath, "utf8"))).toMatchObject({
			agent_configuration: { presets: { custom: { command: ["parallel-agent", "--flag"] } } },
		});
	});

	it("converts raw configurations in each scope and preserves task bodies", async () => {
		await mkdir(join(root, "user-config", "agentic-workspace"), { recursive: true });
		await writeFile(rootConfigFilePath(), yaml(`'/Applications/My Agent' --name \\"x\\" ''`));
		const projectPath = coreFileSystem(core).configFilePath;
		await writeFile(projectPath, yaml("agent --flag"));
		const recordPath = join(coreFileSystem(core).tasksDir, "a-1", "task.md");
		await mkdir(join(coreFileSystem(core).tasksDir, "a-1"), { recursive: true });
		await writeFile(
			recordPath,
			`---\nid: A-1\nagentConfiguration:\n  selectedPreset: custom\n  presets:\n    custom:\n      command: "agent --task"\n      env: {}\n---\n\nBody remains.\n`,
		);
		const completedPath = join(coreFileSystem(core).completedDir, "a-2", "task.md");
		const archivedPath = join(await coreFileSystem(core).getArchiveTasksDir(), "a-3", "task.md");
		for (const [path, id] of [
			[completedPath, "A-2"],
			[archivedPath, "A-3"],
		] as const) {
			await mkdir(join(path, ".."), { recursive: true });
			await writeFile(
				path,
				`---\nid: ${id}\nagentConfiguration:\n  selectedPreset: custom\n  presets:\n    custom:\n      command: "agent --${id.toLowerCase()}"\n      env: {}\n---\n\nBody.\n`,
			);
		}
		const result = await new Storage(coreFileSystem(core)).migrateAgentPresetCommands();
		expect(result.migratedFiles).toHaveLength(5);
		const migratedRoot = Bun.YAML.parse(await readFile(rootConfigFilePath(), "utf8")) as {
			agent_configuration: { presets: { custom: { command: string[] } } };
		};
		expect(migratedRoot.agent_configuration.presets.custom.command).toEqual([
			"/Applications/My Agent",
			"--name",
			'"x"',
			"",
		]);
		expect(await readFile(projectPath, "utf8")).toContain('[agent,"--flag"]');
		const migratedTask = await readFile(recordPath, "utf8");
		expect(migratedTask).toContain("Body remains.");
		expect(migratedTask).toContain("- '--task'");
		for (const path of [completedPath, archivedPath]) expect(await readFile(path, "utf8")).toContain("- '--a-");
		await expect(new Storage(coreFileSystem(core)).migrateAgentPresetCommands()).resolves.toEqual({
			migratedFiles: [],
		});
	});

	it("reports partial completion and safely resumes after a write failure", async () => {
		await mkdir(join(root, "user-config", "agentic-workspace"), { recursive: true });
		await writeFile(rootConfigFilePath(), yaml("user-agent"));
		const projectPath = coreFileSystem(core).configFilePath;
		await writeFile(projectPath, yaml("project-agent"));
		const storage = new Storage(coreFileSystem(core));
		const replace = storage["replaceMigrationFile"].bind(storage);
		let writes = 0;
		storage["replaceMigrationFile"] = async (path, content) => {
			if (++writes === 2) throw new Error("simulated write failure");
			await replace(path, content);
		};
		await expect(storage.migrateAgentPresetCommands()).rejects.toThrow("partially completed (1 files)");
		expect(Bun.YAML.parse(await readFile(rootConfigFilePath(), "utf8"))).toMatchObject({
			agent_configuration: { presets: { custom: { command: ["user-agent"] } } },
		});
		expect(await readFile(projectPath, "utf8")).toContain('command: "project-agent"');
		storage["replaceMigrationFile"] = replace;
		expect(await storage.migrateAgentPresetCommands()).toEqual({ migratedFiles: [projectPath] });
		expect(await storage.migrateAgentPresetCommands()).toEqual({ migratedFiles: [] });
	});

	it("preserves empty arguments, whitespace, quotes, and literal shell metacharacters", async () => {
		await mkdir(join(root, "user-config", "agentic-workspace"), { recursive: true });
		const source = "agent '' ' two spaces ' '\"quoted\"' 'a|b&c;d<e>f$g(h)'";
		await writeFile(rootConfigFilePath(), yaml(source));
		await new Storage(coreFileSystem(core)).migrateAgentPresetCommands();
		const migrated = Bun.YAML.parse(await readFile(rootConfigFilePath(), "utf8")) as {
			agent_configuration: { presets: { custom: { command: string[] } } };
		};
		expect(migrated.agent_configuration.presets.custom.command).toEqual([
			"agent",
			"",
			" two spaces ",
			'"quoted"',
			"a|b&c;d<e>f$g(h)",
		]);
	});

	it("rejects shell expressions and reports the exact preset without writing", async () => {
		await mkdir(join(root, "user-config", "agentic-workspace"), { recursive: true });
		await writeFile(rootConfigFilePath(), yaml("agent && other"));
		await expect(new Storage(coreFileSystem(core)).migrateAgentPresetCommands()).rejects.toThrow(
			`${rootConfigFilePath()} preset "custom"`,
		);
		expect(await readFile(rootConfigFilePath(), "utf8")).toContain("agent && other");
	});

	it("preserves Windows backslashes in double quotes and rejects expansions and newlines", async () => {
		await mkdir(join(root, "user-config", "agentic-workspace"), { recursive: true });
		await writeFile(rootConfigFilePath(), yaml('agent "C:\\Program Files\\Agent\\agent.exe"'));
		await new Storage(coreFileSystem(core)).migrateAgentPresetCommands();
		const migrated = Bun.YAML.parse(await readFile(rootConfigFilePath(), "utf8")) as {
			agent_configuration: { presets: { custom: { command: string[] } } };
		};
		expect(migrated.agent_configuration.presets.custom.command).toEqual([
			"agent",
			"C:\\Program Files\\Agent\\agent.exe",
		]);
		for (const command of ['agent "$HOME"', 'agent "first\nsecond"']) {
			await writeFile(rootConfigFilePath(), yaml(command));
			await expect(new Storage(coreFileSystem(core)).migrateAgentPresetCommands()).rejects.toThrow();
		}
	});

	it("creates secret-bearing config replacements as private files", async () => {
		await mkdir(join(root, "user-config", "agentic-workspace"), { recursive: true });
		const path = rootConfigFilePath();
		await writeFile(path, yaml("agent"), { mode: 0o600 });
		await chmod(path, 0o600);
		await new Storage(coreFileSystem(core)).migrateAgentPresetCommands();
		expect((await stat(path)).mode & 0o777).toBe(0o600);
	});

	it("does not overwrite an edit waiting behind the migration record lock", async () => {
		const fs = coreFileSystem(core);
		const path = join(fs.tasksDir, "locked-task", "task.md");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(
			path,
			`---\nid: LOCKED-TASK\nagentConfiguration:\n  presets:\n    custom:\n      command: "agent --old"\n---\n\nBody.\n`,
		);
		const storage = new Storage(fs);
		let entered!: () => void;
		let resume!: () => void;
		const beforeLock = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const proceed = new Promise<void>((resolve) => {
			resume = resolve;
		});
		const withTaskLock = storage.withTaskLock.bind(storage);
		storage.withTaskLock = async (task, operation) => {
			entered();
			await proceed;
			return await withTaskLock(task, operation);
		};
		const migration = storage.migrateAgentPresetCommands();
		await beforeLock;
		await withTaskLock({ id: "LOCKED-TASK", filePath: path }, async () => {
			const latest = await readFile(path, "utf8");
			await writeFile(path, latest.replace("Body.", "User edit."));
		});
		resume();
		await migration;
		expect(await readFile(path, "utf8")).toContain("User edit.");
		expect(await readFile(path, "utf8")).toContain("- '--old'");
	});

	it("skips malformed task frontmatter without blocking healthy task migration", async () => {
		const fs = coreFileSystem(core);
		const healthy = join(fs.tasksDir, "healthy", "task.md");
		const malformed = join(await fs.getArchiveTasksDir(), "broken", "task.md");
		await mkdir(dirname(healthy), { recursive: true });
		await mkdir(dirname(malformed), { recursive: true });
		await writeFile(
			healthy,
			`---\nid: HEALTHY\nagentConfiguration:\n  presets:\n    custom:\n      command: "agent --ok"\n---\n`,
		);
		await writeFile(malformed, "---\nid: BROKEN\nassignee: [unterminated\n---\n");
		await expect(new Storage(fs).startAgentPresetCommandMigration()).resolves.toBeDefined();
		expect(await readFile(malformed, "utf8")).toContain("[unterminated");
		expect(await readFile(healthy, "utf8")).toContain("- '--ok'");
	});
});
