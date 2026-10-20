import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Core } from "../controller/agentic-workspace.ts";
import { effectiveModeTextColor, MODE_TEXT_COLORS, type ModeTextColor } from "../model/session/mode-colors.ts";
import { type AgentConfiguration, resolveSessionSettings } from "../model/session/types.ts";
import { coreFileSystem, createUniqueTestDir, initializeTestProject, safeCleanup } from "../test/test-utils.ts";
import {
	Config,
	getBuiltInAgentConfiguration,
	getDefaultModeCatalog,
	getEditableAgentConfiguration,
	initializeAgentConfiguration,
	loadAgentConfiguration,
	resolveAgentConfiguration,
	resolveSelectedMode,
	resolveSessionPreset,
	updateAgentConfiguration,
	upsertAgentConfiguration,
	validateArtifactPath,
} from "./config.ts";
import { parseMarkdown, parseTask } from "./markdown/parser.ts";
import { serializeTask } from "./markdown/serializer.ts";
import { Storage } from "./storage.ts";

let testDir: string;
let originalXdgConfigHome: string | undefined;
let core: Core;

async function saveProjectConfiguration(value: AgentConfiguration): Promise<void> {
	const workspaceConfig = await coreFileSystem(core).loadConfig();
	await coreFileSystem(core).saveConfig({
		...(workspaceConfig ?? (await coreFileSystem(core).parseConfig(""))),
		agentConfiguration: value,
	});
}

function configuration(selectedPreset = "custom"): AgentConfiguration {
	return {
		selectedPreset,
		presets: {
			custom: {
				command: ["custom-agent", "--run"],
				env: { TOKEN: "secret" },
				prepare: "bun install",
				bootstrap: "opencode",
			},
		},
	};
}

beforeEach(async () => {
	testDir = createUniqueTestDir("agent-workspace-config");
	originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
	process.env.XDG_CONFIG_HOME = join(testDir, "user-config");
	core = new Core(testDir);
	await coreFileSystem(core).ensureAgenticWorkspaceStructure();
	await initializeTestProject(core, "Agent workspace config");
});

afterEach(async () => {
	if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
	else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
	await safeCleanup(testDir);
});

describe("agent workspace configuration", () => {
	it("loads a project configuration over the user configuration", async () => {
		await upsertAgentConfiguration(core, "root", configuration());
		await upsertAgentConfiguration(core, "project", {
			...configuration(),
			presets: { custom: { command: ["project-agent"], env: {}, prepare: "", bootstrap: "pi" } },
			sessions: { worktreePerTask: true, yoloMode: false },
		});

		const config = await Config.load(new Storage(coreFileSystem(core)));
		expect(config.getConfig().presets.custom?.command).toEqual(["project-agent"]);
		expect(config.sessionSettings.worktreePerTask).toBe(true);
	});

	it("returns isolated merged configs and preserves explicit false overrides", async () => {
		await upsertAgentConfiguration(core, "project", {
			...configuration(),
			sessions: { worktreePerTask: true, yoloMode: true },
		});
		const config = await Config.load(new Storage(coreFileSystem(core)));
		const merged = config.getConfig({ sessions: { worktreePerTask: false, yoloMode: false } });
		expect(merged.sessions).toEqual({ worktreePerTask: false, yoloMode: false });
		const customPreset = merged.presets.custom;
		if (!customPreset) throw new Error("Custom preset missing");
		customPreset.command = ["mutated"];
		expect(config.getConfig().presets.custom?.command).toEqual(["custom-agent", "--run"]);
		expect(config.getConfig().sessions).toEqual({ worktreePerTask: true, yoloMode: true });
	});

	it("reloads changed project configuration", async () => {
		await upsertAgentConfiguration(core, "project", configuration());
		const config = await Config.load(new Storage(coreFileSystem(core)));
		await upsertAgentConfiguration(core, "project", {
			...configuration(),
			presets: { custom: { command: ["updated-agent"], env: {}, prepare: "", bootstrap: "claude" } },
		});
		await config.reload();
		expect(config.getConfig().presets.custom?.command).toEqual(["updated-agent"]);
	});

	it("resolves a saved arbitrary preset name from current task, project, then user configuration", async () => {
		await core.createTaskFromInput({ title: "Current configuration", status: "To Do" });
		const saved = { taskId: "TASK-1", preset: "custom" };
		await upsertAgentConfiguration(core, "root", configuration());
		expect((await resolveSessionPreset(core, saved)).command).toEqual(["custom-agent", "--run"]);
		await upsertAgentConfiguration(core, "project", {
			...configuration(),
			modes: getDefaultModeCatalog(),
			presets: { custom: { command: ["project-agent"], env: {}, prepare: "", bootstrap: "pi" } },
		});
		expect((await resolveSessionPreset(core, saved)).command).toEqual(["project-agent"]);
		await upsertAgentConfiguration(
			core,
			"card",
			{
				...configuration(),
				presets: { custom: { command: ["task-agent"], env: {}, prepare: "", bootstrap: "claude" } },
			},
			saved.taskId,
		);
		expect((await resolveSessionPreset(core, saved)).command).toEqual(["task-agent"]);
		await updateAgentConfiguration(
			core,
			"card",
			(current) => ({
				...current,
				presets: { custom: { command: ["updated-task-agent"], env: { CURRENT: "yes" }, prepare: "", bootstrap: "pi" } },
			}),
			saved.taskId,
		);
		expect(await resolveSessionPreset(core, saved)).toMatchObject({
			command: ["updated-task-agent"],
			bootstrap: "pi",
			env: { CURRENT: "yes" },
		});
		await expect(resolveSessionPreset(core, { ...saved, preset: "removed" })).rejects.toThrow("Agent preset not found");
		const task = await coreFileSystem(core).loadTask(saved.taskId);
		if (!task) throw new Error("Missing configuration test task");
		await core.updateTask({ ...task, agentConfiguration: undefined });
		const savedConfig = await coreFileSystem(core).loadConfig();
		if (savedConfig) {
			delete savedConfig.agentConfiguration;
			await coreFileSystem(core).saveConfig(savedConfig);
		}
		expect((await resolveSessionPreset(core, saved)).command).toEqual(["custom-agent", "--run"]);
	});
	it("round-trips omitted mode colors without filling them on load, save, or repeated initialization", async () => {
		const modes = getDefaultModeCatalog();
		for (const profile of Object.values(modes.profiles)) delete profile.textColor;
		const plan = modes.profiles.plan;
		if (!plan) throw new Error("Missing PLAN profile");
		modes.order.push("custom");
		modes.profiles.custom = { ...structuredClone(plan), name: "CUSTOM" };
		await saveProjectConfiguration({ ...configuration(), modes });
		const savedConfig = await coreFileSystem(core).loadConfig();
		const loaded = await loadAgentConfiguration(core, "project");
		if (!loaded?.modes) throw new Error("Missing loaded catalog");
		expect(savedConfig?.agentConfiguration).toEqual({ ...configuration(), modes });
		for (const profile of Object.values(loaded.modes.profiles)) expect(Object.hasOwn(profile, "textColor")).toBe(false);
		for (const [id, profile] of Object.entries(loaded.modes.profiles))
			expect(effectiveModeTextColor(profile, id)).toBeUndefined();
		await upsertAgentConfiguration(core, "project", loaded);
		await initializeAgentConfiguration(core, "project");
		expect((await coreFileSystem(core).loadConfig())?.agentConfiguration).toEqual({ ...configuration(), modes });
	});

	it("round-trips every supported named color and leaves custom Default omitted", async () => {
		const modes = getDefaultModeCatalog();
		const plan = modes.profiles.plan;
		if (!plan) throw new Error("Missing PLAN profile");
		modes.order.push("custom");
		modes.profiles.custom = { ...structuredClone(plan), name: "CUSTOM" };
		for (const color of MODE_TEXT_COLORS) {
			modes.profiles.custom.textColor = color;
			await upsertAgentConfiguration(core, "project", { ...configuration(), modes });
			expect((await loadAgentConfiguration(core, "project"))?.modes?.profiles.custom?.textColor).toBe(color);
		}
		delete modes.profiles.custom.textColor;
		await upsertAgentConfiguration(core, "project", { ...configuration(), modes });
		expect(
			Object.hasOwn((await loadAgentConfiguration(core, "project"))?.modes?.profiles.custom ?? {}, "textColor"),
		).toBe(false);
	});

	it("rejects unsupported colors in both raw loads and saves", async () => {
		for (const color of ["lightgreen", "Green", " green", "#00ff00", "Default", "", null, 1]) {
			const modes = getDefaultModeCatalog();
			const plan = modes.profiles.plan;
			if (!plan) throw new Error("Missing PLAN profile");
			plan.textColor = color as ModeTextColor;
			const invalid = { ...configuration(), modes };
			await expect(upsertAgentConfiguration(core, "project", invalid)).rejects.toThrow(/textColor/);
			await saveProjectConfiguration(invalid);
			await expect(loadAgentConfiguration(core, "project")).rejects.toThrow(/textColor/);
		}
	});

	it("uses the complete built-in preset set when no override exists", async () => {
		const resolved = await resolveAgentConfiguration(core);
		expect(resolved.scope).toBe("root");
		expect(resolved.config.selectedPreset).toBe("opencode");
		expect(Object.keys(resolved.config.presets)).toEqual(["opencode", "claude", "pi"]);
		expect(resolved.config.presets.pi).toEqual({
			command: ["pi"],
			env: {},
			prepare: "",
			bootstrap: "pi",
			resumeFlag: "--session",
		});
	});

	it("returns isolated built-in configuration copies for settings drafts", () => {
		const draft = getBuiltInAgentConfiguration();
		const pi = draft.presets.pi;
		if (!pi) throw new Error("Pi preset missing");
		pi.command = ["different-pi"];
		expect(getBuiltInAgentConfiguration().presets.pi?.command).toEqual(["pi"]);
	});

	it("previews an editable parent configuration without writing an override", async () => {
		const preview = await getEditableAgentConfiguration(core, "project");
		expect(preview.selectedPreset).toBe("opencode");
		expect(await loadAgentConfiguration(core, "project")).toBeNull();
	});

	it("rejects the retired per-preset worktree key without rewriting the configuration", async () => {
		const path = join(process.env.XDG_CONFIG_HOME as string, "agentic-workspace", "agentic-workspace.config.yml");
		await mkdir(dirname(path), { recursive: true });
		const raw = `agent_configuration: ${JSON.stringify({ selectedPreset: "retired", presets: { retired: { command: ["retired", "{prompt}"], env: {}, prepare: "", worktree: true, bootstrap: "opencode" } } })}\n`;
		await writeFile(path, raw, "utf8");

		await expect(loadAgentConfiguration(core, "root")).rejects.toThrow(
			/worktree is retired.*remove this unsupported field/,
		);
		await expect(initializeAgentConfiguration(core, "root")).rejects.toThrow(/worktree is retired/);
		expect(await readFile(path, "utf8")).toBe(raw);
	});

	it("rejects legacy string commands in normal configuration reads", async () => {
		const path = join(process.env.XDG_CONFIG_HOME as string, "agentic-workspace", "agentic-workspace.config.yml");
		await mkdir(dirname(path), { recursive: true });
		await writeFile(
			path,
			`agent_configuration: ${JSON.stringify({
				selectedPreset: "custom",
				presets: { custom: { command: "agent --flag", env: {}, prepare: "", bootstrap: "pi" } },
			})}\n`,
		);
		await expect(loadAgentConfiguration(core, "root")).rejects.toThrow(/command/);
	});

	it("rejects retired bootstrap identifiers without dropping presets or repairing selection", async () => {
		const path = join(process.env.XDG_CONFIG_HOME as string, "agentic-workspace", "agentic-workspace.config.yml");
		await mkdir(dirname(path), { recursive: true });
		const raw = `agent_configuration: ${JSON.stringify({ selectedPreset: "codex", presets: { codex: { command: ["codex"], env: {}, prepare: "", bootstrap: "codex" }, opencode: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode" } } })}\n`;
		await writeFile(path, raw, "utf8");

		await expect(loadAgentConfiguration(core, "root")).rejects.toThrow(
			/bootstrap is invalid.*supported bootstrap value/,
		);
		await expect(initializeAgentConfiguration(core, "root")).rejects.toThrow(/bootstrap is invalid/);
		expect(await readFile(path, "utf8")).toBe(raw);
	});

	it("rejects concrete OpenCode adapters in editable configuration", async () => {
		const invalid = configuration();
		const custom = invalid.presets.custom;
		if (!custom) throw new Error("Missing custom fixture preset.");
		invalid.presets.custom = { ...custom, bootstrap: "opencode-v1" };
		await expect(upsertAgentConfiguration(core, "project", invalid)).rejects.toThrow(/bootstrap is invalid/);
	});

	it("serializes concurrent functional updates without losing presets", async () => {
		const addPreset = async (name: string) =>
			await updateAgentConfiguration(core, "root", (config) => {
				const source = config.presets.opencode;
				if (!source) throw new Error("OpenCode preset missing");
				return {
					...config,
					presets: {
						...config.presets,
						[name]: { ...source, command: [name] },
					},
				};
			});

		await Promise.all([addPreset("first"), addPreset("second")]);
		const saved = await loadAgentConfiguration(core, "root");
		expect(saved?.presets.first?.command).toEqual(["first"]);
		expect(saved?.presets.second?.command).toEqual(["second"]);
	});

	it("inherits configuration fields from project while task fields override them", async () => {
		await upsertAgentConfiguration(core, "root", configuration());
		await upsertAgentConfiguration(core, "project", {
			selectedPreset: "project",
			presets: {
				project: {
					command: ["project-agent"],
					env: {},
					prepare: "",
					bootstrap: "opencode",
				},
			},
			sessions: { worktreePerTask: true, yoloMode: true },
		});
		const { task } = await core.createTaskFromInput({ title: "Field inheritance" });
		await upsertAgentConfiguration(
			core,
			"card",
			{
				selectedPreset: "custom",
				presets: {
					custom: { command: ["task-agent"], env: {}, prepare: "", bootstrap: "claude" },
				},
				sessions: { worktreePerTask: false, yoloMode: false },
			},
			task.id,
		);

		const resolved = await resolveAgentConfiguration(core, task.id);
		expect(resolved.scope).toBe("card");
		expect(resolved.config).toMatchObject({
			selectedPreset: "custom",
			presets: {
				project: { command: ["project-agent"] },
				custom: { command: ["task-agent"] },
			},
			sessions: { worktreePerTask: false, yoloMode: false },
		});
	});

	it("preserves an explicit task false and resolves current preset values for retained sessions", async () => {
		const { task } = await core.createTaskFromInput({ title: "Current task settings" });
		await upsertAgentConfiguration(core, "root", {
			...configuration(),
			sessions: { worktreePerTask: false, yoloMode: true },
		});
		await upsertAgentConfiguration(core, "project", {
			...configuration(),
			sessions: { worktreePerTask: false, yoloMode: true },
		});
		await upsertAgentConfiguration(
			core,
			"card",
			{
				...configuration(),
				sessions: { worktreePerTask: false, yoloMode: false },
			},
			task.id,
		);
		expect((await resolveAgentConfiguration(core, task.id)).config.sessions).toEqual({
			worktreePerTask: false,
			yoloMode: false,
		});

		const session = { taskId: task.id, preset: "custom" };
		expect((await resolveSessionPreset(core, session)).command).toEqual(["custom-agent", "--run"]);
		await updateAgentConfiguration(core, "project", (current) => ({
			...current,
			presets: {
				...current.presets,
				custom: { command: ["current-project-agent"], env: {}, prepare: "", bootstrap: "pi" },
			},
		}));
		expect((await resolveSessionPreset(core, session)).command).toEqual(["custom-agent", "--run"]);
		await updateAgentConfiguration(
			core,
			"card",
			(current) => ({
				...current,
				presets: {
					...current.presets,
					custom: { command: ["current-task-agent"], env: {}, prepare: "", bootstrap: "claude" },
				},
			}),
			task.id,
		);
		expect((await resolveSessionPreset(core, session)).command).toEqual(["current-task-agent"]);
	});

	it("defaults auto-resume on for configuration without auto-resume and validates explicit values", async () => {
		expect(resolveSessionSettings(undefined)).toEqual({
			worktreePerTask: false,
			yoloMode: false,
			autoResumeOnRestart: true,
		});
		const configurationWithoutAutoResume = {
			...configuration(),
			sessions: { worktreePerTask: false, yoloMode: false },
		};
		await upsertAgentConfiguration(core, "root", {
			...configuration(),
			sessions: { worktreePerTask: false, yoloMode: false, autoResumeOnRestart: false },
		});
		await upsertAgentConfiguration(core, "project", configurationWithoutAutoResume);
		expect(resolveSessionSettings(await loadAgentConfiguration(core, "project"))).toMatchObject({
			autoResumeOnRestart: true,
		});
		const { task } = await core.createTaskFromInput({ title: "Scoped session settings" });
		await upsertAgentConfiguration(
			core,
			"card",
			{
				...configuration(),
				sessions: { worktreePerTask: false, yoloMode: false, autoResumeOnRestart: false },
			},
			task.id,
		);
		expect(
			resolveSessionSettings(await resolveAgentConfiguration(core, task.id).then(({ config }) => config)),
		).toMatchObject({ autoResumeOnRestart: false });
		await upsertAgentConfiguration(core, "project", {
			...configurationWithoutAutoResume,
			sessions: { ...configurationWithoutAutoResume.sessions, autoResumeOnRestart: false },
		});
		expect((await loadAgentConfiguration(core, "project"))?.sessions?.autoResumeOnRestart).toBe(false);
		for (const value of ["false", 0, null]) {
			const invalid = {
				...configurationWithoutAutoResume,
				sessions: { ...configurationWithoutAutoResume.sessions, autoResumeOnRestart: value },
			};
			await expect(upsertAgentConfiguration(core, "project", invalid as never)).rejects.toThrow(
				/sessions.autoResumeOnRestart must be a boolean/,
			);
		}
	});

	it("copies the effective parent once and keeps overrides isolated", async () => {
		await upsertAgentConfiguration(core, "root", configuration());
		const project = await initializeAgentConfiguration(core, "project");
		const projectPreset = project.presets.custom;
		if (!projectPreset) throw new Error("Custom preset missing");
		projectPreset.command = ["changed-project-agent"];
		await upsertAgentConfiguration(core, "project", project);

		const root = await loadAgentConfiguration(core, "root");
		expect(root?.presets.custom?.command).toEqual(["custom-agent", "--run"]);

		const { task } = await core.createTaskFromInput({ title: "Preserve card body", description: "Original content" });
		const card = await initializeAgentConfiguration(core, "card", task.id);
		const cardPreset = card.presets.custom;
		if (!cardPreset) throw new Error("Custom preset missing");
		expect(cardPreset.command).toEqual(["changed-project-agent"]);
		cardPreset.env.TOKEN = "card-only";
		await upsertAgentConfiguration(core, "card", card, task.id);

		const reread = await initializeAgentConfiguration(core, "card", task.id);
		expect(reread.presets.custom?.env.TOKEN).toBe("card-only");
		expect((await loadAgentConfiguration(core, "project"))?.presets.custom?.env.TOKEN).toBe("secret");
	});

	it("round-trips card configuration without changing task content", async () => {
		const { task } = await core.createTaskFromInput({
			title: "Card metadata",
			description: "Keep this paragraph intact.",
		});
		await upsertAgentConfiguration(core, "card", configuration(), task.id);

		const content = await readFile(task.filePath as string, "utf8");
		expect(content).toContain("Keep this paragraph intact.");
		expect(parseTask(content).agentConfiguration).toEqual(configuration());
		expect((await resolveAgentConfiguration(core, task.id)).scope).toBe("card");
		expect(await loadAgentConfiguration(core, "card", task.id.toLowerCase())).toEqual(configuration());
	});

	it("rejects a card snapshot with a retired bootstrap without rewriting task data", async () => {
		const { task } = await core.createTaskFromInput({ title: "Stale card preset" });
		const stale = {
			selectedPreset: "codex",
			presets: {
				codex: { command: ["codex"], env: {}, prepare: "", bootstrap: "codex" },
				opencode: { command: ["opencode"], env: {}, prepare: "", bootstrap: "opencode" },
			},
		} as unknown as AgentConfiguration;
		await core.updateTask({ ...task, agentConfiguration: stale });

		await expect(loadAgentConfiguration(core, "card", task.id)).rejects.toThrow(/bootstrap is invalid/);
		await expect(
			upsertAgentConfiguration(
				core,
				"card",
				{ ...getBuiltInAgentConfiguration(), selectedPreset: "opencode" },
				task.id,
			),
		).rejects.toThrow(/bootstrap is invalid/);
		await expect(coreFileSystem(core).loadTask(task.id)).rejects.toThrow(/bootstrap is invalid/);
		expect(parseMarkdown(await readFile(task.filePath as string, "utf8")).frontmatter.agentConfiguration).toEqual(
			stale,
		);
	});

	it("reloads a saved card preset with an empty environment", async () => {
		const { task } = await core.createTaskFromInput({ title: "Card preset" });
		await updateAgentConfiguration(
			core,
			"card",
			(config) => {
				const opencode = config.presets.opencode;
				if (!opencode) throw new Error("OpenCode preset missing");
				return {
					...config,
					selectedPreset: "opencode",
					presets: {
						...config.presets,
						opencode: { ...opencode, command: ["opencode {prompt}"], env: {} },
					},
				};
			},
			task.id,
		);

		expect((await loadAgentConfiguration(core, "card", task.id))?.presets.opencode?.env).toEqual({});
	});

	it("rejects unsafe names, invalid environment, and malformed stored configuration", async () => {
		await expect(
			upsertAgentConfiguration(core, "root", {
				selectedPreset: "missing",
				presets: {},
			} as AgentConfiguration),
		).rejects.toThrow("selectedPreset must name a configured preset");
		await expect(
			upsertAgentConfiguration(core, "root", {
				selectedPreset: "toString",
				presets: {},
			} as AgentConfiguration),
		).rejects.toThrow("selectedPreset must name a configured preset");
		await expect(
			upsertAgentConfiguration(core, "root", {
				...configuration(),
				presets: {
					custom: { ...configuration().presets.custom, env: { "NOT-VALID": "value" } },
				},
			} as unknown as AgentConfiguration),
		).rejects.toThrow("env must be an object of strings");
		const invalidResume = configuration();
		const custom = invalidResume.presets.custom;
		if (!custom) throw new Error("Missing custom fixture preset.");
		custom.resumeFlag = "\0--resume";
		await expect(upsertAgentConfiguration(core, "root", invalidResume)).rejects.toThrow(
			"resumeFlag must be a non-empty string without NUL bytes",
		);

		const rootPath = join(process.env.XDG_CONFIG_HOME as string, "agentic-workspace", "agentic-workspace.config.yml");
		await mkdir(dirname(rootPath), { recursive: true });
		await writeFile(rootPath, "agent_configuration: [broken\n", "utf8");
		await expect(loadAgentConfiguration(core, "root")).rejects.toThrow("Invalid agent configuration");
	});

	it("fails closed for malformed and ambiguous card identities", async () => {
		const { task } = await core.createTaskFromInput({ title: "Card configuration" });
		const content = await readFile(task.filePath as string, "utf8");
		await writeFile(task.filePath as string, content.replace("---\n", "---\nagentConfiguration: false\n"), "utf8");
		await expect(loadAgentConfiguration(core, "card", task.id)).rejects.toThrow("must be an object");
		await writeFile(task.filePath as string, content.replace("---\n", "---\nagentConfiguration: null\n"), "utf8");
		await expect(loadAgentConfiguration(core, "card", task.id)).rejects.toThrow("must be an object");

		await writeFile(task.filePath as string, content, "utf8");
		const duplicatePath = join(coreFileSystem(core).completedDir, task.id.toLowerCase(), "task.md");
		await mkdir(dirname(duplicatePath), { recursive: true });
		await writeFile(duplicatePath, serializeTask({ ...task, title: "Duplicate" }), "utf8");
		await expect(loadAgentConfiguration(core, "card", task.id)).rejects.toThrow("ambiguous");
	});

	it("preserves card configuration through ordinary task updates", async () => {
		const { task } = await core.createTaskFromInput({ title: "Metadata persistence" });
		await upsertAgentConfiguration(core, "card", configuration(), task.id);
		await core.updateTaskFromInput(task.id, { description: "Updated description", status: "In Progress" });
		expect((await loadAgentConfiguration(core, "card", task.id))?.selectedPreset).toBe("custom");
	});

	it("seeds modes on explicit initialization of existing project config and preserves custom catalog on repeat", async () => {
		const existing = configuration();
		existing.sessions = { worktreePerTask: true, yoloMode: false };
		await saveProjectConfiguration(existing);
		expect((await loadAgentConfiguration(core, "project"))?.modes).toBeUndefined();
		expect((await coreFileSystem(core).loadConfig())?.agentConfiguration).toEqual(existing);

		const initialized = await initializeAgentConfiguration(core, "project");
		expect(initialized.modes?.order).toEqual(["plan", "build"]);
		expect(initialized.modes?.defaultModeId).toBe("plan");
		expect(initialized.modes?.profiles.plan?.textColor).toBe("green");
		expect(initialized.modes?.profiles.build?.textColor).toBe("blue");
		expect(initialized.presets).toEqual(existing.presets);
		expect(initialized.sessions).toEqual(existing.sessions);

		const modes = initialized.modes;
		if (!modes?.profiles.plan) throw new Error("Missing seeded PLAN profile");
		modes.order = ["custom"];
		modes.defaultModeId = "custom";
		modes.profiles = { custom: { ...modes.profiles.plan, name: "Custom" } };
		await upsertAgentConfiguration(core, "project", initialized);
		const repeated = await initializeAgentConfiguration(core, "project");
		expect(repeated.modes?.order).toEqual(["custom"]);
		expect(repeated.modes?.defaultModeId).toBe("custom");
	});
});

it("seeds a project-only mode catalog on explicit initialization and round-trips unrelated settings", async () => {
	const project = await initializeAgentConfiguration(core, "project");
	expect(project.modes?.defaultModeId).toBe("plan");
	expect(project.modes?.profiles.plan).toMatchObject({
		model: { kind: "default" },
		permissions: { repository: "read", task: "read-write", artifacts: "read-write", subagents: "allowed" },
		approvalArtifact: "plan.md",
	});
	expect(project.modes?.profiles.build).toMatchObject({
		model: { kind: "default" },
		permissions: { repository: "read-write", task: "read-write", artifacts: "read-write", subagents: "allowed" },
	});
	if (project.modes?.profiles.plan) project.modes.profiles.plan.name = "Planner";
	const opencode = project.presets.opencode;
	if (!opencode) throw new Error("Missing OpenCode preset");
	opencode.env.KEEP = "configured-only";
	await upsertAgentConfiguration(core, "project", project);
	const saved = await loadAgentConfiguration(core, "project");
	expect(saved?.modes?.profiles.plan?.name).toBe("Planner");
	expect(saved?.presets.opencode?.env.KEEP).toBe("configured-only");
	expect((await getEditableAgentConfiguration(core, "root")).modes).toBeUndefined();
});

it("round-trips opaque explicit mode model selections", async () => {
	const project = await initializeAgentConfiguration(core, "project");
	const plan = project.modes?.profiles.plan;
	if (!plan || !project.modes) throw new Error("Missing seeded PLAN profile");
	plan.model = { kind: "explicit", id: "provider/model-v1" };
	await upsertAgentConfiguration(core, "project", project);
	expect((await loadAgentConfiguration(core, "project"))?.modes?.profiles.plan?.model).toEqual({
		kind: "explicit",
		id: "provider/model-v1",
	});

	plan.model = { kind: "explicit", id: "model\nother\0id" };
	await expect(upsertAgentConfiguration(core, "project", project)).resolves.toBeUndefined();
});

it("does not reseed removed modes on ordinary saves and resolves renamed profiles by stable ID", async () => {
	const catalog = getDefaultModeCatalog();
	const plan = catalog.profiles.plan;
	if (!plan) throw new Error("Missing seeded PLAN profile");
	plan.name = "Design Review";
	expect(resolveSelectedMode(catalog, "plan")).toBe("plan");
	expect(resolveSelectedMode(catalog, "removed")).toBe("plan");
	const config = await initializeAgentConfiguration(core, "project");
	if (!config.modes) throw new Error("Missing seeded modes");
	delete config.modes.profiles.plan;
	config.modes.order = ["build"];
	config.modes.defaultModeId = "build";
	await upsertAgentConfiguration(core, "project", config);
	expect((await loadAgentConfiguration(core, "project"))?.modes?.order).toEqual(["build"]);
});

it("rejects unsafe and reserved artifact paths", () => {
	for (const path of ["../plan.md", "/tmp/plan.md", "task.md", ".artifacts.json", "a\\b", "C:/x", "a//b"]) {
		expect(() => validateArtifactPath(path)).toThrow();
	}
	expect(validateArtifactPath("notes/plan.md")).toBe("notes/plan.md");
});
